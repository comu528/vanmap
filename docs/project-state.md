# Project State

> Reincarnation Flame Survivor の**現在地**を 1 枚にまとめた引き継ぎ用ファイル。
> **各 Milestone 完了時に必ず更新する**（完了報告の要約・コミットID・テスト結果・次 Milestone）。
> compact 後・新セッション開始時は `CLAUDE.md` → `README.md` → `TODO.md` → 本ファイル → `git log -5 --oneline` の順で確認する。
>
> 最終更新: Milestone 7-E 完了時点

## Current branch

- ブランチ: **`claude/funny-heisenberg-frhgq9`**（指定なき限りここへコミット・プッシュ）
- 直近コミット:
  - `3e6c7ed` Milestone 7-E: 氷術師 完成監査（抽選率・進化到達率・全体バランス分析）
  - `3a3f9cc` Milestone 7-D ドキュメント更新: 氷術師 active30/進化18（カタログ完成）
  - `afc4401` Milestone 7-D: 氷術師のスキル拡張・最終波（active30種・進化18種）
  - `303c391` Milestone 7-C 追加監査: bossGaugeMult を実際にボス氷砕ゲージへ適用（死んだ成長項目を修正）
  - `8ad5ec2` Milestone 7-C ドキュメント更新: 氷術師 active25/進化13
- 作業ツリー: クリーン（未コミットの変更なし）

## Current milestone

- **Milestone 7-E（氷術師 完成監査）完了・停止中。** 次の指示待ち。
- M7-E は監査 Milestone であり、新しい active / passive / 進化 / ジョブ / 状態異常 / 属性反応 / 敵 / ボス / 難易度を
  **一切追加していない**。監査と、そこで見つかった不具合の修正のみ。

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
| **M7-E** | **氷術師 完成監査**（カタログ / プール分離 / 進化到達率 / 抽選シミュレーション / 死にコンテンツ / 保存 / 決定論 / 状態異常 / cap / cleanup / telemetry）（`3e6c7ed`） |

## Job catalog counts

| ジョブ | id | 属性 | active | passive | evolution | Job Lv |
|--------|----|------|--------|---------|-----------|--------|
| 火の魔女 | `flame_witch` | fire | **30** | **4** | **18** | 1〜100 |
| 氷術師 | `frost_mage` | ice | **30** | **4** | **18** | 1〜100 |

- 合計（氷術師）: 52。`SkillCatalog.buildCatalog()` の issues は両ジョブとも **0**。
- active slot 4 → 6 → 8（転生で拡張）、passive slot 4。全 active は maxLevel 8、進化は単一形態（Lv 固定）。
- Job Lv80「発射数+1」対象は**明示 flag（`lv80ProjectileTarget:true`）のみ**。
  火 6 種 / 氷 6 種（`frost_shard` `glacial_lance` `icicle_volley` `rime_boomerang` `polar_star` `glacial_spear_rain`）。
  **進化 18 種は全て対象外。**
- 氷 passive 4 種: `frost_amplification` / `rapid_freezing` / `frozen_expansion` / `lingering_cold`。
- 一覧・進化対応表は `docs/skill-catalog.md`（Milestone 7-E 節）。

## Save version

- **`save_version` = v6**（M7-E も加算的変更のみでスキーマ不変・移行処理不要）。
- 保存先: localStorage（browser save）＋ folder save / import / export / backup / conflict resolution / multi-tab（SaveCoordinator）。
- `active_run` に途中再開用の状態を保持: `jobId` / `jobElement` / `initialSkill` / 各 pool / `jobLevelAtStart` /
  `resolvedJobModifiers` / `skillRuntime` / status RNG cursor / boss frostbreak state。
- 詳細は `docs/save-format.md`。

## Important architecture

- **決定論**: `SeededRandom`（mulberry32）。draft RNG / status RNG / combat・skill RNG を**分離**。
  ゲームプレイ判定に `Math.random` / `Date.now` / `performance.now` を使わない。
- **抽選の正**: `SkillDraftManager`（production）。カタログ表示・シミュレーション・テストは
  **`poolEligibility.memberAllowedForJob` を単一の正**として共有する。`jobs` 未指定を暗黙の共通扱いにしない
  （明示共通は `isCommon:true` か `jobs:["*"]` のみ）。
- **状態異常**: `data/status-effects.json` → `StatusEffectRegistry` → `StatusEffectManager` / `FreezeSystem`。
  正式状態は **5 種**（burning / chill / frozen / freeze_immunity / frostbreak_vulnerability）。
  ボスは通常凍結せず**氷砕ゲージへ変換**。粉砕は非再帰（`isShatter`）。
- **skill-local マーカー**: 氷印 / 氷棺は正式 status ではなく `Enemy._iceSeal` / `_iceHitCount`（`reset()` でクリア）。
  `StatusEffectRegistry` へ登録しない（`validate-data` が誤登録を検出）。
- **`bossGaugeMult`**: `dealDamage`/`damageArea`/`Projectile` → `StatusEffectManager.applyIceHit` の**ボス分岐のみ**で
  `addBossGauge` の量へ 1 回だけ乗る。damage / chill / proc / 通常敵 / 火には掛からない。
- **上限は二層**: 進化ごとの `safetyCaps`（`EvolvedSkillBase.cap()`・絶対上限）と
  `balance.json` の `skillCaps`（`combat.skillCap()` / `frameBudget()`・**品質別** low ≤ medium ≤ high ≤ ultra）。
- **表示とロジックの分離**: `StatusVisualManager` / `BossFrostbreakDisplay` / `StatusDebugPanel` は
  `StatusEffectManager` のイベントを購読するだけで、判定・ダメージ・RNG cursor に影響しない。
- **テレメトリ**: `CombatTelemetry` → `RunBalanceSummary`。debugRun は通常統計と完全分離。**外部送信は禁止**。
- **監査基盤**: `SkillCatalog` / `SkillAudit` / `CastPolicy` / `DraftBalanceAnalyzer` / `BalanceWarnings` /
  **`FrostBalanceWarnings`（M7-E 新規・FROST_* 30 コード・ローカルのみ）** / `BalancePlaytest`（F8）。
- **死にフィールド禁止**: 宣言した Lv 成長項目・quality cap は**必ず実装で参照する**か **data から削除する**。
  「予約値」として残さない（`validate-data.mjs` の M7-E ブロックがエラーにする）。

## Fixed critical bugs

| # | Milestone | 内容 | コミット |
|---|-----------|------|----------|
| 1 | M7-A 後 | 氷術師スキルの CD が保存されず、reload で全回復・無料 cast・field/wall/domain の二重生成が起きていた。`skillRuntime` 経路（`BattleManager.buildRunSnapshot` → `SkillManager.serializeRuntime` → `active_run.skillRuntime` → `restoreRuntime`）で修正 | `bad8bd4` |
| 2 | M7-B 後 | 火 passive 4 種が氷術師のドラフトへ混入していた（`isCommon:true`＋`jobs:[]`＋`pool.includes \|\| isCommon`）。`poolEligibility.memberAllowedForJob` へ判定を一元化し、`passiveSkillPool` を抽選の正とした | `9eb7277` |
| 3 | M7-C 後 | `bossGaugeMult` が data にあるのにコードから一度も参照されない**死んだ成長項目**だった（frozen_clock / zero_hour_world / everlasting_white_mist）。ボス氷砕ゲージのみへ 1 回適用する共通経路を実装し、`validate-data` に未使用検出を追加 | `303c391` |
| 4 | M7-E | 死にパラメータ 6 件（`crystal_bloom.interval`→`cooldown` / `polar_star.impactDamage` / 氷封・氷棺の `frozenDamageBonus` / `heaven_piercing_glacier.freeze.baseChance` / `crystal_sentinel_legion.pulseProc` 削除） | `3e6c7ed` |
| 5 | M7-E | `heaven_piercing_glacier` / `absolute_zero_ray` の `bossGauge.multiplier` が `chillAmount` へ乗算され、**通常敵の冷気まで増えていた**（48→30 / 12→8 へ是正。ボスのゲージ量は不変） | `3e6c7ed` |
| 6 | M7-E | `echoPolicy`/`clonePolicy` が `custom` なのに実装が無く `fire()` 全体を無料再発動していた 3 件（`absolute_zero_ray` / `world_end_avalanche` / `continental_glacier_rush`） | `3e6c7ed` |
| 7 | M7-E | 未参照 quality cap 11 件を実装へ接続・重複/接続不能な 4 件を削除・名前違い 1 件（`CrystalSentinelLegionSkill` が砲台数に per-frame 氷線予算を使っていた）を解消 | `3e6c7ed` |

## Non-regression requirements

以後の作業で**壊してはいけない**もの。

- 火の魔女: active30 / passive4 / evolution18・既存数値・挙動・**同 seed の候補列**（`passive-pool-audit.mjs` の 300 seed 比較）
- 氷術師: active30 / passive4 / evolution18
- passive のジョブプール分離／`poolEligibility.memberAllowedForJob` が単一の正／`jobs` 未指定を暗黙共通にしない
- active slot 4→6→8・passive slot 4・Job Lv1〜100・Job XP・熟練度
- 進化 / 転生 / 残り火 / 魂炎 / 難易度
- F8（Balance Playtest ＋ ジョブ別分析）/ F9（氷術師デバッグ）/ F10（状態異常デバッグ）
- SkillCatalog / SkillAudit / DraftBalanceAnalyzer / CombatTelemetry / BalanceWarnings / FrostBalanceWarnings
- StatusEffectManager / StatusVisualManager / FreezeSystem・chill / slow / frozen / immunity / shatter / frostbreak
- `bossGaugeMult` の共通経路（ボス氷砕ゲージのみ 1 回）
- burning / 灼熱共鳴 / 万象炎鳴
- SpatialGrid / PoolManager / quality cap（low ≤ medium ≤ high ≤ ultra・正数・未参照ゼロ）
- browser save / folder save / import / export / backup / 競合解決 / multi-tab
- `active_run` / `skillRuntime` / status RNG cursor（**RNG drift 0**）
- `save_version` = **v6**
- 外部送信の禁止（telemetry / warnings はすべてローカル）

## Open warnings

修正せず**理由を記録して残している**もの（`docs/frost-balance-report.md` に詳細）。

| 警告 | 内容 | 理由 |
|------|------|------|
| `FROST_EVOLUTION_LOW_RATE slot8:atLeast1` | evolution-first・active枠8 の「進化1個以上」が **94.0%**（基準 95%） | 枠が広いほど level-up が分散し base Lv8 に届きにくくなる希釈特性。火の魔女も同構造。`one-build-focus` なら同条件で 99.0%。単なる均一化はしない |
| `FROST_EVOLUTION_ZERO_RATE zero_hour_world` | 全戦略合算の取得率 **1.00%** | base が legendary（`frozen_clock`）＋ active 補助（`ice_prison` Lv4）の二重ハンデ。終盤の legendary 軸として意図的。**到達不能ではない** |
| `FROST_FREEZE_EXCESSIVE` | 状態異常ハーネスで凍結成功率 93.3% | 「10体が移動せず毎秒8命中を浴び続ける」飽和負荷のテスト条件による。実際の抑止は凍結耐性が担っている（同ハーネスで 9,910 回の抑止） |
| 未参照 quality cap 5 件 | `maxBarrierEffects` `maxBurningEnemyIndex` `maxChainTargets` `maxCopyGeneration` `maxMainCastEventsPerFrame` | いずれも**火の魔女由来**。参照を足すと火の挙動が変わるため M7-E の対象外。テストの許容リストに明記済み |

### 既知の問題 / 制約

- 抽選シミュレーションの結果は **level-up 回数に強く依存**する（30 回で平均進化数 0.15、90 回で 4.88）。比較は同じ `levelUps` で行う。
- ヘッドレス環境では `requestAnimationFrame` の間引き・非フォーカス自動一時停止のため、実時間ループ依存の計測が不安定。
- 火の魔女側は M7-E と同種の監査（死にフィールド / `custom` echo・clone の実装有無 / 未参照 cap）を**まだ行っていない**。

## Browser verification status

**実ブラウザ（Phaser 実プレイ）確認は本環境では一度も実施していない。** 未実施の項目を「確認済み」と報告しない。

- 検証済み: Node 純ロジック（データ検証・監査・シミュレーション）＋ graphics 対応の最小 Phaser モックによるランタイムスモーク。
- **未確認**（要ブラウザ）:
  - 実際の描画・視認性・当たり判定・体感バランス・60FPS 維持（low/medium/high/ultra × 敵100体 × 2倍速 × active8枠）
  - M7-E で追加した **F8 のジョブ別分析パネル**・**F10 の直近イベント履歴**の描画
  - M7-E で挙動を変えたスキル（`crystal_bloom` の設置間隔 / `polar_star` の直撃 / 氷封・氷棺の凍結対象ボーナス /
    `heaven_piercing_glacier` の凍結 / `absolute_zero_ray`・`world_end_avalanche`・`continental_glacier_rush` の限定的な残響・分身）
  - draft / evolution / status / save / performance の手動チェック一式
- 手順書: `docs/test-guide.md` の **Milestone 7-E** 節（`?debug=1` で F8 / F9 / F10）。
- 例外: M7-B.1 の氷エフェクトと敵停止のみ、ユーザーが実ブラウザで確認済み。

## Latest test results

- 実行日時点: Milestone 7-E 完了時（コミット `3e6c7ed`）
- **テストスイート: 63 件（`tests/*.mjs` から共通土台 `frost-audit-common.mjs` を除く）→ 全 63 通過・失敗 0**
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**
- `src/**/*.js` 160 ファイルすべて構文解析 OK
- 主要な非回帰スイート: `passive-pool-audit`（53）/ `status-save-nonregression`（18）/
  `status-visibility-nonregression`（15）/ `draft-balance-simulation`（11）/ `combat-telemetry`（42）/ `frost-cooldown-save`（60）
- M7-E 新規 12 スイート:
  `frost-completion-catalog`（417）/ `frost-evolution-reachability`（310）/ `frost-draft-balance`（227）/
  `frost-evolution-distribution`（386）/ `frost-dead-content-audit`（1268）/ `frost-complete-skill-audit`（1140）/
  `frost-complete-runtime-save`（369）/ `frost-complete-determinism`（270）/ `frost-status-balance`（38）/
  `frost-quality-cap-audit`（1306）/ `frost-cleanup-audit`（271）/ `frost-telemetry-audit`（240）
- 監査の主要結果: 他ジョブ混入 0 / 不正候補 0 / 重複候補 0 / slot 違反 0 / 不正進化 0 / 進化後の元 active 再提示 0 /
  提示 0・取得 0 の active・passive・進化 0 / 到達不能進化 0 / 死にパラメータ 0 / 氷側の未参照 cap 0 / status RNG drift 0
- 重い計測: `HEAVY=1 node tests/frost-draft-balance.mjs`（500 seed）/ `HEAVY=1 node tests/frost-evolution-distribution.mjs`

### M7-E で追加・変更した主要ファイル

- 新規: `src/systems/FrostBalanceWarnings.js`、`tests/frost-audit-common.mjs` ＋ 監査テスト 12 本、
  `docs/frost-completion-audit.md`、`docs/frost-draft-analysis.md`、`docs/frost-balance-report.md`
- 変更（システム）: `src/systems/DraftBalanceAnalyzer.js`（戦略・指標追加）、`src/systems/StatusVisualManager.js`、
  `src/ui/StatusDebugPanel.js`、`src/scenes/BattleScene.js`（`frozenBonus` / F8 分析パネル）、`src/entities/Projectile.js`
- 変更（スキル 12 本）: `AbsoluteIceSeal` / `AbsoluteZeroRay` / `ContinentalGlacierRush` / `CrystalSentinelLegion` /
  `EternalSealedCoffin` / `FrostNova` / `FrostShard` / `GlacialLance` / `GlacialSpearRain` / `HeavenPiercingGlacier` /
  `IcePrison` / `IcebergRam` / `PolarStar` / `SnowflakeSentry` / `WorldEndAvalanche`
- 変更（データ）: `data/skills.json`、`data/skill-evolutions.json`、`data/balance.json`
- 変更（CI / 検証）: `tests/validate-data.mjs`（M7-E ブロック）、`.github/workflows/validate.yml`（12 ステップ追加）

## Next milestone

**未定（次の指示待ち）。** 候補は以下。

1. **火の魔女側の同種監査** — 未参照 cap 5 件・`custom` echo/clone の実装有無・死にフィールド・
   `hexagram_inferno_array`（evolution-first・slot6 で取得 0%）の到達性。氷術師の M7-E と同じ手順が流用できる。
2. **火と氷の属性反応**、または **3 人目のジョブ**（プール分離・状態異常基盤はすでに複数ジョブ対応済み）。
3. **周回長の拡張**（10分 / 15分 / 無限モード）・**追加の敵 / ボス**。
4. **実ブラウザでの M7-E 手動確認**（`docs/test-guide.md` の M7-E 節）— コード変更を伴わない検証タスク。

いずれも**指示された範囲のみ**実装し、未指定の先行実装はしない（`CLAUDE.md` の作業手順）。
