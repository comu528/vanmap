# アーキテクチャ

## 全体方針
- Phaser 3.90.0 を CDN 固定で読み込み、ES Modules で構成。ビルド処理なし。
- すべて相対パス（GitHub Pages のリポジトリ名付き URL でも動作）。
- 巨大な単一ファイルにまとめず、責務ごとに分割。
- ゲームロジックと描画演出を分離し、エフェクト削減で結果が変わらないようにする（M2で徹底）。

## Scene 構成
| Scene | 役割 | 状態 |
|-------|------|------|
| `BootScene` | データ読み込み + 仮素材（テクスチャ）生成 + `SaveManager.init` → Title へ | M1 |
| `TitleScene` | はじめから/拠点→拠点へ、続きから→戦闘復帰、データ管理/設定/全画面/保存状態 | M1→M3 |
| `BaseScene` | 拠点。残り火/恒久強化/難易度選択/スキル熟練度/累計統計/戦闘開始。上部メニュー+差し替え式 | M3 |
| `BattleScene` | 戦闘本体（移動/ダッシュ/敵/5種スキル/ボス/経験値/レベルアップ/一時停止/途中再開）。恒久強化・熟練度を開始時に適用 | M1→M3 |
| `LevelUpScene` | レベルアップ3択（1〜3キー/クリック）。新規取得＋既存強化。Battle をポーズして重畳 | M1→M2 |
| `ResultScene` | リザルト（勝敗/統計/スキル別/残り火獲得内訳/難易度解放告知/再挑戦/拠点へ戻る） | M2→M3 |
| `ReincarnationScene` | 転生・魂炎ノード | M4 予定 |

シーン間はデータオブジェクトで受け渡し（例: `scene.start('BattleScene', { difficulty, resume })`）。
LevelUpScene はコールバック `onPick` を受け取り、選択結果を BattleScene に反映して自身を停止する。
拠点は M4 で転生画面・実績画面をメニューに足すだけで拡張できる（メニュー配列 + `show(key)`）。

## Manager 構成
| Manager | 役割 | 状態 |
|---------|------|------|
| `DataManager` | JSON を相対パス fetch し保持。skills/enemies/bosses/upgrades/masteryConfig/emberReward | M1→M3 |
| `SaveManager` | localStorage セーブ（profile/settings/active_run）＋v3移行 | M1→M3（M5で拡張） |
| `ProgressionManager` | 残り火計算/恒久強化(購入・集計)/スキル熟練度/難易度解放/統計。profile を唯一の真実として読み書き | M3 |
| `SpawnManager` | 通常敵生成・難易度倍率・フェーズ・ボス弾/雑魚召喚（BattleScene から分離） | M3 |
| `BattleManager` | 周回の開始/終了/勝敗/リザルト生成/途中セーブ（BattleScene から分離、ProgressionManager へ委譲） | M3 |
| `PoolManager`（`Pool`） | 敵/弾/ボス弾/ジェムのオブジェクトプール（安全上限つき） | M1→M2 |
| `SkillManager` | 所持スキルの取得/強化/発動/統計/熟練度ボーナス適用（直列化で再開） | M2→M3 |
| `EffectManager` | 演出の生成・品質制御。判定（combat.*）とは完全分離 | M2 |
| `ui/PauseMenu` | 一時停止オーバーレイ（再開/設定/拠点へ）（BattleScene から分離） | M3 |
| `ReincarnationManager` | 転生・魂炎ノード | M4 予定 |
| `FolderSaveManager` | showDirectoryPicker + IndexedDB ハンドル + バックアップ | M5 予定 |
| `DebugManager` | `?debug=1` 時の各種デバッグ（現状はマネージャの検査公開のみ） | M5 予定 |

## 恒久成長（M3）
`ProgressionManager` が profile を介して恒久成長を統括する。
- **残り火**: `computeEmberBreakdown()` が `balance.emberReward` から内訳を算出。`completeRun()` が
  `lastResultId` で二重加算を防ぎつつ加算・統計更新・熟練度加算・難易度解放を行い保存する。
- **恒久強化**: `getUpgradeStats(profile)` が effectType 別に集計。BattleScene 開始時に最大HP/ダッシュ回復/
  無敵/移動/経験値/吸収/基礎ダメージ(dealDamage の damageMult)/初期スキルLv へ反映。購入は `buy()` が
  最新 profile を読み直して原子的に検証・保存（連打二重購入は BaseScene 側の `_busy` でも防止）。
- **難易度**: `unlockedDifficulties`/`highestClearedDifficulty` を勝利時のみ更新。倍率は SpawnManager と
  残り火計算が difficulty から参照。
- **スキル熟練度**: `masteryBonuses(profile)` が各スキルの `{damageMult,cooldownMult,radiusMult,startLevel}`
  を返し、`SkillManager.setMasteryBonuses()` 経由で `SkillBase.stats`（キャッシュ）へ乗算。Lv1 は恒等。

## データ読み込み
`DataManager.loadAll()` が `data/*.json` を並列 fetch（`cache: no-cache`）。
`BootScene` が await し、失敗時はエラー表示のみでクラッシュさせない。
ランタイム検証は `utils/validation.js`、CI 検証は `tests/validate-data.mjs`。

## セーブ処理（M3）
`SaveManager` が localStorage に `rfs_profile`（恒久データ v3）/ `rfs_settings` / `rfs_active_run` を保存。
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
