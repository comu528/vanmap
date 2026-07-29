# スキルカタログ（火の魔女・Milestone 6-F）

火の魔女は **active 30種・進化 18種・passive 4種・Job Lv1〜100** で完成している（M6-E）。
本書はそのカタログを **実データ（`data/skills.json`・`data/skill-evolutions.json`・`data/passives.json`・`data/jobs.json`）から生成した結果** をまとめたもの。
会話や手書きの一覧ではなく、`src/systems/SkillCatalog.js` の `buildCatalog` が実データから算出した内容が**唯一の正**である
（`node tests/skill-catalog.mjs` で整合を検証済み）。M6-F は**新スキルを追加していない**（整備・検証基盤のみ）。

## Milestone 7-A: カタログはジョブ別（火の魔女／氷術師）
M7-A で 2人目のジョブ **氷術師（frost_mage）** を追加したため、カタログは**ジョブ別**になった。本書の後半（集計サマリ以降）は
**火の魔女** のカタログ（active30/進化18・不変）である。氷術師は別プールで、`SkillCatalog` はジョブごとに `buildCatalog` する。

| ジョブ | active | 進化 | passive |
|--------|--------|------|---------|
| 火の魔女 flame_witch | 30 | 18 | 4（共通） |
| 氷術師 frost_mage | 30 | 18 | 4（氷専用） |

> 氷術師は M7-A で active5/進化3、M7-B で active15/進化8、M7-C で active25/進化13、**M7-D で active30/進化18** へ拡張（下記「Milestone 7-B」〜「Milestone 7-D」）。**M7-D で火の魔女と同規模のカタログに到達（氷術師カタログ完成）**・火の魔女は不変。**次工程は完成監査（抽選率/進化到達率/バランス分析）**。

- **氷術師 active5**: 氷晶弾 `frost_shard`（初期）/ 氷輪爆 `frost_nova` / 氷河槍 `glacial_lance` / 永久凍土 `permafrost_field` / 氷壁 `ice_wall`。
- **氷術師 進化3**: ダイヤモンドブリザード（frost_shard+rapid_freezing）/ 絶対零度領域（frost_nova+frozen_expansion）/ 天穿氷河槍（glacial_lance+frost_amplification）。
- **氷術師 passive4**: 氷晶増幅 / 急速冷却 / 凍域拡張 / 余寒残留（氷専用）。
- カタログは各スキルの **`element`（fire/ice）・`procCoefficient`（氷の凍結寄与）・冷気付与の有無（appliesChill）・凍結付与の有無（appliesFreeze）** を
  実データから露出する（氷スキルは `element:"ice"` と `procCoefficient`・`levels[].chillAmount`/`baseFreezeChance` を持つ）。
- Job Lv80「発射数+1」対象は**ジョブ内の独立弾を撃つ通常 active のみ**（氷術師は氷晶弾など `lv80ProjectileTarget:true` のもの）。
- 詳細は `docs/jobs.md`・`docs/status-effects.md`。以下は火の魔女カタログ（M6-E で完成・M7-A で不変）。

## カタログ生成（`src/systems/SkillCatalog.js`）
- `buildCatalog(data, { registeredSkillIds, skillsWithRuntimeState })` … active30/passive4/進化18の正確なカタログを生成し、
  **孤立・未登録・参照不整合** を検出する。SkillManager の `registeredSkillIds()`（実装クラスの有無）と
  `skillsWithRuntimeState()`（runtimeState 保存の有無）を注入して整合を判定する。
- `evolutionRecipes` … 進化18種の {基礎スキル, 補助条件, 最小枠} 一覧。
- `evolutionPartnerIds` … 進化相手（補助）として使われる基礎スキル/パッシブの id 集合（シナジー補助の対象）。
- `SkillAudit`（M6-E）と同じソースを共有する（UI 専用の別判定を作らない）。BattleScene が周回開始時に構築し、
  BaseScene の「カタログ」タブ（開発用）と抽選のシナジー補助（`buildDraftCtx`）で参照する。
- 実行: `node tests/skill-catalog.mjs`（Node 標準のみ・実データ使用）。

## 集計サマリ（実データ由来・skill-catalog テストで検証済み）
| 指標 | 値 |
|------|----|
| active 総数 | 30 |
| 進化を持つ active | 18 |
| 進化を持たない active | 12 |
| 進化（replacement）総数 | 18 |
| 複数進化に分岐する active | **0**（各 active は最大1進化） |
| passive 総数 | 4 |
| 孤立 / 未登録 / 参照不整合 | **0 件** |

## レアリティ分布
| 分類 | common | uncommon | rare | legendary | 計 |
|------|--------|----------|------|-----------|----|
| active | 8 | 10 | 9 | 3 | 30 |
| passive | 2 | 2 | – | – | 4 |

抽選重みは `data/skill-config.json` の `rarityWeights`（既定 common100/uncommon55/rare20/legendary5）。
legendary の実出現率は約 0.01（common 約 0.94 の70分の1以下）。M6-F でレアリティの大幅変更はしていない。

## 役割分布（active30種）
| 役割 | 数 | スキル |
|------|----|--------|
| 攻撃 | 25 | 下記の防御/移動/資源を除く全 active |
| 防御 | 3 | phoenix_feather（不死鳥の羽）/ flame_barrier（炎の障壁）/ bullet_furnace（弾喰い炉） |
| 移動 | 1 | blazing_step（爆炎歩法） |
| 資源 | 1 | bloodfire_pact（血炎契約・HP消費） |

## Job Lv80「発射数+1」対象（6種のみ・`SkillAudit.appliesLv80ProjectileCount`）
独立弾を撃つ通常 active のみが対象。**進化18種はすべて対象外**（単一形態）。
```
core_overdrive / fireball / flame_lance / homing_wisp / ricochet_ember / scatter_flame
```
対象外: 地雷/墓標/分身/光線/陣/亀裂/波/召喚/鎖/共鳴段階/熱量段階/進化。

## 進化を持たない active（12種）
```
blazing_step / bloodfire_pact / chain_flame / fire_spirit / flame_barrier /
four_sided_inferno / meteor / molten_chains / orbiting_flame / phoenix_feather /
ricochet_ember / scatter_flame
```
※ これらの `evolutionBranches` は空。将来の進化系統追加候補（`TODO.md` 参照）。

## 進化を持つ active（18種）＝進化レシピ一覧
各 active は基礎スキル Lv8＋補助条件 Lv4 で進化候補になる（補助条件は active・passive のどちらも指定でき、**消費されない**）。
補助 [P] は passive。**どのレシピも active 4枠で成立可能**（全レシピ minActiveSlots≤2・minPassiveSlots≤1）。

| 進化（replacement） | 基礎スキル(Lv8) | 補助条件(Lv4) | 最小 active枠 | 最小 passive枠 |
|---|---|---|---|---|
| 業火弾幕 infernal_barrage | fireball 火球 | orbiting_flame 周回する炎 | 2 | 0 |
| 煉獄噴火 purgatory_eruption | flame_pillar 火柱 | meteor 隕石 | 2 | 0 |
| 永劫火界 eternal_pyre | burning_trail 燃える軌跡 | orbiting_flame 周回する炎 | 2 | 0 |
| 千条炎槍 thousand_flame_lances | flame_lance 炎槍 | swift_cast 高速詠唱 [P] | 1 | 1 |
| 百鬼燎乱 hundred_wisp_parade | homing_wisp 追尾鬼火 | fire_spirit 火の精霊 | 2 | 0 |
| 太陽核崩壊 solar_core_collapse | lava_bomb 溶岩爆弾 | scorch_expand 焦熱拡張 [P] | 1 | 1 |
| 煉獄大火輪 infernal_vortex_wheel | flame_vortex 火炎渦 | burning_trail 燃える軌跡 | 2 | 0 |
| 終焉連鎖 apocalypse_chain | detonation_mark 起爆刻印 | power_amp 魔力増幅 [P] | 1 | 1 |
| 太陽滅却陣 solar_annihilation_array | scorching_ray 灼熱光線 | swift_cast 高速詠唱 [P] | 1 | 1 |
| 地獄火連鎖陣 hellfire_mine_network | ember_minefield 火種地雷 | detonation_mark 起爆刻印 | 2 | 0 |
| 炎帝剣域 inferno_blade_domain | flame_crescent 炎月斬 | flame_barrier 炎の障壁 | 2 | 0 |
| 灰燼軍勢 ash_legion | ash_doppelganger 灰燼分身 | fire_spirit 火の精霊 | 2 | 0 |
| 星喰い炉 star_devouring_furnace | bullet_furnace 弾喰い炉 | phoenix_feather 不死鳥の羽 | 2 | 0 |
| 冥炎大霊廟 necroflame_mausoleum | funeral_pyres 火葬の墓標 | phoenix_feather 不死鳥の羽 | 2 | 0 |
| 大地灼断 world_scorching_rift | magma_vein 炎脈走破 | burning_trail 燃える軌跡 | 2 | 0 |
| 六芒煉獄陣 hexagram_inferno_array | tri_flame_array 三角焔陣 | flame_vortex 火炎渦 | 2 | 0 |
| 万象炎鳴 universal_flame_resonance | scorching_resonance 灼熱共鳴 | chain_flame 連鎖炎 | 2 | 0 |
| 終末炉心 doomsday_core | core_overdrive 炉心暴走 | bloodfire_pact 血炎契約 | 2 | 0 |

- 補助が passive の4種（千条炎槍/太陽核崩壊/終焉連鎖/太陽滅却陣）は minActiveSlots=1・minPassiveSlots=1。
  残り14種は補助が active のため minActiveSlots=2・minPassiveSlots=0。
- **最難関**: 星喰い炉 star_devouring_furnace は 伝説基礎 bullet_furnace ＋ 伝説補助 phoenix_feather で
  全構成が伝説。構造上は 4枠で成立可能だが、実グラインドは非常に困難（詳細は `docs/balance-testing.md`）。

## 抽選での見え方（M6-F・シナジー補助）
active30種化で進化相手が候補へ極端に出にくくならないよう、**軽いシナジー補助**（`data/skill-config.json` の `synergy`）を追加した。
レアリティ重みへ**乗算**し（無視しない）、決定論は不変・data で無効化できる。詳細と抽選シミュレーション結果は
`docs/balance-testing.md` を参照。

## Milestone 7-B: 氷術師カタログ拡張（active15 / 進化8）
氷術師へ新 active10種・進化5種を追加し、`SkillCatalog.buildCatalog(frost_mage)` は **active15 / passive4（氷専用4）/ 進化8・issues0**（孤立/未登録/参照不整合0）になる。
火の魔女カタログ（active30 / passive4 / 進化18）は不変。

> **M7-B 追加監査（passive プール分離）**: `SkillCatalog` の passive 判定を `SkillDraftManager` と同一の `poolEligibility.memberAllowedForJob` に統一し、
> **各ジョブの `passiveSkillPool` を候補抽選の正**とした（`jobs` 未指定を暗黙の全ジョブ共通として扱わない）。これにより
> `flame_witch` の passive 候補＝火4種（`power_amp`/`swift_cast`/`scorch_expand`/`ember_persist`・`jobs:["flame_witch"]`）、
> `frost_mage` の passive 候補＝氷4種（`frost_amplification`/`rapid_freezing`/`frozen_expansion`/`lingering_cold`・`jobs:["frost_mage"]`）となり、
> **カタログ表示＝実抽選プール**が一致する（旧実装は共通 passive を含め frost_mage を8と表示していた＝表示と実抽選の食い違い＝修正済み）。
> 本当に全ジョブ共通の passive は `isCommon:true` もしくは `jobs:["*"]` で明示（将来追加口）。`basePassiveSlots` は両ジョブ4のまま。検証は `tests/passive-pool-audit.mjs`。

各 active/進化は `castMode`・`echoPolicy`/`clonePolicy`・`lv80ProjectileTarget`・`procCoefficient`・`runtimeState` を実データから露出する。

### 新 active10種
| スキル | id | rarity | castMode | echo/clonePolicy | lv80 | procCoeff | runtimeState |
|--------|----|--------|----------|------------------|------|-----------|--------------|
| 氷柱斉射 | `icicle_volley` | common | cooldown | standard | **true** | ≈0.38 | `cdLeft` |
| 氷晶環 | `frost_orbit` | common | continuous | standard | false | ≈0.20 | なし（常設・再構築） |
| 凍結光線 | `freezing_ray` | uncommon | continuous | standard | false | ≈0.12 | `cdLeft` |
| 雹嵐 | `hailstorm` | uncommon | periodic | standard | false | ≈0.22 | `cdLeft` |
| 氷結地雷 | `cryo_mine` | common | reactive | standard（canTriggerEcho=false） | false | ≈0.75 | `cdLeft` |
| 雪精霊 | `frost_spirit` | uncommon | continuous | standard | false | ≈0.42 | なし（常設・再構築） |
| 氷牢封印 | `ice_prison` | rare | cooldown | standard | false | ≈0.95(主)/0.45(周辺) | `cdLeft` |
| 雪崩奔流 | `avalanche` | uncommon | periodic | standard | false | ≈0.55 | `cdLeft` |
| 氷鏡結界 | `mirror_ice` | rare | defensive | **forbidden/forbidden** | false | ≈0.30 | `cdLeft`/`activeLeft`/`durabilityLeft` |
| 氷河墜落 | `glacier_drop` | legendary | cooldown | standard | false | ≈0.95(主)/0.15(残留床) | `cdLeft`/`pendingImpactLeft`/`pendingImpactX`/`pendingImpactY` |

- `glacier_drop` の `pendingImpact*` は落下待機を保存し、再開の無料再発動・二重落下を防ぐ。`mirror_ice` は複製なし（forbidden）で既存 `bossBulletPool` の absorbable メタを再利用。

### 新 進化5種（単一形態・element ice・lv80ProjectileTarget=false・evolved タグ）
| 進化 | id | 置換元 | 条件 | castMode | runtimeState |
|------|----|--------|------|----------|--------------|
| 天晶氷嵐 | `crystal_tempest` | `icicle_volley` | icicle_volley Lv8 ＋ frost_amplification Lv4 | cooldown | `cdLeft` |
| 絶対零光 | `absolute_zero_ray` | `freezing_ray` | freezing_ray Lv8 ＋ rapid_freezing Lv4 | continuous | `cdLeft` |
| 白魔大氷災 | `whiteout_cataclysm` | `hailstorm` | hailstorm Lv8 ＋ lingering_cold Lv4 | periodic | `cdLeft` |
| 雪后氷霊陣 | `frost_queen_court` | `frost_spirit` | frost_spirit Lv8 ＋ frozen_expansion Lv4 | continuous | なし（常設・再構築） |
| 終末氷河奔流 | `world_end_avalanche` | `avalanche` | avalanche Lv8 ＋ ice_wall(active) Lv4 | periodic | `cdLeft` |

- **Job Lv80「発射数+1」対象**は `SkillAudit` で一元管理し、新 active では `icicle_volley` のみ・新進化5種は全て対象外。検証は `frost-policy-audit.mjs`・`skill-catalog` 相当。

## Milestone 7-C: 氷術師カタログ拡張（active25 / 進化13）
氷術師へ新 active10種・進化5種を追加し、`SkillCatalog.buildCatalog(frost_mage)` は **active25 / passive4（氷専用4）/ 進化13・issues0**（孤立/未登録/参照不整合0）になる。
火の魔女カタログ（active30 / passive4 / 進化18）と氷術師の既存 active15/進化8 は不変。各 active/進化は `castMode`・`echoPolicy`/`clonePolicy`・`lv80ProjectileTarget`・`procCoefficient`・`config`（二次proc）・`runtimeState` を実データから露出する。

### 新 active10種
| スキル | id | rarity | castMode | echo/clonePolicy | lv80 | procCoeff | runtimeState |
|--------|----|--------|----------|------------------|------|-----------|--------------|
| 霜輪飛刃 | `rime_boomerang` | common | cooldown | standard | **true** | 0.38（復路 config 0.50） | `cdLeft` |
| 氷鎖連閃 | `frost_chain` | uncommon | cooldown | standard | false | 0.38 | `cdLeft` |
| 氷晶開花 | `crystal_bloom` | common | periodic | custom/custom | false | 0.16（開花 config 0.75） | `cdLeft`＋芽（x/y/growLeft/pulseLeft） |
| 白霧氷界 | `snowblind_mist` | uncommon | continuous | custom/custom | false | 0.14 | `cdLeft`/`activeLeft`/`centerX`/`centerY`/`tickLeft` |
| 極星氷弾 | `polar_star` | rare | cooldown | standard | **true** | 0.70（config pulse0.12/shard0.30） | `cdLeft` |
| 砕氷衝波 | `icebreaker_wave` | common | cooldown | standard | false | 0.60 | `cdLeft` |
| 氷刻停止 | `frozen_clock` | legendary | periodic | **forbidden/forbidden** | false | 0.65 | `cdLeft`/`remainingWaves`/`nextWaveLeft`/`waveIndex`/`origin` |
| 氷晶屈折 | `crystal_refraction` | rare | cooldown | standard | false | 0.38 | `cdLeft` |
| 冬冠結界 | `winter_halo` | uncommon | defensive | **forbidden/forbidden** | false | 0.32（反撃） | `cdLeft`/`activeLeft`/`durabilityLeft` |
| 氷彗星群 | `comet_sleet` | rare | periodic | custom/custom | false | 0.42（大彗星 config 0.80） | `cdLeft`/`barrageActive`/`cometsRemaining`/`nextCometLeft`/`barrageIndex`/`targetCenter`/`telegraphLeft` |

- `frozen_clock`/`winter_halo` は echoPolicy=clonePolicy=forbidden（複製・残響なし）。`crystal_bloom`/`snowblind_mist`/`comet_sleet` は custom（攻撃部分のみ複製・設置/追従は増やさない）。
- 設置/遅延/防御/barrage 型の runtimeState は再開時の無料再発動・二重生成・進化前後の同時稼働を防ぐ。飛行中 projectile/Graphics/Text/Tween/overlay/F10 選択は保存しない。

### 新 進化5種（単一形態・element ice・lv80ProjectileTarget=false・evolved タグ）
| 進化 | id | 置換元 | 条件 | castMode | runtimeState |
|------|----|--------|------|----------|--------------|
| 冥氷処刑輪 | `rime_execution_wheel` | `rime_boomerang` | rime_boomerang Lv8 ＋ frost_amplification Lv4 | cooldown | `cdLeft` |
| 永劫氷鎖 | `eternal_frost_chain` | `frost_chain` | frost_chain Lv8 ＋ rapid_freezing Lv4 | cooldown | `cdLeft` |
| 世界氷晶樹 | `crystal_world_tree` | `crystal_bloom` | crystal_bloom Lv8 ＋ frozen_expansion Lv4 | periodic | `cdLeft`＋樹（x/y/growLeft/pulseLeft/phase） |
| 永久白霧 | `everlasting_white_mist` | `snowblind_mist` | snowblind_mist Lv8 ＋ lingering_cold Lv4 | continuous | `cdLeft`/`activeLeft`/`center`/`tickLeft`/`whiteoutLeft` |
| 零刻世界 | `zero_hour_world` | `frozen_clock` | frozen_clock Lv8 ＋ ice_prison(補助 active) Lv4 | periodic | `cdLeft`/`remainingWaves`/`nextWaveLeft`/`waveIndex`/`origin` |

- **Job Lv80「発射数+1」対象**は明示フラグ（`lv80ProjectileTarget:true`）で `SkillAudit` が一元管理し、新 active では `rime_boomerang`/`polar_star`・新進化5種は全て対象外。氷全体の対象は計5種（`frost_shard`/`glacial_lance`/`icicle_volley`/`rime_boomerang`/`polar_star`）。
- `zero_hour_world` の条件に使う `ice_prison` は進化条件用の補助 active で置換しない。`frozen_clock`/`zero_hour_world` の `bossGaugeMult` はボス氷砕ゲージ量のみへ1命中1回だけ適用する（damage/chill/proc には掛からず二重加算しない）。検証は `frost-policy-audit-wave3.mjs`・`skill-catalog` 相当。詳細は `./docs/skills.md`・`./docs/jobs.md`。

## Milestone 7-D: 氷術師カタログ拡張・最終波（active30 / 進化18・カタログ完成）
氷術師へ新 active5種・進化5種を追加し、`SkillCatalog.buildCatalog(frost_mage)` は **active30 / passive4（氷専用4）/ 進化18・issues0**（孤立/未登録/参照不整合0）になり、**火の魔女カタログ（active30/passive4/進化18）と同規模に到達**した（氷術師カタログ完成）。
火の魔女カタログと氷術師の既存 active25/進化13 は不変。各 active/進化は `castMode`・`echoPolicy`/`clonePolicy`・`lv80ProjectileTarget`・`procCoefficient`・`config`（二次proc）・`bossGaugeMult`・`runtimeState` を実データから露出する。**次工程は氷術師カタログの完成監査**（抽選率/進化到達率/バランス分析）。

### 新 active5種
| スキル | id | rarity | castMode | echo/clonePolicy | lv80 | procCoeff | runtimeState |
|--------|----|--------|----------|------------------|------|-----------|--------------|
| 氷槍豪雨 | `glacial_spear_rain` | common | periodic | custom/custom | **true** | 0.42（大型 config 0.80） | `cdLeft`＋barrage（`spearsRemaining`/`nextSpearLeft`/`barrageIndex`/`targetCenter`/`telegraphLeft`） |
| 六花砲台 | `snowflake_sentry` | uncommon | continuous | custom/custom | false | 0.35（pulse config 0.18） | `deployLeft`/`nextInstanceId`＋各砲台（`instanceId`/x/y/`activeLeft`/`shotLeft`/pulse） |
| 氷山奔衝 | `iceberg_ram` | rare | cooldown | standard/custom | false | 0.55（崩壊 config 0.75） | `cdLeft`＋氷山（x/y/`direction`/`activeLeft`/`travel`/`collapsePending`/`instanceId`） |
| 絶対氷封 | `absolute_ice_seal` | rare | reactive | **forbidden/forbidden** | false | 0.85（起爆・`bossGaugeMult`1.25→1.50） | `markLeft`/`nextInstanceId`＋ボス印のみ |
| 極光氷幕 | `aurora_veil` | legendary | continuous | **forbidden/forbidden** | false | 0.14（burst config 0.75・`bossGaugeMult`1.15→1.35） | `recastLeft`/`activeLeft`/`tickLeft`/`burstLeft`/`phase`/`castIndex`/`layoutIndex` |

- `absolute_ice_seal`/`aurora_veil` は echoPolicy=clonePolicy=forbidden（複製・残響なし）。`glacial_spear_rain`/`snowflake_sentry` は custom（攻撃部分のみ複製・設置/砲台は増やさない）、`iceberg_ram` は echo=standard・clone=custom。
- **氷印/氷棺は skill-local マーカー**でカタログの正式 status には現れない（`StatusEffectRegistry` 非登録・`Enemy._iceSeal`/`_iceHitCount`）。設置/遅延/反応/barrage 型の runtimeState は再開時の無料再発動・二重生成・進化前後の同時稼働を防ぐ。飛行中 projectile/Graphics/Text/Tween/overlay/F10 選択・表示状態は保存しない。

### 新 進化5種（単一形態・element ice・lv80ProjectileTarget=false・evolved タグ）
| 進化 | id | 置換元 | 条件 | castMode | bossGaugeMult | runtimeState |
|------|----|--------|------|----------|---------------|--------------|
| 天墜氷槍葬 | `heavenfall_glacier_lances` | `glacial_spear_rain` | glacial_spear_rain Lv8 ＋ frost_amplification Lv4 | periodic | 1.4 | `cdLeft`＋barrage |
| 六花氷衛軍 | `crystal_sentinel_legion` | `snowflake_sentry` | snowflake_sentry Lv8 ＋ rapid_freezing Lv4 | continuous | — | 各砲台（`instanceId`/x/y/`activeLeft`/`shotLeft`/`linkCounter`） |
| 大陸氷河奔流 | `continental_glacier_rush` | `iceberg_ram` | iceberg_ram Lv8 ＋ frozen_expansion Lv4 | cooldown | — | `cdLeft`＋氷河 |
| 永劫封氷棺 | `eternal_sealed_coffin` | `absolute_ice_seal` | absolute_ice_seal Lv8 ＋ ice_prison(補助 active) Lv4 | reactive | 2.0 | `markLeft`＋ボス印 |
| 極夜天光 | `polar_night_aurora` | `aurora_veil` | aurora_veil Lv8 ＋ lingering_cold Lv4 | continuous | 1.7 | `recastLeft`/`activeLeft`/`tickLeft`/`burstLeft`/`pillarCounter`/`phase`/`layoutIndex` |

- **Job Lv80「発射数+1」対象**は明示フラグ（`lv80ProjectileTarget:true`）で `SkillAudit` が一元管理し、M7-D 新 active では `glacial_spear_rain` のみ・新進化5種は全て対象外。氷全体の対象は**計6種**（`frost_shard`/`glacial_lance`/`icicle_volley`/`rime_boomerang`/`polar_star`/`glacial_spear_rain`）。
- `eternal_sealed_coffin` の条件に使う `ice_prison` は補助 active で置換しない・起爆時に**副棺を最大1世代だけ伝播**（副棺は再伝播しない）。`bossGaugeMult` はボス氷砕ゲージ量のみへ1命中1回だけ適用する（M7-C 修正済み共通経路・damage/chill/proc には掛からず二重加算しない）。検証は `frost-policy-audit-wave4.mjs`・`frost-boss-gauge-wave4.mjs`・`skill-catalog` 相当。詳細は `./docs/skills.md`・`./docs/jobs.md`。

## Milestone 7-E: 氷術師 完成監査（カタログ確定・新規追加なし）
M7-E は**新しい active / passive / 進化 / ジョブ / 状態異常を一切追加しない**監査 Milestone。`SkillCatalog.buildCatalog('frost_mage')` は
**active30 / passive4 / 進化18・合計52・issues 0** で確定した（火の魔女も active30 / passive4 / 進化18 で不変）。

### 氷術師 active30（id 一覧・確定）
`frost_shard` / `frost_nova` / `glacial_lance` / `permafrost_field` / `ice_wall` /
`icicle_volley` / `frost_orbit` / `freezing_ray` / `hailstorm` / `cryo_mine` /
`frost_spirit` / `ice_prison` / `avalanche` / `mirror_ice` / `glacier_drop` /
`rime_boomerang` / `frost_chain` / `crystal_bloom` / `snowblind_mist` / `polar_star` /
`icebreaker_wave` / `frozen_clock` / `crystal_refraction` / `winter_halo` / `comet_sleet` /
`glacial_spear_rain` / `snowflake_sentry` / `iceberg_ram` / `absolute_ice_seal` / `aurora_veil`

### 氷術師 passive4（確定）
`frost_amplification` / `rapid_freezing` / `frozen_expansion` / `lingering_cold`（いずれも `jobs:["frost_mage"]`・`isCommon:false`）

### 氷術師 進化18（id 一覧・確定）
`diamond_blizzard` / `absolute_zero_domain` / `heaven_piercing_glacier` / `crystal_tempest` / `absolute_zero_ray` / `whiteout_cataclysm` /
`frost_queen_court` / `world_end_avalanche` / `rime_execution_wheel` / `eternal_frost_chain` / `crystal_world_tree` / `everlasting_white_mist` /
`zero_hour_world` / `heavenfall_glacier_lances` / `crystal_sentinel_legion` / `continental_glacier_rush` / `eternal_sealed_coffin` / `polar_night_aurora`

### 進化対応表（base Lv8 ＋ 補助）
| 進化 | base | base rarity | 補助 | 補助種別 | 必要Lv |
|------|------|-------------|------|----------|--------|
| `diamond_blizzard` | `frost_shard` | common | `rapid_freezing` | passive | 4 |
| `absolute_zero_domain` | `frost_nova` | common | `frozen_expansion` | passive | 4 |
| `heaven_piercing_glacier` | `glacial_lance` | uncommon | `frost_amplification` | passive | 4 |
| `crystal_tempest` | `icicle_volley` | common | `frost_amplification` | passive | 4 |
| `absolute_zero_ray` | `freezing_ray` | uncommon | `rapid_freezing` | passive | 4 |
| `whiteout_cataclysm` | `hailstorm` | uncommon | `lingering_cold` | passive | 4 |
| `frost_queen_court` | `frost_spirit` | uncommon | `frozen_expansion` | passive | 4 |
| `world_end_avalanche` | `avalanche` | uncommon | `ice_wall` | **active** | 4 |
| `rime_execution_wheel` | `rime_boomerang` | common | `frost_amplification` | passive | 4 |
| `eternal_frost_chain` | `frost_chain` | uncommon | `rapid_freezing` | passive | 4 |
| `crystal_world_tree` | `crystal_bloom` | common | `frozen_expansion` | passive | 4 |
| `everlasting_white_mist` | `snowblind_mist` | uncommon | `lingering_cold` | passive | 4 |
| `zero_hour_world` | `frozen_clock` | legendary | `ice_prison` | **active** | 4 |
| `heavenfall_glacier_lances` | `glacial_spear_rain` | common | `frost_amplification` | passive | 4 |
| `crystal_sentinel_legion` | `snowflake_sentry` | uncommon | `rapid_freezing` | passive | 4 |
| `continental_glacier_rush` | `iceberg_ram` | rare | `frozen_expansion` | passive | 4 |
| `eternal_sealed_coffin` | `absolute_ice_seal` | rare | `ice_prison` | **active** | 4 |
| `polar_night_aurora` | `aurora_veil` | legendary | `lingering_cold` | passive | 4 |

- **分岐進化なし**（1 base → 1 進化）。**進化対象 active 18 種 / 非対象 12 種**（`permafrost_field` `ice_wall` `frost_orbit` `cryo_mine` `ice_prison` `mirror_ice` `glacier_drop` `polar_star` `icebreaker_wave` `crystal_refraction` `winter_halo` `comet_sleet`）。
- **補助の共有**: passive は `frost_amplification`×4 / `rapid_freezing`×4 / `frozen_expansion`×4 / `lingering_cold`×3、active 補助は `ice_prison`×2 / `ice_wall`×1。
- rarity 分布（active30）: common 9 / uncommon 10 / rare 8 / legendary 3。
- 詳細な到達率・抽選分析は `./frost-completion-audit.md` / `./frost-draft-analysis.md` / `./frost-balance-report.md`。


---

## Milestone 8-A: 火の魔女 完成監査（カタログ確定・新規追加なし）

火の魔女の **active30 / passive4 / 進化18（合計 52）** を `SkillCatalog` で再検証し、確定させた。
新しい active / passive / 進化 / ジョブ / 状態異常 / 敵 / ボス / 難易度は**追加していない**。

- `catalog.issues` **0 件**、duplicate id / displayName **0 件**（skills / evolutions / passives でグローバル一意）。
- 未登録クラス（JSON だけ存在）**0 件** / 孤立クラス（REGISTRY だけ存在）**0 件**。
- `SkillCatalog` の一覧 = `poolEligibility.memberAllowedForJob` の適格集合 = `SkillDraftManager` の候補元。
- 火 skill が氷へ / 氷 skill が火へ出ることは **0 件**。明示共通（`isCommon:true` / `jobs:["*"]`）は **0 件**。
- rarity 分布（active30）: **common 8 / uncommon 10 / rare 9 / legendary 3**。
- Job Lv80「発射数+1」対象は明示 flag の **6 種のみ**
  （`fireball` `flame_lance` `scatter_flame` `homing_wisp` `ricochet_ember` `core_overdrive`）。進化 18 種は対象外。

### 進化対応表（18 件・すべて base Lv8 ＋ 補助 Lv4・分岐なし）

| evolution | base | 補助 | 種別 |
|---|---|---|---|
| `infernal_barrage` | `fireball` | `orbiting_flame` | active |
| `purgatory_eruption` | `flame_pillar` | `meteor` | active |
| `eternal_pyre` | `burning_trail` | `orbiting_flame` | active |
| `thousand_flame_lances` | `flame_lance` | `swift_cast` | passive |
| `hundred_wisp_parade` | `homing_wisp` | `fire_spirit` | active |
| `solar_core_collapse` | `lava_bomb` | `scorch_expand` | passive |
| `infernal_vortex_wheel` | `flame_vortex` | `burning_trail` | active |
| `apocalypse_chain` | `detonation_mark` | `power_amp` | passive |
| `solar_annihilation_array` | `scorching_ray` | `swift_cast` | passive |
| `hellfire_mine_network` | `ember_minefield` | `detonation_mark` | active |
| `inferno_blade_domain` | `flame_crescent` | `flame_barrier` | active |
| `ash_legion` | `ash_doppelganger` | `fire_spirit` | active |
| `star_devouring_furnace` | `bullet_furnace` | `phoenix_feather` | active |
| `necroflame_mausoleum` | `funeral_pyres` | `phoenix_feather` | active |
| `world_scorching_rift` | `magma_vein` | `burning_trail` | active |
| `hexagram_inferno_array` | `tri_flame_array` | `flame_vortex` | active |
| `universal_flame_resonance` | `scorching_resonance` | `chain_flame` | active |
| `doomsday_core` | `core_overdrive` | `bloodfire_pact` | active |

- **進化対象 active 18 種 / 非対象 12 種**（`orbiting_flame` `meteor` `scatter_flame` `chain_flame` `fire_spirit`
  `phoenix_feather` `flame_barrier` `ricochet_ember` `bloodfire_pact` `four_sided_inferno` `molten_chains` `blazing_step`）。
- **補助の共有**: active 補助 `orbiting_flame`×2 / `fire_spirit`×2 / `burning_trail`×2 / `phoenix_feather`×2、
  passive 補助 `swift_cast`×2 / `power_amp`×1 / `scorch_expand`×1 / `ember_persist`×0。
- `ember_persist` は進化補助ではないが `duration` modifier が実装から参照されるため**死に passive ではない**。
- 詳細な到達率・抽選分析は `./flame-completion-audit.md` / `./flame-draft-analysis.md` / `./flame-balance-report.md`。

## Milestone 8-B: 戦士カタログ 基盤（active5 / passive4 / 進化3）

M8-B で 3人目のジョブ **戦士（warrior）** を追加した。属性は **`physical`**（火 `fire` / 氷 `ice` とは独立）。
戦士は**近接専用**で、遠距離へ飛ぶ斬撃波を持たない（すべて自分中心・前方 arc の近接判定）。
火の魔女・氷術師のカタログ（各 active30 / passive4 / 進化18）は**一切変更していない**。

| ジョブ | active | 進化 | passive | 属性 |
|--------|--------|------|---------|------|
| 火の魔女 flame_witch | 30 | 18 | 4（火専用） | fire |
| 氷術師 frost_mage | 30 | 18 | 4（氷専用） | ice |
| **戦士 warrior** | **5 → 15（M8-C）** | **3 → 8（M8-C）** | **4（戦士専用）** | **physical** |

### 戦士 active5

| id | 名称 | rarity | 役割 | Lv80 打撃数+1 | 進化 |
|----|------|--------|------|----------------|------|
| `great_cleave` | 大薙ぎ | common | 前方 arc の基本斬撃（初期スキル・多段） | ○ | `thousand_blade_dance` |
| `shield_bash` | 盾撃 | uncommon | 高ノックバック・高体勢削り・短い被ダメージ軽減 | ○ | `unyielding_fortress` |
| `whirlwind_slash` | 旋風斬り | uncommon | 自分中心の回転斬り（明確な duration） | × | `bloodstorm_whirlwind` |
| `charge_slash` | 突進斬り | rare | 密集へ短距離ダッシュ・突進中は軽減 | × | （なし） |
| `ground_slam` | 地砕き | rare | 自分中心 AoE・最大の体勢削り・闘気解放中は二撃目 | ○ | （なし） |

### 戦士 passive4

| id | 名称 | rarity | 効果（modifier） |
|----|------|--------|------------------|
| `brute_force` | 剛力 | common | `meleeDamage` / `knockback` / `poiseDamage` |
| `heavy_armor` | 重装 | uncommon | `damageReduction` / `maxHp` / `unyieldingPower`（不屈の強化） |
| `combat_instinct` | 戦闘本能 | uncommon | `comboGrace` / `comboDecay` / `attackSpeed` / `comboThresholdBonus` |
| `bloodlust` | 血気 | rare | `killHeal` / `killHealCap` / `killHealRelease`（**撃破回復はこの passive を取ったときだけ発生する**） |

### 戦士 進化3

| 進化 id | 基礎 active | 補助 passive（Lv4） | 特徴 |
|---------|-------------|---------------------|------|
| `thousand_blade_dance` | `great_cleave` | `combat_instinct` | 連続斬撃＋締めの全周斬り（1 発動 = 1 cast） |
| `bloodstorm_whirlwind` | `whirlwind_slash` | `bloodlust` | 回転中の撃破で duration がわずかに延びる（1 発動あたり上限あり） |
| `unyielding_fortress` | `shield_bash` | `heavy_armor` | 打撃後に反撃構え（1 構え 1 回だけ反撃） |

- 進化を持たない active は `charge_slash` `ground_slam` の 2 種（M8-B の範囲では進化を追加しない）。
- 戦士の active / 進化はすべて **残響・分身の対象外**（`echoPolicy` / `clonePolicy` = `forbidden`）。
  近接が無料で増える経路を作らないための意図的な制約。
- 検証: `node tests/warrior-catalog.mjs` / `node tests/warrior-pool-eligibility.mjs` / `node tests/three-job-nonregression.mjs`。
- 設計の詳細は `./jobs.md`（戦士セクション）と `./game-design.md`。

## Milestone 8-C: 戦士スキル拡張 Wave1（active15 / passive4 / 進化8 = 27）

M8-C で戦士へ **active10 種・進化5 種**を追加した（passive は 4 種のまま）。
既存 5 active・3 進化の数値と挙動は変更していない。火の魔女・氷術師のカタログも不変（各 30/4/18）。

| ジョブ | active | 進化 | passive | 属性 |
|--------|--------|------|---------|------|
| 火の魔女 flame_witch | 30 | 18 | 4 | fire |
| 氷術師 frost_mage | 30 | 18 | 4 | ice |
| **戦士 warrior** | **25** | **13** | **4** | **physical** |

### 追加した active10（役割を分散させている）

| id | 名称 | rarity | 役割 | Lv80 打撃数+1 | 進化 |
|----|------|--------|------|----------------|------|
| `armor_breaker` | 兜割り | uncommon | 単体高体勢ダメージ（エリート/ボス優先） | ○ | `skull_splitter` |
| `twin_fang_slash` | 双牙斬 | common | 高速コンボ（交差する 2 連斬り） | ○ | （なし） |
| `execution_strike` | 処刑斬 | rare | 瀕死狙い（通常敵のみ処刑） | × | `crimson_execution` |
| `leap_smash` | 跳躍強襲 | uncommon | 跳躍接近＋着地 AoE | × | `heaven_crushing_descent` |
| `sweeping_advance` | 薙ぎ進軍 | uncommon | 移動しながら左右交互に薙ぎ払い | × | （なし） |
| `counter_stance` | 迎撃の構え | uncommon | 能動 counter（軽減＋反撃） | × | `adamant_counter` |
| `war_cry` | 戦吼 | rare | 短時間 buff＋短距離 shock | × | `war_god_roar` |
| `chain_hook` | 鎖鉤 | rare | 引き寄せ／接近補助 | × | （なし） |
| `shockwave_stomp` | 震脚 | common | 短距離制圧（狭く速い） | × | （なし） |
| `relentless_combo` | 怒涛連撃 | rare | 連続近接（撃破で引き継ぎ） | ○ | （なし） |

### 追加した evolution5

| 進化 id | 名称 | 基礎 active | 補助 | 特徴 |
|---------|------|-------------|------|------|
| `skull_splitter` | 断界兜割 | `armor_breaker` | `brute_force` Lv4 | 二段 overhead。二段目は狭い衝撃で体勢を崩し切る |
| `crimson_execution` | 血断処刑 | `execution_strike` | `bloodlust` Lv4 | 通常敵の処刑閾値強化＋撃破時の回復強化（1 世代だけ連鎖） |
| `war_god_roar` | 軍神咆哮 | `war_cry` | `combat_instinct` Lv4 | 範囲とバフを強化し、コンボ猶予を立て直す |
| `adamant_counter` | 金剛迎撃 | `counter_stance` | `heavy_armor` Lv4 | 構えが長く、反撃後に短い軽減。反撃の優先度は最上位 |
| `heaven_crushing_descent` | 天墜崩撃 | `leap_smash` | **active** `ground_slam` Lv6 | 着地後に 1 回だけ二次衝撃。地砕きは置換されず CD も変わらない |

- **Job Lv80「打撃数 +1」対象は 6 種**（`great_cleave` `shield_bash` `ground_slam` ＋ M8-C の
  `armor_breaker` `twin_fang_slash` `relentless_combo`）。進化 8 種はすべて対象外。
- 進化を持たない active は 6 種（`charge_slash` `ground_slam` `twin_fang_slash` `sweeping_advance`
  `chain_hook` `shockwave_stomp`）。うち `ground_slam` は天墜崩撃の **active 補助**として機能する。
- 戦士の active / 進化はすべて **残響・分身の対象外**（`echoPolicy` / `clonePolicy` = `forbidden`）。
- 検証: `node tests/warrior-wave1-catalog.mjs` / `node tests/warrior-wave1-pool.mjs` /
  `node tests/three-job-wave1-nonregression.mjs`。
- 役割・設計意図の詳細は `./warrior-wave1.md`、スキル横断の一覧は `./warrior-skill-matrix.md`。

---

## 戦士スキル拡張 Wave 2（Milestone 8-D）

M8-D で戦士へさらに **active10 種・進化5 種**を追加した（合計 active25 / 進化13 / passive4）。
既存 15 active・8 進化の数値と挙動は変更していない。火の魔女・氷術師のカタログも不変（各 30/4/18）。

### 追加した active10（Wave1 と役割が重ならないように配っている）

| id | 名称 | rarity | 役割 | Lv80 打撃数+1 | 進化 |
|----|------|--------|------|----------------|------|
| `rising_slash` | 昇竜斬 | common | 前方の狭い斬り上げ（通常敵を短く打ち上げ） | × | `heaven_rending_ascent` |
| `shield_charge` | 鉄壁突進 | uncommon | 前面防御つき突進（終点で衝撃） | × | `fortress_rampage` |
| `backstep_riposte` | 燕返し | uncommon | 後退→踏み込みの斬り返し（反撃系ではない） | × | `shadow_swallow_riposte` |
| `battlefield_throw` | 豪腕投げ | rare | 通常敵を掴んで投げる制圧 | × | `mountain_hurl` |
| `triple_crush` | 三段砕き | common | 三段の打撃コンボ（最終段が本命） | × | （なし） |
| `blade_guard` | 刃防陣 | uncommon | 能動防御＋ごく近距離の周期斬り | × | （なし） |
| `berserker_rush` | 狂戦猛進 | rare | 低 HP ほど重い連続踏み込み | × | （なし） |
| `war_axe_throw` | 戦斧投擲 | uncommon | 往復する短距離の投擲（近接倍率は乗らない） | × | （なし） |
| `breaker_knee` | 破城膝撃 | common | 超近距離の単体・体勢特化 | × | （なし） |
| `rallying_banner` | 戦旗招集 | rare | その場へ短時間の陣（内側でのみ効く） | × | `blood_oath_standard` |

### 追加した evolution5

| 進化 id | 名称 | 基礎 active | 補助 | 特徴 |
|---------|------|-------------|------|------|
| `heaven_rending_ascent` | 天衝断空 | `rising_slash` | `brute_force` Lv4 | 二段の斬り上げ。打ち上げは一段目だけ、二段目で叩き落とす |
| `fortress_rampage` | 城塞蹂躙 | `shield_charge` | `heavy_armor` Lv4 | 突進が長く、終点の衝撃が広い。前面軽減も強い |
| `shadow_swallow_riposte` | 無影燕返 | `backstep_riposte` | `combat_instinct` Lv4 | 二度差し返す。二段目だけ近距離 retarget 可 |
| `mountain_hurl` | 山岳投擲 | `battlefield_throw` | **active** `ground_slam` Lv6 | 着地点に巨大衝撃。エリートは叩きつけ＋追撃。地砕きは置換されず CD も変わらない |
| `blood_oath_standard` | 血盟戦旗 | `rallying_banner` | `bloodlust` Lv4 | 陣の内側で倒したときだけ血気の回復を小幅強化 |

- **Job Lv80「打撃数 +1」対象は 6 種のまま**（`great_cleave` `shield_bash` `ground_slam`
  `armor_breaker` `twin_fang_slash` `relentless_combo`）。Wave2 の 15 種はすべて対象外で、
  火 / 氷の Lv80 対象も変えていない。
- 進化を持たない active は 11 種（Wave1 の 6 種 ＋ `triple_crush` `blade_guard` `berserker_rush`
  `war_axe_throw` `breaker_knee`）。`ground_slam` は天墜崩撃と山岳投擲の **active 補助**を兼ねる。
- Wave2 の active / 進化もすべて **残響・分身の対象外**（`echoPolicy` / `clonePolicy` = `forbidden`）。
- 役割・設計意図の詳細は `./warrior-wave2.md`。
