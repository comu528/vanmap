# Project State

> Reincarnation Flame Survivor の**現在地**を 1 枚にまとめた引き継ぎ用ファイル。
> **各 Milestone 完了時に必ず更新する**（完了報告の要約・コミットID・テスト結果・次 Milestone）。
> compact 後・新セッション開始時は `CLAUDE.md` → `README.md` → `TODO.md` → 本ファイル → `git log -5 --oneline` の順で確認する。
>
> 最終更新: Milestone 8-C.1 完了時点

## Current branch

- ブランチ: **`claude/funny-heisenberg-frhgq9`**（`CLAUDE.md` の継続ブランチ。指定なき限りここへコミット・プッシュ）
- 直近コミット:
  - `6f9b1de` Milestone 8-C.1: 戦士4枠時の進化導線修正（ジョブ限定 guidance ＋ 進化導線 pity）
  - `7e24e1a` Milestone 8-C ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `bae3f34` Milestone 8-C: 戦士スキル拡張 Wave1（active15 / 進化8・処刑/反撃調停/戦吼/引き寄せ）
  - `4a621b6` Milestone 8-B.1 ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `601fe2a` Milestone 8-B.1: passive 再計算バグ修正（status passive を passives.version で単一トリガー化）
  - `4c8bd10` Milestone 8-B: 戦士 基盤実装（active5/passive4/進化3・闘気/コンボ/強靱/不屈/体勢崩し）
  - `ec503fe` docs: M8-A 取り込み後の継続ブランチを docs/project-state.md へ反映
  - `2846906` Milestone 8-A ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `bca7ec3` Milestone 8-A: 火の魔女 完成監査（CD保存漏れ/残響未発火/死にフィールド/未参照capの修正）
  - `338f25c` 環境整備: CLAUDE.md へ Compact Instructions を追記し docs/project-state.md を新規作成
- 作業ツリー: クリーン（未コミットの変更なし）

## Current milestone

- **Milestone 8-C.1（戦士 4 枠時の進化導線修正）完了・停止中。** 次の指示待ち。
- M8-C.1 は**抽選導線の修正のみ**。新しい skill / passive / evolution / job / 状態異常 / 属性反応 /
  UI は追加しておらず、**スキル数値・闘気 / コンボ / 回復 / 体勢のバランスも 1 つも変えていない**。
  `data/skills.json` / `skill-evolutions.json` / `passives.json` / `jobs.json` / `balance.json` の変更は **0 件**。
- 直した問題: M8-C で戦士の active が 5 → 15 になった結果、production の `SkillDraftManager` を使った
  200 seed シミュレーションで **active 枠 4 の「進化 1 個以上」到達率が 92.5% → 46.5%** へ低下していた。
- **閾値を下げるのではなく production の導線を直した**（`docs/warrior-draft-analysis-wave1.md` に修正前分析）。

### M8-C.1 の重要な設計判断

1. **原因は「進化元（基礎 active）側へ効く補正が存在しなかった」こと。**
   既存 synergy（M6-F）は「所持している基礎 → その補助スキル」の**一方向しか無い**。
   火 / 氷は進化の補助が active 中心なので補助を伸ばす過程で基礎も育つが、
   戦士は **8 進化中 7 件が passive 補助**で、passive は枠 4・maxLevel 4〜5 と軽く早期に最大化されるため、
   **基礎 active の Lv8 だけが最後まで残る**構造だった。
   実測でも進化 0 の周回は**所持基礎の最高 Lv が平均 7.03**（あと 1 段階）だった。
2. **「どの進化元を取るか」はレアリティ階層に委ね、「取った進化元を最後まで伸ばす」側だけを助ける。**
   進化元の**新規取得**を無条件に優遇するとレアリティ階層が歪んだ（実測で rare の進化元の取得率が
   同 rarity 中央値の 4.8 倍）ため、新規取得の優遇は「補助がすでに揃っているとき」だけに限定した。
3. **補正対象は data の進化レシピからのみ導出する**（`ctx.evolutionRecipes`）。
   `SkillDraftManager` にも `BattleScene` にも**特定 skill ID を書いていない**。
   data に進化を足せばそのまま補正対象になる。
4. **ジョブ限定**（`skill-config.json` の `guidance.jobs`）。載っていないジョブでは倍率が常に 1 で、
   候補オブジェクトにフィールドすら付かず、pity カウンタも進まない。
   → 火 / 氷の候補列・RNG 消費・保存内容がまったく変わらない。
5. **重複上限**: 同じスキルが複数レシピに関わっても倍率を掛け算にせず、
   役割（base / support）ごとに**レシピをまたいだ最大値**だけを採り、`maxMultiplier` でクランプする。
6. **進化導線 pity**（`guidanceStall`）は既存 pity と別カウンタ。
   既存の `draftsSinceProgress` は進化成立でしかリセットされず、基礎 Lv8 の詰まりを救えないため。
   進展（基礎の取得/強化・補助の取得/強化・進化取得）でリセットし、
   **`active_run` へ加算的に保存する**ので save → reload で稼げない。
7. **RNG 消費を 1 も増やさない**。`_guidanceMult()` は乱数へ触れず重みだけを変えるので、
   guidance の ON / OFF で cursor が動かない。

### M8-C.1 の結果（200 seed・素朴戦略＝M8-B / M8-C と同じ物差し）

| 構成 | 前 | 後 | 目標 |
|------|----|----|------|
| 枠4 / 40 lv・進化 1 個以上 | 62.5%（`_generate` 直呼びでは 46.5%）| **89.5%** | 80% 以上 |
| 枠4 / 40 lv・平均進化数 | 0.70 | **1.26** | 1.0 以上 |
| 枠4 / 40 lv・進化 0 個 | 37.5% | **10.5%** | 20% 以下 |
| 枠6 / 60 lv・≥1 / ≥2 / 平均 | 99.0% / 70.5% / 1.91 | **100.0% / 91.0% / 2.42** | 95% / 60% / 1.7 |
| 枠8 / 80 lv・≥1 / ≥2 / 平均 | 100.0% / 100.0% / 3.50 | **100.0% / 100.0% / 3.92** | 95% / 65% / 1.8 |

5 戦略合算（各 200 seed = 1000 run）: 枠4/40 で 1.29 → **1.51**（≥1 79.3% → **88.7%**）、
枠6/60 で 2.71 → **2.96**（≥2 83.2% → **93.2%**）、枠8/80 で 4.40 → **4.44**。

同 seed の変化（枠4 / 40 lv）: 改善 102 / 悪化 13 / 変化なし 85 / 進化 0→1 以上 61 / 1 以上→0 7 / 平均差 **+0.56**。

**過剰誘導なし**: 最頻進化シェア 34.8% → **30.4%**、build 多様性 61.9% → **66.5%**、
新規取得率が同 rarity 中央値の 3 倍超は **0 件**、進化を持たない active の取得は **+3.9%**、
pity 発動率 **13.9%**（毎ドラフトではない）。

### M8-C.1 で不採用にした案

| 案 | 理由 |
|----|------|
| 進化元の新規取得を無条件に優遇 | レアリティ階層が歪んだ（rare の進化元が同 rarity 中央値の 4.8 倍） |
| slot4 で無関係な新 active を抑制 | 到達率がほとんど変わらず build 多様性だけ下がった。**data のフィールドも残していない** |
| 進化の強制付与 / 候補を進化 1 択へ固定 | 進化条件が意味を失い、build の自由が消える |
| テスト閾値を下げる | 問題を隠すだけ |

### （前 Milestone）Milestone 8-C（戦士スキル拡張 Wave1）
- 戦士の **active を 10 種追加して計 15 種**、**進化を 5 種追加して計 8 種**にした
  （passive は 4 種のまま・Job Lv1〜100 の曲線と到達報酬 11 段も据え置き）。
- 追加した active10: 兜割り / 双牙斬 / 処刑斬 / 跳躍強襲 / 薙ぎ進軍 / 迎撃の構え / 戦吼 /
  鎖鉤 / 震脚 / 怒涛連撃。追加した進化5: 断界兜割 / 血断処刑 / 軍神咆哮 / 金剛迎撃 / 天墜崩撃。
- **すべて近接**。画面を横断する斬撃波・弾は 1 つも増やしていない。

### M8-C の重要な設計判断（4 機構）

1. **処刑（execute）**: 即死用の別 API を作らず、`BattleScene.executeTarget()` が
   「残り HP ぴったりのダメージ」を通常の `dealDamage` 経路へ流す。
   死亡イベント・撃破統計・撃破回復・進化の撃破フックが**1 回だけ**走る。
   可否は `WarriorCombatSystem.executePolicy()` に一元化し、
   **即死しうるのは通常敵だけ**（`allowElite` / `allowBoss` は既定 false）。
   エリート / ボスは欠損 HP 参照の追加ダメージのみで、ボスは `bossMissingHpCap` で頭打ち。
   `maxExecutesPerSecond` で 1 秒あたりの処刑数も制限する。
2. **反撃の調停**: `consumeCounterEvent()` が **1 被弾につき優先度最上位の 1 系統だけ**を選ぶ。
   優先度は `balance.warrior.counter.priority`（`adamant_counter` 3 > `unyielding_fortress` 2 >
   `counter_stance` 1）。`globalCooldownMs` と `BattleScene._inWarriorCounter` の再入ガードで
   counter → counter の再帰なし。軽減は合算せず最大値を採り、合計 70% でクランプ。
   **不屈（基礎能力）は反撃系統ではない**（構え枠を占有しない）。
   M8-B の `UnyieldingFortressSkill` もこの調停へ移行した（挙動は不変）。
3. **戦吼の一時バフ**: 新しい formal status を作らず `WarriorCombatSystem` 上の timed buff で持つ。
   **重ねがけしない**（`stack: 'refresh'` = 上書き）。強度・持続は `balance.warrior.warCry.max*` でクランプ。
   軍神咆哮の `graceRefill` はコンボ「猶予」だけを戻し、**コンボ値は無料で配らない**。
4. **移動 / 引き寄せの共通経路**: `pullTarget()` / `movePlayerTowards()` / `preferredMeleeTarget()` /
   `bossTelegraphing()` / `warriorPullConfig()` を `BattleScene` へ追加。スキルは座標を直接書き換えない。
   **ボスは引き寄せられない**（`bossPullDistance` = 0・代わりに自分が踏み込む）。
   壁外 / NaN / テレポートを作らず、`enemyGrid.update()` を必ず呼び、慣性を残さない。

加えて **`applyEvolvedSemantics(cls)`**（`src/skills/WarriorSkillBase.js`）を新設した。
軍神咆哮 / 金剛迎撃 / 天墜崩撃は `EvolvedSkillBase` ではなく**基礎 active のクラス**を継承しており、
data の読み先だけを進化定義へ差し替えるためのミックスイン。
`stats` は `{ cooldown: evoDef.cooldown }` を合成して返すので `SkillBase.update()` がそのまま働く。

### M8-C で修正した既存の不備

- `crimson_execution.killChain.killHealBonus` が data にあるのに未参照だったため、
  `WarriorCombatSystem.noteKillHealBonus()` を追加して実装した（撃破回復の毎秒上限は共有）。
- テスト用モック `tests/warrior-common.mjs` の `combat.nearestEnemy` がボスを候補に含めておらず、
  production の `BattleScene.nearestTarget` と食い違っていたのを揃えた。

### 現在のカタログ規模

| ジョブ | active | passive | 進化 | 属性 | Lv80 打撃/弾 +1 対象 |
|--------|--------|---------|------|------|----------------------|
| 火の魔女 `flame_witch` | 30 | 4 | 18 | fire | 6 |
| 氷術師 `frost_mage` | 30 | 4 | 18 | ice | 6 |
| **戦士 `warrior`** | **15** | **4** | **8** | physical | **6** |

戦士の Job Lv80「打撃数 +1」対象はちょうど 6 種:
`great_cleave` / `shield_bash` / `ground_slam` / `armor_breaker` / `twin_fang_slash` / `relentless_combo`。
進化 8 種はすべて対象外で、**弾は 1 つも増えない**。

### 非回帰条件（M8-C.1 以降も守る）

- 火 / 氷のドラフト候補列（300 seed）SHA-256: 火 `15a8585c…` / 氷 `bd38bcf5…`
- 火 / 氷 48 スキルの実行トレース SHA-256: 火 `1f0f2c18…` / 氷 `029a44bd…`
- 共通状態異常は 5 種（`burning` / `chill` / `frozen` / `freeze_immunity` / `frostbreak_vulnerability`）
- `save_version` = 6
- `skillCaps` は全 185 件が単調（low ≤ medium ≤ high ≤ ultra）・**未参照 cap 0 件**
- 火 / 氷のスキルは戦士 API（`meleeStrike` / `pullTarget` / `executeTarget` など）を 1 つも呼ばない
- **進化導線補助（guidance）は `skill-config.json` の `guidance.jobs` に載っているジョブでだけ効く**。
  火 / 氷では倍率が常に 1・候補オブジェクトにフィールドが付かない・`guidanceStall` が進まない・
  RNG 消費が変わらない（`tests/warrior-draft-guidance-nonregression.mjs`）
- **進化導線の到達率**: 枠4/40lv ≥1 80%・平均 1.0・0 個 20% 以下／枠6/60lv ≥1 95%・≥2 60%・平均 1.7／
  枠8/80lv ≥1 95%・≥2 65%・平均 1.8（`tests/warrior-slot4-evolution-rate.mjs`）
- **過剰誘導の禁止**: 最頻進化のシェア 35% 以下・新規取得率が同 rarity 中央値の 3 倍以下・
  build 多様性と進化非対象 active の取得が guidance で悪化しない（`tests/warrior-build-diversity.mjs`）

### 未解決の warning / 既知の問題

- **実ブラウザ未確認**: M8-C.1 も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのみ）。
  実描画・視認性・体感バランス・60FPS は未検証。
  `docs/test-guide.md` の Milestone 8-C.1 節（A〜I）／ Milestone 8-C 節（A〜J）を要確認。
- **M8-C.1 の残観測（警告ではない）**:
  - 総ピック数（強化を含む）で見ると `great_cleave` が同 rarity 中央値の 3.35 倍、`war_cry` が 3.65 倍。
    「深く伸ばした base はピック数が 8 回になる」という指標の性質で、**新規取得率で見れば 0 件**。
  - 枠8 × **60** レベルアップだけ最頻進化シェアが 35% 前後になる（枠8 の標準は 80 レベルアップで 20.1%）。
    `great_cleave` が common であることによる構造的な偏りで、guidance 導入前は 40.7% だった。
  - 枠4 × 30 レベルアップでは進化 1 個以上が 38.5% にとどまる（周回が短すぎて基礎 Lv8 に届かない）。
    設計どおりで、40 レベルアップ以上では目標を満たす。
- 戦士のカタログは火 / 氷の半分（15 / 8）。Wave2 以降で 30 / 18 へ揃える必要がある。
- 戦士の完成監査（M7-E / M8-A に相当する 12 観点）は未実施。カタログが揃ってから行う。

### （前 Milestone）Milestone 8-B.1（passive 再計算バグ修正）
- 氷術師の passive **余寒残留 `lingering_cold`** を通常のレベルアップで取得・強化しても、
  その周回中に効果が反映されなかったバグを修正した
  （`_refreshStatusPassives()` が `applyCandidate` の経路から呼ばれていなかった）。
- **`PassiveManager.version` を単一トリガー**にする `_refreshStatusPassivesIfNeeded()` を追加し、
  version が変わったときだけ現在の passive 所持状態から乗率を完全再構築する。
- status passive の適用を「周回のジョブが氷術師のときだけ」へ明示分離した。
- data 変更なし・`save_version` v6 維持。

### （前 Milestone）Milestone 8-B（戦士 基盤実装）
- M8-B は 3 人目のジョブ **戦士（`warrior`・`physical`）** の**基盤**を追加した Milestone。
  active5 / passive4 / 進化3 / Job Lv1〜100 と、戦士専用の
  **闘気（fury）/ コンボ / 強靱（被ダメージ軽減）/ 不屈 / 撃破回復 / 体勢崩し（poise）** を実装した。
- **新しい共通状態異常・火氷との属性反応・装備・新 enemy/boss/difficulty・4 人目のジョブは追加していない。**
- **火の魔女（flame_witch）・氷術師（frost_mage）は数値・挙動・候補列・状態異常・保存・カタログとも 1 件も変更していない**
  （`tests/three-job-nonregression.mjs` が候補列 300 seed・48 スキルの実行トレース・保存キー一覧を
  SHA-256 のハッシュ固定で検証する）。

## Completed milestones

| Milestone | 内容 |
|-----------|------|
| M1 | 起動・タイトル・移動・ダッシュ・敵出現・自動攻撃・経験値・レベルアップ3択 |
| M2 | 複数スキル・5分ボス・勝利・リザルト・途中再開 |
| M3 | 拠点・残り火・恒久強化・難易度・熟練度・統計 |
| M4 | 進化・転生・魂炎 |
| M5-A | SpatialGrid・PoolManager・性能計測・品質別上限・負荷テスト |
| M5-B | browser/folder save・JSON入出力・backup・競合解決・multi-tab・SaveCoordinator |
| M6-A〜E | スキル抽選基盤（SeededRandom / SkillDraftManager）・火の魔女 active30 / 進化18・CastPolicy / SkillAudit |
| M6-F | SkillCatalog・DraftBalanceAnalyzer・CombatTelemetry・RunBalanceSummary・BalanceWarnings・BalancePlaytest（F8） |
| M7-A | 2人目ジョブ「氷術師」＋汎用状態異常基盤（active5 / 進化3）。以後 CD 保存修正（`bad8bd4`） |
| M7-B | 氷術師 active15 / 進化8。追加監査で passive のジョブプール分離を修正（`9eb7277`） |
| M7-B.1 | 状態異常の視認性（StatusVisualManager / BossFrostbreakDisplay / StatusDebugPanel F10）（`aee0886` `602277b`） |
| M7-C | 氷術師 active25 / 進化13（`586ef02` `8ad5ec2`）。追加監査で `bossGaugeMult` の死に項目を修正（`303c391`） |
| M7-D | 氷術師 active30 / 進化18（カタログ完成・火の魔女と同規模）（`afc4401` `3a3f9cc`） |
| M7-E | 氷術師 完成監査（カタログ / プール分離 / 進化到達率 / 抽選シミュレーション / 死にコンテンツ / 保存 / 決定論 / 状態異常 / cap / cleanup / telemetry）（`3e6c7ed`） |
| M8-A | 火の魔女 完成監査（カタログ / プール分離 / 進化到達率 / 抽選シミュレーション / 死にコンテンツ / SkillAudit / 保存 / 決定論 / 炎上・DoT・爆発・共鳴 / cap / cleanup / telemetry）（`bca7ec3` `2846906` `ec503fe`） |
| **M8-B** | **3 人目のジョブ「戦士」基盤実装**（active5 / passive4 / 進化3 / Job Lv1〜100 ／ 闘気・コンボ・強靱・不屈・撃破回復・体勢崩し ／ 近接判定の共通経路 ／ 戦士 HUD・オート移動・F8/F9 ／ `warriorState` 保存 ／ 3ジョブ非回帰）（`4c8bd10`） |

## Job catalog counts

| ジョブ | id | 属性 | active | passive | evolution | Job Lv |
|--------|----|------|--------|---------|-----------|--------|
| 火の魔女 | `flame_witch` | fire | **30** | **4** | **18** | 1〜100 |
| 氷術師 | `frost_mage` | ice | **30** | **4** | **18** | 1〜100 |
| **戦士** | **`warrior`** | **physical** | **15** | **4** | **8** | **1〜100** |

- 合計: 火 52 / 氷 52 / **戦士 27**（M8-C Wave1 時点）。`SkillCatalog.buildCatalog()` の issues は **3 ジョブとも 0**。
- active slot 4 → 6 → 8（転生で拡張）、passive slot 4。全 active は maxLevel 8、進化は単一形態（Lv 固定）。
- Job Lv80「発射数+1」対象は**明示 flag（`lv80ProjectileTarget:true`）のみ**。
  火 6 種（`fireball` `flame_lance` `scatter_flame` `homing_wisp` `ricochet_ember` `core_overdrive`）/
  氷 6 種（`frost_shard` `glacial_lance` `icicle_volley` `rime_boomerang` `polar_star` `glacial_spear_rain`）。
  **進化 18 種は両ジョブとも全て対象外。**
- 火 passive 4 種: `power_amp` / `swift_cast` / `scorch_expand` / `ember_persist`。
- 氷 passive 4 種: `frost_amplification` / `rapid_freezing` / `frozen_expansion` / `lingering_cold`。
- **戦士 passive 4 種**: `brute_force`（剛力）/ `heavy_armor`（重装）/ `combat_instinct`（戦闘本能）/ `bloodlust`（血気）。
- **戦士 active 15 種**（M8-B の 5 ＋ M8-C の 10）:
  `great_cleave`（初期）/ `shield_bash` / `whirlwind_slash` / `charge_slash` / `ground_slam` ＋
  `armor_breaker` / `twin_fang_slash` / `execution_strike` / `leap_smash` / `sweeping_advance` /
  `counter_stance` / `war_cry` / `chain_hook` / `shockwave_stomp` / `relentless_combo`。
  **全て近接**（自分中心の円 or 前方 arc）で、画面を横断する斬撃波・弾を生成しない。
- **戦士 evolution 8 種**（M8-B の 3 ＋ M8-C の 5）:
  `thousand_blade_dance`（大薙ぎ+戦闘本能）/ `bloodstorm_whirlwind`（旋風斬り+血気）/
  `unyielding_fortress`（盾撃+重装）＋ `skull_splitter`（兜割り+剛力）/
  `crimson_execution`（処刑斬+血気）/ `war_god_roar`（戦吼+戦闘本能）/
  `adamant_counter`（迎撃の構え+重装）/ `heaven_crushing_descent`（跳躍強襲+**active 地砕き Lv6**）。
  **進化を持たない active は 6 種**（`charge_slash` `ground_slam` `twin_fang_slash`
  `sweeping_advance` `chain_hook` `shockwave_stomp`）。
  `ground_slam` は天墜崩撃の **active 補助**（置換されず CD にも触らない）。
- **戦士の Lv80「打撃数+1」対象は 6 種**（`great_cleave` `shield_bash` `ground_slam`
  `armor_breaker` `twin_fang_slash` `relentless_combo`）。進化 8 種は対象外。
- **戦士は共通状態異常を 1 つも使わない**（`jobs.json` の `statusEffects` が空）。体勢は専用ゲージ。
- 火の進化 18 件は **すべて base Lv8 ＋ 補助 Lv4・分岐なし**。うち **active 補助 14 件 / passive 補助 4 件**。
  進化対象 active 18 種 / 非対象 12 種。
- 一覧・進化対応表は `docs/skill-catalog.md`（Milestone 7-E 節 / Milestone 8-A 節）。

## Save version

- **`save_version` = v6**（M8-A / M8-B とも加算的変更のみでスキーマ不変・移行処理不要）。
- 保存先: localStorage（browser save）＋ folder save / import / export / backup / conflict resolution / multi-tab（SaveCoordinator）。
- `active_run` に途中再開用の状態を保持: `jobId` / `jobElement` / `initialSkill` / 各 pool / `jobLevelAtStart` /
  `resolvedJobModifiers` / `skillRuntime` / status RNG cursor / boss frostbreak state。
- **M8-A で `skillRuntime` に載るスキルが増えた**（火の魔女 48 件すべて）。既存フィールドへの加算的変更で移行不要。
- **M8-C で `warriorState.timedBuffs` を追加**（戦吼バフ・反撃の構え。**構えは使用回数も保存**して
  再読込で使い直せない）。跳躍 / 引き寄せ / 連撃の途中状態は意図的に復元しない
  （薙ぎ進軍だけ残り時間と消化済み打撃数を引き継いで「再開」する）。旧セーブ / 壊れた保存でも落ちない。
- **M8-B で `active_run.warriorState` を 1 キー追加**（戦士周回のみ・他ジョブは `null`）。
  闘気 / コンボ / 猶予 / 解放残り / 回復残り / 不屈 CD・発動回数 / ボス体勢（ゲージ・崩し回数・しきい値倍率）/
  突進の軽減窓 / 周回テレメトリ を復元する ＝ **再読込で初期化して稼げない**。
  一方 **cast 予算・同一敵の命中記録・突進の途中状態は意図的に復元しない**（古い敵参照を持たない／無料再ダッシュを防ぐ）。
- 戦士 23 スキル（active15 + 進化8）すべてが `skillRuntime` に載る（最低でも `cdLeft`）。
- 詳細は `docs/save-format.md`。

## Important architecture

- **決定論**: `SeededRandom`（mulberry32）。draft RNG / status RNG / combat・skill RNG を**分離**。
  ゲームプレイ判定に `Math.random` / `Date.now` / `performance.now` を使わない。
- **抽選の正**: `SkillDraftManager`（production）。カタログ表示・シミュレーション・テストは
  **`poolEligibility.memberAllowedForJob` を単一の正**として共有する。`jobs` 未指定を暗黙の共通扱いにしない
  （明示共通は `isCommon:true` か `jobs:["*"]` のみ。現状どちらも 0 件）。
- **状態異常**: `data/status-effects.json` → `StatusEffectRegistry` → `StatusEffectManager` / `FreezeSystem`。
  正式状態は **5 種**（burning / chill / frozen / freeze_immunity / frostbreak_vulnerability）。
  **炎上（burning）はマーカーで、継続ダメージ自体は各スキルが `tag:'dot'` で与える**（M6-E からの設計・M8-A で確認）。
  ボスは通常凍結せず**氷砕ゲージへ変換**。粉砕は非再帰（`isShatter`）。
- **skill-local マーカー**: 氷印 / 氷棺は正式 status ではなく `Enemy._iceSeal` / `_iceHitCount`（`reset()` でクリア）。
- **`bossGaugeMult`**: `applyIceHit` のボス分岐のみで `addBossGauge` の量へ 1 回だけ乗る。
- **上限は二層**: 進化ごとの `safetyCaps`（`EvolvedSkillBase.cap()`・絶対上限）と
  `balance.json` の `skillCaps`（`combat.skillCap()` / `frameBudget()`・**品質別** low ≤ medium ≤ high ≤ ultra）。
  **未参照 cap は 0 件**（M8-A で火由来 5 件を削除。M8-B で戦士向け 13 件を追加し全て参照済み。
  以後 `validate-data` がエラーにする）。
- **主発動イベント（recordCast）**: 攻撃サイクル単位で 1 回だけ。常設型は `config.castPulseMs` でスロットル
  （`orbiting_flame` / `fire_spirit` / `eternal_pyre` / `solar_annihilation_array`）。これが
  `recordCast → _onSkillCast → jobMods.registerCast → _triggerEcho`（残響）の唯一の起点。
- **runtimeState は全件**: 火・氷とも全 active / 進化が `serializeState`/`restoreState` を持つ
  （常設型は CD ではなく位相・スロットル・各インスタンスのタイマーを保存し、設置物本体は保存しない＝二重生成しない）。
- **表示とロジックの分離**: `StatusVisualManager` / `BossFrostbreakDisplay` / `StatusDebugPanel` は
  イベントを購読するだけで、判定・ダメージ・RNG cursor に影響しない。
- **テレメトリ**: `CombatTelemetry` → `RunBalanceSummary`。debugRun は通常統計と完全分離。**外部送信は禁止**。
- **戦士（M8-B）**: `WarriorCombatSystem` が闘気 / コンボ / 軽減 / 不屈 / 撃破回復 / 体勢の**唯一の管理者**
  （Phaser 非依存・乱数なし・`now()`/`heal()` コールバック経由でテスト可能）。
  戦士スキルは `scene.combat.meleeStrike()` 経由でのみ敵へ触り、**全敵総当たりをしない**（SpatialGrid）。
  Job Lv / passive → 倍率の流し込みは `BattleScene._refreshWarriorMods()` の **1 か所だけ**。
  被弾は `Player.takeDamage` → `scene.onWarriorDamage()` の 1 経路（他ジョブでは素通り）。
  **体勢崩しは氷砕と独立**（別フィールド・別しきい値・別 CD。氷砕は chase 中のみ硬直、体勢崩しは予告/突進も中断）。
- **passive modifier の 2 系統（M8-B.1）**: passive の効果には
  **pull 型**（参照側が毎回 `PassiveManager.getMult()` を読む: `damage` / `cooldown` / `area` / `duration` / `iceDamage` …）と
  **push 型**（別システムへ値を押し込む: `StatusEffectManager.setPassiveMods()` の `chillDecay` / `iceStatusDuration`、
  `WarriorCombatSystem.setMods()` の戦士 13 キー）がある。
  **push 型は「いつ押し込むか」を必ず `passives.version` で駆動する**こと
  （`_refreshStatusPassivesIfNeeded()` / `_refreshWarriorMods()`）。手で呼ぶ設計にすると呼び忘れる（M8-B.1 のバグ）。
  押し込みは常に**現在の所持状態からの完全再構築**にし、現在値への加算をしない（二重適用を構造的に防ぐ）。
- **監査基盤**: `SkillCatalog` / `SkillAudit` / `CastPolicy` / `DraftBalanceAnalyzer` / `BalanceWarnings` /
  `FrostBalanceWarnings`（FROST_* 30 コード）/ **`FlameBalanceWarnings`（M8-A 新規・FLAME_* 30 コード）** /
  `BalancePlaytest`（F8）。すべてローカルのみ。
- **死にフィールド禁止**: 宣言した Lv 成長項目・quality cap は**必ず実装で参照する**か **data から削除する**。
  「予約値」として残さない（`validate-data.mjs` の M7-E / M8-A ブロックがエラーにする）。
  進化定義の正は `skill-evolutions.json` のみ（`skills.json` の旧 `evolution` ブロックは M8-A で廃止）。

## Fixed critical bugs

| # | Milestone | 内容 | コミット |
|---|-----------|------|----------|
| 1 | M7-A 後 | 氷術師スキルの CD が保存されず、reload で全回復・無料 cast・field/wall/domain の二重生成が起きていた | `bad8bd4` |
| 2 | M7-B 後 | 火 passive 4 種が氷術師のドラフトへ混入していた。`poolEligibility.memberAllowedForJob` へ判定を一元化 | `9eb7277` |
| 3 | M7-C 後 | `bossGaugeMult` が data にあるのにコードから一度も参照されない**死んだ成長項目**だった | `303c391` |
| 4 | M7-E | 死にパラメータ 6 件（氷）。`crystal_bloom.interval` ほか | `3e6c7ed` |
| 5 | M7-E | `heaven_piercing_glacier` / `absolute_zero_ray` の `bossGauge.multiplier` が通常敵の冷気まで増やしていた | `3e6c7ed` |
| 6 | M7-E | `echoPolicy`/`clonePolicy` が `custom` なのに実装が無く `fire()` 全体を無料再発動していた 3 件（氷） | `3e6c7ed` |
| 7 | M7-E | 未参照 quality cap 11 件を接続・4 件削除・名前違い 1 件（氷） | `3e6c7ed` |
| 8 | **M8-A** | **火の魔女スキル 21 種の CD が保存されず、reload で全回復して無料発動できていた**（#1 と同じクラスの欠陥が火側に残っていた）。48 件すべてが runtimeState を保存するよう修正 | `bca7ec3` |
| 9 | **M8-A** | **`eternal_pyre` / `solar_annihilation_array` が `recordCast` を一度も呼ばず、data で宣言した残響・分身が一度も発生しなかった**（進化元では発生する＝進化で機能を失う逆転）。主発動をスロットル記録し `echoPolicy`/`clonePolicy` を `custom` へ是正、`eternal_pyre` に `echoCast()` を実装 | `bca7ec3` |
| 10 | **M8-A** | 死にパラメータ 21 件（旧 `evolution` ブロック 3 / `bloodfire_pact.buffDamage`・`buffMs` / `four_sided_inferno.burnMs` ほか）→ 実装へ接続 13 件・削除 8 件で **0 件**へ | `bca7ec3` |
| 11 | **M8-A** | M7-E から残っていた**火由来の未参照 quality cap 5 件**を削除（重複 or 参照すると品質で火力が変わるもの）。`SkillBase._initCd` も削除 | `bca7ec3` |
| 12 | **M8-A** | `eternal_pyre.spreadInfection()` が `enemyPool.forEachActive()` で毎 tick 全敵を総当たりしていたのを炎上索引経由へ（性能改善・対象集合は同じ） | `bca7ec3` |
| 13 | M8-A | `AshLegionSkill` / `SolarAnnihilationArraySkill` の `serializeState()` が `{}` を返すだけで `restoreState` も無く、`AshDoppelgangerSkill` は保存値 `spawned` を復元していなかった（再開直後に全ユニットが無料で一斉発動） | `bca7ec3` |
| 15 | **M8-B.1** | **氷術師の passive「余寒残留」が周回中に効かなかった**。`BattleScene._refreshStatusPassives()` が通常のレベルアップ経路（`applyCandidate`）から呼ばれておらず、`StatusEffectManager` へ push 型で渡す `chillDecayMult` / `iceStatusDurationMult` だけが更新されないままだった（pull 型の `iceDamage` / `cooldown` / `area` は影響なし）。`passives.version` を単一トリガーにする `_refreshStatusPassivesIfNeeded()` を追加し、変化時だけ現在の所持状態から完全再構築するようにした | `601fe2a` |
| 14 | M8-B | 実装中に作り込みかけた**死にフィールド 2 件を作らずに済ませた**: passive `heavy_armor` の `knockbackResist`（プレイヤーがノックバックされる仕組みが存在しない）と `charge_slash.levels[].visual`（`visualScale()` を使わない）。data・`modifierKeys`・`balance.warrior.mitigation` から削除し、「予約値として残さない」原則を維持 | `4c8bd10` |

## Non-regression requirements

以後の作業で**壊してはいけない**もの。

- 火の魔女: active30 / passive4 / evolution18・**同 seed の候補列**・48 件の runtimeState 保存・
  主発動スロットル（`castPulseMs`）・死にフィールド 0・未参照 cap 0
- 氷術師: active30 / passive4 / evolution18・数値・挙動・候補列・状態異常・保存・カタログ（**M8-A / M8-B で完全一致を確認済み**）
- **戦士: active15 / passive4 / evolution8**・近接のみ（弾を撃たない）・闘気の 3 層上限・軽減 70% クランプ・
  撃破回復の毎秒上限・不屈の CD・エリート stagger 免疫・ボス体勢しきい値の上昇と頭打ち・
  残響/分身の対象外・23 スキルすべての CD 保存
- **戦士 Wave1（M8-C）の 4 機構**:
  処刑は**通常敵のみ**（エリート/ボスは絶対に処刑されない・ボスの追加ダメージは上限つき・毎秒上限あり）／
  **1 被弾 = 最大 1 系統の反撃**（優先度・全体 CD・再入ガード）／
  戦吼バフは**重ねがけしない**（refresh・上限クランプ・formal status を作らない）／
  **ボスは引き寄せられない**（壁外・NaN・テレポートを作らない・SpatialGrid を必ず更新）／
  Job Lv80「打撃数 +1」対象は**ちょうど 6 種**で弾は増えない／
  進化の補助 active（地砕き）は**置換されず CD にも触らない**
- **3 ジョブのプール完全分離**（各メンバーが適格なジョブは最大 1 つ）
- passive のジョブプール分離／`poolEligibility.memberAllowedForJob` が単一の正／`jobs` 未指定を暗黙共通にしない
- active slot 4→6→8・passive slot 4・Job Lv1〜100・Job XP・熟練度
- 進化 / 転生 / 残り火 / 魂炎 / 難易度
- F8（Balance Playtest ＋ ジョブ別分析）/ F9（デバッグ）/ F10（状態異常デバッグ）
- SkillCatalog / SkillAudit / DraftBalanceAnalyzer / CombatTelemetry / BalanceWarnings /
  FrostBalanceWarnings / **FlameBalanceWarnings**
- StatusEffectManager / StatusVisualManager / FreezeSystem・chill / slow / frozen / immunity / shatter / frostbreak
- burning（マーカー）/ 炎上索引 / 灼熱共鳴 / 万象炎鳴 / 爆発の非再帰（`isMarkDetonation` ほか）
- SpatialGrid / PoolManager / quality cap（low ≤ medium ≤ high ≤ ultra・正数・**未参照ゼロ**）
- browser save / folder save / import / export / backup / 競合解決 / multi-tab
- `active_run` / `skillRuntime` / status RNG cursor（**RNG drift 0**）
- `save_version` = **v6**
- 外部送信の禁止（telemetry / warnings はすべてローカル）
- **`tests/three-job-nonregression.mjs` / `tests/status-passive-nonregression.mjs` /
  `tests/three-job-wave1-nonregression.mjs` / `tests/warrior-wave1-determinism.mjs` のハッシュ 4 種**
  （火/氷の候補列・火/氷のランタイムトレース）。火・氷を触ったら必ずここが落ちる。
  落ちたら「意図した変更か」を必ず確認すること。
- **push 型 passive modifier の反映**（M8-B.1）: status 乗率・戦士 mods は `passives.version` 駆動で、
  レベルアップ取得の直後に反映されること／未変更フレームで再計算しないこと／完全再構築で二重適用しないこと。

## Open warnings

修正せず**理由を記録して残している**もの。

| 警告 | 内容 | 理由 |
|------|------|------|
| `FROST_EVOLUTION_LOW_RATE slot8:atLeast1` | 氷 evolution-first・枠8 の「進化1個以上」が **94.0%**（基準 95%） | 枠が広いほど level-up が分散する希釈特性。`one-build-focus` なら 99.0%。詳細は `docs/frost-balance-report.md` |
| `FROST_EVOLUTION_ZERO_RATE zero_hour_world` | 氷・全戦略合算の取得率 **1.00%** | legendary base ＋ active 補助の二重ハンデ。**到達不能ではない** |
| `FROST_FREEZE_EXCESSIVE` | 状態異常ハーネスで凍結成功率 93.3% | 飽和負荷のテスト条件による。実際の抑止は凍結耐性が担っている |
| （火）`hexagram_inferno_array` の evolution-first/slot6 取得率 0.0% | 合算では 3% | base rare ＋ 補助 rare の二重ハンデ。M6-F 以来の既知の低率。**到達不能ではない** |
| （火）`star_devouring_furnace` / `doomsday_core` の合算取得率 各 1% | — | base が legendary。終盤の legendary 軸として意図的 |

**`FLAME_*` 警告は 0 件**（high / medium / low すべて 0）。火の魔女の未参照 cap も 0 件になり、
M7-E の「火由来の未参照 cap 5 件」は解消済み。**戦士は M8-C 時点でも警告 0 件**
（active15 / passive4 / 進化8 すべてが 400 seed の初回候補で出現し、
進化 8 種すべてが抽選で形成・取得され得ることを確認済み）。

### M8-C で数値を動かした「意図した希釈」

| 項目 | M8-B | M8-C | 理由 |
|------|------|------|------|
| 戦士・進化 1 種以上の到達率（active枠4 / 40 レベルアップ） | 92.5% | **46.5%** | active プールが 5 → 15 になり、進化元と補助が揃う確率が下がった。枠 6 で 97.0%・枠 8 で 100.0% なので**到達不能ではない**。`tests/warrior-draft-determinism.mjs` のしきい値を枠別（4:40% / 6:60% / 8:80%）へ更新した |
| 候補ゼロの発生（枠4） | 12 回/周回 | **約 10 回/100 seed** | プールが広がり「所持がすべて上限」に到達しにくくなったため、むしろ減った。`tests/warrior-wave1-draft.mjs` は「飽和以外の理由で候補ゼロが起きないこと」を検証する |

### M8-B で残した既知の問題 → **M8-B.1 で解消済み**

| 項目 | 状態 |
|------|------|
| `_refreshStatusPassives()` の呼び出し漏れ（余寒残留が周回中に効かない） | **M8-B.1 で修正**。`passives.version` を単一トリガーにする `_refreshStatusPassivesIfNeeded()` を追加し、レベルアップ確定時・メインループ（gate 付き）・周回開始/復元（force）から発火するようにした |

### M8-B.1 での意図した挙動変化

| 項目 | 内容 |
|------|------|
| F9 氷術師パネルのジョブ制限 | status 乗率の適用を「周回のジョブが氷術師のとき」に限定したため、**火の魔女 / 戦士の周回で F9 から余寒残留を付与しても乗率が動かない**。状態異常の乗率を検証する場合は氷術師の周回で行う（`docs/test-guide.md` に注記） |

### 既知の問題 / 制約

- 抽選シミュレーションの結果は **level-up 回数に強く依存**する（火: 30 回で平均 0.24、60 回で 2.20、90 回で 2.37）。
  比較は同じ `levelUps` で行う。
- **戦士は「接敵し続けられるか」が火力を左右する**ため、ヘッドレスの飽和条件（敵が動かない・プレイヤーも動かない）では
  火力バランスを判定できない。闘気の解放頻度も敵密度に強く依存する（`maxGainPerSecond` が効くため）。
- 戦士のカタログは M8-C 時点で **active15 / passive4 / 進化8**。
  火・氷（各 30/4/18）の半分なので、同じ完成監査を行うのは Wave2 以降でカタログが揃ってから。
- 戦士 Wave1 の**体感**（跳躍の気持ちよさ・引き寄せの見た目・反撃の手応え・処刑の爽快感）は
  実ブラウザでしか評価できない。ヘッドレスのテストは「壊れていない」「上限を超えない」までしか見ていない。
- ヘッドレスハーネスは「敵が移動せず死なない」飽和条件であり、刻印起爆・分身の複製対象・炎上源といった
  BattleScene 側の相互作用も再現しない。**DPS の実測値は火力バランスの判定に使えない**
  （進化前後の比較は data 由来の項目差分で行っている）。
- ヘッドレス環境では `requestAnimationFrame` の間引き・非フォーカス自動一時停止のため、実時間ループ依存の計測が不安定。
- passive `ember_persist` は進化補助として要求されない（火は 18 進化中 14 件が active 補助）。
  `duration` modifier が実装から参照されるため死に passive ではないが、氷（passive 補助 4/4）とは設計が異なる。

## Browser verification status

**実ブラウザ（Phaser 実プレイ）確認は本環境では一度も実施していない。** 未実施の項目を「確認済み」と報告しない。

- 検証済み: Node 純ロジック（データ検証・監査・シミュレーション）＋ graphics 対応の最小 Phaser モックによるランタイムスモーク。
  **M8-B で追加した戦士のコードは、ヘッドレスで実際に駆動して命中・闘気・コンボ・体勢・保存まで確認している**
  （ただしそれは Phaser モック上であり、実描画・実操作ではない）。
- **未確認**（要ブラウザ・M8-B 分）:
  - 戦士の**実描画**（近接 arc の見え方・斬撃/衝撃/破片の演出・闘気ゲージ / コンボ表示 / 不屈 CD / ボス体勢ゲージの HUD）
  - **近接の当たり判定の体感**（arc の広さ・射程・向きの決まり方が操作感と合っているか）
  - **闘気解放の体感**（溜まる速さ・解放の強さ・回復量・持続）
  - **コンボの体感**（繋がり方・切れやすさ・閾値の効き）
  - **不屈**（瀕死からの立て直しが成立するか・45 秒 CD が長すぎ/短すぎないか）
  - **体勢崩し**（エリートのよろけ・**ボスの予告/突進を中断できること**・露出中の火力差）
  - **戦士向けオート移動**（密集へ近づく / 接敵距離を保つ / 瀕死で退く / ボス予告を避ける）
  - **F9 戦士検証パネル**の描画と操作、**F8 戦士分析**の表示
  - 戦士での **60FPS 維持**（low/medium/high/ultra × 敵100体 × 2倍速 × active8枠）
  - **保存/再開**（闘気・コンボ・不屈 CD・ボス体勢が残ること／再開直後に一斉発動しないこと）
  - **火/氷の非回帰の目視**（HUD に戦士要素が出ないこと・F9 が従来パネルであること・オート移動が従来どおりであること）
- **未確認**（要ブラウザ・M8-A 以前から継続）:
  - M8-A で挙動を変えた箇所（21 種の CD 復元・`eternal_pyre` / `solar_annihilation_array` の残響/分身 ほか）
  - M7-E で追加した F8 のジョブ別分析パネル・F10 の直近イベント履歴の描画
  - draft / evolution / burning / save / performance の手動チェック一式
- **未確認**（要ブラウザ・M8-B.1 分）:
  - 氷術師で **余寒残留 Lv1 を取得した直後**に冷気の減衰が緩くなること（F10 で冷気を付与して目視）
  - **Lv2〜Lv5 の各段**で段階的にさらに緩くなること
  - active / 進化の取得だけでは変わらないこと
  - **save → reload 後も同じ値**であること（リロードを繰り返しても倍率が二重にならない）
  - **pause → resume** で値が動かないこと
  - 氷術師 → 火の魔女 / 戦士 へジョブを切り替えたとき**前ジョブの乗率が残らない**こと
  - 取得時・リロード時・ジョブ切替時に **JS エラーが出ない**こと
- **未確認**（要ブラウザ・M8-C 分）:
  - 新 active10 / 進化5 の**実描画**（上段斬り・2 連斬り・処刑演出・跳躍と着地・進軍の軌跡・
    構えと反撃のフラッシュ・戦吼のリング・鎖の線・震脚の衝撃波・連撃の火花）
  - **処刑の体感**（通常敵が一撃で片付くこと／エリート・ボスが処刑されないこと）
  - **反撃の体感**（3 系統を持っても反撃演出が 1 つだけ出ること／構え中でもダメージは通ること）
  - **戦吼の体感**（バフの効き・押し返し・連打しても強くならないこと）
  - **移動系の体感**（跳躍の距離と着地の気持ちよさ・進軍の歩き方・引き寄せの滑らかさ・
    ボスが動かず自分が踏み込むこと・壁際で壁の外へ出ないこと）
  - **天墜崩撃を取っても地砕きが残り、地砕き自身の CD どおりに発動し続けること**
  - **Job Lv80** で 6 種だけ打撃が増え、弾は増えないこと
  - **保存/再開**（戦吼バフ・構えが短くなって復元されること／進行中の効果が二重化しないこと）
  - **F8 の戦士カタログ / Wave1 カウンタ**・**F9 の Wave1 セクションと追加操作**の描画
  - **F10 が M8-B から変わっていないこと**
  - 戦士での **60FPS 維持**（low/medium/high/ultra × 敵100体 × 2倍速 × active8枠 × Wave1 スキル）
- **未確認**（要ブラウザ・M8-C.1 分）:
  - 枠 4（転生前）で **40 レベルアップ前後に進化が 1 つ以上成立する**こと（体感）
  - 進化元の強化候補が Lv6〜7 で**出やすく感じる**こと
  - **進化を持たない active（突進斬り / 双牙斬 / 薙ぎ進軍 / 鎖鉤 / 震脚 / 怒涛連撃）も普通に出る**こと
  - 条件成立直後のレベルアップで**必ず進化候補が出る**こと
  - reroll / banish / skip が従来どおり効くこと
  - **save → reload で候補が変わらない**こと（引き直せない・pity を稼げない）
  - 天墜崩撃へ進化しても**地砕きがスキル欄に残る**こと
  - 3〜5 周回して **build が毎回同じにならない**こと
  - 枠 6 / 枠 8 でも悪化していないこと
  - **火 / 氷の周回で候補の出かたが従来どおり**であること（体感）
  - F8 の戦士分析に「戦士 進化導線（M8-C.1）」が出ること
- 手順書: `docs/test-guide.md` の **Milestone 8-C.1** 節（A〜I）／**Milestone 8-C** 節（A〜J）／
  **Milestone 8-B.1** 節（A〜G）／**Milestone 8-B** 節（A〜K）／**Milestone 8-A** 節（A〜H）／**Milestone 7-E** 節。
- 例外: M7-B.1 の氷エフェクトと敵停止のみ、ユーザーが実ブラウザで確認済み。

## Latest test results

- 実行日時点: Milestone 8-C.1 完了時（コミット `6f9b1de`）
- **テストスイート: 125 件（`tests/*.mjs` から共通土台 `frost-audit-common.mjs` / `flame-audit-common.mjs` /
  `warrior-common.mjs` / `status-passive-common.mjs` / `warrior-draft-sim.mjs` と `validate-data.mjs` を除く）
  → 全 125 通過・失敗 0**
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**
- M8-C.1 新規 9 スイート（アサーション数）:
  `warrior-evolution-guidance`（98）/ `warrior-slot4-evolution-rate`（74）/ `warrior-evolution-pity`（70）/
  `warrior-evolution-synergy`（109）/ `warrior-active-support-evolution`（28）/ `warrior-build-diversity`（78）/
  `warrior-draft-save-reload`（395）/ `warrior-draft-guidance-determinism`（37）/
  `warrior-draft-guidance-nonregression`（157）
- 更新した既存スイート: `warrior-draft-determinism`（閾値を復元し production 経路へ）/
  `warrior-wave1-draft`（guidance ON/OFF 比較を追加）/ `warrior-wave1-evolutions`（進化条件の不変を追加）/
  `three-job-wave1-nonregression`（guidance が火 / 氷へ漏れないことを追加）/ `validate-data`（guidance 検証）
- 共通ハーネス `tests/warrior-draft-sim.mjs`: **独自抽選器を作らず** production の
  `SkillDraftManager`（open / reroll / banish / skip / pity / synergy）・`SeededRandom`・
  `poolEligibility.memberAllowedForJob`・`SkillCatalog`・実 rarity・実進化条件だけを使う。
  5 戦略＋M8-B/M8-C 互換の素朴戦略。`Math.random` は 1 度も呼ばない。`HEAVY=1` で seed 数を増やせる。
- **非回帰**: 火 / 氷の候補列（300 seed）SHA-256 `15a8585c…` / `bd38bcf5…`、
  48 スキルのランタイムトレース `1f0f2c18…` / `029a44bd…` が **M8-A 時点と完全一致**。
  production と同じ ctx（`jobId` / `evolutionRecipes` 付き）でも候補列と**重み**まで一致することを確認済み。
- **決定論**: guidance の ON / OFF で cursor / levelUpSequence が 1 も変わらない（RNG 消費不変）。
  枠3種 × 戦略6種 × 120 seed の総合 hash `8114ee60f27d1aff…`。
- **保存 / 復元**: 枠 4/6/8 × 各 20 seed × 3 保存地点で候補列が完全一致。
  pity 境界・reroll / banish / skip をまたいでも一致。
- `src/**/*.js` すべて構文解析 OK（`node --check`）

### M8-C.1 で追加・変更した主要ファイル

- **新規（テスト 9 本 ＋ 共通ハーネス 1 本）**: `tests/warrior-draft-sim.mjs`（production 抽選器の共通ハーネス）、
  `warrior-evolution-guidance` / `warrior-slot4-evolution-rate` / `warrior-evolution-pity` /
  `warrior-evolution-synergy` / `warrior-active-support-evolution` / `warrior-build-diversity` /
  `warrior-draft-save-reload` / `warrior-draft-guidance-determinism` / `warrior-draft-guidance-nonregression`
- **新規（docs）**: `docs/warrior-evolution-guidance.md`（採用した補正の仕様）、
  `docs/warrior-draft-analysis-wave1.md`（修正前の実測分析・原因分類・不採用案）
- **変更（システム）**: `src/systems/SkillDraftManager.js`
  （`_guidanceMult()` / `_guidanceActive()` / `markGuidanceProgress()` / `guidancePityStep()` /
  `guidanceTelemetry()` / `setGuidanceConfig()` を追加、`serialize`/`restore` へ `guidanceStall` を加算的に追加）、
  `src/scenes/BattleScene.js`（draft へ `guidance` を渡す・`buildDraftCtx()` へ `jobId` / `evolutionRecipes`・
  `_guidanceRecipes()` を追加・`applyCandidate()` で guidance タグから pity をリセット・
  F8 の戦士分析へ「戦士 進化導線」セクションと警告 3 種・`finalizeTelemetry()` で集計）、
  `src/systems/CombatTelemetry.js`（`draftGuidance` ブロックと `noteDraftGuidance()` を追加）
- **変更（データ）**: `data/skill-config.json`（`guidance` ブロックの追加のみ。
  **skills / passives / evolutions / jobs / balance は 1 件も変更していない**）
- **変更（CI / 検証）**: `tests/validate-data.mjs`（guidance の検証・予約フィールド禁止の双方向チェック）、
  `.github/workflows/validate.yml`（9 ステップ追加）、既存 4 スイートの更新
- **変更（docs）**: `README.md`、`TODO.md`、`docs/project-state.md`、`docs/architecture.md`、
  `docs/data-format.md`、`docs/save-format.md`、`docs/test-guide.md`、`docs/jobs.md`、`docs/skills.md`、
  `docs/balance-testing.md`、`docs/warrior-design.md`

### M8-C で追加・変更した主要ファイル

- **新規（スキル 15 本）**: `ArmorBreakerSkill` / `TwinFangSlashSkill` / `ExecutionStrikeSkill` /
  `LeapSmashSkill` / `SweepingAdvanceSkill` / `CounterStanceSkill` / `WarCrySkill` / `ChainHookSkill` /
  `ShockwaveStompSkill` / `RelentlessComboSkill` / `SkullSplitterSkill` / `CrimsonExecutionSkill` /
  `WarGodRoarSkill` / `AdamantCounterSkill` / `HeavenCrushingDescentSkill`
- **新規（テスト 19 本）**: `warrior-wave1-catalog` / `warrior-wave1-pool` / `warrior-wave1-draft` /
  `warrior-wave1-evolutions` / `warrior-armor-breaker` / `warrior-execution` / `warrior-leap` /
  `warrior-sweeping` / `warrior-counter-arbitration` / `warrior-war-cry` / `warrior-chain-hook` /
  `warrior-relentless-combo` / `warrior-wave1-job80` / `warrior-wave1-runtime-save` /
  `warrior-wave1-determinism` / `warrior-wave1-quality-cap` / `warrior-wave1-cleanup` /
  `warrior-wave1-telemetry` / `three-job-wave1-nonregression`
- **新規（docs）**: `docs/warrior-wave1.md`、`docs/warrior-skill-matrix.md`
- **変更（システム）**: `src/systems/WarriorCombatSystem.js`
  （`applyWarCryBuff` / `beginCounterWindow` / `endCounterWindow` / `counterWindowOf` /
  `counterMitigation` / `consumeCounterEvent` / `executePolicy` / `noteExecute` / `noteMovement` /
  `noteKillHealBonus` / `serializeTimedBuffs` / `restoreTimedBuffs` を追加）、
  `src/scenes/BattleScene.js`（`preferredMeleeTarget` / `executeTarget` / `pullTarget` /
  `movePlayerTowards` / `bossTelegraphing` / `warriorPullConfig` を追加、`meleeStrike` へ
  `toughBonus` / `execute` / `maxExecutes` / `visualCap`、`onWarriorHit` を反撃の調停へ書き換え、
  F8 の戦士分析と F9 の戦士検証パネルへ Wave1 を追加）、
  `src/skills/WarriorSkillBase.js`（`applyEvolvedSemantics()` を追加）、
  `src/skills/UnyieldingFortressSkill.js`（反撃の調停へ移行・挙動は不変）、
  `src/systems/SkillManager.js`（REGISTRY 15 件）、
  `src/systems/CombatTelemetry.js`（`warrior` へ 14 キー・スキル別へ 5 キー）
- **変更（データ）**: `data/skills.json`（active10 追加・計 75 件）、
  `data/skill-evolutions.json`（進化5 追加・計 44 件）、`data/jobs.json`（warrior 15/4/8）、
  `data/balance.json`（`warrior.warCry` / `warrior.counter` / `warrior.execute` / `warrior.pull` ＋
  `skillCaps` 20 件追加・計 185 件）
- **変更（CI / 検証）**: `tests/validate-data.mjs`（M8-C ブロック）、
  `.github/workflows/validate.yml`（19 ステップ追加）、
  `tests/warrior-common.mjs`（`EXPECTED` を 15/4/8 へ・`skillSourceDeep()` 追加・
  新 combat API のモック追加・`nearestEnemy` をボス込みへ）、
  `tests/warrior-draft-determinism.mjs`（進化到達率のしきい値を枠別へ）、
  `tests/status-passive-nonregression.mjs`（戦士の期待規模を 15/4/8 へ）、
  `tests/warrior-active-skills.mjs` / `tests/warrior-evolutions.mjs` / `tests/warrior-catalog.mjs` /
  `tests/warrior-pool-eligibility.mjs` / `tests/warrior-cleanup.mjs` / `tests/warrior-runtime-save.mjs`
  （Wave1 の 15 スキルへ追随・構え系と active 補助への対応）
- **変更（docs）**: `README.md`、`TODO.md`、`docs/project-state.md`、`docs/skill-catalog.md`、
  `docs/warrior-design.md`、`docs/jobs.md`、`docs/skills.md`、`docs/game-design.md`、
  `docs/architecture.md`、`docs/data-format.md`、`docs/save-format.md`、`docs/test-guide.md`、
  `docs/balance-testing.md`

### M8-B.1 で追加・変更した主要ファイル

- **変更（システム）**: `src/scenes/BattleScene.js`
  （`_refreshStatusPassives()` をジョブ分離つきの完全再構築へ／`_refreshStatusPassivesIfNeeded()` を新設／
  メインループ・`applyCandidate`・`startBalancePlaytest`・F9 から gate 経由で呼ぶ／
  `_refreshWarriorMods()` に PassiveManager インスタンスの保険を追加）
- **新規（テスト）**: `tests/status-passive-common.mjs` ＋ 6 スイート
- **変更（CI）**: `.github/workflows/validate.yml`（6 ステップ追加）
- **変更（docs）**: `README.md`、`TODO.md`、`docs/project-state.md`、`docs/architecture.md`、
  `docs/save-format.md`、`docs/test-guide.md`、`docs/status-effects.md`、`docs/jobs.md`、`docs/balance-testing.md`

### M8-B で追加・変更した主要ファイル

- **新規（システム）**: `src/systems/WarriorCombatSystem.js`（闘気/コンボ/軽減/不屈/撃破回復/体勢の唯一の管理者）、
  `src/skills/WarriorSkillBase.js`（`WarriorSkillBase` / `WarriorEvolvedBase`）、`src/ui/WarriorHud.js`
- **新規（スキル 8 本）**: `GreatCleaveSkill` / `ShieldBashSkill` / `WhirlwindSlashSkill` / `ChargeSlashSkill` /
  `GroundSlamSkill` / `ThousandBladeDanceSkill` / `BloodstormWhirlwindSkill` / `UnyieldingFortressSkill`
- **新規（テスト）**: `tests/warrior-common.mjs` ＋ 17 スイート
- **新規（docs）**: `docs/warrior-design.md`
- **変更（システム）**: `src/scenes/BattleScene.js`（`isWarrior` / warrior 生成 / `meleeStrike` / `_meleeVisual` /
  `onWarriorDamage` / `onWarriorHit` / `_refreshWarriorMods` / `_applyWarriorMaxHp` / `computeWarriorAutoMove` /
  戦士 HUD / F9 戦士パネル / F8 戦士分析 / cleanup）、`src/systems/SkillManager.js`（REGISTRY 8 件）、
  `src/systems/PassiveManager.js`（getter 13 件）、`src/systems/JobModifierManager.js`（戦士 7 type ＋ getter）、
  `src/systems/CombatTelemetry.js`（`warrior` ブロック 30 キー＋スキル別 8 キー）、
  `src/systems/BattleManager.js`（`warriorState`）、`src/entities/Player.js`（軽減フック 1 行）、
  `src/entities/Enemy.js`（体勢フィールド＋stagger 減速）、`src/entities/Boss.js`（`applyPoiseStagger`）
- **変更（データ）**: `data/jobs.json`、`data/job-progression.json`、`data/skills.json`、`data/passives.json`、
  `data/skill-evolutions.json`、`data/skill-config.json`（`modifierKeys` 13 追加）、`data/balance.json`
  （`warrior` ブロック＋`skillCaps` 13 追加）
- **変更（CI / 検証）**: `tests/validate-data.mjs`（M8-B ブロック）、`.github/workflows/validate.yml`（17 ステップ追加）、
  `tests/flame-completion-catalog.mjs` / `frost-completion-catalog.mjs` / `passive-pool-audit.mjs`（3 ジョブ化へ追随）
- **変更（docs）**: `README.md`、`TODO.md`、`docs/project-state.md`、`docs/jobs.md`、`docs/skills.md`、
  `docs/skill-catalog.md`、`docs/game-design.md`、`docs/architecture.md`、`docs/data-format.md`、
  `docs/save-format.md`、`docs/test-guide.md`、`docs/balance-testing.md`

## Next milestone

**未定（次の指示待ち）。** 候補は以下。

1. **戦士のカタログ拡張 Wave2 以降**（active15 → 20 → 30 / 進化 8 → 13 → 18）。
   火・氷と同じ拡張手順・同じ検証基盤（`warrior-common.mjs` ＋ `warrior-draft-sim.mjs` ＋ Wave1 の 19 スイート
   ＋ M8-C.1 の 9 スイート）がそのまま使える。**拡張のたびに枠 4 の到達率が下がるので、
   `tests/warrior-slot4-evolution-rate.mjs` を必ず回すこと。**
2. **戦士 完成監査**（カタログが揃ってから。M7-E / M8-A と同じ 12 観点）。
3. **火と氷の属性反応** — 炎上⇄冷気/凍結の相互作用（付与時の source element を活用）。
4. **転生レガシー / ジョブ間継承**（`futureInheritanceSettings` / `extraAllowedIds` が拡張口）。
5. **周回長の拡張**（10分 / 15分 / 無限モード）・**追加の敵 / ボス / 難易度**。
6. **実ブラウザでの M7-E / M8-A / M8-B / M8-B.1 / M8-C / M8-C.1 手動確認**（`docs/test-guide.md` の該当節）—
   コード変更を伴わない検証タスク。**M8-C.1 の A（枠 4 での進化到達）・E（save/reload で候補が変わらない）は
   特に確認価値が高い。**

いずれも**指示された範囲のみ**実装し、未指定の先行実装はしない（`CLAUDE.md` の作業手順）。
