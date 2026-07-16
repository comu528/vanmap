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
| `LevelUpScene` | レベルアップ3〜4択。新規取得＋既存強化＋**進化候補**（金枠）。Battle をポーズして重畳 | M1→M4 |
| `EvolutionScene` | スキル進化の演出（置換処理とは分離。演出中は戦闘停止、クリック/Enterで再開） | M4 |
| `ResultScene` | リザルト（勝敗/統計/スキル別/残り火獲得内訳/難易度解放告知/再挑戦/拠点へ戻る） | M2→M3 |
| `DataManagementScene` | データ管理（保存状態/フォルダ接続・再接続・解除/今すぐ保存/再読込/JSON入出力/バックアップ/競合解決/初期化） | M5-B |
| 転生・魂炎 | 独立シーンではなく `BaseScene` の「転生」「魂炎強化」タブに実装（スクロール対応） | M4 |

シーン間はデータオブジェクトで受け渡し（例: `scene.start('BattleScene', { difficulty, resume })`）。
LevelUpScene はコールバック `onPick` を受け取り、選択結果を BattleScene に反映して自身を停止する。
拠点は M4 で転生画面・実績画面をメニューに足すだけで拡張できる（メニュー配列 + `show(key)`）。

## Manager 構成
| Manager | 役割 | 状態 |
|---------|------|------|
| `DataManager` | JSON を相対パス fetch し保持。skills/enemies/bosses/upgrades/masteryConfig/emberReward | M1→M3 |
| `SaveManager` | localStorage の同期ライブキャッシュ（profile/settings/active_run）＋v5移行＋coordinator通知 | M1→M5-B |
| `storage/*`（保存レイヤー） | StorageAdapter（Browser/Folder/Memory）+ SaveCoordinator + SaveValidator + SaveConflictResolver + SaveService。フォルダ保存/ミラー/バックアップ/JSON入出力/競合/複数タブ | M5-B |
| `ProgressionManager` | 残り火計算/恒久強化(購入・集計)/スキル熟練度/難易度解放/統計/周回(cycle)進捗。profile を唯一の真実に | M3→M4 |
| `ReincarnationManager` | 転生条件/魂炎計算/転生実行(リセット・維持)/魂炎強化(購入・集計)。profile を読み書き | M4 |
| `EvolutionManager` | 進化条件判定・熟練度連携(候補率/緩和/初期Lv/追加効果)。置換は SkillManager、演出は EvolutionScene | M4 |
| `SpawnManager` | 通常敵生成・難易度倍率・敵密度(魂炎)・フェーズ・ボス弾/雑魚召喚（BattleScene から分離） | M3→M4 |
| `BattleManager` | 周回の開始/終了/勝敗/リザルト生成/途中セーブ（BattleScene から分離、ProgressionManager へ委譲） | M3 |
| `PoolManager`（`Pool`） | 敵/弾/ボス弾/ジェムのオブジェクトプール（安全上限＋onSpawn/onRelease フック＋生成/再利用/返却カウンタ） | M1→M5-A |
| `SpatialGrid` | 空間ハッシュグリッド。敵/ジェムの近傍検索（円/矩形/最寄り）を O(N) 総当たりから周辺セルのみへ。Phaser 非依存の純JS（Nodeでテスト可） | M5-A |
| `SkillManager` | 所持スキルの取得/強化/発動/統計/熟練度ボーナス適用（直列化で再開） | M2→M3 |
| `EffectManager` | 演出の生成・品質制御。判定（combat.*）とは完全分離 | M2 |
| `ui/PauseMenu` | 一時停止オーバーレイ（再開/設定/拠点へ）（BattleScene から分離） | M3 |
| `ReincarnationManager` | 転生・魂炎ノード | M4 予定 |
| `storage/FolderStorageAdapter` | showDirectoryPicker + IndexedDB ハンドル + 安全書き込み + バックアップ + manifest | M5-B |
| `DebugManager` | `?debug=1` 時の各種デバッグ（現状は BattleScene 内の性能パネル/グリッド可視化/検査公開） | M5-A（一部）／M5-B で本格 |

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

## 進化・転生・魂炎（M4）
- **進化**: `EvolutionManager.candidates()` が条件成立スキルを rng＋熟練度出現率で候補化。選択で
  `SkillManager.evolve(baseId)` が基礎スキルを進化スキル（`skills/Evolved*`）へ置換（枠は消費しない・一周一度）。
  置換完了後に `EvolutionScene` を演出のみとして起動（演出無効でも置換は完了済み）。進化後の与ダメージは
  進化スキルIDで記録し、`ProgressionManager.completeRun()` が基礎スキル熟練度へ寄せ `evolutions`/`evolutionStatistics` を更新。
- **転生**: `ReincarnationManager.reincarnate()` が魂炎を確定（`lastReincarnationId` で二重防止）し、
  リセット/維持を適用、`currentCycle` を更新、`active_run` を破棄して保存。条件は**周回(cycle)単位**で判定（farming防止）。
- **魂炎強化**: `getReincarnationStats(profile)` を BattleScene 開始時に適用（候補数/初期火力/初期スキルLv/連鎖/
  敵密度/エフェクト上限/恒久上限/倍速/オートダッシュ/開始残り火）。`permCap`/`rewardMult` は ProgressionManager が内製で参照。
- **倍速**: `applySpeed(m)` が `physics.world.timeScale=1/m`・`time.timeScale=m`・`tweens.timeScale=m` とロジック dt×m を一括適用。
- **安全上限**: `balance.combatCaps` と各進化の `safetyCaps` を毎フレーム予算化（AoE数/追撃火球/死亡爆発連鎖/感染世代/
  ダメージ数字/パーティクル）。上限到達でも戦闘ロジックは停止しない。

## データ読み込み
`DataManager.loadAll()` が `data/*.json` を並列 fetch（`cache: no-cache`）。
`BootScene` が await し、失敗時はエラー表示のみでクラッシュさせない。
ランタイム検証は `utils/validation.js`、CI 検証は `tests/validate-data.mjs`。

## セーブ処理（M3）
`SaveManager` が localStorage に `rfs_profile`（恒久データ v3）/ `rfs_settings` / `rfs_active_run` を保存。
`hasActiveRun()` は版数・必須項目を検証し、タイトルの「続きから」を有効化する。
戦闘中の自動保存は 20秒毎 / レベルアップ選択後 / 一時停止時 / タブ非表示時。勝敗確定で `clearActiveRun()`。
`BattleScene.restoreFromRun()` が時間・HP・レベル・経験値・所持スキル・討伐数・シードから戦闘を再構築する
（敵個体は保存しない）。

## 保存レイヤー（M5-B）
localStorage を**同期のライブキャッシュ（唯一の即時読み書き先）**として維持し、フォルダ保存は
**非同期のミラー**として上乗せする（既存の同期呼び出しを変えずにフォルダ保存を追加）。
- **SaveManager**: `loadProfile/saveProfile/...` は従来どおり同期で localStorage を読み書きし、保存後に
  `SaveCoordinator.notify(type, payload, {reason})` で durable 保存を非同期スケジュール（fire-and-forget）。v5 移行＋旧キー退避も担う。
- **SaveCoordinator**: デバウンス＋キューで**同時書き込みを避け・最新のみ保存**（古い保存が新しい保存を上書きしない）。
  フォルダ(primary)＋ブラウザ(mirror)、失敗時フォールバック、バックアップ方針、manifest 更新、複数タブ制御。
- **アダプター**: `StorageAdapter` を `BrowserStorageAdapter`（localStorage）/`FolderStorageAdapter`（FS Access API・
  安全書き込み）/`MemoryStorageAdapter`（テスト）が実装。単位は checksum 付きエンベロープ。
- **SaveValidator / SaveConflictResolver**: checksum・エンベロープ検証・インポート検証（プロトタイプ汚染ガード）・
  競合検出/推奨。いずれも Phaser/DOM 非依存の純 JS で Node テスト可能（`tests/save-system.mjs`）。
- **SaveService**: UI（`DataManagementScene`）と上記を繋ぐファサード（接続/再接続/解除/今すぐ保存/再読込/
  エクスポート/インポート/バックアップ/競合解決）。`showDirectoryPicker` はユーザー操作からのみ・起動時に許可ダイアログを出さない。
- 詳細な形式・優先順位・安全書き込み・バックアップ・競合・複数タブ・失敗時挙動は `docs/save-format.md`。

## エフェクト処理と判定の分離（M2 の要）
- **判定 API `scene.combat.*`**: `dealDamage / damageArea / nearestEnemy / forEachEnemyInRadius /
  densestPoint / spawnPlayerProjectile`。ダメージ・命中・撃破・統計はすべてここで数値計算する。
- **演出 API `scene.effects.*`（EffectManager）**: パーティクル/軌跡/爆発/ダメージ数字/フラッシュ/
  画面揺れ/ヒットストップ/予告。品質設定（low/medium/high/ultra）で描画量を増減・無効化する。
- 各スキル（`skills/*`）は `combat.*` で判定し `effects.*` で見た目を出すため、
  **エフェクトを無効化・低品質化しても戦闘結果（与ダメージ・撃破）は一切変わらない**。
- ヒットストップは強攻撃（隕石）のみ。品質が high/ultra のときだけ有効で、演出扱いのため無効化可能。

## オブジェクトプール（M5-A で整理）
`Pool` は Phaser の重量オブジェクトを Set（active）と配列（free）で再利用。
`spawn()` は maxSize を超えると null（安全上限）。返却処理は `release()` に共通化し、
非表示・`setActive(false)`・`body.enable=false`・`body.stop()`（velocity 停止）を必ず行う。
- **onSpawn/onRelease フック**: 生成/返却時に空間グリッドの登録/解除を一元化（呼び出し側は意識しない）。
- **完全初期化**: 各エンティティの `reset()` が skillId/hostile/tint/velocity/timer/charge/knockback/
  炎上/`_gridCell` などの残留を消してから再利用する（`Enemy`/`Projectile`/`ExperienceGem`）。
- **計測**: `createdCount`（新規生成）/`reusedCount`（再利用）/`releasedCount`（返却）を保持し性能パネルに表示。
- 敵/プレイヤー弾/ボス弾/ジェムに適用。ダメージ数字/一時AoEは軽量な自動破棄で運用（本格プール化は将来）。

## 空間グリッド（M5-A の要）
`SpatialGrid`（`src/systems/SpatialGrid.js`）は Phaser 非依存の純 JS で、`{x,y,alive}` を持つ
オブジェクトをセル単位で管理する。API: `insert / update / remove / clear / queryCircle /
queryAABB / findNearest / size / usedCells`。セルサイズは `balance.spatialGrid.cellSize`（既定 64px）。
- **候補の絞り込みのみ**を担い、最終判定（円/矩形/距離）は BattleScene 側が候補に対して厳密に行う。
  「同じセルにいるだけ」で命中扱いにはしない。
- **差分更新**: 敵が別セルへ移動したときだけ所属を付け替える（毎フレーム全消去・再登録はしない）。
  死亡/非アクティブ化・プール返却で `remove`、再利用で `insert`（Pool フック経由）。Scene 終了で `clear`。
  途中再開は敵を復元せず時間経過から再スポーンするため、グリッドは自然に再構築される。
- **結果順の一致**: 候補は出現順連番 `_seq`（=プール Set 順）で整列してから判定する。これにより
  空間グリッドと旧総当たりで**候補集合と走査順が完全一致**し、貫通/連鎖/感染/撃破/統計/安全上限の
  結果が変わらない（`tests/spatial-nonregression.mjs` で決定論的に検証）。
- **ボスの扱い**: ボスは単一の大型オブジェクトのためグリッドには入れず、各検索で個別に追加する
  （旧実装と同一、O(1)）。召喚された雑魚は通常敵としてグリッドに載る。
- **移行した処理**: 火球の最寄り敵/弾の命中候補/爆発範囲/火柱/燃える軌跡/周回する炎/隕石の着弾と
  密集地点/業火弾幕の追撃・連鎖/煉獄噴火の引き寄せ/永劫火界の範囲・炎上感染先/死亡時爆発/
  オート移動の危険敵/経験値ジェムの近傍。**据え置き**: プレイヤー↔敵接触・ボス弾↔プレイヤー
  （単一点走査で軽量なため）・炎上「発生源」の走査（全敵から炎上中を集める性質上）・`randomEnemies`。

## 性能計測・デバッグ（M5-A・`?debug=1` のみ）
- **性能パネル（F2）**: FPS/平均/最低・フレーム時間・敵/ボス/味方弾/敵弾/ジェム数・AoE/演出tween・
  抑制数・プール使用/待機/新規/再利用/返却・使用セル数・検索回数/候補数/厳密判定数・
  旧総当り比較回数 vs 空間比較回数と**削減率**を 0.5 秒ごとに更新（毎フレーム更新しない・計測は加算のみで軽量）。
- **グリッド可視化（F3）**: 使用中セルを密度色で塗る。
- **空間グリッド ON/OFF**: F1 デバッグメニューで切替（ON 復帰時に全対象で再構築）。旧方式は比較用に限定し、
  ゲームロジックは二重管理しない（候補集めのみ分岐、下流の判定は共通）。既定は ON。
- **実行時セルフチェック**: `window.RFS_BATTLE.spatialSelfCheck(n)` が現在の生存敵で空間/総当たりの
  一致と削減率をその場で返す（実ブラウザでの非回帰確認用）。

## パフォーマンス方針
- 最寄り敵検索は一定間隔（120ms）で実行。当たり判定候補は空間グリッドで取得（M5-A で総当たり解消）。
- パーティクル/敵/弾/AoE/追撃/連鎖/感染に毎フレームの安全上限（`balance.combatCaps` + 進化 `safetyCaps`）。
- タブ非表示中は `update` を停止（自動停止）。倍速時も物理/タイマー/Tween/ロジック dt を一括スケール。
- M5-B（保存系）は本 M5-A の範囲外。
