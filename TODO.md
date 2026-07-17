# TODO / ロードマップ

Milestone 1 は実装済み。以下は **Milestone 2 以降の設計と作業項目**（未実装）。
コードは書かず、方針とタスク分解のみを記載する。データ定義（`data/*.json`）は先行整備済み。

## 凡例
- [x] 実装済み（M1）
- [ ] 未実装（設計のみ）

---

## Milestone 1 — 実装済み

- [x] 静的サイト（`index.html` / `styles/` / `src/` / `data/`、すべて相対パス）
- [x] GitHub Pages 設定（`.github/workflows/pages.yml`, `.nojekyll`）
- [x] Phaser 3.90.0 起動（640×360, pixelArt, roundPixels, FIT スケール, WebGL優先/Canvasフォールバック）
- [x] タイトル画面（はじめから/続きから[セーブ無で無効]/拠点/データ管理/設定/全画面/バージョン/保存状態）
- [x] 仮ドット素材の動的生成（`BootScene` の Graphics → generateTexture）
- [x] プレイヤー移動・ダッシュ（無敵・回数・時間回復）
- [x] 敵出現（スライム/コウモリ/骸骨/ゴーレム、フェーズ別スポーン、エリート率）
- [x] 自動火球（最寄り敵検索は間隔実行、発射数/貫通/爆発/ノックバック）
- [x] 敵撃破・経験値ジェム・吸収・レベルアップ3択（キー1〜3 / クリック）
- [x] オブジェクトプール（敵/弾/ジェム）
- [x] 一時停止（Escape）・タブ非表示/フォーカス喪失での自動停止（再開ボタン表示）
- [x] データ検証 `tests/validate-data.mjs` と `validate.yml`

---

## Milestone 2 — スキル・ボス・リザルト・演出【実装済み】

### スキルシステム
- [x] `skills/SkillBase.js` と各スキルクラス（Fireball / FlamePillar / BurningTrail / OrbitingFlame / Meteor）
- [x] `systems/SkillManager.js`: 所持スキルの取得/更新/発動/統計を統括
- [x] レベルアップ3択で「新規スキル取得」「既存スキル強化（最大Lv8）」を提示（`data/skills.json` 駆動）。同じスキルの重複新規取得なし
- [x] 火柱: 予告表示→火柱発生→範囲ダメージ→軽い打ち上げ（ノックバック）
- [x] 燃える軌跡: 移動経路に炎を残し継続ダメージ＋減速
- [x] 周回する炎: プレイヤー周囲を火球が回転（個数/速度/半径）
- [x] 隕石: 敵密集地点へ落下、大範囲＋画面揺れ、長CD
- [x] スキル統計の記録（発動/命中/討伐/累計ダメージ/最高Lv）を戦闘中に集計。
      ※ 熟練度の恒久保存とボーナスは M3（現状は戦闘内リザルト用途のみ）

### ボス
- [x] `entities/Boss.js`: `data/bosses.json` 駆動。専用テクスチャ。突進/円形弾/雑魚召喚、HP50%以下で激昂（攻撃頻度上昇）
- [x] 5分経過でボス出現 → 撃破で勝利 / プレイヤー死亡で敗北
- [x] `entities/Projectile.js` を敵弾にも流用（hostile フラグ + 専用プール）

### リザルト
- [x] `scenes/ResultScene.js`: 勝敗/生存時間/討伐数/ボス討伐数/各スキルの与ダメージ・討伐数/最高ダメージ/再挑戦/タイトルへ。
      ※「拠点へ戻る」は拠点実装（M3）まで「タイトルへ」で代替。獲得残り火は表示のみ（反映は M3）

### エフェクト（`systems/EffectManager.js`）
- [x] パーティクル/軌跡/爆発/加算合成/白フラッシュ/ヒットストップ/画面揺れ/火の粉/被弾フラッシュ/死亡破片/ダメージ数字/クリティカル大数字/予告
- [x] スキルレベルに応じた見た目の段階強化（visual: small/medium/large/huge でスケール）
- [x] **ダメージ判定とエフェクトの分離**（combat.* が判定、effects.* が演出。無効化しても結果不変）
- [x] 設定（一時停止メニュー）: エフェクト品質（low/medium/high/ultra）・ダメージ数字・画面揺れの切替。
      敵/弾の最大表示数は品質に連動（`data/balance.json` の `effectQuality`）
- 残タスク（M5 の負荷調整で拡張）: 残像/衝撃波の追加表現、パーティクル数の個別スライダー、専用設定画面

### オート移動・一時停止・途中再開
- [x] オート移動の改善: 危険な敵から離れる/ジェム回収/画面端回避/ボス突進回避/手動入力優先（完璧にしない）
- [x] 一時停止メニュー（再開/設定/タイトル）。一時停止時に time/tween を停止し保存
- [x] 途中再開: `active_run.json` から時間・HP・レベル・経験値・所持スキル・討伐数・シードを再構築（敵個体は保存しない）
- [x] `ui/PauseMenu.js` へ切り出し（M3）

---

## Milestone 3 — 拠点・恒久強化・難易度・熟練度【実装済み】

### 拠点
- [x] `scenes/BaseScene.js`（拠点）: 残り火/累計残り火/選択・解放難易度/基礎能力/恒久強化一覧/
      スキル熟練度一覧/累計統計/戦闘開始/難易度選択/タイトルへ。上部メニュー+差し替え式で
      転生画面・実績画面を追加しやすい構成。
- [x] タイトル導線: はじめから/拠点→拠点画面、続きから→途中セーブがあれば戦闘へ直接復帰。

### 残り火
- [x] 残り火の正式実装（profile へ保存）。生存時間/討伐/ボス/難易度/勝敗補正で獲得量を算出
      （`data/balance.json` の `emberReward`）。敗北時も獲得（勝利より少）。`lastResultId` で二重加算防止。
- [x] リザルトに 今回獲得/所持/内訳（生存・討伐・ボス・難易度・勝敗補正）を表示。「拠点へ戻る」。

### 恒久強化
- [x] 10種の恒久強化（最大HP/基礎ダメージ/移動速度/経験値/吸収範囲/ダッシュ回復/被弾無敵/残り火獲得/
      オート性能/初期スキルLv）を `data/permanent-upgrades.json`（id/displayName/description/maxLevel/
      baseCost/costGrowth/effectType/effectPerLevel/unlockCondition/displayOrder）で管理。
- [x] `systems/ProgressionManager.js`: 費用逓増・購入検証（残り火不足/最大/条件未達）・即保存・
      連打二重購入防止。効果は戦闘開始時にプレイヤーへ適用（`dealDamage` の damageMult ほか）。

### 難易度
- [x] 5段階の難易度選択・解放（勝利で次を解放、敗北では解放しない）。未解放はロック表示で選択・開始不可。
- [x] 難易度倍率（敵HP/攻撃/速度/出現数/エリート率/ボスHP/残り火）を敵と報酬へ反映。途中再開は保存難易度を使用。

### スキル熟練度
- [x] M2 の統計を profile の `skillMastery` へ恒久加算（発動/命中/討伐/累計ダメージ/最高Lv/使用周回数/進化回数=0）。
- [x] 熟練度 Lv1-20（`data/skill-mastery.json` の exp 重み・曲線）。報酬は小さな基礎補正
      （ダメージ/クールダウン/範囲/初期Lv）。Lv1 は恒等で M2 威力を変えない。
- [x] 拠点で 熟練度Lv/次までの進捗/累計ダメージ・討伐/現在ボーナス を確認可能。将来（M4）に
      分岐・新候補・進化緩和・エフェクト変化を足せる構造。

### profile / リファクタ
- [x] SaveManager profile を v3 スキーマへ拡張（embers/lifetimeEmbers/permanentUpgrades/selectedDifficulty/
      unlockedDifficulties/highestClearedDifficulty/skillMastery/statistics/lastResultId）。
      v1/v2 からの移行と欠落フィールドの安全初期化。active_run は v2/v3 互換を維持。
- [x] BattleScene から責務分離: `SpawnManager` / `BattleManager` / `ui/PauseMenu` / `ProgressionManager`
      （挙動維持のまま段階分離。M2 の戦闘結果を変えない）。

### M3 残タスク（将来）
- [ ] `SpawnManager`/`BattleManager` のさらなる純化、`BaseScene` のスクロール対応（項目増加時）
- [ ] `UpgradeManager` 名称での独立（現状は ProgressionManager に内包）

---

## Milestone 4 — 進化・転生・魂炎【実装済み】

### スキル進化
- [x] 進化3種（`data/skill-evolutions.json` 駆動）: 火球→業火弾幕 / 火柱→煉獄噴火 / 燃える軌跡→永劫火界。
      `skills/EvolvedSkillBase` + 3クラス、`systems/EvolutionManager`（条件判定・熟練度連携）。
- [x] レベルアップ時に進化候補を専用色/枠/名称で提示（`LevelUpScene`）。枠を消費せず置換、一周一度のみ。
- [x] `scenes/EvolutionScene`（演出）を進化処理から分離（演出無効でも置換は完了）。演出中は戦闘停止。
- [x] 進化後ダメージ・討伐を統計記録し、基礎スキル熟練度へ加算＋`evolutions`＋`evolutionStatistics`。
- [x] 安全上限（発射数/連鎖/爆発/感染/引き寄せ）を `data/skill-evolutions.json` と `balance.combatCaps` に分離。

### 熟練度連携
- [x] Lv5 候補率↑ / Lv10 初期Lv2 / Lv15 進化条件緩和 / Lv20 進化後追加効果（`data/skill-mastery.json` の evolution）。

### 転生・魂炎
- [x] `systems/ReincarnationManager`、拠点「転生」タブ（条件・進捗・リセット/維持・獲得魂炎・二段階確認）。
- [x] 転生条件（難易度3クリア or 今周回累計残り火）を**周回単位**で判定（無限転生farming防止）。`data/reincarnation.json`。
- [x] 魂炎計算（log/√で緩やか、初回≥1、`lastReincarnationId` で二重取得防止）。転生後 profile 即保存。
- [x] 魂炎強化10種（選択肢拡張/初期火力/初期スキルLv/連鎖拡張/敵密度/エフェクト限界/恒久上限/倍速/オートダッシュ/開始ボーナス）。
- [x] 転生後の反映: 転生回数の基礎ダメージ倍率・候補数・初期スキルLv・連鎖上限・敵/エフェクト上限・恒久上限・倍速・オートダッシュ。

### 拠点/セーブ/デバッグ
- [x] BaseScene に転生/魂炎強化タブ追加＋スクロール（ホイール/ドラッグ/スクロールバー/キーボード、640×360維持）。
- [x] profile v4（reincarnationCount/soulflame/lifetimeSoulflame/reincarnationUpgrades/highestEverDifficulty/
      lastReincarnationId/reincarnationHistory/unlockedFeatures/evolutionStatistics/currentCycle）＋v1-v3移行。
      active_run に cycleNumber を保存し転生をまたいだ再開を破棄。
- [x] `?debug=1` 時のみの最小デバッグ機能（拠点/戦闘、F1）。

### M4 残タスク（将来）
- [ ] `scenes/ReincarnationScene` としての独立（現状は BaseScene のタブに内包）
- [ ] 進化後スキルの見た目のさらなる差別化、`evolutionStatistics` のリザルト表示

---

## Milestone 5-A — 戦闘パフォーマンス最適化と計測【実装済み】

### 空間グリッド
- [x] `systems/SpatialGrid.js`（Phaser 非依存の純 JS・Nodeでテスト可）: セルサイズ可変・
      insert/update/remove/clear・queryCircle/queryAABB/findNearest・フィルタ（エリート/ボス）・
      重複なし・死亡/非アクティブ除外・差分更新（別セル移動時のみ付け替え）。設定は `data/balance.json` の `spatialGrid`。
- [x] 近傍検索を空間グリッド経由へ: 火球の最寄り敵/弾の命中候補/爆発範囲/火柱/燃える軌跡/周回する炎/
      隕石の着弾と密集地点/業火弾幕の追撃・連鎖/煉獄噴火の引き寄せ/永劫火界の範囲・炎上感染先/
      敵死亡時の爆発/オート移動の危険敵/経験値ジェムの近傍。
- [x] ボスは単一大型のため個別扱い（挙動同一）。プレイヤー↔敵接触・ボス弾↔プレイヤーは対象少で据え置き。
- [x] 候補を出現順(_seq=Set順)で整列し、旧総当たりと**候補集合＋走査順が一致**（結果不変を保証）。
- [x] プール返却/再利用/Scene終了/途中再開/転生・再挑戦で古い参照を残さない（Pool フックで登録・解除を一元化）。

### オブジェクトプール整理
- [x] `PoolManager` に onSpawn/onRelease フックと生成/再利用/返却カウンタ。返却処理を共通化
      （非表示・body 無効化・velocity 停止・グリッド解除）。
- [x] 再利用時の残留除去（skillId/hostile/tint/velocity/collision/timer/charge/knockback/炎上/`_gridCell`）。

### 計測・デバッグ（`?debug=1` のみ）
- [x] 性能パネル（F2）: FPS/平均/最低・フレーム時間・敵/ボス/味方弾/敵弾/ジェム数・AoE・演出tween・抑制数・
      プール（使用/待機/新規/再利用/返却）・使用セル数・検索/候補/厳密判定数・旧総当り比較 vs 空間比較と削減率。
      更新は 0.5 秒毎（毎フレームではない）。
- [x] グリッド可視化（F3）、空間グリッド ON/OFF 切替（F1 メニュー・旧方式は比較用のみ）、
      実行時セルフチェック `window.RFS_BATTLE.spatialSelfCheck(n)`、負荷テスト（敵+100体）。

### エフェクト負荷・品質上限
- [x] 品質別上限を `data/balance.json` に集約（maxEnemies/maxProjectiles/maxSparksPerBurst/particleScale・
      combatCaps.particleBudget）。品質順の逆転を検証。低品質でも攻撃命中/進化/ボス予告/自機/敵弾は視認可能。

### テスト・検証
- [x] `tests/spatial-nonregression.mjs`（Node標準のみ）: 空間グリッドと総当たりの一致（円/矩形/最寄り/密集/
      死亡・削除・移動後）・フィルタ・重複なし・負荷スケール（100/300/2000体）と削減率。
- [x] `tests/validate-data.mjs` に spatialGrid（cellSize/maxRegistered/必須項目）・品質別上限の逆転・
      combatCaps 整合・不正値（負・非整数）検証を追加。

---

## Milestone 5-B — 保存・データ管理【実装済み】

### 保存アダプター / コーディネーター
- [x] `storage/StorageAdapter.js`（共通IF）+ `BrowserStorageAdapter`(localStorage) / `FolderStorageAdapter`
      (File System Access API) / `MemoryStorageAdapter`(テスト)。単位は checksum 付きエンベロープ。
- [x] `storage/SaveCoordinator.js`: デバウンス+キューで同時書き込み回避・最新のみ保存（古い保存が新しい保存を上書きしない）・
      フォルダ(primary)+ブラウザ(mirror)・失敗時フォールバック・バックアップ方針・manifest 更新・複数タブ制御。
- [x] `storage/SaveValidator.js`（checksum/エンベロープ/インポート検証/プロトタイプ汚染ガード）・
      `SaveConflictResolver.js`（競合検出/推奨）・`SaveService.js`（UI ファサード）・`idb.js`（ハンドル保存）。
- [x] `SaveManager` を localStorage 同期ライブキャッシュ＋coordinator 通知へ移行（既存の同期呼び出しは不変）。

### フォルダ保存 / バックアップ / 入出力 / 競合 / 複数タブ
- [x] `window.showDirectoryPicker()`（ユーザー操作のみ）→ `ReincarnationFlameSurvivorData/`
      （profile/active_run/settings/manifest/backups）。一時→検証→本→検証→manifest の安全書き込み。
- [x] `FileSystemDirectoryHandle` を IndexedDB へ保存し次回起動で権限確認（自動でダイアログは出さない・再接続で許可）。
- [x] 自動保存（20秒毎/候補・進化選択後/一時停止/戦闘終了/恒久・魂炎強化購入/転生/設定変更/タブ非表示直前/今すぐ保存）。
- [x] バックアップ（上書き前に退避・自動10/手動5世代・自動最小5分・復元前に自動バックアップ・確認付き・自動復元しない）。
- [x] JSON エクスポート（一式/個別・Blob・外部送信なし）/ インポート（構文・版・型・負通貨・不正レベル・
      存在しない難易度/スキル/進化・巨大ファイル・危険キーを検証。比較表示→置換/維持/キャンセル・自動マージなし）。
- [x] 競合検出/解決 UI（横並び比較・推奨表示・採用/両方エクスポート/読み取り専用・自動決定しない・非採用側をバックアップ）。
- [x] 複数タブ（BroadcastChannel + 書き込みロック + writerId、後発は読み取り専用・引き継ぎ可能）。
- [x] `scenes/DataManagementScene.js`（データ管理画面）+ タイトル/拠点導線。`?debug=1` の保存テストパネル。

### profile v5 / テスト
- [x] `systems/profileSchema.js` へ移行処理を分離（純粋関数）。save_version 5・v1〜v4→v5・移行前に旧キー退避（即時削除しない）。
- [x] `tests/save-system.mjs`（Node標準のみ・MemoryStorageAdapter）で移行/checksum/インポート検証/キュー/
      バックアップ/競合/複数タブを検証。`validate-data.mjs` に `save` 設定検証を追加。CI に組込み。

### 今後の候補（未実装）
- [ ] 戦闘/拠点/保存のデバッグを統合した常設パネル
- [ ] クラウド保存・アカウント連携（サーバーレス構成の範囲で）
- [ ] 実機での File System Access API 挙動の自動E2E（ヘッドレスでのフォルダ操作）

---

## Milestone 6-A — スキル抽選基盤【実装済み】

### 分類・枠・ジョブ・レアリティ
- [x] 全取得可能スキルを active/passive に分類。進化後は基礎 active と同じ枠（`skills.json` メタ拡張・`passives.json`）。
- [x] 所持枠: 新規周回 Active4/Passive4（初期火球1枠）。魂炎強化 `active_skill_slots` で Active 4→6→8。満枠時の候補制御。
- [x] `data/jobs.json`（flame_witch のみ）。初期=火球、active プール=既存5種、共通パッシブは全ジョブ対象。継承は拡張口のみ。
- [x] レアリティ common/uncommon/rare/legendary と抽選重み（`data/skill-config.json`）。

### 抽選・決定論・操作
- [x] `systems/SkillDraftManager.js` + `systems/SeededRandom.js`: 巨大 Scene に集約せず分離。ジョブ/枠/所持/前提/排他/
      解放/レアリティ/重み/進化/追放/重複/enabled を考慮。最大Lv除外・進化最低1枠・不足時は水増ししない・0件救済。
- [x] 決定論（Math.random 不使用）。`active_run.draftState`（seed/cursor/levelUpSequence/currentDraftId/
      currentCandidates/各残数/banishedSkillIds）を保存。開いた時点の候補を保存し再読込で不変。リロール時のみ乱数を進める。
- [x] リロール/追放/スキップ（各1周1回・即保存・将来増加できる構造）。`LevelUpScene` を新仕様へ（スロット/残数/追放モード）。

### パッシブ・統計・セーブ
- [x] `systems/PassiveManager.js`: modifier 共通集計（damage/cooldown/area/duration…）。active が最終値を取得する共通経路。
      4種（魔力増幅/高速詠唱/焦熱拡張/残火持続）。未取得は恒等（M5-B 以前と同性能）。適用順を設計書に明記。
- [x] active/passive を区別した統計（passive は runs/level/picks。ダメージ統計は持たせない）。既存 active 熟練度は非破壊移行。
- [x] profile v6（selectedJobId/unlockedJobs/jobProgress/passiveMastery/futureInheritanceSettings）＋ active_run 拡張。v1〜v5 移行。
- [x] `tests/skill-draft.mjs` と `validate-data.mjs`（skill/job/passive/rarity/枠/循環前提/自己conflict）。CI 追加。

---

## Milestone 6-B — 火の魔女ビルド拡張【実装済み】

### 新 active 10種（火の魔女専用・最大Lv8・skills.json）
- [x] 炎槍/拡散火弾/追尾鬼火/連鎖炎/溶岩爆弾/火炎渦/火の精霊/不死鳥の羽/炎の障壁/起爆刻印。
      各 SkillBase 派生クラス（データ駆動・戦闘数値は JSON）。REGISTRY 登録・jobs.json プール15種化・仮アイコン。
### 新進化5種（skill-evolutions.json・枠非消費・補助はパッシブ可）
- [x] 千条炎槍/百鬼燎乱/太陽核崩壊/煉獄大火輪/終焉連鎖。`EvolutionManager.canEvolve` をパッシブ補助対応に拡張。
### 基盤対応（M6-A の抽選/枠/レアリティ/決定論を個別実装せず利用）
- [x] Projectile 拡張（追尾/世代/連鎖/分裂/タグ・再利用時に全状態初期化）。dealDamage にダメージタグ・起爆刻印。
- [x] `Player.takeDamage` の軽減パイプライン（無敵→障壁→HP→致死時不死鳥）。runtimeState を active_run に保存（save_version は据え置き v6）。
- [x] `balance.skillCaps`（品質別）＋毎フレーム予算で分裂/連鎖/感染/起爆の上限。空間グリッド/プール対応。
- [x] active/passive 区別統計＋スキル固有統計(extra)。F4 デバッグパネル。
- [x] `tests/new-fire-skills.mjs`／`tests/new-evolutions.mjs`＋validate-data（skillCaps・進化のパッシブ補助）＋CI。

### 今後の候補（未実装）
- [ ] 拡散火弾/連鎖炎/火の精霊/不死鳥/炎の障壁 への進化追加（evolutionBranches は将来用に空）
- [ ] passive 熟練度の具体的報酬・条件付き共通スキル・legendary の追加

---

## Milestone 6-C — 火の魔女ジョブ育成【実装済み】

### 戦闘レベルとジョブレベルの分離
- [x] battleLevel（周回ごとLv1・battleXp・周回終了でリセット）と jobLevel（profile 恒久・jobTotalXp・転生維持）を分離。
- [x] jobLevel は保存せず `profile.jobProgress[jobId].totalXp` を唯一の正として算出（現在Lv/次まで/進行度は表示時計算）。

### 共通データ・純ロジック（新ジョブ再利用可）
- [x] `data/job-progression.json`（jobId/levelCap/xpCurve/xpReward/perLevelBonuses/milestones）。火の魔女をハードコードしない。
- [x] `JobProgressionManager`（XP曲線・レベル算出・周回報酬・二重獲得防止・profile 更新）。
- [x] `JobModifierManager`（jobLevel→補正解決・ダメージタグ適用・残響・抽選重み・リロール・serialize）。各スキルは profile を直接参照しない。

### XP・周回報酬・二重獲得防止
- [x] 累計XP `25(L-1)^2 + 75(L-1)`・Lv1-100・単調増加・Lv100頭打ち・超過分保持・負数/NaN/Infinity拒否。
- [x] 周回終了時にまとめて付与（勝敗両方・戦闘中は付与しない）。生存/通常(上限2000)/エリート/ボス/勝利ボーナス×難易度倍率。
- [x] `runId`(=resultId)＋`awardedRunIds`(上限40)で再表示/戻る/保存失敗復帰の二重獲得を防止。SaveCoordinator 経由で保存。

### 基本成長・到達報酬（火の魔女使用中のみ・Lv1恒等）
- [x] 火ダメージ+0.35%/Lv・DoT+0.50%/Lv・範囲+0.10%/Lv（dealDamage / stats・passiveAreaMult）。
- [x] Lv5火力/Lv10弾速/Lv20CD/Lv30リロール/Lv40爆炎/Lv50残響/Lv60進化/Lv70抽選重み/Lv80発射数/Lv90CD/Lv100完全残響。
- [x] 残響詠唱は共通発動イベント（recordCast→_onSkillCast→echoCast）。防御/反応/DoT/召喚射撃/連鎖/分裂/残響発は対象外。1フレーム上限＋一時停止で不進行。

### 周回開始時のレベル固定・保存
- [x] active_run に jobLevelAtStart/jobTotalXpAtStart/resolvedJobModifiers/jobProgressionVersion/jobRuntime を凍結。途中でprofile側が変わっても進行中周回へ非反映。
- [x] `profile.jobProgress`（totalXp/runs/wins/losses/kills/elite/boss/highest.../evolutions/lastPlayedAt/lastXpGain/awardedRunIds）。save_version 6 維持・転生でリセットしない。
- [x] 比較/競合/インポートサマリに 選択ジョブ・ジョブレベル・jobTotalXp を追加（StorageAdapter.summarize / SaveConflictResolver）。

### UI・デバッグ・テスト
- [x] 拠点「ジョブ育成」タブ（Lv/XPバー/統計/基本補正/次の報酬/Lv5-100一覧・解放区別）。
- [x] リザルトに 今回獲得Job XP/難易度倍率/Lv変化/XPバー/複数レベルアップ/新規解放/Lv100到達/二重獲得済み安全表示。
- [x] 戦闘HUDにジョブ名＋適用中ジョブLv。F5 個別スキル検証（単独化/Lv変更/単独進化/各補正の一時無効/Job Lv一時適用/残響表示・強制/計算内訳）。
- [x] `tests/job-progression.mjs`／`tests/job-modifiers.mjs`＋validate-data（job-progression 検証）＋CI。

### 今後の候補（未実装）
- [ ] 転生レガシー（複数ジョブ実装後に設計）・他ジョブへの効果持ち越し
- [ ] 複数ジョブ・ジョブ選択画面・他ジョブ継承（`futureInheritanceSettings`/`extraAllowedIds` が拡張口）
- [ ] 火の魔女スキル限界突破（Lv8超）・ジョブ実績/レガシー条件（jobProgress 統計が拡張口）

---

## Milestone 6-D — 火の魔女ビルド拡張・第2波【実装済み】

### 新 active 10種（火の魔女専用・最大Lv8・skills.json・戦い方を差別化）
- [x] 灼熱光線(継続レーザー)/火種地雷(罠)/炎月斬(近接)/跳炎弾(反射)/灰燼分身(複製)/血炎契約(HP消費)/弾喰い炉(敵弾吸収)/四方炎獄(画面端波)/熔火鎖(拘束)/爆炎歩法(ダッシュ強化)。REGISTRY登録・jobs.jsonプール25種化・仮アイコン。
### 新進化5種（skill-evolutions.json・枠非消費・補助はパッシブ可）
- [x] 太陽滅却陣/地獄火連鎖陣/炎帝剣域/灰燼軍勢/星喰い炉。進化なし5種の evolutionBranches は空。active25種・進化13種。
### 残響・分身の複製安全（M6-A〜C 基盤を再利用）
- [x] `CastPolicy`（純ロジック）: echoPolicy/clonePolicy(standard/custom/forbidden)＋castContext(origin/generation/powerMultiplier/suppress)。normal→echo/clone を各1世代で停止、echo→*・clone→* は発生しない。
- [x] BattleScene: _onSkillCast/_triggerEcho/performClone/_runReplay/_lastClonableCast。custom=攻撃部分のみ複製、forbidden=対象外。残響↔分身の循環禁止。
### 共通拡張
- [x] `Player.spendHealthCost`（血炎契約・被弾と分離・最低HP1・不死鳥非発動）。`Player` onDash 共通フック→`SkillManager.dispatchDash`（爆炎歩法）。
- [x] `Projectile` 吸収情報(absorbable/…)＋反射(bounce)。`BattleScene.absorbBossBullets`（予告/ビーム/二重吸収防止・完全無敵化しない）。
- [x] `balance.skillCaps` 26種追加（品質別）＋`combat.frameBudget`。runtimeState を active_run に加算保存（save_version v6 維持）。F6 デバッグ。
- [x] `tests/fire-skills-wave2.mjs`／`tests/fire-evolutions-wave2.mjs`／`tests/cast-copy-safety.mjs`＋validate-data（cast メタ）＋CI。

### 今後の候補（M6-E で対応）
- [x] 火の魔女 active 30種への拡張（第3波）→ M6-E で完成

---

## Milestone 6-E — 火の魔女ビルド完成・第3波【実装済み】

### 新 active 5種（火の魔女専用・最大Lv8・skills.json・既存と差別化）
- [x] 火葬の墓標(死亡位置へ墓標→噴火)/炎脈走破(蛇行する炎の亀裂)/三角焔陣(三角形の陣・内部DoT)/灼熱共鳴(炎上数で共鳴段階)/炉心暴走(熱量で加速→過熱→再開)。REGISTRY登録・jobs.jsonプール30種化・仮アイコン。
- [x] Lv1〜8で最低1項目成長（数値は `data/skills.json` の levels に集約）。castMode: 墓標/炎脈/三角/共鳴=periodic、炉心=cooldown。Lv80発射数+1対象は炉心暴走のみ。
### 新進化5種（skill-evolutions.json・枠非消費・補助はパッシブ可）
- [x] 冥炎大霊廟(火葬の墓標+不死鳥の羽)/大地灼断(炎脈走破+燃える軌跡)/六芒煉獄陣(三角焔陣+火炎渦)/万象炎鳴(灼熱共鳴+連鎖炎)/終末炉心(炉心暴走+血炎契約)。active30種・進化18種に完成。
### 全スキル監査（active30種・進化18種）
- [x] 各定義に `castMode`/`echoPolicy`/`clonePolicy`/`canTriggerEcho`/`canBeCopiedByClone`/`echoDescription`/`cloneDescription`/`mainCastEvent`/`lv80ProjectileTarget` を明示。`src/systems/SkillAudit.js` が一元解決（純ロジック・Nodeテスト可）。
- [x] 主発動イベント（recordCast）を攻撃サイクル単位のみに統一。DoTtick/連鎖各対象/分裂弾/爆発各対象/個別起爆/召喚通常射撃/共鳴各連鎖/オーバーヒート開始終了では記録しない。
- [x] 監査修正（挙動不変）: orbiting_flame の主発動を一定間隔にスロットル（ダメージは接触ごと）、fire_spirit は召喚一斉射撃サイクルを主発動として記録、不死鳥/障壁を防御専用 forbidden として明示。
- [x] Job Lv80「発射数+1」対象を独立弾の通常 active6種（fireball/flame_lance/scatter_flame/homing_wisp/ricochet_ember/core_overdrive）に限定。`appliesLv80ProjectileCount` で一元管理。
### 新規インフラ（BattleScene / combat API）
- [x] 敵死亡イベント履歴（墓標系所持時のみ・retain/releaseDeathEvents・recentDeathEvents/consumeDeathEvent・上限管理）。既存の撃破統計/残り火/Job XP/経験値ジェムは不変。
- [x] 炎上中敵の索引（`_burningIndex`・Enemy/Boss.ignite で登録・消火/死亡/返却/終了で解除・burningCount()/burningEnemies()）。全敵走査を避ける軽量索引。
- [x] combat API 追加（retainDeathEvents/releaseDeathEvents/recentDeathEvents/consumeDeathEvent/burningCount/burningEnemies/ignite/registerBurning/worldBounds）。
- [x] LevelUpScene カードに残響/分身/Lv80/主要タグの記号行を追加。`balance.skillCaps` に品質別20種追加。runtimeState（各CD・熱量・オーバーヒート・終末）を active_run へ加算保存（save_version v6 維持）。F7 デバッグ。
- [x] `tests/fire-skills-wave3.mjs`／`tests/fire-evolutions-wave3.mjs`／`tests/skill-tag-audit.mjs`／`tests/cast-event-audit.mjs`＋validate-data（castMode/mainCastEvent/echo・cloneDescription/共鳴閾値昇順/炉心熱量/新skillCaps/新進化条件/未知タグ）＋CI（全15スイート）。

### 今後の候補（M6-F で整備した抽選バランス／未実装は下記「今後」へ）
- [x] 進化相手が候補へ極端に出にくくならない軽い抽選補助（M6-F の synergy で対応）
- [ ] 進化を持たない active への進化系統追加（bloodfire_pact/four_sided_inferno/molten_chains/blazing_step/ash_doppelganger 等・現状 evolutionBranches は空）
- [ ] 新ジョブ・ジョブ選択画面・他ジョブ継承・転生レガシー（`futureInheritanceSettings`/`extraAllowedIds` が拡張口）
- [ ] 新 passive・legendary の追加、火の魔女スキル限界突破（Lv8超）・進化後スキルのレベルアップ
- [ ] 新規敵/ボス/難易度、図鑑・実績の本実装、装備ドロップ

---

## Milestone 6-F — 通常プレイ整備・バランス検証基盤【実装済み】

火の魔女は M6-E で完成済み（active30/進化18/passive4/Job Lv1〜100）。M6-F は**新スキルを追加せず**、通常プレイできる状態へ整える
整備・検証基盤を実装した。すべて Phaser 非依存の純ロジック（Node テスト可能）で、**外部送信・自動調整はしない**。**save_version は v6 のまま**。

### 新規モジュール（`src/systems/`・純ロジック）
- [x] `SkillCatalog.js`: 実データから active30/passive4/進化18のカタログ生成・**孤立/未登録/参照不整合を検出**（`buildCatalog`/`evolutionRecipes`/`evolutionPartnerIds`）。SkillManager の `registeredSkillIds()`/`skillsWithRuntimeState()` を注入・`SkillAudit` と共有。
- [x] `DraftBalanceAnalyzer.js`: 決定論的な抽選シミュレーター。**本番の `SkillDraftManager`+`SeededRandom` を直接駆動**（抽選ロジックを複製しない）。方針 random/evolution-first/build/diversity・枠4/6/8・候補3/4・Job Lv・多数シード。
- [x] `CombatTelemetry.js`: 1周回のローカル戦闘テレメトリ（外部送信なし）。スキル別 DPS/damageShare/echo/clone/上限/防御値・周回FPS（平均/最低/p95）。
- [x] `RunBalanceSummary.js`: `profile.balanceTelemetry` の集計・整形（immutable・例外を投げない）。通常周回=summaryBySkill＋recentRuns、debugRun=debugRuns へ分離・上限あり（80スキル/各10周/262144B）。
- [x] `BalanceWarnings.js`: 集計から**開発用警告のみ**生成（自動調整しない）。しきい値 `data/balance-thresholds.json`・最低サンプル数未満は警告しない。
- [x] `BalancePlaytest.js`: 通常プレイ検証モードの設定・オーバーライド解決（**profile 不変・常に debugRun**）。

### データ・抽選
- [x] `skill-config.json` に `synergy` ブロック追加（進化相手の軽い抽選補助）。レアリティ重みへ乗算・**決定論不変・data で無効化可**・`synergy=null` は旧挙動と byte 一致・legendary を common 並みに増やさない。
- [x] `SkillDraftManager` に synergy 対応（`_synergyMult`）と `draftsSinceProgress`（進展なしの pity・保存・進化成立で `markProgress()` リセット）を追加。決定論維持。
- [x] `data/balance-thresholds.json`（新規・警告しきい値＋テレメトリ上限）。
- [x] fallback 定数の JSON 移行（doomsday_core の heatAccelPct/doomFireMs/doomBlastMs・tri_flame_array.edgeWidth・hexagram_inferno_array.outerWidth/beamWidth・orbiting_flame.castPulseMs・fire_spirit.summonPulseMs）。コードの `*_SAFE` は安全既定であってバランス値ではない。

### BattleScene 統合・UI・デバッグ
- [x] 周回開始で SkillCatalog 構築・進化レシピ保持・`buildDraftCtx` に synergy(partnerIds/battleLevel) 付与・進化成立で `markProgress()`。
- [x] CombatTelemetry を保持し FPS/上限到達/スキル取得・進化を記録。周回終了で `finalizeTelemetry`→`RunBalanceSummary.applyRun`（**低優先保存**・失敗しても進行/保存を壊さない）。
- [x] **F8 = Balance Playtest**（`?debug=1` 限定・F1〜F7 非競合）。seed/難易度/品質/速度/Job Lv/active枠4-6-8/候補3-4/リロール/恒久強化(通常|全無効)/熟練度(通常|無効)/Job補正(通常|無効)/戦闘時間(5分|1分|10分)。**profile 不変・debugRun・スキル自動付与なし・ゴッドモード無効**。
- [x] F4〜F8 のデバッグ補正を使った周回は debugRun としてマーク（通常統計へ混ぜない）。
- [x] ResultScene「Balance詳細」（スキル別 DPS/割合/残響/分身/上限/防御値＋周回 FPS/cap/seed・debugRun は「通常統計へ記録していません」明示）。BaseScene「カタログ」タブ（開発用）。LevelUpScene カードは `SkillAudit.skillSummaryLine` で統一。

### 保存・テスト
- [x] `profile.balanceTelemetry` を加算追加（enabled/summaryBySkill/recentRuns/debugRuns・型安全・上限あり）。**save_version v6 維持**。`draftsSinceProgress` は `active_run.draftState` に保存。テレメトリ保存失敗は profile 保存/進行を壊さない。
- [x] 新規テスト: `skill-catalog`/`draft-balance-simulation`（CI軽量200seed・HEAVY=1で2500）/`evolution-feasibility`/`combat-telemetry`/`balance-playtest`。`validate-data` に synergy/balance-thresholds/castMode 検証追加。既存15＋新5＝**全20スイート通過**。

### 今後の候補（未実装・次のマイルストーン候補）
- [ ] **新ジョブ・ジョブ選択画面**（`jobs.json`/`job-progression.json` が拡張口・現在は flame_witch のみ）
- [ ] **進化を持たない12種への進化系統追加**（blazing_step/bloodfire_pact/chain_flame/fire_spirit/flame_barrier/four_sided_inferno/meteor/molten_chains/orbiting_flame/phoenix_feather/ricochet_ember/scatter_flame・現状 evolutionBranches は空）
- [ ] **限界突破**（火の魔女スキル Lv8超）・進化後スキルのレベルアップ
- [ ] **図鑑・実績の本実装**（現状は拠点統計・カタログタブ＝開発用のみ）
- [ ] **転生レガシー・他ジョブ継承**（複数ジョブ実装後・`futureInheritanceSettings`/`extraAllowedIds` が拡張口）
- [ ] 新 active/passive/進化・新 legendary の追加
- [ ] 新規敵/ボス/難易度、装備・ドロップ、クラウド保存/外部通信

---

## Milestone 7-A — 2人目のジョブ「氷術師」＋状態異常/凍結基盤【実装済み】

火の魔女（active30/進化18/passive4/Job Lv1〜100）を**不変**のまま、2人目のジョブ **氷術師（frost_mage・氷属性）** と、
火の魔女の炎上を含む**汎用の状態異常フレームワーク**を追加した。抽選/枠/パッシブ/進化/ジョブ育成（M6-A〜M6-F）の共通経路を
再利用し、**火氷の属性反応は実装しない**（炎上と冷気/凍結は独立共存）。**save_version は v6 のまま**。詳細は `docs/jobs.md`・`docs/status-effects.md`。

### 氷術師（frost_mage・氷属性・Job Lv1〜100）
- [x] active5（氷晶弾/氷輪爆/氷河槍/永久凍土/氷壁）・passive4（氷晶増幅/急速冷却/凍域拡張/余寒残留）・進化3（ダイヤモンドブリザード/絶対零度領域/天穿氷河槍）。`jobs.json` に frost_mage、REGISTRY へ各挙動クラス登録・仮アイコン。
- [x] 基本成長（氷Dmg+0.35%/Lv・冷気+0.30%/Lv・粉砕+0.40%/Lv）・到達報酬 Lv5〜100（凍結狩り/氷砕連鎖/氷弾増殖/絶対零度 等）を `job-progression.json` に集約。

### ジョブ選択・分離
- [x] 拠点「ジョブ育成」タブを火の魔女／氷術師の**カード表示＋選択画面**へ拡張。`profile.selectedJobId`（既定 flame_witch）。**進行中周回はジョブ変更不可**（次の新規周回から有効）。
- [x] `active_run.jobId`/`jobElement` で周回ジョブを固定。ジョブごとにスキルプール／Job XP／Job Lv／統計を**完全分離**。

### 汎用状態異常フレームワーク（`data/status-effects.json`）
- [x] `StatusEffectRegistry`（照会）/`StatusEffectManager`（適用・索引・更新・解除・状態異常専用 SeededRandom）/`FreezeSystem`（凍結確率・冷気減速・ボス氷砕ゲージ・粉砕の純計算）。M7-A の正式状態: burning/chill/frozen/freeze_immunity/frostbreak_vulnerability。
- [x] 既存の炎上(burning)を汎用索引へ移行（ダメージ/持続/灼熱共鳴/万象炎鳴/統計は不変・`Enemy.ignite` 互換経路維持・burning は索引上限なし）。
- [x] 冷気→減速（通常最大50%/エリート35%・ボスは減速なし）・自然減衰（余寒残留で緩和・下限あり）。凍結（確率式＋確定閾値・多段は低 procCoefficient＋判定回数上限で永久凍結防止・noExtend・凍結中もダメージ可・解除後 freeze_immunity）。
- [x] ボス氷砕(frostbreak)（冷気をゲージへ変換・閾値で硬直＋氷砕脆弱×1.15＋ゲージリセット・break 毎に閾値×1.30 上限×3.0・HUD ゲージ表示）。粉砕(shatter)（凍結中の通常敵/エリートへ・固定+スキル威力+最大HP係数・上限つき・再帰なし・ボスは frostbreak で代替）。
- [x] `JobModifierManager` を複数ジョブ・複数属性へ拡張（primaryElement 一致時のみ属性補正・火の魔女の補正は同値維持）。
- [x] `active_run` へ jobElement/statusRng(cursor)/ボス frostbreak 状態 を保存。品質別 skillCaps に状態異常/氷スキル上限追加。F9 状態デバッグ。テレメトリへ氷統計フィールド追加（ResultScene に表示・debugRun 分離）。
- [x] 新規テスト: status-effects/freeze-system/multi-job-selection/frost-job-progression/frost-skills/frost-evolutions/multi-job-draft/status-save-nonregression（`validate.yml` にステップ追加）。

### M7-A で**実装しない**もの（明示的に対象外）
- [ ] 氷術師の active 6種目以降・氷 passive の追加・氷 legendary・限界突破（Lv8超）
- [ ] 3人目以降のジョブ・ジョブ間継承（`futureInheritanceSettings`/`extraAllowedIds` は拡張口のみ）
- [ ] **火と氷の属性反応**（火で凍結解除／氷で消火／蒸発／融解・炎上と冷気/凍結は独立共存のまま。付与時の source element のみ保持）
- [ ] **転生レガシー・他ジョブへの効果持ち越し**（複数ジョブが揃ったので次に設計候補）
- [ ] プレイヤー側の状態異常（被凍結など）・氷属性の敵/ボス・新難易度

### 次のマイルストーン候補
- [ ] **氷術師の拡張**（active/passive/進化の追加・氷ビルドの多様化）
- [ ] **3人目のジョブ**（雷/毒 など新属性・`StatusEffectManager` に新状態を追加）
- [ ] **属性反応**（火⇄氷 など状態異常間の相互作用・付与時の source element を活用）
- [ ] **転生レガシー**（複数ジョブをまたぐ恒久継承の設計）

---

## 拡張余地（今後）
- [ ] 周回長の拡張（10分/15分/無限モード）
- [ ] 追加の敵・ボス
- [ ] 実績システム・図鑑の本実装
- [ ] スキル分岐（熟練度による）
