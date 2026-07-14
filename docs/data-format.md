# データフォーマット

`data/*.json` の仕様。`tests/validate-data.mjs` が構文・必須項目・ID重複・参照整合・
負のクールダウン・不正な最大レベル・難易度倍率・転生ノード参照・セーブバージョンを検証する。

## balance.json
```jsonc
{
  "saveVersion": 1,           // セーブバージョン（>=1、必須）
  "gameVersion": "0.1.0",
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
- 難易度倍率（enemyHp 等）はすべて **> 0**。
- `unlockAfter` は `null` か既存 difficulty の `id`。

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
  "upgrades": [ { "id": "max_hp", "name": "最大HP", "stat": "maxHp",
                  "maxTier": 20, "baseCost": 10, "costGrowth": 1.35,
                  "valuePerTier": 10, "mode": "add" }, ... ] }
```
必須: `id, name, maxTier, baseCost, costGrowth`。`maxTier >= 1`。費用は `baseCost * costGrowth^tier` 目安。

## reincarnation.json
```jsonc
{ "currency": "soulflame",
  "unlock": { "clearDifficulty": 3, "totalEmber": 5000 },
  "resetOnReincarnate": [...], "keepOnReincarnate": [...],
  "nodes": [ { "id": "extra_choice", "name": "候補+1", "cost": 3,
               "requires": [],                     // 既存ノード id のみ
               "effect": { "type": "levelUpChoices", "value": 1 } }, ... ] }
```
必須: `nodes, unlock`。各ノード `id, name, cost, requires, effect`。`requires` は存在するノード id。
