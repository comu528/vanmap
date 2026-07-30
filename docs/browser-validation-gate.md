# 実ブラウザ検証ゲート（Milestone 9-A.1）

Node ハーネス（`./cross-job-full-balance-harness.md`）が確認できない範囲 —— 実描画・実 FPS・
メモリ・JS error・実入力 —— を実ブラウザで確認するための**再現可能な手順**と、
M9-A.1 時点の**実施記録**。記録様式は `./browser-validation-result-template.md`。

**原則: Node の結果を「ブラウザ確認済み」と言い換えない。**
このゲートで実施した項目だけを実施済みとし、それ以外は未確認として残す。

---

## 1. 前提（必須依存を追加しない）

- リポジトリは静的 HTML / CSS / JS のまま。**package.json / lockfile / Playwright 設定を追加しない。**
- ブラウザ自動化（Playwright 等）は**実行環境に既にある場合に限り**任意の手段として使ってよい。
  スクリプトはリポジトリへコミットせず、結果だけを本書とテンプレートへ記録する。
- 手動実行でも同じ確認ができるよう、手順はすべてブラウザの操作と `?debug=1` パネルで完結させる。

## 2. 手順（再現手順・手動でも自動でも同一）

1. **静的配信**: リポジトリ直下で `npx http-server -p 8123 -c-1`（または `python3 -m http.server 8123`）。
2. **起動**: `http://127.0.0.1:8123/index.html?debug=1` を開く。
   - Boot → Title へ遷移し、console に `Reincarnation Flame Survivor <version> [debug]` が出ること。
   - Phaser は CDN 固定 URL（`https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js`）から
     読まれること。CDN へ届かない網内では**同一版**のファイルを同 URL へ差し替え応答してよい
     （index.html は変更しない）。
3. **3 ジョブ実プレイ**: タイトル → 拠点 → 出撃で `flame_witch` / `frost_mage` / `warrior` を
   各 60 秒以上プレイ（自動化の場合は最低 15〜20 秒 + スクリーンショット）。
   - 敵が湧く / 弾が飛ぶ / XP 玉を拾って level-up 抽選が出る / HP が減ることを目視。
   - console エラー **0** が合格条件。
4. **4 品質**: 設定で `low / medium / high / ultra` を切り替えて各 1 周回開始。
   - `?debug=1` の F8 →「Balance 分析」→ 横断バランス節で
     `敵上限 200 / 弾上限 400 / hitStop 有 / gameplay cap 品質差 0 件` が**全品質で同一**なこと。
   - 変わってよいのは演出のみ（damageNumbers・particleBudget 等）。
5. **周回途中の品質切替**: 戦闘中に low → ultra → medium と切替え、周回が継続し
   （死なずに kill が増え続け）、gameplay 上限が変わらないこと。
6. **F8 / F9 / F10**: F8 の Balance Playtest と分析パネルが開閉できること（debugRun 表示）。
   F10 の状態異常デバッグが開くこと。
7. **セーブ往復**: 戦闘中に一時停止（自動化では `autoSave()`）→ リロード → 「つづきから」で
   復帰できること。`rfs_active_run.save_version = 6`。
8. **相対パス**: すべてのリソースが配信元ホストから相対パスで読まれ、
   失敗リクエスト 0・外部ホスト（CDN 以外）0 であること。
9. **FPS / メモリ**: F8 の性能表示または DevTools で FPS と JS heap を確認。
   合否基準: 60 秒プレイで console エラー 0・FPS が継続的に 30 を割らない・heap が単調増加しない。

## 3. 実施した内容（M9-A.1・この環境での実行記録）

実行環境: Linux コンテナ / Chromium 1194（Playwright グローバル・**リポジトリ外**）/
http-server による静的配信 / commit は M9-A.1 実装コミット。
CDN へは網の方針（CONNECT 403）で届かないため、**同一版 phaser@3.90.0 の phaser.min.js** を
CDN の固定 URL への応答として差し替えた（index.html 無変更・URL が要求されたことを確認）。

| 項目 | 結果 |
|------|------|
| 起動 / タイトル | Phaser **3.90.0** 起動・canvas 生成・8 シーン登録・Title 到達。console エラー 0 |
| 3 ジョブ実プレイ（各 20 秒） | 3 ジョブとも敵湧き・撃破・XP・被弾が動作（例: 火 kills 7 / Lv1 / HP 68/100・氷 kills 8 / Lv2・戦士 kills 5 / Lv2 / HP 71/100）。エラー 0 |
| 実 FPS | avgFps 56〜60 / fpsMin 50〜60（20 秒サンプル・3 ジョブ + 4 品質 + F8 周回の全 9 計測） |
| メモリ | JS heap 25〜29 MB（周回間で単調増加なし。**長時間の傾向は未確認**） |
| 4 品質の gameplay 上限 | 全品質で maxEnemies **200** / maxProjectiles **400** / hitStop **有** / `skillCap`（maxMeleeTargetsPerHit 24・maxFlameLances 80・maxFrozenEnemies 100）**同値**。品質差は演出のみ（damageNumbers: low のみ false・particleBudget 40/120/260/480） |
| 周回途中の品質切替 | low → ultra → medium で周回継続（kills 2 → 4 → 6 と増加・死亡なし）・gameplay 上限不変 |
| F8 分析パネル | 開閉正常・M9-A.1 横断バランス節表示・「gameplay/safety cap 170 件中 品質で変わるもの 0 件」を実ブラウザで確認 |
| セーブ往復 | `autoSave()` → `loadActiveRun()` 往復成功・jobId 保持・**save_version 6** |
| 相対パス | リソース 224 件すべて配信元ホスト・失敗 0・外部ホスト 0（GitHub Pages のサブパス配下相当） |
| console / pageerror / requestfailed | 全シナリオ合計 **0 件** |

スクリーンショット（タイトル / 3 ジョブ / 4 品質 / F8）を採取して目視確認した
（成果物は環境外へ残らないため、再実施時はテンプレートに添付すること）。

## 4. 未確認の内容（実施していない・Node 結果で代替しない）

- **人間の手入力による実プレイの体感・操作感は未確認**（キーボード / タッチ・ダッシュ操作・エイム感）。
- **10 分以上の長時間セッション**での FPS 低下・メモリ増加の傾向（自動計測は 20 秒 × 9 周回まで）。
- **敵 100 体 + 弾数百発の負荷ピーク時**の実 FPS（自動プレイは序盤 20 秒のため敵密度が低い）。
- 2 倍速での長時間プレイ・EvolutionScene / ResultScene を跨ぐ一連の実プレイ・実機（スマートフォン）。
- GitHub Pages 本番 URL での確認（配信はローカル静的サーバで代替）。

これらは §2 の手順で誰でも再実施できる。結果は
`./browser-validation-result-template.md` の様式で記録し、本書 §3 を更新すること。

## 5. ゲートの検査（自動テスト）

`tests/cross-job-browser-gate.mjs` が以下を機械的に検査する:

- 本書とテンプレートの存在・手順の再現可能性（配信 / URL / 3 ジョブ / 4 品質 / 合否基準 / 未確認の扱い）
- 実施 / 未実施の区別・禁止表現（Node 結果のブラウザ確認済み化）が無いこと
- **必須依存が増えていない**こと（package.json / lockfile / playwright.config / node_modules 不在、
  tests・src に外部パッケージ import 0）
- 静的配信の前提（相対パス・CDN 固定 URL・static.yml / validate.yml 維持・pages.yml 不在）
