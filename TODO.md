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
- [ ] ジョブレベル・ジョブ経験値・ジョブ育成特典（`profile.jobProgress` が拡張口）
- [ ] 複数ジョブ・ジョブ選択画面・他ジョブ継承（`futureInheritanceSettings`/`extraAllowedIds` が拡張口）
- [ ] passive 熟練度の具体的報酬・条件付き共通スキル・legendary の追加

---

## 拡張余地（今後）
- [ ] 周回長の拡張（10分/15分/無限モード）
- [ ] 追加の敵・ボス
- [ ] 実績システム・図鑑の本実装
- [ ] スキル分岐（熟練度による）
