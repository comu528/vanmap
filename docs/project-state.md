# Project State

> Reincarnation Flame Survivor の**現在地**を 1 枚にまとめた引き継ぎ用ファイル。
> **各 Milestone 完了時に必ず更新する**（完了報告の要約・コミットID・テスト結果・次 Milestone）。
> compact 後・新セッション開始時は `CLAUDE.md` → `README.md` → `TODO.md` → 本ファイル → `git log -5 --oneline` の順で確認する。
>
> 最終更新: Milestone 8-B 完了時点

## Current branch

- ブランチ: **`claude/funny-heisenberg-frhgq9`**（`CLAUDE.md` の継続ブランチ。指定なき限りここへコミット・プッシュ）
- 直近コミット:
  - `4c8bd10` Milestone 8-B: 戦士 基盤実装（active5/passive4/進化3・闘気/コンボ/強靱/不屈/体勢崩し）
  - `ec503fe` docs: M8-A 取り込み後の継続ブランチを docs/project-state.md へ反映
  - `2846906` Milestone 8-A ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `bca7ec3` Milestone 8-A: 火の魔女 完成監査（CD保存漏れ/残響未発火/死にフィールド/未参照capの修正）
  - `338f25c` 環境整備: CLAUDE.md へ Compact Instructions を追記し docs/project-state.md を新規作成
- 作業ツリー: クリーン（未コミットの変更なし）

## Current milestone

- **Milestone 8-B（戦士 基盤実装）完了・停止中。** 次の指示待ち。
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
| **戦士** | **`warrior`** | **physical** | **5** | **4** | **3** | **1〜100** |

- 合計: 火 52 / 氷 52 / **戦士 12**。`SkillCatalog.buildCatalog()` の issues は **3 ジョブとも 0**。
- active slot 4 → 6 → 8（転生で拡張）、passive slot 4。全 active は maxLevel 8、進化は単一形態（Lv 固定）。
- Job Lv80「発射数+1」対象は**明示 flag（`lv80ProjectileTarget:true`）のみ**。
  火 6 種（`fireball` `flame_lance` `scatter_flame` `homing_wisp` `ricochet_ember` `core_overdrive`）/
  氷 6 種（`frost_shard` `glacial_lance` `icicle_volley` `rime_boomerang` `polar_star` `glacial_spear_rain`）。
  **進化 18 種は両ジョブとも全て対象外。**
- 火 passive 4 種: `power_amp` / `swift_cast` / `scorch_expand` / `ember_persist`。
- 氷 passive 4 種: `frost_amplification` / `rapid_freezing` / `frozen_expansion` / `lingering_cold`。
- **戦士 passive 4 種**: `brute_force`（剛力）/ `heavy_armor`（重装）/ `combat_instinct`（戦闘本能）/ `bloodlust`（血気）。
- **戦士 active 5 種**: `great_cleave`（初期）/ `shield_bash` / `whirlwind_slash` / `charge_slash` / `ground_slam`。
  **全て近接**（自分中心の円 or 前方 arc）で、画面を横断する斬撃波・弾を生成しない。
- **戦士 evolution 3 種**: `thousand_blade_dance`（大薙ぎ+戦闘本能）/ `bloodstorm_whirlwind`（旋風斬り+血気）/
  `unyielding_fortress`（盾撃+重装）。**進化を持たない active は `charge_slash` `ground_slam` の 2 種**。
- **戦士の Lv80「打撃数+1」対象は 3 種**（`great_cleave` `shield_bash` `ground_slam`）。進化 3 種は対象外。
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
- **M8-B で `active_run.warriorState` を 1 キー追加**（戦士周回のみ・他ジョブは `null`）。
  闘気 / コンボ / 猶予 / 解放残り / 回復残り / 不屈 CD・発動回数 / ボス体勢（ゲージ・崩し回数・しきい値倍率）/
  突進の軽減窓 / 周回テレメトリ を復元する ＝ **再読込で初期化して稼げない**。
  一方 **cast 予算・同一敵の命中記録・突進の途中状態は意図的に復元しない**（古い敵参照を持たない／無料再ダッシュを防ぐ）。
- 戦士 8 スキル（active5 + 進化3）すべてが `skillRuntime` に載る（最低でも `cdLeft`）。
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
| 14 | **M8-B** | 実装中に作り込みかけた**死にフィールド 2 件を作らずに済ませた**: passive `heavy_armor` の `knockbackResist`（プレイヤーがノックバックされる仕組みが存在しない）と `charge_slash.levels[].visual`（`visualScale()` を使わない）。data・`modifierKeys`・`balance.warrior.mitigation` から削除し、「予約値として残さない」原則を維持 | `4c8bd10` |

## Non-regression requirements

以後の作業で**壊してはいけない**もの。

- 火の魔女: active30 / passive4 / evolution18・**同 seed の候補列**・48 件の runtimeState 保存・
  主発動スロットル（`castPulseMs`）・死にフィールド 0・未参照 cap 0
- 氷術師: active30 / passive4 / evolution18・数値・挙動・候補列・状態異常・保存・カタログ（**M8-A / M8-B で完全一致を確認済み**）
- **戦士: active5 / passive4 / evolution3**・近接のみ（弾を撃たない）・闘気の 3 層上限・軽減 70% クランプ・
  撃破回復の毎秒上限・不屈の CD・エリート stagger 免疫・ボス体勢しきい値の上昇と頭打ち・
  残響/分身の対象外・8 スキルすべての CD 保存
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
- **`tests/three-job-nonregression.mjs` のハッシュ 4 種**（火/氷の候補列・火/氷のランタイムトレース）。
  火・氷を触ったら必ずここが落ちる。落ちたら「意図した変更か」を必ず確認すること。

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
M7-E の「火由来の未参照 cap 5 件」は解消済み。**戦士は M8-B 時点で警告 0 件**
（active5 / passive4 / 進化3 すべてが 400 seed の初回候補で出現し、進化 1 種以上の到達率は
active枠4 / 40 レベルアップで 92.5%、枠6 / 60 レベルアップで 100.0%）。

### M8-B で残した既知の問題（修正していない）

| 項目 | 内容 | 残した理由 |
|------|------|-----------|
| `_refreshStatusPassives()` の呼び出し漏れ | 通常のレベルアップで passive を取得したとき `BattleScene._refreshStatusPassives()` が呼ばれない（呼ばれるのは周回開始時と F9 デバッグ操作時のみ）。氷 passive「余寒残留」の `chillDecayMult` / `iceStatusDurationMult` が周回途中の取得で反映されない可能性がある | **M8-B の絶対条件「氷術師の数値・挙動を変更しない」に抵触する**ため。修正するなら氷術師の挙動が変わる Milestone で行う。戦士側は同じ問題を避けるため `_refreshWarriorMods()` が `passives.version` を毎フレーム見て差分再計算する設計にしてある |

### 既知の問題 / 制約

- 抽選シミュレーションの結果は **level-up 回数に強く依存**する（火: 30 回で平均 0.24、60 回で 2.20、90 回で 2.37）。
  比較は同じ `levelUps` で行う。
- **戦士は「接敵し続けられるか」が火力を左右する**ため、ヘッドレスの飽和条件（敵が動かない・プレイヤーも動かない）では
  火力バランスを判定できない。闘気の解放頻度も敵密度に強く依存する（`maxGainPerSecond` が効くため）。
- 戦士のカタログは M8-B 時点で **active5 / passive4 / 進化3** と小さい。
  火・氷（各 30/4/18）と同じ完成監査を行うのはカタログが揃ってから。
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
- 手順書: `docs/test-guide.md` の **Milestone 8-B** 節（A〜K）／**Milestone 8-A** 節（A〜H）／**Milestone 7-E** 節。
- 例外: M7-B.1 の氷エフェクトと敵停止のみ、ユーザーが実ブラウザで確認済み。

## Latest test results

- 実行日時点: Milestone 8-B 完了時（コミット `4c8bd10`）
- **テストスイート: 92 件（`tests/*.mjs` から共通土台 `frost-audit-common.mjs` / `flame-audit-common.mjs` /
  `warrior-common.mjs` を除く）→ 全 92 通過・失敗 0**
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**
- M8-B 新規 17 スイート:
  `warrior-catalog`（327）/ `warrior-pool-eligibility`（191）/ `warrior-draft-determinism`（72）/
  `warrior-fury`（52）/ `warrior-combo`（56）/ `warrior-recovery`（41）/ `warrior-unyielding`（43）/
  `warrior-poise`（61）/ `warrior-active-skills`（100）/ `warrior-evolutions`（115）/ `warrior-job-level`（88）/
  `warrior-runtime-save`（100）/ `warrior-save-determinism`（6）/ `warrior-quality-cap`（233）/
  `warrior-cleanup`（76）/ `warrior-telemetry`（147）/ **`three-job-nonregression`（312）**
- M8-B で更新した既存スイート 3 件（3 ジョブ化に伴う前提の緩和・判定の一般化）:
  `flame-completion-catalog` / `frost-completion-catalog`（passive の「火 XOR 氷」→「火と氷へ同時に適格でない」）、
  `passive-pool-audit`（進化の所属ジョブを基礎スキルの `jobs` から決定）
- **火 / 氷の非回帰**（`three-job-nonregression`）:
  - ドラフト候補列（300 seed）SHA-256 — 火 `15a8585c…` / 氷 `bd38bcf5…` が **M8-A 時点と完全一致**
  - 48 スキルの実行トレース SHA-256 — 火 `1f0f2c18…` / 氷 `029a44bd…` が **M8-A 時点と完全一致**
  - 保存スナップショットの既存キー 33 件が全て残存し、**追加キーは `warriorState` の 1 件のみ**
  - 火 / 氷の active・passive に `physical` / `warrior` の混入 0、進化条件に戦士 passive の要求 0
  - `modifierKeys` は追加のみ（既存 11 キー＋火/氷 passive が参照するキーが全て残存）
- 戦士の主要な監査結果: 他ジョブ混入 0 / 提示 0 の active・passive 0 / 死にフィールド 0 / 未参照 cap 0 /
  弾生成 0（近接のみ）/ cast 水増し 0 / 破棄後の遅延実行 0 / 内部 Map の無制限成長 0 / 外部通信 0
- 戦士の進化到達率（実抽選シミュレーション・200 runs）: active枠4 / 40 レベルアップで **92.5%**、
  active枠6 / 60 レベルアップで **100.0%**（進化 1 種以上）
- `src/**/*.js` すべて構文解析 OK（`node --check`）

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

1. **戦士のカタログ拡張**（active5 → 10 → 20 → 30 / 進化も段階拡張）。火・氷と同じ拡張手順・同じ検証基盤が使える。
   闘気・コンボ・体勢という土台が揃ったので、以後は「その上に乗るスキル」を足すだけで済む。
2. **戦士 完成監査**（カタログが揃ってから。M7-E / M8-A と同じ 12 観点）。
3. **火と氷の属性反応** — 炎上⇄冷気/凍結の相互作用（付与時の source element を活用）。
4. **転生レガシー / ジョブ間継承**（`futureInheritanceSettings` / `extraAllowedIds` が拡張口）。
5. **周回長の拡張**（10分 / 15分 / 無限モード）・**追加の敵 / ボス / 難易度**。
6. **実ブラウザでの M7-E / M8-A / M8-B 手動確認**（`docs/test-guide.md` の該当節）— コード変更を伴わない検証タスク。

いずれも**指示された範囲のみ**実装し、未指定の先行実装はしない（`CLAUDE.md` の作業手順）。
