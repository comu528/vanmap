# 戦士の進化導線補助（guidance・Milestone 8-C.1）

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
