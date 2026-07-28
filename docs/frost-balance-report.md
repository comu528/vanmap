# 氷術師 バランス報告と M7-E の修正（Milestone 7-E）

`./frost-completion-audit.md`（監査結果）・`./frost-draft-analysis.md`（抽選分析）と対になる、
**M7-E で実際に修正した不具合**と**残した警告**の記録。火の魔女の data・実装は 1 件も変更していない。

## 1. 修正した不具合

### 1-1. 死にパラメータ（宣言されているのに実装から参照されない値）

M7-C の `bossGaugeMult` と同じクラスの欠陥。**予約値のまま Lv 成長項目として残さない**方針に従い、
「実際に適用する」か「削除する」のどちらかへ寄せた。

| # | 対象 | 症状 | 対応 | 変更前 → 変更後 |
|---|------|------|------|------------------|
| 1 | `crystal_bloom.levels[].interval` | 設置間隔が未参照。`SkillBase.update` が既定の 1000ms で発火していた | キー名を `cooldown` へ変更し正式な CD として参照 | 設置間隔 **一律 1000ms → Lv1 1600ms / Lv8 1150ms**（熟練度・パッシブの CD 倍率も乗るようになった） |
| 2 | `polar_star.levels[].impactDamage` | 直撃ダメージが未参照（爆発 `burstDamage` のみ） | 直撃した敵へ `impactDamage` を適用（射程終端の自然爆発では発生しない） | 直撃時 **+0 → +30（Lv1）／+66（Lv8）** |
| 3 | `absolute_ice_seal.levels[].frozenDamageBonus` | 凍結対象への追加ダメージが未参照 | `dealDamage` に `opts.frozenBonus` を追加し起爆で適用 | 凍結対象への起爆 **×1.00 → ×1.20（Lv1）／×1.50（Lv8）** |
| 4 | `eternal_sealed_coffin.frozenDamageBonus` | 同上（進化側） | 同上 | 凍結対象への起爆 **×1.00 → ×1.50** |
| 5 | `crystal_sentinel_legion.pulseProc` | 基礎 `snowflake_sentry` から複写された残骸。この進化に pulse 機構は無い | data から削除 | 挙動変化なし |
| 6 | `heaven_piercing_glacier.freeze.baseChance` | 凍結確率 0.12 が未参照で、**進化後の方が進化前より凍結しない**状態だった | 弾へ `baseFreezeChance` を渡す | 命中時の基礎凍結確率 **0 → 0.12** |

### 1-2. 状態異常経路の誤接続（bossGauge 倍率が通常敵の冷気にも乗っていた）

`bossGauge.multiplier` は「ボスの氷砕ゲージを大きく溜める」ための値だが、実装が `chillAmount` そのものへ乗算していたため
**通常敵・エリートの冷気まで増えていた**。M7-C で確立した共通経路（`opts.bossGaugeMult` → `StatusEffectManager` の
ボス分岐 → `addBossGauge` の量にだけ 1 回）へ付け替えた。

| 対象 | 変更前 | 変更後 |
|------|--------|--------|
| `heaven_piercing_glacier` | 通常敵の冷気 **48**（30×1.6）/ ボスゲージ 48 | 通常敵の冷気 **30** / ボスゲージ **48**（変化なし） |
| `absolute_zero_ray` | 通常敵の冷気/tick **12**（8×1.5）/ ボスゲージ 12 | 通常敵の冷気/tick **8** / ボスゲージ **12**（変化なし） |

ボス側のゲージ量・氷砕閾値・CD・脆弱値は不変。damage / procCoefficient / 凍結確率 / status RNG も不変。

### 1-3. `custom` を宣言しているのに実装が無い echo / clone

`echoPolicy` / `clonePolicy` が `custom`（= 攻撃部分のみ複製）なのに override が無く、
基底の `fire()` 全体が再実行される（＝ `standard` と同じ）状態だった。宣言どおりの限定的な複製を実装した。

| 対象 | 変更前 | 変更後 |
|------|--------|--------|
| `absolute_zero_ray` | `fire()` 再実行で照射セッションを上書き生成 | `echoCast` = 追加照射 1 回（粉砕なし）/ `cloneCast` = 射程 60% の短い光線 1 回 |
| `world_end_avalanche` | `fire()` 再実行で波セット全体を無料発動 | `echoCast` = 追加の波 1 本のみ / `cloneCast` = 波の接触ダメージ 1 回のみ（波実体・残留物なし） |
| `continental_glacier_rush` | `echoCast` が無く、同時1つ制限で実質 no-op | `echoCast` = 縮小氷河（`cloneCast` へ委譲） |

### 1-4. quality cap の未参照・名前違い

| # | 対象 | 症状 | 対応 |
|---|------|------|------|
| 1 | `maxFrostShards` `maxGlacialLances` `maxFrostNovaTargetsPerFrame` `maxIcePrisons` `maxIcebergRams` `maxContinentalGlacierRushes` `maxAbsoluteZeroRayBranches` `maxWorldEndAvalancheWaves` `maxSentryProjectiles` `maxGlacialSpearTelegraphs` `maxShatterProjectiles` | 宣言のみで未参照 | 実装へ接続（既定品質では実効値が変わらない位置でクランプ） |
| 2 | `chillNearThresholdEffectCooldown` | 未参照 | `StatusVisualManager._nearFlash` の再点滅クールダウンとして参照（表示のみ・状態ロジック不変） |
| 3 | `maxStatusDebugHistory` | 未参照 | `StatusDebugPanel` の**直近イベント履歴**の上限として参照（F10 の機能追加・保存しない） |
| 4 | `maxSentryLinksPerFrame` | `maxSentinelLegionLinksPerFrame` と完全重複 | 削除 |
| 5 | `maxSnowblindMistParticles` | 対応するパーティクル機構が存在しない | 削除 |
| 6 | `maxFreezeChecksPerFrame` `maxStatusApplicationsPerFrame` | 接続すると**負荷時に status RNG の消費順が変わり決定論を壊す** | 削除（RNG drift を作らないことを優先） |
| 7 | `CrystalSentinelLegionSkill._cap()` | 砲台数の上限に「1フレームあたりの氷線予算」を混ぜていた名前違い（未使用ヘルパ） | 削除。砲台数は `maxSentries` と `safetyCaps.maxSentries` のみで決まる（既定品質での実効値は不変） |

**cap 値の調整（品質で主効果を削らないため）**

| cap | 変更前 | 変更後 | 理由 |
|-----|--------|--------|------|
| `maxIcePrisons` | 1/2/3/4 | **3/4/5/6** | 制御スキルの主効果である「同時封印対象数（最大3）」を品質で削らない。上限は暴走防止としてのみ働く |
| `maxWorldEndAvalancheWaves` | 2/3/4/6 | **3/3/4/6** | low 品質でも `wave.count`(3) を下回らない |

火の魔女由来の未参照 cap 5 件（`maxBarrierEffects` `maxBurningEnemyIndex` `maxChainTargets` `maxCopyGeneration`
`maxMainCastEventsPerFrame`）は、参照を足すと火の魔女の挙動が変わるため **M7-E では触らず**、テストの許容リストへ明記した。

### 1-5. 共通エンジンへの追加（既定値で既存挙動は不変）

| 追加 | 内容 |
|------|------|
| `BattleScene.dealDamage` の `opts.frozenBonus` | 凍結中の対象への追加ダメージ倍率（既定 0＝未指定のスキルは不変）。`damageArea` も透過 |
| `Projectile.bossGaugeMult` | 弾からもボス氷砕ゲージ倍率を共通経路へ渡す（既定 1） |
| `_spawnIceFragments` の `maxShatterProjectiles` | 粉砕由来の弾数上限（既定値は fragmentCount より大きく通常は恒等） |

## 2. 残した警告（修正しないもの・理由つき）

| 警告 | 内容 | 理由 |
|------|------|------|
| `FROST_EVOLUTION_LOW_RATE slot8:atLeast1` | evolution-first・slot8 の「進化1個以上」が **94.0%**（基準 95%） | 枠が広いほど level-up が分散し base Lv8 に届きにくくなる希釈特性。火の魔女も同じ構造。`one-build-focus` なら同条件で 99.0%。均一化はしない（`./frost-draft-analysis.md` に要因分解） |
| `FROST_EVOLUTION_ZERO_RATE zero_hour_world` | 合算取得率が 1.00% と極端に低い | base が legendary（`frozen_clock`）＋ active 補助（`ice_prison` Lv4）の二重ハンデ。終盤の legendary 軸として意図的。到達不能ではない（全戦略・全枠の合算で取得 > 0） |
| `FROST_FREEZE_EXCESSIVE` | 状態異常ハーネスで凍結成功率 93.3% | 「10体が移動せず毎秒8命中を浴び続ける」飽和負荷のテスト条件によるもの。実プレイでは冷気減衰と移動があり、実際の抑止は凍結耐性（同ハーネスで 9,910 回の抑止）が担っている |

## 3. 状態異常バランス（`tests/frost-status-balance.mjs`・60〜120 秒のヘッドレス計測）

| 区分 | 指標 |
|------|------|
| 通常敵 | 冷気付与 9,095 回 / 合計 35,117（平均 3.86/命中）・凍結 判定 375 → 成功 350・耐性で抑止 9,910・hitGroup で抑止 50・凍結ピーク 10 体・粉砕 350 回（28,000） |
| エリート | 冷気合計 29,231（通常敵より低い＝耐性が効いている）・凍結 330・粉砕 210 |
| ボス | 通常凍結 **0**・ゲージ付与 960 回・氷砕 22 回（毎分 11.0）・脆弱 82.0 秒 / 120 秒（継続率 68.4%）・粉砕 **0**（frostbreak で代替） |

- 氷砕の間隔は回数を重ねるほど広がる（閾値成長 ×1.30/break が効いている）。
- ボスへは冷気/凍結を付与せずゲージへ変換し、`bossGaugeMult` はゲージ量のみへ 1 回だけ乗る。
- 粉砕から粉砕は再帰しない（`isShatter`）。Lv50 の氷砕連鎖も無限連鎖しない。

## 4. M7-E で仮定した警告閾値（`FrostBalanceWarnings.DEFAULT_FROST_THRESHOLDS`）

| 閾値 | 値 | 根拠 |
|------|----|------|
| 進化1個以上（slot 4/6/8） | 0.80 / 0.95 / 0.95 | M7-E 指示書 §7 |
| 進化2個以上（slot 6/8） | 0.60 / 0.65 | 同上 |
| 平均進化数（slot 4/6/8） | 1.0 / 1.7 / 1.8 | 同上 |
| 進化0個（slot4） | 0.20 以下 | 同上 |
| 個別進化の低取得率 | 合算 2% 未満で警告 | 火の魔女の最低値（`hexagram_inferno_array` = 0%）を下回らない水準 |
| rarity 帯内の偏り | 中央値の 3 倍超 / 1/3 未満 | M7-E 指示書 §9 |
| passive 取得の偏り | 最大/最小比 3.0 | 4 種しかないため緩め。実測 1.64 |
| 凍結成功率 | 2%〜85% | 下限は「判定はあるが成功 0」の検出、上限は永久凍結の検出 |
| 氷砕頻度 | 毎分 30 回以下 | 実測 11.0 回/分の 3 倍弱を上限とした |
| 氷砕脆弱の継続率 | 90% 以下 | ほぼ常時脆弱＝実質的な常時弱点化の検出 |

これらは**自動合否ではなく警告**であり、`FrostBalanceWarnings` はローカルでのみ使う（外部送信なし）。

## 5. バランス数値の変更まとめ

火の魔女: **変更なし**（data・実装とも 0 件）。氷術師の変更は上表 1-1・1-2・1-4 のみで、いずれも
「宣言されているのに効いていなかった値を効かせる」か「ボス専用の倍率を通常敵から外す」修正。
新しい active / passive / 進化 / 状態異常 / 敵 / ボス / 難易度は追加していない。`save_version` は v6 のまま。

**影響**: 進化到達率・抽選率への影響は無い（data の rarity / weight / 条件を変えていない）。
damage / status への影響は上表の該当スキルのみ。性能上限は既定品質で恒等（low 品質のみ一部で厳しくなる）。
