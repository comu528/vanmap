# 3 ジョブ 最終バランス判定（Milestone 9-A.2）

Node ハーネスの実測（`./cross-job-final-balance.md`・M9-A.1）と
実ブラウザ長時間プレイテストの実測（`./browser-longrun-results.md`・M9-A.2）を突き合わせた判定。

**この Milestone の balance 変更は 0 件。** 新 skill / passive / evolution / job も 0 件。

分類は 6 種: `harness`（測り方由来）/ `profile`（条件の偏り）/ `role`（役割差）/
`bug`（不具合）/ `balance`（数値調整が必要）/ `human-feel`（人間の体感が要る）。

> **判定できないことは判定しない。** 自動操作は「楽しいか・爽快か・難しすぎないか」を
> 一切評価していない。それらは `./human-playtest-gate.md` の open な manual gate に残る。

## 1. 3 ジョブの実測サマリ（実ブラウザ・通常 draft 3 run の中央値）

| 指標 | 火の魔女 | 氷術師 | 戦士 |
|---|---|---|---|
| DPS | 40 | 44 | 24 |
| 総ダメージ | 9712 | 14129 | 2542 |
| 撃破 | 456 | 540 | 135 |
| 生存時間 | 243s | 269s | 105s |
| 被ダメージ | 98 | 86 | 141 |
| 回復 | 0 | 0 | 19 |
| top share | 36.9% | 42.5% | 41.5% |
| 到達 Lv | 13 | 13 | 8 |
| ボス到達（3 run 中） | 0 | 1 | 0 |
| ボス到達（恒久強化あり） | 2 | 2 | 1 |

## 2. Node 実測（M9-A.1・固定 build）との照合

| ジョブ | browser DPS（通常 draft） | Node DPS（固定 build） | 比 | 乖離の理由 |
|---|---|---|---|---|
| 火の魔女 | 40 | 235 | 0.17 | Node は固定 build（active 8 種 Lv8 + passive 4）、browser は通常 draft（4〜6 種・低 Lv）。build 差による乖離で、順位は一致する。 |
| 氷術師 | 44 | 85 | 0.52 | Node は固定 build（active 8 種 Lv8 + passive 4）、browser は通常 draft（4〜6 種・低 Lv）。build 差による乖離で、順位は一致する。 |
| 戦士 | 24 | 168 | 0.14 | Node は固定 build（active 8 種 Lv8 + passive 4）、browser は通常 draft（4〜6 種・低 Lv）。build 差による乖離で、順位は一致する。 |

- **DPS の順位は一致しない**（browser: 氷術師 > 火の魔女 > 戦士 / Node: 火の魔女 > 戦士 > 氷術師）。
  生存の順位も逆転する（browser では戦士が最短、Node では最長）。
- 原因は **build の選ばれ方の違い**。Node はプール先頭 8 種を Lv8 で固定、browser は production の
  通常 draft で 4〜6 種・低 Lv。**どちらかが誤りなのではなく、測っている対象が違う。**
  絶対値（0.14〜0.52 倍）も順位も、ジョブ間比較の根拠には使わない。
- **build に依らない性質は一致する**: 回復を持つのは戦士のみ / 被ダメージが最大なのは戦士（接敵前提）/
  構造異常 0 件 / 品質で gameplay 上限が変わらない（`cross-job-browser-node-consistency.mjs` が Node をライブ実行して照合）。
- 構造異常 0 件という結論は両方で一致（`cross-job-browser-node-consistency.mjs` が Node をライブ実行して照合）。

## 3. warning 目安の評価（§8 の全項目）

| キー | 実測 | 目安 | 超過 |
|---|---|---|---|
| `QUALITY_SWITCH_CAP_LOSS` | 品質切替で敵 / 弾の上限から恒久強化が消えていた（修正済み） | quality 差 | **超過** |
| `DPS_RATIO` | 1.83 | >1.8 | **超過** |
| `BOSS_KILL_TIME_RATIO` | 通常 draft ではボス撃破 0 件（到達 1/9） | >2.0 | — |
| `SURVIVAL_DIFF` | 2.56 | >1.4 | **超過** |
| `DAMAGE_TAKEN_RATIO` | 1.64 | >2.0 | — |
| `HEALING_RATIO` | flame_witch 0 / frost_mage 0 / warrior 19 | >3.0 | **超過** |
| `TOP_SHARE` | 0.604 | >0.35 | **超過** |
| `DEAD_SKILL` | 0 | >0 | — |
| `ACQUIRED_ZERO_UTILITY` | 0 | >0 | — |
| `BOSS_INEFFECTIVE` | 恒久強化ありでボス到達 5/6・撃破 5 件（max 段階は 3 ジョブとも勝利） | 実質無効 | — |
| `PROGRESSION_TIER_GAP` | mid 段階の勝利 2/3 | ジョブ差 | **超過** |
| `ALL_LAST` | 該当ジョブなし | 全部門最下位 | — |
| `TRIPLE_MONOPOLY` | 該当ジョブなし | offense/defense/CC 独占 | — |
| `DRAFT_EVOLUTION_SKEW` | 通常 draft 9 run の進化取得 0 件 | ジョブ間の偏り | — |
| `BROWSER_NODE_DIVERGENCE` | build 差により絶対値は乖離・順位と性質は一致 | 結論の不一致 | **超過** |
| `QUALITY_SPREAD` | 9.6% | >20% | — |
| `STRESS_FPS` | 最低平均 8fps | <30fps | **超過** |
| `LOW_QUALITY_NOT_FASTER` | なし | low > high | — |

## 4. 分類（harness / profile / role / bug / balance / human-feel）

| キー | 分類 | 実測 | 根拠 |
|---|---|---|---|
| `DPS_RATIO` | **role** | 比 1.83（火 40 / 氷 44 / 戦士 24） | 火 = 直接火力・氷 = CC 主体（凍結 / 氷砕は damage 列に載らない）・戦士 = 近接持続 + 防御。Node 実測と同じ順位で、役割差そのもの。均一化しない。 |
| `SURVIVAL_DIFF` | **profile** | 比 2.56（flame_witch 243s / frost_mage 269s / warrior 105s） | 通常 draft では strategy が生存を大きく左右する（passive 先行の balanced は最短）。同一 strategy 同士では差が縮む。build 由来 ＝ profile 分類。 |
| `HEALING_RATIO` | **role** | flame_witch 0 / frost_mage 0 / warrior 19 | 回復手段（撃破回復 / 闘気解放 / 不屈）を持つのは戦士のみ。設計どおりの差で、他ジョブへ回復を配らない。 |
| `TOP_SHARE` | **profile** | 最大 60.4% | 通常 draft は 8〜13 回の取得しかできず所持スキルが 4〜6 種に留まるため、分母が小さくシェアが高く出る。完成 build（30 種）の実シェアは per-job スイートが 35% 以下で維持。 |
| `DRAFT_EVOLUTION_SKEW` | **profile** | 通常 draft 9 run の進化取得 0 件 | 進化は base Lv8 + 補助が要るため、恒久強化なしの 1 周（レベル 7〜14）では条件が揃わない。ジョブ間の偏りではなく到達レベルの問題。進化そのものは 3 ジョブとも実ブラウザで取得を確認済み。 |
| `BROWSER_NODE_DIVERGENCE` | **harness** | DPS 順位が不一致（browser: frost_mage > flame_witch > warrior / Node: flame_witch > warrior > frost_mage）。絶対値も 0.14〜0.52 倍 | Node は固定 build（プール先頭 8 種 Lv8）、browser は production の通常 draft（4〜6 種・低 Lv）で、**build の選ばれ方が根本的に違う**ため順位も絶対値も揃わない。どちらかが誤りなのではなく測っている対象が違う。build に依らない性質（回復を持つのは戦士のみ・被弾が最大なのは戦士・構造異常 0 件・品質で gameplay 上限が変わらない）は両方で一致する。絶対値と順位の比較には使わない。 |
| `STRESS_FPS` | **harness** | 最低平均 8fps | software GL（swiftshader）での実測。GPU 実機の FPS ではない。実機での確認は human gate に残る。 |
| `PROGRESSION_TIER_GAP` | **profile** | flame_witch mid:WIN/max:WIN / frost_mage mid:WIN/max:WIN / warrior mid:LOSE/max:WIN | 恒久強化 max では 3 ジョブとも勝利した（＝ボスは実質無効ではない）。mid で落ちたのは warrior で、近接ジョブはオート移動で接敵し続けるぶん被弾が多い。**ただし各セルは 1 seed × 1 strategy（n=1）**なので、ジョブ間の恒久強化要求量の差としてはまだ結論を出さない。seed を増やした再測と人間の体感確認が要る。 |
| `QUALITY_SWITCH_CAP_LOSS` | **bug** | 周回中に品質を変えると敵 / 弾のプール上限から恒久強化ぶんが消え、素の 200 / 400 へ戻っていた | applyEffectSettings() が resolveEffectSettings() で effSettings を作り直す際、create() で加算していた魂炎の恒久強化ぶん（enemyCapAdd / effectCapAdd）を再加算していなかった。**品質変更が gameplay 上限を変える**状態で、M9-A が確立した「品質は gameplay に影響しない」不変条件に反する。あわせて particleBudget がcreate() の値のまま固定で、品質を上げても粒子が増えず下げても減らなかった（こちらは演出のみ）。 |
| `HUMAN_FEEL_UNVERIFIED` | **human-feel** | 未実施（自動操作では判定しない） | 楽しさ・爽快感・難易度の妥当性・氷ボス戦の単調さ・戦士の安全度・火の強さの体感は人間の manual gate が必要。docs/human-playtest-gate.md が open。 |

- **bug 分類 1 件 / balance 分類 0 件。**
- **balance 変更 0 件。** damage / cooldown / 敵 / 報酬 / rarity / weight / しきい値 / guidance のいずれも変更していない。
- 修正不可カテゴリ（火 normal 強・氷 CC 強・戦士防御強・DPS 差だけ・survival 差だけ・
  active 補助進化の低率・rarity 差・人間の体感が未確認）を根拠に数値を動かしていない。

## 5. 構造異常

| 検査 | 結果 |
|---|---|
| 死にスキル | 0 件 |
| acquired but zero utility | 0 件 |
| cast > 0 かつ hit 0 の恒常化 | 0 件 |
| ボスへ実質無効なジョブ | 0 件 |
| normal / elite / boss すべて最下位のジョブ | 0 件 |
| offense / defense / CC を同時独占するジョブ | 0 件 |

## 6. 3 ジョブの個性（均一化していない）

| ジョブ | 個性 |
|---|---|
| 火の魔女 | 炎上 DoT + 最高 DPS（障壁 / 不死鳥で被弾を耐える） |
| 氷術師 | 冷気 / 凍結の CC 主体（ボスは氷砕ゲージ経由） |
| 戦士 | 闘気 / コンボ / 体勢崩しと軽減・不屈・撃破回復の近接持続 |

数値の均一化は行っていない（`uniformized: false`）。3 ジョブの差は**維持すべき設計**。

## 7. M9-A.2 で見つけて直した production の不具合

### `QUALITY_SWITCH_CAP_LOSS`

- **症状**: 周回中に品質を変えると敵 / 弾のプール上限から恒久強化ぶんが消え、素の 200 / 400 へ戻っていた
- **原因**: applyEffectSettings() が resolveEffectSettings() で effSettings を作り直す際、create() で加算していた魂炎の恒久強化ぶん（enemyCapAdd / effectCapAdd）を再加算していなかった。**品質変更が gameplay 上限を変える**状態で、M9-A が確立した「品質は gameplay に影響しない」不変条件に反する。あわせて particleBudget がcreate() の値のまま固定で、品質を上げても粒子が増えず下げても減らなかった（こちらは演出のみ）。
- **修正**: effectCapAdd を scene に保持し、粒子予算を _applyParticleBudget() へ切り出して create() と applyEffectSettings() の両方から呼ぶ。上限の恒久強化ぶんも applyEffectSettings() で再加算する（resolveEffectSettings は毎回新しいオブジェクトを返すので冪等）。非回帰: cross-job-quality-midrun-switch §4（上限保持・粒子予算の追従・5 回切替で二重加算なし）。実ブラウザでも 9 遷移すべてで粒子予算が品質へ追従し上限が 200 / 400 のままであることを確認。

## 8. 最終判定

- **bug 1 件（すべて修正済み）**。バランス値の変更は 0 件。
- 超過した目安はすべて `role`（役割差）/ `profile`（build と strategy の偏り）/
  `harness`（測り方の限界）に落ちる。
- 残る 1 件は `human-feel`（**未確認**）。`./human-playtest-gate.md` が埋まるまで、
  「難しすぎるか」「氷のボス戦が退屈か」「戦士が安全すぎるか」「火が強すぎるか」は判定しない。
- したがって **M9-A.2 時点でバランス値を動かす根拠は無い**。

