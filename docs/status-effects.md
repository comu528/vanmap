# 状態異常フレームワーク（Milestone 7-A）

M7-A で **汎用の状態異常（status effect）基盤** を追加した。各スキルが独自に炎上/冷気/凍結タイマーを持つのではなく、
`Enemy` / `Boss` / エリートが **共通経路（`StatusEffectManager`）** を通じて状態を受け取り、更新・解除・索引される。
数値・方針はすべて `data/status-effects.json` に集約し、コードへ散在させない。すべて **Phaser / DOM 非依存の純ロジック**
（Node テスト可能）で、乱数は状態異常専用 `SeededRandom` を使い **Math.random を使わない**。

- データ: `./data/status-effects.json`
- 純ロジック: `./src/systems/StatusEffectRegistry.js`（定義照会）/ `./src/systems/StatusEffectManager.js`（適用・索引・更新・解除・専用RNG）/
  `./src/systems/FreezeSystem.js`（凍結確率・冷気減速・ボス氷砕ゲージ・粉砕ダメージの純計算）
- 検証: `node tests/status-effects.mjs` / `node tests/freeze-system.mjs`（Node 標準のみ）

## 実装済みの状態（M7-A で正式に扱う5種）
`data/status-effects.json` の `statusEffects` に定義。将来は `poison`/`bleed`/`shock`/`curse`/`stun`/`slow`/`vulnerability` などを
同じ構造で追加できる（`_comment` 参照）。

| id | 表示名 | kind | element | 対象 | ボス方針 | 概要 |
|----|--------|------|---------|------|----------|------|
| `burning` | 炎上 | `damageOverTime` | fire | normal/elite/boss | `normal` | 既存の火の魔女の炎上。**M7-A では索引のみ汎用化し、ダメージ/持続/灼熱共鳴/万象炎鳴/統計は不変** |
| `chill` | 冷気 | `scalar` | ice | normal/elite | `convertToGauge` | 氷攻撃で蓄積するスカラー値（0..chillCap）。減速と凍結判定の元。ボスへは付与せず氷砕ゲージへ変換 |
| `frozen` | 凍結 | `control` | ice | normal/elite | `immune` | 移動/攻撃/AI 停止。ダメージは受け、粉砕対象。ボスは通常凍結しない |
| `freeze_immunity` | 凍結耐性 | `immunity` | ice | normal/elite | `immune` | 凍結解除後に付与。付与中は凍結判定しない（冷気は軽減して蓄積可） |
| `frostbreak_vulnerability` | 氷砕脆弱 | `vulnerability` | ice | boss | `normal` | ボスの氷砕（frostbreak）発生時に付与。氷属性被ダメージ ×1.15 |

### 炎上（burning）の移行（互換ラッパー）
既存の火の魔女の炎上は M6-E の `Enemy.ignite` / `_burningIndex` 経路を維持したまま、**索引だけ**を汎用フレームワークへ移した。
`StatusEffectManager.registerBurning`/`unregisterBurning` が炎上専用の `burning` 索引 Set を共有し、`combat.ignite` からの付与・
消火/死亡/プール返却/Scene 終了での解除は従来どおり。**burning は索引上限（`maxStatusIndexEntries`）を課さず**（M6-E 挙動維持）、
灼熱共鳴/万象炎鳴の炎上数カウント・炎上ダメージ・持続は不変。炎上と冷気/凍結は**独立共存**する（属性反応は M7-A では未実装。後述）。

## 冷気（chill）と減速
- 氷攻撃の命中1回ごとに `chillAmount`（スキル定義）× 冷気付与倍率で蓄積。通常敵の `chillCap=100`、エリートは `chillCap=130`。
- **減速**: 冷気量に応じて敵速度が下がる（`slowFactor = maxSlow × (chill/chillCap)^slowCurveExponent`）。通常最大 **50%**、
  エリート最大 **35%**、**ボスは減速なし**（冷気を持たない）。`Enemy.effectiveSpeed` が `_chillSlow` を読む。
- **自然減衰**: 付与直後の猶予（`chillDecayGraceMs`）後、毎秒 `decayRate`（既定12）で減衰する。凍結中は減衰しない。
  余寒残留（`lingering_cold` passive）の `chillDecay` で減衰が緩和される（**下限あり**）。
- エリートは冷気獲得（`chillGainMultiplier`）・凍結時間・最大減速が軽減される。

## 凍結（frozen）と procCoefficient・永久凍結防止
- **凍結確率式**（`FreezeSystem.computeFreezeChance`）:
  `freezeChance = baseFreezeChance × procCoefficient + (chill / chillCap) × chanceFromChill × procCoefficient`。
  0以上・対象別 `freezeChanceCap`（通常0.45 / エリート0.25）でクランプ。`chill >= guaranteedFreezeThreshold` で **確定凍結**。
- 判定は **状態異常専用 `SeededRandom`** で決定論的に行う（`rng.next() < chance`）。
- **procCoefficient**（スキル定義値）は多段・広範囲攻撃の1ヒットあたり凍結寄与を下げる係数。**永久凍結を防ぐ2段構え**:
  1. 多段/広範囲スキルには低い procCoefficient を与える（例: 氷晶弾 0.9）。
  2. 同じ `hitGroupId` × 同一対象の凍結判定回数を `sameHitGroupMaxFreezeChecks`（既定1）で上限化する。
- **凍結中の挙動**: 移動/攻撃/AI 停止・**ダメージは受ける**・粉砕対象。凍結中の再付与は残り時間を**延長しない**（`noExtend`）。
  凍結解除後に `freeze_immunity`（凍結耐性）を付与する（耐性中は冷気を `immunityChillGainMultiplier` 倍だけ蓄積可）。
- 凍結時間は `baseFreezeDuration × freezeDurationMultiplier(エリート軽減) × 絶対零度延長`、上限は `frozen.maxDuration`。

## ボス氷砕（frostbreak）
ボスは通常凍結しない。付与しようとした冷気を **ボス専用の `frostbreakGauge`** へ変換する（`bossFrostbreak` 設定）。
- ゲージが閾値（`baseThreshold=250`）へ到達すると **frostbreak** が1回発生する:
  - 短い硬直（`breakStaggerDuration`＝chase 中のみ）
  - `frostbreak_vulnerability` 付与（`iceDamageTakenMultiplierDuringVulnerability=1.15`＝氷被ダメージ ×1.15）
  - ゲージリセット
  - break ごとに次回閾値 ×`thresholdGrowthPerBreak(1.30)`（上限 ×`maximumThresholdMultiplier(3.0)`・下限 `minThreshold(120)`）
  - break 後クールダウン（`cooldownAfterBreak`）
- HUD: ボス HP バー付近に **氷砕ゲージ** を表示（氷術師のみ・ボス不在時は非表示・`src/ui/HUD.js`）。
- frostbreak 状態（`gauge`/`breaks`/`vulnRemainMs`）は `active_run` へ保存し、再読込でのゲージ初期化・脆弱延長の悪用を防ぐ。

## 粉砕（shatter）
凍結中の**通常敵/エリート**へ特定の氷スキル・Job Lv 報酬から発生する。frozen を解除し、追加の氷ダメージ／範囲爆発を与える。
- ダメージ = `baseDamage + skillPower × skillPowerCoefficient + min(maxHp × maxHpCoefficient, maxHpDamageCap)`、
  全体に `absoluteCap`（600）でクランプ。**最大HP割合だけで無制限に増えない**よう `maxHpCoefficient` / `maxHpDamageCap` で抑える。
- 爆発は `explosionRadius`（44）・`explosionDamageFactor`（0.5）。
- **粉砕から粉砕を再帰しない**（`recursionForbidden`・`isShatter`）。**ボスには通常粉砕を適用しない**（frostbreak で代替）。

## 決定論（状態異常専用 SeededRandom）
凍結判定は `StatusEffectManager` が保持する専用 `SeededRandom`（`this.rng`）で行い、**cursor を `active_run.statusRng` へ保存**する。
再読込しても同じ判定列が再現され、凍結を引き直す不正ができない。`serialize()`/`restore()` で保存・復元する。

## 性能上限（品質別 skillCaps）
`data/balance.json` の `skillCaps` に状態異常/氷スキルの品質別上限（`low ≤ medium ≤ high ≤ ultra`）を追加した。到達しても
**判定・主要挙動は消さず、装飾・新規生成を先に削る**。主なキー:
```
maxStatusApplicationsPerFrame / maxFreezeChecksPerFrame / maxFrozenEnemies / maxShattersPerFrame /
maxShatterProjectiles / maxStatusIndexEntries / maxFrostShards / maxFrostNovaTargetsPerFrame /
maxGlacialLances / maxPermafrostFields / maxPermafrostTicksPerFrame / maxIceWalls / maxIceWallSegments /
maxIceWallCollisionsPerFrame / maxDiamondBlizzardProjectiles / maxAbsoluteZeroDomains /
maxAbsoluteZeroShattersPerFrame / maxHeavenGlacierFragments / maxBossFrostbreaksPerFrame
```
索引上限（`maxStatusIndexEntries`）到達時は新規付与をスキップし、既存状態と解除は壊さない（burning は上限なし）。

## 将来の状態異常を追加する手順
1. `data/status-effects.json` の `statusEffects` へ定義を追加（`id`/`kind`/`element`/`affectedEntityTypes`/`bossPolicy`/
   `stackMode`/`refreshPolicy`/`indexable`/`duration`/`decayRate` など）。数値もここへ集約する。
2. `StatusEffectManager` に付与・更新ロジックを足す（既存の chill/freeze と同じ索引・更新・解除の枠組みを利用）。
3. 付与するスキル定義（`data/skills.json`）にパラメータ（例: `poisonAmount`）を持たせ、`applyIceHit` 相当の適用経路を追加。
4. 必要なら品質別 `skillCaps` を追加（`low ≤ medium ≤ high ≤ ultra`）。
5. `data/jobs.json` の対象ジョブの `statusEffects` へ id を足すと、そのジョブが扱う状態として関連づく。
6. `node tests/validate-data.mjs`（新状態の検証）と `node tests/status-effects.mjs` を通す。

## 属性反応は将来課題（M7-A では未実装）
火と氷の属性反応（火で凍結解除／氷で消火／蒸発／融解 など）は **M7-A では実装していない**。炎上と冷気/凍結は独立して共存する。
ただし将来の反応実装に備え、状態付与時に **発生源の属性（source element）** を保持している。

## Milestone 7-B: 氷術師の新スキルと状態異常経路（既存経路を再利用）
M7-B で氷術師へ追加した新 active10種・進化5種も、**独自の凍結タイマーを持たず**、冷気（chill）/凍結（frozen）/凍結耐性（freeze_immunity）/粉砕（shatter）/
ボス氷砕（frostbreak）はすべて既存の `StatusEffectManager` / `FreezeSystem` 経路を通す（`data/status-effects.json` の数値が正）。凍結判定は状態異常専用
`SeededRandom` のままで **Math.random を使わず**、cursor 保存で再読込の引き直しを防ぐ。多段/広範囲の新スキルは低い `procCoefficient`（icicle_volley≈0.38 等）と
`sameHitGroupMaxFreezeChecks` で永久凍結を防ぐ。粉砕/ボス氷砕/凍結の付与・上限は M7-A と同じ経路・同じ品質別 `skillCaps` に従う（新規に状態異常種別は追加しない）。

- **`ice_prison`（氷牢封印）の条件付き凍結**: 対象の冷気が十分なら**短時間の凍結**、不足なら**大幅減速**にとどめる。凍結は既存経路で行うため
  `freeze_immunity`（凍結耐性）を尊重し、耐性中は凍らせない。**ボスは通常凍結せず氷砕ゲージ**へ変換する（既存 `bossFrostbreak`）。
- **`glacier_drop`（氷河墜落）／`avalanche`（雪崩奔流）／`cryo_mine`（氷結地雷）**: いずれも `frozen` 中の通常敵/エリートを既存の**粉砕**で砕く
  （再帰なし・ボスは frostbreak で代替）。ボス直撃は氷砕ゲージへ加算する。
- **`mirror_ice`（氷鏡結界）の敵弾吸収は状態異常ではない**: 既存 `bossBulletPool` の `absorbable` メタで敵弾を吸収して氷反撃弾を撃つ挙動であり、
  `StatusEffectManager` の索引・上限とは無関係（冷気/凍結の付与経路には影響しない）。

## Milestone 7-B.1: 状態異常の視認性（表示層はロジックと分離）
状態を通常プレイ中に見て確かめられるよう、**表示層（`StatusVisualManager`/`BossFrostbreakDisplay`/`StatusDebugPanel`）** を追加した。
**表示はロジックと完全に分離**しており、状態の判定・ダメージ・凍結確率・状態RNG cursor・ボス氷砕値は**一切変更しない**（`StatusEffectManager`/`FreezeSystem` の計算は M7-A/M7-B のまま）。
表示状態はセーブしない・`save_version` は v6 のまま。詳細は `docs/status-visuals.md`・`docs/status-debug.md`。

### StatusEffectManager が発火するイベント（判定・RNG は変えない）
表示層へ通知するため `on(fn)`/`_emit` を追加した。付与・更新・解除のロジックはそのままで、**通知フックを足すだけ**（凍結ロールは `applyIceHit` にインライン化したが
`rng.next()` を同一に消費し、cursor と結果は不変）。emit するイベント:
- `chillChanged`（冷気量の変化）/ `chillThresholdNear`（確定閾値の直前・>=90%）
- `frozenStarted` / `frozenEnded`
- `freezeImmunityStarted` / `freezeImmunityEnded`
- `shatterTriggered`（粉砕）
- `bossFrostGaugeChanged` / `frostbreakTriggered` / `frostbreakVulnerabilityStarted` / `frostbreakVulnerabilityEnded`
- `burningStarted`（`registerBurning` から。炎上の索引・ダメージ・持続は不変）

イベントとカウンタは**シリアライズしない**（表示/計測用のランタイム状態）。

### 実動作カウンタ・freeze 内訳（デバッグ用の可視化）
- **カウンタ**（`counters()`）: `chillApplications` / `chillAmountTotal` / `freezeAttempts` / `freezeSuccesses` / `immunitySkips` / `hitGroupSkips` / `bossGaugeApplications`。`statusIndexSize()` で索引サイズも取れる。
- **エンティティ別 `_statusDebug`**: 直近の freeze 内訳（base×proc / 冷気寄与〈chillRatio×chanceFromChill×proc〉/ proc / 最終 freezeChance / RNG roll / 結果 / hitGroupId / 同group判定回数 / skip理由〈immunity|hitGroup上限〉）を保持し、F10 デバッグが読む。
- いずれも**ロジックの副作用ではなく観測**であり、凍結確率や結果には影響しない。

### enemy.setTint を overlay へ移動
`Enemy` の毎フレーム冷気/凍結 `setTint` を廃し、冷気段階色・氷殻は `StatusVisualManager` の overlay 層で描く。これにより
状態演出と被弾フラッシュ/ダッシャー予告/エリート色が `setTint` を奪い合わなくなった（`onFreezeStart`/`onFreezeEnd` はフックとして残す）。
overlay は状態フィールドを**読むだけ**で、状態そのものは書き換えない。

## Milestone 7-C: 氷術師の新スキルと状態異常経路（既存経路を再利用・第2波）
M7-C で氷術師へ追加した新 active10種・進化5種も、**独自の凍結タイマー・独自の状態種別を持たず**、冷気（chill）/凍結（frozen）/凍結耐性（freeze_immunity）/粉砕（shatter）/
ボス氷砕（frostbreak）はすべて既存の `StatusEffectManager` / `FreezeSystem` 経路を通す（`data/status-effects.json` の数値が正）。冷気/凍結は `dealDamage`/`damageArea` の
`element:'ice'`＋`chillAmount` で付与し、凍結判定は状態異常専用 `SeededRandom` のまま **Math.random/Date.now/performance.now を使わず**、cursor 保存で再読込の引き直しを防ぐ。
多段/広範囲/往復/連鎖の新スキルは低い `procCoefficient`（一次 proc）と二次 proc（`config`）＋`sameHitGroupMaxFreezeChecks` で永久凍結を防ぐ。粉砕/ボス氷砕/凍結の付与・上限は
M7-A/M7-B と同じ経路・同じ品質別 `skillCaps` に従う（**新規に状態異常種別は追加しない**）。

- **粉砕を起こすスキルと起こさないスキル**: 復路（`rime_boomerang`）/開花時のみ（`crystal_bloom`）/凍結敵（`icebreaker_wave`）/最終屈折のみ（`crystal_refraction`）/大彗星のみ（`comet_sleet`）/複合弾（`polar_star`）は `frozen` 中の通常敵・エリートを既存の**粉砕**で砕く（再帰なし・ボスは frostbreak で代替）。`snowblind_mist`（追従霧）は**粉砕しない**（冷気のみ）。
- **`frozen_clock`（氷刻停止）／`zero_hour_world`（零刻世界）は直接凍結しない**: 全画面の時計波は冷気を与え、凍結は既存 `FreezeSystem`（guaranteed threshold＋確率）へ**委譲**する。**ボスは通常凍結せず氷砕ゲージへ変換**（既存 `bossFrostbreak`）。データの `bossGaugeMult` は**ボス氷砕ゲージ量のみへ適用**する。`StatusEffectManager.applyIceHit` のボス分岐で chill→ゲージ変換に1命中1回だけ掛かり（`addBossGauge(e, chillAmt × bossGaugeMult)`）、damage/chillAmount/procCoefficient や通常敵/エリート・炎には掛からず二重加算もしない（ボス氷砕の cooldown/threshold/vulnerability 値は M7-B から不変）。
- **`winter_halo`（冬冠結界）の氷冠吸収は状態異常ではない**: 被弾を吸収し近距離で冷気反撃する防御挙動であり、`StatusEffectManager` の索引・上限とは無関係（冷気/凍結の付与経路には影響しない）。反撃の冷気付与のみ既存経路を通る。
- **表示への自動反映**: 上記はすべて既存経路を通るため、M7-B.1 の `StatusVisualManager`（冷気段階/氷殻/SHATTER）/`BossFrostbreakDisplay`（ゲージ/FROST BREAK）/`StatusDebugPanel`（F10・freeze 内訳/カウンタ）へ**自動反映**される。スキルクラスから状態演出・独自タイマーを持たない（`tests/frost-policy-audit-wave3.mjs`・`tests/frost-determinism-wave3.mjs` で確認）。

## Milestone 7-D: 氷術師の新スキルと状態異常経路（既存経路を再利用・最終波／氷印は skill-local マーカー）
M7-D で氷術師へ追加した新 active5種・進化5種も、**独自の凍結タイマー・独自の状態種別を持たず**、冷気/凍結/凍結耐性/粉砕/ボス氷砕はすべて既存の `StatusEffectManager` / `FreezeSystem` 経路を通す
（`data/status-effects.json` の数値が正）。冷気/凍結は `dealDamage`/`damageArea` の `element:'ice'`＋`chillAmount` で付与し、凍結判定は状態異常専用 `SeededRandom` のまま **Math.random/Date.now/performance.now を使わず**、cursor 保存で再読込の引き直しを防ぐ。**新規に状態異常種別は追加しない**（M7-D で正式 status は増えない）。

- **氷印/氷棺は skill-local マーカーであり正式 status ではない**: `absolute_ice_seal`（絶対氷封）の氷印と `eternal_sealed_coffin`（永劫封氷棺）の氷棺は、`StatusEffectRegistry` へ**登録しない**（`data/status-effects.json` の burning/chill/frozen/freeze_immunity/frostbreak_vulnerability の一覧に加えない）。`Enemy._iceSeal`（マーカー参照）と `Enemy._iceHitCount`（氷属性命中カウンタ）でスキル側が保持し、`Enemy.reset` でクリアして pool 再利用の残留を防ぐ。命中数起爆は `dealDamage` の ice 分岐が `_iceHitCount` を1回加算し、マーカーが差分（`requiredHits`）で判定する。**正式 status 表示・索引・上限には現れない**（skill-local overlay のみ）。氷印付与時は freeze roll しない（冷気/凍結の付与とは独立）。
- **粉砕を起こすスキルと起こさないスキル**: 大型槍のみ（`glacial_spear_rain`）/凍結中の接触・崩壊（`iceberg_ram`）/氷印起爆（`absolute_ice_seal`）/burst のみ（`aurora_veil`）は `frozen` 中の通常敵・エリートを既存の**粉砕**で砕く（再帰なし・ボスは frostbreak で代替）。`snowflake_sentry`（六花砲台）の砲台弾は**粉砕しない**（冷気/pulse のみ）。
- **`bossGaugeMult` はボス氷砕ゲージ量のみへ適用**: `absolute_ice_seal`/`aurora_veil`/`eternal_sealed_coffin`/`polar_night_aurora`/`heavenfall_glacier_lances`（巨大槍）の `bossGaugeMult` は、M7-C 修正済みの共通経路（`StatusEffectManager.applyIceHit` のボス分岐で chill→ゲージ変換に1命中1回だけ→`addBossGauge(e, chillAmt × bossGaugeMult)`）を維持する。damage/chillAmount/procCoefficient や通常敵/エリート・炎には掛からず二重加算もしない（ボス氷砕の cooldown/threshold/vulnerability 値は M7-B から不変）。
- **表示への自動反映**: 上記はすべて既存経路を通るため、M7-B.1 の `StatusVisualManager`/`BossFrostbreakDisplay`/`StatusDebugPanel`（F10）・状態カウンタへ**自動反映**される。氷印だけ最小限の skill-local overlay を描画し、正式 status の頭上アイコン等とは重複させない（`tests/frost-policy-audit-wave4.mjs`・`tests/frost-boss-gauge-wave4.mjs`・`tests/frost-determinism-wave4.mjs` で確認）。

## Milestone 7-E: 状態異常の監査結果（数値・仕様は不変）
M7-E では状態異常の**数値・確率式・閾値・持続時間を一切変更していない**。以下は計測と修正の記録。

### 修正（状態異常経路の誤接続）
`heaven_piercing_glacier` と `absolute_zero_ray` の `bossGauge.multiplier` が `chillAmount` そのものへ乗算されており、
**通常敵・エリートの冷気まで増えていた**。M7-C で確立した共通経路（`opts.bossGaugeMult` →
`StatusEffectManager.applyIceHit` のボス分岐 → `addBossGauge` の量にだけ 1 回）へ付け替えた。

| 対象 | 通常敵の冷気（変更前 → 変更後） | ボス氷砕ゲージ |
|------|-------------------------------|----------------|
| `heaven_piercing_glacier` | 48 → **30** | 48（不変） |
| `absolute_zero_ray` | 12/tick → **8/tick** | 12/tick（不変） |

また `heaven_piercing_glacier` は宣言済みの `freeze.baseChance = 0.12` を弾へ渡していなかったため、
**進化後の方が進化前より凍結しない**状態だった（0 → 0.12 へ修正）。

### 計測（`tests/frost-status-balance.mjs`・決定論ヘッドレス）
| 区分 | 結果 |
|------|------|
| 通常敵（60秒・毎秒8命中・多段） | 冷気付与 9,095 回 / 合計 35,117・凍結 判定375→成功350・**耐性で抑止 9,910**・**hitGroup で抑止 50**・凍結ピーク 10 体・粉砕 350 回 |
| エリート | 冷気合計 29,231（通常敵 35,117 より低い＝`chillGainMultiplier` の耐性が効いている）・凍結時間も短い |
| ボス（120秒） | **通常凍結 0**・ゲージ付与 960 回・氷砕 22 回（毎分 11.0）・脆弱 82.0 秒（継続率 68.4%）・**粉砕 0**（frostbreak で代替） |

- 氷砕の**間隔は回数を重ねるほど広がる**（閾値成長 ×1.30/break）。短時間での連打にならない。
- 粉砕から粉砕は再帰しない（`isShatter`）。Lv50 の氷砕連鎖も無限連鎖しない。
- **氷印 / 氷棺は正式状態ではない**（`status-effects.json` は burning / chill / frozen / freeze_immunity /
  frostbreak_vulnerability の **5 種のまま**）。`validate-data` がマーカーの誤登録をエラーにする。


---

## Milestone 8-A: 炎上（burning）の監査結果（数値・仕様は不変）

火の魔女の炎上は `status-effects.json` の正式状態（5 種のうちの `burning`）だが、
**継続ダメージそのものは持たないマーカー**である（`Enemy.ignited` / `_igniteUntil` / `_igniteGen`）。
実際の継続ダメージは各スキルの設置物・領域が `dealDamage(..., { tag: 'dot' })` で与える。
この設計は M6-E から不変で、M8-A でも変更していない。

- 炎上を付与するのは `eternal_pyre` / `infernal_vortex_wheel` / `solar_core_collapse` /
  `scorching_resonance`（既に炎上中の敵の**延長**のみ）。
- 炎上数は共鳴段階（tier）の入力になる（`scorching_resonance` / `universal_flame_resonance`）。
- 同一対象への再付与は「延長」であり**スタックしない**。既存の炎上が長ければ短縮しない（`igniteEnemy`）。
- 炎上索引（`_burningIndex`）は登録・解除・走査時の掃除で有界。全敵死亡後は空になる（残留 0）。
  `Enemy.reset()` が `_igniteUntil` / `_igniteGen` をクリアし、プール再利用の残留を防ぐ。
- **`eternal_pyre` の感染が `enemyPool.forEachActive()` で全敵総当たりしていたのを、
  炎上索引（`combat.burningEnemies()`）経由へ修正した**（対象集合は同じ・性能改善）。
- 未参照だった `skillCaps.maxBurningEnemyIndex` は削除した。索引は `maxEnemies` で自然に有界であり、
  上限を付けると低品質で共鳴段階＝火力が変わってしまうため。

計測（60 秒・敵 24 体・実スキル駆動）: 炎上付与 24 / 延長 4,776 / 同時ピーク 24 体 / 平均持続 1,600ms /
DoT tick 40,344 回（627,456 ダメージ）/ 爆発 150 回・二次爆発 0 回 / 共鳴 1 パルスあたり連鎖 23.2 本。
`FLAME_*` 警告は 0 件。氷側（chill / frozen / freeze_immunity / frostbreak_vulnerability）は**一切変更していない**。
