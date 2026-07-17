# バランス検証基盤（Milestone 6-F）

M6-F は**新スキルを追加せず「通常プレイできる状態」へ整える**整備・検証基盤である。抽選シミュレーター・戦闘テレメトリ・
検証プレイモード（F8）・開発用バランス警告を追加した。いずれも **Phaser 非依存の純ロジック**（Node でテスト可能）で、
**外部送信・自動調整は一切しない**（数値の最終判断は開発者が行う）。数値は自動で変えない。

## 設計上の要点（記録すべき判断）
1. **抽選ロジックは `SkillDraftManager` 一本**。シミュレーターは本番の `SkillDraftManager` + `SeededRandom` を
   **直接駆動**し、抽選ロジックを複製しない。
2. **シナジー補助はレアリティ重みへ乗算・決定論不変・data で無効化可能**。legendary を common 並みに増やさず、
   特定レシピを確定させない。
3. 「枠が多いほど進化が増える」は**長周回の上限効果**であり、短周回では逆転しうる（想定レベルアップ回数に依存）。
4. テレメトリは**外部送信なし・profile へ加算・上限あり・debugRun 分離・低優先保存**（失敗してもゲーム/保存を壊さない）。
5. Balance Playtest は **profile 不変・常に debugRun・スキル自動付与なし・ゴッドモード無効**。

---

## 1. 抽選シミュレーター（`src/systems/DraftBalanceAnalyzer.js`）
Phaser 非依存の**決定論的**抽選シミュレーター。本番の `SkillDraftManager` + `SeededRandom` をそのまま使い、
プレイヤーの取得方針を変えながら「1周でいくつ進化に到達できるか」を計測する。

- **プレイヤー方針**: `random` / `evolution-first`（進化を優先取得）/ `build:<recipe>`（特定レシピ狙い）/ `diversity`（多様取得）。
- **計測条件**: active枠 4/6/8・候補 3/4・Job Lv 1/30/70/100・リロール/追放・多数シード。
- 実行: `node tests/draft-balance-simulation.mjs`（CI は軽量 200 seed）。詳細計測は `HEAVY=1 node tests/draft-balance-simulation.mjs`（2500 seed）。

### 抽選バランス目標と達成状況（evolution-first・200 seed・levelUps=60）
| active枠 | 進化平均 | ≥1進化 | ≥2進化 | 目標(≥1 / ≥2) | 達成 |
|---------|---------|--------|--------|---------------|------|
| 4 | 1.27  | 86.0% | 36.5% | 60%+ / 15%+ | ✅ |
| 6 | 2.165 | 98.0% | 78.0% | 75% / 35%   | ✅ |
| 8 | 2.215 | 97.5% | 78.0% | 85% / 50%   | ✅ |

- **短周回の注記（重要）**: 想定レベルアップ回数が少ない（levelUps≈24）と傾向が**逆転**する
  （4枠 0.17 / 6枠 0.03 / 8枠 0.005）。枠が少ないほど1つの基礎スキルへ強化が集中し Lv8 到達が早いため。
  「枠が多いほど進化が増える」は**長周回でのみ成り立つ上限効果**であり、想定レベルアップ回数に依存する。
- **全レシピ 4枠で成立可能**（`node tests/evolution-feasibility.mjs`・全レシピ minActiveSlots≤2・minPassiveSlots≤1）。
- **最難関**: `star_devouring_furnace`（伝説基礎 `bullet_furnace` ＋ 伝説補助 `phoenix_feather`）は全構成が伝説で、
  実グラインドは非常に困難（構造上は成立可能）。

---

## 2. シナジー補助（`data/skill-config.json` の `synergy`）
active30種化で進化相手が候補へ極端に出にくくならないための**軽い抽選補助**。`SkillDraftManager._synergyMult` が
レアリティ重みへ**乗算**する（無視しない）。`buildDraftCtx` が `ctx.synergy = { partnerIds, battleLevel }` を渡す。

```jsonc
"synergy": {
  "synergyAssistEnabled": true,
  "synergyAssistMinBattleLevel": 3,       // これ未満の戦闘レベルでは補助しない
  "synergyAssistMaxMultiplier": 2.0,      // 補助倍率の上限
  "evolutionPartnerWeightMultiplier": 1.35,   // 所持基礎の未達な進化相手
  "ownedSkillUpgradeWeightMultiplier": 1.15,  // 所持スキルの強化
  "nearlyMaxedSkillWeightMultiplier": 1.2,    // Lv8間近のスキル
  "unrelatedNewSkillWeightMultiplier": 1.0,   // 無関係な新規（＝据え置き）
  "noProgressDraftThreshold": 4,          // 進展のないドラフトがこの回数を超えると
  "noProgressWeightBonus": 0.1,           //   pity として補助を少しずつ加算
  "noProgressMaxMultiplier": 1.5
}
```

- **partnerIds**: 所持している基礎スキルの、まだ達成していない進化相手（補助スキル）の id。これらの重みを上げる。
- **pity（`draftsSinceProgress`）**: 進化に近づかないドラフトが続くと補助が少しずつ増える。進化成立で `markProgress()` によりリセット。
  `draftsSinceProgress` は `active_run.draftState` に保存（既存 `draft.serialize` 経由）。
- **上限と不変条件**:
  - `synergy=null`（補助なし）は旧挙動と **byte-identical**（テスト済み）。決定論は完全に維持する。
  - 補助 ON でも legendary の出現率は約 0.01（common 約 0.94 の70分の1以下）で **common 並みには増やさない**。
  - 特定レシピを確定させない・data（`synergyAssistEnabled:false`）で無効化できる。

---

## 3. 戦闘テレメトリ（`src/systems/CombatTelemetry.js`）
1周回ぶんのローカル戦闘テレメトリ（**外部送信なし**）。BattleScene が保持し、`update` で FPS・性能上限到達を記録、
スキル取得/進化を記録、周回終了時に `finalizeTelemetry` する。

### スキル別に記録する指標
- casts / hits / kills / damage / DoT / 爆発 / projectile / summon / echo / clone / 上限到達 / 防御値
- **DPS** = damage / activeSeconds、**damageShare**（全体に占める割合）
- **防御スキルの防御値** = `blockedDamage + healed + absorbedBullets×25 + lethalAvoided×1000`
  （phoenix_feather / flame_barrier / bullet_furnace）

### 周回全体で記録する指標
- **FPS**: 平均 / 最低 / フレーム p95（1ms 刻みヒストグラム）
- 性能上限（cap）到達数 / seed / 難易度 / 品質 / 速度 / Job Lv / active枠 など

### 集計（`src/systems/RunBalanceSummary.js`）
- `profile.balanceTelemetry` を **immutable に集計・整形**（例外を投げない）。
- 通常周回 → `summaryBySkill`（上限80スキル）＋ `recentRuns`（最大10）。
- **debugRun**（F4〜F8 のデバッグ補正を使った周回）→ `debugRuns`（最大10）へ**分離**し、通常統計へ混ぜない。
- `softMaxBytes` = 262144。
- **保存は低優先**: 主要セーブより後・try/catch で、失敗してもゲーム進行/主要セーブを壊さない。
  **`save_version` は v6 のまま**（`balance-telemetry` は加算的追加）。

### 見方（ResultScene「Balance詳細」）
- スキル別 DPS / damageShare / 残響（echo）/ 分身（clone）/ 上限到達 / 防御値。
- 周回全体（FPS / cap / seed）。**debugRun の周回は「通常統計へ記録していません」と明示**される。

---

## 4. バランス警告（`src/systems/BalanceWarnings.js`／`data/balance-thresholds.json`）
集計から**開発用の警告のみ**を生成する（**自動調整はしない**）。しきい値は `data/balance-thresholds.json`。

```jsonc
{
  "version": 1,
  "warnings": {
    "minSamples": 5,               // これ未満のサンプルでは警告しない（1〜2周で断定しない）
    "dpsLowPct": 0.25,             // 中央比 DPS がこの割合未満なら「低火力」
    "dpsHighPct": 3.0,             // 中央比 DPS がこの倍率超なら「突出」
    "lowUsageDamageShare": 0.01,   // damageShare がこの値未満なら「使われていない」
    "capReachedPerRun": 50,        // 1周の cap 到達がこれ以上なら「上限に当たりすぎ」
    "defensiveValueEpsilon": 1,    // 防御値がほぼ0の防御スキルを検出
    "evolutionFeasibilityMin": 0.15, // 進化成立率がこれ未満なら「到達しづらい」
    "appearanceMin": 0.02          // 抽選出現率がこれ未満なら「出にくい」
  },
  "telemetry": {                   // テレメトリ上限（RunBalanceSummary が参照）
    "maxRecentRuns": 10, "maxDebugRuns": 10, "maxSummarySkills": 80, "softMaxBytes": 262144
  }
}
```
- `minSamples` 未満は警告しない（**1〜2周で断定しない**）。警告は開発の目安であり、バランスは指示なく変更しない。

---

## 5. Balance Playtest（通常プレイ検証モード・F8・`?debug=1` 限定）
`src/systems/BalancePlaytest.js` が設定・オーバーライドを解決する。**profile を一切変更せず・常に debugRun**。

### 手順
1. `?debug=1` で戦闘に入り、**F8** を押して「Balance Playtest」パネルを開く（F1〜F7 と非競合）。
2. 次を選ぶ:
   - seed / 難易度 / 品質 / 速度 / Job Lv / active枠 **4-6-8** / 候補 **3-4** / リロール等 /
     恒久強化（通常 profile | 全無効）/ 熟練度（通常 | 無効）/ Job補正（通常 | 無効）/ 戦闘時間（5分 | 1分 | 10分）。
3. 「検証開始」→ **一時状態のみ初期化**（スキル自動付与なし・ゴッドモード無効）。小さな「● Balance Playtest」表示が出る。
4. profile の通貨/進行/JobXP/クリアは**不変**。この周回は **debugRun** として通常統計へ記録しない。

同 seed・同候補なら決定論的に同じ抽選になる（本番の SkillDraftManager を使うため）。

---

## 6. fallback 定数の JSON 移行（M6-F）
一部の数値定数を JSON へ移した（`doomsday_core` の `overheat.heatAccelPct=0.5` / `config.doomFireMs=130` /
`config.doomBlastMs=420`、`tri_flame_array.config.edgeWidth=8`、`hexagram_inferno_array.area.outerWidth=10`/`beamWidth=12`、
`orbiting_flame.config.castPulseMs=500`、`fire_spirit.config.summonPulseMs=900`）。
- コードに残る同名の `*_SAFE` 定数は **ゲームバランス値ではなく**、「JSON 欠落時の NaN/undefined 回避のための安全既定」である。
  通常は JSON 側の値が使われる（**重複定義ではない**）。詳細は `docs/data-format.md`。

---

## 自動テスト（`tests/`・`validate.yml` に追加済み）
| テスト | 内容 |
|--------|------|
| `node tests/skill-catalog.mjs` | active30/passive4/進化18のカタログ整合・孤立/未登録/参照不整合0 |
| `node tests/draft-balance-simulation.mjs` | 抽選シミュレーション（CI 軽量200seed・`HEAVY=1` で2500）。枠4/6/8の進化到達率 |
| `node tests/evolution-feasibility.mjs` | 全18レシピが 4枠で成立可能・最小枠 |
| `node tests/combat-telemetry.mjs` | テレメトリ純ロジック（DPS/防御値/FPS集計/debugRun分離/上限） |
| `node tests/balance-playtest.mjs` | 検証モードのオーバーライド解決・**profile 非変更**・常に debugRun |

`validate-data.mjs` に `synergy` 設定・`balance-thresholds.json`・`castMode` 等の検証を追加。既存15スイート＋新5＝**全20スイート通過**。

## Milestone 7-A の追記（氷術師・状態異常テレメトリ）
M7-A で 2人目のジョブ **氷術師（frost_mage）** と汎用状態異常フレームワークを追加したのに合わせ、検証基盤も複数ジョブ・氷統計へ対応した
（**save_version は v6 のまま**・外部送信なし・自動調整なし）。

- **テレメトリに状態異常/氷フィールドを追加**（`CombatTelemetry`）:
  - 周回全体: `jobId` / `iceDamage` / `chillApplied` / `freezeAttempts` / `freezes` / `frozenSecondsApplied` / `shatters` /
    `shatterDamage` / `bossFrostbreaks` / `burningDamage` / `statusApplicationCapsReached`。
  - スキル別: `chillApplied` / `freezeAttempts` / `freezesCaused` / `shatters` / `shatterDamage` / `bossFrostGaugeApplied` /
    `damageTo{Chilled,Frozen,FrostbreakTarget}`。
  - **外部送信なし**。ResultScene「Balance詳細」に氷統計（氷Dmg/冷気/凍結/粉砕/氷砕）を表示する。debugRun は通常統計と分離する。
- **Balance Playtest（F8）は氷術師でも動作する**: 検証開始時に選択ジョブ（火の魔女/氷術師）を選べ、氷術師の Job Lv・氷 active 枠・
  凍結/粉砕/氷砕の挙動を素の状態で確かめられる。**profile は不変・常に debugRun**（JobXP/通貨/進行を汚さない）。
- 氷術師の抽選バランス（氷 active5/進化3）も本番の `SkillDraftManager` を直接駆動して確認する方針は同じ。氷スキルはジョブ別プールのため
  火の魔女の候補とは混ざらない（`multi-job-draft` で検証）。

## 既知の制約（M6-F）
- Node で検証したのは **カタログ整合・抽選シミュレーション・進化成立性・テレメトリ純ロジック・検証モードの profile 非変更** のみ。
- テレメトリの**実収集値・FPS ヒストグラム・ResultScene の Balance詳細描画・F8 パネルの実挙動**は Phaser 依存のため
  ヘッドレスでは未計測。実ブラウザで確認する（`docs/test-guide.md` の M6-F 項目）。実行していない項目を「確認済み」と報告しない。
- シミュレーション結果は**想定レベルアップ回数に依存**する（短周回では枠と進化数の関係が逆転する）。
