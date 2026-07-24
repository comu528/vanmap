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
検証: 必須項目・初期スキルが各プールに存在・プール ID がカタログに存在。
`futureInheritanceSettings` は将来の継承枠の拡張口（M6-A は未使用）。

**passive のジョブ分離（M7-B 追加監査）**: passive の抽選到達性は各ジョブの `passiveSkillPool`（＝正）で判定する（`src/systems/poolEligibility.js` を
`SkillDraftManager`/`SkillCatalog`/シミュレーター/テストで共有）。ジョブ専用 passive は `jobs:["<jobId>"]`・`isCommon:false` とし、対応ジョブの
`passiveSkillPool` に登録する。**`jobs` 未指定（空配列）を暗黙の全ジョブ共通として扱わない**（`isCommon:false` かつ `jobs:[]` は `validate-data` エラー）。
本当に全ジョブ共通の passive のみ `isCommon:true` もしくは `jobs:["*"]` で明示する。現状: 火4種=`jobs:["flame_witch"]`、氷4種=`jobs:["frost_mage"]`、
明示的共通は0種。`validate-data` は「jobs とプールの不一致」「他ジョブ専用 passive のプール混入」「jobs 指定漏れ」を検出する。

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

## Milestone 6-E: 火の魔女ビルド完成・第3波＋全スキル監査（`skills.json`/`skill-evolutions.json`/`balance.json` を加算的に拡張）

新 active 5種・進化5種を追加し、**全 active30種・進化18種**へ監査用フィールド（`castMode`/`mainCastEvent`/`lv80ProjectileTarget`）を明示する。既存25 active・13進化・4 passive・データ形式は変更しない。結果は active 30種・進化18種・passive 4種で、`jobs.json` の `activeSkillPool` は30種。**`saveVersion` は 6 のまま**。

### skills.json の新 active5種（cast＋監査フィールド）
各スキルは従来どおり `id`/`name`/`rarity`/`element`/`maxLevel:8`/`levels`（Lv1〜8・毎レベルで最低1項目成長）/`evolutionBranches` と M6-D の cast フィールド（`echoPolicy`/`clonePolicy`/`isDefensive`/`isReactive`/`usesResourceCost`/`canTriggerEcho`/`canBeCopiedByClone`）を持ち、加えて **監査フィールド** を持つ。
```jsonc
{
  "id": "core_overdrive", "name": "炉心暴走", "rarity": "legendary", "element": "fire",
  "castMode": "cooldown",          // periodic|cooldown|continuous|reactive|defensive|movement|resource
  "mainCastEvent": "onFireVolley", // recordCast する主発動イベント（攻撃サイクル単位）
  "lv80ProjectileTarget": true,    // Job Lv80 発射数+1 の対象か（独立弾の通常 active のみ true）
  "echoPolicy": "standard", "clonePolicy": "custom",  // 攻撃弾のみ再現・熱量/オーバーヒートを変更しない
  "echoDescription": "...", "cloneDescription": "...",
  "canTriggerEcho": true, "canBeCopiedByClone": true,
  "evolutionBranches": ["doomsday_core"],
  "config": { "heatPerCast": 0.12, "maxHeat": 1.0, "overheatMs": 1500 },  // スキル固有の非levels定数
  "levels": [ /* Lv1〜8 */ ]
}
```
- **5種の cast/監査設定**（実装値）:
  - `funeral_pyres`(uncommon)/`magma_vein`(common)/`tri_flame_array`(rare)/`scorching_resonance`(rare): `castMode=periodic`・`echoPolicy=clonePolicy=standard`・`canTriggerEcho=canBeCopiedByClone=true`・`lv80ProjectileTarget=false`（独立弾を撃たない）。
  - `core_overdrive`(legendary): `castMode=cooldown`・`echoPolicy=standard`・`clonePolicy=custom`（攻撃弾のみ再現・**熱量/オーバーヒートを変更しない**）・`lv80ProjectileTarget=true`（唯一の Lv80 対象）。
- 役割別の主な `levels` フィールド: funeral_pyres(fuseMs/eruptionDamage/eruptionRadius/burnDuration/burnDamage/…) / magma_vein(segments/segmentLength/dotDamage/dotDuration/…) / tri_flame_array(radius/dotDamage/edgeDamage/slow/innerBurst/…) / scorching_resonance(interval/pulseDamage/pulseRadius/tierThresholds/burnExtend/…) / core_overdrive(damage/cooldown/count/speed/heatPerCast/maxHeat/overheatMs)。値は JSON にのみ持ち、コードへ重複させない。
- `evolutionBranches` は5種すべて非空（各 active→対応進化1種）。`jobs.json` の `flame_witch.activeSkillPool` へ5種を追加し **30種** にする。
- **既存25 active・13進化へも監査フィールドを追記**（`castMode`/`mainCastEvent`/`lv80ProjectileTarget`）。Lv80対象は fireball/flame_lance/scatter_flame/homing_wisp/ricochet_ember/core_overdrive のみ true・他は全て false。
- 検証（`tests/fire-skills-wave3.mjs`）: 5種の存在/一意/active/maxLevel8/Lv連番/rarity一致/専用(isCommon:false)/プール所属/負ダメージ・CD無し/毎レベル成長/`evolutionBranches` が実在進化のみ、および抽選出現（決定論・満枠/最大Lv除外・追放非再出現・legendary も出現しうる）。

### skill-evolutions.json の新進化5種（同じ cast＋監査フィールド）
進化エントリも基礎 active と同じ cast/監査フィールドを持ち、`requiredSkills` の補助条件に passive を含められる（`auxSkillIds = skillIds ∪ passiveIds`）。**進化は `lv80ProjectileTarget=false`**（単一形態）。
```jsonc
{ "id": "doomsday_core", "baseSkillId": "core_overdrive", "replacementSkillId": "doomsday_core",
  "requiredSkills": [ { "skill": "bloodfire_pact", "level": 4 } ],
  "castMode": "cooldown", "mainCastEvent": "onFireVolley", "lv80ProjectileTarget": false,
  "echoPolicy": "standard", "clonePolicy": "custom",
  "canTriggerEcho": true, "canBeCopiedByClone": true,
  "safetyCaps": { "maxDoomsdayProjectiles": 220, "maxDoomsdayExplosions": 6 },
  "displayOrder": 18 }
```
- 5種: `necroflame_mausoleum`(火葬の墓標+不死鳥の羽) / `world_scorching_rift`(炎脈走破+燃える軌跡) / `hexagram_inferno_array`(三角焔陣+火炎渦) / `universal_flame_resonance`(灼熱共鳴+連鎖炎) / `doomsday_core`(炉心暴走+血炎契約)。いずれも基礎Lv8＋補助Lv4。`replacementSkillId` は自身＝基礎スキルと衝突しない。
- 検証（`validate-data.mjs`・`tests/fire-evolutions-wave3.mjs`）: 補助 `requiredSkills[].skill` は active∪passive に実在・必要Lv1..8・`safetyCaps` 非負・`canEvolve`（基礎Lv8＋補助Lv4で可能・未達で不可）・既存13進化の非回帰。

### balance.skillCaps（第3波の新キー・品質別）
M6-B/M6-D の `skillCaps` へ品質別の新キーを加算的に追加する。全キーが `low <= medium <= high <= ultra`・非負整数。
```jsonc
"skillCaps": {
  /* …M6-B/M6-D の既存キー… */
  "maxDeathEventsTracked":     { "low": 12, "medium": 20, "high": 32,  "ultra": 48  },
  "maxDeathEventsPerFrame":    { "low": 4,  "medium": 6,  "high": 8,   "ultra": 12  },
  "maxFuneralPyres":           { "low": 6,  "medium": 10, "high": 16,  "ultra": 24  },
  "maxPyreEruptionsPerFrame":  { "low": 2,  "medium": 3,  "high": 4,   "ultra": 6   },
  "maxMagmaVeins":             { "low": 4,  "medium": 6,  "high": 10,  "ultra": 14  },
  "maxMagmaSegments":          { "low": 24, "medium": 40, "high": 64,  "ultra": 96  },
  "maxMagmaIntersections":     { "low": 6,  "medium": 10, "high": 16,  "ultra": 24  },
  "maxTriArrays":              { "low": 3,  "medium": 4,  "high": 6,   "ultra": 8   },
  "maxArrayTicksPerFrame":     { "low": 12, "medium": 24, "high": 40,  "ultra": 60  },
  "maxResonanceTargets":       { "low": 20, "medium": 40, "high": 70,  "ultra": 100 },
  "maxResonanceChains":        { "low": 8,  "medium": 14, "high": 24,  "ultra": 32  },
  "maxResonanceExplosions":    { "low": 3,  "medium": 5,  "high": 8,   "ultra": 10  },
  "maxOverdriveProjectiles":   { "low": 24, "medium": 48, "high": 90,  "ultra": 160 },
  "maxOverdriveCastsPerFrame": { "low": 2,  "medium": 3,  "high": 4,   "ultra": 6   },
  "maxMausoleums":             { "low": 2,  "medium": 3,  "high": 4,   "ultra": 6   },
  "maxHexagramArrays":         { "low": 2,  "medium": 3,  "high": 4,   "ultra": 6   },
  "maxHexagramBeams":          { "low": 6,  "medium": 10, "high": 16,  "ultra": 24  },
  "maxDoomsdayProjectiles":    { "low": 40, "medium": 80, "high": 140, "ultra": 220 },
  "maxDoomsdayExplosions":     { "low": 3,  "medium": 4,  "high": 6,   "ultra": 8   },
  "maxBurningEnemyIndex":      { "low": 60, "medium": 120,"high": 200, "ultra": 320 },
  "maxMainCastEventsPerFrame": { "low": 8,  "medium": 12, "high": 20,  "ultra": 32  }
}
```
- スキル挙動（墓標/噴火/亀裂区間/交差/陣/共鳴/炉心弾/放出/霊廟/六芒陣/炎波/終末弾）の同時数・毎フレーム処理数を品質別に制限する予算。`DataManager.skillCap(name, quality, fallback)` で取得。**上限に達しても攻撃判定は消さず、装飾を先に削る**。
- `maxBurningEnemyIndex` は炎上索引の登録上限、`maxMainCastEventsPerFrame` は主発動イベントの毎フレーム処理上限（残響/分身の起点をまとめて制限）。

### 検証（`tests/validate-data.mjs`・wave3・監査テスト）
`validate-data.mjs` が第3波について次を追加確認する:
- **監査フィールドの妥当性**: `castMode` は既知の enum（periodic/cooldown/continuous/reactive/defensive/movement/resource）、`mainCastEvent` は非空文字列、`lv80ProjectileTarget` は真偽値。`echoDescription`/`cloneDescription` は非空文字列。
- **Lv80対象の整合**: `lv80ProjectileTarget=true` は独立弾を撃つ通常 active のみ（進化・防御・召喚・設置系は false）。
- **共鳴閾値**: `scorching_resonance`/`universal_flame_resonance` の `tierThresholds` が **昇順**（先頭0）であること。
- **炉心熱量**: `core_overdrive`/`doomsday_core` の `heatPerCast`>0・`maxHeat`>0・`overheatMs`>=0。
- **未知タグ検証**: ダメージタグ/`castMode`/`echoPolicy`/`clonePolicy` に未知値が無いこと。
- 新 active5種・進化5種の `id`/`rarity`/`levels`(1..8)/`evolutionBranches`・`baseSkillId`/`replacementSkillId`/`requiredSkills`(active∪passive に実在・Lv1..8)/`safetyCaps`(非負) の整合、新 skillCaps の品質順(`low<=medium<=high<=ultra`)・非負整数。
- `fire-skills-wave3.mjs` は新 active のデータ整合・抽選出現・skillCaps 品質順を、`fire-evolutions-wave3.mjs` は新進化の `canEvolve`（パッシブ補助含む）と既存進化の非回帰を、`skill-tag-audit.mjs` は **全 active30/進化18** の `SkillAudit` 解決（castMode/echo/clone/Lv80/タグの整合・forbidden と canTrigger の整合）を、`cast-event-audit.mjs` は **主発動イベントが攻撃サイクル単位のみ**（DoTtick/連鎖/分裂/召喚通常射撃/共鳴連鎖/オーバーヒート開始終了では recordCast しない）を純ロジックで検証する。既存11スイートも維持し**全15スイートが通過**する。

## Milestone 6-F: 通常プレイ整備・バランス検証基盤（`skill-config.json` 拡張／`balance-thresholds.json` 新規／fallback→JSON）

**新スキルは追加しない**。抽選のシナジー補助・バランス警告のしきい値・一部 fallback 定数を data 側へ集約する。**`saveVersion` は 6 のまま**。

### skill-config.json の `synergy` ブロック（進化相手の軽い抽選補助）
active30種化に伴い進化相手（補助スキル）が候補へ極端に出にくくならないための軽い補助。レアリティ重みへ**乗算**する（無視しない）。
**決定論は不変・data で無効化できる**（`synergyAssistEnabled:false`）。`synergy=null`（＝ブロック無し）扱いは旧挙動と byte 一致。
```jsonc
"synergy": {
  "synergyAssistEnabled": true,
  "synergyAssistMinBattleLevel": 3,            // これ未満の戦闘レベルでは補助しない
  "synergyAssistMaxMultiplier": 2.0,           // 補助倍率の上限
  "evolutionPartnerWeightMultiplier": 1.35,    // 所持基礎の未達な進化相手（補助スキル）
  "ownedSkillUpgradeWeightMultiplier": 1.15,   // 所持スキルの強化
  "nearlyMaxedSkillWeightMultiplier": 1.2,     // Lv8間近のスキル
  "unrelatedNewSkillWeightMultiplier": 1.0,    // 無関係な新規（据え置き）
  "noProgressDraftThreshold": 4,               // 進展のないドラフトがこの回数を超えると
  "noProgressWeightBonus": 0.1,                //   pity として補助を少しずつ加算し
  "noProgressMaxMultiplier": 1.5               //   この倍率まで増やす
}
```
- `SkillDraftManager._synergyMult` がレアリティ重みへ乗算し、乱数の消費順序は変えない（決定論維持）。`ctx.synergy={partnerIds, battleLevel}`。
- 進展のないドラフトが続くと pity（`draftsSinceProgress`）で補助が増え、進化成立で `markProgress()` によりリセットする（`draftsSinceProgress` は `active_run.draftState` に保存）。
- 上限（`synergyAssistMaxMultiplier`／`noProgressMaxMultiplier`）と「legendary を common 並みに増やさない」設計で、特定レシピを確定させない。
- 検証（`validate-data.mjs`）: 各倍率が正・上限 >=1・`synergyAssistMinBattleLevel`/`noProgressDraftThreshold` が非負整数・`synergyAssistEnabled` が真偽値。

### balance-thresholds.json（新規・バランス警告しきい値＋テレメトリ上限）
`BalanceWarnings`（開発用警告・**自動調整はしない**）と `RunBalanceSummary`（テレメトリ集計）が参照する。
```jsonc
{
  "version": 1,
  "warnings": {
    "minSamples": 5,                 // これ未満のサンプルでは警告しない（1〜2周で断定しない）
    "dpsLowPct": 0.25, "dpsHighPct": 3.0,   // 中央比 DPS の低火力/突出しきい値
    "lowUsageDamageShare": 0.01,     // damageShare がこれ未満なら「使われていない」
    "capReachedPerRun": 50,          // 1周の cap 到達がこれ以上なら「上限に当たりすぎ」
    "defensiveValueEpsilon": 1,      // 防御値がほぼ0の防御スキルを検出
    "evolutionFeasibilityMin": 0.15, // 進化成立率がこれ未満なら「到達しづらい」
    "appearanceMin": 0.02            // 抽選出現率がこれ未満なら「出にくい」
  },
  "telemetry": {
    "maxRecentRuns": 10, "maxDebugRuns": 10, // 通常/デバッグ周回の保持上限
    "maxSummarySkills": 80,                  // summaryBySkill の上限
    "softMaxBytes": 262144                   // balanceTelemetry の目安上限
  }
}
```
- 検証（`validate-data.mjs`）: `version` が正整数・`warnings`/`telemetry` の必須キー・各しきい値が有限数・`minSamples`/`max*` が正整数・
  割合系（dpsLowPct/dpsHighPct/lowUsageDamageShare/evolutionFeasibilityMin/appearanceMin）が非負。

### fallback 定数の JSON 移行（コード側 `*_SAFE` の位置づけ）
これまでコードに fallback 定数として持っていた一部の値を `data/skills.json`・`data/skill-evolutions.json` へ移した。
| スキル/進化 | JSON パス | 値 |
|-------------|-----------|----|
| `doomsday_core`（進化） | `overheat.heatAccelPct` | 0.5 |
| `doomsday_core`（進化） | `config.doomFireMs` | 130 |
| `doomsday_core`（進化） | `config.doomBlastMs` | 420 |
| `tri_flame_array` | `config.edgeWidth` | 8 |
| `hexagram_inferno_array`（進化） | `area.outerWidth` | 10 |
| `hexagram_inferno_array`（進化） | `area.beamWidth` | 12 |
| `orbiting_flame` | `config.castPulseMs` | 500 |
| `fire_spirit` | `config.summonPulseMs` | 900 |

- **コードに残る同名の `*_SAFE` 定数はゲームバランス値ではなく、「JSON 欠落時の NaN/undefined 回避のための安全既定」**である。
  通常は JSON 側の値が使われる（**重複定義ではない**）。バランス調整は JSON 側で行う。
- 検証: 上記キーが対象スキル/進化に存在し有限数・`castPulseMs`/`summonPulseMs`/`doomFireMs`/`doomBlastMs` が正、各 width が正。

## Milestone 7-A: 2人目のジョブ・状態異常/凍結（`status-effects.json` 新規／`jobs`・`job-progression`・`skills`・`passives`・`skill-evolutions`・`balance.skillCaps` を加算拡張）

火の魔女は不変のまま、氷術師（frost_mage）と汎用状態異常フレームワークを追加する。数値は `data/status-effects.json` に集約し、
コードへ散在させない。**`saveVersion` は 6 のまま**。属性反応は未実装。

### status-effects.json（新規）
```jsonc
{
  "version": 1,
  "statusEffects": [                        // 状態異常の定義（将来 poison/bleed/shock… を追加できる構造）
    {
      "id": "chill", "displayName": "冷気",
      "kind": "scalar",                     // timed|scalar|damageOverTime|control|immunity|vulnerability
      "element": "ice", "tags": ["ice","slow"],
      "duration": 0, "maxDuration": 0,      // scalar は蓄積値で時間管理しない
      "stackMode": "accumulate",            // accumulate|refresh
      "refreshPolicy": "accumulate",        // accumulate|refresh|noExtend|extendIfLonger
      "tickRate": 0, "decayRate": 12,       // decayRate: 毎秒の自然減衰（冷気）
      "indexable": true,                    // StatusEffectManager が索引する
      "affectedEntityTypes": ["normal","elite"], // 未指定は全種別。ボスは含めない
      "bossPolicy": "convertToGauge",       // normal|immune|convertToGauge
      "dispelPolicy": "onDeath", "iconKey": "status_chill", "enabled": true
    }
    // burning / frozen / freeze_immunity / frostbreak_vulnerability も同形式
  ],
  "freeze": {                               // 冷気→減速→凍結判定の設定（通常敵/エリートで別プロファイル）
    "chanceFromChill": 0.45,                // (chill/chillCap) に掛かる凍結寄与
    "sameHitGroupMaxFreezeChecks": 1,       // 同 hitGroup×同対象の凍結判定回数上限（永久凍結防止）
    "slowCurveExponent": 1.0, "chillDecayGraceMs": 350,
    "normal": {
      "chillCap": 100, "guaranteedFreezeThreshold": 100, "maxSlow": 0.50,
      "baseFreezeDuration": 1250, "freezeChanceCap": 0.45, "postFreezeImmunity": 1200,
      "immunityChillGainMultiplier": 0.25, "chillGainMultiplier": 1.0,
      "freezeDurationMultiplier": 1.0, "freezeOnUnfreezeChill": 0, "decayRate": 12
    },
    "elite": { "chillCap": 130, "guaranteedFreezeThreshold": 130, "maxSlow": 0.35,
      "freezeChanceCap": 0.25, "postFreezeImmunity": 2000, "chillGainMultiplier": 0.65,
      "freezeDurationMultiplier": 0.60, ... }        // エリートは冷気獲得/凍結時間/最大減速を軽減
  },
  "bossFrostbreak": {                       // ボス専用の氷砕ゲージ（冷気を変換して溜める）
    "baseThreshold": 250, "thresholdGrowthPerBreak": 1.30, "maximumThresholdMultiplier": 3.0,
    "breakStaggerDuration": 350, "vulnerabilityDuration": 4000,
    "iceDamageTakenMultiplierDuringVulnerability": 1.15, "cooldownAfterBreak": 1500,
    "gaugeConversionMultiplier": 1.0, "minThreshold": 120
  },
  "shatter": {                              // 凍結敵の粉砕ダメージ（固定＋スキル威力＋最大HP係数・上限つき）
    "baseDamage": 30, "skillPowerCoefficient": 1.4,
    "maxHpCoefficient": 0.10, "maxHpDamageCap": 120, "absoluteCap": 600,
    "explosionRadius": 44, "explosionDamageFactor": 0.5, "recursionForbidden": true
  }
}
```
- **凍結確率式**: `freezeChance = baseFreezeChance×procCoefficient + (chill/chillCap)×chanceFromChill×procCoefficient`、
  対象別 `freezeChanceCap` でクランプ、`chill >= guaranteedFreezeThreshold` で確定凍結。
- **粉砕**: `baseDamage + skillPower×skillPowerCoefficient + min(maxHp×maxHpCoefficient, maxHpDamageCap)`、`absoluteCap` でクランプ。
- 検証（`validate-data.mjs`）: `statusEffects[].kind` が既知 enum・`element`・`bossPolicy` が既知値・`indexable`/`enabled` が真偽値、
  `freeze.normal`/`freeze.elite` の必須項目が正・`maxSlow`/`freezeChanceCap` が 0..1・`bossFrostbreak`/`shatter` の各係数が正/非負。
  数値は非有限（NaN）を拒否。詳細な意味は `docs/status-effects.md`。

### jobs.json（frost_mage を追加）
既存の `flame_witch` に加え `frost_mage` を追加。各ジョブへ `element` と、そのジョブが扱う `statusEffects`（id 配列）を持たせる。
```jsonc
{
  "id": "frost_mage", "displayName": "氷術師", "element": "ice", "iconKey": "icon_frost_shard",
  "statusEffects": ["chill", "frozen", "freeze_immunity", "frostbreak_vulnerability"],
  "initialActiveSkills": ["frost_shard"], "initialPassiveSkills": [],
  "activeSkillPool": ["frost_shard","frost_nova","glacial_lance","permafrost_field","ice_wall"],
  "passiveSkillPool": ["frost_amplification","rapid_freezing","frozen_expansion","lingering_cold"],
  "evolutionPool": ["diamond_blizzard","absolute_zero_domain","heaven_piercing_glacier"],
  "baseActiveSlots": 4, "basePassiveSlots": 4, "tags": ["ice","mage","control"], "unlockCondition": null
}
```
検証: `element`/`statusEffects` が存在・初期スキルが各プールに存在・プール ID がカタログ/進化に存在・`statusEffects` の id が status-effects.json に実在。

### job-progression.json（frost_mage を追加）
`jobs.frost_mage` を追加。XP曲線/周回報酬は火の魔女と同構造で、`perLevelBonuses` と `milestones` が氷用。
```jsonc
"frost_mage": {
  "jobId": "frost_mage", "element": "ice", "levelCap": 100,
  "xpCurve": { "quad": 25, "lin": 75 }, "xpReward": { /* 火の魔女と同じ係数 */ },
  "perLevelBonuses": {
    "iceDamagePerLevel": 0.0035,   // 氷属性ダメージ +0.35%/Lv（elementDamageMult）
    "chillPerLevel": 0.0030,       // 冷気付与量 +0.30%/Lv（statusPowerMult）
    "shatterPerLevel": 0.0040      // 粉砕 +0.40%/Lv（shatterDamageMult）
  },
  "milestones": [
    { "level": 5,  "type": "elementDamageMult", "value": 0.05 },   // 氷Dmg +5%
    { "level": 10, "type": "statusPowerMult",   "value": 0.10 },   // 冷気 +10%
    { "level": 40, "type": "statusTargetDamage", "chilled": 0.10, "frozen": 0.20 }, // 凍結狩り（frozen 優先）
    { "level": 50, "type": "shatterOnFrozenKill", "radiusFactor": 1.0, "powerFactor": 0.6 }, // 氷砕連鎖
    { "level": 80, "type": "projectileCount", "value": 1 },        // 氷弾増殖（projectile タグのみ）
    { "level": 100,"type": "absoluteZero", "normalThresholdReduction": 0.20,
      "bossThresholdReduction": 0.15, "frozenDurationMult": 0.20 } // 絶対零度（安全下限維持）
    // Lv20/30/60/70/90 は cooldownMult/rerollBonus/evolvedDamageMult/rarityWeight/cooldownMult（火と共通 type）
  ]
}
```
検証: `jobId` が jobs.json と整合・`element` が既知・新 milestone type（`elementDamageMult`/`statusPowerMult`/`statusTargetDamage`/
`shatterOnFrozenKill`/`absoluteZero`）が既知 enum・type 固有フィールドの型/範囲（`absoluteZero` の各 reduction が 0..1 等）。

### skills.json（氷 active5種）／passives.json（氷 passive4種）／skill-evolutions.json（氷進化3種）
氷 active は既存の active メタ（`category`/`element:"ice"`/`rarity`/`levels`/`evolutionBranches`/cast・監査フィールド）に加え、
**スキル単位の `procCoefficient`**（凍結寄与係数・永久凍結防止）を持ち、`levels[]` に氷用フィールドを持つ。
```jsonc
{ "id": "frost_shard", "element": "ice", "rarity": "common", "jobs": ["frost_mage"],
  "procCoefficient": 0.9,                 // 命中1回あたりの凍結寄与（多段/広範囲ほど低く）
  "lv80ProjectileTarget": true,           // 氷 Lv80 発射数+1 対象（独立弾のみ）
  "evolutionBranches": ["diamond_blizzard"],
  "levels": [ { "level": 1, "damage": 9, "cooldown": 850, "count": 1, "projectileSpeed": 300,
                "chillAmount": 12,          // 命中で加える冷気量
                "baseFreezeChance": 0.05,   // 冷気0でも凍る基礎確率
                "pierce": 0 }, ... ] }
```
- 役割別 `levels` フィールド例: frost_shard/glacial_lance(projectileSpeed/pierce/chillAmount/baseFreezeChance) /
  frost_nova(radius/chillAmount/shatterMultiplier/…) / permafrost_field(radius/duration/tickChill/…) / ice_wall(segments/duration/hp/…)。
  `shatterMultiplier` は粉砕系スキルの威力倍率。値は JSON にのみ持つ。
- 氷 passive4（`passives.json`）: 氷晶増幅（`iceDamage` +6%/Lv・addMult）/ 急速冷却（`cooldown` −4%/Lv・subMult）/
  凍域拡張（`area` +5%/Lv・addMult）/ 余寒残留（`iceStatusDuration` +8%/Lv・addMult ＋ `chillDecay` −5%/Lv・subMult＝冷気減衰緩和）。
  `iceDamage`/`iceStatusDuration`/`chillDecay` を `skill-config.modifierKeys` に追加。
- 氷進化3（`skill-evolutions.json`）: `diamond_blizzard`（frost_shard Lv8 ＋ rapid_freezing Lv4）/
  `absolute_zero_domain`（frost_nova Lv8 ＋ frozen_expansion Lv4）/ `heaven_piercing_glacier`（glacial_lance Lv8 ＋ frost_amplification Lv4）。
  補助条件は active∪passive（`auxSkillIds`）に実在・`replacementSkillId` は基礎と衝突しない。
- 検証（`frost-skills.mjs`/`frost-evolutions.mjs`/`multi-job-draft.mjs`）: 氷 active の `element:"ice"`・`procCoefficient` が 0<..≤1・
  毎レベル成長・`jobs:["frost_mage"]`・プール所属、氷進化の `canEvolve`、**火スキルが氷術師の抽選候補に出ない/氷スキルが火の魔女に出ない**（ジョブ別プール）。

### balance.skillCaps（状態異常/氷スキルの品質別上限を追加）
M6-E までの `skillCaps` へ品質別（`low ≤ medium ≤ high ≤ ultra`・非負整数）の新キーを加算する。
```jsonc
"skillCaps": {
  /* …既存キー… */
  "maxStatusApplicationsPerFrame": {...}, "maxFreezeChecksPerFrame": {...}, "maxFrozenEnemies": {...},
  "maxShattersPerFrame": {...}, "maxShatterProjectiles": {...}, "maxStatusIndexEntries": {...},
  "maxFrostShards": {...}, "maxFrostNovaTargetsPerFrame": {...}, "maxGlacialLances": {...},
  "maxPermafrostFields": {...}, "maxPermafrostTicksPerFrame": {...}, "maxIceWalls": {...},
  "maxIceWallSegments": {...}, "maxIceWallCollisionsPerFrame": {...}, "maxDiamondBlizzardProjectiles": {...},
  "maxAbsoluteZeroDomains": {...}, "maxAbsoluteZeroShattersPerFrame": {...},
  "maxHeavenGlacierFragments": {...}, "maxBossFrostbreaksPerFrame": {...}
}
```
- `maxStatusIndexEntries` は状態索引の登録上限（到達時は新規付与をスキップ・**burning は上限なし**）。
  `maxBossFrostbreaksPerFrame` は 1（同一フレームに複数の氷砕を起こさない）。`DataManager.skillCap(name, quality, fallback)` で取得。
- 検証: 全キーが品質順で単調非減少・非負整数。**上限到達でも凍結/粉砕/氷砕の判定は消さず、装飾を先に削る**。

## Milestone 7-B: 氷術師ビルド拡張・第2波（`skills.json`/`skill-evolutions.json`/`balance.skillCaps` を加算拡張）

氷術師へ新 active10種・進化5種を追加する。既存データ形式は変更しない。**`saveVersion` は 6 のまま**。

### skills.json（氷 active を15件へ）
M7-A の氷 active5種に加え、新 active10種を追記して **氷 active は15件**（`jobs.json` の `frost_mage.activeSkillPool` も15件）。
各スキルは既存の active／氷メタ（`category`/`element:"ice"`/`rarity`/`maxLevel:8`/`levels`(Lv1〜8)/`evolutionBranches`/cast・監査フィールド/`procCoefficient`）に準拠する。
```jsonc
// 例: 氷河墜落 glacier_drop（legendary・遅延大範囲）
{ "id": "glacier_drop", "element": "ice", "rarity": "legendary", "jobs": ["frost_mage"],
  "castMode": "cooldown", "lv80ProjectileTarget": false,
  "procCoefficient": 0.95,                 // 主発動の凍結寄与（残留床は別係数）
  "echoPolicy": "standard", "clonePolicy": "standard",
  "evolutionBranches": [],
  "levels": [ /* Lv1〜8 */ ] }
```
- 新10種の `rarity`: `icicle_volley`/`frost_orbit`/`cryo_mine`=common、`freezing_ray`/`hailstorm`/`frost_spirit`/`avalanche`=uncommon、
  `ice_prison`/`mirror_ice`=rare、`glacier_drop`=legendary。`castMode`: cooldown（icicle_volley/ice_prison/glacier_drop）/continuous（frost_orbit/freezing_ray/frost_spirit）/
  periodic（hailstorm/avalanche）/reactive（cryo_mine）/defensive（mirror_ice）。
- `lv80ProjectileTarget` は **`icicle_volley` のみ true**、他9種は false。`mirror_ice` は `echoPolicy=clonePolicy=forbidden`（→ `canTriggerEcho=canBeCopiedByClone=false`）、
  `cryo_mine` は反応型で `canTriggerEcho=false`。`evolutionBranches` は進化を持つ5種（icicle_volley/freezing_ray/hailstorm/frost_spirit/avalanche）のみ非空。
- 検証（`frost-skills-wave2.mjs`・`validate-data.mjs`）: 10種の存在/一意/active/maxLevel8/Lv連番/rarity一致/`jobs:["frost_mage"]`/プール所属/`procCoefficient` が 0<..≤1/
  毎レベル成長/`evolutionBranches` が実在進化のみ、cast・監査フィールドの妥当性（forbidden と canTrigger の整合）。

### skill-evolutions.json（氷進化を8件へ）
M7-A の氷進化3種に加え、新進化5種を追記して **氷進化は8件**。いずれも `EvolvedSkillBase`・単一形態・`element:"ice"`・`lv80ProjectileTarget:false`・evolved タグ。
補助条件 `requiredSkills[].skill` は active∪passive（`auxSkillIds`）に実在・`replacementSkillId` は基礎と衝突しない。
```jsonc
{ "id": "world_end_avalanche", "baseSkillId": "avalanche", "replacementSkillId": "world_end_avalanche",
  "requiredSkills": [ { "skill": "ice_wall", "level": 4 } ],   // ice_wall は active 補助
  "castMode": "periodic", "lv80ProjectileTarget": false, "displayOrder": 8 }
```
- 5種: `crystal_tempest`(icicle_volley＋frost_amplification[P]) / `absolute_zero_ray`(freezing_ray＋rapid_freezing[P]) /
  `whiteout_cataclysm`(hailstorm＋lingering_cold[P]) / `frost_queen_court`(frost_spirit＋frozen_expansion[P]) /
  `world_end_avalanche`(avalanche＋**ice_wall(active)** Lv4)。いずれも基礎Lv8＋補助Lv4。
- 検証（`frost-evolutions-wave2.mjs`・`validate-data.mjs`）: `canEvolve`（補助 active/passive 解決・基礎Lv8＋補助Lv4で可能・未達で不可）・既存氷進化3種の非回帰。

### balance.skillCaps（M7-B の29種を加算的に追加）
M6-E/M7-A までの `skillCaps` へ、氷スキル/進化の品質別（`low ≤ medium ≤ high ≤ ultra`・非負整数）新キーを **29種** 追加する。
弾数/雹/地雷/精霊/波/凍結床/落下/吸収/反撃弾/氷牢 などの同時数・毎フレーム処理数を制限する予算で、`DataManager.skillCap(name, quality, fallback)` で取得。
- 検証: 追加29キーが品質順で単調非減少・非負整数（`low≤medium≤high≤ultra`・正）。**上限到達でも凍結/粉砕/氷砕の判定は消さず、装飾を先に削る**。

`validate-data.mjs` に M7-B 検証ブロックを追加（氷 active15/進化8・skillCaps 29種・cast/監査/procCoefficient・lv80 対象が icicle_volley のみ）。詳細は `docs/skill-catalog.md`・`docs/jobs.md`。

## Milestone 7-B.1: 状態異常の視認性（`balance.json` の `skillCaps` 表示上限＋`statusVisuals` を加算拡張）

状態異常を通常プレイ中に確認できる**表示層**の設定を `balance.json` へ加算する。**状態ロジック用の数値（凍結確率/冷気/粉砕/ボス氷砕）は変更しない**。
表示上限に達しても状態判定・解除・免疫・索引 cleanup は削らず装飾を先に削る。**`saveVersion` は 6 のまま**。詳細は `docs/status-visuals.md`・`docs/status-debug.md`。

### balance.skillCaps（表示上限11種を品質別に追加）
M7-B までの `skillCaps` へ、状態表示の毎フレーム/同時上限を品質別（`low ≤ medium ≤ high ≤ ultra`・正）で加算する。
```jsonc
"skillCaps": {
  /* …既存キー… */
  "maxStatusIcons":                 { "low": 1, "medium": 2, "high": 2, "ultra": 3 }, // 1エンティティの状態アイコン最大数
  "maxChillVisuals":                { /* 冷気オーバーレイ同時数 */ },
  "maxFrozenVisuals":               { /* 氷殻オーバーレイ同時数 */ },
  "maxImmunityVisuals":             { /* 凍結耐性オーバーレイ同時数 */ },
  "maxSlowTrails":                   { /* 減速トレイル同時数 */ },
  "maxShatterEffectsPerFrame":      { /* 粉砕演出の毎フレーム上限 */ },
  "maxStatusFloatingTextsPerFrame": { /* SHATTER 等の浮遊テキスト毎フレーム上限 */ },
  "maxFrostbreakEffects":           { /* FROST BREAK 演出同時数 */ },
  "maxStatusDebugHistory":          { /* F10 デバッグの履歴保持数 */ },
  "chillNearThresholdEffectCooldown": { "low": 1500, "medium": 1500, "high": 1500, "ultra": 1500 }, // 閾値直前の光の再発火間隔(ms・全品質同値)
  "statusVisualUpdateInterval":       { "low": 60, "medium": 60, "high": 60, "ultra": 60 }          // overlay 照合更新の間隔(ms・全品質同値)
}
```
- 各上限は `low ≤ medium ≤ high ≤ ultra` かつ正。`maxStatusIcons` は 1/2/2/3。`chillNearThresholdEffectCooldown`(1500) と `statusVisualUpdateInterval`(60) は全品質同値。
- **低品質でのドロップ優先度（残す順）**: frozen > ボス氷砕 > shatter > burning > immunity > chill > slow。装飾を削っても状態ロジックは不変。

### statusVisuals（新規オブジェクト・表示メタ）
状態表示の対象・優先度・種別・演出パラメータを集約する（数値はここへ・コードへ散在させない）。
```jsonc
"statusVisuals": {
  "iconStatuses": ["frozen", "burning", "freeze_immunity", "chill_high"], // アイコンを出す状態
  "iconPriority": ["frozen", "burning", "freeze_immunity", "chill_high"], // frozen > burning > freeze_immunity > chill_high
  "visualTypes": ["chill", "slow", "frozen", "freeze_immunity", "shatter", "burning", "frostbreak"], // 既知の表示種別
  "frostbreak":   { "showText": true, "textDurationMs": 900, "shardCount": 12 },   // FROST BREAK 文字/氷片
  "vulnerability": { "blink": true, "blinkPeriodMs": 300 }                          // 氷砕脆弱の点滅
}
```
- `iconPriority` は 1エンティティに複数状態があるとき、`maxStatusIcons` 個までを frozen>burning>freeze_immunity>chill_high の順に選ぶための優先度。
- 冷気の段階は割合で決まる（1〜39%=ごく薄い水色 / 40〜74%=水色縁＋足元氷輪 / 75%+=青白縁＋氷結晶マーク / 確定閾値90%で一度光る / chill=0で完全解除）。
- 検証（`validate-data.mjs`）: 追加11キーが品質順で単調非減少・正、`chillNearThresholdEffectCooldown`/`statusVisualUpdateInterval` が全品質同値。
  `statusVisuals` は `iconStatuses`/`iconPriority`/`visualTypes` の各要素が既知の status id / 表示種別であること・**未知の status id や visual type を弾く**・負数の上限を弾く・
  `frostbreak`（showText 真偽・textDurationMs/shardCount が正）・`vulnerability`（blink 真偽・blinkPeriodMs が正）の設定を確認する。表示状態はセーブ payload に含めない。
