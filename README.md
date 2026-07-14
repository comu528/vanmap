# Reincarnation Flame Survivor

ブラウザで動作する見下ろし型2Dサバイバーゲーム（仮タイトル）。
火属性の魔女を操作し、大量の敵を自動攻撃で倒しながら生き延びる。

**インストール不要** — Chrome 系ブラウザで GitHub Pages の URL を開くだけで遊べます。
npm・ビルド処理・バックエンド・データベースは一切使いません。Phaser 3.90.0 を CDN から読み込み、
すべての素材（プレイヤー・敵・弾・エフェクト等）は JavaScript 上で動的生成しています。

> ⚠️ **開発状況**: 現在 **Milestone 1** まで実装済みです。Milestone 2 以降は設計と `TODO.md` の
> 記載のみで、コードは未実装です。詳細は下記「実装状況」を参照してください。

---

## 実装状況

| Milestone | 内容 | 状態 |
|-----------|------|------|
| **M1** | 静的サイト / Pages / Phaser 起動 / タイトル / 仮ドット素材 / プレイヤー移動・ダッシュ / 敵出現 / 自動火球 / 敵撃破 / 経験値 / レベルアップ3択 | ✅ 実装済み |
| M2 | 5種スキル・スキルレベル・ボス・リザルト・エフェクト・オート移動・一時停止・途中再開 | 📝 設計/TODOのみ |
| M3 | 拠点・残り火・恒久強化・難易度・スキル熟練度 | 📝 設計/TODOのみ |
| M4 | スキル進化・転生・魂炎・転生強化 | 📝 設計/TODOのみ |
| M5 | フォルダ保存・バックアップ・JSON入出力・データ競合・デバッグパネル・パフォーマンス調整 | 📝 設計/TODOのみ |

データファイル（`data/*.json`）は M2 以降で使うスキル/敵/ボス/恒久強化/転生の定義も含めて
先行して用意してあります（`tests/validate-data.mjs` で検証されます）。

---

## 遊び方（操作方法）

### キーボード
| キー | 操作 |
|------|------|
| WASD / 矢印キー | 移動 |
| Space | ダッシュ（短時間無敵、2回まで、時間で回復） |
| Escape | 一時停止 |
| Q | オート移動 切り替え |
| 1〜3 | レベルアップ候補の選択 |
| Shift + F | 全画面表示切り替え |
| F1 | デバッグパネル（`?debug=1` 時のみ・M5で実装予定） |

### マウス
- タイトル/一時停止/レベルアップ等の UI 操作
- レベルアップ候補のクリック選択

> **操作に関する仮定**: 仕様では移動が「WASD」、オート移動切り替えが「A」でしたが、
> WASD の A（左移動）と衝突するため、**オート移動切り替えを Q キーと画面内ボタンに割り当てています**。
> 全画面は F11 がブラウザ標準機能のため、画面右上のボタンと Shift+F を用意しています。

---

## GitHub Pages で公開する（初回のみ・1回だけ）

このリポジトリには GitHub Actions によるデプロイ設定（`.github/workflows/pages.yml`）が含まれています。
公開するには **リポジトリ管理者が一度だけ** 以下を行います。

1. GitHub リポジトリの **Settings** を開く
2. 左メニューの **Pages** を開く
3. **Source** を **GitHub Actions** に設定する
4. `main` ブランチへ push（またはこのブランチをマージ）すると Actions が走る
5. Actions のデプロイ完了後、表示された公開 URL をブラウザで開く

> デプロイワークフローは既定で `main` ブランチへの push で起動します。開発ブランチで試したい場合は
> `pages.yml` の `on.push.branches` に該当ブランチ名を追加するか、`workflow_dispatch`（手動実行）を使ってください。
> ビルドは不要で、リポジトリのルート（`index.html` / `styles/` / `src/` / `data/` / `assets/`）を
> そのまま公開します。`.nojekyll` により Jekyll 処理を無効化しています。

### 相対パスについて
すべての参照は相対パス（`./src/...`, `./data/...`）です。`https://<user>.github.io/<repo>/` の
ようなリポジトリ名付き URL でも壊れません。ルート絶対パス（`/src/main.js` 等）は使用していません。

---

## セーブについて

現在（M1）は **ブラウザの localStorage** による軽量セーブのみです。設定と将来のプロフィールを保持します。

以下は **Milestone 5 で実装予定** です（設計は `docs/save-format.md` 参照）:
- 「保存フォルダを接続」ボタン（`window.showDirectoryPicker()`）による任意フォルダへの保存
- `profile.json` / `active_run.json` / `settings.json` と `backups/`（最大10世代）
- IndexedDB へのフォルダハンドル保存と再取得
- 非対応ブラウザ向けの localStorage / JSON ダウンロード・インポートへのフォールバック
- フォルダ内データとブラウザ内データの競合解決（`updated_at` 比較でユーザー選択）

ブラウザから勝手にフォルダへ書き込むことはせず、ユーザーが明示的に選択したフォルダのみを使う設計です。

---

## デバッグモード

URL に `?debug=1` を付けるとデバッグ機能が有効になります（例: `.../index.html?debug=1`）。
現在はフラグ検出のみで、パネル本体は **Milestone 5 で実装予定** です。通常利用時は隠れています。

---

## ファイル構成

```
index.html            エントリ HTML（Phaser を CDN 固定で読み込み）
.nojekyll             GitHub Pages の Jekyll 無効化
styles/main.css       全体スタイル（ピクセル拡大時のぼやけ防止など）
src/
  main.js             起動・シーン登録・全画面ボタン
  config/             ゲーム設定・定数
  scenes/             Boot / Title / Battle / LevelUp（M1分）
  entities/           Player / Enemy / Projectile / ExperienceGem
  systems/            DataManager / SaveManager / PoolManager（M1分）
  ui/                 HUD
  utils/              math / time / validation
data/                 skills / enemies / bosses / permanent-upgrades / reincarnation / balance（JSON）
docs/                 game-design / architecture / data-format / save-format / test-guide
tests/validate-data.mjs   Node標準のみのデータ検証
.github/workflows/    pages.yml（公開） / validate.yml（データ検証）
```

M2 以降で追加予定のファイル（`BaseScene`, `ResultScene`, `ReincarnationScene`, 各 Skill クラス,
`SpawnManager` ほか各種 Manager, `FolderSaveManager`, `DebugPanel` 等）は `TODO.md` に一覧があります。

---

## ローカル確認について

このプロジェクトはインストール不要ですが、ローカルで開く場合は ES Modules のため
`file://` 直開きではなく簡易サーバー経由で開いてください（例: `python3 -m http.server`）。
公開後は GitHub Pages の URL をそのまま開けば OK です。

---

## 既知の問題・想定される不具合

- **ボス・リザルト未実装**: 5分経過時はバナー表示のみで、ボス戦とリザルト画面は M2 で実装します。
- **当たり判定が総当たり**: M1 は敵×弾の距離判定を総当たりで行っており、敵が大量になると重くなります。
  空間グリッド等の最適化は M5 で対応予定です（`docs/architecture.md` 参照）。
- **オート移動が簡易版**: 最寄り敵からの回避と画面端補正のみ。ジェム回収や危険回避の高度化は M2。
- **セーブはブラウザ内のみ**: フォルダ保存/バックアップ/競合解決は M5。
- **エフェクト品質設定 未実装**: 低負荷モードや品質段階の設定 UI は M2 以降。
- WebGL 非対応環境では Canvas にフォールバックします（描画は動作、負荷は上がる可能性）。

---

## 動作確認について

開発は GitHub 上で行われており、開発者のローカル PC やゲームエディタでの実プレイ確認はできません。
本リポジトリの M1 は **ヘッドレス Chromium（Playwright）による自動スモークテスト** で、
タイトル→戦闘遷移・仮素材生成・敵出現・自動火球・敵撃破・経験値取得・レベルアップ3択・
一時停止・ダッシュの動作を確認しています（詳細は作業報告参照）。
**最終的な体感・実プレイ確認は、GitHub Pages 公開 URL をブラウザで開いて行ってください。**
