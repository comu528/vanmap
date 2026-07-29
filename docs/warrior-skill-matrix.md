# 戦士スキル横断マトリクス（M8-C 時点）

`data/skills.json` / `data/skill-evolutions.json` / `data/jobs.json` の実データから起こした一覧。
数値は Lv8（active）または進化定義の値。**データを変更したらこの表も更新すること。**

規模: **active 15 / passive 4 / 進化 8**（火の魔女・氷術師は各 30 / 4 / 18）。

---

## active15

| id | 名称 | rarity | タグ | CD(Lv8) | 近接距離 | Lv80 打撃+1 | 進化先 |
|----|------|--------|------|---------|----------|-------------|--------|
| `great_cleave` | 大薙ぎ | common | melee slash area | 720ms | 84 | ○ | `thousand_blade_dance` |
| `shield_bash` | 盾撃 | uncommon | melee blunt defense | 1900ms | 62 | ○ | `unyielding_fortress` |
| `whirlwind_slash` | 旋風斬り | uncommon | melee slash spin area | 3800ms | 78 | × | `bloodstorm_whirlwind` |
| `charge_slash` | 突進斬り | rare | melee slash charge movement | 3000ms | 50 | × | — |
| `ground_slam` | 地砕き | rare | melee blunt area stance_break | 3400ms | 96 | ○ | —（天墜崩撃の**補助**） |
| `armor_breaker` | 兜割り | uncommon | melee slash stance_break | 2000ms | 92 | ○ | `skull_splitter` |
| `twin_fang_slash` | 双牙斬 | common | melee slash combo | 620ms | 74 | ○ | — |
| `execution_strike` | 処刑斬 | rare | melee slash execute | 2400ms | 96 | × | `crimson_execution` |
| `leap_smash` | 跳躍強襲 | uncommon | melee blunt movement area | 3800ms | 90 | × | `heaven_crushing_descent` |
| `sweeping_advance` | 薙ぎ進軍 | uncommon | melee slash movement | 4400ms | 80 | × | — |
| `counter_stance` | 迎撃の構え | uncommon | melee counter defense reactive | 5000ms | 92 | × | `adamant_counter` |
| `war_cry` | 戦吼 | rare | melee blunt buff area | 6600ms | 130 | × | `war_god_roar` |
| `chain_hook` | 鎖鉤 | rare | melee pull control | 4600ms | 280 | × | — |
| `shockwave_stomp` | 震脚 | common | melee blunt area knockback | 1700ms | 66 | × | — |
| `relentless_combo` | 怒涛連撃 | rare | melee slash combo | 3400ms | 66 | ○ | — |

- `chain_hook` の 280 は「鉤が届く距離」で、ダメージ判定の半径ではない。
- 進化を持たない active は 6 種（`charge_slash` `ground_slam` `twin_fang_slash`
  `sweeping_advance` `chain_hook` `shockwave_stomp`）。
- **Lv80「打撃数 +1」対象はちょうど 6 種**。弾は 1 つも増えない。

## 進化8

| 進化 id | 名称 | 進化元 | 補助 | CD | 近接距離 | Lv80 対象 |
|---------|------|--------|------|----|----------|-----------|
| `thousand_blade_dance` | 千刃乱舞 | `great_cleave` | `combat_instinct` Lv4 | 900ms | 96 | × |
| `bloodstorm_whirlwind` | 血戦旋風 | `whirlwind_slash` | `bloodlust` Lv4 | 3600ms | 84 | × |
| `unyielding_fortress` | 不落の城壁 | `shield_bash` | `heavy_armor` Lv4 | 2200ms | 84 | × |
| `skull_splitter` | 断界兜割 | `armor_breaker` | `brute_force` Lv4 | 1900ms | 104 | × |
| `crimson_execution` | 血断処刑 | `execution_strike` | `bloodlust` Lv4 | 2200ms | 104 | × |
| `war_god_roar` | 軍神咆哮 | `war_cry` | `combat_instinct` Lv4 | 6000ms | 168 | × |
| `adamant_counter` | 金剛迎撃 | `counter_stance` | `heavy_armor` Lv4 | 5200ms | 104 | × |
| `heaven_crushing_descent` | 天墜崩撃 | `leap_smash` | **active** `ground_slam` Lv6 | 5000ms | 148 | × |

補助が active なのは天墜崩撃だけ。地砕きは置換されず、CD にも触らない。

## passive4（M8-B から変更なし）

| id | 名称 | maxLevel | 主な効果 |
|----|------|----------|----------|
| `brute_force` | 剛力 | 5 | 近接ダメージ倍率 |
| `heavy_armor` | 重装 | 5 | 被ダメージ軽減・最大HP |
| `combat_instinct` | 戦闘本能 | 5 | 攻撃速度・コンボ関連 |
| `bloodlust` | 血気 | 5 | 撃破回復（`killHealMult`） |

---

## 役割の分布（重複していないことの確認用）

| 役割 | 担当する active |
|------|-----------------|
| 単体高火力・体勢崩し | `armor_breaker` `ground_slam` |
| コンボ builder | `twin_fang_slash` `relentless_combo` `great_cleave` |
| 掃討・処刑 | `execution_strike` `whirlwind_slash` |
| 接近・機動 | `leap_smash` `charge_slash` `sweeping_advance` `chain_hook` |
| 防御・反撃 | `counter_stance` `shield_bash` |
| 制圧・押し返し | `shockwave_stomp` `war_cry` |
| 自己強化 | `war_cry` |

---

## 機構ごとの対応表

| 機構 | 使うスキル | 一元化されている場所 |
|------|-----------|----------------------|
| 近接判定 | 全 active / 全進化 | `BattleScene.meleeStrike()` |
| 処刑 | `execution_strike` `crimson_execution` | `WarriorCombatSystem.executePolicy()` → `BattleScene.executeTarget()` |
| 反撃 | `counter_stance` `adamant_counter` `unyielding_fortress` | `WarriorCombatSystem.consumeCounterEvent()` |
| 一時バフ | `war_cry` `war_god_roar` | `WarriorCombatSystem.applyWarCryBuff()` |
| 引き寄せ | `chain_hook` | `BattleScene.pullTarget()` |
| 自分の移動 | `leap_smash` `sweeping_advance` `chain_hook` `charge_slash` `heaven_crushing_descent` | `BattleScene.movePlayerTowards()` / 各スキルの `_update*` |
| 対象選択（硬さ / 瀕死） | `armor_breaker` `skull_splitter` `execution_strike` `crimson_execution` | `BattleScene.preferredMeleeTarget()` |
| 体勢崩し | 全 active（`poiseDamage`） | `WarriorCombatSystem.applyPoiseDamage()` |
| 闘気 / コンボ | 全 active（`furyGain` / `comboGain`） | `WarriorCombatSystem.noteMeleeHit()` |

---

## 品質別上限（M8-C 追加ぶん）

| cap 名 | low | medium | high | ultra | 種別 |
|--------|-----|--------|------|-------|------|
| `maxOverheadStrikes` | 2 | 2 | 3 | 3 | ダメージ |
| `maxTwinFangStrikes` | 2 | 3 | 3 | 4 | ダメージ |
| `maxExecutesPerCast` | 2 | 3 | 3 | 4 | ダメージ |
| `maxLeapImpacts` | 1 | 2 | 2 | 2 | ダメージ |
| `maxSweepStrikesPerFrame` | 1 | 1 | 2 | 2 | ダメージ |
| `maxCounterWindows` | 2 | 2 | 3 | 3 | ダメージ |
| `maxChainPullsPerCast` | 1 | 1 | 1 | 1 | ダメージ |
| `maxRelentlessStrikes` | 8 | 10 | 12 | 14 | ダメージ |
| `maxRelentlessRetargets` | 2 | 3 | 3 | 4 | ダメージ |
| `maxOverheadSlashVisuals` / `maxTwinSlashVisuals` / `maxExecuteMarkers` / `maxLeapTrails` / `maxLandingDebris` / `maxSweepTrails` / `maxCounterFlashes` / `maxWarCryRings` / `maxChainHookLines` / `maxStompDebris` / `maxRelentlessSparks` | — | — | — | — | 演出 |

演出上限はダメージ・命中に一切影響しない（`tests/warrior-wave1-quality-cap.mjs` §4 が固定）。

---

## 共通の制約（全 23 種）

- `element: physical` / `jobs: ["warrior"]` / `isCommon: false`
- 残響・分身の対象外（`echoPolicy` / `clonePolicy` = `forbidden`、`canTriggerEcho` / `canBeCopiedByClone` = `false`）
- 遠距離へ飛ぶ弾を作らない（`spawnPlayerProjectile` を呼ばない）
- 1 発動 = 1 `recordCast`（多段は `hits` 側で数える）
- 乱数を使わない（`Math.random` / Phaser RNG を 1 度も呼ばない）
- `destroy()` を実装し、破棄後は遅延処理も進行中処理も動かない
- 敵オブジェクト参照を保存しない（安定 runtime id `_seq` のみ）

詳細な設計意図は `./warrior-wave1.md`、カタログ全体は `./skill-catalog.md` を参照。


---

## Milestone 8-D: Wave2 の 10 active（役割の重なりを見る）

| id | 間合い | 対象 | 役割の軸 | 既存と重ならない理由 |
|----|--------|------|----------|---------------------|
| `rising_slash` | 極近・前方の狭い縦 | 少数 | **行動阻害**（打ち上げ）| 戦士で唯一「通常敵を止める」手段 |
| `shield_charge` | 中（突進）| 通過中の複数 | **防御しながら詰める** | 突進斬りは詰めるだけ。前面防御は Wave2 だけ |
| `backstep_riposte` | 近（後退→踏み込み）| 少数 | **仕切り直し** | 反撃系（構え）とは別で、自分から仕掛ける |
| `battlefield_throw` | 近（掴み）| 1 体＋着地点 | **制圧 / 敵の再配置** | 引き寄せ（鎖鉤）の逆方向。密集を作れる |
| `triple_crush` | 近・三段 | 前方 → 横 → 全周 | **確定手数** | 双牙斬より遅く重い。段ごとに範囲が変わる |
| `blade_guard` | 極近・全周 | 少数 | **能動防御 + 削り** | 旋風斬より狭く低火力。反撃ではない |
| `berserker_rush` | 近（連続踏み込み）| 順番に複数 | **逆転火力** | 怒涛連撃は撃破で伸びる。こちらは HP で伸びる |
| `war_axe_throw` | 中（往復）| 直線上の複数 | **唯一の飛び道具** | 近接倍率が乗らないので近接構成の素通し強化にならない |
| `breaker_knee` | 極近・単体 | 1 体 | **体勢特化（速い）** | 兜割りより CD と射程が短く体勢が高い |
| `rallying_banner` | 自陣 | 自分 | **居座りの報酬** | 戦吼は時間バフ。こちらは場所バフ |

### 進化の補助（誰と組むか）

| 進化 | 補助 | 種別 |
|------|------|------|
| `heaven_rending_ascent` | `brute_force` Lv4 | passive |
| `fortress_rampage` | `heavy_armor` Lv4 | passive |
| `shadow_swallow_riposte` | `combat_instinct` Lv4 | passive |
| `mountain_hurl` | `ground_slam` Lv6 | **active**（置換されず CD も変わらない）|
| `blood_oath_standard` | `bloodlust` Lv4 | passive |

`ground_slam` は `heaven_crushing_descent`（Wave1）と `mountain_hurl`（Wave2）の
**2 つの進化の補助を兼ねる**。guidance の重複上限があるので、共有していても倍率は積み上がらない。


---

## Milestone 8-E: 最終Wave の 5 active（役割の重なりを見る）

| id | 射程 | 対象数 | 担当（他と被らない点）| 既存との違い |
|----|------|--------|----------------------|-------------|
| `piercing_lunge` | 中（直線 300px）| 直線上の複数 | **列を貫く**唯一の形 | 大薙ぎ / 旋風斬は扇形・円形。直線はこれだけ |
| `duel_challenge` | 近（指名）| **1 体だけ** | **単体特化**（自分のバフ）| 兜割り / 破城膝撃は「今殴る相手」が強いだけ。指名は継続する |
| `battle_trance` | 自己 | – | **攻めへ全振りする構え**（守りを削る）| 戦吼は純粋なバフ。対価があるのはこれだけ |
| `earthshaker_march` | 近（移動しながら）| 通り道の複数 | **移動制圧**（複数地点）| 大地砕き / 震脚はその場 1 地点。進軍はこれだけ |
| `weapon_deflection` | 自己（半径）| 弾のみ | **敵弾への対処** | 刃防陣 / 反撃の構えは近接被弾向け。弾を消せるのはこれだけ |

### 進化の補助（誰と組むか）

| 進化 | 補助 | 種別 |
|------|------|------|
| `godspeed_impaler` | `combat_instinct` Lv4 | passive |
| `king_slayer_duel` | `brute_force` Lv4 | passive |
| `blood_asura_trance` | `bloodlust` Lv4 | passive |
| `continental_quake_march` | `heavy_armor` Lv4 | passive |
| `heaven_mirror_reversal` | `counter_stance` Lv4 | **active**（置換されず CD も変わらない）|

`counter_stance` は `adamant_counter`（Wave1・自身の進化）と `heaven_mirror_reversal`（最終Wave）の
**両方に関わる**が、天鏡返しは構えを置換しないので**両方を目指せる**。

### 4 passive の担当（最終Wave 後も 4 種のまま）

| passive | 進化での担当 |
|---------|-------------|
| `brute_force` | 天衝断空・覇王討ち |
| `heavy_armor` | 城塞蹂躙・大陸震砕踏破 |
| `combat_instinct` | 無影燕返・神速貫陣 |
| `bloodlust` | 血盟戦旗・血染修羅 |

18 進化のうち **15 件が passive 補助・3 件が active 補助**。4 passive はいずれも 4〜5 件を担当していて、
どれか 1 つだけが必須にならない配分になっている。
