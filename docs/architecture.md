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
