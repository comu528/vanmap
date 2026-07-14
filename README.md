# Reincarnation Flame Survivor

ブラウザで動作する見下ろし型2Dサバイバーゲーム（仮タイトル）。
火属性の魔女を操作し、大量の敵を自動攻撃で倒しながら生き延びる。

**インストール不要** — Chrome 系ブラウザで GitHub Pages の URL を開くだけで遊べます。
npm・ビルド処理・バックエンド・データベースは一切使いません。Phaser 3.90.0 を CDN から読み込み、
すべての素材（プレイヤー・敵・弾・エフェクト等）は JavaScript 上で動的生成しています。

> ⚠️ **開発状況**: 現在 **Milestone 2** まで実装済みです。Milestone 3 以降は設計と `TODO.md` の
> 記載のみで、コードは未実装です。詳細は下記「実装状況」を参照してください。

---

## 実装状況

| Milestone | 内容 | 状態 |
|-----------|------|------|
| **M1** | 静的サイト / Pages / Phaser 起動 / タイトル / 仮ドット素材 / プレイヤー移動・ダッシュ / 敵出現 / 自動火球 / 敵撃破 / 経験値 / レベルアップ3択 | ✅ 実装済み |
| **M2** | 5種スキル＋強化（最大Lv8）/ ボス戦 / リザルト / EffectManager（判定と演出の分離）/ オート移動改善 / 一時停止メニュー / 途中再開（ブラウザ保存） | ✅ 実装済み |
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
| Escape | 一時停止（メニューでエフェクト品質・ダメージ数字・画面揺れを変更可） |
| Q | オート移動 切り替え（危険回避・ジェム回収・端回避、手動入力優先） |
| 1〜3 | レベルアップ候補の選択（新規スキル取得 / 既存スキル強化） |
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

現在（M2）は **ブラウザの localStorage** による軽量セーブです。設定・プロフィール・**途中セーブ（active_run）** を保持します。
戦闘中は 20秒ごと / レベルアップ選択後 / 一時停止時 / タブ非表示時に自動保存され、ページを閉じても
タイトルの「続きから」で再開できます（経過時間・HP・レベル・経験値・所持スキル・スキルレベル・討伐数・
乱数シードを復元。敵の個体位置は保存せず、進行状況から安全に再構築します）。勝敗確定時に途中セーブは削除されます。

> セーブ形式を更新したため `save_version` を 2 に更新しました。旧データは不足フィールドを既定値で補って
> 移行し、途中セーブが版不一致・破損の場合は安全に破棄します（起動不能になりません）。

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
  scenes/             Boot / Title / Battle / LevelUp / Result
  entities/           Player / Enemy / Boss / Projectile / ExperienceGem
  skills/             SkillBase / Fireball / FlamePillar / BurningTrail / OrbitingFlame / Meteor
  systems/            DataManager / SaveManager / PoolManager / SkillManager / EffectManager
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

- **当たり判定が総当たり**: 敵×弾の距離判定を総当たり（O(敵×弾)）で行っており、敵・弾が大量になると重くなります。
  空間グリッド等の最適化は M5 で対応予定です（`docs/architecture.md` 参照）。
- **セーブはブラウザ内のみ**: フォルダ保存/バックアップ/競合解決は M5。localStorage のみのため、
  ブラウザのデータ削除で消えます。
- **設定は簡易版**: エフェクト品質・ダメージ数字・画面揺れの切替は一時停止メニューにあります。
  パーティクル数の個別スライダーや専用設定画面は M5 予定。
- **拠点未実装**: リザルトの「獲得残り火」は表示のみで、恒久強化への反映は M3。「拠点へ戻る」は当面「タイトルへ」で代替。
- **難易度は 1 固定**: 難易度選択・解放は M3。現状は難易度1で開始します。
- WebGL 非対応環境では Canvas にフォールバックします（描画は動作、負荷は上がる可能性）。

---

## 動作確認について

開発は GitHub 上で行われており、開発者のローカル PC やゲームエディタでの実プレイ確認はできません。
本リポジトリは **ヘッドレス Chromium（Playwright）による自動スモークテスト** で以下を確認しています:
タイトル→戦闘遷移・仮素材生成・敵出現・自動攻撃・敵撃破・経験値・レベルアップ3択（新規＋強化・重複なし）・
5種スキルすべての与ダメージ・スキル最大Lv8・ボス出現とボスの各挙動（突進/円形弾/召喚/激昂）・
ボス撃破で勝利リザルト・プレイヤー死亡で敗北リザルト・リロード後の途中再開・JSエラーなし。

> ヘッドレス環境の制約: `requestAnimationFrame` が断続的に間引かれ、また headless では
> ページが非フォーカス扱いになり自動一時停止が働くため、「リザルト→再挑戦後の実時間ループ継続」や
> 「時間依存のボス攻撃間隔」は自動計測が不安定でした。これらは判定ロジックを決定論的に別途検証済みですが、
> **体感を含む最終確認は GitHub Pages 公開 URL を実ブラウザで開いて行ってください。**
