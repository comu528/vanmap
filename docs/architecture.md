# アーキテクチャ

## 全体方針
- Phaser 3.90.0 を CDN 固定で読み込み、ES Modules で構成。ビルド処理なし。
- すべて相対パス（GitHub Pages のリポジトリ名付き URL でも動作）。
- 巨大な単一ファイルにまとめず、責務ごとに分割。
- ゲームロジックと描画演出を分離し、エフェクト削減で結果が変わらないようにする（M2で徹底）。

## Scene 構成
| Scene | 役割 | 状態 |
|-------|------|------|
| `BootScene` | データ読み込み + 仮素材（テクスチャ）生成 → Title へ | M1 |
| `TitleScene` | はじめから/続きから/拠点/データ管理/設定/全画面/バージョン/保存状態 | M1 |
| `BattleScene` | 戦闘本体（移動/ダッシュ/敵/5種スキル/ボス/経験値/レベルアップ/一時停止/自動停止/途中再開） | M1→M2 |
| `LevelUpScene` | レベルアップ3択（1〜3キー/クリック）。新規取得＋既存強化。Battle をポーズして重畳 | M1→M2 |
| `ResultScene` | リザルト（勝敗/生存時間/討伐/ボス討伐/スキル別ダメージ・討伐/最高ダメージ/再挑戦/タイトル） | M2 |
| `BaseScene` | 拠点（恒久強化/難易度/転生/データ管理） | M3 予定 |
| `ReincarnationScene` | 転生・魂炎ノード | M4 予定 |

シーン間はデータオブジェクトで受け渡し（例: `scene.start('BattleScene', { difficulty, resume })`）。
LevelUpScene はコールバック `onPick` を受け取り、選択結果を BattleScene に反映して自身を停止する。

## Manager 構成
| Manager | 役割 | 状態 |
|---------|------|------|
| `DataManager` | JSON を相対パス fetch し保持。ID→定義のマップ、スキルLv取得 | M1 |
| `SaveManager` | localStorage による軽量セーブ（profile/settings/active_run）＋版移行 | M1→M2（M5で拡張） |
| `PoolManager`（`Pool`） | 敵/弾/ボス弾/ジェムのオブジェクトプール（安全上限つき） | M1→M2 |
| `SkillManager` | 所持スキルの取得/強化/発動/統計（5種スキルを統括、直列化で再開） | M2 |
| `EffectManager` | 演出の生成・品質制御。判定（combat.*）とは完全分離 | M2 |
| `SpawnManager` | 出現ロジックの分離（現状 BattleScene 内包） | M3 予定 |
| `BattleManager` | 戦闘進行・勝敗・タイマーの切り出し（現状 BattleScene 内包） | M3 予定 |
| `UpgradeManager` | 恒久強化の購入・反映 | M3 予定 |
| `ReincarnationManager` | 転生・魂炎ノード | M4 予定 |
| `FolderSaveManager` | showDirectoryPicker + IndexedDB ハンドル + バックアップ | M5 予定 |
| `DebugManager` | `?debug=1` 時の各種デバッグ | M5 予定 |

## データ読み込み
`DataManager.loadAll()` が `data/*.json` を並列 fetch（`cache: no-cache`）。
`BootScene` が await し、失敗時はエラー表示のみでクラッシュさせない。
ランタイム検証は `utils/validation.js`、CI 検証は `tests/validate-data.mjs`。

## セーブ処理（M2）
`SaveManager` が localStorage に `rfs_profile` / `rfs_settings` / `rfs_active_run` を保存。
`hasActiveRun()` は版数・必須項目を検証し、タイトルの「続きから」を有効化する。
戦闘中の自動保存は 20秒毎 / レベルアップ選択後 / 一時停止時 / タブ非表示時。勝敗確定で `clearActiveRun()`。
`BattleScene.restoreFromRun()` が時間・HP・レベル・経験値・所持スキル・討伐数・シードから戦闘を再構築する
（敵個体は保存しない）。M5 で `FolderSaveManager` と統合し、フォルダ保存/バックアップ/競合解決へ拡張する。

## エフェクト処理と判定の分離（M2 の要）
- **判定 API `scene.combat.*`**: `dealDamage / damageArea / nearestEnemy / forEachEnemyInRadius /
  densestPoint / spawnPlayerProjectile`。ダメージ・命中・撃破・統計はすべてここで数値計算する。
- **演出 API `scene.effects.*`（EffectManager）**: パーティクル/軌跡/爆発/ダメージ数字/フラッシュ/
  画面揺れ/ヒットストップ/予告。品質設定（low/medium/high/ultra）で描画量を増減・無効化する。
- 各スキル（`skills/*`）は `combat.*` で判定し `effects.*` で見た目を出すため、
  **エフェクトを無効化・低品質化しても戦闘結果（与ダメージ・撃破）は一切変わらない**。
- ヒットストップは強攻撃（隕石）のみ。品質が high/ultra のときだけ有効で、演出扱いのため無効化可能。

## オブジェクトプール
`Pool` は Phaser の重量オブジェクトを Set（active）と配列（free）で再利用。
`spawn()` は maxSize を超えると null（安全上限）。`release()` で非表示・body 無効化。
敵/弾/ジェムに適用済み。ダメージ数字/パーティクルは M2 でプール化予定。

## パフォーマンス方針（M5 で強化）
- 最寄り敵検索は一定間隔（M1: 120ms）で実行済み。
- 当たり判定は M1 で総当たり（O(P×E)）→ M5 で空間グリッド/近傍検索へ。
- 画面外エフェクト削減、パーティクル/敵/弾の上限、低負荷モード。
- タブ非表示中は `update` を停止（M1 実装済みの自動停止）。
