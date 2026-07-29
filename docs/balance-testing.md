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

## Milestone 7-B の追記（氷術師ビルド拡張・第2波）
氷術師を **active15 / 進化8**（新 active10種・進化5種）へ拡張したのに合わせ、検証基盤の対象も広げた（**save_version は v6 のまま**・外部送信なし・自動調整なし・数値は data が正）。

- **Balance Playtest（F8）の対象**: 新 active10種・進化5種も検証プレイの抽選・取得・進化条件達成の対象に含まれる（氷術師を選んで素の手触りを確認）。**profile は不変・常に debugRun**。
- **skillCaps の対象**: 氷スキル/進化の品質別上限 **29種を追加**（弾数/雹/地雷/精霊/波/凍結床/落下/吸収/反撃弾/氷牢 など・`low≤medium≤high≤ultra`・正）。上限到達でも凍結/粉砕/氷砕の判定は消さず装飾を先に削る。
- **テレメトリの対象**: 新スキルの per-skill 追加キー（`skills.recordExtra`・ResultScene「Balance詳細」に表示）—
  icicle_volley(volleys/iciclesFired) / frost_orbit(contactHits/maxOrbitCrystals) / freezing_ray(channelSeconds/beamTicks/maxRampReached) /
  hailstorm(stormsCreated/hailImpacts) / cryo_mine(minesPlaced/minesTriggered) / frost_spirit(spiritsSummoned/spiritShots) /
  ice_prison(prisonsCreated/targetsImprisoned) / avalanche(wavesCreated/enemiesPushed) / mirror_ice(projectilesBlocked/defensiveValue/counterShots) /
  glacier_drop(glaciersDropped/pendingImpactsCompleted)。**外部送信なし**・テレメトリ失敗でゲーム/保存は失敗しない。debugRun は通常統計と分離。
- 決定論は不変（Math.random 不使用・draft RNG cursor 不変）。検証は `frost-skills-wave2`/`frost-evolutions-wave2`/`frost-policy-audit`/`frost-runtime-save-wave2`/`frost-determinism-wave2`・`validate-data`（M7-B ブロック）で、**全34テストスイート通過**。

## Milestone 7-B.1 の追記（状態異常の視認性・表示上限）
状態異常を通常プレイ中に確認できる表示層とデバッグを追加したのに合わせ、検証観点を足した（**新スキルなし・数値/バランス不変**・`save_version` は v6 のまま）。詳細は `docs/status-visuals.md`・`docs/status-debug.md`。

- **表示上限 caps は品質別・検証済み**: `balance.skillCaps` へ状態表示の毎フレーム/同時上限 **11種**（`maxStatusIcons`〈1/2/2/3〉/`maxChillVisuals`/`maxFrozenVisuals`/`maxImmunityVisuals`/`maxSlowTrails`/`maxShatterEffectsPerFrame`/`maxStatusFloatingTextsPerFrame`/`maxFrostbreakEffects`/`maxStatusDebugHistory`/`chillNearThresholdEffectCooldown`〈1500〉/`statusVisualUpdateInterval`〈60〉）を加算。`validate-data.mjs` が品質順（`low≤medium≤high≤ultra`）・正・`statusVisuals`（未知 status id/visual type/負数上限）を検証する。
- **装飾上限に達しても状態ロジックは不変**: 低品質のドロップ優先度（frozen > ボス氷砕 > shatter > burning > immunity > chill > slow）で装飾を先に削るが、**凍結解除/免疫/状態索引 cleanup といったロジックは削らない**。表示追加による判定/ダメージ/凍結確率/状態RNG cursor/ボス氷砕値の非回帰は `status-visibility-nonregression.mjs` で確認。
- **debug カウンタがバランス確認を助ける**: `StatusEffectManager.counters()`（chill付与/冷気総量/凍結試行/凍結成功/免疫skip/hitGroup skip/ボスゲージ付与）と F10 の freezeChance 内訳で、凍結の起こりやすさ・永久凍結防止（hitGroup 上限）を数値で観測できる。F10 は `markDebugRun()` で **debugRun 分離**し profile を変更しない（`?debug=1` 限定）。
- 検証: `status-visual-state.mjs`／`status-debug-panel.mjs`／`frostbreak-ui-state.mjs`／`status-visibility-nonregression.mjs`・`validate-data.mjs`（M7-B.1 ブロック）で、**全39テストスイート通過**。実ブラウザの見た目・視認性・60FPS は本環境では未検証。

## Milestone 7-C の追記（氷術師ビルド拡張・第2波）
氷術師を **active25 / 進化13**（新 active10種・進化5種）へ拡張したのに合わせ、検証基盤の対象も広げた（**save_version は v6 のまま**・外部送信なし・自動調整なし・数値は data が正）。

### バランス方針（rarity 別の役割と進化の位置づけ）
- **common は素直な基礎**: `rime_boomerang`（往復弾）/`crystal_bloom`（設置）/`icebreaker_wave`（衝波）。扱いやすく序盤から取れるが、単体で画面を氷で埋め尽くさない。
- **uncommon は特徴づけ**: `frost_chain`（連鎖）/`snowblind_mist`（追従冷気）/`winter_halo`（防御）。ビルドの方向性を決める癖のある効果。
- **rare は軸になる派手さ**: `polar_star`（複合弾）/`crystal_refraction`（屈折）/`comet_sleet`（barrage）。強力だが枠と抽選重みで供給を絞る。
- **legendary は制御された切り札**: `frozen_clock`（全画面時計波）は直接凍結せず `FreezeSystem` へ委譲し、発生を絞る（長CD・periodic）。
- **進化は基礎 Lv8 より明確に強い到達点**: 基礎 active を置換し枠を消費しない。補助条件（passive3種＋補助 active `ice_prison`）は消費しない。過剰化を避けるため `zero_hour_world`（零刻世界）は forbidden で残響/複製せず、ボス氷砕は標準経路（`bossGaugeMult` はボス氷砕ゲージ量のみへ1命中1回だけ適用し、damage/chill/proc には掛からず二重加算しない）。

### 検証観点
- **Balance Playtest（F8）の対象**: 新 active10種・進化5種も検証プレイの抽選・取得・進化条件達成の対象に含まれる（氷術師を選んで素の手触りを確認）。**profile は不変・常に debugRun**。
- **quality 別 skillCaps の対象**: 氷スキル/進化の品質別上限 **23種を追加**（往復弾/連鎖/開花/追従霧/複合弾/衝波/時計波/屈折/氷冠/彗星 barrage/氷晶樹 など・`low≤medium≤high≤ultra`・正）。**装飾上限と damage event 上限を区別**し、上限到達でも凍結/粉砕/氷砕の判定は消さず装飾を先に削る。**`winter_halo` の防御耐久は visual cap（`maxWinterHaloVisualShards`）で減らさない**（防御が見た目の都合で弱くならない）。
- **テレメトリの対象**: 新スキルの per-skill 追加キー（`skills.recordExtra`・ResultScene「Balance詳細」に表示）を記録。共通 chill/freeze/shatter/frostbreak は既存経路で記録し**二重カウントしない**。**外部送信なし**・テレメトリ失敗でゲーム/保存は失敗しない。debugRun は通常統計と分離。
- 決定論は不変（Math.random/Date.now/performance.now 不使用・index ベース・draft RNG cursor 不変）。検証は `frost-skills-wave3`/`frost-evolutions-wave3`/`frost-policy-audit-wave3`/`frost-runtime-save-wave3`/`frost-determinism-wave3`・`validate-data`（M7-C ブロック）で、**全44テストスイート通過・validate-data 0エラー0警告**。
- **実ブラウザ負荷は未確認**: 敵100体＋2倍速での彗星 barrage/全画面時計波/開花/追従霧の負荷・視認性・60FPS 維持はブラウザでの確認が必要（`docs/test-guide.md` の M7-C 項目）。本環境は純ロジック＋graphics 対応の最小モックスモークのみ。実行していない項目を「確認済み」と報告しない。

## Milestone 7-D の追記（氷術師ビルド拡張・最終波＝カタログ完成）
氷術師を **active30 / 進化18**（新 active5種・進化5種）へ拡張し、**火の魔女と同規模のカタログに到達**したのに合わせ、検証基盤の対象も広げた（**save_version は v6 のまま**・外部送信なし・自動調整なし・数値は data が正）。**この波で氷術師のスキル追加は打ち止めとし、次工程はカタログの完成監査**（抽選率/進化到達率/バランス分析）へ移る。

### バランス方針（rarity 別の役割と制御）
- **common は素直な基礎**: `glacial_spear_rain`（予告付き氷槍豪雨）。序盤から取れる主力だが、予告と大型槍のみ粉砕でメリハリを付ける。
- **uncommon は補助軸**: `snowflake_sentry`（設置砲台）。優先射撃と pulse で高chill 敵を効率よく削るが砲台弾は粉砕なし。
- **rare は主軸**: `iceberg_ram`（突進＋崩壊）/`absolute_ice_seal`（氷印・時間/命中数起爆）。ビルドの核になる強さを持つが、氷印は skill-local マーカーで正式 status を増やさず時間か氷命中数でのみ起爆する。
- **legendary は長CD・複製禁止の切り札を cap 制御**: `aurora_veil`（画面横断オーロラ帯）は `echoPolicy=clonePolicy=forbidden`（複製で密度が跳ね上がらない）・帯を複数 query へ分割し毎frame 全敵走査しない（`maxAuroraQueriesPerTick` で負荷 cap）・burst のみ粉砕。
- **進化は基礎 Lv8 より明確に強い到達点**: 基礎 active を置換し枠を消費しない。補助条件（passive3種＋補助 active `ice_prison`）は消費しない。過剰化を避けるため `eternal_sealed_coffin`（永劫封氷棺）は氷棺印を近傍未印へ**1世代だけ伝播**（`propagation.generations=1`・副棺は再伝播しない）させ連鎖の暴走を1段で止める。`aurora_veil`/`polar_night_aurora`/`absolute_ice_seal`/`eternal_sealed_coffin` は forbidden で残響/複製せず、ボス氷砕は標準経路（`bossGaugeMult` はボス氷砕ゲージ量のみへ1命中1回だけ適用し、damage/chill/proc には掛からず二重加算しない）。

### 検証観点
- **Balance Playtest（F8）の対象**: 新 active5種・進化5種も検証プレイの抽選・取得・進化条件達成の対象に含まれる（氷術師を選んで素の手触りを確認）。**profile は不変・常に debugRun**。
- **quality 別 skillCaps の対象**: 氷スキル/進化の品質別上限 **19種を追加**（氷槍予告/氷槍着弾/氷槍数/砲台数/砲台弾/砲台氷線/氷山数/氷山接触判定/氷山氷片/氷印数/氷印起爆/オーロラ帯/オーロラ走査/オーロラ burst/天墜着弾/氷衛軍氷線/大陸氷河数/封氷棺印/極夜帯 など・`low≤medium≤high≤ultra`・正）。**装飾 cap と damage event cap を区別**し、上限到達でも凍結/粉砕/氷砕/氷印の判定は消さず装飾を先に削る。**visual cap でマーカー/防御性能を減らさない**（氷印数の防御性能・aurora の視認性維持のための走査分割 cap を含む）。
- **テレメトリの対象**: 新スキルの per-skill 追加キー（`skills.recordExtra`・ResultScene「Balance詳細」に表示）を記録。共通 chill/freeze/shatter/frostbreak は既存経路で記録し**二重カウントしない**。**外部送信なし**・テレメトリ失敗でゲーム/保存は失敗しない。debugRun は通常統計と分離。
- 決定論は不変（Math.random/Date.now/performance.now 不使用・index／黄金角ベース・draft RNG cursor 不変・status RNG は FreezeSystem のみ）。検証は `frost-skills-wave4`/`frost-evolutions-wave4`/`frost-policy-audit-wave4`/`frost-runtime-save-wave4`/`frost-determinism-wave4`/`frost-boss-gauge-wave4`・`validate-data`（M7-D ブロック）で、**全51テストスイート通過・validate-data 0エラー0警告**。
- **次工程＝完成監査**: 氷術師 active30 の抽選率（rarity 分布・重み・synergy・リロール/追放）、18進化の到達率（素材 Lv8＋補助 Lv4 到達可能性・被り抑制）、DPS/生存/状態寄与のバランス分析を次 milestone で実施する（数値の大幅変更は指示があるまで行わない）。
- **実ブラウザ負荷は未確認**: 敵100体＋2倍速での氷槍 barrage/砲台群/氷山突進/オーロラ帯/氷印起爆の負荷・視認性・60FPS 維持はブラウザでの確認が必要（`docs/test-guide.md` の M7-D 項目）。本環境は純ロジック＋graphics 対応の最小モックスモークのみ。実行していない項目を「確認済み」と報告しない。

## 既知の制約（M6-F）
- Node で検証したのは **カタログ整合・抽選シミュレーション・進化成立性・テレメトリ純ロジック・検証モードの profile 非変更** のみ。
- テレメトリの**実収集値・FPS ヒストグラム・ResultScene の Balance詳細描画・F8 パネルの実挙動**は Phaser 依存のため
  ヘッドレスでは未計測。実ブラウザで確認する（`docs/test-guide.md` の M6-F 項目）。実行していない項目を「確認済み」と報告しない。
- シミュレーション結果は**想定レベルアップ回数に依存**する（短周回では枠と進化数の関係が逆転する）。

## Milestone 7-E: 氷術師 完成監査の走らせ方
```
node tests/frost-draft-balance.mjs            # 200 seed（CI 既定・数十秒）
HEAVY=1 node tests/frost-draft-balance.mjs    # 500 seed（詳細計測）
node tests/frost-evolution-distribution.mjs   # 個別進化の段階内訳（同じく HEAVY=1 対応）
node tests/frost-status-balance.mjs           # 冷気/凍結/耐性/hitGroup/粉砕/ボス氷砕の計測
```
- 抽選は **production の `SkillDraftManager` + `SeededRandom` + `poolEligibility`** をそのまま使う（独自の簡易抽選器は作らない）。
- seed 範囲は固定（1..N）。同じ opts/seeds なら `summarize()` の結果は完全一致する（`Math.random` 不使用）。
- 戦略は `DraftBalanceAnalyzer.M7E_POLICIES`（evolution-first / balanced / random-valid / new-skill-priority / one-build-focus）。
- 警告は `FrostBalanceWarnings.analyzeFrostWarnings()` が `FROST_*` コードで返す（自動調整はしない・**外部送信なし**）。
  閾値の根拠は `./frost-balance-report.md`、実測値は `./frost-draft-analysis.md`。
- **手動 F8**: `?debug=1` → F8 →「📊 ジョブ分析を表示」で、その周回のカタログ / 取得状況 / 進化到達 /
  damage share / 状態異常カウンタ / ボス氷砕 / `bossGaugeMult` / 性能上限到達 / debugRun 状態を確認できる。

## 既知の制約（M7-E）
- 状態異常ハーネスは「10体が移動せず毎秒8命中を浴び続ける」**飽和負荷**のため凍結成功率が実プレイより高く出る。
  実際の抑止は凍結耐性（immunity）が担っており、同ハーネスでも 9,910 回の抑止が発生している。
- 抽選シミュレーションは **level-up 回数に依存**する（30 回では平均進化数 0.15、90 回では 4.88）。
  枠数と進化数の関係も回数によって逆転するため、比較は必ず同じ `levelUps` で行う。


---

## Milestone 8-A: 火の魔女 完成監査の走らせ方

```bash
# 12 本すべて（通常 CI と同じ 200 seed）
for f in tests/flame-*.mjs; do node "$f" || break; done

# 重い計測（500 seed）
HEAVY=1 node tests/flame-draft-balance.mjs
HEAVY=1 node tests/flame-evolution-distribution.mjs

# データ検証（M8-A ブロックを含む）
node tests/validate-data.mjs
```

| テスト | 内容 |
|--------|------|
| `flame-completion-catalog` | カタログ整合性・プール分離・duplicate・未登録/孤立クラス・Lv80 対象 |
| `flame-evolution-reachability` | 進化対応表・到達可能性・自己/循環参照・枠不増加・通常抽選へ出ない |
| `flame-draft-balance` | production 抽選の 200 seed シミュレーション・警告基準・rarity/passive の偏り |
| `flame-evolution-distribution` | 個別進化の段階別到達率・低率の要因分解・進化前後の比較 |
| `flame-dead-content-audit` | 死にパラメータ / 死に milestone / 未参照 cap / 予約フィールド |
| `flame-complete-skill-audit` | SkillAudit 全件・recordCast・echo/clone の再帰・上限/索引/テレメトリの接続 |
| `flame-complete-runtime-save` | 48 件の runtime 往復・二重生成なし・冪等・進化前後の同時稼働なし |
| `flame-complete-determinism` | Math.random 不使用・同一入力で一致・継続 vs reload・CD 保存の効果 |
| `flame-status-balance` | 炎上 / DoT / 爆発 / 二次爆発 / 共鳴の実測と `FLAME_*` 警告 |
| `flame-quality-cap-audit` | quality cap の妥当性・未参照 0・存在しない参照 0・low で 0 件化しない |
| `flame-cleanup-audit` | destroy / 進化置換 / Enemy.reset / 炎上索引 / delayedCall ガード |
| `flame-telemetry-audit` | 全件のテレメトリ・二重計上なし・debugRun 分離・外部送信なし |

## 既知の制約（M8-A）
- ヘッドレスハーネスは「敵が移動せず死なない」飽和条件であり、刻印起爆・分身の複製対象・炎上源など
  BattleScene 側の相互作用も再現しない。**DPS の実測値は火力バランスの判定に使えない**。
  進化前後の比較は data 由来の項目差分で行う。
- 抽選シミュレーションは level-up 回数に強く依存する（火: 30 回で 0.24 / 60 回で 2.20 / 90 回で 2.37）。
  比較は必ず同じ `levelUps` で行う。

## Milestone 8-B: 戦士のバランス確認（F8 / F9）

### F8（Balance Playtest ＋ ジョブ別分析）

戦士の周回で F8 →「戦士 分析を表示」を押すと、右カラムに**戦士セクション**が出る。

| 表示 | 見るポイント |
|------|--------------|
| 闘気 現在値 / 解放回数 / 稼働秒 | 解放が 1 周回で何回入るか（少なすぎ = 溜まらない / 多すぎ = 常時解放） |
| 闘気源の内訳（meleeHit / kill / combo / mitigated / damageTaken / exposed） | どの獲得源が支配的か。1 源だけで満タンになるなら偏っている |
| 超過（overcap）/ 平均解放間隔 | overcap が大きい ＝ 上限に当たり続けている |
| コンボ 現在 / 最大 / 平均 / 途切れ回数 | 平均が閾値 1 段目に届かないなら猶予か減衰が厳しい |
| 閾値到達回数 | 上位閾値に一度も届かないなら実質死に効果 |
| 軽減量 / 解放回復 / 撃破回復 | 回復が総被ダメージを上回っていないか |
| 不屈 発動 / 回復 / 軽減 | 1 周回で 1〜2 回が想定。0 回なら閾値が厳しすぎる |
| ノックバック / 体勢 / stagger / 崩し | ボス戦で崩しが 0 なら体勢削りが不足 |
| 露出 秒数 / 追加ダメージ | 崩しの見返りが体感できる量か |

自動警告（`⚠`）:

- `近接発動はあるが命中0` … 射程・向き・arc の不具合
- `闘気は溜まるが解放0` … 獲得係数が低すぎるか上限が厳しすぎる
- `命中はあるがコンボ0` … `sameTargetWindowMs` か `maxGainPerCast` が厳しすぎる

### F9（戦士検証パネル・戦士の周回のみ）

戦士の周回では F9 が**戦士検証パネル**を開く（火 / 氷では従来どおり状態異常デバッグパネル）。

- 戦士 Job Lv の切替（1 / 10 / … / 100）と補正の即時適用
- active5 の取得・Lv 切替、進化条件の一括達成
- passive4 の Lv+1
- 闘気 +25 / 満タン、闘気解放の強制発動
- コンボ +25 / 途切れさせる
- HP を瀕死にする（不屈の確認）、不屈の CD リセット
- エリート×3 の密集生成、最寄りエリートの体勢を満タン
- ボス出現・体勢 50% / 100%
- 通常状態へ戻す（補正リセット）

右カラムに Job 補正 / 闘気 / コンボ / 強靱・不屈 / 体勢崩し / 所持スキルのライブ表示が出る。
**F9 を開いた周回は自動的に `debugRun` 扱いになり、通常統計へ混ざらない。**

### 既知の制約（M8-B）

- ヘッドレスのテストハーネスは「敵が移動せず、プレイヤーも動かない」飽和条件である。
  **DPS の実測値は火力バランスの判定に使えない**（火 / 氷と同じ制約）。
  戦士は特に「接敵し続けられるか」が火力を左右するため、**実プレイでの体感が必要**。
- 闘気の解放頻度は敵密度に強く依存する（`maxGainPerSecond` が効くため、雑魚が多いほど頭打ちになる）。
  比較は同じ難易度・同じ経過時間で行う。
- 体勢崩しの回数はボス戦の長さに依存する。`thresholdGrowth` があるため後半ほど崩しにくい。

## Milestone 8-B.1: status passive の反映を確認する

`?debug=1` の **F10（状態異常デバッグパネル）** が、余寒残留 `lingering_cold` の効きを見る一番早い手段。

1. 氷術師で周回を開始し、F10 で最寄り敵へ冷気 100 を付与する
2. 冷気が減っていく速さを覚える
3. 通常のレベルアップで余寒残留を取得する
4. もう一度冷気 100 を付与し、**前より残るようになっている**ことを確認する

Lv を上げるほど減衰が緩くなり、凍結時間と氷砕脆弱の残り秒数も伸びる。

### 注意（M8-B.1 で変わった点）

- status 乗率は**周回のジョブが氷術師のときだけ**適用される。
  火の魔女 / 戦士の周回で F9 の氷術師パネルから余寒残留を付与しても乗率は動かない（意図した動作）。
- 乗率は「現在の passive 所持状態からの完全再構築」なので、
  F9 の「選択passive Lv+1」を連打しても倍率が累積することはない。

### 既知の制約（M8-B.1）

- 冷気の減衰・凍結時間は**実プレイでの体感**が判定材料になる。ヘッドレスのテストは
  「乗率が data どおりに反映されるか」までしか見ておらず、ゲームバランスとしての妥当性は評価していない。
- M8-B.1 は数値を 1 つも変えていないため、既存のバランス分析（F8）の見かたは M8-B から変わらない。

---

## Milestone 8-C: 戦士 Wave1 のバランス確認

### F8（バランス検証パネル）に増えた項目

戦士の周回では従来の「戦士（実動作カウンタ）」に加えて次が出る。

```
— 戦士カタログ（M8-C）—
active15 / passive4 / 進化8 LV80対象6種
— 戦士 Wave1（実動作カウンタ）—
処刑 N（失敗M 超過X）※通常敵のみ
反撃 N 内訳{"adamant_counter":3,"counter_stance":1}
戦吼 N回 稼働S秒
引き寄せ N回 Xpx ボス接近N回
着地 N回 進軍 Xpx
連撃 完走N 引き継ぎM
```

警告行（M8-B の 3 種に加えて 4 種）:

- `⚠ 処刑判定はあるが成立0` — 処刑閾値が低すぎる可能性
- `⚠ 構えはあるが反撃0` — 構えの持続が短すぎる / 被弾していない
- `⚠ 戦吼は発動するが稼働0` — バフ持続が 0 になっている
- `⚠ 鎖鉤はあるが引き寄せ/接近0` — 射程が届いていない

### F9（戦士検証パネル）に増えた操作

| 操作 | 何を確かめられるか |
|------|--------------------|
| 最寄り通常敵を処刑圏内（HP10%）へ | 処刑が成立すること |
| 最寄りエリート/ボスを HP5% へ | **処刑されない**こと（ダメージは通る） |
| 戦吼バフを付与 / 解除 | バフの強度と持続・**重ねがけしない**こと |
| 反撃の構えを開く（迎撃 / 金剛） | 複数の構えが同時に開くこと |
| 被弾 1 回ぶんの反撃を発火 | **反撃するのが 1 系統だけ**であること |
| 敵をプレイヤーの遠方へ配置 | 鎖鉤の引き寄せ・跳躍の接近 |

F9 の表示にも「戦吼」「反撃の調停」「処刑」「移動 / 引き寄せ」の各セクションと、
Job Lv80 打撃 +1 の対象一覧（6 種）が出る。

### 手動で見るべき数値の目安

| 指標 | 見かた |
|------|--------|
| 処刑の成立 / 失敗比 | 失敗ばかりなら閾値が実戦で機能していない。全部成立なら閾値が高すぎる |
| 反撃の系統別内訳 | 金剛迎撃を持っているのに `counter_stance` ばかりなら優先度が働いていない |
| 戦吼の稼働秒 / 周回時間 | 常時 100% なら CD が短すぎる |
| 引き寄せ距離 / 回数 | 0 なら射程不足。極端に大きいなら引きすぎ |
| 連撃の引き継ぎ回数 | 0 なら retargetRange が狭すぎる |

### 既知の制約（M8-C）

- 体感（跳躍の気持ちよさ・引き寄せの見た目・反撃の手応え）は**実ブラウザでしか評価できない**。
  ヘッドレスのテストは「壊れていないこと」「上限を超えないこと」までしか見ていない。
- M8-C は火 / 氷の数値を 1 つも変えていないため、火 / 氷のバランス分析の見かたは M8-A / M8-B から変わらない。
- 戦士の周回全体としてのバランス（15 active の相対的な強弱・進化 8 種の到達率）は
  `tests/warrior-wave1-draft.mjs` が提示率 / 取得率を出力する。実プレイでの評価は別途必要。

---

## Milestone 8-C.1: 戦士の進化導線（F8 の見かた）

戦士の周回では F8 のジョブ別分析に「戦士 進化導線（M8-C.1）」が出る。

```
— 戦士 進化導線（M8-C.1）—
guidance: 有効 slot6 進化 2/8
補助回数 base12 support80 upgrade160 evolution0
pity 現在1/3（段0・上限×1.8）発動7 リセット41
条件成立中 0 件（成立後は必ず候補へ出る＝未提示 0 が正常）
```

| 行 | 見かた |
|----|--------|
| `guidance` | 有効 / 無効と枠数・進化到達数 |
| `補助回数` | 進化元の新規取得 / 補助 / 進化元の強化 を何回助けたか |
| `pity` | 現在の stall と閾値・発動回数・リセット回数 |
| `条件成立中` | 成立しているのに提示されていない状態が続いていないか |

警告行:

- `⚠ guidance が upgrade を 1 度も助けていない` — 進化元を持っていない / 補正が効いていない
- `⚠ 導線は動いているが進化に到達していない` — 周回が短いか、枠が狭すぎる
- `⚠ pity が発動したまま一度もリセットされていない` — 導線が完全に止まっている

### 手動で見るべき数値の目安

| 指標 | 目安 |
|------|------|
| pity 発動率 | 毎ドラフト発動していれば強すぎる（実測 13.9% / 枠4・40 レベルアップ） |
| 最頻進化のシェア | 全進化取得の 35% 以下（実測 20〜30%） |
| build の種類 | 枠4 で 60% 以上（実測 66.5%） |
| 進化を持たない active の取得 | guidance ON / OFF で 20% 以上落ちない（実測 +3.9%） |

### 既知の制約（M8-C.1）

- 到達率は **レベルアップ回数に強く依存する**（枠4: 30 回で 38.5%、40 回で 89.5%、60 回で 99.0%）。
  比較は必ず同じ回数で行う。
- 個別 seed では逆転が起きる（枠4 / 40 レベルアップで 200 seed 中 13 run が悪化）。
  重みが変われば分岐も変わるため、確率的な抽選では避けられない。全体では +0.56 の改善。
- **体感**（提示のテンポ・「あと 1 段階」の見え方）は実ブラウザでしか評価できない。
