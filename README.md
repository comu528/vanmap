# Reincarnation Flame Survivor

ブラウザで動作する見下ろし型2Dサバイバーゲーム（仮タイトル）。
火属性の魔女を操作し、大量の敵を自動攻撃で倒しながら生き延びる。

**インストール不要** — Chrome 系ブラウザで GitHub Pages の URL を開くだけで遊べます。
npm・ビルド処理・バックエンド・データベースは一切使いません。Phaser 3.90.0 を CDN から読み込み、
すべての素材（プレイヤー・敵・弾・エフェクト等）は JavaScript 上で動的生成しています。

> ⚠️ **開発状況**: 現在 **Milestone 3** まで実装済みです。Milestone 4 以降は設計と `TODO.md` の
> 記載のみで、コードは未実装です。詳細は下記「実装状況」を参照してください。

---

## 実装状況

| Milestone | 内容 | 状態 |
|-----------|------|------|
| **M1** | 静的サイト / Pages / Phaser 起動 / タイトル / 仮ドット素材 / プレイヤー移動・ダッシュ / 敵出現 / 自動火球 / 敵撃破 / 経験値 / レベルアップ3択 | ✅ 実装済み |
| **M2** | 5種スキル＋強化（最大Lv8）/ ボス戦 / リザルト / EffectManager（判定と演出の分離）/ オート移動改善 / 一時停止メニュー / 途中再開（ブラウザ保存） | ✅ 実装済み |
| **M3** | 拠点（BaseScene）/ 残り火の正式実装 / 恒久強化10種 / 難易度選択・解放 / スキル熟練度（Lv1-20）/ profile拡張＋移行 | ✅ 実装済み |
| M4 | スキル進化・転生・魂炎・転生強化 | 📝 設計/TODOのみ |
| M5 | フォルダ保存・バックアップ・JSON入出力・データ競合・デバッグパネル・パフォーマンス調整 | 📝 設計/TODOのみ |

データファイル（`data/*.json`）は M4 以降で使うスキル進化/転生の定義も含めて
先行して用意してあります（`tests/validate-data.mjs` で検証されます）。

### 遊びの流れ（M3）
タイトル →「はじめから / 拠点」→ **拠点画面**（残り火で恒久強化を購入・難易度選択・熟練度確認）→
「戦闘開始」→ 5分サバイバル → リザルト（残り火獲得・難易度解放）→「拠点へ戻る」で再強化。
勝利で次の難易度が解放され、周回するほど恒久的に強くなります。「続きから」は途中セーブがある時のみ有効。

---

## 遊び方（操作方法）

### キーボード
| キー | 操作 |
|------|------|
| WASD / 矢印キー | 移動 |
| Space | ダッシュ（短時間無敵、2回まで、時間で回復） |
| Escape | 一時停止（メニューでエフェクト品質・ダメージ数字・画面揺れを変更 / 拠点へ戻る） |
| Q | オート移動 切り替え（危険回避・ジェム回収・端回避、手動入力優先） |
| 1〜3 | レベルアップ候補の選択（新規スキル取得 / 既存スキル強化） |
| Shift + F | 全画面表示切り替え |
| F1 | デバッグパネル（`?debug=1` 時のみ・M5で実装予定） |

### マウス
- タイトル / **拠点（恒久強化の購入・難易度選択・熟練度確認）** / 一時停止 / レベルアップ / リザルト の UI 操作
- レベルアップ候補・恒久強化の購入ボタンのクリック

> **操作に関する仮定**: 仕様では移動が「WASD」、オート移動切り替えが「A」でしたが、
> WASD の A（左移動）と衝突するため、**オート移動切り替えを Q キーと画面内ボタンに割り当てています**。
> 全画面は F11 がブラウザ標準機能のため、画面右上のボタンと Shift+F を用意しています。

---

## GitHub Pages で公開する（初回のみ・1回だけ）

このリポジトリには GitHub Actions によるデプロイ設定（`.github/workflows/static.yml`）が含まれています。
公開するには **リポジトリ管理者が一度だけ** 以下を行います。

1. GitHub リポジトリの **Settings** を開く
2. 左メニューの **Pages** を開く
3. **Source** を **GitHub Actions** に設定する
4. デプロイ対象ブランチへ push すると Actions（`static.yml`）が走る
5. Actions のデプロイ完了後、表示された公開 URL をブラウザで開く

> デプロイワークフローは `static.yml`（GitHub の Pages 画面から作成したもの）を使用します。対象ブランチを
> 変えたい場合は `static.yml` の `on.push.branches` を編集するか、`workflow_dispatch`（手動実行）を使ってください。
> ビルドは不要で、リポジトリのルート（`index.html` / `styles/` / `src/` / `data/` / `assets/`）を
> そのまま公開します。`.nojekyll` により Jekyll 処理を無効化しています。

### 相対パスについて
すべての参照は相対パス（`./src/...`, `./data/...`）です。`https://<user>.github.io/<repo>/` の
ようなリポジトリ名付き URL でも壊れません。ルート絶対パス（`/src/main.js` 等）は使用していません。

---

## セーブについて

現在（M3）は **ブラウザの localStorage** による軽量セーブです。恒久データ（profile）と設定と
**途中セーブ（active_run）** を保持します。profile には残り火・累計残り火・恒久強化・難易度解放・
スキル熟練度・統計を保存し、周回終了時に自動で加算・保存されます（詳細は `docs/save-format.md`）。
戦闘中は 20秒ごと / レベルアップ選択後 / 一時停止時 / タブ非表示時に active_run を自動保存し、
ページを閉じても「続きから」で再開できます（時間・HP・レベル・経験値・所持スキル・討伐数・シードを復元。
敵の個体位置は保存せず進行状況から再構築）。勝敗確定時に active_run は削除されます。

> セーブ形式を拡張したため `save_version` を 3 に更新しました。旧版（v1/v2）の profile は明示マッピングで
> 移行し（残り火・強化・難易度解放・統計を引き継ぎ、不足は安全な初期値）、起動不能になりません。
> active_run は v2/v3 でスキーマ互換のため、既存の途中セーブもそのまま再開できます。

以下は **Milestone 5 で実装予定** です（設計は `docs/save-format.md` 参照）:
- 「保存フォルダを接続」ボタン（`window.showDirectoryPicker()`）による任意フォルダへの保存
- `profile.json` / `active_run.json` / `settings.json` と `backups/`（最大10世代）
- IndexedDB へのフォルダハンドル保存と再取得
- 非対応ブラウザ向けの localStorage / JSON ダウンロード・インポートへのフォールバック
- フォルダ内データとブラウザ内データの競合解決（`updated_at` 比較でユーザー選択）

ブラウザから勝手にフォルダへ書き込むことはせず、ユーザーが明示的に選択したフォルダのみを使う設計です。

---

## デバッグモード

URL に `?debug=1` を付けると、検査用に各マネージャ（`window.RFS = { DataManager, SaveManager,
ProgressionManager }`）を公開します。フル機能のデバッグパネルは **Milestone 5 で実装予定** です。
通常利用時（`?debug=1` なし）は公開しません。

---

## ファイル構成

```
index.html            エントリ HTML（Phaser を CDN 固定で読み込み）
.nojekyll             GitHub Pages の Jekyll 無効化
styles/main.css       全体スタイル（ピクセル拡大時のぼやけ防止など）
src/
  main.js             起動・シーン登録・全画面ボタン（?debug=1 でマネージャを検査公開）
  config/             ゲーム設定・定数
  scenes/             Boot / Title / Base(拠点) / Battle / LevelUp / Result
  entities/           Player / Enemy / Boss / Projectile / ExperienceGem
  skills/             SkillBase / Fireball / FlamePillar / BurningTrail / OrbitingFlame / Meteor
  systems/            DataManager / SaveManager / ProgressionManager / SpawnManager / BattleManager /
                      PoolManager / SkillManager / EffectManager
  ui/                 HUD / PauseMenu
  utils/              math / time / validation
data/                 skills / enemies / bosses / permanent-upgrades / skill-mastery / reincarnation / balance（JSON）
docs/                 game-design / architecture / data-format / save-format / test-guide
tests/validate-data.mjs   Node標準のみのデータ検証
.github/workflows/    static.yml（公開） / validate.yml（データ検証）
```

M4 以降で追加予定のファイル（`ReincarnationScene`, `FolderSaveManager`, `DebugPanel` 等）は
`TODO.md` に一覧があります。

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
- **戦闘バランス**: M3 では戦闘バランスの全面調整は行っていません。5分生存は難しめですが、
  拠点の恒久強化を重ねて徐々に到達しやすくなる設計です。
- **スキル熟練度ボーナスは小さめ**: 熟練度は Lv20 まで蓄積しますが、報酬は控えめな基礎補正のみです
  （分岐スキル・新候補・進化緩和・エフェクト変化は M4 予定）。
- WebGL 非対応環境では Canvas にフォールバックします（描画は動作、負荷は上がる可能性）。

---

## 動作確認について

開発は GitHub 上で行われており、開発者のローカル PC やゲームエディタでの実プレイ確認はできません。
本リポジトリは **ヘッドレス Chromium（Playwright）による自動スモークテスト** で以下を確認しています:
タイトル→拠点→戦闘の遷移・仮素材生成・敵出現・自動攻撃・敵撃破・経験値・レベルアップ3択・
5種スキルの与ダメージ・ボス出現と各挙動・勝敗リザルト・リロード後の途中再開に加え、M3では
残り火の一度きり加算（二重加算防止）・敗北時も残り火獲得（勝利より少）・恒久強化の購入と残り火不足時の購入不可・
恒久強化の次戦闘への反映・難易度1クリアで難易度2解放・未解放難易度の選択不可・難易度倍率の敵/報酬反映・
スキル統計のprofile加算・熟練度の周回またぎ保持・旧save_version（v2→v3）からの安全な移行・
profileのリロード保持・JSエラーなし・JSON検証成功 を確認しました（拠点UIの各画面は描画も確認）。

> ヘッドレス環境の制約: `requestAnimationFrame` が断続的に間引かれ、また headless では
> ページが非フォーカス扱いになり自動一時停止が働くため、「リザルト→再挑戦後の実時間ループ継続」や
> 「時間依存のボス攻撃間隔」は自動計測が不安定でした。これらは判定ロジックを決定論的に別途検証済みですが、
> **体感を含む最終確認は GitHub Pages 公開 URL を実ブラウザで開いて行ってください。**
