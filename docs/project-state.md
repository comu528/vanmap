# Project State

> Reincarnation Flame Survivor の**現在地**を 1 枚にまとめた引き継ぎ用ファイル。
> **各 Milestone 完了時に必ず更新する**（完了報告の要約・コミットID・テスト結果・次 Milestone）。
> compact 後・新セッション開始時は `CLAUDE.md` → `README.md` → `TODO.md` → 本ファイル → `git log -5 --oneline` の順で確認する。
>
> 最終更新: Milestone 8-A 完了時点

## Current branch

- ブランチ: **`claude/flame-witch-audit-m8a-xoh048`**（M8-A の指定ブランチ。指定なき限りここへコミット・プッシュ）
- 直近コミット:
  - `2cbdced` Milestone 8-A: 火の魔女 完成監査（CD保存漏れ/残響未発火/死にフィールド/未参照capの修正）
  - `338f25c` 環境整備: CLAUDE.md へ Compact Instructions を追記し docs/project-state.md を新規作成
  - `3e6c7ed` Milestone 7-E: 氷術師 完成監査（抽選率・進化到達率・全体バランス分析）
  - `3a3f9cc` Milestone 7-D ドキュメント更新: 氷術師 active30/進化18（カタログ完成）
  - `afc4401` Milestone 7-D: 氷術師のスキル拡張・最終波（active30種・進化18種）
- 作業ツリー: クリーン（未コミットの変更なし）

## Current milestone

- **Milestone 8-A（火の魔女 完成監査）完了・停止中。** 次の指示待ち。
- M8-A は監査 Milestone であり、新しい active / passive / 進化 / ジョブ / 状態異常 / 属性反応 / 敵 / ボス / 難易度を
  **一切追加していない**。監査と、そこで見つかった不具合の修正のみ。
- **氷術師（frost_mage）は数値・挙動・候補列・状態異常・保存・カタログとも 1 件も変更していない**
  （同 seed のドラフト候補列 300 seed と 48 スキルの実行トレースが変更前後で SHA-256 完全一致）。

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
| **M8-A** | **火の魔女 完成監査**（カタログ / プール分離 / 進化到達率 / 抽選シミュレーション / 死にコンテンツ / SkillAudit / 保存 / 決定論 / 炎上・DoT・爆発・共鳴 / cap / cleanup / telemetry）（`2cbdced`） |

## Job catalog counts

| ジョブ | id | 属性 | active | passive | evolution | Job Lv |
|--------|----|------|--------|---------|-----------|--------|
| 火の魔女 | `flame_witch` | fire | **30** | **4** | **18** | 1〜100 |
| 氷術師 | `frost_mage` | ice | **30** | **4** | **18** | 1〜100 |

- 合計（各ジョブ）: 52。`SkillCatalog.buildCatalog()` の issues は両ジョブとも **0**。
- active slot 4 → 6 → 8（転生で拡張）、passive slot 4。全 active は maxLevel 8、進化は単一形態（Lv 固定）。
- Job Lv80「発射数+1」対象は**明示 flag（`lv80ProjectileTarget:true`）のみ**。
  火 6 種（`fireball` `flame_lance` `scatter_flame` `homing_wisp` `ricochet_ember` `core_overdrive`）/
  氷 6 種（`frost_shard` `glacial_lance` `icicle_volley` `rime_boomerang` `polar_star` `glacial_spear_rain`）。
  **進化 18 種は両ジョブとも全て対象外。**
- 火 passive 4 種: `power_amp` / `swift_cast` / `scorch_expand` / `ember_persist`。
- 氷 passive 4 種: `frost_amplification` / `rapid_freezing` / `frozen_expansion` / `lingering_cold`。
- 火の進化 18 件は **すべて base Lv8 ＋ 補助 Lv4・分岐なし**。うち **active 補助 14 件 / passive 補助 4 件**。
  進化対象 active 18 種 / 非対象 12 種。
- 一覧・進化対応表は `docs/skill-catalog.md`（Milestone 7-E 節 / Milestone 8-A 節）。

## Save version

- **`save_version` = v6**（M8-A も加算的変更のみでスキーマ不変・移行処理不要）。
- 保存先: localStorage（browser save）＋ folder save / import / export / backup / conflict resolution / multi-tab（SaveCoordinator）。
- `active_run` に途中再開用の状態を保持: `jobId` / `jobElement` / `initialSkill` / 各 pool / `jobLevelAtStart` /
  `resolvedJobModifiers` / `skillRuntime` / status RNG cursor / boss frostbreak state。
- **M8-A で `skillRuntime` に載るスキルが増えた**（火の魔女 48 件すべて）。既存フィールドへの加算的変更で移行不要。
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
  **未参照 cap は 0 件**（M8-A で火由来 5 件を削除。以後 `validate-data` がエラーにする）。
- **主発動イベント（recordCast）**: 攻撃サイクル単位で 1 回だけ。常設型は `config.castPulseMs` でスロットル
  （`orbiting_flame` / `fire_spirit` / `eternal_pyre` / `solar_annihilation_array`）。これが
  `recordCast → _onSkillCast → jobMods.registerCast → _triggerEcho`（残響）の唯一の起点。
- **runtimeState は全件**: 火・氷とも全 active / 進化が `serializeState`/`restoreState` を持つ
  （常設型は CD ではなく位相・スロットル・各インスタンスのタイマーを保存し、設置物本体は保存しない＝二重生成しない）。
- **表示とロジックの分離**: `StatusVisualManager` / `BossFrostbreakDisplay` / `StatusDebugPanel` は
  イベントを購読するだけで、判定・ダメージ・RNG cursor に影響しない。
- **テレメトリ**: `CombatTelemetry` → `RunBalanceSummary`。debugRun は通常統計と完全分離。**外部送信は禁止**。
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
| 8 | **M8-A** | **火の魔女スキル 21 種の CD が保存されず、reload で全回復して無料発動できていた**（#1 と同じクラスの欠陥が火側に残っていた）。48 件すべてが runtimeState を保存するよう修正 | `2cbdced` |
| 9 | **M8-A** | **`eternal_pyre` / `solar_annihilation_array` が `recordCast` を一度も呼ばず、data で宣言した残響・分身が一度も発生しなかった**（進化元では発生する＝進化で機能を失う逆転）。主発動をスロットル記録し `echoPolicy`/`clonePolicy` を `custom` へ是正、`eternal_pyre` に `echoCast()` を実装 | `2cbdced` |
| 10 | **M8-A** | 死にパラメータ 21 件（旧 `evolution` ブロック 3 / `bloodfire_pact.buffDamage`・`buffMs` / `four_sided_inferno.burnMs` ほか）→ 実装へ接続 13 件・削除 8 件で **0 件**へ | `2cbdced` |
| 11 | **M8-A** | M7-E から残っていた**火由来の未参照 quality cap 5 件**を削除（重複 or 参照すると品質で火力が変わるもの）。`SkillBase._initCd` も削除 | `2cbdced` |
| 12 | **M8-A** | `eternal_pyre.spreadInfection()` が `enemyPool.forEachActive()` で毎 tick 全敵を総当たりしていたのを炎上索引経由へ（性能改善・対象集合は同じ） | `2cbdced` |
| 13 | **M8-A** | `AshLegionSkill` / `SolarAnnihilationArraySkill` の `serializeState()` が `{}` を返すだけで `restoreState` も無く、`AshDoppelgangerSkill` は保存値 `spawned` を復元していなかった（再開直後に全ユニットが無料で一斉発動） | `2cbdced` |

## Non-regression requirements

以後の作業で**壊してはいけない**もの。

- 火の魔女: active30 / passive4 / evolution18・**同 seed の候補列**・48 件の runtimeState 保存・
  主発動スロットル（`castPulseMs`）・死にフィールド 0・未参照 cap 0
- 氷術師: active30 / passive4 / evolution18・数値・挙動・候補列・状態異常・保存・カタログ（**M8-A で完全一致を確認済み**）
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
M7-E の「火由来の未参照 cap 5 件」は解消済み。

### 既知の問題 / 制約

- 抽選シミュレーションの結果は **level-up 回数に強く依存**する（火: 30 回で平均 0.24、60 回で 2.20、90 回で 2.37）。
  比較は同じ `levelUps` で行う。
- ヘッドレスハーネスは「敵が移動せず死なない」飽和条件であり、刻印起爆・分身の複製対象・炎上源といった
  BattleScene 側の相互作用も再現しない。**DPS の実測値は火力バランスの判定に使えない**
  （進化前後の比較は data 由来の項目差分で行っている）。
- ヘッドレス環境では `requestAnimationFrame` の間引き・非フォーカス自動一時停止のため、実時間ループ依存の計測が不安定。
- passive `ember_persist` は進化補助として要求されない（火は 18 進化中 14 件が active 補助）。
  `duration` modifier が実装から参照されるため死に passive ではないが、氷（passive 補助 4/4）とは設計が異なる。

## Browser verification status

**実ブラウザ（Phaser 実プレイ）確認は本環境では一度も実施していない。** 未実施の項目を「確認済み」と報告しない。

- 検証済み: Node 純ロジック（データ検証・監査・シミュレーション）＋ graphics 対応の最小 Phaser モックによるランタイムスモーク。
- **未確認**（要ブラウザ）:
  - 実際の描画・視認性・当たり判定・体感バランス・60FPS 維持（low/medium/high/ultra × 敵100体 × 2倍速 × active8枠）
  - M8-A で挙動を変えた箇所: **21 種の CD 復元**（再開直後に無料発動しないこと）・
    `eternal_pyre` / `solar_annihilation_array` の**残響/分身**・`ash_doppelganger` / `ash_legion` の
    タイマー復元・`hellfire_mine_network` の 1 爆発あたり刻印上限・`apocalypse_chain` の拡散分散
  - M7-E で追加した F8 のジョブ別分析パネル・F10 の直近イベント履歴の描画
  - draft / evolution / burning / save / performance の手動チェック一式
- 手順書: `docs/test-guide.md` の **Milestone 8-A** 節（A〜H）／**Milestone 7-E** 節（`?debug=1` で F8 / F9 / F10）。
- 例外: M7-B.1 の氷エフェクトと敵停止のみ、ユーザーが実ブラウザで確認済み。

## Latest test results

- 実行日時点: Milestone 8-A 完了時（コミット `2cbdced`）
- **テストスイート: 75 件（`tests/*.mjs` から共通土台 `frost-audit-common.mjs` / `flame-audit-common.mjs` を除く）→ 全 75 通過・失敗 0**
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**
- `src/**/*.js` 161 ファイルすべて構文解析 OK
- M8-A 新規 12 スイート:
  `flame-completion-catalog`（425）/ `flame-evolution-reachability`（417）/ `flame-draft-balance`（230）/
  `flame-evolution-distribution`（443）/ `flame-dead-content-audit`（3136）/ `flame-complete-skill-audit`（1044）/
  `flame-complete-runtime-save`（512）/ `flame-complete-determinism`（335）/ `flame-status-balance`（49）/
  `flame-quality-cap-audit`（1319）/ `flame-cleanup-audit`（383）/ `flame-telemetry-audit`（210）
- 主要な非回帰スイート: `passive-pool-audit` / `status-save-nonregression` / `status-visibility-nonregression` /
  `draft-balance-simulation` / `combat-telemetry` / `frost-cooldown-save` / `frost-*` 監査 12 本
- 監査の主要結果: 他ジョブ混入 0 / 不正候補 0 / 重複候補 0 / slot 違反 0 / 不正進化 0 / 進化後の元 active 再提示 0 /
  提示 0・取得 0 の active・passive・進化 0 / 到達不能進化 0 / 死にパラメータ 0 / 未参照 cap 0 /
  `FLAME_*` 警告 0 / 炎上索引の残留 0 / 二次爆発 > 一次爆発 0 / RNG drift 0
- 進化到達率（evolution-first・200 seed・60 level-up）: slot4 ≥1=90.0%/平均1.44、slot6 ≥1=96.0%/≥2=78.5%/平均2.20、
  slot8 ≥1=97.0%/≥2=78.5%/平均2.29 — **M7-E と同じ 9 基準をすべて達成**
- frost 非回帰: ドラフト候補列（300 seed）と 48 スキル実行トレースの SHA-256 が**変更前後で完全一致**
- 重い計測: `HEAVY=1 node tests/flame-draft-balance.mjs`（500 seed）/ `HEAVY=1 node tests/flame-evolution-distribution.mjs`

### M8-A で追加・変更した主要ファイル

- 新規: `src/systems/FlameBalanceWarnings.js`、`tests/flame-audit-common.mjs` ＋ 監査テスト 12 本、
  `docs/flame-completion-audit.md`、`docs/flame-draft-analysis.md`、`docs/flame-balance-report.md`
- 変更（システム）: `src/skills/SkillBase.js`（`_initCd` 削除）、`src/entities/Projectile.js`（`rampMax`）、
  `src/scenes/BattleScene.js`（`onKillExtra` / `rampMax` / 刻印拡散の data 駆動化）
- 変更（スキル 27 本）: CD 保存追加 21 本（`Fireball` `FlamePillar` `BurningTrail` `OrbitingFlame` `Meteor`
  `FlameLance` `ScatterFlame` `HomingWisp` `ChainFlame` `LavaBomb` `FlameVortex` `FireSpirit` `DetonationMark` /
  `InfernalBarrage` `PurgatoryEruption` `EternalPyre` `ThousandFlameLances` `HundredWispParade` `SolarCoreCollapse`
  `InfernalVortexWheel` `ApocalypseChain`）＋ `AshDoppelganger` `AshLegion` `SolarAnnihilationArray`
  `BloodfirePact` `HellfireMineNetwork` `HexagramInfernoArray`
- 変更（データ）: `data/skills.json`、`data/skill-evolutions.json`、`data/balance.json`
- 変更（CI / 検証）: `tests/validate-data.mjs`（M8-A ブロック）、`.github/workflows/validate.yml`（12 ステップ追加）、
  `tests/fire-skills-wave2.mjs` / `fire-skills-wave3.mjs` / `new-fire-skills.mjs` / `frost-cooldown-save.mjs`（削除した cap・CD 保存に追随）

## Next milestone

**未定（次の指示待ち）。** 候補は以下。

1. **火と氷の属性反応** — 炎上⇄冷気/凍結の相互作用（付与時の source element を活用）。両ジョブのカタログと監査が揃った今が設計時期。
2. **3 人目のジョブ**（雷/毒 など新属性・`StatusEffectManager` に新状態を追加）。プール分離・状態異常基盤は複数ジョブ対応済み。
3. **転生レガシー / ジョブ間継承**（`futureInheritanceSettings` / `extraAllowedIds` が拡張口）。
4. **周回長の拡張**（10分 / 15分 / 無限モード）・**追加の敵 / ボス / 難易度**。
5. **実ブラウザでの M7-E / M8-A 手動確認**（`docs/test-guide.md` の該当節）— コード変更を伴わない検証タスク。

いずれも**指示された範囲のみ**実装し、未指定の先行実装はしない（`CLAUDE.md` の作業手順）。
