# 実ブラウザ長時間プレイテスト計画（Milestone 9-A.2）

M9-A.1 の browser gate は「起動 / 3 ジョブ各 20 秒 / 4 品質の上限一致 / F8 / セーブ往復 / 相対パス」までだった。
M9-A.2 は**通常 draft の通し run・Result / Base / 再 run・save/resume・品質長時間比較・stress**まで広げる。

- 実測結果: `./browser-longrun-results.md`（機械可読な要約は `../tests/browser-results/m9a2-results.json`）
- 最終判定: `./final-balance-verdict.md`
- 人間評価の残件: `./human-playtest-gate.md`
- M9-A.1 の基本ゲート: `./browser-validation-gate.md`

> **原則**: AI の自動操作で確認できるのは「壊れていない・数値が期待どおり」までで、
> **面白さ・爽快感・難易度の妥当性は判定しない**（`./human-playtest-gate.md` の manual gate に残す）。
> 20 秒の確認を「長時間確認済み」と書かない。実行していない項目は未確認と明記する。

---

## 1. 実行環境（必須依存を追加しない）

| 項目 | 値 |
|------|-----|
| ブラウザ | 実行環境に既にある Chromium（Playwright 同梱・**リポジトリへは入れない**） |
| 配信 | `npx http-server -p 8123 -c-1`（または `python3 -m http.server`）でリポジトリ直下を静的配信 |
| URL | `http://127.0.0.1:8123/index.html?debug=1` |
| viewport | 1024×768 |
| Phaser | CDN 固定 URL `phaser@3.90.0`。網が CDN へ届かない場合のみ**同一版**の dist を同 URL への応答として差し替える（`index.html` は無変更） |
| GitHub Pages | 本番 URL へ到達できない環境では localhost 静的配信を Pages 相当として使い、**本番 URL は未確認**と明記する |

自動化スクリプトはリポジトリ外に置き、**結果の要約だけ**をコミットする（スクリーンショット / 生ログはコミットしない）。

## 2. 共通の run 条件（全 run 同一）

| 項目 | 値 |
|------|-----|
| difficulty | 1 |
| 恒久強化 | なし（`permanentUpgrades = {}`） |
| 熟練度 / 転生 | なし（`skillMastery` / `passiveMastery` / `reincarnationCount` = 0） |
| Job Lv | 1（`jobProgress = {}`） |
| 倍速 | **2 倍**（`speedModes` の最大。2 倍速時の論理 dt ≒ 33ms で Node ハーネスの dt=32ms と同水準） |
| オート移動 | 有効（production の「オート移動」機能。手入力 run のみ無効） |
| 品質 | high（品質比較 run を除く） |
| debugRun | **有効**（seed 固定・自動 draft・build 付与を使うため。通常統計へ混ぜない） |
| profile | 各 run は**使い捨ての browser context**（独立した localStorage）で開始する |

**FPS が gameplay を変えるため、計測 run は必ず直列に実行する。**
software GL（swiftshader）で 3 並列にすると 27〜35fps まで落ち、2 倍速の論理 dt が 60〜75ms へ伸びて
被弾量が跳ね上がる。並列実行の結果は参考値としてのみ扱う。

## 3. 通常 draft の通し run（最低 9 run）

production の `SkillDraftManager` / `LevelUpScene` / `EvolutionScene` を通す。
**固定完成 build で代用しない。**

| ジョブ | strategy | seed |
|--------|----------|------|
| flame_witch / frost_mage / warrior | `evolution-first` | 20260803 |
| flame_witch / frost_mage / warrior | `balanced` | 771103 |
| flame_witch / frost_mage / warrior | `random-valid`（決定論 LCG） | 4242424 |

- 応答は `LevelUpScene` が active になってから `draftView()` を読み、production の
  `draftPick / draftReroll / draftBanish / draftSkip / draftRescue` を呼ぶ（UI ボタンと同じ provider）。
- reroll / banish / skip を**実仕様で各 1 回以上**使う。
- 記録: seed / job / strategy / slot / level / 取得順 / 進化（条件成立・提示・取得）/ ボス到達・撃破時刻 /
  勝敗 / 総ダメージ / 被ダメージ / 回復 / 死亡 / top skill と share / 資源 / 状態 / FPS / heap / console。

**合否**: console / pageerror / requestfailed = 0、Result 到達、Base 復帰、再 run で残留 0。

## 4. Result / Base / 再 run

- 各ジョブ最低 1 回: Result 表示 → 残り火 / 報酬 / 熟練度 / Job XP → 二重加算なし → Base 復帰 →
  恒久強化表示 → 次 run で runtime / 弾 / 場 / 状態 / マーカーの残留 0。
- 敗北 run を最低 1 件: 敗北 Result・少量報酬・二重報酬なし・`active_run` 消去・Base 復帰・再 run 可能。

## 5. 進化の実ブラウザ確認

- 各ジョブ **3 種類以上**の進化を実取得する。
- 通常 draft で到達したものと、条件成立のために build を用意して取得したもの（debug 取得）を**区別して記録**する。
- 確認: 進化前 base の再提示なし / base と evolution の同時所持なし / 補助スキルの保持 /
  進化後の追加 Lv なし / runtime・cooldown の引き継ぎ / save→reload で二重にならない / F8 の進化到達表示。
- 低率進化（`mountain_hurl` / `heaven_crushing_descent` / `heaven_mirror_reversal` ほか active 補助進化）は
  条件を組んで最低 1 件ずつ確認する。

## 6. save / reload / resume

各ジョブ最低 1 回、周回途中で保存 → ページ reload → タイトルの「つづきから」。

確認: `jobId` / HP / level / XP / active / passive / evolution / cooldown / RNG cursor /
draft の reroll・banish・skip・guidanceStall / 資源 / 状態 / boss state / telemetry。
**無料 cast なし・cooldown 全回復なし・pending 二重なし・報酬二重なし**。
`selectedJobId` を変えても `active_run.jobId` は不変。export/import 往復も 1 回。

## 7. 品質 4 段階（長時間）

同 seed / 同 build / 同 draft 規則で `low` / `medium` / `high` / `ultra`。
最低 1 ジョブは各品質 **5 分相当**（2 倍速で実 150 秒）、他 2 ジョブは 3 分相当。

- **一致すること**: damage / kills / XP / level / cast / hit / 進化 / 状態 / 闘気 / コンボ /
  体勢 / ボスゲージ / 回復 / 軽減 / boss HP / 結果 / RNG cursor / runtime。
- **差があってよいもの**: 表示オブジェクト数・粒子・数字表示・シェイク・閃光（＝ `particleBudget` と
  `damageNumbers` のみが品質で変わる）。
- 低品質で gameplay イベントが減っていないこと。

## 8. 周回途中の品質切替

`low→ultra` / `ultra→low` / `medium→high` を時刻固定で実施し、
弾 / DoT / 場が消えないこと・cooldown / 対象 / RNG / コンボ / 闘気 / 状態 / ボスゲージが不変であること・
**visual だけが変わる**こと・JS エラーが出ないことを確認する。

## 9. stress profile

3 ジョブ × `high` / `low`。敵 100 体維持・エリート混在（production の `eliteRate`）・ボス・敵弾多数・
active 30 想定 + 進化複数・2 倍速・**10 分相当**（実 5 分）。

記録: 平均 / 最低 FPS・最大フレーム時間・heap（開始 / 中間 / 終了）・表示オブジェクト数・
gameplay / visual の弾数・PoolManager の active / free / 実体数・SpatialGrid 登録数・
状態索引・上限到達・console。

**最低合格**: crash なし・JS エラーなし・無限ループなし・gameplay 停止なし・入力不能なし・
heap の単調増加なし・cleanup 残留なし・low と high で gameplay 一致・low で visual 削減。

**warning 候補**: 平均 30fps 未満 / 10 秒以上のフリーズ / 500ms 超フレームの反復 /
heap が増え続ける / gameplay オブジェクトが上限超過 / low が high より重い。

## 10. 視認性・操作性（構造確認のみ）

自動で確認するのは**構造**だけ: プレイヤー / 敵 / 弾の識別、ボス HP・状態ゲージ、level-up 選択肢の表示、
F8 / F9 / F10 の開閉と非干渉、Result 表示、低品質でも重要 telegraph が残ること、
実キー入力（WASD / SPACE ダッシュ / Q オート切替 / ESC ポーズ）が効くこと。

**「楽しいか・爽快か・難しすぎないか・氷のボス戦が退屈でないか・戦士が安全すぎないか・
火が強すぎないか」は自動では判定しない**（`./human-playtest-gate.md`）。

## 11. 最終バランス判定

M9-A.1 の Node 実測（`./cross-job-final-balance.md`）と browser 実測を突き合わせ、
乖離とジョブ間差を **`harness` / `profile` / `role` / `bug` / `balance` / `human-feel`** の 6 分類へ落とす。
**明確な bug 以外は自動調整しない。** 判定は `./final-balance-verdict.md`。
