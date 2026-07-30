# 戦士 スキル完成マトリクス（Milestone 8-F）

`warrior` の **active 30 / evolution 18 = 48 スキル**を 1 行 1 スキルで並べた監査表。
M8-F では**新しいスキルを 1 件も追加していない**（M8-E で確定したカタログの確認表）。

- 「保存キー」は production の `serializeState()` を実際に呼んで得たキー列（`tests/warrior-completion-cooldown-save.mjs` / `warrior-completion-runtime-state.mjs` と同じ経路）。
- 「主発動」は 12 秒・quality=high・敵 15 体で production を回したときの `SkillManager.stats.casts`。**多段でも 1 発動 = 1 記録**であることの実測値。
- 「補助統計」は `recordExtra` のキー。F9 レポートに出るがセーブへは載らない。
- 上限はすべて `data/balance.json` の `skillCaps` か進化の `safetyCaps` 由来で、コードにハードコードされた数値はない。

関連文書: `./warrior-completion-audit.md`（監査本体）/ `./warrior-completion-balance.md`（バランス分布）/
`./warrior-skill-matrix.md`（M8-D までの設計マトリクス）

---

## 1. active 30 件

| # | id | 名称 | rarity | maxLv | 役割タグ | class | CD (Lv1→8) | ダメージ (Lv1→8) | 進化先 |
|---|----|------|--------|-------|----------|-------|------------|------------------|--------|
| 1 | `great_cleave` | 大薙ぎ | common | 8 | melee / slash / area | `GreatCleaveSkill` | 1000→720 | 16→40 | 千刃乱舞 |
| 2 | `shield_bash` | 盾撃 | uncommon | 8 | melee / blunt / defense | `ShieldBashSkill` | 2600→1900 | 12→30 | 不落の城壁 |
| 3 | `whirlwind_slash` | 旋風斬り | uncommon | 8 | melee / slash / spin / area | `WhirlwindSlashSkill` | 5200→3800 | 9→22 | 血戦旋風 |
| 4 | `charge_slash` | 突進斬り | rare | 8 | melee / slash / charge / movement | `ChargeSlashSkill` | 4200→3000 | 20→48 | — |
| 5 | `ground_slam` | 地砕き | rare | 8 | melee / blunt / area / stance_break | `GroundSlamSkill` | 4600→3400 | 24→58 | — |
| 6 | `armor_breaker` | 兜割り | uncommon | 8 | melee / slash / stance_break | `ArmorBreakerSkill` | 2800→2000 | 34→92 | 断界兜割 |
| 7 | `twin_fang_slash` | 双牙斬 | common | 8 | melee / slash / combo | `TwinFangSlashSkill` | 900→620 | 11→27 | — |
| 8 | `execution_strike` | 処刑斬 | rare | 8 | melee / slash / execute | `ExecutionStrikeSkill` | 3400→2400 | 26→66 | 血断処刑 |
| 9 | `leap_smash` | 跳躍強襲 | uncommon | 8 | melee / blunt / movement / area | `LeapSmashSkill` | 5200→3800 | 24→60 | 天墜崩撃 |
| 10 | `sweeping_advance` | 薙ぎ進軍 | uncommon | 8 | melee / slash / movement | `SweepingAdvanceSkill` | 6000→4400 | 13→31 | — |
| 11 | `counter_stance` | 迎撃の構え | uncommon | 8 | melee / counter / defense / reactive | `CounterStanceSkill` | 7000→5000 | 0→0 | 金剛迎撃 |
| 12 | `war_cry` | 戦吼 | rare | 8 | melee / blunt / buff / area | `WarCrySkill` | 9000→6600 | 10→26 | 軍神咆哮 |
| 13 | `chain_hook` | 鎖鉤 | rare | 8 | melee / pull / control | `ChainHookSkill` | 6400→4600 | 12→30 | — |
| 14 | `shockwave_stomp` | 震脚 | common | 8 | melee / blunt / area / knockback | `ShockwaveStompSkill` | 2400→1700 | 14→34 | — |
| 15 | `relentless_combo` | 怒涛連撃 | rare | 8 | melee / slash / combo | `RelentlessComboSkill` | 4600→3400 | 9→22 | — |
| 16 | `rising_slash` | 昇竜斬 | common | 8 | melee / slash / launch | `RisingSlashSkill` | 1500→1050 | 18→46 | 天衝断空 |
| 17 | `shield_charge` | 鉄壁突進 | uncommon | 8 | melee / blunt / movement / defense | `ShieldChargeSkill` | 4200→3200 | 20→48 | 城塞蹂躙 |
| 18 | `backstep_riposte` | 燕返し | uncommon | 8 | melee / slash / movement | `BackstepRiposteSkill` | 3000→2200 | 30→76 | 無影燕返 |
| 19 | `battlefield_throw` | 豪腕投げ | rare | 8 | melee / grab / throw / control | `BattlefieldThrowSkill` | 5200→4000 | 26→64 | 山岳投擲 |
| 20 | `triple_crush` | 三段砕き | common | 8 | melee / blunt / combo | `TripleCrushSkill` | 2200→1600 | 14→34 | — |
| 21 | `blade_guard` | 刃防陣 | uncommon | 8 | melee / slash / defense | `BladeGuardSkill` | 6000→4600 | 8→18 | — |
| 22 | `berserker_rush` | 狂戦猛進 | rare | 8 | melee / slash / movement | `BerserkerRushSkill` | 4600→3400 | 16→40 | — |
| 23 | `war_axe_throw` | 戦斧投擲 | uncommon | 8 | thrown / slash | `WarAxeThrowSkill` | 3400→2600 | 22→54 | — |
| 24 | `breaker_knee` | 破城膝撃 | common | 8 | melee / blunt / stance_break | `BreakerKneeSkill` | 1600→1150 | 20→50 | — |
| 25 | `rallying_banner` | 戦旗招集 | rare | 8 | buff / field / blunt | `RallyingBannerSkill` | 9000→7000 | —（バフ / 陣） | 血盟戦旗 |
| 26 | `piercing_lunge` | 貫穿突き | common | 8 | melee / thrust / line / pierce | `PiercingLungeSkill` | 2000→1400 | 24→62 | 神速貫陣 |
| 27 | `duel_challenge` | 一騎討ち | rare | 8 | buff / duel / focus | `DuelChallengeSkill` | 11000→8000 | —（バフ / 陣） | 覇王討ち |
| 28 | `battle_trance` | 修羅の構え | uncommon | 8 | buff / stance | `BattleTranceSkill` | 14000→10000 | —（バフ / 陣） | 血染修羅 |
| 29 | `earthshaker_march` | 震天踏破 | uncommon | 8 | melee / blunt / movement / area | `EarthshakerMarchSkill` | 5000→3600 | 18→44 | 大陸震砕踏破 |
| 30 | `weapon_deflection` | 刃返し | uncommon | 8 | defense / deflect | `WeaponDeflectionSkill` | 12000→8500 | —（バフ / 陣） | 天鏡返し |

内訳: common 7 / uncommon 13 / rare 10 / **legendary 0**（戦士は legendary 段を進化 18 件で担う。
火の魔女・氷術師は legendary active を 3 件ずつ持つ設計差で、これは M8-F で変更していない）。
castMode は 30 件すべて `cooldown`（戦士にリソースコスト型・チャージ型は無い）。

## 2. active 30 件の runtime / 保存

| id | 保存キー（実測） | 主発動 12s | 補助統計 | 再開型 | 復元クランプ |
|----|------------------|-----------|----------|--------|--------------|
| `great_cleave` | `cdLeft` | 18 | `strikes` | — | `restoreCd` |
| `shield_bash` | `cdLeft` `mitigationLeft` | 7 | `mitigationWindows` | あり | `restoreCd` + data 上限 |
| `whirlwind_slash` | `cdLeft` `spinLeftMs` `spinTickLeft` | 4 | `spins` `activeMs` | あり | `restoreCd` + data 上限 |
| `charge_slash` | `cdLeft` `dashLeftMs` | 4 | `charges` `dashDistance` | あり | `restoreCd` + data 上限 |
| `ground_slam` | `cdLeft` | 4 | `impacts` | — | `restoreCd` |
| `armor_breaker` | `cdLeft` | 7 | `strikes` | — | `restoreCd` |
| `twin_fang_slash` | `cdLeft` | 21 | `strikes` | — | `restoreCd` |
| `execution_strike` | `cdLeft` | 6 | `swings` | — | `restoreCd` |
| `leap_smash` | `cdLeft` `leapPhase` | 4 | `leaps` `leapDistance` `landings` | あり | `restoreCd` + data 上限 |
| `sweeping_advance` | `cdLeft` `sweepLeftMs` `sweepStrikes` | 3 | `advances` `activeMs` `advanceDistance` | あり | `restoreCd` + data 上限 |
| `counter_stance` | `cdLeft` `windowLeftMs` `counterUsed` | 3 | `stances` `whiffs` | あり | `restoreCd` + data 上限 |
| `war_cry` | `cdLeft` | 2 | `cries` | — | `restoreCd` |
| `chain_hook` | `cdLeft` `hookLeftMs` `hookSeq` `hookPulled` `hookIsBoss` | 3 | `hooks` `pullDistance` | あり | `restoreCd` + data 上限 |
| `shockwave_stomp` | `cdLeft` | 8 | `stomps` | — | `restoreCd` |
| `relentless_combo` | `cdLeft` `remainStrikes` `strikeIndex` `intervalLeft` `retargets` | 4 | `combos` `plannedStrikes` `strikes` `completedChains` | あり | `restoreCd` + data 上限 |
| `rising_slash` | `cdLeft` | 12 | `slashes` | — | `restoreCd` |
| `shield_charge` | `cdLeft` `chargeLeftMs` | 4 | `charges` `chargeDistance` `impacts` | あり | `restoreCd` + data 上限 |
| `backstep_riposte` | `cdLeft` `ripostePhase` | 6 | `ripostes` `strikes` | あり | `restoreCd` + data 上限 |
| `battlefield_throw` | `cdLeft` `throwPhase` | 3 | `grabs` `throws` | あり | `restoreCd` + data 上限 |
| `triple_crush` | `cdLeft` `crushStage` | 8 | `crushes` `stages` `completed` | あり | `restoreCd` + data 上限 |
| `blade_guard` | `cdLeft` `guardLeftMs` `guardTicks` | 3 | `guards` `guardMs` `ticks` | あり | `restoreCd` + data 上限 |
| `berserker_rush` | `cdLeft` `remainSteps` | 4 | `rushes` `plannedSteps` `rushDistance` `steps` `completedRushes` | あり | `restoreCd` + data 上限 |
| `war_axe_throw` | `cdLeft` `axeReturning` | 5 | `throws` `outboundHits` `returns` `returnHits` | あり | `restoreCd` + data 上限 |
| `breaker_knee` | `cdLeft` `stepPending` | 11 | `stepInDistance` `stepIns` `knees` | あり | `restoreCd` + data 上限 |
| `rallying_banner` | `cdLeft` | 2 | `banners` `insideMs` `rallyMs` | — | `restoreCd` |
| `piercing_lunge` | `cdLeft` `lungePending` | 9 | `lunges` `penetrations` `hitsTotal` `thrusts` | あり | `restoreCd` + data 上限 |
| `duel_challenge` | `cdLeft` | 2 | `duels` `duel_boss` `duelMs` | — | `restoreCd` |
| `battle_trance` | `cdLeft` | 2 | `trances` `tranceMs` | — | `restoreCd` |
| `earthshaker_march` | `cdLeft` `remainStomps` | 4 | `marches` `plannedStomps` `marchDistance` `stomps` `completedMarches` | あり | `restoreCd` + data 上限 |
| `weapon_deflection` | `cdLeft` | 2 | `windows` `windowMs` | — | `restoreCd` |

- 48 件すべてが `cdLeft` を保存し、48 件すべてが M8-F で追加した共通 `restoreCd()` を通る（非有限値は採用せず、有限値は ±120s へクランプ）。
- オブジェクト参照を保存しているスキルは **0 件**。敵を指す必要があるものは `Enemy._seq`（数値の安定 id）で保存する（`chain_hook` の `hookSeq`）。
- 保存キーが `cdLeft` だけの instant 系は「1 フレームで完結し、次フレームへ持ち越す状態が無い」ため state 不要であることを `warrior-completion-runtime-state.mjs` §5 で個別に確認している。

## 3. evolution 18 件

| # | id | 名称 | base | 条件 | class | safetyCaps |
|---|----|------|------|------|-------|------------|
| 1 | `thousand_blade_dance` | 千刃乱舞 | 大薙ぎ | 戦闘本能 Lv4 | `ThousandBladeDanceSkill` | `maxStrikesPerCast`=8<br>`maxTargetsPerStrike`=24 |
| 2 | `bloodstorm_whirlwind` | 血戦旋風 | 旋風斬り | 血気 Lv4 | `BloodstormWhirlwindSkill` | `maxSpinDurationMs`=5200<br>`maxTicksPerFrame`=2<br>`maxTargetsPerTick`=24<br>`maxKillExtendPerCast`=9 |
| 3 | `unyielding_fortress` | 不落の城壁 | 盾撃 | 重装 Lv4 | `UnyieldingFortressSkill` | `maxCounterPerWindow`=1<br>`maxTargetsPerStrike`=24<br>`maxStrikesPerCast`=3 |
| 4 | `skull_splitter` | 断界兜割 | 兜割り | 剛力 Lv4 | `SkullSplitterSkill` | `maxStrikesPerCast`=2<br>`maxTargetsPerStrike`=12<br>`maxPoisePerTargetPerCast`=1 |
| 5 | `crimson_execution` | 血断処刑 | 処刑斬 | 血気 Lv4 | `CrimsonExecutionSkill` | `maxExecutesPerCast`=3<br>`maxTargetsPerStrike`=20<br>`maxKillChainGenerations`=1 |
| 6 | `war_god_roar` | 軍神咆哮 | 戦吼 | 戦闘本能 Lv4 | `WarGodRoarSkill` | `maxTargetsPerShock`=24<br>`maxBuffDurationMs`=12000<br>`maxShocksPerCast`=1 |
| 7 | `adamant_counter` | 金剛迎撃 | 迎撃の構え | 重装 Lv4 | `AdamantCounterSkill` | `maxCounterPerWindow`=3<br>`maxTargetsPerStrike`=20<br>`maxCounterMitigationMs`=2000 |
| 8 | `heaven_crushing_descent` | 天墜崩撃 | 跳躍強襲 | 地砕き Lv6 | `HeavenCrushingDescentSkill` | `maxImpactsPerCast`=2<br>`maxTargetsPerImpact`=28<br>`maxLeapDistance`=360 |
| 9 | `heaven_rending_ascent` | 天衝断空 | 昇竜斬 | 剛力 Lv4 | `HeavenRendingAscentSkill` | `maxStagesPerCast`=2<br>`maxTargetsPerStage`=10<br>`maxLaunchPerTargetPerCast`=1 |
| 10 | `fortress_rampage` | 城塞蹂躙 | 鉄壁突進 | 重装 Lv4 | `FortressRampageSkill` | `maxChargeMs`=1200<br>`maxImpactsPerCast`=1<br>`maxTargetsPerImpact`=20 |
| 11 | `shadow_swallow_riposte` | 無影燕返 | 燕返し | 戦闘本能 Lv4 | `ShadowSwallowRiposteSkill` | `maxRipostesPerCast`=2<br>`maxTargetsPerRiposte`=8<br>`maxRetargetsPerCast`=1 |
| 12 | `mountain_hurl` | 山岳投擲 | 豪腕投げ | 地砕き Lv6 | `MountainHurlSkill` | `maxImpactsPerCast`=2<br>`maxTargetsPerImpact`=24<br>`maxGrabPerCast`=1 |
| 13 | `blood_oath_standard` | 血盟戦旗 | 戦旗招集 | 血気 Lv4 | `BloodOathStandardSkill` | `maxFields`=1<br>`maxKillHealBonus`=0.5<br>`maxFieldMs`=12000 |
| 14 | `godspeed_impaler` | 神速貫陣 | 貫穿突き | 戦闘本能 Lv4 | `GodspeedImpalerSkill` | `maxThrustsPerCast`=2<br>`maxTargetsPerThrust`=10<br>`maxChainTargets`=2 |
| 15 | `king_slayer_duel` | 覇王討ち | 一騎討ち | 剛力 Lv4 | `KingSlayerDuelSkill` | `maxDuelTargets`=1<br>`maxRetargetsPerCast`=1<br>`maxExtensionsPerCast`=3 |
| 16 | `blood_asura_trance` | 血染修羅 | 修羅の構え | 血気 Lv4 | `BloodAsuraTranceSkill` | `maxStances`=1<br>`maxKillHealBonus`=0.5<br>`maxStanceMs`=10000 |
| 17 | `continental_quake_march` | 大陸震砕踏破 | 震天踏破 | 重装 Lv4 | `ContinentalQuakeMarchSkill` | `maxStompsPerCast`=7<br>`maxTargetsPerStomp`=22<br>`maxMitigation`=0.2 |
| 18 | `heaven_mirror_reversal` | 天鏡返し | 刃返し | 迎撃の構え Lv4 | `HeavenMirrorReversalSkill` | `maxDeflectionsPerWindow`=8<br>`maxReflectDamage`=96<br>`maxCounterPerEvent`=1 |

`crimson_execution` の `maxTargetsPerStrike` は M8-F で **10 → 20** にした（base より弱い逆転の修正。詳細は
`./warrior-completion-balance.md` §3）。他の 17 件の `safetyCaps` は M8-E から 1 件も変えていない。

## 4. evolution 18 件の runtime / 保存

| id | 保存キー（実測） | 主発動 12s | 補助統計 | base から増えたキー |
|----|------------------|-----------|----------|--------------------|
| `thousand_blade_dance` | `cdLeft` | 14 | `strikes` `finales` | — |
| `bloodstorm_whirlwind` | `cdLeft` `spinLeftMs` `spinTickLeft` | 4 | `spins` `activeMs` | — |
| `unyielding_fortress` | `cdLeft` `windowLeftMs` `counterUsed` `mitigationLeft` | 6 | `counterWindows` | `windowLeftMs` `counterUsed` |
| `skull_splitter` | `cdLeft` | 7 | `strikes` | — |
| `crimson_execution` | `cdLeft` | 6 | `swings` | — |
| `war_god_roar` | `cdLeft` | 2 | `roars` | — |
| `adamant_counter` | `cdLeft` `windowLeftMs` `counterUsed` `counterMitigationLeft` | 3 | `stances` `whiffs` | `counterMitigationLeft` |
| `heaven_crushing_descent` | `cdLeft` `leapPhase` | 3 | `leaps` `leapDistance` `landings` `secondaryImpacts` | — |
| `heaven_rending_ascent` | `cdLeft` | 13 | `slashes` | — |
| `fortress_rampage` | `cdLeft` `chargeLeftMs` | 5 | `charges` `chargeDistance` `impacts` | — |
| `shadow_swallow_riposte` | `cdLeft` `ripostePhase` | 7 | `ripostes` `strikes` `retargets` | — |
| `mountain_hurl` | `cdLeft` `throwPhase` | 3 | `grabs` `throws` | — |
| `blood_oath_standard` | `cdLeft` | 2 | `banners` `insideMs` `rallyMs` | — |
| `godspeed_impaler` | `cdLeft` `lungePending` | 6 | `lunges` `penetrations` `hitsTotal` `thrusts` `chained` | — |
| `king_slayer_duel` | `cdLeft` | 2 | `duels` `duel_boss` `duelMs` | — |
| `blood_asura_trance` | `cdLeft` | 1 | `trances` `tranceMs` | — |
| `continental_quake_march` | `cdLeft` `remainStomps` | 3 | `marches` `plannedStomps` `marchDistance` `stomps` `completedMarches` | — |
| `heaven_mirror_reversal` | `cdLeft` | 2 | `windows` `windowMs` | — |

## 5. passive 4 件

| id | 名称 | rarity | maxLv | modifiers（1 レベルあたり） |
|----|------|--------|-------|------------------------------|
| `brute_force` | 剛力 | uncommon | 4 | `meleeDamage` addMult 0.07<br>`knockback` addMult 0.08<br>`poiseDamage` addMult 0.08 |
| `heavy_armor` | 重装 | uncommon | 4 | `damageReduction` addMult 0.03<br>`maxHp` addMult 0.05<br>`unyieldingPower` addMult 0.12 |
| `combat_instinct` | 戦闘本能 | uncommon | 4 | `comboGrace` addMult 0.12<br>`comboDecay` subMult 0.1<br>`attackSpeed` addMult 0.04<br>`comboThresholdBonus` addMult 0.1 |
| `bloodlust` | 血気 | rare | 4 | `killHeal` addMult 0.25<br>`killHealCap` addMult 0.15<br>`killHealRelease` addMult 0.1 |

4 passive すべてが少なくとも 1 件の進化条件に使われている（進化 18 件の条件内訳:
`combat_instinct` 4 / `bloodlust` 4 / `heavy_armor` 4 / `brute_force` 3、
および active 条件 `ground_slam` 2 / `counter_stance` 1）。
未使用 passive・未使用 modifier キーは 0 件（`tests/warrior-completion-job-passive.mjs`）。

## 6. この表の再生成

```
node tests/warrior-completion-catalog.mjs      # カタログ 30 / 4 / 18 / 52 の突合
node tests/warrior-completion-runtime-state.mjs # 保存キーの実測
node tests/warrior-completion-record-cast.mjs   # 主発動 1:1 の実測
```

