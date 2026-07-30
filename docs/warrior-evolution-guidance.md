# 戦士の進化導線補助（guidance・Milestone 8-C.1 / 8-D）

M8-C で戦士の active が 5 → 15 になり、**active 枠 4 の進化到達率が 92.5% → 46.5%** に落ちた。
テストのしきい値を下げるのではなく、production の抽選導線を戦士向けに直した回。

修正前の実測と原因分析は `./warrior-draft-analysis-wave1.md`。

---

## 1. 何を直したか（1 行で）

**「どの進化元を取るか」はレアリティ階層に委ねたまま、「取った進化元を最後まで伸ばす」側だけを助ける。**

M6-F の synergy は「基礎を持っている → その補助を煽る」の一方向しか無かった。
火 / 氷は補助が active 中心で基礎 Lv8 が早く埋まるので露見しなかったが、
戦士は補助が passive 中心（早期に最大化される）で、**詰まるのは基礎 active の Lv8 側**だった。

---

## 2. どこに置いたか

| 場所 | 役割 |
|------|------|
| `data/skill-config.json` の `guidance` | 補正値・対象ジョブ・pity のしきい値（**data 駆動**） |
| `SkillDraftManager._guidanceMult()` | 重み倍率の計算（**skill ID のハードコードなし**） |
| `SkillDraftManager.guidanceStall` ほか | pity のカウンタと集計 |
| `BattleScene.buildDraftCtx()` | `jobId` と `evolutionRecipes`（data 由来）を渡すだけ |
| `BattleScene.applyCandidate()` | 候補に付いた guidance タグで pity をリセット |

補正の対象は **`ctx.evolutionRecipes`（= `SkillCatalog.evolutionRecipes()` の結果）からのみ導出**する。
特定のスキル名・進化名を実装に書かない。data で進化を足せばそのまま補正対象になる。

---

## 3. data（`skill-config.json` の `guidance`）

```jsonc
"guidance": {
  "enabled": true,
  "jobs": ["warrior"],                       // このジョブの周回でだけ効く
  "minBattleLevel": 3,                       // 序盤の候補は歪めない
  "maxMultiplier": 6,                        // 合成上限（すべて掛けても超えない）

  "readyBaseAcquireWeightMultiplier": 1.3,   // 補助が「すでに揃っている」進化元の新規取得
  "ownedBaseUpgradeWeightMultiplier": 1.8,   // 所持している進化元の強化
  "nearMaxRemainingLevels": 3,               // 「最大 Lv に近い」とみなす残り段数
  "baseNearMaxBonusMultiplier": 1.7,         // 最大 Lv に近い進化元への追加
  "supportReadyBaseMultiplier": 1.5,         // 補助が揃っている進化元への追加

  "requiredSupportWeightMultiplier": 1.3,    // 所持 base の未達補助
  "nearRequiredRemainingLevels": 1,          // 「必要 Lv 手前」とみなす残り段数
  "supportNearRequiredMultiplier": 1.2,      // 必要 Lv 手前の補助への追加
  "activeSupportWeightMultiplier": 1.6,      // 補助が active のレシピへの追加（M8-D）
  "highRequirementSupportLevel": 6,          // 「高い Lv を要求される補助」の境界（M8-E）
  "highRequirementSupportMultiplier": 1.5,   // その補助への追加（M8-E）

  "pity": { "threshold": 3, "bonusPerStep": 0.12, "maxMultiplier": 1.8 }
}
```

- **すべてのキーが実装から参照される**。`validate-data.mjs` が未参照キー（予約フィールド）をエラーにし、
  逆に「実装が読むのに data に無いキー」もエラーにする。
- 倍率はすべて **1 以上**（重みを下げる補正は作らない＝到達不能なスキルを作らない）。
- `jobs` に `flame_witch` / `frost_mage` を入れると `validate-data.mjs` がエラーにする。
- `enabled: false` にすると M8-C までの挙動へ完全に戻る（候補列も重みも一致する）。

---

## 4. 計算の順序

```
実効重み = rarityWeight × rarityWeightMult × skill.weight   （M6-A / M6-C）
          × synergyMult                                     （M6-F）
          × guidanceMult                                    （M8-C.1・ここ）
```

`guidanceMult` は次のように決まる。**役割ごとに最大値だけを採る**ので、
同じスキルが複数のレシピに関わっても倍率が掛け算にならない（重複上限）。

```
baseMult    = max over recipes:
  進化元が未取得        → 補助がすべて揃っていれば readyBaseAcquireWeightMultiplier
  進化元が所持中で未完成 → ownedBaseUpgradeWeightMultiplier
                          × (残り段数 ≤ nearMaxRemainingLevels なら baseNearMaxBonusMultiplier)
                          × (補助がすべて揃っていれば supportReadyBaseMultiplier)

supportMult = max over recipes:
  必要 Lv 未達の補助で、その進化元を所持している
                        → requiredSupportWeightMultiplier
                          × (必要 Lv - 現在 Lv ≤ nearRequiredRemainingLevels なら supportNearRequiredMultiplier)
                          × (補助が active なら activeSupportWeightMultiplier)

guidanceMult = min(baseMult × supportMult × pityBonus, maxMultiplier)
```

**条件がすでに成立しているレシピは対象外**（進化候補として最優先枠に出るので、煽る必要がない）。

### 具体例（進化元 = `counter_stance`・maxLevel 8）

| 状況 | 倍率 |
|------|------|
| Lv1 → Lv2（補助未達）| ×1.80 |
| Lv7 → Lv8（補助未達）| ×3.06（1.8 × 1.7）|
| Lv7 → Lv8（補助が揃っている）| ×4.59（1.8 × 1.7 × 1.5）|
| 上に pity 最大が乗る | ×6.00（`maxMultiplier` で頭打ち）|

---

## 5. pity

既存の pity（`draftsSinceProgress`）は**進化成立でしかリセットされない**ため、
「基礎 Lv8 まで伸びない」という戦士の詰まりを救えなかった。そこで別カウンタを 1 つ足した。

| 項目 | 内容 |
|------|------|
| カウンタ | `guidanceStall`（guidance が有効なジョブの `open()` でだけ +1） |
| リセット | 進化元の取得 / 強化・必要補助の取得 / 強化・進化取得 |
| 効き方 | `stall > threshold` の超過段数ぶん `1 + bonusPerStep × step`（`pity.maxMultiplier` で頭打ち） |
| 適用先 | すでに guidance 補正が乗っている候補のみ（無関係な候補は強くならない） |
| 保存 | `active_run` の draft 状態へ**加算的に**保存する（`save_version` は v6 のまま） |
| 悪用防止 | 保存するので、**save → reload で pity をリセットして稼ぐことはできない** |
| RNG | 消費を 1 も増やさない（重みだけを変える） |

実測では枠4 / 40 レベルアップで **発動率 13.9%**（毎ドラフト発動していない）。

---

## 6. 他ジョブへの影響（ゼロ）

`guidance.jobs` に載っていないジョブでは `_guidanceActive()` が false を返し、

- 倍率は常に 1
- 候補オブジェクトに `guidanceMult` / `guidance` フィールドが**付かない**
- `guidanceStall` が 1 も進まない（保存値も 0 のまま）
- RNG 消費（cursor）が変わらない

`tests/warrior-draft-guidance-nonregression.mjs` が、
火 / 氷の 300 seed 候補列 SHA-256 と 48 スキルのランタイムトレースが
M8-A 時点と byte-identical であることを確認している。

---

## 7. 結果

### 素朴戦略（M8-B / M8-C と同じ物差し・200 seed）

| 構成 | 前 | 後 | 目標 |
|------|----|----|------|
| 枠4 / 40 lv・進化 1 個以上 | 62.5%（`_generate` 直呼びでは 46.5%）| **89.5%** | 80% 以上 |
| 枠4 / 40 lv・平均 | 0.70 | **1.26** | 1.0 以上 |
| 枠4 / 40 lv・進化 0 個 | 37.5% | **10.5%** | 20% 以下 |
| 枠6 / 60 lv・1 個以上 / 2 個以上 / 平均 | 99.0% / 70.5% / 1.91 | **100.0% / 91.0% / 2.42** | 95% / 60% / 1.7 |
| 枠8 / 80 lv・1 個以上 / 2 個以上 / 平均 | 100.0% / 100.0% / 3.50 | **100.0% / 100.0% / 3.92** | 95% / 65% / 1.8 |

### 過剰誘導していないこと

| 指標 | 前 | 後 |
|------|----|----|
| 最頻進化のシェア（枠4 / 6 / 8）| 34.8% / 27.5% / 20.4% | **30.4% / 25.6% / 20.1%** |
| build の種類（枠4 / 6 / 8）| 61.9% / 80.7% / 76.3% | **66.5% / 83.6% / 80.8%** |
| 新規取得率が同 rarity 中央値の 3 倍超 | 0 件 | **0 件** |
| 進化を持たない active の取得（枠4）| — | **+3.9%**（減っていない）|

**guidance はどの指標でも集中を悪化させていない。**

---

## 8. やっていないこと

- 進化候補の強制挿入 / 条件未成立での進化提示
- レベルアップ候補を進化 1 択へ固定
- 特定 skill ID のハードコード / 特定進化の優遇
- global な rarity / synergy の変更
- 火 / 氷への影響
- RNG 呼び出し回数の増加 / 候補生成後の後付け差し替え
- スキル数値（damage / cooldown）・闘気 / コンボ / 回復 / 体勢の変更
- active 枠数の変更 / `save_version` の更新

不採用にした案とその理由は `./warrior-draft-analysis-wave1.md` の §7。

---

## 9. Milestone 8-D（active 25 種）での追調整

active が 15 → 25、進化が 8 → 13 になると、1 回のドラフトで特定の組み合わせを引く確率が薄まる。
**しきい値は 1 つも下げず**、data の guidance へキーを 1 つ足すだけで吸収した。

| 追加キー | 値 | 何のため |
|---------|----|---------|
| `activeSupportWeightMultiplier` | 1.6 | **補助が active** のレシピの補助側へ追加補正 |

理由: passive 補助は最大 Lv が低く（4）、枠も active とは別なので早期に埋まる。
一方 **active 補助は active 枠を 1 つ食い、必要 Lv も高い**（`ground_slam` Lv6）。
カタログが増えるほど不利になるのはこちらだけなので、そこだけを補正する。
判定は**候補のカテゴリ（`m.category === 'active'`）だけ**を見る。特定の skill ID は実装に書かない。

### 効果（200 seed・5 方針）

| 指標 | 追加前 | 追加後 |
|------|--------|--------|
| `heaven_crushing_descent` 取得（枠4 / 6 / 8）| 6 / 62 / 134 | **13 / 90 / 192** |
| `mountain_hurl` 取得（枠4 / 6 / 8）| 2 / 22 / 43 | **7 / 20 / 63** |
| 最頻進化のシェア（枠4 / 6 / 8）| 19.6% / 16.8% / 14.4% | **19.3% / 16.8% / 14.2%** |
| 素朴戦略 枠4 / 40lv・進化 1 個以上 | 85.0% | **85.0%** |

集中は悪化せず（最頻シェアはむしろ微減）、active 補助の 2 進化だけが持ち上がっている。
1.9 / 2.2 も測ったが、`mountain_hurl` はほぼ伸びない一方で素朴戦略の枠4 到達率が
85.0% → 83.5% / 84.0% と落ちたため、**1.6 を採用**した。

### M8-D 時点の到達率（しきい値はすべて M8-C.1 のまま）

| 構成 | 実測 | 目標 |
|------|------|------|
| 枠4 / 40 lv・進化 1 個以上 / 平均 / 0 個 | 85.0% / 1.17 / 15.0% | 80% 以上 / 1.0 以上 / 20% 以下 |
| 枠6 / 60 lv・1 個以上 / 2 個以上 / 平均 | 99.0% / 88.0% / 2.38 | 95% / 60% / 1.7 |
| 枠8 / 80 lv・1 個以上 / 2 個以上 / 平均 | 100.0% / 98.5% / 3.46 | 95% / 65% / 1.8 |

13 進化すべてが取得 > 0、25 active すべてが提示・取得 > 0、
候補ゼロ / 混入 / 重複 / 枠違反はいずれも 0 件。


---

## 10. M8-E（最終Wave・active30 / evolution18）での追調整

active が 25 → 30、進化が 13 → 18 に増えると 1 枠あたりの当たりがさらに薄まる。
**M8-C.1 のしきい値は 1 つも下げず**、次の 3 つで吸収した。

### (a) guidance へ data キーを 2 つ追加

```jsonc
"highRequirementSupportLevel": 6,          // 「高い Lv を要求される補助」の境界
"highRequirementSupportMultiplier": 1.5    // その補助への追加倍率
```

`requiredSkills[].level >= highRequirementSupportLevel` の補助にだけ乗る。
**skill ID のハードコードはしていない**（data のレシピからのみ導出する）。
同じ補助が複数レシピに関わっても**役割ごとの max**を採るだけで積み上がらない。

### (b) `heaven_mirror_reversal` の補助要求を Lv4 にした

天鏡返しの補助は **active** の `counter_stance` で、枠を 2 つ使う。
当初 Lv6 で作ったところ、1000 run で取得 **0〜3 件**しか成立しなかった。
(a) を入れても改善しなかったため、必要 Lv を **4** に下げた（data 側の設計判断）。

### (c) `weapon_deflection` の rarity を rare → uncommon にした

同じ理由。基礎 active 自体が出にくいと、そもそも Lv8 まで伸ばせない。

### 効果（1000 run・active 補助の進化を個別集計）

| 進化 | 補助 | 枠4 | 枠6 | 枠8 |
|------|------|-----|-----|-----|
| `heaven_crushing_descent` | `ground_slam` Lv6 | 6 | 47 | 90 |
| `mountain_hurl` | `ground_slam` Lv6 | 2 | 11 | 40 |
| `heaven_mirror_reversal` | `counter_stance` Lv4 | **36** | **68** | **100** |

`heaven_crushing_descent` は M8-D の 7 → **47**（枠6）へ改善している。
`mountain_hurl` は依然として最も低いが、**到達不能ではない**（設計どおり枠を 2 つ使う代償）。

### M8-E 時点の到達率（しきい値はすべて M8-C.1 のまま）

| 構成 | 実測 | 目標 |
|------|------|------|
| 枠4 / 40 lv・進化 1 個以上 / 平均 / 0 個 | **89.5% / 1.28 / 10.5%** | 80% 以上 / 1.0 以上 / 20% 以下 |
| 枠6 / 60 lv・1 個以上 / 2 個以上 / 平均 | **99.0% / 94.5% / 2.65** | 95% / 60% / 1.7 |
| 枠8 / 80 lv・1 個以上 / 2 個以上 / 平均 | **100.0% / 99.5% / 3.92** | 95% / 65% / 1.8 |

18 進化すべてが取得 > 0、30 active すべてが提示・取得 > 0、passive 4 すべてが取得 > 0、
候補ゼロ / 混入 / 重複 / 枠違反はいずれも 0 件。
最頻進化シェアは **16.2% / 13.8% / 11.7%**（枠4 / 6 / 8）で M8-D の 19.3% から改善、
build の種類も **89.8% / 97.2% / 99.3%** と悪化していない。

### 不変条件のトレードオフ（記録）

M8-C.1 で置いた「補助として使う active は自身の進化を持たない」は、
`counter_stance`（自身の進化 `adamant_counter` を持つ）を天鏡返しの補助にしたことで**崩れている**。
天鏡返しは `counter_stance` を**置換しないし CD にも触らない**ので `adamant_counter` への道は塞がれず、
`tests/warrior-active-support-evolution.mjs` がこの点を明示的に検査している。

---

## 11. M8-F（完成監査）での確認 — **guidance は 1 キーも変えていない**

M8-F では `guidance` のキーもしきい値も**1 つも変更していない**。
`validate-data` の M8-F ブロックが **10 個の固定値**を突き合わせるので、
静かに下げると検証が落ちる（「結果に合わせてしきい値を下げる」ことを構造的に禁止している）。

### 到達率（200 seed × 5 戦略 ＋ 素朴戦略・しきい値は M8-C.1 のまま）

| 枠 | 戦略 | 平均 | 0 個 | ≥1 | ≥2 | ≥3 | 目標 |
|----|------|------|------|-----|-----|-----|------|
| 4 | evolution-first | 3.54 | 0.0% | 100% | 99.5% | 94.5% | ≥1 80% / 平均 1.0 / 0 個 ≤20% |
| 4 | balanced | 3.12 | 0.0% | 100% | 97.0% | 78.5% | 〃 |
| 4 | random-valid | 2.19 | 2.0% | 98.0% | 75.5% | 39.0% | 〃 |
| 4 | new-skill-priority | 2.21 | 2.0% | 98.0% | 75.5% | 41.5% | 〃 |
| 4 | one-build-focus | 3.55 | 0.0% | 100% | 100% | 92.5% | 〃 |
| 4 | 素朴（first-candidate） | 2.21 | 1.0% | 99.0% | 80.0% | 34.5% | 〃 |
| 6 | 5 戦略 | 3.37〜5.33 | 0.0% | 100% | 96.5〜100% | 78.5〜100% | ≥1 95% / ≥2 60% / 平均 1.7 |
| 8 | 5 戦略 | 4.51〜7.05 | 0.0% | 100% | 99.5〜100% | 96.5〜100% | ≥1 95% / ≥2 65% / 平均 1.8 |

### guidance が「過剰誘導」になっていないことの確認

| 指標 | 実測 | 判定 |
|------|------|------|
| 最頻進化のシェア（全戦略合算） | **10.7%** | 35% 以下 ✅（M8-E の 16.2 / 13.8 / 11.7% からさらに分散） |
| build の種類（200 run 中） | 枠4 **185〜199** / 枠6 **198〜200** / 枠8 **199〜200** | 均一化していない ✅ |
| 取得 0 の進化 / active / passive | **0 件 / 0 件 / 0 件** | ✅ |
| 進化の取得数の幅（全戦略合算 3000 run） | 最小 **80** / 中央 **814** / 最大 **1408** | 幅が残っている＝build に個性がある ✅ |
| rarity の階層（1 種あたりの初回提示） | common **96.9** > uncommon **67.5** > rare **24.5** | 逆転なし ✅ |

### 条件形成と提示のずれが無い

進化 18 件すべてで **提示 / 条件形成 ≈ 100%**。
つまり「条件が揃ったのに候補へ出ない」詰まりは起きておらず、
低い取得率は**「base を Lv8 まで伸ばせるか」に集約される**。
`guidance` をこれ以上強めても改善しない部分なので、追調整はしていない。

### 低取得率 3 件は構造由来（均一化しない）

| 進化 | base（rarity） | 補助 | 枠4 / 6 / 8 | 低さの理由 |
|------|----------------|------|-------------|-----------|
| `mountain_hurl` | `battlefield_throw`(rare) | **active** `ground_slam` Lv6 | 21 / 25 / 34 | rare な base ＋ **active 補助で枠を 2 つ使う**（二重ハンデ） |
| `heaven_crushing_descent` | `leap_smash`(uncommon) | **active** `ground_slam` Lv6 | 43 / 59 / 94 | active 補助で枠を 2 つ使う |
| `heaven_mirror_reversal` | `weapon_deflection`(uncommon) | **active** `counter_stance` Lv4 | 39 / 71 / 104 | 同上（M8-E で Lv6 → Lv4 へ緩めた結果 0〜3 件 → 200 件超へ改善） |

いずれも **到達不能ではない**（`HEAVY=1` の 500 seed でも取得 > 0）。
`active` 補助の 3 件が passive 補助の 15 件より低いのは**枠負担どおりの構造**で、
均一化すると build の個性が消えるため意図的に残している。

### M8-F で抽選に入れた唯一の変更

`evolvedBaseIds`（進化済みの基礎 active を候補から除外）。
これは**取得率を上げるための調整ではなく、不正な候補を消す修正**で、
`guidance` の重み計算には一切触れていない。
未指定なら空集合として扱われるので、火 / 氷の候補列ハッシュは不変。

```
node tests/warrior-completion-draft.mjs      # 網羅・集中度・飽和の分解
node tests/warrior-completion-low-rate.mjs   # 低取得率 3 件が構造由来であることの確認
node tests/warrior-final-guidance.mjs        # guidance の値が動いていないこと
```
