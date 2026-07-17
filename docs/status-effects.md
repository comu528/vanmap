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
