# データフォーマット

`data/*.json` の仕様。`tests/validate-data.mjs` が構文・必須項目・ID重複・参照整合・
負のクールダウン・不正な最大レベル・難易度倍率・転生ノード参照・セーブバージョン・
**空間グリッド設定（cellSize/maxRegistered）**・**品質別エフェクト上限の逆転（M5-A）**・
**保存設定（save: バックアップ世代/最小間隔/最大インポートサイズ/formatVersion, M5-B）**を検証する。

## balance.json
```jsonc
{
  "saveVersion": 3,           // セーブバージョン（>=1、必須）
  "gameVersion": "0.3.0",
  "emberReward": {            // 残り火（M3）の獲得計算（必須）
    "perSecond": 0.15, "perKill": 0.4, "perBossKill": 40,
    "winBonus": 30, "winMultiplier": 1.0, "defeatMultiplier": 0.5
  },
  "player": { "maxHp": 100, "moveSpeed": 110, "dashCount": 2, "dashSpeed": 320,
              "dashDurationMs": 160, "dashInvulnMs": 250, "dashRechargeMs": 4000,
              "invulnMs": 600, "pickupRadius": 40, "attackRange": 220 },
  "run": { "baseDurationSec": 300, "bossAtSec": 300,
           "phases": [ { "fromSec": 0, "toSec": 60, "label": "少数の敵",
                         "spawnIntervalMs": 900, "maxAlive": 40 }, ... ] },
  "leveling": { "baseXpToLevel": 5, "xpGrowth": 1.35, "choicesPerLevel": 3 },
  "difficulties": [ { "id": 1, "name": "難易度1",
                      "enemyHp": 1.0, "enemyDamage": 1.0, "enemySpeed": 1.0,
                      "spawnRate": 1.0, "eliteRate": 0.02, "bossHp": 1.0,
                      "currency": 1.0, "reincarnationEfficiency": 1.0,
                      "unlockAfter": null }, ... ],
  "effectQuality": { "low": {...}, "medium": {...}, "high": {...}, "ultra": {...} }
}
```
- 難易度倍率（enemyHp 等）はすべて **> 0**。`currency` が残り火獲得倍率。
- `unlockAfter` は `null` か既存 difficulty の `id`。
- `emberReward.defeatMultiplier` は `winMultiplier` 以下（敗北時は少なく）。
- 残り火の算出: `(生存×perSecond + 討伐×perKill + ボス×perBossKill + 勝利時winBonus)
  × 難易度currency × (勝利winMultiplier / 敗北defeatMultiplier) × 残り火獲得強化倍率` を切り捨て。

## enemies.json
```jsonc
{ "enemies": [ {
  "id": "slime", "name": "スライム", "behavior": "chase",   // chase|dasher
  "hp": 14, "speed": 34, "damage": 8, "size": 16, "xp": 1,
  "knockbackResist": 0.2, "damageReduction": 0,             // 0<=x<1
  "elite": false, "spawnFromSec": 0, "color": "0x4caf50", "texture": "enemy_slime"
}, ... ] }
```
必須: `id, name, behavior, hp, speed, damage, xp`。`hp > 0`。`id` は一意。

## bosses.json
```jsonc
{ "bosses": [ {
  "id": "flame_lord", "name": "業炎の君主", "hp": 3000, "speed": 40, "damage": 30,
  "summons": ["slime", "bat"],       // 既存 enemy id のみ
  "attacks": [ { "id": "charge", "type": "charge", "telegraphMs": 800, ... } ],
  "enrage": { "hpThreshold": 0.5, "cooldownMultiplier": 0.6 }
}, ... ] }
```
必須: `id, name, hp, speed, damage`。`summons` は存在する敵 id を参照。

## skills.json
```jsonc
{ "skills": [ {
  "id": "fireball", "name": "火球", "icon": "icon_fireball",
  "maxLevel": 8, "initial": true,
  "levels": [ { "level": 1, "damage": 8, "cooldown": 900, "count": 1,
                "pierce": 0, "explosionRadius": 12, "knockback": 40, "visual": "small" }, ... ],
  "evolution": { "id": "infernal_barrage", "name": "業火弾幕",
                 "requires": [ { "skill": "fireball", "level": 8 },
                               { "skill": "orbiting_flame", "level": 4 } ] }
}, ... ] }
```
- `levels` の要素数は `maxLevel` と一致し、`level` は 1..maxLevel の連番。
- `cooldown` と `damage` は非負。
- `evolution.requires[].skill` は存在するスキル id。`level >= 1`。
- レベルごとに変化させる項目: ダメージ/クールダウン/発射数/範囲/持続/貫通/ノックバック/連鎖/爆発/見た目。

## permanent-upgrades.json
```jsonc
{ "currency": "ember",
  "upgrades": [ {
    "id": "max_hp", "displayName": "最大HP", "description": "戦闘開始時の最大HPを増やす",
    "maxLevel": 20, "baseCost": 10, "costGrowth": 1.28,
    "effectType": "maxHpAdd", "effectPerLevel": 10,
    "unlockCondition": null, "displayOrder": 1
  }, ... ] }
```
必須: `id, displayName, maxLevel, baseCost, costGrowth, effectType, effectPerLevel, displayOrder`。
- `maxLevel >= 1`、`costGrowth >= 1`。費用は `floor(baseCost * costGrowth^currentLevel)`。
- `effectType` は既知の値のみ: `maxHpAdd / damageMult / moveSpeedMult / xpMult / pickupMult /
  dashRechargeMult / invulnMult / emberMult / autoMoveSkill / startSkillLevel`。
- 累積効果は `effectPerLevel * level`。`dashRechargeMult` のみ回復“時間”を短縮（減算）。
- `unlockCondition`: `null` または `{ "type": "highestCleared", "value": N }`（難易度Nクリアで解放）。

## skill-mastery.json（M3）
```jsonc
{
  "maxLevel": 20,
  "exp": { "perDamage": 0.08, "perHit": 0.5, "perKill": 1.5, "perRun": 40,
           "curveBase": 120, "curveGrowth": 1.22 },
  "rewards": { "damagePerLevel": 0.004, "cooldownPerLevel": 0.002, "radiusPerLevel": 0.003,
               "cooldownMinMult": 0.7, "startLevelThresholds": [10, 20] }
}
```
必須: `maxLevel, exp, rewards`。`exp.curveGrowth > 1`。
- 熟練度経験値 = `累計ダメージ×perDamage + 命中×perHit + 討伐×perKill + 使用周回×perRun`。
- レベルnに必要な追加経験値 = `curveBase * curveGrowth^(n-1)`（累積で判定）。
- 報酬は小さめの基礎補正。Lv1 は恒等（M2 の威力を変えない）。
- `evolution` ブロック（M4）: `baseCandidateChance` と `candidateRateLevel/candidateRateBonus`（Lv5 候補率↑）、
  `startLevel2Level`（Lv10 初期Lv2、`rewards.startLevelThresholds[0]` と対応）、`relaxLevel/relaxAmount`（Lv15 進化条件緩和）、
  `bonusLevel` と `bonus`（Lv20 進化後スキルの追加効果）。

## skill-evolutions.json（M4）
```jsonc
{ "evolutions": [ {
  "id": "infernal_barrage", "displayName": "業火弾幕", "description": "...",
  "baseSkillId": "fireball",                      // 既存スキル
  "requiredSkills": [{ "skill": "orbiting_flame", "level": 4 }],  // 既存スキル・1..8
  "requiredMasteryLevel": 0,
  "replacementSkillId": "infernal_barrage",        // 基礎スキルと衝突不可（循環参照防止）
  "visualTier": "evolved", "icon": "icon_fireball",
  "damage": {...}, "cooldown": 520, "area": {...}, "projectileCount": {...}, "chain": {...},
  "safetyCaps": { "maxProjectilesPerCast": 14, ... },  // 負値不可
  "displayOrder": 1
}, ... ] }
```
検証: 存在しない基礎/補助スキル参照・不正な必要レベル(1..8)・ID重複・基礎スキルの重複進化・
循環参照(replacementSkillId が基礎スキルと衝突)・安全上限の負値。

## balance.combatCaps（M4）
```jsonc
"combatCaps": {
  "maxAoePerFrame": 8, "maxDamageNumbersPerFrame": 24, "maxExtraFireballs": 40,
  "maxDeathExplosionChain": 3, "maxInfectGenerations": 3,
  "particleBudget": { "low": 40, "medium": 120, "high": 260, "ultra": 480 }
}
"speedModes": [1, 1.5, 2]
```
毎フレームの安全上限。上限到達でも戦闘ロジックは停止しない。

## balance.save（M5-B）
```jsonc
"save": {
  "formatVersion": 1,            // エンベロープ形式の版（正の整数）
  "exportFormatVersion": 1,      // JSON 一式エクスポートの版（正の整数）
  "folderName": "ReincarnationFlameSurvivorData",
  "maxAutoBackups": 10,          // 自動バックアップ最大世代（>=1）
  "maxManualBackups": 5,         // 手動バックアップ最大世代（>=1）
  "autoBackupMinIntervalSec": 300, // 自動バックアップの最小間隔（秒・>=0）
  "maxImportBytes": 2097152,     // インポート可能な最大バイト（>0）
  "autosaveDebounceMs": 800      // 保存要求のデバウンス（ms・>=0）
}
```
保存レイヤー（`src/storage/*`）の設定を集約する。検証: 必須項目・formatVersion/exportFormatVersion が正の整数・
maxAutoBackups/maxManualBackups が 1 以上の整数・autoBackupMinIntervalSec が非負・maxImportBytes が正・
autosaveDebounceMs が非負・folderName が非空。`saveVersion` は M5-B で `5`（v1〜v4 から移行）。

## balance.spatialGrid（M5-A）
```jsonc
"spatialGrid": {
  "cellSize": 64,            // グリッド1セルの一辺(px)。正の整数。
  "maxRegistered": 4000,     // グリッド登録上限（同時出現しうる敵の最大数以上）。
  "enabledByDefault": true   // リリース時の初期状態（空間グリッド ON）。真偽値。
}
```
- 敵と経験値ジェムの近傍検索に使う空間ハッシュグリッドの設定（`src/systems/SpatialGrid.js`）。
- 検証: `cellSize` は正の整数、`maxRegistered` は正の数かつ品質別 `maxEnemies` の最大以上、
  `enabledByDefault` は真偽値、必須項目（cellSize/maxRegistered/enabledByDefault）の存在。
- セルサイズは「敵の当たり半径 + よく使う検索半径」程度が目安。小さすぎると走査セルが増え、
  大きすぎると1セルの候補が増える。既定 64px は火球爆発/軌跡/オーラ半径に対して概ね良好。

## balance.effectQuality の上限（M5-A で明確化）
```jsonc
"effectQuality": {
  "low":    { "particleScale": 0.25, ..., "maxEnemies": 60,  "maxProjectiles": 120, "maxSparksPerBurst": 3 },
  "medium": { "particleScale": 0.5,  ..., "maxEnemies": 120, "maxProjectiles": 250, "maxSparksPerBurst": 6 },
  "high":   { "particleScale": 1.0,  ..., "maxEnemies": 200, "maxProjectiles": 400, "maxSparksPerBurst": 10 },
  "ultra":  { "particleScale": 1.5,  ..., "maxEnemies": 320, "maxProjectiles": 700, "maxSparksPerBurst": 16 }
}
```
品質別の上限はすべて `balance.json` に集約する（コードへ散在させない）。役割:
- `maxEnemies` / `maxProjectiles`: 敵プール・弾プールの上限（同時表示数）。
- `maxSparksPerBurst`: 火の粉1回あたりの粒子数上限（`EffectManager.sparks`）。現行値以上のため見た目は不変。
- `particleScale` / `damageNumbers` / `screenShake` / `whiteFlash`: 粒子量・数字・揺れ・白フラッシュの有効/倍率。
- 1フレームの粒子総量は `combatCaps.particleBudget[quality]`、ダメージ数字は `combatCaps.maxDamageNumbersPerFrame`。
- 爆発/衝撃波/残像/焼け跡は上記 particleBudget と particleScale の配下（個別上限は持たず、予算で制御）。
- 検証: 各品質に `maxEnemies/maxProjectiles/maxSparksPerBurst/particleScale` が存在し正であること、
  および品質順（low→ultra）で `maxEnemies`・`maxProjectiles`・`maxSparksPerBurst`・`particleBudget` が
  **単調非減少**（low > medium などの逆転を検出）であること。低品質でも攻撃命中・進化・ボス予告・
  プレイヤー位置・敵弾は必ず視認できる（これらは粒子予算に依らず描画される）。

## reincarnation.json（M4）
```jsonc
{
  "currency": "soulflame",
  "unlock": { "clearDifficulty": 3, "totalEmber": 5000 },   // 転生条件（今周回の進捗で判定）
  "startDifficulty": 1,
  "perReincarnationDamage": 0.03,                            // 転生回数あたりの基礎ダメージ倍率
  "soulflame": { "emberLogBase": 3.0, "emberLogDiv": 2000, "difficultyPerLevel": 1.0,
                 "bossSqrt": 0.5, "reincarnationBonus": 0.5, "masterySqrt": 0.4, "minFirst": 1 },
  "reset": [...], "keep": [...],
  "nodes": [ {
    "id": "extra_choice", "displayName": "選択肢拡張", "description": "...",
    "maxLevel": 1, "baseCost": 6, "costGrowth": 1,
    "effectType": "levelUpChoices", "effectPerLevel": 1,
    "prerequisite": null, "displayOrder": 1
  }, ... ] }
```
必須: `nodes, unlock, soulflame`。unlock は `clearDifficulty, totalEmber`。各ノード
`id, displayName, maxLevel, baseCost, costGrowth, effectType, effectPerLevel, displayOrder`。
`effectType` は既知の値のみ（levelUpChoices/startDamageMult/startSkillLevel/chainCount/enemyDensity/
effectCap/permCap/speedMode/autoDash/startEmber）。`prerequisite` は `null` か存在するノード id。
- **魂炎計算**: `floor( emberLogBase·log2(1+累計残り火/emberLogDiv) + 過去最高難易度·difficultyPerLevel
  + √ボス討伐·bossSqrt + 転生回数·reincarnationBonus + √熟練度合計·masterySqrt )`、条件達成時は最低 `minFirst`。
- 転生条件は farming 防止のため**今周回(cycle)の進捗**（`currentCycle.cycleEmbers` と当周回の `highestClearedDifficulty`）で判定。
