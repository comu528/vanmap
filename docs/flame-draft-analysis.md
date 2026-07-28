# 火の魔女 抽選バランス分析（Milestone 8-A）

`DraftBalanceAnalyzer` が **production の `SkillDraftManager` + `SeededRandom` + `poolEligibility` +
実 rarity 重み + 実 synergy / pity + 実 reroll / banish / skip** をそのまま駆動した結果。
独自の簡易抽選器は作っていない。`Math.random` は使わない（seed 範囲固定＝完全な決定論）。

- 条件: **200 seed（1..200）/ level-up 60 回 / 候補 3 / Job Lv1 / active 枠 4・6・8 / passive 枠 4**
- 戦略 5 種: `evolution-first` / `balanced` / `random-valid` / `new-skill-priority` / `one-build-focus`
- HEAVY: `HEAVY=1 node tests/flame-draft-balance.mjs` で 500 seed
- 再現: `node tests/flame-draft-balance.mjs` / `node tests/flame-evolution-distribution.mjs`

---

## 1. 必ず 0 のカウンタ（全戦略 × 全枠）

| 指標 | 結果 |
|------|------|
| 他ジョブ skill の混入 | **0** |
| プール外 / 不正候補 | **0** |
| 重複候補 | **0** |
| slot 違反の取得 | **0** |
| 到達不能進化の取得 | **0** |
| 進化後の元 active の再提示 | **0** |
| 条件成立後に進化候補が提示されない周回 | **0** |

「候補なし」ドラフトは**満枠かつ所持スキルが全て最大 Lv** の終盤でのみ発生し、枠が広いほど減る
（slot4 14〜15% → slot6 0% → slot8 0%）。production は `forceClear` で救済して戦闘へ戻す。

## 2. 進化到達率（戦略 × 枠数・200 seed / 60 level-up）

| 戦略 | 枠 | 平均進化数 | ≥1 | ≥2 | ≥3 | 0個 | 最大 |
|------|----|-----------|----|----|----|-----|------|
| evolution-first | 4 | **1.44** | **90.0%** | 45.0% | 7.0% | 10.0% | 4 |
| evolution-first | 6 | **2.20** | **96.0%** | **78.5%** | 38.0% | 4.0% | 5 |
| evolution-first | 8 | **2.29** | **97.0%** | **78.5%** | 45.0% | 3.0% | 4 |
| balanced | 4 | 0.81 | 65.0% | 15.5% | 1.0% | 35.0% | 3 |
| balanced | 6 | 1.42 | 86.0% | 44.5% | 10.0% | 14.0% | 4 |
| balanced | 8 | 1.75 | 91.5% | 60.5% | 20.5% | 8.5% | 4 |
| random-valid | 4 | 0.84 | 62.0% | 20.5% | 2.0% | 38.0% | 3 |
| random-valid | 6 | 0.74 | 58.0% | 14.0% | 2.0% | 42.0% | 3 |
| random-valid | 8 | 0.46 | 40.5% | 5.5% | 0.0% | 59.5% | 2 |
| new-skill-priority | 4 | 0.92 | 67.0% | 23.0% | 1.5% | 33.0% | 3 |
| new-skill-priority | 6 | 0.96 | 69.5% | 22.0% | 4.5% | 30.5% | 4 |
| new-skill-priority | 8 | 0.56 | 45.5% | 9.5% | 0.5% | 54.5% | 3 |
| one-build-focus | 4 | 1.47 | 90.5% | 46.5% | 7.5% | 9.5% | 4 |
| one-build-focus | 6 | **2.23** | **97.0%** | **79.0%** | 41.0% | 3.0% | 4 |
| one-build-focus | 8 | **2.37** | **98.5%** | **80.0%** | 49.5% | 1.5% | 4 |

### 警告基準（M7-E と同じ基準）との比較

| 枠 | 基準 | 実測 | 判定 |
|----|------|------|------|
| slot4 | ≥1 が 80% 以上 | 90.0% | ✅ |
| slot4 | 平均 1.0 以上 | 1.44 | ✅ |
| slot4 | 0 個が 20% 以下 | 10.0% | ✅ |
| slot6 | ≥1 が 95% 以上 | 96.0% | ✅ |
| slot6 | ≥2 が 60% 以上 | 78.5% | ✅ |
| slot6 | 平均 1.7 以上 | 2.20 | ✅ |
| slot8 | ≥1 が 95% 以上 | 97.0% | ✅ |
| slot8 | ≥2 が 65% 以上 | 78.5% | ✅ |
| slot8 | 平均 1.8 以上 | 2.29 | ✅ |

**全 9 基準を満たしている**（`FLAME_EVOLUTION_LOW_RATE` は 0 件）。
M7-E で氷術師に残った `slot8:atLeast1 = 94.0%` のような未達は火の魔女では発生しない。
差の主因は「火は 18 進化のうち 14 件が active 補助（枠を 1 つ余分に使う）」であり、
枠が広がるほど条件形成が進むため、氷で見られた「枠が広いほど level-up が分散して薄まる」効果が相殺されている。

`random-valid` / `new-skill-priority` は枠が広いほど進化数が**減る**。
これは「枠が広い＝新規取得の選択肢が長く残る＝Lv8 まで伸ばす回数が減る」希釈特性で、
進化を狙わない戦略に固有のもの（不具合ではない）。

## 3. level-up 回数の影響（evolution-first / slot6）

| level-up | 平均進化数 | ≥1 |
|----------|-----------|-----|
| 30 | 0.24 | 23.0% |
| 60 | 2.20 | 96.0% |
| 90 | 2.37 | 96.5% |

比較は必ず同じ `levelUps` で行うこと。

## 4. active30 の提示率 / 取得率 / Lv8 到達率（evolution-first・slot6）

| active | rarity | 提示率 | 取得/周回 | Lv8 到達 |
|--------|--------|--------|-----------|----------|
| `burning_trail` | common | 12.7% | 4.36 | 55% |
| `magma_vein` | common | 11.9% | 4.04 | 51% |
| `ember_minefield` | common | 10.7% | 3.64 | 46% |
| `flame_lance` | common | 10.5% | 3.44 | 43% |
| `orbiting_flame` | uncommon | 9.8% | 2.58 | 32% |
| `flame_crescent` | common | 9.4% | 3.04 | 38% |
| `fireball` | common | 9.3% | 3.16 | 40% |
| `funeral_pyres` | uncommon | 8.4% | 2.91 | 36% |
| `homing_wisp` | uncommon | 7.2% | 2.50 | 31% |
| `fire_spirit` | uncommon | 6.8% | 1.63 | 20% |
| `scorching_ray` | uncommon | 6.4% | 2.20 | 28% |
| `flame_barrier` | uncommon | 6.3% | 1.38 | 16% |
| `flame_pillar` | uncommon | 6.2% | 2.12 | 27% |
| `lava_bomb` | uncommon | 5.0% | 1.64 | 21% |
| `ricochet_ember` | common | 4.3% | 0.56 | 7% |
| `detonation_mark` | rare | 3.8% | 1.44 | 13% |
| `scatter_flame` | common | 3.7% | 0.36 | 5% |
| `ash_doppelganger` | rare | 3.0% | 1.18 | 10% |
| `blazing_step` | uncommon | 2.7% | 0.36 | 5% |
| `tri_flame_array` | rare | 2.5% | 1.02 | 9% |
| `flame_vortex` | rare | 2.4% | 0.91 | 8% |
| `scorching_resonance` | rare | 2.3% | 0.85 | 8% |
| `molten_chains` | uncommon | 2.2% | 0.23 | 3% |
| `meteor` | rare | 1.7% | 0.49 | 4% |
| `chain_flame` | rare | 1.5% | 0.39 | 3% |
| `bloodfire_pact` | rare | 1.0% | 0.20 | 2% |
| `four_sided_inferno` | rare | 0.8% | 0.07 | 1% |
| `core_overdrive` | legendary | 0.5% | 0.20 | 1% |
| `bullet_furnace` | legendary | 0.4% | 0.16 | 2% |
| `phoenix_feather` | legendary | 0.3% | 0.06 | 1% |

- **提示 0 / 取得 0 の active は 0 件**（ハズレ候補・死に候補なし）。
- 進化非対象 12 種もすべて提示・取得される。うち 10 種は進化補助としての役割も持つ
  （`orbiting_flame` `meteor` `chain_flame` `fire_spirit` `phoenix_feather` `flame_barrier`
  `bloodfire_pact` `flame_vortex`※・`detonation_mark`※・`burning_trail`※ ※は進化対象でもある）。
  純粋に進化にも補助にも関わらないのは `scatter_flame` `ricochet_ember` `four_sided_inferno`
  `molten_chains` `blazing_step` の 5 種で、いずれも通常候補として提示・取得される。

### レアリティ帯内の偏り（`balanced` / slot6・中央値比）

| rarity | 件数 | 中央値 | 最小 | 最大 | 判定 |
|--------|------|--------|------|------|------|
| common | 8 | 8.86% | 7.22%（`fireball`） | 18.88%（`ricochet_ember`） | ✅ 中央値の 1/3〜3 倍以内 |
| uncommon | 10 | 6.11% | 4.17%（`lava_bomb`） | 9.70%（`orbiting_flame`） | ✅ |
| rare | 9 | 1.95% | 1.54%（`tri_flame_array`） | 2.42%（`flame_vortex`） | ✅ |
| legendary | 3 | 0.41% | 0.39%（`core_overdrive`） | 0.45%（`phoenix_feather`） | ✅（件数 3 のため中央値比の判定は対象外） |

- `common > uncommon > rare > legendary` の順序が保たれる。
- legendary は common の 1/5 未満だが **0 ではない**（事実上出ない、ではない）。
- common の提示比率は全体の 48% で、**common 独占ではない**。
- `FLAME_RARITY_SKEW` は **0 件**。

> `ricochet_ember` / `scatter_flame` の提示率が common 帯で高いのは、
> **どちらも進化対象でも補助でもないため synergy 補正の対象にならず、
> 進化ラインへ吸われた枠のぶんだけ相対的に浮上する**ため（重みは全 active で `weight:1` 均一）。
> 単なる均一化はしていない。

## 5. passive4（evolution-first・slot6）

| passive | 取得/周回 | Lv4 到達率 | 進化補助としての要求数 |
|---------|-----------|-----------|------------------------|
| `swift_cast` | 3.50 | 62% | 2（`thousand_flame_lances` / `solar_annihilation_array`） |
| `scorch_expand` | 2.84 | 45% | 1（`solar_core_collapse`） |
| `power_amp` | 2.20 | 29% | 1（`apocalypse_chain`） |
| `ember_persist` | 2.16 | 26% | 0（`duration` modifier で機能） |

- 最大 / 最小比 = **1.62**（基準 3.0 以内）。`FLAME_PASSIVE_SKEW` は 0 件。
- 取得 0 の passive は無い。
- 偏りの順序は「進化補助として要求される数」と一致しており、synergy 補正が意図どおり働いている。

## 6. reroll / banish / skip / pity / synergy（evolution-first・slot6）

| 指標 | 値 |
|------|----|
| reroll 使用 / 周回 | 1.00（基礎 1 回を超えない） |
| banish 使用 / 周回 | 1.00（同上） |
| skip 使用 / 周回 | 0（枠 6 では候補なしが発生しないため。枠 4 では発生しうる） |
| pity 条件（`draftsSinceProgress > 4`）に入るドラフト率 | 79.2% |
| synergy 倍率が適用された候補 / ドラフト | 1.84 |
| 候補内訳 / ドラフト | 強化 1.71 / 新規 1.24 / 進化 0.037 |
| 満枠ドラフト率 | 3.6% |
| active 枠充足率 | 100% |
| passive 枠充足率 | 80.9% |

## 7. 個別進化の到達率（evolution-first・slot6）

| evolution | base | base取得 | baseLv8 | supportLv | 条件成立 | 提示 | 取得 |
|-----------|------|---------|---------|-----------|---------|------|------|
| `thousand_flame_lances` | `flame_lance` | 43% | 43% | 62% | 42% | 42% | **42%** |
| `world_scorching_rift` | `magma_vein` | 51% | 51% | 55% | 31% | 31% | **31%** |
| `solar_annihilation_array` | `scorching_ray` | 28% | 28% | 62% | 26% | 26% | **26%** |
| `eternal_pyre` | `burning_trail` | 55% | 55% | 33% | 21% | 21% | **21%** |
| `infernal_barrage` | `fireball` | 40% | 40% | 33% | 18% | 18% | **18%** |
| `solar_core_collapse` | `lava_bomb` | 21% | 21% | 45% | 18% | 18% | **18%** |
| `inferno_blade_domain` | `flame_crescent` | 38% | 38% | 18% | 14% | 14% | **14%** |
| `hellfire_mine_network` | `ember_minefield` | 46% | 46% | 20% | 12% | 12% | **12%** |
| `hundred_wisp_parade` | `homing_wisp` | 32% | 31% | 21% | 12% | 12% | **12%** |
| `apocalypse_chain` | `detonation_mark` | 20% | 13% | 29% | 11% | 11% | **11%** |
| `purgatory_eruption` | `flame_pillar` | 27% | 27% | 7% | 6% | 6% | **6%** |
| `infernal_vortex_wheel` | `flame_vortex` | 13% | 8% | 55% | 4% | 4% | **4%** |
| `ash_legion` | `ash_doppelganger` | 16% | 10% | 21% | 3% | 3% | **3%** |
| `universal_flame_resonance` | `scorching_resonance` | 12% | 8% | 5% | 3% | 3% | **3%** |
| `necroflame_mausoleum` | `funeral_pyres` | 37% | 36% | 1% | 1% | 1% | **1%** |
| `star_devouring_furnace` | `bullet_furnace` | 2% | 2% | 1% | 1% | 1% | **1%** |
| `doomsday_core` | `core_overdrive` | 4% | 1% | 3% | 1% | 1% | **1%** |
| `hexagram_inferno_array` | `tri_flame_array` | 14% | 9% | 13% | 0% | 0% | **0%** |

**条件成立後に提示されなかった周回は全戦略・全枠で 0**（提示漏れなし）。
**全戦略・全枠を合算すると 18 件すべてが実際に進化する**（到達不能 0 / 取得 0 は 0 件）。

合算取得率（`evolution-first` / `balanced` × slot 4・6・8 の合計）:

| evolution | 合算 | 主因 |
|-----------|------|------|
| `star_devouring_furnace` | 0.01 | base が legendary（`bullet_furnace`）＋ legendary 補助（`phoenix_feather`）の**二重ハンデ** |
| `doomsday_core` | 0.01 | base が legendary（`core_overdrive`）＋ rare 補助（`bloodfire_pact`） |
| `hexagram_inferno_array` | 0.03 | base が rare（`tri_flame_array`）＋ rare 補助（`flame_vortex`）。M6-F 以来の既知の低率 |
| `universal_flame_resonance` | 0.04 | base が rare（`scorching_resonance`）＋ rare 補助（`chain_flame`） |
| `necroflame_mausoleum` | 0.04 | 補助が legendary（`phoenix_feather` Lv4） |
| `ash_legion` | 0.09 | base が rare（`ash_doppelganger`） |
| `purgatory_eruption` | 0.17 | 補助が rare（`meteor` Lv4） |
| `infernal_vortex_wheel` | 0.18 | base が rare（`flame_vortex`） |
| （以下 10 件） | 0.39〜2.02 | common / uncommon base ＋ 到達しやすい補助 |

低率の原因はすべて **base のレアリティ**または **補助のレアリティ / active 補助が枠を 1 つ余分に使うこと**で説明できる。
`FLAME_EVOLUTION_ZERO_RATE`（合算 2% 未満）は 0 件で、**到達不能ではない**。
同系統（common base ＋ passive 補助 / common base ＋ active 補助）の内部での取得率の最大/最小比は基準内。

## 8. 原因分解（基準未達がない理由）

- **active 総数 30 / 進化 18** は氷術師と同規模。
- **rarity 分布**（common 8 / uncommon 10 / rare 9 / legendary 3）は氷（9/10/8/3）とほぼ同じ。
- **support 競合**: 火は active 補助が 14 件で、`orbiting_flame` `fire_spirit` `burning_trail` `phoenix_feather` が
  それぞれ 2 進化から要求される。枠を 1 つ余分に使うぶん条件形成は遅いが、枠が広がるほど有利になる。
- **slot 圧迫**: active 枠充足率は 6 枠で 100%、満枠ドラフト率は 3.6%。枠 4 でのみ「候補なし」が 14〜15% 発生する。
- **upgrade 提示**: 1 ドラフトあたり強化 1.71 / 新規 1.24。Lv8 到達が進みやすい。
- **synergy**: 1 ドラフトあたり 1.84 候補へ倍率が乗り、`evolutionPartnerWeightMultiplier` 1.35 が補助の提示を支える。
- **pity**: 進展なしが 4 ドラフト続くと重みが最大 1.5 倍まで加算される（79.2% のドラフトが該当）。
- **戦略**: 進化を狙う戦略（`evolution-first` / `one-build-focus`）で基準を満たし、
  狙わない戦略（`random-valid` / `new-skill-priority`）では低くなる — 意図した設計。
