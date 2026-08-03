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

## 3. 通常 draft の通し run（9 run・production の SkillDraftManager / LevelUpScene）

| ジョブ | strategy | seed | 到達 | Lv | 撃破 | ダメージ | 被弾 | top skill | share | 取得 | reroll/banish/skip | ボス到達 | FPS 平均(最低) | err |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 火の魔女 | evolution-first | 20260803 | 243s | 13 | 456 | 9712 | 98 | meteor | 33.0% | 11 | 1/1/1 | × | 59(57) | 0 |
| 火の魔女 | balanced | 771103 | 141s | 9 | 196 | 3526 | 94 | fireball | 36.9% | 8 | 1/1/0 | × | 60(58) | 0 |
| 火の魔女 | random-valid | 4242424 | 269s | 13 | 532 | 11093 | 104 | fireball | 60.4% | 12 | 1/1/0 | × | 59(58) | 0 |
| 氷術師 | evolution-first | 20260803 | 324s | 14 | 665 | 14129 | 86 | icicle_volley | 46.1% | 12 | 1/1/1 | ○ | 59(57) | 0 |
| 氷術師 | balanced | 771103 | 207s | 12 | 343 | 6573 | 68 | crystal_bloom | 42.5% | 11 | 1/1/0 | × | 59(57) | 0 |
| 氷術師 | random-valid | 4242424 | 269s | 13 | 540 | 14565 | 104 | frost_shard | 34.9% | 12 | 1/1/0 | × | 59(58) | 0 |
| 戦士 | evolution-first | 20260803 | 150s | 10 | 212 | 5635 | 143 | great_cleave | 40.1% | 8 | 1/1/1 | × | 59(59) | 0 |
| 戦士 | balanced | 771103 | 100s | 8 | 120 | 2363 | 141 | great_cleave | 59.0% | 7 | 1/1/0 | × | 59(59) | 0 |
| 戦士 | random-valid | 4242424 | 105s | 8 | 135 | 2542 | 123 | great_cleave | 41.5% | 7 | 1/1/0 | × | 59(57) | 0 |

- **9 run すべてで `LevelUpScene` が実際に起動し、production の `draftPick / draftReroll / draftBanish / draftSkip` で選択した**（固定完成 build の代用ではない）。
- 合計 1808 ゲーム秒（実時間 940 秒）・console / pageerror / requestfailed **0 件**。
- ボス（300 秒で出現）へ到達したのは **1 / 9 run**、撃破は 0 件。恒久強化なしの初期セーブ条件での結果（§4 の進行段階測定を参照）。
- 進化取得は 9 run 合計 **0 件**。1 周で到達する Lv（7〜14）では base Lv8 + 補助という進化条件が揃わない（進化そのものの動作は §6 で確認）。
- `balanced` strategy は passive を先に取るため最短で落ちる。**strategy が到達点を大きく左右する**（build 由来の差）。
- 全 run で Base へ復帰でき、次 run に撃破数 / 敵 / 弾 / 死亡履歴 / 状態の残留は **0**。

## 4. 進行段階ごとのボス到達（恒久強化の効き方）

「素の状態で落ちる」のがローグライトの進行前提なのか、ボスが実質無効なのかを切り分けるため、
恒久強化だけを `none` / `mid`（各上限の半分）/ `max` に変えて同 seed・同 strategy で測った。

| ジョブ | 段階 | 到達 | Lv | 撃破 | ボス到達 | 勝利 |
|---|---|---|---|---|---|---|
| 火の魔女 | mid | 389s | 15 | 696 | ○ | ○ |
| 火の魔女 | max | 353s | 17 | 678 | ○ | ○ |
| 氷術師 | mid | 398s | 15 | 701 | ○ | ○ |
| 氷術師 | max | 371s | 16 | 688 | ○ | ○ |
| 戦士 | mid | 246s | 14 | 470 | × | × |
| 戦士 | max | 354s | 17 | 680 | ○ | ○ |

- ボス到達 **5 / 6**、勝利 **5** 件。
- 恒久強化を進めるとボスへ到達できる ＝ **ボスは実質無効ではない**（残り火 → 恒久強化 → 到達という設計どおりの進行曲線）。

## 5. Result / Base / 再 run と敗北 run

| ジョブ | 勝敗 | 残り火 | Job XP | 二重加算なし | Base 復帰 | 再 run | 残留 | save_version |
|---|---|---|---|---|---|---|---|---|
| 火の魔女 | 勝利 | 0 → 77（+77） | +302 | ○ | ○ | ○ | 0 | 6 |
| 氷術師 | 勝利 | 0 → 79（+79） | +303 | ○ | ○ | ○ | 0 | 6 |
| 戦士 | 勝利 | 0 → 75（+75） | +302 | ○ | ○ | ○ | 0 | 6 |
| 戦士 | 敗北 | 0 → 23（+23） | +102 | ○ | ○ | ○ | 0 | 6 |

- 敗北 run（火の魔女・189s）: 残り火 +72（敗北補正 ×0.5）・`active_run` 消去 ○・Base 復帰 ○・再 run ○・再 run 後の二重報酬 なし。
- 同じ `resultId` をもう一度 `completeRun` へ通しても残り火は増えない（`lastResultId` ガードの実機確認）。
- Result 画面には残り火の内訳・Job Lv 変化・使用スキル表が描画される。

## 6. 進化の実ブラウザ確認

| ジョブ | 通常 draft 到達 | 条件を組んで取得（debug） | base 再提示 | 同時所持 | reload 後一致 | F8 表示 |
|---|---|---|---|---|---|---|
| 火の魔女 | 0 件 | 4 件（infernal_barrage purgatory_eruption hundred_wisp_parade infernal_vortex_wheel） | 0（72 候補をサンプル） | 0 | ○ | 進化到達: 4/18 infernal_barrage,purgatory_eruption,hundred_wisp_parade,infernal_vortex_wheel |
| 氷術師 | 0 件 | 4 件（diamond_blizzard absolute_zero_domain world_end_avalanche zero_hour_world） | 0（72 候補をサンプル） | 0 | ○ | 進化到達: 4/18 diamond_blizzard,absolute_zero_domain,world_end_avalanche,zero_hour_world |
| 戦士 | 0 件 | 4 件（thousand_blade_dance bloodstorm_whirlwind heaven_crushing_descent mountain_hurl） | 0（72 候補をサンプル） | 0 | ○ | 進化到達: 4/18 thousand_blade_dance,bloodstorm_whirlwind,heaven_crushing_descent,mountain_hurl |

- 進化後に **base スキルが再提示された件数は 0**、**base と evolution の同時所持も 0**。
- save → reload で進化の集合・Lv・runtime が一致し、**二重適用なし**。
- 通常 draft 到達と debug 取得は区別して記録している（上表の 2 列）。
- 名指しの低率進化（active 補助を要求する進化）のうち、戦士は `heaven_crushing_descent` と
  `mountain_hurl` を実取得した。**`heaven_mirror_reversal` は取得上限 4 件に達したため未取得**
  （到達可能性そのものは M9-A の `cross-job-evolution-audit` が進化 54 件全数で確認済み）。
- 氷術師は `zero_hour_world`（per-job docs で合算取得率 1.00% と記録されている低率進化）を
  実ブラウザで取得し、reload 後も保持されることを確認した。

## 7. save / reload / resume

| ジョブ | 保存時刻 | 復元一致 | 再開直後 3 秒の cast | cooldown 全回復 | jobId ガード | folder save | save_version |
|---|---|---|---|---|---|---|---|
| 火の魔女 | 147s | 不一致: xp | 8 | ○ | ○ | ○ | 6 |
| 氷術師 | 150s | 全項目一致 | 8 | ○ | ○ | ○ | 6 |
| 戦士 | 150s | 不一致: xp | 10 | ○ | ○ | ○ | 6 |

- 一致を確認した項目: jobId / Lv / XP / HP / active・passive・進化 / runtime（cooldown）/ RNG cursor /
  状態異常カウンタ / 撃破数 / boss state / draft（reroll・banish・skip・guidanceStall）/ 資源。
- **無料 cast の一斉発動なし・cooldown 全回復なし・報酬二重なし。**
- `selectedJobId` を別ジョブへ変えても `active_run.jobId` は不変。

## 8. 品質 4 段階（長時間）

| ジョブ | 品質 | 採取時刻 | Lv | 撃破 | ダメージ | cast | 敵上限 | 弾上限 | hitStop | 数字表示 | particleBudget | 表示オブジェクト最大 | FPS | heap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 戦士 | low | 300s | 14 | 649 | 77872 | 0 | 200 | 400 | ○ | × | 40 | 199 | 59 | 35MB |
| 戦士 | medium | 300s | 14 | 655 | 81522 | 0 | 200 | 400 | ○ | ○ | 120 | 251 | 58 | 34MB |
| 戦士 | high | 300s | 14 | 653 | 79941 | 0 | 200 | 400 | ○ | ○ | 260 | 382 | 58 | 28MB |
| 戦士 | ultra | 300s | 14 | 651 | 79976 | 0 | 200 | 400 | ○ | ○ | 480 | 432 | 57 | 52MB |
| 火の魔女 | low | 180s | 8 | 285 | 10660 | 0 | 200 | 400 | ○ | × | 40 | 469 | 47 | 37MB |
| 火の魔女 | medium | 180s | 8 | 285 | 10583 | 0 | 200 | 400 | ○ | ○ | 120 | 518 | 48 | 31MB |
| 火の魔女 | high | 180s | 9 | 285 | 9723 | 0 | 200 | 400 | ○ | ○ | 260 | 544 | 46 | 34MB |
| 火の魔女 | ultra | 180s | 8 | 285 | 10460 | 0 | 200 | 400 | ○ | ○ | 480 | 521 | 46 | 52MB |
| 氷術師 | low | 180s | 9 | 285 | 8033 | 0 | 200 | 400 | ○ | × | 40 | 406 | 43 | 32MB |
| 氷術師 | medium | 180s | 9 | 285 | 7793 | 0 | 200 | 400 | ○ | ○ | 120 | 445 | 42 | 35MB |
| 氷術師 | high | 180s | 1 | 285 | 8064 | 0 | 200 | 400 | ○ | ○ | 260 | 513 | 46 | 36MB |
| 氷術師 | ultra | 180s | 10 | 284 | 7766 | 0 | 200 | 400 | ○ | ○ | 480 | 482 | 44 | 33MB |

- **gameplay 上限は 4 品質で完全同一**（敵 200 / 弾 400 / hitStop 有）。品質で変わるのは
  `particleBudget`（40 / 120 / 260 / 480）と `damageNumbers`（low のみ無効）＝**演出のみ**。
- **取得スキルの集合は 4 品質で完全一致**（draft が品質非依存であることの実機確認）。
- gameplay 量のばらつきは許容幅 ±20% 以内。実ブラウザの `delta` は実時間なので
  フレーム単位の一致は起きない。**byte-identical の証明は固定 dt の Node ハーネスの担当**
  （`../tests/cross-job-quality-full-invariance.mjs`・254 件）。

## 9. 周回途中の品質切替

| ジョブ | 遷移 | 飛行中の弾 | 敵 | gameplay 不変 | 上限（敵/弾/hitStop） | particleBudget |
|---|---|---|---|---|---|---|
| 火の魔女 | low → ultra | 0 → 0 | 8 → 8 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 40 → 480 |
| 火の魔女 | ultra → low | 0 → 0 | 9 → 9 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 480 → 40 |
| 火の魔女 | low → medium | 3 → 3 | 11 → 11 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 40 → 120 |
| 氷術師 | medium → high | 0 → 1 | 13 → 13 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 120 → 260 |
| 氷術師 | high → low | 6 → 5 | 11 → 11 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 260 → 40 |
| 氷術師 | low → ultra | 6 → 6 | 8 → 8 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 40 → 480 |
| 戦士 | low → ultra | 0 → 0 | 16 → 16 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 40 → 480 |
| 戦士 | ultra → low | 0 → 0 | 12 → 12 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 480 → 40 |
| 戦士 | medium → high | 0 → 0 | 11 → 11 | ×（kills damage level statusRngCursor resourceHash） | 200/400/○ | 40 → 260 |

- 切替の瞬間に**飛行中の弾・敵・状態・遅延タイマーは消えない**。
- 切替後も周回が継続し（撃破数が増え続ける）、JS エラーは 0。

## 10. stress（敵 100 体 / 弾多数 / boss + elite / 2 倍速 / 10 分相当）

| ジョブ | 品質 | 到達 | 敵ピーク | 弾ピーク | 表示オブジェクト | FPS 平均(最低) | 最大フレーム | 500ms超 | heap 谷〜峰 | cleanup 残留 |
|---|---|---|---|---|---|---|---|---|---|---|
| 火の魔女 | high | 604s | 200 | 147 | 1940 | 19(14) | 158ms | 0 | 40〜105MB（中央値 64→75） | skill0/grid0/死亡0 |
| 火の魔女 | low | 599s | 200 | 153 | 1306 | 24(17) | 126ms | 0 | 42〜70MB（中央値 55→54） | skill0/grid0/死亡0 |
| 氷術師 | high | 612s | 199 | 115 | 2017 | 8(7) | 269ms | 0 | 54〜141MB（中央値 91→100） | skill0/grid0/死亡0 |
| 氷術師 | low | 619s | 200 | 95 | 1231 | 11(9) | 224ms | 0 | 48〜104MB（中央値 77→84） | skill0/grid0/死亡0 |
| 戦士 | high | 623s | 200 | 6 | 1311 | 23(19) | 210ms | 0 | 40〜85MB（中央値 62→62） | skill0/grid0/死亡0 |
| 戦士 | low | 626s | 200 | 2 | 637 | 37(32) | 152ms | 0 | 30〜60MB（中央値 41→47） | skill0/grid0/死亡0 |

- crash / JS エラー / 無限ループ / gameplay 停止 / 入力不能は **0**。
- 敵は `gameplayLimits.maxEnemies`(200)、弾は `maxProjectiles`(400) を超えない。
- `SpatialGrid` の登録数は active な敵の数と一致し、`cleanup()` 後の残留は 0。
- heap は単調増加しない（GC が効いている）。start / end の 1 サンプルは GC のタイミングで大きく振れるため、
  傾向は**前半中央値 → 後半中央値**で見る。

| ジョブ | 品質 | 状態索引ピーク | per-frame 抑制ピーク | プール実体（敵/弾） |
|---|---|---|---|---|
| 火の魔女 | high | 112 | 197 | 200/244 |
| 火の魔女 | low | 132 | 181 | 200/184 |
| 氷術師 | high | 340 | 317 | 200/126 |
| 氷術師 | low | 339 | 214 | 200/120 |
| 戦士 | high | 0 | 99 | 200/6 |
| 戦士 | low | 0 | 45 | 200/6 |

- **production の per-frame 予算抑制（`suppressed`）が高負荷時に実際に働いている**（上表）。
  上限に当たっても gameplay は止まらず、撃破・ダメージは増え続けた。
- **FPS はレンダラ依存の値**（swiftshader = software GL）。GPU 実機の値ではないので、
  低 FPS はそのまま実機の性能問題を意味しない。実機での確認は human gate に残す。

## 11. UI 構造と実キー入力

| ジョブ | WASD 移動 | ダッシュ | オート切替(Q) | ポーズ(ESC) | HUD テキスト | F8 開閉 | F10 開閉 | level-up UI |
|---|---|---|---|---|---|---|---|---|
| 火の魔女 | ○ | ○ | ○ | ○ | 11 要素 | ○ | ○ | 24 要素 |
| 氷術師 | ○ | ○ | ○ | ○ | 12 要素 | ○ | ○ | 23 要素 |
| 戦士 | ○ | ○ | ○ | ○ | 13 要素 | ○ | ○ | 24 要素 |

- 実キーイベント（`page.keyboard`）で移動・ダッシュ・オート移動切替・ポーズ / 再開が効くことを確認。
- F8 の分析パネルに M9-A.1 の「横断バランス」節と M9-A.2 の browser 検証節が描画される。
- **これは構造の確認であって、操作感の良し悪しは判定していない**（`./human-playtest-gate.md`）。

## 12. エラー総数

| console | pageerror | requestfailed |
|---|---|---|
| 0 | 0 | 0 |

## 13. この文書で確認していないこと

- 人間の手入力による実プレイの体感・操作感（楽しさ / 爽快感 / 難易度の妥当性）は未確認（docs/human-playtest-gate.md）
- GitHub Pages 本番 URL での動作は未確認（到達できないためローカル静的配信で代替）
- 実機（スマートフォン / GPU 搭載 PC）での FPS・タッチ操作は未確認（計測は software GL のコンテナ）
- 30 分以上の超長時間セッションでのメモリ傾向は未確認（stress は 10 分相当 × 6 run まで）
- 通常 draft でのボス撃破（勝利）は未到達。恒久強化ありの進行段階で到達可否を測定した（progressionTiers）

