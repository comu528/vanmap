# 実ブラウザ長時間プレイテスト 実測結果（Milestone 9-A.2）

計画は `./browser-longrun-playtest.md`、判定は `./final-balance-verdict.md`、
人間評価の残件は `./human-playtest-gate.md`。
機械可読な要約は `../tests/browser-results/m9a2-results.json`（CI が schema と合格条件を検証する）。

> **この文書が主張する範囲**: 実ブラウザ（Chromium + 静的配信）で自動操作した結果、
> **壊れていない・数値が期待どおり・構造が揃っている**こと。
> **面白さ・爽快感・難易度の妥当性は判定していない。**

---

## 1. 実行環境

| 項目 | 値 |
|------|-----|
| ブラウザ | Chromium 1194（Playwright 1.56.1・実行環境の既存物・**リポジトリ非依存**） |
| レンダラ | swiftshader（software GL）。GPU は使っていない |
| viewport | 1024×768 |
| 配信 | `http-server` でリポジトリ直下を静的配信 |
| URL | `http://127.0.0.1:8123/index.html?debug=1` |
| Phaser | **3.90.0**（CDN 固定 URL を要求。網が CDN へ届かないため同一版 dist を同 URL への応答として差し替え・`index.html` 無変更） |
| GitHub Pages 本番 URL | **未確認**（到達できないためローカル静的配信を Pages 相当として使用） |

## 2. 共通条件（全 run 同一）

difficulty 1 / 恒久強化なし / 熟練度・転生なし / Job Lv 1 / **2 倍速** / オート移動あり
（手入力 run のみ無効）/ 品質 high（品質比較 run を除く）/ **debugRun**（通常統計と分離）/
各 run は使い捨ての browser context（独立した localStorage）。

**計測は直列実行**。software GL で 3 並列にすると 27〜35fps まで落ち、2 倍速の論理 dt が
60〜75ms へ伸びて被弾量が跳ね上がる（同じ seed / strategy で到達点が 226 秒 → 105 秒まで悪化した）。
直列では **平均 59fps（最低バケット 54fps）** を維持し、論理 dt ≒ 33ms ＝
Node ハーネスの 32ms と同水準になる。

> **重要**: Phaser の `update(time, delta)` の `delta` は**実時間**なので、
> 実ブラウザでは 2 回の run がフレーム単位で一致しない。
> **byte-identical の証明は固定 dt の Node ハーネス**（`../tests/cross-job-quality-full-invariance.mjs`）が担う。
> 実ブラウザで見るのは「上限が同じ」「低品質で gameplay が減らない」「同水準に収まる」こと。

<!-- M9A2:RESULTS:BEGIN -->
（実測表は集計後に埋める）
<!-- M9A2:RESULTS:END -->
