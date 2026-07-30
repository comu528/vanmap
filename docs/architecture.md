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

## スキル抽選・ジョブ・パッシブ（M6-A）
| Manager | 役割 | 状態 |
|---------|------|------|
| `SeededRandom` | seed+cursor の決定論乱数（保存/復元可）。候補抽選に Math.random を使わない | M6-A |
| `SkillDraftManager` | レベルアップ候補の抽選（ジョブプール/所持枠/所持/前提/排他/解放/レアリティ/重み/進化/追放/重複回避）。リロール/追放/スキップの状態管理と直列化 | M6-A |
| `PassiveManager` | 所持パッシブの level 管理と modifier 共通集計（damage/cooldown/area/duration/…）。active が最終値を取得する共通経路 | M6-A |
| `DataManager.draftCatalog()` | active(skills)+passive を統合した抽選カタログ（category/rarity/weight/maxLevel/jobs/isCommon/prereq/conflict/unlock） | M6-A |

- **分離**: 抽選ロジックは巨大化しがちな LevelUpScene/SkillManager へ集約せず `SkillDraftManager` へ分離。UI(LevelUpScene) は表示と操作のみ。
- **決定論**: `active_run.draftState`（seed/cursor/levelUpSequence/currentDraftId/currentCandidates/各残数/banishedSkillIds）を保存。
  レベルアップ画面を開いた時点で候補を保存し、再読込しても同じ候補を表示（引き直し不可）。リロール/追放時のみ cursor を進める。
- **所持枠**: 新規周回 Active `job.baseActiveSlots(+魂炎 activeSlots)` / Passive `job.basePassiveSlots`。旧 active_run が新枠を超過する場合は
  その周回に限り所持数まで枠を引き上げ（＝新規 active 禁止・既存は削除しない）。
- **パッシブ適用**: `SkillBase.stats` が area/duration を、`dealDamage` が damage を、`SkillBase/EvolvedSkillBase.update` が cooldown を乗算。
  パッシブ未取得（倍率1）では M5-B 以前と完全に同一（キャッシュは熟練度＋パッシブ version で無効化）。
- **進化**: 従来の EvolutionManager（条件判定）+ EvolutionScene（演出）は不変。抽選は canEvolve を満たす基礎スキルを高優先度の進化候補として提示。

## 火の魔女スキル拡張（M6-B）
既存の抽選/枠/パッシブ/進化基盤（M6-A）と空間グリッド/プール（M5-A）を再利用し、火の魔女専用 active 10種・進化5種を追加する。
新しい戦闘挙動（追尾/連鎖/刻印/召喚/防御）は既存経路に**分岐を足すだけ**で、既存5 active・3進化のコードと性能は変更しない。

| 追加/変更 | 役割 |
|-----------|------|
| `src/skills/*Skill.js`（15新規） | 各スキルの発動・命中判定は `combat.*`、演出は `effects.*`。データ駆動（`levels`/`skillCaps`）・cleanup 実装 |
| `Projectile`（拡張） | homing/generation/chain/split/tag/element/behavior フィールドを追加。`_clearState()` で全消去し安全に再利用。`update` で追尾操舵＋撃破後の再ターゲット |
| `Enemy._mark` | 起爆刻印の状態（プール再利用時にクリア）。`BattleScene` が刻印付与/起爆/連鎖拡散を管理（visited＋世代/拡散上限＋`_explosionBudget`） |
| `Player.takeDamage`（改修） | 防御パイプライン（無敵→障壁→HP→致死時 不死鳥）。scene フック `onBarrierBlock`/`onPhoenixRevive` と状態オブジェクト `player._barrier`/`player._phoenix` をスキルと共有 |
| `BattleScene`（拡張） | `dealDamage` タグ付与＋刻印進行、combat API 追加（`nearestEnemyExcept`/`enemiesInRadius`/`skillCap`/`markEnemy`/`markedCount`）、`chainDetonate`/`_spreadMark`/`_splitLance`/`_chainHit`、`computeEvolvables` が active→passive の `levelOf` を渡す、`restoreFromRun` が `skillRuntime` を復元、F4 デバッグ |
| `DataManager.skillCap(name,quality,fallback)` | `balance.skillCaps`（品質別）を参照する共通アクセサ。上限をコードへ散在させない |
| `EvolutionManager.canEvolve(...,levelOf)` | 補助条件に passive を含められるよう任意の `levelOf` を受け取る（未指定は従来どおり active のみ） |
| `SkillManager` | 15新クラスを REGISTRY へ登録。`dispatchKill`/`serializeRuntime`/`restoreRuntime`/`recordExtra` を追加（新スキル統計・不死鳥/障壁CD の保存復元） |

- **防御処理順**: 無敵 → 障壁（軽減＋反撃 1被弾1回）→ HP → 致死時 不死鳥（1致死1回・回復＋一時無敵）。一時停止中は CD が進まず、再読込で CD を巻き戻せない。
- **無限再帰の防止**: 連鎖/分裂/感染/起爆は visited 集合＋明示的な世代・拡散上限＋毎フレーム `_explosionBudget` で必ず停止する。刻印起爆のダメージは `isMarkDetonation` タグで刻印を再進行させない。
- **性能上限**: `balance.skillCaps`（`maxHomingWisps`/`maxFlameLances`/`maxSummons`/`maxActiveVortices`/`maxMarks`/`maxChainTargets`/`maxChainDepth`/… を品質別に）を毎フレーム予算化。到達しても戦闘ロジックは停止しない。低品質でも命中/刻印/不死鳥/障壁/ボス予告/プレイヤー/敵/敵弾は視認できる。
- **保存**: 新スキル/レベル/進化/枠/候補/追放/不死鳥CD/障壁CD/ランタイム/統計は `active_run.skillRuntime`（`SkillManager.serializeRuntime`）で保持。追加フィールドのため **save_version は 6 のまま**（構造変更が無いので不要な版上げをしない）。
- **拡張口（次のジョブレベル成長）**: ジョブごとの活性/受動プール・初期スキル・枠は `jobs.json` で拡張でき、`skillCaps` は品質別に増減できる。将来のジョブ育成特典は `profile.jobProgress`（M6-A 拡張口）に載せる想定。

## 火の魔女ジョブ育成（M6-B の拡張口 `profile.jobProgress` を実装）
周回をまたぐジョブレベルを追加する。効果は火の魔女使用中の周回のみ有効で、他ジョブ・未定義ジョブでは全て恒等（M6-B 以前と一致）。数値は `data/job-progression.json` に集約する。
戦闘レベル（`battleLevel`: 周回ごとにLv1・経験値ジェムで上昇・周回終了でリセット・スキル候補用）とジョブレベル（`jobLevel`: `profile.jobProgress[jobId].totalXp` から算出・周回/転生をまたいで維持・恒久強化）は**別体系**。

| 追加/変更 | 役割 | 状態 |
|-----------|------|------|
| `JobProgressionManager` | ジョブXP・ジョブレベル・周回報酬・二重獲得防止を統括（DOM/Phaser 非依存の純粋ロジック）。`totalXpForLevel`(累計XP曲線)/`levelForTotalXp`/`progress`/`computeRunXp`/`awardRun`/`milestonesBetween`。`jobLevel` は保存せず `totalXp` から都度算出 | M6-C |
| `JobModifierManager` | ジョブレベルから補正を **`resolve`** して凍結し周回中固定。ダメージ/範囲/CD/投射/抽選/リロール/残響の各アクセサ。`serialize`/`restore`（`active_run` へ）。火の魔女以外・Lv1 は恒等 | M6-C |
| `BattleScene`（拡張） | 周回開始/再開で `resolvedJobModifiers` を適用。`dealDamage` にジョブ火ダメージ乗算、`aoe()` に火範囲、共通シグナル `_onSkillCast`/`_triggerEcho`（残響） | M6-C |
| `BattleManager` | リザルト確定時に `JobProgressionManager.awardRun` で **まとめて**ジョブXPを付与（戦闘中は付与しない）。`runId` で二重獲得防止。付与→`SaveCoordinator` 経由で profile 保存 | M6-C |
| `BaseScene.buildJob()` | 拠点「ジョブ育成」タブ（Job Lv/XPバー/統計/到達報酬一覧）。周回開始時に補正を解決して `active_run` へ凍結 | M6-C |
| `ResultScene` | 今回獲得 Job XP/難易度倍率/Job Lv 変化/XPバー増加/複数レベルアップ/新解放報酬/Lv100到達/二重獲得済みの安全表示 | M6-C |
| `SkillBase` / `Projectile` | `passiveCooldownMult`/`passiveAreaMult` にジョブ補正を合流、`fireProjectileCount`（Lv80 発射数+1）、`echoCast`（残響の追加発動＝既定 `fire` 再実行）、`Projectile.reset` に投射速度（Lv10）と echo 威力同期 | M6-C |

- **XP曲線**: `totalXpForLevel(L) = quad*(L-1)^2 + lin*(L-1)`（quad=25/lin=75）。単調増加・Lv1=0・Lv100頭打ち・超過 totalXp は保持・負数/NaN/Infinity は 0 扱い・巨大 XP でもループは `levelCap` で停止。
- **周回XP**: `survivalSec*1.2 + min(normalKills,2000)*0.08 + eliteKills*4 + bossKills*60 + victoryBonus(200/0)` に難易度倍率(1.0/1.25/1.55/1.90/2.30)を乗じ `floor`。全て `xpReward` に分離。
- **凍結（周回開始時のレベル固定）**: 補正は周回開始時のジョブレベルから解決して `active_run`（`jobId`/`jobLevelAtStart`/`jobTotalXpAtStart`/`resolvedJobModifiers`/`jobProgressionVersion`/`jobRuntime`=残響カウンター）へ保存。
  周回中に profile 側レベルが変わっても進行中周回へは反映せず、途中再開は `active_run` の凍結値を使う。ジョブXPはリザルト確定後に profile へ加算し、次の周回から新レベル適用。

### modifier 適用順（`docs/game-design.md` と一致）
1. JSON基礎値（`skills.json` levels）→ 2. 固定値加算/整数補正（発射数など）→ 3. 同カテゴリ内の加算倍率（熟練度・パッシブ）→
4. カテゴリ間の乗算倍率（ジョブレベル基本成長・到達報酬）← `JobModifierManager` → 5. 安全下限/上限（CD下限・`skillCaps`）→ 6. 品質別生成上限。
- ダメージ乗算はすべて乗算合成: `base × fireDamageMult × (isDoT?dotDamageMult) × (isExplosion?explosionDamageMult) × (isEvolved?evolvedDamageMult)`。fire 以外の属性には一切適用しない。fire+DoT は両方が掛かる（意図した乗算）。
- 具体経路: 基礎値/熟練度/パッシブ area・duration → `SkillBase.stats`。ジョブ火範囲 → stats(radius/explosionRadius)＋`passiveAreaMult`。ダメージ（恒久/魂炎→パッシブ魔力増幅→ジョブ火ダメージ→残響）→ `dealDamage`。
  CD（基礎×熟練度→パッシブ高速詠唱×ジョブLv20/90、下限クランプ）→ `SkillBase.update`/`passiveCooldownMult`。発射数（パッシブ＋ジョブLv80）→ `fireProjectileCount`。投射速度（ジョブLv10）→ `Projectile.reset`。抽選重み（ジョブLv70）→ `SkillDraftManager`。
  **Lv1 かつ到達報酬なしで M6-B 以前と完全一致（恒等）**。

### 残響詠唱（共通発動イベント）
- 共通シグナル `SkillManager.recordCast` → `BattleScene._onSkillCast(id)` を起点に `JobModifierManager.registerCast()` がカウント、閾値到達で `BattleScene._triggerEcho`。追加発動は `SkillManager.requestEchoCast` → `skill.echoCast(ctx)`（既定は `fire` 再実行）。威力は `scene._echoScale`（60%/100%）。
- 対象: active・fire・攻撃目的・`isEcho=false`・`isDefensive=false`・`isReactive=false`。対象外: passive/障壁/不死鳥/刻印二次起爆/DoT各tick/連鎖/分裂/召喚物の各射撃/残響発生分。追加発動はカウンターを進めず（`echoCast` は `recordCast` を呼ばない）、`_inEcho` ガードで残響から残響を出さない。1フレーム上限 `balance.combatCaps.maxEchoPerFrame`(=4)。一時停止中は update 停止で進まない。

### 保存システム統合（M5-B 非回帰）
- ブラウザ保存/フォルダ保存/JSON 入出力/バックアップ/競合検出/複数タブ/保存キューを壊さない。比較/競合/インポート表示に 選択ジョブ・火の魔女ジョブレベル・`jobTotalXp` を追加（`StorageAdapter.summarize`/`SaveConflictResolver.extractMeta`）。`jobProgress` はエクスポート/インポート/バックアップ/復元/競合解決で失われない。
- `profile.jobProgress` は M6-A の空 `{}` を加算的に拡張（`jobId` キーで将来の複数ジョブへ）。`profileSchema.js` の `safeJobProgress` がプロトタイプ汚染キー除外・負数/非有限を安全化。`totalXp` は保存し `jobLevel` は保存しない。**`save_version` は 6 のまま**（加算的追加で既存移行が安全に既定を補える）。転生でリセットしない。

## 火の魔女スキル拡張・第2波（M6-D）
M6-A（抽選/枠/パッシブ/進化）・M6-B（追尾/連鎖/刻印/召喚/防御・`Projectile` 拡張・`skillCaps` 品質別予算）・M6-C（ジョブ補正・共通発動シグナル `_onSkillCast`/残響）を **再利用** し、火の魔女専用 active を10種・進化を5種追加する。既存15 active・8進化・4 passive・`dealDamage`/`aoe()`/防御パイプラインには **分岐を足すだけ** で、コードと性能は変更しない。結果は active 25種・進化13種・passive 4種。

| 追加/変更 | 役割 | 再利用元 |
|-----------|------|----------|
| `src/systems/CastPolicy.js`（新規・純ロジック） | `resolveCastMeta(def)` が echo/clone ポリシー＋メタを解決、`defaultCastContext`/`replayContext`/`canCastTriggerEcho`/`canCloneCopy` が「normal 由来のみ1世代」の再帰不可判定を提供。DOM/Phaser 非依存 | M6-C の残響（`_triggerEcho`）を一般化 |
| `Player.spendHealthCost(amount)` | 血炎契約用の HP コスト。`takeDamage` と完全分離（障壁/無敵/不死鳥で防がれず・敵ダメージ統計に含めず・最低HP1保証・安全HP以下不発）。`combat.spendHealthCost` 経由 | M6-B の防御パイプラインを迂回する別経路 |
| `Player` ダッシュフック（`onDashStart/Move/End`） | ダッシュの開始/移動/終了を `scene.onPlayerDash(kind,player)` へ通知（→ `skills.dispatchDash`）。既存ダッシュ/autoDash/無敵を壊さず入力処理へ分岐を散在させない | 既存ダッシュ実装へ共通フックを追加 |
| `Projectile`（拡張） | 後方互換の吸収情報 `absorbable`/`absorbValue`/`projectileKind`/`ownerType`/`isBossProjectile`/`isTelegraph`/`isBeam`/`consumedByAbility` と反射 `bounceCount` を追加。`reset`/`_clearState` で完全初期化 | M6-B の Projectile 拡張（homing/chain/tag）に同居 |
| `BattleScene._onSkillCast(id)` | 発動起点。normal 由来かつ複製可能な発動を `_lastClonableCast` に記録。Job残響は `canTriggerEcho` のみカウントし `_triggerEcho` へ | M6-C の `_onSkillCast`/`recordCast` を拡張 |
| `BattleScene.performClone(power)` / `_runReplay` | 直近の複製可能発動を低威力で安全に再実行。`_runReplay` が `castContext` と威力倍率を張り、scene が世代・毎フレーム予算を管理 | M6-C の `requestEchoCast`/`_echoScale` と同じ再実行機構 |
| `BattleScene.absorbBossBullets(x,y,r,max)` | 範囲内の吸収可能なボス弾を最大数まで吸収し `{absorbed,value}` を返す。予告/ビーム/接触/吸収不能/消費済みは除外・`consumedByAbility`＋release で二重吸収防止 | M5-A SpatialGrid で候補を絞り最終判定は厳密に |
| `BattleScene._ricochetBounce` / `_spendFrameBudget(name,capName)` | 跳炎弾の反射処理と、毎フレーム予算の共通消費（`combat.frameBudget`）。到達しても戦闘ロジックは停止しない | M6-B の `_explosionBudget`/`skillCap` を一般化 |
| `BattleScene.toggleWave2Debug()`（F6） | 新スキル検証パネル（`?debug=1` のみ・F1〜F5 非競合）。ランタイムのみで profile を破壊・保存しない | M6-C の F5 デバッグと同系 |

- **再帰の停止保証**: echo/clone は `CastPolicy` の「normal→echo / normal→clone を各1世代のみ・echo→*/clone→* は不発」ルールと origin ガードで必ず停止する（`maxCopyGeneration=maxEchoCloneGeneration=1`）。残響→分身→残響 / 分身→残響→分身 の循環を禁止。
- **custom ポリシー**: 血炎契約は複製時 HP を再消費せず、弾喰い炉はチャージを再消費せず、攻撃部分のみ複製する。`forbidden`（灰燼分身/爆炎歩法）は移動/分身増殖/危険な runtimeState 再展開を防ぐため一切コピーしない。
- **空間グリッド/プール/性能上限**: 近傍・範囲・連鎖・吸収・集中攻撃は M5-A SpatialGrid で候補を絞り、最終判定（線分距離/扇形/円/矩形/接続距離/光線幅/波位置）は各挙動側で厳密に行う（ボスは個別追加）。跳炎弾/地雷/警告/分身/複製弾/放出弾/炎波/鎖線/軌跡/光点/炎剣/軍勢/吸収核 は `PoolManager` または配列再利用で、`skillId/owner/target/visited/networkId/generation/origin/charge/bounceCount` 等を再利用時に完全初期化。Scene/Battle 終了・進化置換・スキル削除で残留させない。
- **性能上限**: `balance.skillCaps` に品質別の新キー（`maxActiveBeams`/`maxMines`/`maxRicochetProjectiles`/`maxClones`/`maxBloodfireProjectiles`/`maxFurnaceCharge`/`maxScreenEdgeWaves`/`maxTethers`/`maxAshLegionUnits`/`maxCopyGeneration` ほか）を追加。上限到達時は 判定・主要挙動→主要表示→補助粒子/装飾 の順に削減し、地雷位置/光線本体/斬撃範囲/血炎攻撃/炉チャージ/波/鎖接続/ダッシュチャージ/ボス予告/敵弾/プレイヤーは消さない。
- **保存**: 新スキルの CD/チャージ/分身数/ダッシュチャージ等は `active_run.skillRuntime`（`SkillManager.serializeRuntime`）へ加算的に保存し、`restoreFromRun` が復元する。個々の弾/地雷/分身/鎖の位置は保存せず レベル＋runtimeState から再構築。再読込での悪用（CD回復/チャージ複製/二重生成/再放出）を remaining 値の保存復元で防止。**`save_version` は 6 のまま**。

## 火の魔女スキル拡張・第3波＋全スキル監査（M6-E）
M6-A（抽選/枠/パッシブ/進化）・M6-B（戦闘挙動・`Projectile` 拡張・`skillCaps` 品質別予算）・M6-C（ジョブ補正・共通発動シグナル `_onSkillCast`/残響）・M6-D（`CastPolicy` の残響/分身再帰防止）を **再利用** し、火の魔女専用 active を5種・進化を5種追加する。あわせて**全 active30種・進化18種を監査**し、残響/分身・主発動イベント・ダメージタグ・Lv80発射数+1 の扱いを各定義へ明示する。既存25 active・13進化・4 passive のコードと性能は変更しない。結果は active 30種・進化18種・passive 4種。**`save_version` は 6 のまま**。

| 追加/変更 | 役割 | 再利用元 |
|-----------|------|----------|
| `src/systems/SkillAudit.js`（新規・純ロジック） | def から `castSummary`/`echoStatus`/`cloneStatus`/`appliesLv80ProjectileCount`/`primaryTags`/`castBadge` を解決。castMode/echoPolicy/clonePolicy/canTriggerEcho/canBeCopiedByClone/mainCastEvent/lv80ProjectileTarget を一元管理。DOM/Phaser 非依存 | M6-D の `CastPolicy`（複製方式）を **監査/表示/Lv80対象**へ一般化 |
| `src/skills/*Skill.js`（新規10: active5＋進化5） | 各スキルの発動・命中判定は `combat.*`、演出は `effects.*`。`serializeState`/`restoreState`・cleanup 実装。REGISTRY 登録 | M6-B/M6-D のスキルクラス実装 |
| `BattleScene` 敵死亡イベント履歴 | `retainDeathEvents`/`releaseDeathEvents`（墓標系所持時のみ記録）・`recentDeathEvents`/`consumeDeathEvent`（同一死亡は1回だけ消費）・上限 `maxDeathEventsTracked`/`maxDeathEventsPerFrame`。死亡情報 `{id,x,y,enemyType,isElite,isBoss,killedBySkillId,timestamp,frameId,consumed}` | 既存の撃破処理へ**記録フックを足すだけ**（統計/残り火/Job XP/ジェムは不変） |
| `BattleScene._burningIndex`（炎上索引） | `Enemy.ignite` で登録、消火/死亡/プール返却/Scene終了で解除。`burningCount()`/`burningEnemies()`（ボス炎上も1体）。`combat.ignite(e,ms,gen)` が付与＋登録 | M5-A の「炎上発生源の全敵走査」を**軽量索引**へ置換（共鳴が全敵走査を避ける） |
| `Enemy`/`Boss`（拡張） | `ignite`/`ignited` を共通化（Boss にも追加）。プール再利用時に索引登録を解除 | 既存の炎上実装へ索引登録/解除を一元化 |
| `combat` API 追加 | `retainDeathEvents`/`releaseDeathEvents`/`recentDeathEvents`/`consumeDeathEvent`/`burningCount`/`burningEnemies`/`ignite`/`registerBurning`/`worldBounds` | M6-B/M6-D の combat 拡張に同居 |
| `SkillManager.recordCast`（監査） | 主発動イベントを **攻撃サイクル単位のみ** に統一。`orbiting_flame` を一定間隔スロットル、`fire_spirit` を一斉射撃サイクルで記録 | M6-C の `recordCast`/`_onSkillCast` を監査基準へ整流 |
| `LevelUpScene`（拡張） | スキルカードへ「残響○/◑/× 分身○/◑/× Lv80+ ·主要タグ」の短い記号行（`SkillAudit` から解決） | M6-D の cast メタ表示を UI へ露出 |
| `BattleScene.toggleWave3Debug()`（F7） | 新スキル検証パネル（`?debug=1` のみ・F1〜F6 非競合）。ランタイムのみで profile を破壊・保存しない | M6-D の F6 デバッグと同系 |

### castMode / echoPolicy / clonePolicy / Lv80 メタ（`SkillAudit` が一元解決）
- 各 active/進化定義に `castMode`（periodic/cooldown/continuous/reactive/defensive/movement/resource）・`echoPolicy`/`clonePolicy`（standard/custom/forbidden）・`canTriggerEcho`/`canBeCopiedByClone`・`echoDescription`/`cloneDescription`・`mainCastEvent`・`lv80ProjectileTarget` を持たせる。コードへ散在させず `SkillAudit` から解決する（UI・デバッグ・Lv80対象判定・監査テストが同じソースを見る）。
- **Job Lv80「発射数+1」の対象**は独立弾を撃つ通常 active のみ（`fireball`/`flame_lance`/`scatter_flame`/`homing_wisp`/`ricochet_ember`/`core_overdrive`）。地雷/墓標/分身/光線/陣/亀裂/波/召喚/鎖/共鳴段階/熱量段階/**進化**（単一形態）は対象外。判定は `SkillAudit.appliesLv80ProjectileCount`（データ `lv80ProjectileTarget`）。

### 主発動イベントの統一方針（残響/分身の起点）
- **`recordCast` は攻撃サイクル単位のみ**行う。DoTの各tick・連鎖の各対象・分裂弾・爆発の各対象・個別起爆・召喚の通常射撃・共鳴の各連鎖・オーバーヒート開始終了では recordCast しない。これにより残響（M6-C）・分身複製（M6-D）の起点が「1回の攻撃サイクル」に揃い、多重カウントや取りこぼしが起きない。
- **`orbiting_flame` の監査修正**: 接触tick毎の recordCast を廃し、主発動を一定間隔にスロットルする（**ダメージは接触ごとのまま＝挙動不変**）。echo/clone は炎輪パルスの再現（custom）。
- **`fire_spirit` の監査修正**: 召喚の一斉射撃サイクルを主発動として記録する（個々の通常射撃では記録しない）。echo/clone は各精霊の追加一斉射撃（custom・精霊は増えない）。
- **不死鳥の羽/炎の障壁**: 防御専用として `echoPolicy`/`clonePolicy=forbidden` を明示（従来も recordCast していないため挙動変更なし）。
- **ダメージタグ**: 火属性補正は全 fire、DoT補正は DoT のみ、爆発補正は爆発のみ、進化補正は進化のみ、弾速/数補正は対象スキルのみ。echo/clone 倍率は `dealDamage` で1回だけ適用（二重適用しない）。

### 性能上限・保存
- **性能上限**: `balance.skillCaps` へ品質別の新キー（`maxDeathEventsTracked`/`maxDeathEventsPerFrame`/`maxFuneralPyres`/`maxPyreEruptionsPerFrame`/`maxMagmaVeins`/`maxMagmaSegments`/`maxMagmaIntersections`/`maxTriArrays`/`maxArrayTicksPerFrame`/`maxResonanceTargets`/`maxResonanceChains`/`maxResonanceExplosions`/`maxOverdriveProjectiles`/`maxOverdriveCastsPerFrame`/`maxMausoleums`/`maxHexagramArrays`/`maxHexagramBeams`/`maxDoomsdayProjectiles`/`maxDoomsdayExplosions`/`maxBurningEnemyIndex`/`maxMainCastEventsPerFrame`）を追加。`combat.frameBudget`/`DataManager.skillCap` で毎フレーム予算化。**上限到達でも攻撃判定は消さず、装飾を先に削る**。近傍/範囲/連鎖/交差/共鳴は M5-A SpatialGrid で候補を絞り、最終判定（点in三角形/線分距離/円/接続距離）は各挙動側で厳密に行う（ボスは個別追加）。
- **保存**: 各スキルの runtimeState を `active_run.skillRuntime`（`SkillManager.serializeRuntime`）へ加算保存し `restoreFromRun` が復元（墓標=CD/炎脈=CD/三角=CD/共鳴=CD〈段階は再開時に再計算〉/炉心=heat/overheatLeft/cdLeft/終末=heat/overheatLeft/doomLeft/cdLeft）。個々の墓標/亀裂/陣/弾の位置は保存せず レベル＋runtimeState から再構築。再読込での悪用（熱量初期化/オーバーヒート解除/終末再開始/CD全回復/墓標二重生成）を remaining 値の保存復元で防止。**`save_version` は 6 のまま**。

## 通常プレイ整備・バランス検証基盤（M6-F）
火の魔女は M6-E で完成済み（active30/進化18/passive4/Job Lv1〜100）。M6-F は**新スキルを追加せず**、抽選/枠/パッシブ/進化・戦闘挙動・
ジョブ育成・残響/分身（M6-A〜M6-E）を **現在の正** としたまま、検証基盤を追加する。すべて **Phaser 非依存の純ロジック**（Node テスト可能）で、
**外部送信・自動調整はしない**。**`save_version` は 6 のまま**（`profile.balanceTelemetry` を加算的追加）。

| 追加/変更 | 役割 | 依存 |
|-----------|------|------|
| `src/systems/SkillCatalog.js`（新規・純ロジック） | 実データから active30/passive4/進化18のカタログ生成（`buildCatalog`）・進化レシピ（`evolutionRecipes`）・進化相手 id（`evolutionPartnerIds`）・**孤立/未登録/参照不整合の検出**。SkillManager の `registeredSkillIds()`/`skillsWithRuntimeState()` を注入して実装/保存の有無を判定 | `DataManager`（skills/evolutions/passives/jobs）・`SkillAudit`（同ソース共有・UI 専用判定を作らない） |
| `src/systems/DraftBalanceAnalyzer.js`（新規・純ロジック） | 決定論的な抽選シミュレーター。**本番の `SkillDraftManager`+`SeededRandom` を直接駆動**（抽選ロジックを複製しない）。方針・枠4/6/8・候補3/4・Job Lv・多数シードで進化到達を計測 | `SkillDraftManager`/`SeededRandom`/`SkillCatalog` |
| `src/systems/CombatTelemetry.js`（新規・純ロジック） | 1周回のローカル戦闘テレメトリ（外部送信なし）。スキル別 casts/hits/kills/damage/DoT/爆発/projectile/summon/echo/clone/上限/防御値・DPS・damageShare・FPS（平均/最低/p95 は1ms刻みヒストグラム）。防御値 = blockedDamage+healed+absorbedBullets×25+lethalAvoided×1000 | `BattleScene`（`update` で noteFrame・スキル取得/進化を記録） |
| `src/systems/RunBalanceSummary.js`（新規・純ロジック） | `profile.balanceTelemetry` の集計・整形（**immutable・例外を投げない**）。通常周回=summaryBySkill(上限80)＋recentRuns(最大10)、**debugRun=debugRuns(最大10) へ分離**・softMaxBytes=262144 | `CombatTelemetry` の出力・`profileSchema`（型安全な取り込み） |
| `src/systems/BalanceWarnings.js`（新規・純ロジック） | 集計から**開発用の警告のみ**生成（**自動調整しない**）。しきい値 `data/balance-thresholds.json`・最低サンプル数 `minSamples` 未満は警告しない | `RunBalanceSummary`・`DataManager`（balance-thresholds） |
| `src/systems/BalancePlaytest.js`（新規・純ロジック） | 通常プレイ検証モードの設定・オーバーライド解決（**profile を一切変更しない・常に debugRun**） | `BattleScene`（F8）・`DataManager` |
| `SkillDraftManager`（M6-A 拡張・決定論維持） | `_synergyMult` がレアリティ重みへ乗算。`ctx.synergy={partnerIds,battleLevel}`。`draftsSinceProgress`（pity）を保持・保存、進化成立で `markProgress()` リセット。**`synergy=null` で旧挙動と完全一致（byte-identical）** | `data/skill-config.json` の `synergy`・`active_run.draftState` |
| `BattleScene`（拡張） | 周回開始で SkillCatalog 構築・進化レシピ保持、`buildDraftCtx` に synergy 付与、進化成立で `markProgress()`。CombatTelemetry を保持し FPS/上限到達/スキル取得・進化を記録、周回終了で `finalizeTelemetry`→`RunBalanceSummary.applyRun`。**F8**（Balance Playtest）・F4〜F8 使用周回を `markDebugRun` | 上記モジュール・`ResultScene`・`BaseScene` |

### シナジー補助の決定論
`SkillDraftManager` はレアリティ重みへ `_synergyMult` を**乗算**するのみで、**乱数の消費順序を変えない**。同 seed・同状態なら
補助 ON/OFF どちらでも決定論的に再現でき、`synergy=null`（補助なし）は旧挙動と **byte-identical**（`draft-balance-simulation` で検証）。
補助上限（`synergyAssistMaxMultiplier=2.0`・pity `noProgressMaxMultiplier=1.5`）と、legendary を common 並みに増やさない設計により、
「特定レシピを確定させない・レア出現率を壊さない」を保証する。`draftsSinceProgress` は既存の `draft.serialize` 経由で `active_run.draftState` に保存する。

### debugRun 分離・テレメトリの低優先保存
- **debugRun 分離**: F4〜F8 のデバッグ補正を使った周回は `markDebugRun` でマークし、`RunBalanceSummary` が `debugRuns`（通常統計と別）へ振り分ける。
  Balance Playtest（F8）は**常に debugRun**。通常統計（summaryBySkill＋recentRuns）へは混ざらない。ResultScene で「通常統計へ記録していません」と明示する。
- **低優先保存**: 周回終了時の `finalizeTelemetry`→`RunBalanceSummary.applyRun`→`profile.balanceTelemetry` 加算は、**主要セーブより低優先**で try/catch し、
  失敗しても**ゲーム進行・主要セーブ（残り火/JobXP/profile）を壊さない**。上限（80スキル/各10周/262144B）を超える分は捨てる。**`save_version` は 6 のまま**。

### F8（Balance Playtest）
`?debug=1` の戦闘で F8（F1〜F7 と非競合）。`BalancePlaytest.resolve` が seed/難易度/品質/速度/Job Lv/active枠4-6-8/候補3-4/リロール/
恒久強化(通常profile|全無効)/熟練度(通常|無効)/Job補正(通常|無効)/戦闘時間(5分|1分|10分) のオーバーライドを解決し、
「検証開始」で**一時状態のみ初期化**（スキル自動付与なし・ゴッドモード無効）。**profile の通貨/進行/JobXP/クリアは不変**。

### fallback 定数の JSON 移行
`doomsday_core`（`overheat.heatAccelPct=0.5`/`config.doomFireMs=130`/`config.doomBlastMs=420`）・`tri_flame_array.config.edgeWidth=8`・
`hexagram_inferno_array.area.outerWidth=10`/`beamWidth=12`・`orbiting_flame.config.castPulseMs=500`・`fire_spirit.config.summonPulseMs=900` を JSON へ移した。
**コードに残る同名の `*_SAFE` 定数はゲームバランス値ではなく、「JSON 欠落時の NaN/undefined 回避のための安全既定」**であり、通常は JSON 側が使われる（重複定義ではない）。

## 2人目のジョブ・汎用状態異常/凍結基盤（M7-A）
火の魔女（active30/進化18/passive4/Job Lv1〜100）を**不変**のまま、2人目のジョブ **氷術師（frost_mage・氷属性）** と、
**汎用の状態異常フレームワーク**を追加する。M6-A〜M6-F の抽選/枠/パッシブ/進化/ジョブ育成/検証基盤を**現在の正**として再利用し、
新しい状態異常（冷気/凍結/耐性/氷砕脆弱）と氷スキルの挙動を共通経路へ**分岐を足すだけ**で実装する。すべて Phaser 非依存の純ロジックを
中核に置き、Node でテスト可能。**火と氷の属性反応は未実装**（炎上と冷気/凍結は独立共存）。**`save_version` は 6 のまま**。詳細は
`docs/jobs.md`・`docs/status-effects.md`。

| 追加/変更 | 役割 | 再利用元 |
|-----------|------|----------|
| `src/systems/StatusEffectRegistry.js`（新規・純ロジック） | `data/status-effects.json` の状態定義・設定（freeze/bossFrostbreak/shatter）を保持し、kind/索引可否/対象エンティティ/ボス方針/冷気プロファイルを照会する。数値はデータが正 | 新規（M6-E の炎上索引を汎用化） |
| `src/systems/StatusEffectManager.js`（新規・純ロジック） | 状態のランタイム適用・**索引**（`entitiesWithStatus`/`countStatus`）・更新（冷気減衰/期限切れ）・解除を集約。**状態異常専用 `SeededRandom`** で凍結判定（cursor を `active_run` へ保存）。索引上限（`maxStatusIndexEntries`）到達時は新規付与をスキップ | M6-E の `_burningIndex` を共通 Set 索引へ一般化 |
| `src/systems/FreezeSystem.js`（新規・純ロジック） | 冷気→減速率・凍結確率式・確定閾値・凍結持続・ボス氷砕ゲージ成長/上限・粉砕ダメージ（上限つき）の純計算。絶対零度(Lv100)の閾値低下/凍結延長を反映 | 新規（Math.random 不使用） |
| `JobModifierManager`（拡張） | fire 専用から**複数ジョブ・複数属性**へ拡張。`primaryElement`（火=fire/氷=ice）一致時のみ属性ダメージ補正を適用。氷用フィールド（`statusPowerMult`/`shatterDamageMult`/`chilledDamageMult`/`frozenDamageMult`/`shatterOnFrozenKill`/`absoluteZero`）を追加。旧 `fireDamageMult`/`fireAreaMult` は `coerceResolved` で移行（火は非回帰） | M6-C の `JobModifierManager` を一般化 |
| `Enemy`/`Boss`/エリート（拡張） | 状態フィールド（`_chill`/`_chillSlow`/`_frozenUntil`/`_freezeImmuneUntil`／ボス `_frostGauge`/`_frostBreaks`/`_frostbreakVulnUntil`）を保持。`effectiveSpeed` が `_chillSlow` を読む。`onFreezeStart`/`onFreezeEnd` フック。プール返却/死亡で `StatusEffectManager.onRelease`/`onDeath` が索引・状態を掃除 | 既存の炎上実装へ冷気/凍結を追加 |
| `BattleScene`（拡張） | 周回開始で registry/freezeSystem/statusManager を構築（品質別 cap を注入）、氷命中を `applyIceHit` へ、毎フレーム `update`、粉砕/ボス氷砕を per-frame 予算で処理。氷ダメージへ氷パッシブ・ボス氷砕脆弱(×1.15)を追加乗算。`jobElement`/`statusRng`/ボス frostbreak を保存・復元。F9 デバッグ | M6-E の combat 拡張・skillCaps 予算に同居 |
| `src/ui/HUD.js`（拡張） | ボス HP バー付近の**氷砕ゲージ**（氷術師のみ・ボス不在時は非表示・脆弱中は色変化） | 既存 HUD へ表示追加 |

### 状態異常索引と炎上の移行（互換ラッパー）
- **索引**: `StatusEffectManager` が `statusId -> Set<entity>` の索引を持ち、`chill`/`frozen`/`freeze_immunity`/`frostbreak_vulnerability` を
  登録・掃除する。灼熱共鳴/万象炎鳴が全敵走査を避けるための M6-E の炎上索引を一般化したもの。
- **炎上(burning)の移行**: 既存の火の魔女の炎上は `Enemy.ignite`/`combat.ignite` 互換経路を維持したまま、**索引だけ**を共通化する
  （`registerBurning`/`unregisterBurning` が `burning` 索引 Set を共有）。**burning は索引上限を課さない**（M6-E 挙動維持）。ダメージ/持続/
  灼熱共鳴/万象炎鳴/統計は不変。炎上と冷気/凍結は独立共存し、属性反応は行わない（M7-A では未実装）。

### 状態異常専用 SeededRandom（決定論）
凍結判定は `StatusEffectManager` が保持する専用 `SeededRandom` で行い、**cursor を `active_run.statusRng` へ保存**する。
候補抽選用の `draftState.seed` とは独立。再読込しても凍結の判定列が再現され、引き直しの不正ができない。`serialize()`/`restore()` で保存・復元。

### ダメージ適用順（M7-A で追記・氷属性を含む一般化）
1. JSON 基礎値 → 2. スキル Lv → 3. passive → 4. 熟練度 → 5. Job Lv 基本成長 → 6. Job 到達報酬 →
7. **状態対象ボーナス（chilled/frozen・氷 Lv40 凍結狩り）** → 8. 進化補正 → 9. echo/clone 倍率 → 10. 安全下限/上限。
- 乗算はすべて乗算合成。**氷ダメージには氷パッシブ（氷晶増幅）とボス氷砕脆弱（×1.15）を追加乗算**し、**火ダメージには適用しない**。
- `JobModifierManager.damageMultiplier(tags)` は `tags.element !== primaryElement` のとき 1 を返す（火補正を氷へ／氷補正を火へ誤適用しない）。
  凍結狩りは `frozen`/氷砕脆弱を優先し `chilled` と二重適用しない。

### 性能上限・保存
- **性能上限**: `balance.skillCaps` へ品質別の状態異常/氷スキルキー（`maxStatusApplicationsPerFrame`/`maxFreezeChecksPerFrame`/
  `maxFrozenEnemies`/`maxShattersPerFrame`/`maxShatterProjectiles`/`maxStatusIndexEntries`/`maxFrostShards`/
  `maxFrostNovaTargetsPerFrame`/`maxGlacialLances`/`maxPermafrostFields`/`maxPermafrostTicksPerFrame`/`maxIceWalls`/
  `maxIceWallSegments`/`maxIceWallCollisionsPerFrame`/`maxDiamondBlizzardProjectiles`/`maxAbsoluteZeroDomains`/
  `maxAbsoluteZeroShattersPerFrame`/`maxHeavenGlacierFragments`/`maxBossFrostbreaksPerFrame`）を追加。**到達しても判定・主要挙動は消さず装飾を先に削る**。
- **保存**: `active_run` へ `jobId`/`jobElement`/`resolvedJobModifiers`/`statusRng`（状態RNGの cursor）/ボス frostbreak 状態
  （`gauge`/`breaks`/`vulnRemainMs`）を保存。個々の敵の冷気/凍結/氷弾位置/凍土位置/氷壁位置は保存せず、再開時に安全に再構築する。加算的追加のため **`save_version` は 6 のまま**。

## 氷術師ビルド拡張・第2波（M7-B）
M7-A の状態異常/凍結基盤（`StatusEffectManager`/`FreezeSystem`）・複数ジョブ補正（`JobModifierManager`）と、M6-A〜M6-E の抽選/枠/パッシブ/進化・
`SkillAudit`（cast/echo/clone/Lv80 の一元解決）・`skillCaps` 品質別予算を **再利用** し、氷術師専用の active を **10種**・進化を **5種** 追加する。
火の魔女（active30/進化18）と氷術師の既存5 active・3進化は不変。結果は氷術師 **active15・進化8**。**冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路**を通し
（独自凍結タイマーなし）、**Math.random は不使用**（決定論・combat rng も未使用の index ベース／status RNG は `StatusEffectManager` 内）、draft RNG cursor は不変。**`save_version` は 6 のまま**。

| 追加/変更 | 役割 |
|-----------|------|
| `src/skills/*Skill.js`（新規15: active10＋evolution5） | 各スキルの発動・命中判定は `combat.*`、演出は `effects.*`。氷命中は既存 `applyIceHit` 経路。進化は `EvolvedSkillBase`（単一形態）。`serializeState`/`restoreState`・cleanup 実装 |
| `SkillManager` REGISTRY 登録 | 新15クラスを REGISTRY へ登録し、`serializeRuntime`/`restoreRuntime`/`recordExtra`（新スキルのテレメトリ）に接続。主発動時のみ `recordCast`（各弾/tick/命中/雹/地雷起爆/精霊射撃/波接触/粉砕/frostbreak では記録しない） |
| combat API 追加 | `freezeEnemy`（条件付き凍結＝ice_prison。`freeze_immunity` 尊重・ボスは氷砕ゲージ）・`addBossGaugeTo`（直撃したボスの氷砕ゲージ加算＝glacier_drop/avalanche/ice_prison）。いずれも `StatusEffectManager`/`FreezeSystem` の既存計算へ委譲し独自タイマーを持たない |
| `SkillAudit`（再利用） | 新 active/進化の `castMode`/`echoPolicy`/`clonePolicy`/`lv80ProjectileTarget` を一元解決。**Lv80発射数対象は `icicle_volley` のみ**・新進化5種は全て対象外。`mirror_ice` は echo/clone=forbidden、`cryo_mine` は canTriggerEcho=false |
| `balance.skillCaps`（29種追加） | 氷スキル/進化の品質別上限（`low≤medium≤high≤ultra`・正）を加算。到達しても判定は消さず装飾を先に削る |

- **runtimeState / 保存**: CD型は `cdLeft`、`mirror_ice`=`cdLeft`/`activeLeft`/`durabilityLeft`、`glacier_drop`=`cdLeft`/`pendingImpact*`（落下待機を保存し再開の無料再発動・二重落下を防止）。
  常設型（`frost_orbit`/`frost_spirit`/`frost_queen_court`）は runtimeState を保存せず再構築する。`active_run.skillRuntime` へ加算保存（詳細は `docs/save-format.md`）。
- **echo/clone**: `CastPolicy`/`SkillAudit` の「normal 由来のみ1世代・再帰なし」を踏襲。`mirror_ice`（forbidden）は複製せず、既存 `bossBulletPool` の `absorbable` メタを再利用して敵弾を吸収し氷反撃弾を撃つ。
- **テレメトリ**: `skills.recordExtra` でスキル別の追加キー（icicle_volley=volleys/iciclesFired、freezing_ray=channelSeconds/beamTicks/maxRampReached、glacier_drop=glaciersDropped/pendingImpactsCompleted ほか）を記録。**外部送信なし**・テレメトリ失敗でゲーム/保存は失敗しない。
- **デバッグ**: `?debug=1` の **F9** で氷術師 active15・進化8 を切替/取得/進化条件達成でき、`debugRun` として通常 profile へ保存しない。
- 検証: `frost-skills-wave2.mjs`／`frost-evolutions-wave2.mjs`／`frost-policy-audit.mjs`／`frost-runtime-save-wave2.mjs`（実スキルクラスを最小 Phaser モックで駆動）／`frost-determinism-wave2.mjs`（Math.random 不使用のソース走査＋同一状態で同一攻撃パターンの決定論トレース）・`validate-data.mjs`（M7-B ブロック）。**全34テストスイート通過**。

## 状態異常の視認性・実動作検証（M7-B.1）
M7-A の状態異常/凍結基盤（`StatusEffectManager`/`FreezeSystem`）と M7-B の氷術師ビルドを**現在の正**とし、状態を通常プレイ中に確認できる
**表示層（overlay）と開発用デバッグ**を追加する。**状態ロジックは一切変更しない**（判定・ダメージ・凍結確率・状態RNG cursor・ボス氷砕値は不変）。
表示はすべて演出であり、無効化・低品質化しても戦闘結果は変わらない（M2 のロジック/演出分離を踏襲）。表示状態はセーブしない。**`save_version` は 6 のまま**。
詳細は `docs/status-visuals.md`・`docs/status-debug.md`。

| 追加/変更 | 役割 | 再利用元 |
|-----------|------|----------|
| `src/systems/StatusVisualManager.js`（新規） | 状態表示の overlay 層。純粋 export（`chillTierOf(ratio)`〈0=none/<0.40=low/<0.75=mid/else high〉・`isNearThreshold(chill,guaranteedThreshold)`〈>=90%〉・`ICON_PRIORITY=['frozen','burning','freeze_immunity','chill_high']`・`selectIcons(state,maxIcons)`・`entityVisualState(e,sfx)`・`VisualBudget`）＋ Phaser クラス。毎フレーム（`statusVisualUpdateInterval` でスロットル）に権威フィールド（`_chill/_chillSlow/_frozenUntil/_freezeImmuneUntil`・`ignited`）を読んで overlay を**照合更新**し、`StatusEffectManager` のイベントで one-shot 演出（粉砕の氷片＋「SHATTER」・凍結開始/解除の氷片・冷気閾値直前の光）を出す。品質別上限を適用し、見えないエンティティ（死亡/解除/状態クリア/Scene終了/pool再利用）の overlay を掃除 | M2 の演出/判定分離・M6-E の炎上索引・M7-A の状態フィールド |
| `src/ui/BossFrostbreakDisplay.js`（新規） | 純粋 `bossFrostDisplayState(boss,sfx,jobElement,now)` → `{visible,gauge,threshold,ratio,breaks,cooldownRemain,vulnRemain,vulnActive,iceMultiplier}`。`visible` は `jobElement==='ice'` かつボス生存時のみ（火の魔女/ボス不在で空ゲージを出さない）＋ Phaser クラスが HUD 氷砕バー（現在値/必要値/割合/break/cooldown/脆弱残秒・vuln 点滅）と、`frostbreakTriggered` での FROST BREAK ワールド文字＋ゲージ亀裂＋氷片を描く | M7-A の HUD 氷砕ゲージを表示専用へ分離 |
| `src/ui/StatusDebugPanel.js`（新規） | 純粋 `activeStatusesOf`/`enemyDebugLines`/`freezeBreakdownLines`/`bossDebugLines`/`counterLines`＋ Phaser パネル（**F10**・`?debug=1`）。クリックで最寄り対象を選択（死亡で自動解除）し、chill/chillCap/ratio/guaranteedThreshold/slow/frozen±remain/immunity remain/freezeChanceCap/各倍率/active 状態/最後の付与 skillId・freeze 内訳（base×proc / 冷気寄与 / proc / 最終freezeChance / RNG roll / 結果 / hitGroupId / 同group判定回数 / skip理由）・ボス氷砕状態・実動作カウンタを表示。`markDebugRun()`（debugRun 分離）を使い profile を変更しない | M6-F の debugRun 分離・F 系デバッグパネル |
| `StatusEffectManager`（変更） | 表示層のための `on(fn)`/`_emit`・カウンタ（`chillApplications`/`chillAmountTotal`/`freezeAttempts`/`freezeSuccesses`/`immunitySkips`/`hitGroupSkips`/`bossGaugeApplications` を `counters()`）・`statusIndexSize()`・エンティティ別 `_statusDebug`（freeze 内訳）を追加。イベント（chillChanged/chillThresholdNear/frozenStarted/frozenEnded/freezeImmunityStarted/freezeImmunityEnded/shatterTriggered/bossFrostGaugeChanged/frostbreakTriggered/frostbreakVulnerabilityStarted/frostbreakVulnerabilityEnded・burningStarted は `registerBurning` から）を emit。**凍結ロールは `applyIceHit` にインライン化したが `rng.next()` を同一に消費**（確定→none / chance<=0→none / else 1）するため RNG cursor と結果は不変。イベント/カウンタは**シリアライズしない** | M7-A の `StatusEffectManager` へ通知フックとカウンタを追加するだけ |
| `Enemy`（変更） | 毎フレームの冷気 `setTint`・凍結 `setTint` を削除し、それらの視覚を `StatusVisualManager` の overlay へ移す（`enemy.setTint` を状態演出と奪い合わない・被弾フラッシュ/ダッシャー予告/エリート色は保持）。`onFreezeStart`/`onFreezeEnd` はフックとして残す | M7-A の Enemy 状態フィールド |
| `HUD`（変更） | `updateBossFrost(gauge,threshold,breaks,vuln,opts)` が割合/cooldown/脆弱残秒＋vuln 点滅を表示 | M7-A の HUD 氷砕ゲージ |
| `DataManager`（変更） | `get statusVisualsConfig` が `balance.statusVisuals` を返す | 既存アクセサ群 |
| `BattleScene`（変更） | HUD 生成後に statusVisuals/bossFrostDisplay/(debug)statusDebug を生成し、update ループで（スロットルして）呼ぶ。`dealDamage` が `_lastChillSkillId`/`_lastGaugeSkillId` を記録。cleanup で破棄。`?debug=1` で F10＋ポインタ選択を配線 | M7-A/M7-B の BattleScene 状態処理へ表示配線を足すだけ |

### 状態ロジック（判定）と表示ロジック（演出）の分離
- **権威は `StatusEffectManager`/`FreezeSystem`/Enemy の状態フィールド**（`_chill`/`_chillSlow`/`_frozenUntil`/`_freezeImmuneUntil`・ボス氷砕）にあり、
  `StatusVisualManager` はそれを**読むだけ**で状態を書き換えない。凍結確率式・冷気減衰・粉砕・氷砕は M7-A のまま。
- overlay は毎フレーム照合（`statusVisualUpdateInterval` でスロットル）で現在状態へ追従し、**瞬間演出（粉砕・凍結開始/解除・閾値直前の光）はイベント購読**で1回だけ出す。
- `Enemy.setTint` の奪い合いを避けるため、冷気/凍結の色は overlay へ移動した（被弾フラッシュ・ダッシャー予告・エリート色は Enemy 側に残す）。
- 品質別の装飾上限（下記 skillCaps）に達しても、状態の**判定・解除・免疫・索引 cleanup は削らない**（装飾を先に削る）。cleanup は死亡/返却/状態クリア/Scene終了/pool再利用/品質変更で行う。
- 表示状態（アイコン/氷片/Tween/floating text/debug選択対象/visual history/カウンタ/イベント）は**保存しない**。再開時は現在の状態フィールドから再構築する。

### 検証
- 純ロジック: `status-visual-state.mjs`（`chillTierOf`/`isNearThreshold`/`selectIcons`/優先度/`entityVisualState`/`VisualBudget`）・`status-debug-panel.mjs`（対象選択・敵/ボス行・freeze 内訳・カウンタ行）・
  `frostbreak-ui-state.mjs`（`bossFrostDisplayState` の visible 条件・割合/cooldown/vuln）・`status-visibility-nonregression.mjs`（表示追加で判定/ダメージ/凍結確率/状態RNG cursor/ボス氷砕値が不変・表示状態を保存しない）。
- Node 標準のみ・`validate.yml` に追加。**全39スイート通過**。実ブラウザ挙動（実際の見た目・当たり判定・100敵+2倍速での視認性・60FPS）は本環境では**未検証**。

## 氷術師ビルド拡張・第2波（M7-C）
M7-A の状態異常/凍結基盤（`StatusEffectManager`/`FreezeSystem`）・複数ジョブ補正（`JobModifierManager`）・M7-B.1 の状態表示層（`StatusVisualManager`/`BossFrostbreakDisplay`/`StatusDebugPanel`）と、
M6-A〜M7-B の抽選/枠/パッシブ/進化・`SkillAudit`（cast/echo/clone/Lv80 の一元解決）・`skillCaps` 品質別予算を **再利用** し、氷術師専用の active を **10種**・進化を **5種** 追加する。
火の魔女（active30/進化18）と氷術師の既存 active15・進化8 は不変。結果は氷術師 **active25・進化13**。**冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路**を通し（独自タイマーなし）、
**Math.random/Date.now/performance.now は不使用**（index ベース決定論・同点は entity `_seq`→x→y で安定決定・draft RNG cursor は不変）。**`save_version` は 6 のまま**。

| 追加/変更 | 役割 |
|-----------|------|
| `src/skills/*Skill.js`（新規15: active10＋evolution5） | 各スキルの発動・命中判定は `combat.*`、演出は `effects.*`。氷命中は既存 `applyIceHit`/`damageArea(element:'ice')` 経路。進化は `EvolvedSkillBase`（単一形態・追加Lvなし）。`serializeState`/`restoreState`・cleanup 実装。飛行中 projectile/Graphics/Text/Tween/particle/overlay は保存しない |
| `SkillManager` REGISTRY 登録 | 新15クラスを REGISTRY へ登録し、`serializeRuntime`/`restoreRuntime`/`recordExtra`（新スキルのテレメトリ）へ接続。主発動時のみ `recordCast`（各弾/tick/命中/pulse/開花/衝波/wave/屈折/彗星落下/粉砕/frostbreak では記録しない） |
| combat API（再利用＋追加） | 冷気/凍結/粉砕/ボス氷砕は既存 `dealDamage`/`damageArea` の `element:'ice'`＋`chillAmount` へ委譲。ボス直撃の氷砕ゲージは標準 chill 経路が担い、`frozen_clock`/`zero_hour_world` の `bossGaugeMult` は**ボス氷砕ゲージ量のみへ1命中1回だけ適用**（`applyIceHit` のボス分岐で chill→ゲージ変換に掛かるだけで damage/chill/proc や通常敵・炎には掛からず二重加算しない。ボス氷砕の cooldown/threshold/vulnerability は不変） |
| `SkillAudit`（再利用） | 新 active/進化の `castMode`/`echoPolicy`/`clonePolicy`/`lv80ProjectileTarget` を一元解決。**Lv80発射数対象は明示フラグ `appliesLv80ProjectileCount`**（`lv80ProjectileTarget:true`）で管理し projectile タグだけでは自動適用しない。氷の対象は計5種（frost_shard/glacial_lance/icicle_volley/rime_boomerang/polar_star）・新進化5種は対象外。`frozen_clock`/`winter_halo` は echo/clone=forbidden、`crystal_bloom`/`snowblind_mist`/`comet_sleet` は custom |
| `balance.skillCaps`（23種追加） | 氷スキル/進化の品質別上限（`low≤medium≤high≤ultra`・正）を加算。**装飾上限と damage event 上限を区別**し、到達しても判定は消さず装飾を先に削る。`winter_halo` の防御耐久は visual cap（`maxWinterHaloVisualShards`）で減らさない |
| `CombatTelemetry`（再利用） | `skills.recordExtra` でスキル固有 extra を記録。共通 chill/freeze/shatter/frostbreak は既存経路で記録し**二重カウントしない**。**外部送信なし**・失敗してもゲーム/保存は失敗しない |

- **runtimeState / 保存**: CD 型は `cdLeft`、設置/遅延/防御/barrage 型は追加フィールド（`crystal_bloom`=芽 `x/y/growLeft/pulseLeft`、`snowblind_mist`/`everlasting_white_mist`=`activeLeft/center/tickLeft`(＋`whiteoutLeft`)、`frozen_clock`/`zero_hour_world`=`remainingWaves/nextWaveLeft/waveIndex/origin`、`winter_halo`=`activeLeft/durabilityLeft`、`comet_sleet`=`barrageActive/cometsRemaining/nextCometLeft/barrageIndex/targetCenter/telegraphLeft`、`crystal_world_tree`=樹 `x/y/growLeft/pulseLeft/phase`）を `active_run.skillRuntime` へ加算保存し、**再開時の無料再発動・二重生成・進化前後の同時稼働を防止**する（詳細は `docs/save-format.md`）。
- **echo/clone**: `CastPolicy`/`SkillAudit` の「normal 由来のみ1世代・再帰なし」を踏襲。`frozen_clock`/`winter_halo`（forbidden）は複製・残響の対象外。custom は攻撃部分のみ複製（`crystal_bloom`=開花サイクル、`snowblind_mist`=霧の追加 tick、`comet_sleet`=追加彗星）。
- **状態表示との疎結合**: スキルクラスは状態演出を直接生成せず、冷気/凍結/粉砕/ボス氷砕を既存経路で起こすだけで M7-B.1 の `StatusVisualManager`/`BossFrostbreakDisplay`/`StatusDebugPanel`（F10・chill/freeze/hitGroup/counter）へ**自動反映**される（判定・ダメージ・状態RNG cursor は不変）。
- **デバッグ**: `?debug=1` の **F9** で新 active10・新進化5 を付与/Lv切替/進化条件達成/即時進化でき、`debugRun` として通常 profile 統計/Job XP/残り火/魂炎へ影響しない。
- 検証: `frost-skills-wave3.mjs`／`frost-evolutions-wave3.mjs`／`frost-policy-audit-wave3.mjs`／`frost-runtime-save-wave3.mjs`（実スキルクラスを graphics 対応の最小 Phaser モックで駆動）／`frost-determinism-wave3.mjs`（Math.random/Date.now/performance.now 不使用のソース走査＋同一状態で同一攻撃パターンの決定論トレース）・`validate-data.mjs`（M7-C ブロック）。**全44テストスイート通過・validate-data 0エラー0警告**。実ブラウザ挙動（実際の描画・当たり判定・視認性・60FPS）は本環境では**未検証**。

## 氷術師ビルド拡張・最終波（M7-D・カタログ完成）
M7-A〜M7-C の状態異常/凍結基盤・複数ジョブ補正・状態表示層・`SkillAudit`・`skillCaps`・M7-C 修正済みの `bossGaugeMult` 共通経路を **再利用** し、氷術師専用の active を **5種**・進化を **5種** 追加する。
火の魔女（active30/進化18）と氷術師の既存 active25・進化13 は不変。結果は氷術師 **active30・進化18** で、**火の魔女と同規模のカタログに到達**（氷術師カタログ完成）。**冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路**を通し（独自タイマーなし）、
**Math.random/Date.now/performance.now は不使用**（index／黄金角ベース決定論・同点は entity id/`_seq`→x→y／`instanceId`／wave index で安定決定・status RNG は `FreezeSystem` のみ・draft RNG cursor は不変）。**新 passive/ジョブ/状態/属性反応/限界突破なし・`save_version` は 6 のまま**。**次工程はカタログ完成監査**（抽選率/進化到達率/バランス分析）。

| 追加/変更 | 役割 |
|-----------|------|
| `src/skills/*Skill.js`（新規10: active5＋evolution5） | `GlacialSpearRainSkill`/`SnowflakeSentrySkill`/`IcebergRamSkill`/`AbsoluteIceSealSkill`/`AuroraVeilSkill` と各進化。発動・命中は `combat.*`、演出は `effects.*`。氷命中は既存 `applyIceHit`/`damageArea(element:'ice')` 経路。進化は `EvolvedSkillBase`（単一形態・追加Lvなし）。`serializeState`/`restoreState`・cleanup 実装。飛行中 projectile/Graphics/Text/Tween/particle/overlay/氷印 overlay は保存しない |
| **skill-local マーカー（氷印/氷棺）** | `absolute_ice_seal`/`eternal_sealed_coffin` は正式 status ではなく **skill-local マーカー**を使う。`StatusEffectRegistry` へ登録せず正式 status 表示へ重複追加しない（skill-local overlay のみ）。`Enemy` に `_iceSeal`（マーカー参照）と `_iceHitCount`（氷属性命中カウンタ）を追加し、`Enemy.reset` でクリアして pool 再利用の残留を防ぐ。命中数起爆は `dealDamage` の ice 分岐が `_iceHitCount` を1回加算し、マーカーが差分（`requiredHits`）で判定。**復元方針**: 通常敵は pool 再利用で再特定できないため**捨て**（無料起爆しない）、ボス（`scene.boss`）のみ再関連付け、CD（`markLeft`）は必ず復元。氷印付与時は freeze roll しない |
| `SkillManager` REGISTRY 登録 | 新10クラスを REGISTRY へ登録し、`serializeRuntime`/`restoreRuntime`/`recordExtra` へ接続。主発動時のみ `recordCast`（各槍/砲台弾/pulse/接触/氷印起爆/tick/burst/粉砕/frostbreak では記録しない） |
| combat API（再利用＋`bossGaugeMult` 共通経路） | 冷気/凍結/粉砕/ボス氷砕は既存 `dealDamage`/`damageArea` の `element:'ice'`＋`chillAmount` へ委譲。`bossGaugeMult` は M7-C 修正済みの共通経路（`dealDamage`/`damageArea`→`opts.bossGaugeMult`（既定1）→`applyIceHit` のボス分岐で chill→ゲージ変換に1命中1回だけ→`addBossGauge`）を維持し、damage/chill/procCoefficient や通常敵・炎には掛からず二重加算しない（ボス氷砕の cooldown/threshold/vulnerability は不変）。宣言スキルは absolute_ice_seal(1.25→1.50)/aurora_veil(1.15→1.35)/eternal_sealed_coffin(2.0)/polar_night_aurora(1.7)/heavenfall 巨大槍(1.4) |
| `SkillAudit`（再利用） | 新 active/進化の `castMode`/`echoPolicy`/`clonePolicy`/`lv80ProjectileTarget` を一元解決。**Lv80発射数対象は明示フラグ `appliesLv80ProjectileCount`** で管理し、氷の対象は**計6種**（frost_shard/glacial_lance/icicle_volley/rime_boomerang/polar_star/glacial_spear_rain）・新進化5種は対象外。`absolute_ice_seal`/`aurora_veil` は echo/clone=forbidden、`glacial_spear_rain`/`snowflake_sentry` は custom、`iceberg_ram` は echo=standard・clone=custom |
| `balance.skillCaps`（19種追加） | 氷スキル/進化の品質別上限（`low≤medium≤high≤ultra`・正）を加算。**装飾 cap と damage event cap を区別**し、到達しても判定は消さず装飾を先に削る。visual cap でマーカー/防御性能は減らさない（`maxGlacialSpearTelegraphs`/`maxSnowflakeSentries`/`maxIceSealMarks`/`maxAuroraBands` 等） |
| `CombatTelemetry`（再利用） | `skills.recordExtra` でスキル固有 extra を記録。共通 chill/freeze/shatter/frostbreak は既存経路で記録し**二重カウントしない**。**外部送信なし** |

- **runtimeState / 保存**: CD 型は `cdLeft`／反応型は `markLeft`／常設型は `deployLeft`/`recastLeft`。追加フィールドは `glacial_spear_rain`/`heavenfall_glacier_lances`=barrage（`spearsRemaining/nextSpearLeft/barrageIndex/targetCenter/telegraphLeft`）、`snowflake_sentry`/`crystal_sentinel_legion`=各砲台（`instanceId/x/y/activeLeft/shotLeft/pulse`｜`linkCounter`）、`iceberg_ram`/`continental_glacier_rush`=氷山/氷河（`x/y/direction/activeLeft/travel/collapsePending/instanceId`）、`absolute_ice_seal`/`eternal_sealed_coffin`=`markLeft`＋ボス印のみ、`aurora_veil`/`polar_night_aurora`=`recastLeft/activeLeft/tickLeft/burstLeft/phase/layoutIndex`(＋`pillarCounter`)。`active_run.skillRuntime` へ加算保存し、**再開時の無料再発動・二重生成・進化前後の同時稼働を防止**する（詳細は `docs/save-format.md`）。
- **echo/clone**: `CastPolicy`/`SkillAudit` の「normal 由来のみ1世代・再帰なし」を踏襲。`absolute_ice_seal`/`aurora_veil`/`eternal_sealed_coffin`/`polar_night_aurora`（forbidden）は複製・残響の対象外。custom は攻撃部分のみ複製（設置/砲台/氷山は増やさない）。`eternal_sealed_coffin` は氷棺印を近傍未印へ**1世代だけ伝播**（副棺は再伝播しない）。
- **状態表示との疎結合**: スキルクラスは状態演出を直接生成せず、冷気/凍結/粉砕/ボス氷砕を既存経路で起こすだけで M7-B.1 の `StatusVisualManager`/`BossFrostbreakDisplay`/`StatusDebugPanel`（F10・chill/freeze/hitGroup/counter）・状態カウンタへ**自動反映**される（判定・ダメージ・状態RNG cursor は不変）。氷印だけ最小限の skill-local overlay を持つ。
- **デバッグ**: `?debug=1` の **F9** で新 active5・新進化5 を付与/Lv切替/進化条件達成/即時進化でき、`debugRun` として通常 profile 統計/Job XP/残り火/魂炎へ影響しない。
- 検証: `frost-skills-wave4.mjs`／`frost-evolutions-wave4.mjs`／`frost-policy-audit-wave4.mjs`／`frost-runtime-save-wave4.mjs`（実スキルクラスを graphics 対応の最小 Phaser モックで駆動）／`frost-determinism-wave4.mjs`（Math.random/Date.now/performance.now 不使用のソース走査＋決定論トレース）／`frost-boss-gauge-wave4.mjs`（`bossGaugeMult` がボス氷砕ゲージのみへ1回・通常敵/damage/chill/proc/炎不変）・`validate-data.mjs`（M7-D ブロック）。**全51テストスイート通過・validate-data 0エラー0警告**。実ブラウザ挙動（実際の描画・当たり判定・視認性・60FPS）は本環境では**未検証**。

## Milestone 7-E: 氷術師 完成監査（新規コンテンツなし・監査基盤の追加）
- **`DraftBalanceAnalyzer` 拡張**: 戦略に `balanced` / `random-valid` / `new-skill-priority` / `one-build-focus` を追加（`M7E_POLICIES`）。
  抽選そのものは production の `SkillDraftManager` を使い、ここで足すのは**プレイヤーの選び方と集計**だけ（抽選ロジックの再実装はしない）。
  追加指標: 取得率 / active Lv8 率 / passive Lv4 率 / rarity 取得 / reroll・banish・skip / pity / synergy 適用数 /
  候補内訳（強化・新規・進化）/ 枠充足 / 候補なし / **必ず0の健全性カウンタ**（他ジョブ混入・不正候補・重複候補・
  slot 違反・不正進化・進化後の元 active 再提示）/ 進化ごとの段階内訳（base→base Lv8→support→条件→提示→取得）。
- **`FrostBalanceWarnings`（新規）**: カタログ／抽選サマリ／監査結果／状態異常集計から `FROST_*` 30 コードの警告を生成する純ロジック。
  自動調整はせず警告のみ。閾値は `DEFAULT_FROST_THRESHOLDS`（引数で上書き可）。**ローカル専用・外部送信なし**。
- **共通経路の小さな追加**（既定値で既存挙動は不変）: `dealDamage`/`damageArea` の `opts.frozenBonus`（凍結対象への追加倍率・既定0）、
  `Projectile.bossGaugeMult`（弾からもボス氷砕ゲージ倍率を渡す・既定1）、粉砕由来の弾数上限 `maxShatterProjectiles`。
- **上限の二層構造を明文化**: 進化の `safetyCaps`（`EvolvedSkillBase.cap()` が読む絶対上限）と
  `balance.json` の `skillCaps`（`combat.skillCap()`/`frameBudget()` が読む**品質別**上限）。
  同じ意味の上限を両方で持つ場合は品質別の方が実効値になる。**未参照の上限は不具合**として `validate-data` とテストで検出する。
- **恒久ガード**: `validate-data.mjs` の M7-E ブロックが「Lv 成長項目が実装から参照されない」「quality cap が未参照/不在/名前違い」
  「成長しない成長項目」「skill-local マーカーを正式 status へ登録した」「docs にスキル id の記載が無い」をエラーにする。
- **F8 のジョブ別分析パネル**（`BattleScene.toggleJobAnalysis` / `jobAnalysisReport`）: 表示のみ・profile 不変・外部送信なし。
- 検証: `frost-completion-catalog` / `frost-evolution-reachability` / `frost-draft-balance` / `frost-evolution-distribution` /
  `frost-dead-content-audit` / `frost-complete-skill-audit` / `frost-complete-runtime-save` / `frost-complete-determinism` /
  `frost-status-balance` / `frost-quality-cap-audit` / `frost-cleanup-audit` / `frost-telemetry-audit`（共通土台は `tests/frost-audit-common.mjs`）。
  **全63スイート通過・validate-data 0エラー0警告**。実ブラウザ挙動は本環境では**未検証**。


---

## Milestone 8-A: 火の魔女 完成監査（新規コンテンツなし・監査基盤の追加）

- **`src/systems/FlameBalanceWarnings.js`（新規）**: カタログ / 抽選 / 監査 / 炎上・DoT・爆発・共鳴の集計から
  `FLAME_*` 30 コードの開発用警告を生成する純ロジック。自動調整はしない。閾値は既定値＋引数のみ。
  外部送信なし。M7-E の `FrostBalanceWarnings` と同じ構造で、火固有の項目だけを差し替えている。
- **`tests/flame-audit-common.mjs`（新規）**: 火の魔女監査 12 本が共有する土台。
  実データ読み込み・`draftCatalog()` 相当・production 抽選コンテキスト・Phaser 非依存のヘッドレス scene
  （`scene.rng` は seed 由来の決定論 RNG、`combat` API は**半径を実際に見る** SpatialGrid 相当）。
- **runtimeState の全件化**: 火の魔女 48 スキルすべてが `serializeState`/`restoreState` を持つようになり、
  `SkillManager.skillsWithRuntimeState()` に全件が含まれる。常設型は CD を持たない代わりに
  位相・主発動スロットル・各インスタンスのタイマーを保存する（設置物本体は保存せず `_rebuild`/`_ensure` が再構築＝二重生成しない）。
- **主発動イベントの一貫化**: 常設型（`orbiting_flame` / `fire_spirit` / `eternal_pyre` / `solar_annihilation_array`）は
  `config.castPulseMs` でスロットルして `recordCast` を 1 回だけ行う。これにより
  `recordCast → _onSkillCast → jobMods.registerCast → _triggerEcho` の共通経路にすべての攻撃系スキルが乗る。
- **`SkillBase._initCd` を削除**（宣言のみで一度も読まれない予約フィールドだった）。
- **`Projectile.rampMax`**: 連続命中の上昇上限を data（`damage.rampMax`）から受け取るようにした（既定 0.6 ＝従来の ×1.6）。
- **未参照 quality cap の全廃**: `skillCaps` は 152 件になり、`validate-data.mjs` の許容リストは空。
  以後、未参照 cap があるとデータ検証がエラーになる。

## Milestone 8-B: 戦士（3 人目のジョブ）・専用リソースと近接判定の共通経路

戦士は「近接で殴り続ける」ジョブで、火 / 氷とは要求される仕組みが違う。
新しいゲームを並行実装せず、**既存の基盤（SkillManager / PassiveManager / JobModifierManager /
SpatialGrid / CombatTelemetry / SaveManager）を再利用**したうえで、戦士固有の状態だけを 1 か所へ集約した。

### 新規モジュール

| ファイル | 役割 |
|----------|------|
| `src/systems/WarriorCombatSystem.js` | **闘気 / 闘気解放 / 回復 / コンボ / 被ダメージ軽減 / 不屈 / 撃破回復 / 体勢崩し の唯一の管理者**。Phaser 非依存・乱数なし・時間は `now()` コールバック・回復は `heal()` コールバック経由（Node からテスト可能） |
| `src/skills/WarriorSkillBase.js` | `WarriorSkillBase`（`SkillBase` 派生）と `WarriorEvolvedBase`（`EvolvedSkillBase` 派生）。向き決定 / 近接半径 / 打撃数 / `castKey` 発行 / クールダウン倍率を共通化する薄い基底 |
| `src/ui/WarriorHud.js` | 純ロジック `warriorHudState()` ＋ Phaser 表示層（`BossFrostbreakDisplay` と同じ二層構成） |
| 戦士スキル 8 本 | `GreatCleaveSkill` / `ShieldBashSkill` / `WhirlwindSlashSkill` / `ChargeSlashSkill` / `GroundSlamSkill` / `ThousandBladeDanceSkill` / `BloodstormWhirlwindSkill` / `UnyieldingFortressSkill` |

### 近接判定の共通経路（`BattleScene.meleeStrike()`）

戦士スキルは**自前で敵を走査しない**。すべて `scene.combat.meleeStrike({...})` を呼び、
そこで以下が 1 か所にまとまっている。

1. `targetsInRadius()`（SpatialGrid）で候補を絞る — **全敵総当たりをしない**
2. `arc` 内かを判定（`arc = 2π` なら全周）
3. 品質別 cap `maxMeleeTargetsPerHit` と スキル指定 `maxTargets` の小さい方で対象数を打ち切る
4. `dealDamage(..., { element: 'physical', isMelee: true })` — 既存のダメージ経路をそのまま使う
5. `warrior.resolveKnockback()` → 通常敵はノックバック / エリートは体勢へ変換 / ボスは 0
6. `warrior.applyPoiseDamage()` → エリート stagger / ボス stance break
7. `warrior.noteMeleeHit()` → 闘気・コンボ（`castKey` 単位の上限つき）
8. `_meleeVisual()` — **演出だけ**を別 cap で打ち切る（ダメージ件数へは影響しない）

### 責務の分離（スキルが Scene 内部へ触らない）

- スキルクラスは `scene.profile` / `passives` / `jobMods` を直接読まない。
  必要な倍率はすべて `this.warrior`（＝`WarriorCombatSystem`）から取る。
- Job Lv と passive の値は `BattleScene._refreshWarriorMods()` が **1 か所だけ** で
  `warrior.setMods()` へ流し込む（`passives.version` が変わったときだけ再計算）。
- 被弾は `Player.takeDamage` → `scene.onWarriorDamage()` → `warrior.applyIncomingDamage()` の 1 経路。
  戦士以外では `enabled=false` で素通りし、火 / 氷の被弾計算は 1 命令も変わらない。
- 反応スキル（不落の城壁の反撃）は `scene.onWarriorHit()` から通知される。

### 既存クラスへの加算的変更

| ファイル | 変更 |
|----------|------|
| `BattleScene` | `isWarrior` / `warrior` 生成 / `meleeStrike` / `_meleeVisual` / `onWarriorDamage` / `onWarriorHit` / `_refreshWarriorMods` / `_applyWarriorMaxHp` / `computeWarriorAutoMove` / 戦士 HUD / F9 戦士パネル / F8 分析の戦士セクション |
| `Player` | `takeDamage` に軽減フック 1 行（`scene.onWarriorDamage` が無ければ素通り） |
| `Enemy` | `_poise` / `_poiseImmuneUntil` / `_staggerUntil` / `_staggerSlow` を追加。`effectiveSpeed()` に stagger 減速、`update()` に突進中断 |
| `Boss` | `applyPoiseStagger()` / `poiseStaggered`（**氷砕硬直 `applyFrostStagger` とは別メソッド・別フィールド**） |
| `PassiveManager` | 戦士 modifier の getter 13 件（既存の汎用 `getMult` / `getFlat` をそのまま使う） |
| `JobModifierManager` | 戦士の到達報酬 7 type と getter。`projectileCountBonus()` に `strikeCountBonus` を合流 |
| `CombatTelemetry` | 周回集計 `warrior` ブロック（30 キー）とスキル別 8 キー。**job でスキーマを変えない**（火/氷でも同じキーが 0 で出る） |
| `BattleManager` | `buildRunSnapshot()` に `warriorState` を追加（戦士周回のみ・他ジョブは `null`） |

### オート移動（ジョブ別 strategy）

`computeAutoMove()` は既存のまま（火 / 氷は 1 行も変わらない）。冒頭で
`if (this.isWarrior) return this.computeWarriorAutoMove()` と分岐するだけで、
戦士版は「敵の密集へ寄る → 接敵距離を保つ → 瀕死のときだけ離れる → ボス予告は常に回避」という別方針を持つ。

## Milestone 8-B.1: passive 再計算の単一トリガー化（`passives.version`）

### 直したバグ

`BattleScene._refreshStatusPassives()` は「passive 取得のたびに手で呼ぶ」設計だったが、
**通常のレベルアップ（`applyCandidate` → `passives.acquireOrLevel`）の経路から呼ばれていなかった**。
呼ばれていたのは 周回開始時 / 途中再開時 と F9 デバッグ操作の 3 か所だけである。

そのため氷術師の **余寒残留 `lingering_cold`** を周回中に取得・強化しても、
`StatusEffectManager` の `_chillDecayMult` / `_iceStatusDurationMult` が更新されず、
冷気の減衰緩和・凍結/氷砕脆弱の持続延長が効かなかった
（周回を開始し直すか、F9 を触ったときだけ反映される状態だった）。

同じ modifier でも、**参照タイミングが「読むたび」のものは影響を受けていない**:

| passive | modifier | 消費のしかた | バグの影響 |
|---------|----------|--------------|-----------|
| 氷晶増幅 `frost_amplification` | `iceDamage` | `dealDamage` が毎ヒット読む | なし |
| 急速冷却 `rapid_freezing` | `cooldown` | `SkillBase.passiveCooldownMult()` が毎回読む | なし |
| 凍域拡張 `frozen_expansion` | `area` | `SkillBase.stats` が `passives.version` でキャッシュ無効化 | なし |
| **余寒残留 `lingering_cold`** | `chillDecay` / `iceStatusDuration` | **`setPassiveMods()` で押し込む（push 型）** | **あり** |

つまり「push 型で外部システムへ渡す modifier」だけが取り残されていた。

### 修正方針 — 戦士（M8-B）と同じ形に揃える

M8-B の `_refreshWarriorMods()` は最初から `passives.version` を見て差分再計算する設計だった。
同じ考え方を status passive 側へ導入する。

```
_refreshStatusPassivesIfNeeded(force)   ← 単一トリガー（version + インスタンス）
        └─ _refreshStatusPassives()     ← 現在の passive 所持状態から「完全再構築」
```

- **単一トリガー**は `PassiveManager.version`。level が変わるたびに `_recompute()` が +1 する既存の値を使う
  （新しいカウンタを増やさない）。
- **完全再構築**であり、現在値への加算はしない。`StatusEffectManager.setPassiveMods()` は
  受け取った値をそのまま代入する（既存仕様）ため、何回呼んでも二重適用にならない。
- **毎フレーム無条件の再計算はしない**。version が同じフレームでは何もしない。
- `PassiveManager` **インスタンスが差し替わった場合**（F8 の検証周回開始）も再構築する。
  version がたまたま一致しても取りこぼさないため。同じ保険を `_refreshWarriorMods()` にも入れた
  （どちらも冪等な完全再構築なので、余分に走っても値は変わらない）。

### 発火する経路

| 経路 | 呼び方 |
|------|--------|
| 周回開始 / 途中再開（`create`） | `force`（1 回だけ） |
| レベルアップでの passive 取得（`applyCandidate`） | gate 付き（即時反映） |
| メインループ（`update`・`statusFx.update` の直前） | gate 付き（取りこぼしの保険） |
| F8 検証周回の開始（`startBalancePlaytest`） | `force`（PassiveManager を作り直すため） |
| F9 氷術師デバッグパネル | `force` |

メインループでの呼び出しを `statusFx.update(dt)` の**直前**に置いているのは、
取得したフレームから新しい減衰率で冷気が減るようにするため。

### ジョブ分離

`_refreshStatusPassives()` は **周回のジョブが氷術師のときだけ**乗率を適用し、
火の魔女 / 戦士では明示的に恒等値（1, 1）を書き込む。
判定に使うのは `this.jobId`＝**周回開始時に固定した値**（途中再開時は `active_run.jobId`）で、
`profile.selectedJobId` を直接読まない（周回中のジョブ変更を持ち込まないため）。

これまでも抽選のプール分離により火 / 戦士が氷 passive を持つことは無かったが、
「構造として持てない」ではなく「持っていても効かない」ことを実装で保証する形にした。

---

## Milestone 8-C: 戦士 Wave1 で追加した共通経路

M8-B の原則（**スキルは Scene の内部状態を直接いじらず、`scene.combat` の共通経路だけを通る**）を
そのまま拡張した。M8-C で `BattleScene` へ足したのは次の 5 つ。

| API | 実体 | 一元化しているもの |
|-----|------|--------------------|
| `preferredMeleeTarget(x, y, r, mode)` | `BattleScene` | 対象選択（`'tough'` = エリート/ボス優先、`'lowHp'` = 瀕死優先）。全敵総当たりをしない |
| `executeTarget(e, skillId, opts)` | `BattleScene` | 処刑の実行。**残り HP ぶんのダメージ**を通常の `dealDamage` 経路へ流す |
| `pullTarget(e, opts)` | `BattleScene` | 引き寄せ。ボス除外 / 壁内クランプ / `enemyGrid.update()` / 慣性リセット |
| `movePlayerTowards(x, y, d)` | `BattleScene` | プレイヤーの接近。壁内クランプ / NaN 防止 |
| `bossTelegraphing()` | `BattleScene` | ボスの予告 / 突進判定 |

`meleeStrike()` には `toughBonus` / `execute` / `maxExecutes` / `visualCap` を追加した。
**判定と演出は完全に分離**されており、`visualCap` は演出だけを打ち切る。

### 処刑の流れ（死亡イベントを二重に出さない）

```
ExecutionStrikeSkill.fire()
  → combat.meleeStrike({ execute: params, maxExecutes: cap })
      ├ WarriorCombatSystem.executePolicy(e, params)   // 可否と追加倍率を返す
      ├ canExecute なら BattleScene.executeTarget(e, id)
      │    → dealDamage(e, 残りHP)                     // 死亡イベントはここで 1 回だけ
      │       → 撃破統計 / 撃破回復 / 進化の撃破フック
      └ できないなら damageMult を掛けて通常ダメージ
```

即死用の別 API を作っていないので、`dispatchKill` は 1 回しか走らない。

### 反撃の調停（1 被弾 = 最大 1 系統）

```
Player.takeDamage
  → BattleScene.onWarriorDamage(amount, ctx)   // 軽減（構えの mitigation を extra へ）
  → BattleScene.onWarriorHit(raw, applied)
      ├ this._inWarriorCounter なら即 return   // counter → counter の再帰を止める
      ├ warrior.consumeCounterEvent()          // 優先度最上位の 1 系統だけを選ぶ
      └ 選ばれた skill の performCounter()     // recordCast も新しい構えも作らない
```

反撃を持つスキルは `get counterSource()` と `performCounter(raw, applied)` を公開し、
構えの登録は `warrior.beginCounterWindow(source, opts)` で行う。
**スキル側は自分の窓の残り回数だけを管理し、誰が反撃するかは決めない。**

`UnyieldingFortressSkill`（M8-B の進化）も M8-C でこの調停へ移行した。
既存の `onPlayerHit()` は `performCounter()` から呼ぶ形になり、挙動そのものは変えていない。

### 進化が基礎 active のクラスを継承するとき

`applyEvolvedSemantics(cls)`（`src/skills/WarriorSkillBase.js`）が
プロトタイプへ `evoDef` / `baseSkillId` / `isEvolved` / `name` / `maxLevel` / `rawStats` /
`stats` / `cap()` / `evolvedBonus()` を生やす。`stats` は `{ cooldown: evoDef.cooldown }` を
合成して返すので、`SkillBase.update()` の発動判定と `super.update()` のチェーンがそのまま働く。

適用しているのは `WarGodRoarSkill`（← `WarCrySkill`）・`AdamantCounterSkill`（← `CounterStanceSkill`）・
`HeavenCrushingDescentSkill`（← `LeapSmashSkill`）の 3 件。

### 進行中の状態は敵オブジェクトを持たない

`ChainHookSkill` / `RelentlessComboSkill` は対象を **`_seq`（出現順の安定 runtime id）** で保持し、
毎フレーム `combat.enemiesInRadius()` から引き直す。
プール返却で別の敵を掴むことがなく、保存にもオブジェクト参照が入らない。

---

## Milestone 8-C.1: 進化導線補助（guidance）

M8-C で戦士の active が 5 → 15 になり、枠 4 の進化到達率が落ちた。
原因は **「進化元（基礎 active）側へ効く抽選補正が production に存在しなかった」**こと。
既存の synergy（M6-F）は「基礎を所持している → その補助を煽る」の一方向しか持っていない。

### 追加した層

```
実効重み = rarityWeight × rarityWeightMult × skill.weight   （M6-A / M6-C）
          × synergyMult                                     （M6-F・全ジョブ共通）
          × guidanceMult                                    （M8-C.1・ジョブ限定）
```

`SkillDraftManager._guidanceMult()` が `guidanceMult` を返す。効くのは
`data/skill-config.json` の `guidance.jobs` に載っているジョブの周回だけで、
それ以外では常に 1 を返し、候補オブジェクトにフィールドすら足さない。

### 補正対象の導出（skill ID のハードコードなし）

`BattleScene.buildDraftCtx()` が渡すのは次の 2 つだけ。

| ctx キー | 中身 |
|----------|------|
| `jobId` | 周回のジョブ（`guidance.jobs` との照合に使う） |
| `evolutionRecipes` | `{ evolutionId, baseSkillId, baseLevel, requirements[] }`（`SkillCatalog.evolutionRecipes()` 由来） |

補正の対象は毎回このレシピから導出する。data に進化を足せばそのまま補正対象になる。

### 重複上限

同じスキルが複数のレシピに関わっても倍率を掛け合わせない。
役割（base / support）ごとに **レシピをまたいだ最大値**だけを採り、最後に `maxMultiplier` でクランプする。

### pity

既存の `draftsSinceProgress`（進化成立でしかリセットされない）とは別に、
`guidanceStall` を追加した。guidance が有効なジョブの `open()` でだけ +1 され、
進化導線の進展（進化元の取得 / 強化・必要補助の取得 / 強化・進化取得）でリセットされる。

進展の判定は **候補に付いた guidance タグ**（`SkillDraftManager` が data のレシピから導出したもの）で行う。
`BattleScene.applyCandidate()` は特定 skill ID を一切判定しない。

`guidanceStall` は `active_run` の draft 状態へ**加算的に**保存する（`save_version` は v6 のまま）。
保存するので save → reload で pity をリセットして稼ぐことはできない。

### RNG

`_guidanceMult()` は乱数へ一切触れない。重みだけを変えるので `_weightedPick()` の
`rng.next()` 呼び出し回数は変わらず、**guidance の ON / OFF で cursor が 1 も動かない**。

詳細は `./warrior-evolution-guidance.md`、修正前の実測分析は `./warrior-draft-analysis-wave1.md`。


---

## Milestone 8-D: 戦士スキル拡張 Wave2（構造上の変更点）

### 方針は M8-B から変わらない

> 戦士の状態は `WarriorCombatSystem` が唯一の管理者。BattleScene へスキルごとの状態を散らさない。

Wave2 で足した 5 つの機構（打ち上げ / 前面防御 / 掴み・投げ / 戦旗の陣 / 低 HP スケーリング）も
すべて `WarriorCombatSystem` の中にあり、上限は `balance.json` から読む。
スキルクラスは**判断をせず**、`launchPolicy()` / `grabPolicy()` の結果に従うだけ
（スキル側で `isBoss` / `isElite` を見ない）。

### 敵オブジェクトを保持しない

Wave1 の鎖鉤・怒涛連撃と同じく、Wave2 の掴み・投げ・戦斧も**敵の参照を持たない**。
持つのは安定 runtime id（`Enemy._seq`）だけで、実体は毎フレーム引き直す。

```
WarriorCombatSystem._grab = { source, seq, phase, leftMs }   // ← 敵オブジェクトではない
BattleScene.grabbedTarget()  → _seq から引き直す
BattleScene.releaseGrab()    → 敵側の _grabbed も必ず戻す
```

これにより、敵がプールへ返却されても参照が残らず、保存データにも runtime id が漏れない。

### 共通経路への追加は「明示したときだけ効く」形にした

`BattleScene.meleeStrike` へ足した `isThrown` / `launch` / `seqHitCounts` / `toughPoiseBonus` は
いずれもオプションで、未指定なら従来と同じ経路を通る。
`Player.takeDamage(amount, from)` の第 2 引数も任意で、火 / 氷の被弾経路は渡さない。
`balance.warrior.frontalGuard.requireDirection: true` なので、方向のない被弾に前面軽減は乗らない。

**`Projectile` は 1 行も変えていない。** 戦斧投擲は弾を使わず、スキルが決定論的に動かす
「移動する判定ボリューム」（`combat.thrownStrike` を毎フレーム呼ぶ）として実装した。
`Projectile.reset()` は火 / 氷の状態異常フィールドを多数持つため、そこへ物理投擲を混ぜると
非回帰ハッシュが壊れる、という判断。

### `Enemy` への追加は既定値で恒等

```js
this._airborneUntil = 0; this._launchImmuneUntil = 0; this._launchHeight = 0; this._grabbed = false;
...
if (this._grabbed || now < this._airborneUntil) spd = 0;   // 既定値では絶対に通らない
```

`reset()` も同じ 4 つを戻すので、プール再利用で状態が持ち越されない。

### 時限状態の tick は 1 か所

前面防御 / 掴み / 戦旗の陣はすべて `WarriorCombatSystem.update(dt)` の末尾で
まとめて減算・終了処理される（`Phaser.Time` に依存しない＝テストから同じ経路を駆動できる）。


---

## Milestone 8-E: 戦士スキル拡張 最終Wave（構造上の変更点）

### 方針は M8-B から変わらない

> 戦士の状態は `WarriorCombatSystem` が唯一の管理者。BattleScene へスキルごとの状態を散らさない。

最終Wave で足した 5 つの機構（直線の対象選択 / 決闘 / 構え / 進軍 / 弾き返し）も
すべて `WarriorCombatSystem` の中にあり、上限は `balance.json` から読む。
スキルクラスは**判断をせず**、`resolveLineMeleeTargets()` / `duelPriority()` /
`canDeflectProjectile()` の結果に従うだけ（スキル側で `isBoss` / `projectileKind` を見ない）。

### 敵オブジェクト・弾オブジェクトを保持しない

決闘が持つのは安定 runtime id（`Enemy._seq`）だけで、実体は毎フレーム引き直す。

```
WarriorCombatSystem._duel = { source, seq, kind, leftMs, ... }   // ← 敵オブジェクトではない
BattleScene.duelTarget()  → _seq から引き直す
onEnemyRemoved(e)         → _duel.seq === e._seq なら解除し、e._duelMark も戻す
```

弾き返しも同じで、持つのは `_deflectId` の `Set` だけ（**保存しない**・窓を閉じれば空になる）。

### 反応の調停を 1 か所に置いた

近接反撃（M8-C）と弾き返し（M8-E）が同じ被弾で二重に発火しないよう、
`arbitrateDeflectionAndCounter(kind)` が入口を 1 つにまとめている。

```
projectile イベント → 弾き返しの枠だけを見る（近接反撃の回数は減らない）
melee      イベント → 既存の反撃調停だけを通す（弾き返しの枠は減らない）
```

窓の枠を使い切っていても**窓が開いている間は調停まで通す**（`deflectionWindowOpen`）ので、
「上限に達した窓へ弾が来た」ことを正しく計測でき、その弾はそのまま素通りする。

### 共通経路への追加は「明示したときだけ効く」形にした

`BattleScene.meleeStrike` へ足した `line: { length, width, facing, maxTargets }` はオプションで、
未指定なら従来の扇形判定を通る。敵弾 vs プレイヤーの弾き返しフックも
`warrior.deflectionWindowOpen && this._deflectOpts` のときにしか動かない。

**`Projectile` へは無害な既定値のフィールドを 4 つ足しただけ**
（`_deflectId: null` / `alreadyDeflected: false` / `deflectGeneration: 0` / `suppressSpecialEffects: false`）。
いずれも `_clearState()` が戻すので、火 / 氷の弾は 1 つも挙動が変わらない
（`tests/three-job-final-catalog-nonregression.mjs` がランタイムハッシュで保証している）。

M8-D では「`Projectile` を 1 行も変えない」方針だったが、弾き返しは**弾そのものに印を付けないと
同じ弾を 2 度弾いてしまう**ため、ここだけは既定値が完全に無害なフィールド追加として許した。

### `Enemy` への追加は既定値で恒等

```js
this._duelMark = false; this._lineAlong = 0;   // 既定値では移動にも AI にも影響しない
```

`reset()` も同じ 2 つを戻すので、プール再利用で状態が持ち越されない。

### 時限状態の tick は 1 か所

決闘 / 構え / 弾き返しの窓はすべて `WarriorCombatSystem.update(dt)` の末尾で
まとめて減算・終了処理される（`Phaser.Time` に依存しない＝テストから同じ経路を駆動できる）。

---

## Milestone 8-F: 戦士 完成監査（構造上の変更点）

**新しいクラス・新しいマネージャは 1 つも増やしていない。** 監査で見つけた不備を、
既存の集約点へ寄せる形で直した回。

### 1. cooldown 復元を戦士の基底 2 クラスへ集約した

```
src/skills/WarriorSkillBase.js
  export const MAX_RESTORED_CD_MS = 120000

  warriorMixin.restoreCd(value)     // 数値以外は採用しない / 非有限値は採用しない
                                    // 有限値は [-MAX, +MAX] へクランプ
  WarriorSkillBase.update()         // this._dead なら何もしない
  WarriorSkillBase.destroy()        // this._dead = true
  WarriorEvolvedBase.update()       // 同上
  WarriorEvolvedBase.destroy()      // 同上
```

戦士 35 ファイルにあった `if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;` という
生の代入をすべて `this.restoreCd(st.cdLeft);` へ置き換えた。
**火 / 氷の 27 ファイルは従来の生の代入のまま**で、共通 `SkillBase` も触っていない
＝火 / 氷の restore は 1 バイトも変わらない。

クランプ範囲が `[0, MAX]` ではなく `[-MAX, +MAX]` なのは意図的で、
正当なセーブに小さな負の `cdLeft` が入る（フレーム末で `_cd` が負に振れる）ため。
0 へ丸めると保存 → 復元の一致が壊れる。

破棄ガードも同じ 2 クラスにだけ置いた。派生の `destroy()` は `super.destroy()` を呼ぶか
自分で `_dead` を立てる（`WhirlwindSlashSkill` のように状態も落とす場合は後者）。

### 2. 進化済み基礎の除外は抽選コンテキストの「加算的な」1 フィールド

```
BattleScene.buildDraftCtx()
  → { ..., evolvedBaseIds: this.skills.evolvedBaseIds }

SkillDraftManager._eligible(ctx)
  const evolvedBase = new Set(ctx.evolvedBaseIds || [])
  ...
  if (isActive && evolvedBase.has(m.id)) continue   // 進化済みの基礎は再提示しない
```

`ctx.evolvedBaseIds` を**渡さなければ空集合**として扱われるので、
既存の呼び出し元（火 / 氷 / カタログ表示 / シミュレーション）は挙動が変わらない。
`[]` を渡した場合と省略した場合が同じ候補列になることをテストで固定している。

### 3. 決闘マーカーの寿命を BattleScene の 2 メソッドへ集約した

```
BattleScene
  _duelMarkSeq            // 現在マークしている敵の安定 runtime id（唯一の正）
  _setDuelMark(target)    // 古いマークを外してから新しいマークを付ける
  _clearDuelMark()        // _duelMarkSeq を頼りにボス / プール内から外す
```

`refreshDuel()` の解除パス・`update()` の「決闘が終わったフレーム」・`cleanup()` の 3 か所から
必ず `_clearDuelMark()` を通る。**スキル側と `WarriorCombatSystem` 側はマーカーを知らない**
（`WarriorCombatSystem` は `_seq` しか持たず、見た目の責務を持たない設計を維持）。

### 4. 上限クランプは `WarriorCombatSystem` の入口と復元の両方へ

```
beginCounterWindow()   leftMs → clamp(0, counter.maxWindowMs)
                       max    → clamp(1, counter.maxCountersPerWindow)
placeRallyField()      radius → clamp(1, rally.maxRadius)
（反撃窓の復元も同じクランプを通る）
```

`WARRIOR_DEFAULTS` にも同じ値を置いたので、`balance.json` を渡さないテスト経路でも同じ上限になる。
**クランプ値をコードへハードコードしていない**（既定値も含めて 1 か所にまとまっている）。

### 5. 旋風の再開はデータ由来の上限で頭打ち

`WhirlwindSlashSkill.restoreState()` は保存された残り時間を
`stats.duration` で頭打ちにする（`BloodstormWhirlwindSkill` も同じ経路を継承）。
他の再開型（薙ぎ進軍 / 刃防陣）は M8-D 時点で既にクランプ済みだった。

### 6. `hitOncePerTarget` を data から読むようにした

`ChargeSlashSkill` の「同一敵へ 1 度だけ」は実装にハードコードされていた。
`config.hitOncePerTarget === false` のときだけ毎フレーム判定へ切り替わる形にして、
data の宣言が実際に効くようにした（現在の data は `true` なので挙動は不変）。

### 変えていないもの

- 新しいクラス / マネージャ / Scene / システムを 1 つも追加していない。
- 共通 `SkillBase` / `EvolvedSkillBase` / `SkillManager` / `PoolManager` / `SpatialGrid` /
  `StatusEffectManager` / `FreezeSystem` / `SaveCoordinator` を触っていない。
- `save_version` は v6 のまま（保存キーを 1 つも増やしていない）。
- npm 依存・ビルド工程・外部通信は増やしていない。

---

## Milestone 9-A: 3 ジョブ横断・共通システム総合監査（構造上の変更点）

**新しいクラス / マネージャは 0 件。** 変更は 4 か所の既存共通経路だけ。

### 1. cap の形が分類を強制する（DataManager.skillCap）

```
balance.json
  skillCaps:        { name: { value } | { low, medium, high, ultra } }
  skillCapClasses:  { name: 'visual' | 'gameplay' | 'safety' }   // 分類の正
  gameplayLimits:   { maxEnemies: 200, maxProjectiles: 400 }     // プール上限（品質非依存）

DataManager.skillCap(name, quality, fallback)
  → c.value があれば品質と無関係にそれを返す（gameplay / safety）
  → 無ければ従来どおり品質キーで引く（visual）
```

単一値の形は「品質で戦闘結果が変わる状態へ**静かに戻せない**」ための構造。
4 段階へ戻すには data の形を変える必要があり、validate-data と分類テストが必ず落ちる。

### 2. BattleScene の品質分岐の削減

- 敵 / 弾プールの上限: `effectQuality` → **`gameplayLimits`** 由来へ。
- hitStop: 品質ゲートを削除（ロジック frame を止める処理は gameplay）。
- 魂炎ノード（敵密度 / エフェクト限界突破）: 品質ゲートを削除。
- 残る品質参照は演出（particleScale / damageNumbers / shake / flash / sparks / particleBudget /
  進化演出の lowFx）と、単一値 cap に対しては no-op の `skillCap(…, quality, …)` 引数だけ。

### 3. cdLeft 改ざん耐性の共通入口（SkillManager）

```
SkillManager.restoreRuntime(obj)
  → 各スキルへ渡す前に _sanitizeRuntimeState(state) を通す
     cdLeft が number でない / 非有限 → キーごと除去（採用しない）
     |cdLeft| > 120000              → ±120s へクランプ
```

火 / 氷の 27 ファイル（96 スキル）の restore 実装は 1 行も変えずに、M8-F の戦士 `restoreCd()` と
同じ保証を全 144 スキルへ拡張した。戦士は基底との**二重防御**になる。
正当なセーブは常に範囲内なので、復元結果・候補列・runtime trace のハッシュは不変。

### 4. F8 の 3 ジョブ比較（表示のみ）

`jobAnalysisReport()` に「— 3 ジョブ比較（M9-A）—」ブロックを追加
（3 ジョブの A/P/E・rarity・Lv80 対象・cap 分類数・品質不変の明示）。profile を変更しない。

### テスト側の共通土台（suite には数えない）

- `tests/cap-shape.mjs` — cap の 2 形（単一値 / 4 段階）の判定・展開・分類ヘルパー。
  M9-A 以前に書かれた単調性検査は「4 段階展開ビュー」で意味を変えずに通る。
- `tests/cross-job-common.mjs` — 3 ジョブを同一条件で実駆動する `runJob()`（gameplay trace 生成）と、
  production SkillDraftManager を任意ジョブで回す汎用 `simDraft()`。Math.random 不使用。
