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
| 氷術師 frost_mage | 5 | 3 | 4（氷専用） |

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
