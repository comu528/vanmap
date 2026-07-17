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

## Milestone 6-A: スキル抽選基盤（skill-config / passives / jobs / skills メタ）

### skill-config.json
```jsonc
{
  "rarityWeights": { "common": 100, "uncommon": 55, "rare": 20, "legendary": 5 }, // レアリティ抽選重み(>0)
  "rarityOrder": ["common", "uncommon", "rare", "legendary"],
  "slots": { "baseActiveSlots": 4, "basePassiveSlots": 4 },   // 初期所持枠(>=1)
  "draft": { "baseRerolls": 1, "baseBanishes": 1, "baseSkips": 1 }, // 1周の初期回数(>=0)
  "modifierKeys": ["damage","cooldown","area","duration","projectileCount", ...], // 将来の modifier 一覧
  "passiveModifierDefaults": { "cooldownMinMult": 0.5 }        // クールダウン倍率の安全下限
}
```
抽選の重み・枠・回数・modifier をコードへ散在させず集約する。検証: rarityWeights が4段階すべて正・slots/draft の必須項目。

### passives.json（共通パッシブ）
```jsonc
{ "passives": [ {
  "id": "power_amp", "displayName": "魔力増幅", "description": "...",
  "category": "passive", "tags": ["offense","common"], "rarity": "uncommon", "weight": 1,
  "jobs": [], "isCommon": true, "maxLevel": 5, "prerequisites": [], "conflicts": [],
  "unlockCondition": null, "evolutionBranches": [], "displayOrder": 1, "iconKey": "icon_fireball", "enabled": true,
  "modifiers": [ { "key": "damage", "op": "addMult", "perLevel": 0.06 } ]
}, ... ] }
```
`modifiers[].op`: `addMult`(倍率 1+Σ) / `subMult`(倍率 1−Σ、下限あり) / `add`(加算)。`key` は `skill-config.modifierKeys` に含まれること。
検証: 必須項目・rarity・maxLevel>=1・自己 conflict 禁止・modifier key の妥当性。M6-A の4種:
魔力増幅(damage +6%/Lv) / 高速詠唱(cooldown −4%/Lv・下限0.5) / 焦熱拡張(area +5%/Lv) / 残火持続(duration +8%/Lv)。

### jobs.json（ジョブ）
```jsonc
{ "jobs": [ {
  "id": "flame_witch", "displayName": "火の魔女", "description": "...",
  "initialActiveSkills": ["fireball"], "initialPassiveSkills": [],
  "activeSkillPool": ["fireball","flame_pillar","burning_trail","orbiting_flame","meteor"],
  "passiveSkillPool": [], "baseActiveSlots": 4, "basePassiveSlots": 4,
  "tags": ["fire","witch","starter"], "unlockCondition": null,
  "futureInheritanceSettings": { "enabled": false, "maxInheritedSkills": 0, "allowedTags": [], "allowedCategories": ["active","passive"] }
}, ... ] }
```
検証: 必須項目・初期スキルが各プールに存在・プール ID がカタログに存在。共通パッシブ(isCommon)は全ジョブで抽選対象。
`futureInheritanceSettings` は将来の継承枠の拡張口（M6-A は未使用）。

### skills.json（active）の抽選メタ拡張
既存の active 5種へ次を追加（**戦闘数値やレベル効果は不変**）: `category:"active"`, `iconKey`, `tags`, `rarity`,
`weight`, `jobs`, `isCommon`, `prerequisites`, `conflicts`, `unlockCondition`, `evolutionBranches`, `displayOrder`, `modifiers`, `enabled`。
`evolutionBranches` は基礎 active に対応する進化 id 配列（例: fireball→["infernal_barrage"]）。検証: rarity/weight/自己conflict/
evolutionBranches が既存進化を参照。前提条件の循環・自己 conflict は skills+passives 横断で検証する。

### reincarnation.json: active_skill_slots（魂炎強化）
`effectType:"activeSlots"`, `maxLevel:2`, `effectPerLevel:2`。アクティブ枠を **base4 → Lv1で6 → Lv2で8**。
`REINC_EFFECT_TYPES` に `activeSlots` を追加。検証で 4→6→8 を確認。

## Milestone 6-B: 火の魔女スキル拡張（新 active 10 / 新進化 5 / skillCaps）

### skills.json（新 active 10種を追記）
既存の active メタ（`category/iconKey/tags/rarity/weight/jobs/isCommon/prerequisites/conflicts/unlockCondition/
evolutionBranches/displayOrder/modifiers/enabled`）に加え、各スキルは `maxLevel:8`・`initial:false`・
`jobs:["flame_witch"]`・`isCommon:false` を持ち、8要素の `levels`（`level` は 1..8 の連番・毎レベルで変化）を持つ。
`levels` のフィールドはスキルの役割ごとに異なる（値は JSON にのみ持ち、コードへ重複させない）。
```jsonc
// 例: 起爆刻印 detonation_mark（rare）
{ "id": "detonation_mark", "category": "active", "rarity": "rare", "jobs": ["flame_witch"], "isCommon": false,
  "maxLevel": 8, "evolutionBranches": ["apocalypse_chain"], "displayOrder": 15, "iconKey": "icon_detonation_mark",
  "levels": [ { "level": 1, "cooldown": 3000, "markCount": 2, "hitsNeeded": 3, "detonateDamage": 24,
                "detonateRadius": 40, "markDuration": 4000, "deathDamage": 12, "visual": "small" }, ... ] }
```
- 役割別の主な `levels` フィールド: flame_lance(damage/cooldown/count/pierce/speed/spread) / scatter_flame(count/spread/…) /
  homing_wisp(homingSpeed/duration/retargets/wanderMs/…) / chain_flame(chainCount/chainRange/falloff/…) /
  lava_bomb(radius/telegraph/burnDuration/burnDamage/…) / flame_vortex(radius/duration/pull/tickRate/maxActive/endBurst) /
  fire_spirit(count/shotDamage/shotInterval/shotSpeed/range/pierce) / phoenix_feather(cooldown/healPercent/explosionDamage/
  explosionRadius/invulnMs) / flame_barrier(cooldown/duration/hits/reduction/retaliateDamage/retaliateRadius) /
  detonation_mark(markCount/hitsNeeded/detonateDamage/detonateRadius/markDuration/deathDamage)。
- rarity: flame_lance/scatter_flame=common、homing_wisp/lava_bomb/fire_spirit/flame_barrier=uncommon、
  chain_flame/flame_vortex/detonation_mark=rare、phoenix_feather=legendary（抽選重みは `skill-config.rarityWeights` を再利用）。
- `evolutionBranches` は進化を持つ5種のみ非空（flame_lance/homing_wisp/lava_bomb/flame_vortex/detonation_mark）、他3種は空。
- `jobs.json` の `flame_witch.activeSkillPool` へ10種を追加し **15種**にする。
- 検証（`tests/new-fire-skills.mjs`）: 10種の存在/一意/active/maxLevel8/Lv連番/rarity一致/専用(isCommon:false)/プール所属/
  負ダメージ・CD無し/毎レベル成長/`evolutionBranches` が実在進化のみ、および抽選出現（決定論・満枠/最大Lv除外・追放非再出現・
  legendary も出現しうる）。

### skill-evolutions.json（新進化5種を追記）
既存の進化メタ（`id/displayName/description/baseSkillId/requiredSkills/requiredMasteryLevel/replacementSkillId/
visualTier/icon/damage/cooldown/area/…/safetyCaps/displayOrder`）に準拠。**補助条件 `requiredSkills[].skill` は
active に加え passive（`passives.json` の id）も指定できる**（例: `swift_cast`/`scorch_expand`/`power_amp`）。
```jsonc
{ "id": "apocalypse_chain", "baseSkillId": "detonation_mark", "replacementSkillId": "apocalypse_chain",
  "requiredSkills": [ { "skill": "power_amp", "level": 4 } ],   // power_amp はパッシブ
  "requiredMasteryLevel": 0,
  "safetyCaps": { "maxChainDepth": 6, "maxSpreadPerChain": 4, "maxMarks": 40 }, "displayOrder": 8 }
```
- 5種: thousand_flame_lances(炎槍+高速詠唱) / hundred_wisp_parade(追尾鬼火+火の精霊) / solar_core_collapse(溶岩爆弾+焦熱拡張) /
  infernal_vortex_wheel(火炎渦+燃える軌跡) / apocalypse_chain(起爆刻印+魔力増幅)。`replacementSkillId` は自身＝基礎スキルと衝突しない。
- 検証（`validate-data.mjs`・`tests/new-evolutions.mjs`）: 補助 `requiredSkills[].skill` は active∪passive に実在
  （`auxSkillIds = skillIds ∪ passiveIds`）、必要Lv1..8、`safetyCaps` 非負、`EvolutionManager.canEvolve` に `levelOf`
  （active→passive 解決）を渡して 基礎Lv8＋補助Lv4 で可能・補助未達/基礎未達で不可、既存3進化の非回帰。

### balance.skillCaps（性能上限・品質別）
```jsonc
"skillCaps": {
  "maxFlameLances":      { "low": 24, "medium": 48, "high": 80, "ultra": 120 },
  "maxHomingWisps":      { "low": 16, "medium": 30, "high": 50, "ultra": 80 },
  "maxSplitWisps":       { "low": 8,  "medium": 16, "high": 28, "ultra": 40 },
  "maxSummons":          { "low": 4,  "medium": 6,  "high": 8,  "ultra": 10 },
  "maxSummonProjectiles":{ "low": 20, "medium": 40, "high": 70, "ultra": 100 },
  "maxActiveVortices":   { "low": 2,  "medium": 3,  "high": 4,  "ultra": 6  },
  "maxMarks":            { "low": 10, "medium": 18, "high": 30, "ultra": 40 },
  "maxChainTargets":     { "low": 4,  "medium": 6,  "high": 8,  "ultra": 10 },
  "maxChainDepth":       { "low": 4,  "medium": 6,  "high": 8,  "ultra": 10 },
  "maxSimultaneousExplosions": { "low": 3, "medium": 5, "high": 8, "ultra": 10 },
  "maxEvolutionProjectiles":   { "low": 40, "medium": 80, "high": 140, "ultra": 220 },
  "maxPhoenixEffects":   { "low": 1,  "medium": 1,  "high": 2,  "ultra": 2  },
  "maxBarrierEffects":   { "low": 1,  "medium": 2,  "high": 2,  "ultra": 3  }
}
```
- スキル挙動（追尾/召喚/渦/刻印/連鎖/爆発）の同時数を品質別に制限する毎フレーム予算。`DataManager.skillCap(name, quality, fallback)` で取得。
- 上限に達しても**戦闘ロジックは停止しない**（新規生成を抑えるだけ・命中判定は既存分に対して厳密に行う）。
- 検証: 全キーが `low <= medium <= high <= ultra`（品質順で逆転しない）・非負整数。低品質でも命中/刻印/不死鳥/障壁/ボス予告/
  プレイヤー/敵/敵弾は視認できる（`skillCaps` は演出でなく生成数の上限であり、視認性は別途保証）。

## Milestone 6-C: 火の魔女ジョブ育成（`data/job-progression.json` 新規）

周回をまたいで維持されるジョブレベルの曲線・報酬・到達報酬を定義する新規データファイル。効果は火の魔女使用中の周回のみ有効で、
数値はすべてこのファイルに集約する（コードへ散在させない）。`jobs.<id>` キーで将来の複数ジョブへ拡張できる。

### job-progression.json（全体構造）
```jsonc
{
  "version": 1,
  "jobs": {
    "flame_witch": {
      "jobId": "flame_witch",           // jobs.json の id と一致
      "displayName": "火の魔女", "description": "...", "enabled": true,
      "levelCap": 100,                   // 火の魔女は最大 Lv100
      "xpCurve": { "quad": 25, "lin": 75 },  // 累計必要XP = quad*(L-1)^2 + lin*(L-1)（Lv1=0）
      "xpReward": {                      // 周回終了時のジョブXP（勝敗両方で獲得）
        "perSurvivalSecond": 1.2, "perNormalKill": 0.08, "normalKillCap": 2000,
        "perEliteKill": 4, "perBossKill": 60, "victoryBonus": 200,
        "difficultyMult": { "1": 1.0, "2": 1.25, "3": 1.55, "4": 1.9, "5": 2.3 }  // base に乗算
      },
      "perLevelBonuses": {               // 毎レベルの基本成長（Lv1 は 0＝恒等）
        "fireDamagePerLevel": 0.0035,    // 炎属性ダメージ +0.35%/Lv（Lv100で+34.65%）
        "fireDotPerLevel": 0.005,        // 炎上・火属性DoT +0.50%/Lv（Lv100で+49.5%）
        "fireAreaPerLevel": 0.001        // 火属性範囲 +0.10%/Lv（Lv100で+9.9%）
      },
      "milestones": [ /* 到達レベル報酬（下表・level 昇順） */ ]
    }
  }
}
```
- **累計必要XP**: `totalXpForLevel(L) = quad*(L-1)^2 + lin*(L-1)`。例 Lv2=100 / Lv10=2700 / Lv50=63700 / Lv100=252450。`jobLevel` は保存せず `totalXp` から都度算出する。
- **周回XP**: `survivalSec*perSurvivalSecond + min(normalKills,normalKillCap)*perNormalKill + eliteKills*perEliteKill + bossKills*perBossKill + (win?victoryBonus:0)` に `difficultyMult` を乗じて `floor`。通常敵は `normalKillCap`(2000) で頭打ち。

### milestones（到達レベル報酬・`type` 別）
各要素は `{ level, id, type, label, description, ...type固有の数値 }`。`type` ごとの数値フィールドは次の通り。
| level | type | 固有フィールド | 効果 |
|-------|------|----------------|------|
| 5 | `fireDamageMult` | `value:0.05` | 火ダメージ +5%（基本成長へ加算） |
| 10 | `projectileSpeedMult` | `value:0.10` | 火属性 projectile の投射速度 +10% |
| 20 | `cooldownMult` | `value:0.05` | 火属性 active の CD −5%（`*(1-value)`・乗算合成） |
| 30 | `rerollBonus` | `value:1` | 周回開始時リロール +1 |
| 40 | `explosion` | `damage:0.15, area:0.10` | 火属性爆発ダメージ +15% ＆ 爆発範囲 +10% |
| 50 | `echo` | `interval:12, power:0.6` | 残響詠唱: 12回発動ごとに直前の攻撃を追加発動（威力60%） |
| 60 | `evolvedDamageMult` | `value:0.20` | 進化スキルの全ダメージ +20% |
| 70 | `rarityWeight` | `rare:1.15, legendary:1.25` | 抽選重み rare ×1.15 / legendary ×1.25（common/uncommon 不変） |
| 80 | `projectileCount` | `value:1` | 火属性 active の発射数 +1 |
| 90 | `cooldownMult` | `value:0.10` | 火属性 active の CD を追加で −10%（Lv20 と乗算共存 0.95×0.90） |
| 100 | `echoUpgrade` | `interval:8, power:1.0` | 残響を 8回発動ごと・威力100% へ強化 |

### balance.json: combatCaps.maxEchoPerFrame
```jsonc
"combatCaps": { ..., "maxEchoPerFrame": 4 }
```
残響（Lv50/100）の追加発動が1フレームに走る上限（=4）。到達しても戦闘ロジックは停止しない。

### 検証（`tests/validate-data.mjs`・`tests/job-progression.mjs`・`tests/job-modifiers.mjs`）
`validate-data.mjs` が `job-progression.json` について次を確認する:
- **必須項目**（`version`/`jobs`、各ジョブの `levelCap`/`xpCurve`/`xpReward`/`perLevelBonuses`/`milestones`）と `jobs.json` との **jobId 整合**（未知ジョブを弾く）。
- `levelCap` は **正整数**。`xpCurve` 係数は **非負の有限数**（Lv1累計=0・XP曲線が単調増加であること）。
- `xpReward` 係数は **非負**、`difficultyMult` は **正**、`perLevelBonuses` は **非負**。
- `milestones` は **レベル昇順・重複なし・1..levelCap** の範囲・報酬 **id 重複なし**・**既知 type のみ**（未知 type を弾く）。
- type 固有: `echo`/`echoUpgrade` の残響回数 `interval` は **正整数**・倍率 `power` は **非負**、`rarityWeight` の抽選重み(rare/legendary)は **正**、`projectileCount` の value は **整数**、`cooldownMult` の value は **0..1**。
- 数値フィールドは **NaN 相当（非有限）を拒否**。
- `job-progression.mjs` は XP曲線（累計XP・単調増加・Lv100頭打ち・巨大XP/負数/NaN の安全化）を、`job-modifiers.mjs` は補正解決（Lv1恒等・各 milestone の乗算合成・残響カウンター・凍結の直列化/復元）を検証する。

## Milestone 6-D: 火の魔女ビルド拡張・第2波（`skills.json`/`skill-evolutions.json`/`balance.json` を加算的に拡張）

新 active 10種・進化5種を追加し、既存構造へ **echo/clone ポリシーの cast フィールドを追加** する。既存15 active・8進化・4 passive・データ形式は変更しない。結果は active 25種・進化13種・passive 4種で、`jobs.json` の `activeSkillPool` は25種。

### skills.json の新 active10種（cast フィールド追加）
各スキルは従来どおり `id`/`name`/`rarity`/`element`/`levels`（Lv1〜8）/`evolutionBranches` を持ち、加えて残響・分身複製の挙動を制御する **cast フィールド** を持つ。
```jsonc
{
  "id": "bloodfire_pact", "name": "血炎契約", "rarity": "rare", "element": "fire",
  "echoPolicy": "custom",          // 'standard' | 'custom' | 'forbidden'（残響の複製方式）
  "clonePolicy": "custom",         // 'standard' | 'custom' | 'forbidden'（灰燼分身の複製方式）
  "isDefensive": false,            // 防御目的（残響・複製の対象外にする）
  "isReactive": false,             // 反応型（敵弾/被弾トリガー。残響・複製の対象外）
  "usesResourceCost": true,        // HP等のコストを消費する（custom で再消費させない）
  "canTriggerEcho": true,          // Job残響(Lv50/100)のカウント対象か
  "canBeCopiedByClone": true,      // 灰燼分身がコピーできるか
  "evolutionBranches": [],         // 進化なし（跳炎弾/血炎契約/四方炎獄/熔火鎖/爆炎歩法は空）
  "levels": [ /* Lv1〜8 */ ]
}
```
- **10種の cast 設定**（実装値）:
  - `scorching_ray`(uncommon)/`ember_minefield`(common)/`flame_crescent`(common)/`ricochet_ember`(common)/`four_sided_inferno`(rare)/`molten_chains`(uncommon): `echoPolicy=clonePolicy=standard`・`canTriggerEcho=canBeCopiedByClone=true`・非防御/非反応/非コスト（通常の攻撃 active）。
  - `bloodfire_pact`(rare): `echo/clone=custom`・`usesResourceCost=true`（HP を再消費せず攻撃部分のみ複製）。
  - `bullet_furnace`(legendary): `echo/clone=custom`・`isDefensive=isReactive=true`・`canTriggerEcho=canBeCopiedByClone=false`（チャージを再消費せず放出のみ複製）。
  - `ash_doppelganger`(rare): `echo/clone=forbidden`・全カウント false（分身が分身を増殖させない）。
  - `blazing_step`(uncommon): `echo/clone=forbidden`・`isReactive=true`（移動系。残響/複製でダッシュしない）。
- `evolutionBranches`: 進化を持つのは `scorching_ray`(→`solar_annihilation_array`) など5種のみ。残り5種は空配列。

### skill-evolutions.json の新進化5種（同じ cast フィールド）
進化エントリも基礎 active と同じ cast フィールドを持ち、`requiredSkills` の補助条件に passive を含められる（M6-B と同じく `auxSkillIds = skillIds ∪ passiveIds`）。
```jsonc
{ "id": "solar_annihilation_array", "baseSkillId": "scorching_ray",
  "replacementSkillId": "solar_annihilation_array",
  "requiredSkills": [ { "skill": "swift_cast", "level": 4 } ],   // swift_cast はパッシブ
  "echoPolicy": "standard", "clonePolicy": "standard",
  "isDefensive": false, "isReactive": false, "usesResourceCost": false,
  "canTriggerEcho": true, "canBeCopiedByClone": true,
  "safetyCaps": { "maxSolarMirrors": 6, "maxActiveBeams": 10, "maxBeamTicksPerFrame": 40, "maxSimultaneousExplosions": 6 },
  "displayOrder": 9 }
```
- 5種: `solar_annihilation_array`(灼熱光線+高速詠唱[passive]) / `hellfire_mine_network`(火種地雷+起爆刻印) / `inferno_blade_domain`(炎月斬+炎の障壁) / `ash_legion`(灰燼分身+火の精霊) / `star_devouring_furnace`(弾喰い炉+不死鳥の羽)。いずれも基礎Lv8＋補助Lv4。
- cast フィールドは基礎スキルを継承（`ash_legion`=forbidden・`star_devouring_furnace`=custom/防御反応・他3種=standard）。`replacementSkillId` は自身＝基礎スキルと衝突しない。

### balance.skillCaps（第2波の新キー・品質別）
M6-B の `skillCaps` へ品質別の新キーを加算的に追加する。全キーが `low <= medium <= high <= ultra`・非負整数。
```jsonc
"skillCaps": {
  /* …M6-B の既存キー… */
  "maxActiveBeams":            { "low": 2,  "medium": 3,  "high": 5,   "ultra": 7   },
  "maxBeamTicksPerFrame":      { "low": 12, "medium": 24, "high": 40,  "ultra": 60  },
  "maxMines":                  { "low": 20, "medium": 30, "high": 40,  "ultra": 60  },
  "maxMineExplosionsPerFrame": { "low": 3,  "medium": 5,  "high": 6,   "ultra": 8   },
  "maxRicochetProjectiles":    { "low": 16, "medium": 28, "high": 44,  "ultra": 64  },
  "maxRicochetChecksPerFrame": { "low": 40, "medium": 80, "high": 140, "ultra": 220 },
  "maxClones":                 { "low": 2,  "medium": 3,  "high": 4,   "ultra": 5   },
  "maxCloneCastsPerFrame":     { "low": 2,  "medium": 3,  "high": 4,   "ultra": 6   },
  "maxBloodfireProjectiles":   { "low": 12, "medium": 20, "high": 32,  "ultra": 48  },
  "maxAbsorbedBulletsPerSecond":{ "low": 8, "medium": 12, "high": 16,  "ultra": 24  },
  "maxFurnaceCharge":          { "low": 8,  "medium": 10, "high": 14,  "ultra": 18  },
  "maxFurnaceProjectiles":     { "low": 24, "medium": 48, "high": 90,  "ultra": 160 },
  "maxScreenEdgeWaves":        { "low": 2,  "medium": 3,  "high": 4,   "ultra": 4   },
  "maxTethers":                { "low": 6,  "medium": 10, "high": 16,  "ultra": 24  },
  "maxTetherRetargetsPerFrame":{ "low": 2,  "medium": 4,  "high": 6,   "ultra": 8   },
  "maxBlazingTrails":          { "low": 16, "medium": 28, "high": 44,  "ultra": 64  },
  "maxSolarMirrors":           { "low": 4,  "medium": 5,  "high": 6,   "ultra": 8   },
  "maxMineNetworkDepth":       { "low": 3,  "medium": 4,  "high": 6,   "ultra": 8   },
  "maxMineNetworkExplosions":  { "low": 10, "medium": 16, "high": 24,  "ultra": 32  },
  "maxInfernoBlades":          { "low": 4,  "medium": 6,  "high": 8,   "ultra": 10  },
  "maxAshLegionUnits":         { "low": 4,  "medium": 6,  "high": 8,   "ultra": 10  },
  "maxAshLegionCastsPerFrame": { "low": 2,  "medium": 3,  "high": 4,   "ultra": 6   },
  "maxStarFurnaceCores":       { "low": 3,  "medium": 4,  "high": 6,   "ultra": 8   },
  "maxStarFurnaceProjectiles": { "low": 40, "medium": 80, "high": 140, "ultra": 220 },
  "maxCopyGeneration":         { "low": 1,  "medium": 1,  "high": 1,   "ultra": 1   },
  "maxEchoCloneGeneration":    { "low": 1,  "medium": 1,  "high": 1,   "ultra": 1   }
}
```
- `maxCopyGeneration`/`maxEchoCloneGeneration` は複製世代の上限で **品質によらず 1**（normal 由来のみ echo/clone を1世代・再帰不可）。`DataManager.skillCap(name, quality, fallback)` で取得し、上限に達しても戦闘ロジックは停止しない。

### 検証（`tests/validate-data.mjs`・`tests/fire-skills-wave2.mjs`・`tests/fire-evolutions-wave2.mjs`・`tests/cast-copy-safety.mjs`）
`validate-data.mjs` が第2波について次を追加確認する:
- **cast ポリシーの妥当性**: `echoPolicy`/`clonePolicy` は `standard`/`custom`/`forbidden` のいずれか、`isDefensive`/`isReactive`/`usesResourceCost`/`canTriggerEcho`/`canBeCopiedByClone` は真偽値。
- **forbidden と canTrigger の整合**: `echoPolicy=forbidden` のとき `canTriggerEcho=false`、`clonePolicy=forbidden` のとき `canBeCopiedByClone=false`（矛盾を弾く）。防御/反応スキルが残響・複製対象にならないこと。
- **世代上限**: `maxCopyGeneration`/`maxEchoCloneGeneration` が全品質で **1以上**（再帰不可を保証・逆に無限世代を許さない）。
- 新 active10種・進化5種の `id`/`rarity`/`levels`(1..8)/`evolutionBranches`・`baseSkillId`/`replacementSkillId`/`requiredSkills`(active∪passive に実在・Lv1..8)/`safetyCaps`(非負) の整合、既存 skillCaps と同様の品質順(`low<=medium<=high<=ultra`)・非負整数。
- `fire-skills-wave2.mjs` は新 active のデータ整合・抽選出現/満枠/最大Lv/追放/決定論・skillCaps 品質順を、`fire-evolutions-wave2.mjs` は新進化の `canEvolve`（パッシブ補助含む・基礎Lv8＋補助Lv4で可能・未達で不可）と既存進化の非回帰を、`cast-copy-safety.mjs` は `CastPolicy` の「normal 由来のみ1世代・echo→*/clone→* 不発・custom は再消費なし・forbidden は複製不可・循環禁止」を純ロジックで検証する。
