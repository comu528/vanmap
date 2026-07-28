# 氷術師 抽選分析（Milestone 7-E）

`SkillDraftManager` / `SeededRandom` / `poolEligibility.memberAllowedForJob` / 実 rarity 重み / 実 synergy・pity /
実 reroll・banish・skip を **production のまま** 駆動した結果。独自の簡易抽選器は作っていない（`DraftBalanceAnalyzer.simulate`）。
再現: `node tests/frost-draft-balance.mjs`（通常 CI = 200 seed）/ `HEAVY=1 node tests/frost-draft-balance.mjs`（500 seed）。

## シミュレーション条件（M7-E で仮定した値）

| 項目 | 値 | 備考 |
|------|----|------|
| seed | **200**（seed = 1..200・範囲固定） | `HEAVY=1` で 1..500。手動の詳細計測は 500〜2000 seed を想定 |
| level-up 回数 | **60**（補助集計 30 / 90） | 枠上限が効く長さ |
| active 枠 | 4 / 6 / 8 | passive 枠は常に 4 |
| 候補数 | 3（`need`） | `skill-config.json` の既定 |
| reroll / banish / skip | 各 1 回（実仕様） | 進化相手が候補に無いときだけ使用 |
| rarity 重み | common100 / uncommon55 / rare20 / legendary5 | `skill-config.json` |
| synergy / pity | `skill-config.json` の実値 | partner×1.35 / 強化×1.15 / Lv7→8×1.2 / pity 閾値4・+0.1/段・上限1.5 |
| 戦略 | evolution-first / balanced / random-valid / new-skill-priority / one-build-focus | `DraftBalanceAnalyzer.M7E_POLICIES` |
| 決定論 | Math.random 不使用・同 opts/seeds で完全一致 | テスト §1 で検証 |

## 戦略 × 枠数（200 seed・60 level-up）

| 戦略 | 枠 | 平均進化数 | ≥1 | ≥2 | ≥3 | 0個 | 最大 |
|------|----|-----------|----|----|----|-----|------|
| evolution-first | 4 | 3.31 | 100.0% | 99.0% | 86.0% | 0.0% | 4 |
| evolution-first | 6 | 3.58 | 100.0% | 99.5% | 89.5% | 0.0% | 5 |
| evolution-first | 8 | 2.17 | 94.0% | 76.0% | 39.5% | 6.0% | 4 |
| balanced | 4 | 2.42 | 100.0% | 86.5% | 43.5% | 0.0% | 4 |
| balanced | 6 | 3.23 | 100.0% | 97.5% | 82.0% | 0.0% | 5 |
| balanced | 8 | 2.73 | 100.0% | 94.0% | 63.5% | 0.0% | 5 |
| random-valid | 4 | 2.40 | 99.0% | 85.0% | 46.0% | 1.0% | 4 |
| random-valid | 6 | 1.60 | 92.0% | 54.5% | 13.0% | 8.0% | 4 |
| random-valid | 8 | 0.86 | 66.5% | 18.0% | 1.5% | 33.5% | 3 |
| new-skill-priority | 4 | 2.50 | 100.0% | 87.0% | 50.0% | 0.0% | 4 |
| new-skill-priority | 6 | 1.93 | 95.5% | 68.5% | 26.5% | 4.5% | 4 |
| new-skill-priority | 8 | 0.98 | 72.5% | 23.5% | 2.0% | 27.5% | 3 |
| one-build-focus | 4 | 3.31 | 100.0% | 98.5% | 86.0% | 0.0% | 4 |
| one-build-focus | 6 | 3.67 | 100.0% | 100.0% | 93.0% | 0.0% | 5 |
| one-build-focus | 8 | 2.36 | 99.0% | 83.5% | 44.0% | 1.0% | 4 |

### 警告基準との比較（evolution-first・§7）

| 枠 | 基準 | 実測 | 判定 |
|----|------|------|------|
| 4 | ≥1 が 80% 以上 / 平均 1.0 以上 / 0個 20% 以下 | 100% / 3.31 / 0% | 達成 |
| 6 | ≥1 が 95% 以上 / ≥2 が 60% 以上 / 平均 1.7 以上 | 100% / 99.5% / 3.58 | 達成 |
| 8 | ≥1 が 95% 以上 / ≥2 が 65% 以上 / 平均 1.8 以上 | **94.0%** / 76.0% / 2.17 | **≥1 のみ 1.0pt 未達（警告）** |

**slot8 の ≥1 が 94.0%（基準 95%）になる要因の分解**

1. **枠が広いほど level-up が分散する（希釈）**: 8枠だと 60 回の level-up が 8 本の active に配られ、
   進化条件である「base を Lv8 まで上げる」に届かない周回が出る。base Lv8 到達率は slot6 の方が高い。
2. **進化は base を置換するだけで枠を増やさない**ため、枠が広いことは進化数の上限を上げない（天井は枠数ではなく Lv8 到達数）。
3. **rarity ではない**: 提示率は帯内で偏っておらず（下表）、legendary も提示されている。
4. **pool 混入・不正候補ではない**: 全戦略・全枠で `otherJobCandidates / invalidCandidates / duplicateCandidates /
   illegalEvolutionPicks / slotViolationPicks / reofferedEvolvedBase` はすべて 0。
5. **synergy / pity は機能している**: partner 補正が 1 ドラフトあたり平均 2.19 候補へ適用され、pity 条件へ入るドラフトは 71.0%。
6. **戦略の性質**: `one-build-focus`（1本に集中）は同じ slot8 で 99.0% を出しており、**枠が広いときは軸を絞る方が有利**という設計上の帰結。

→ 対応: **数値の変更はしない**（火の魔女も同じ希釈特性を持つ。均一化は §30 の「単なる均一化はしない」に反する）。
docs へ理由を記録し、次 Milestone 以降の判断材料とする。

## active / passive の提示率・取得率

- **提示 0 の active: なし**（30/30 が提示される）。**取得 0 の active: なし**（全戦略の合算で全 30 種が取得される）。
- **提示 0 / 取得 0 の passive: なし**。
- **rarity 帯内の偏り: なし**（同帯中央値の 3 倍超・1/3 未満はいずれも 0 件）。

| rarity | 種類数 | 提示率 中央値 | 最小 | 最大 |
|--------|--------|---------------|------|------|
| common | 9 | 0.0965 | `frost_shard` 0.0759 | `icebreaker_wave` 0.1876 |
| uncommon | 10 | 0.0578 | `glacial_lance` 0.0471 | `permafrost_field` 0.0829 |
| rare | 8 | 0.0176 | `absolute_ice_seal` 0.0142 | `ice_prison` 0.0277 |
| legendary | 3 | 0.0029 | `aurora_veil` 0.0024 | `frozen_clock` 0.0055 |

（balanced・slot6・200 seed。値は「1 ドラフトあたりの提示率」）

- rarity 提示率（ドラフト単位）: common 92.4% / uncommon 82.1% / rare 11.0% / legendary 1.06%。
  legendary は common の 1/87 で、**事実上出ない**わけではない（200 seed で提示・取得とも発生する）。

### passive 4 種

| passive | 取得回数/周回 | Lv4 到達率 |
|---------|---------------|-----------|
| `frost_amplification` | 3.74 | 82% |
| `frozen_expansion` | 3.42 | 77% |
| `rapid_freezing` | 3.11 | 69% |
| `lingering_cold` | 2.28 | 46% |

最大/最小比 1.64（基準 3.0 以内）。`lingering_cold` が最も低いのは要求する進化が 3 種（他は 4 種）で、
evolution-first が優先する頻度が低いため。**必須化・死に passive のどちらでもない**。

## ドラフト操作の実測

| 指標 | 実測（evolution-first・slot6） |
|------|------------------------------|
| reroll 使用 | 1.00 回/周回（基礎1回を使い切る） |
| banish 使用 | 1.00 回/周回 |
| skip 使用 | 0.00 回/周回（候補が出るため使われない） |
| pity 条件に入るドラフト | 71.0% |
| synergy 倍率が乗る候補 | 2.19 件/ドラフト |
| 候補内訳 | 強化 1.89 / 新規 1.05 / 進化 0.066 件（1ドラフトあたり） |
| 満枠ドラフト率 | 7.2% |
| 候補なしドラフト | slot8 で 0%・枠が狭いほど増える（満枠かつ全最大Lv の終盤のみ） |
| active 枠充足率 | 100% |
| passive 枠充足率 | 80.4% |

## 必ず 0 だった健全性カウンタ（全戦略 × 全枠）

`otherJobCandidates` / `invalidCandidates`（pool 外・unknown・slot 違反・成立していない進化の提示）/
`duplicateCandidates` / `illegalEvolutionPicks` / `slotViolationPicks` / `reofferedEvolvedBase` — **すべて 0**。
