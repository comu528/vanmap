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

## Milestone 7-B（実装済み）— 氷術師のスキル拡張（active15 / 進化8）

氷術師の active を10種・進化を5種追加し、氷ビルドの多様性を増やした。**passive は4種のまま**。全て `data/skills.json` の Lv1〜8 データ駆動で、
冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路を使用（独自凍結タイマーなし）。**Math.random 不使用（決定論）**・**save_version は v6 のまま**。

### 新 active10種（frost_mage 専用・element ice・maxLevel8）
- [x] 氷柱斉射 `icicle_volley`（common・cooldown・projectile・**Lv80発射数対象**・連射）/ 氷晶環 `frost_orbit`（common・continuous・周回接触）/ 凍結光線 `freezing_ray`（uncommon・continuous・beam・冷気ランプ・指定間隔粉砕）。
- [x] 雹嵐 `hailstorm`（uncommon・periodic・範囲）/ 氷結地雷 `cryo_mine`（common・reactive・trap・粉砕）/ 雪精霊 `frost_spirit`（uncommon・continuous・召喚）。
- [x] 氷牢封印 `ice_prison`（rare・cooldown・control・条件付き凍結／ボスは氷砕ゲージ）/ 雪崩奔流 `avalanche`（uncommon・periodic・wave・押し流し）。
- [x] 氷鏡結界 `mirror_ice`（rare・defensive・敵弾吸収＋反撃・runtimeState cdLeft/activeLeft/durabilityLeft）/ 氷河墜落 `glacier_drop`（legendary・cooldown・遅延大範囲・runtimeState pendingImpactLeft/X/Y）。

### 新進化5種（EvolvedSkillBase・単一形態・**Job Lv80対象外**）
- [x] 天晶氷嵐 `crystal_tempest`（icicle_volley + frost_amplification Lv4）/ 絶対零光 `absolute_zero_ray`（freezing_ray + rapid_freezing Lv4）/ 白魔大氷災 `whiteout_cataclysm`（hailstorm + lingering_cold Lv4）。
- [x] 雪后氷霊陣 `frost_queen_court`（frost_spirit + frozen_expansion Lv4）/ 終末氷河奔流 `world_end_avalanche`（avalanche + ice_wall Lv4）。

### 監査・保存・テスト
- [x] castMode/mainCastEvent/echoPolicy/clonePolicy/lv80ProjectileTarget/procCoefficient/tags を全15active・8進化で宣言。主発動のみ recordCast（各弾/tick/命中/雹/地雷/精霊射撃/波接触では記録しない）。echo/clone は再帰せず、防御 `mirror_ice` は echo forbidden・複製なし。
- [x] 全CD/周期/設置/防御/遅延型に必要な runtimeState を保存し、再開直後の無料再発動・常設物/召喚/地雷/領域/落下の二重生成を防止。常設型（氷晶環/雪精霊/雪后氷霊陣）は CD を持たず再構築で復元。
- [x] 品質別 skillCaps を29種追加（low≤medium≤high≤ultra）。Job Lv80対象は `SkillAudit` で一元管理（新規 active は `icicle_volley` のみ）。
- [x] 新規テスト5種: `frost-skills-wave2` / `frost-evolutions-wave2` / `frost-policy-audit` / `frost-runtime-save-wave2`（実クラスのランタイムスモーク＋保存round-trip）/ `frost-determinism-wave2`（Math.random不使用＋同一状態で同一攻撃パターン）。`validate.yml` にステップ追加。`validate-data.mjs` に M7-B 検証を追加。
- [x] **非回帰**: 火の魔女 active30/進化18・同seed抽選、氷術師既存 active5/進化3、冷気/凍結/免疫/粉砕/ボス氷砕、selectedJobId/active_run固定、M5-B保存・M6-Fテレメトリ・M7-A状態異常・氷CD保存（全34テストスイート通過）。

### M7-B で**実装しない**もの（対象外）
- [ ] 氷術師 active 16種目以降・進化9種目以降・**新 passive**・氷 legendary の追加・限界突破（Lv8超）・進化後レベルアップ。
- [ ] 3人目のジョブ・ジョブ間継承・**火と氷の属性反応**・転生レガシー・新敵/新ボス/新難易度・装備/ドロップ・正式図鑑/実績。

> **実ブラウザ未確認**: 本環境では Phaser 実プレイ確認を行っていない。データ検証・純ロジック・最小 Phaser モックによるランタイムスモークは通過済みだが、
> 実際の描画・当たり判定・体感バランス・60FPS 維持はブラウザでの確認が必要（`docs/test-guide.md` の M7-B 項目参照）。

## Milestone 7-B.1（実装済み）— 状態異常の視認性・実動作検証

新スキル・進化・ジョブ・データ数値は追加せず、**冷気/減速/凍結/凍結耐性/粉砕/ボス氷砕/炎上が実際に機能しているかを画面で判別できる**ようにした。
状態ロジック（`StatusEffectManager`/`FreezeSystem`）は不変で、**判定・ダメージ・凍結確率・status RNG cursor・ボス氷砕値は変更なし**。**save_version v6 維持・表示状態は保存しない**。

### 表示（`src/systems/StatusVisualManager.js`・オーバーレイ層）
- [x] 冷気段階（0=none / 1〜39%=薄い水色 / 40〜74%=水色縁＋足元氷輪 / 75%+=青白縁＋氷結晶）・確定閾値90%で一度光る事前通知・chill=0 で完全解除。
- [x] 冷気減速の可視化（足元氷輪/残像・高冷気時のみ）。frozen の氷殻＋開始/解除の氷片演出（本体を隠す厚氷・画面白フラッシュは禁止）。freeze_immunity の盾雪マーク。
- [x] 粉砕の氷片放射＋衝撃輪＋「SHATTER」フロートテキスト（通常ダメージと区別）。頭上状態アイコン（優先度 frozen>burning>freeze_immunity>chill_high・1体あたり最大数）。
- [x] **`enemy.setTint` を状態ごとに奪わない**（被弾フラッシュ/ダッシャー予告/エリート色を上書きしない）。Enemy の凍結/冷気 tint をオーバーレイ層へ移設。

### ボス氷砕（`src/ui/BossFrostbreakDisplay.js`・HUD）
- [x] 氷術師かつボス存在時のみ表示（火の魔女/ボス不在で空ゲージを出さない）。現在値/必要値・割合・break回数・cooldown・脆弱残秒・ゲージ増加の反応・**FROST BREAK 演出**・vuln 中の点滅。次回 threshold 増加後も正しく更新。
- [x] fire ダメージは増えず ice ダメージのみ増える既存処理を維持（`bossIceVulnMultiplier` は ice のみ）。

### イベント・デバッグ（`StatusEffectManager` イベント / `src/ui/StatusDebugPanel.js`）
- [x] 状態イベント（chillChanged/chillThresholdNear/frozenStarted/frozenEnded/freezeImmunityStarted/Ended/shatterTriggered/bossFrostGaugeChanged/frostbreakTriggered/frostbreakVulnerabilityStarted/Ended）を通知（RNG/判定に影響しない）。各スキルクラスからは表示を生成しない。
- [x] `?debug=1` の **F10 状態デバッグパネル**: 対象敵クリック選択（死亡/返却で解除）・HP/種別/chill/chillCap/比率/確定閾値/slow/frozen/immunity 実数・**freezeChance 内訳（base×proc/冷気寄与/proc/最終/RNG roll/結果/hitGroup 上限/スキップ理由）**・ボス氷砕状態・実動作カウンタ（冷気付与/凍結試行/成功/耐性・hitGroup 上限で防止/現在 frozen・immunity・burning/粉砕/ボスゲージ付与/氷砕/索引サイズ/上限到達）。CombatTelemetry と重複する項目は telemetry を正とする。

### 品質別上限・cleanup・テスト
- [x] `balance.json` に表示上限11種（maxStatusIcons/maxChillVisuals/maxFrozenVisuals/maxImmunityVisuals/maxSlowTrails/maxShatterEffectsPerFrame/maxStatusFloatingTextsPerFrame/maxFrostbreakEffects/maxStatusDebugHistory/chillNearThresholdEffectCooldown/statusVisualUpdateInterval）＋`statusVisuals` 設定（アイコン優先度・既知 visual type・frostbreak/vulnerability 表示）。装飾上限に達しても状態ロジック・cleanup は不変。
- [x] 敵死亡/プール返却/ボス死亡/Scene終了/状態解除/quality変更で全表示を破棄（古い entity 参照/Graphics/Text/Tween を残さない・pool 再利用で残留なし）。
- [x] 新規テスト4種: `status-visual-state`（段階/優先度/上限/解除/cleanup/イベント/カウンタ＋Phaser経路スモーク）/ `status-debug-panel`（対象選択/実数/内訳/RNG roll/hitGroup/カウンタ）/ `frostbreak-ui-state`（表示可否/値/break/cooldown/vuln/保存復元一致）/ `status-visibility-nonregression`（確率計算・RNG cursor・炎上・氷術師15/8・save v6 不変）。`validate.yml`・`validate-data.mjs` に追加。全39スイート通過。

### M7-B.1 で**実装しない**もの（対象外）
- [ ] 新 active/passive/進化/ジョブ・火と氷の属性反応・属性相性・新敵/新ボス/新難易度・スキル数値の全面調整・敵HP/攻撃/出現数の変更・正式画像素材・UI全体改修・外部通信。

> **実ブラウザ未確認**: 本環境では Phaser 実プレイ確認を行っていない。純ロジック・最小 Phaser モックによるスモークは通過済みだが、
> 実際の見た目（冷気段階/氷殻/粉砕文字/ボスゲージ/FROST BREAK）・当たり判定・視認性（敵100体＋2倍速で HUD/敵弾/ボス予告を見失わないか）・60FPS はブラウザ確認が必要（`docs/test-guide.md` の M7-B.1 参照）。

## Milestone 7-C（実装済み）— 氷術師のスキル拡張・第2波（active25 / 進化13）

氷術師の active を10種・進化を5種追加し、**active25種 / passive4種（追加なし）/ 進化13種 / Job Lv1〜100** へ拡張した。全て `data/skills.json`/`data/skill-evolutions.json` の
Lv1〜8 データ駆動で、冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路を使用（独自タイマーなし）。**Math.random/Date.now/performance.now 不使用（index ベース決定論）**・**save_version は v6 のまま**。火の魔女 active30/進化18 と氷術師既存 active15/進化8 は不変。

### 新 active10種（frost_mage 専用・element ice・isCommon:false・maxLevel8）
- [x] 霜輪飛刃 `rime_boomerang`（common・cooldown・往復 projectile・**Lv80発射数対象**・往0.38/復0.50・復路で凍結敵粉砕・runtimeState cdLeft）。
- [x] 氷鎖連閃 `frost_chain`（uncommon・cooldown・瞬間連鎖・高冷気優先/後半減衰/同一敵へ再連鎖しない・proc0.38・runtimeState cdLeft）。
- [x] 氷晶開花 `crystal_bloom`（common・periodic・発芽→開花設置・pulse0.16/bloom0.75・開花時のみ粉砕・echo/clone custom・runtimeState cdLeft＋芽 x/y/growLeft/pulseLeft）。
- [x] 白霧氷界 `snowblind_mist`（uncommon・continuous・追従霧・proc0.14・粉砕なし・custom・runtimeState cdLeft/activeLeft/centerX/centerY/tickLeft）。
- [x] 極星氷弾 `polar_star`（rare・cooldown・大型星＋pulse＋爆発＋氷片・**Lv80発射数対象**・pulse0.12/impact0.70/shard0.30・runtimeState cdLeft）。
- [x] 砕氷衝波 `icebreaker_wave`（common・cooldown・扇状衝波・通常敵push/エリート軽減/ボスpushなし/凍結敵粉砕・proc0.60・runtimeState cdLeft）。
- [x] 氷刻停止 `frozen_clock`（legendary・periodic・全画面時計波・直接凍結せず FreezeSystem 委譲・proc0.65・echo/clone **forbidden**・runtimeState cdLeft/remainingWaves/nextWaveLeft/waveIndex/origin）。
- [x] 氷晶屈折 `crystal_refraction`（rare・cooldown・屈折 projectile・最終屈折のみ粉砕・proc0.38・runtimeState cdLeft）。
- [x] 冬冠結界 `winter_halo`（uncommon・defensive・氷冠吸収＋冷気反撃・複数耐久片＋近距離pulse で `mirror_ice` と差別化・echo/clone **forbidden**・runtimeState cdLeft/activeLeft/durabilityLeft）。
- [x] 氷彗星群 `comet_sleet`（rare・periodic・予告＋barrage・通常0.42/大彗星0.80・大彗星のみ粉砕・custom・runtimeState cdLeft/barrageActive/cometsRemaining/nextCometLeft/barrageIndex/targetCenter/telegraphLeft）。

### 新進化5種（EvolvedSkillBase・element ice・単一形態・追加Lvなし・**Job Lv80対象外**）
- [x] 冥氷処刑輪 `rime_execution_wheel`（rime_boomerang Lv8 + frost_amplification Lv4・cooldown・standard）。
- [x] 永劫氷鎖 `eternal_frost_chain`（frost_chain Lv8 + rapid_freezing Lv4・cooldown・custom）。
- [x] 世界氷晶樹 `crystal_world_tree`（crystal_bloom Lv8 + frozen_expansion Lv4・periodic・custom・runtimeState 樹 x/y/growLeft/pulseLeft/phase）。
- [x] 永久白霧 `everlasting_white_mist`（snowblind_mist Lv8 + lingering_cold Lv4・continuous・custom）。
- [x] 零刻世界 `zero_hour_world`（frozen_clock Lv8 + ice_prison Lv4・periodic・**forbidden**）。`ice_prison` は進化条件用の補助 active で置換しない。

### 決定論・監査・保存・テスト
- [x] castMode/mainCastEvent/echoPolicy/clonePolicy/lv80ProjectileTarget/procCoefficient/config を全 active/進化で宣言。主発動のみ recordCast。**Lv80発射数対象は明示フラグ（`SkillAudit.appliesLv80ProjectileCount`）で管理**し、氷の対象は計5種（frost_shard/glacial_lance/icicle_volley/rime_boomerang/polar_star）・新進化は対象外。
- [x] 全新スキルは index ベース決定論（Math.random/Date.now/performance.now/draft RNG 不使用）。扇角/連鎖順/bloom地点/霧中心/星角/wave/屈折順/comet落下（黄金角 2.399963…）/barrage順まで決定論。同点は entity `_seq` → x → y で安定決定。
- [x] 冷気/凍結/粉砕/ボス氷砕は既存経路で M7-B.1 表示（StatusVisualManager/BossFrostbreakDisplay/StatusDebugPanel/F10）へ自動反映。ボスは通常 frozen にせず chill→氷砕ゲージへ自動変換し、`frozen_clock`/`zero_hour_world` の `bossGaugeMult` はボス氷砕ゲージ量のみへ1命中1回だけ適用する（`applyIceHit` のボス分岐で chill→ゲージ変換に掛かり、damage/chillAmount/proc や通常敵/エリート・炎には掛からず二重加算しない。ボス氷砕の cooldown/threshold/vulnerability は不変）。
- [x] CD/設置/遅延/防御/barrage の runtimeState を `skillRuntime` へ保存し再開時の無料再発動・二重生成・進化前後同時稼働を防止。飛行中 projectile/Graphics/Text/Tween/entity参照/particle/overlay/F10選択は保存しない。
- [x] 品質別 skillCaps 23種を `data/balance.json` へ追加（装飾上限と damage event 上限を区別・`winter_halo` の防御耐久は visual cap で減らさない）。CombatTelemetry へスキル固有 extra（recordExtra）を追加（共通 chill/freeze/shatter/frostbreak は二重カウントしない・外部送信なし）。
- [x] `?debug=1` の **F9** に新 active10・新進化5 を追加（付与/Lv切替/進化条件達成/即時進化・debugRun として通常 profile 統計/Job XP/残り火/魂炎へ影響させない）。
- [x] 新規テスト5種: `frost-skills-wave3` / `frost-evolutions-wave3` / `frost-policy-audit-wave3` / `frost-runtime-save-wave3` / `frost-determinism-wave3`。`validate-data.mjs` へ M7-C ブロック・`validate.yml` へ5ステップ追加。**全44スイート通過・validate-data 0エラー0警告**。
- [x] **非回帰**: 火の魔女 active30/進化18・同seed抽選、氷術師既存 active15/進化8、冷気/凍結/免疫/粉砕/ボス氷砕、selectedJobId/active_run固定、M5-B保存・テレメトリ・M7-A状態異常・M7-B.1表示・氷CD保存。

### M7-C で**実装しない**もの（対象外）
- [ ] 氷術師 active 26種目以降・進化14種目以降・**新 passive**・限界突破（Lv8超）・進化後レベルアップ。
- [ ] 3人目のジョブ・ジョブ間継承・**火と氷の属性反応**・転生レガシー・新敵/新ボス/新難易度・装備/ドロップ・正式図鑑/実績。

> **実ブラウザ未確認**: 本環境では Phaser 実プレイ確認を行っていない。データ検証・純ロジック・最小 Phaser モック（graphics 対応）によるランタイムスモークは通過済みだが、
> 実際の描画・視認性・当たり判定・体感バランス・60FPS 維持はブラウザでの確認が必要（`docs/test-guide.md` の M7-C 項目参照）。

### 次のマイルストーン候補
- [ ] **3人目のジョブ**（雷/毒 など新属性・`StatusEffectManager` に新状態を追加）
- [ ] **属性反応**（火⇄氷 など状態異常間の相互作用・付与時の source element を活用）
- [ ] **転生レガシー**（複数ジョブをまたぐ恒久継承の設計）
- [ ] **氷術師 passive の拡張 / 限界突破**（Lv8超の成長軸）

---

## Milestone 7-D（実装済み）— 氷術師のスキル拡張・最終波（active30 / 進化18・カタログ完成）

氷術師の active を5種・進化を5種追加し、**active30種 / passive4種（追加なし）/ 進化18種 / Job Lv1〜100** へ拡張して、**火の魔女（active30/進化18/passive4）と同規模のカタログに到達**した（氷術師カタログ完成）。全て `data/skills.json`/`data/skill-evolutions.json` の
Lv1〜8 データ駆動で、冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路を使用（独自タイマーなし）。**Math.random/Date.now/performance.now 不使用（index／黄金角ベース決定論）**・**新 passive/ジョブ/状態/属性反応/限界突破なし**・**save_version は v6 のまま**。火の魔女 active30/進化18 と氷術師既存 active25/進化13 は不変。

### 新 active5種（frost_mage 専用・element ice・isCommon:false・maxLevel8）
- [x] 氷槍豪雨 `glacial_spear_rain`（common・periodic・予告付き氷槍を螺旋（黄金角）落下・大型槍のみ凍結敵粉砕・**Lv80発射数対象**・proc 通常0.42/大型0.80・echo=clone custom・runtimeState cdLeft＋barrage spearsRemaining/nextSpearLeft/barrageIndex/targetCenter/telegraphLeft）。
- [x] 六花砲台 `snowflake_sentry`（uncommon・continuous・設置砲台が非frozen 高chill 敵優先射撃＋六花pulse・砲台弾は粉砕なし・proc 0.35/pulse0.18・echo=clone custom・runtimeState deployLeft/nextInstanceId＋各砲台 instanceId/x/y/activeLeft/shotLeft/pulse カウンタ）。
- [x] 氷山奔衝 `iceberg_ram`（rare・cooldown・滑走氷山が通常敵 push（エリート軽減/ボス無効）・凍結中は最初の接触で粉砕・終端崩壊＋氷片・proc 接触0.55/崩壊0.75・echo=standard・clone=custom・runtimeState cdLeft＋氷山 x/y/direction/activeLeft/travel/collapsePending/instanceId）。
- [x] 絶対氷封 `absolute_ice_seal`（rare・reactive・高chill 対象へ**氷印（skill-local マーカー・正式 status ではない）**・markDuration 経過か氷属性命中数（requiredHits）で起爆・凍結中を1回粉砕・**bossGaugeMult Lv別1.25→1.50**・proc 起爆0.85・echo=clone **forbidden**・印付与時は freeze roll しない・runtimeState markLeft/nextInstanceId＋ボス印のみ）。
- [x] 極光氷幕 `aurora_veil`（legendary・continuous・画面横断オーロラ帯が tick でダメージ＋冷気・一定間隔の burst のみ凍結中を1回粉砕・**bossGaugeMult Lv別1.15→1.35**・帯は複数 query へ分割し毎frame 全敵走査しない・proc tick0.14/burst0.75・echo=clone **forbidden**・runtimeState recastLeft/activeLeft/tickLeft/burstLeft/phase/castIndex/layoutIndex）。

### 新進化5種（EvolvedSkillBase・element ice・単一形態・追加Lvなし・**Job Lv80対象外**）
- [x] 天墜氷槍葬 `heavenfall_glacier_lances`（glacial_spear_rain Lv8 + frost_amplification Lv4・periodic・custom・複数 wave の大規模氷槍雨・巨大槍のみ強化粉砕＋bossGaugeMult1.4・runtimeState cdLeft＋barrage）。
- [x] 六花氷衛軍 `crystal_sentinel_legion`（snowflake_sentry Lv8 + rapid_freezing Lv4・continuous・custom・陣形砲台＋砲台間氷線（主命中で1回粉砕）・runtimeState 各砲台 instanceId/x/y/activeLeft/shotLeft/linkCounter）。
- [x] 大陸氷河奔流 `continental_glacier_rush`（iceberg_ram Lv8 + frozen_expansion Lv4・cooldown・custom・幅広氷河＋崩壊裂片（残留・粉砕なし）・runtimeState cdLeft＋氷河）。
- [x] 永劫封氷棺 `eternal_sealed_coffin`（absolute_ice_seal Lv8 + ice_prison Lv4・reactive・**forbidden**・氷棺印＋起爆時に近傍未印へ**副棺を最大1世代だけ伝播（副棺は再伝播しない）**・bossGaugeMult2.0・runtimeState markLeft＋ボス印）。`ice_prison` は進化条件用の補助 active で置換しない。
- [x] 極夜天光 `polar_night_aurora`（aurora_veil Lv8 + lingering_cold Lv4・continuous・**forbidden**・帯＋burst＋一定回数ごとの極光柱・bossGaugeMult1.7・runtimeState recastLeft/activeLeft/tickLeft/burstLeft/pillarCounter/phase/layoutIndex）。

### 決定論・skill-local マーカー・監査・保存・テスト
- [x] castMode/mainCastEvent/echoPolicy/clonePolicy/lv80ProjectileTarget/procCoefficient/config/bossGaugeMult を全 active/進化で宣言。主発動のみ recordCast。**Lv80発射数対象は明示フラグ（`SkillAudit.appliesLv80ProjectileCount`）で管理**し、氷の対象は**計6種**（frost_shard/glacial_lance/icicle_volley/rime_boomerang/polar_star/glacial_spear_rain）・新進化は対象外。
- [x] 全新スキルは index／黄金角（2.399963…）ベース決定論（Math.random/Date.now/performance.now/draft RNG 不使用）。同点は entity id/`_seq`→x→y／`instanceId`／wave index で安定決定。status RNG は `FreezeSystem` のみ。
- [x] **氷印/氷棺は skill-local マーカー**（`StatusEffectRegistry` へ登録しない・正式 status 表示へ重複追加しない・skill-local overlay のみ）。`Enemy._iceSeal`（マーカー参照）と `Enemy._iceHitCount`（氷属性命中カウンタ）を追加し `Enemy.reset` でクリア（pool 再利用の残留防止）。命中数起爆は `dealDamage` の ice 分岐が `_iceHitCount` を1回加算しマーカーが差分で判定。復元方針: 通常敵は捨て（無料起爆しない）・ボス（`scene.boss`）のみ再関連付け・CD（`markLeft`）は必ず復元。
- [x] `bossGaugeMult` は M7-C 修正済み共通経路（`dealDamage`/`damageArea`→`opts.bossGaugeMult`（既定1）→`applyIceHit` のボス分岐→`addBossGauge` 量へ1回だけ）を維持。damage/chill/procCoefficient/通常敵/火には掛からず二重加算なし・status RNG cursor 不変・frostbreak の threshold/cooldown/vulnerability 不変。validate-data が未使用の成長 field（absolute_ice_seal.bossGaugeMult の Lv 単調増加 等）を検出。
- [x] 冷気/凍結/粉砕/ボス氷砕は既存経路で M7-B.1 表示（StatusVisualManager/BossFrostbreakDisplay/StatusDebugPanel/F10）・状態カウンタへ自動反映（重複実装しない）。氷印だけ最小限の skill-local overlay。
- [x] CD/barrage/砲台/氷山/marker/aurora の runtimeState を `skillRuntime` へ保存し再開時の無料再発動・二重生成を防止。飛行中 projectile/Graphics/Text/Tween/entity 参照/particle/overlay/F10 選択・表示状態は保存しない。
- [x] 品質別 skillCaps 19種を `data/balance.json` へ追加（装飾 cap と damage event cap を区別・visual cap でマーカー/防御性能を減らさない）。CombatTelemetry へスキル固有 extra（recordExtra）を追加（共通 chill/freeze/shatter/frostbreak は二重カウントしない・外部送信なし）。
- [x] `?debug=1` の **F9** に新 active5・新進化5 を追加（付与/Lv切替/進化条件達成/即時進化・debugRun 分離）。
- [x] 新規テスト6種: `frost-skills-wave4` / `frost-evolutions-wave4` / `frost-policy-audit-wave4` / `frost-runtime-save-wave4` / `frost-determinism-wave4` / `frost-boss-gauge-wave4`。`validate-data.mjs` へ M7-D ブロック・`validate.yml` へステップ追加。**全51スイート通過・validate-data 0エラー0警告**。
- [x] **非回帰**: 火の魔女 active30/進化18・同seed抽選、氷術師既存 active25/進化13、冷気/凍結/免疫/粉砕/ボス氷砕、selectedJobId/active_run固定、M5-B保存・テレメトリ・M7-A状態異常・M7-B.1表示・M7-C 氷CD保存/bossGaugeMult。

### M7-D で**実装しない**もの（対象外）
- [ ] 氷術師 active 31種目以降・進化19種目以降・**新 passive**・限界突破（Lv8超）・進化後レベルアップ。
- [ ] 3人目のジョブ・ジョブ間継承・**火と氷の属性反応**・転生レガシー・新敵/新ボス/新難易度・装備/ドロップ・正式図鑑/実績・ゲームバランスの全面調整。

> **実ブラウザ未確認**: 本環境では Phaser 実プレイ確認を行っていない。データ検証・純ロジック・最小 Phaser モック（graphics 対応）によるランタイムスモークは通過済みだが、
> 実際の描画・視認性・当たり判定・体感バランス・60FPS 維持はブラウザでの確認が必要（`docs/test-guide.md` の M7-D／spec §36 項目参照）。

## Milestone 7-E: 氷術師 完成監査（抽選率／進化到達率／全体バランス分析）— 完了
新しい active / passive / 進化 / ジョブ / 状態異常 / 敵 / ボス / 難易度は**追加していない**（監査と不具合修正のみ）。

- [x] **カタログ整合性**: `SkillCatalog` で氷 active30 / passive4 / 進化18・合計52・issues 0。火の魔女 30/4/18 も非回帰。duplicate id/name 0・未登録/孤立クラス 0。
- [x] **プール分離**: 氷 active は `jobs:["frost_mage"]`＋`isCommon:false`、氷 passive は `passiveSkillPool` 所属。`jobs` 未指定を暗黙共通にしない。`SkillCatalog` = `poolEligibility` = `SkillDraftManager` の3者一致。
- [x] **進化到達可能性**: 18 進化すべて base/support がプール内・必要Lv が上限内・自己/循環参照 0・分岐 0・枠不増加・進化後は通常抽選へ出ない。条件成立後の未提示 0%。
- [x] **抽選シミュレーション**（production の `SkillDraftManager`＋`SeededRandom`・200 seed / 60 level-up / slot 4・6・8 / 5戦略）: 他ジョブ混入・不正候補・重複候補・slot違反・不正進化・進化後の元active再提示は**すべて 0**。
- [x] **戦略追加**: `DraftBalanceAnalyzer` へ balanced / random-valid / new-skill-priority / one-build-focus を追加し、取得率・Lv8率・passive Lv4率・reroll/banish/skip・pity・synergy・候補内訳・枠充足を集計。
- [x] **死にコンテンツ監査**: 死にパラメータ **6件を修正**（`crystal_bloom.interval`→`cooldown` / `polar_star.impactDamage` / 氷封・氷棺の `frozenDamageBonus` / `crystal_sentinel_legion.pulseProc` 削除 / `heaven_piercing_glacier.freeze.baseChance`）→ 現在 **0件**。
- [x] **状態異常経路の誤接続を修正**: `heaven_piercing_glacier` / `absolute_zero_ray` の `bossGauge.multiplier` が通常敵の冷気にも乗っていたのを、M7-C の共通経路（ボス氷砕ゲージのみ1回）へ付け替え。
- [x] **echo/clone の `custom` 未実装を修正**: `absolute_zero_ray` / `world_end_avalanche` / `continental_glacier_rush` に限定的な `echoCast`/`cloneCast` を実装（全体再発動をやめた）。
- [x] **quality cap 監査**: 未参照 cap を氷術師側 0 件へ（11件を実装へ接続・4件を削除・`maxIcePrisons`/`maxWorldEndAvalancheWaves` の値を主効果が削れないよう調整）。存在しない cap の参照 0・名前違い 1件修正。
- [x] **SkillAudit 完全監査 / recordCast / echo・clone / Lv80**: 48 件で未解決 issue 0（残るのは「基底 update が主発動を記録」「防御スキルは意図的に recordCast 0」の 2 種の仕様のみ）。
- [x] **保存・復元・決定論**: 48 件の runtime 往復・二重生成なし・冪等・進化前後の同時稼働なし・status RNG drift 0・`save_version` v6 維持。
- [x] **状態異常バランス**: 通常敵/エリート/ボス別に chill・freeze・immunity・hitGroup・shatter・boss frostbreak・vulnerability を計測し、ボス通常凍結 0・粉砕再帰 0・氷砕間隔の単調性を確認。
- [x] **cleanup / telemetry**: 全 48 件の `destroy()`・`Enemy.reset()`・状態索引・購読解除を検証。debugRun 分離・二重計上なし・外部送信なし。
- [x] **F8 にジョブ別分析パネルを追加**（カタログ/取得/進化到達/damage share/状態カウンタ/氷砕/bossGaugeMult/性能上限）。**F10 に直近イベント履歴**（`maxStatusDebugHistory`）。
- [x] **警告基盤**: `FrostBalanceWarnings`（FROST_* 30コード・閾値は data ではなく既定値＋引数・ローカルのみ）。
- [x] **新規テスト12種**＋`validate-data` の M7-E ブロック＋`validate.yml` ステップ。**全63スイート通過・validate-data 0エラー0警告**。
- [x] docs: `frost-completion-audit.md` / `frost-draft-analysis.md` / `frost-balance-report.md` を新規作成し、既存 docs を更新。

### M7-E で残した警告（修正せず理由を記録）
- [ ] evolution-first・slot8 の「進化1個以上」が 94.0%（基準 95%）— 枠が広いほど level-up が分散する希釈特性。`one-build-focus` なら 99.0%。
- [ ] `zero_hour_world` の合算取得率 1.00% — legendary base ＋ active 補助の二重ハンデ。到達不能ではない。
- [ ] 火の魔女由来の未参照 cap 5 件 — 参照を足すと火の挙動が変わるため M7-E の対象外。

> **実ブラウザ未確認**: M7-E も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのスモークのみ）。
> F8 分析パネル・F10 履歴の描画、実際の体感バランスは `docs/test-guide.md` の M7-E 項目を実ブラウザで確認すること。

### 次のマイルストーン候補
- [ ] 火の魔女側の同種監査（未参照 cap 5 件・`custom` echo/clone の実装有無・死にフィールド）
- [ ] 火と氷の属性反応、または 3 人目のジョブ
- [ ] 周回長の拡張・追加の敵/ボス

## Milestone 8-A: 火の魔女 完成監査（抽選率／進化到達率／全体バランス分析）— 完了
新しい active / passive / 進化 / ジョブ / 状態異常 / 敵 / ボス / 難易度は**追加していない**（監査と不具合修正のみ）。
**save_version は v6 のまま**・**氷術師は数値/挙動/候補列/状態異常/保存/カタログとも不変**。

- [x] **カタログ整合性**: `SkillCatalog` で火 active30 / passive4 / 進化18・合計52・issues 0。氷 30/4/18 も非回帰。
      duplicate id/name 0・未登録クラス 0・孤立クラス 0・`SkillCatalog` = `poolEligibility` = `SkillDraftManager` の一致。
- [x] **プール分離**: 火 active は `jobs:["flame_witch"]`＋`isCommon:false`、火 passive は `passiveSkillPool` 所属。
      明示共通（`isCommon:true`/`jobs:["*"]`）は 0 件。`jobs` 未指定を暗黙共通にしない。火⇄氷の混入 0。
- [x] **進化到達可能性**: 18 進化すべて base/support がプール内・必要Lv が上限内・自己/循環参照 0・分岐 0・
      枠不増加・進化後は追加Lvなし・通常抽選へ出ない。条件成立後の未提示 0%。
- [x] **抽選シミュレーション**（production の `SkillDraftManager`＋`SeededRandom`・200 seed / 60 level-up / slot 4・6・8 / 5戦略）:
      他ジョブ混入・不正候補・重複候補・slot違反・不正進化・進化後の元active再提示は**すべて 0**。
      **M7-E と同じ 9 つの警告基準をすべて満たす**（slot4 ≥1=90.0%/平均1.44/0個10.0%、slot6 ≥1=96.0%/≥2=78.5%/平均2.20、
      slot8 ≥1=97.0%/≥2=78.5%/平均2.29）。`FLAME_*` 警告 0 件。
- [x] **重大バグ修正1**: 火の魔女スキル **21 種の CD が保存されず、リロードで全回復して無料発動**していた
      （氷術師で M7-A 後に修正した `bad8bd4` と同じクラス）。48 件すべてが runtimeState を保存するようにした。
      常設型は位相・主発動スロットル・各インスタンスのタイマーを保存（設置物本体は保存せず二重生成しない）。
- [x] **重大バグ修正2**: `eternal_pyre` / `solar_annihilation_array` が `recordCast` を一度も呼ばず、
      **data で宣言した残響・分身が一度も発生しなかった**（進化元では発生する＝進化で機能を失う逆転）。
      `config.castPulseMs` で主発動をスロットル記録し、`echoPolicy`/`clonePolicy` を実装に合わせ `custom` へ修正。
      `eternal_pyre` に `echoCast()`（領域の追加パルス）を実装。
- [x] **重大バグ修正3**: `eternal_pyre.spreadInfection()` が `enemyPool.forEachActive()` で毎 tick 全敵を総当たり
      していたのを、M6-E の炎上索引（`combat.burningEnemies()`）経由へ修正（対象集合は同じ・性能改善）。
- [x] **死にコンテンツ監査**: 死にパラメータ **21 件 → 0 件**（実装へ接続 13 件・削除 8 件）。
      `skills.json` の旧 `evolution` ブロック 3 件も削除（進化の正は `skill-evolutions.json` のみ）。
      `SkillBase._initCd`（未参照フィールド）を削除。`serializeState(){return {}}` の no-op 実装を解消。
- [x] **quality cap 監査**: M7-E から残っていた**火由来の未参照 cap 5 件を削除**（`maxBarrierEffects` /
      `maxBurningEnemyIndex` / `maxChainTargets` / `maxCopyGeneration` / `maxMainCastEventsPerFrame`）。
      重複または「参照すると品質でダメージが変わる」ものだった。`skillCaps` 157 → 152 件、許容リストは空。
- [x] **SkillAudit 完全監査 / recordCast / echo・clone / Lv80**: 48 件で未解決 issue 0
      （残るのは「防御/反応は意図的に recordCast 0」「echo/clone とも forbidden の常設型は意図的に 0」の 2 種の仕様のみ）。
      再帰（echo→echo / clone→clone / 爆発→爆発）0・`powerMultiplier` 1 回・`rootSkillId` 維持。
- [x] **Job Lv 監査（Lv1〜100）**: 11 milestone すべてが `JobModifierManager.resolve()` に対応（死に milestone 0）。
      属性一致時のみ適用・`resolvedJobModifiers` は周回開始時に凍結・Lv80 対象は明示 flag の 6 種のみ・Lv100 でも再帰なし。
- [x] **炎上/DoT/爆発/共鳴**: 実スキル駆動で計測（炎上付与24/延長4,776/ピーク24体/DoT 40,344 tick /
      爆発150・二次爆発0 / 共鳴 1 パルスあたり連鎖23.2本）。索引残留 0・low/ultra で DoT が消えない。
- [x] **保存・復元・決定論**: 48 件の runtime 往復・二重生成なし・冪等・進化前後の同時稼働なし・
      Math.random/Date.now 不使用・継続 vs save→reload で無料 cast 0・`save_version` v6 維持。
- [x] **cleanup / telemetry**: 48 件の `destroy()`・`Enemy.reset()`・炎上索引・`delayedCall` ガードを検証。
      debugRun 分離・二重計上なし・外部送信なし。
- [x] **警告基盤**: `FlameBalanceWarnings`（FLAME_* 30 コード・閾値は既定値＋引数・ローカルのみ）を新規追加。
- [x] **新規テスト12種**＋`validate-data` の M8-A ブロック＋`validate.yml` ステップ。**全75スイート通過・0エラー0警告**。
- [x] docs: `flame-completion-audit.md` / `flame-draft-analysis.md` / `flame-balance-report.md` を新規作成し、既存 docs を更新。

### M8-A で**実装しない**もの（対象外）
- [ ] active31 以降 / evolution19 以降 / 新 passive / 3 人目の job / 属性反応 / 新 status / 新 enemy・boss・difficulty
- [ ] 転生 legacy / job 間継承 / 限界突破 / equipment / pet / UI 全面改修 / 正式素材 / 新 game mode
- [ ] `save_version` の更新 / `frost_mage` のバランス変更

> **実ブラウザ未確認**: M8-A も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのスモークのみ）。
> `docs/test-guide.md` の **Milestone 8-A** 項目（A〜H）を実ブラウザで確認すること。

---

## Milestone 8-B: 戦士 基盤実装（3 人目のジョブ）— 完了

3 人目のジョブ **戦士（`warrior`・`physical`）** の基盤を実装した。**近接専用**で、
専用リソース「闘気」「コンボ」と、強靱・不屈・撃破回復・体勢崩しを持つ。

- [x] **ジョブ追加**: `jobs.json` へ `warrior`（element `physical` / preferredRange `melee` /
      `statusEffects` は空＝共通状態異常を使わない）。`job-progression.json` へ Job Lv1〜100・到達報酬 11 段。
- [x] **active5**: 大薙ぎ `great_cleave`（初期）/ 盾撃 `shield_bash` / 旋風斬り `whirlwind_slash` /
      突進斬り `charge_slash` / 地砕き `ground_slam`。**全て近接**（自分中心の円 or 前方 arc）で
      画面を横断する斬撃波・弾を生成しない。Lv1〜8 データ駆動。
- [x] **passive4**: 剛力 `brute_force` / 重装 `heavy_armor` / 戦闘本能 `combat_instinct` / 血気 `bloodlust`。
      `skill-config.modifierKeys` へ 13 キー追加（既存キーは 1 件も削っていない）。
- [x] **evolution3**: 千刃乱舞（大薙ぎ+戦闘本能 Lv4）/ 血戦旋風（旋風斬り+血気 Lv4）/
      不落の城壁（盾撃+重装 Lv4）。宣言した数値・`safetyCaps` は**すべて実装から参照**（死にフィールド 0）。
- [x] **闘気（fury）**: 近接命中 / 撃破 / コンボ / 軽減 / 被弾で獲得。
      **1 発動あたり・1 秒あたり・解放中減衰**の 3 層上限で無限蓄積を防止。100 到達で自動的に**闘気解放**
      （攻撃力・攻撃速度・軽減・ノックバック・体勢削りが同時に上がり、**時間経過で HP が戻る**＝一括全快しない）。
- [x] **コンボ**: **ジョブ全体で 1 本**。同一敵の多段と 1 発動あたりの加算に上限。
      猶予後に毎秒減衰。閾値 4 段（10/25/50/100）で攻速・範囲・火力・体勢＋闘気獲得。
- [x] **強靱（被ダメージ軽減）**: 接敵 / 近接発動直後 / 突進 / 解放中 / 不屈 / スキル由来を合成し、
      合計は **70% でクランプ**（永久無敵にならない）。軽減量と通過量の両方が闘気になる。
- [x] **不屈**: 瀕死（HP25%）で 1 回だけ発動する**基礎能力**（passive ではない）。
      CD45 秒・周回開始直後は発動しない・分割回復・重装で強化。
- [x] **撃破回復**: passive「血気」を取ったときだけ発生。**毎秒上限つき**（敵数比例の無限回復にならない）。
- [x] **ノックバック / 体勢崩し**: 通常敵＝押し返す / エリート＝stagger＋免疫（連続ハメ防止）/
      ボス＝**予告・突進も中断**して「露出」。崩すたびにしきい値 ×1.25（上限 ×3）。
      **氷砕（frostbreak）とは別フィールド・別しきい値・別クールダウン**。
- [x] **`WarriorCombatSystem`** へ集約（Phaser 非依存・乱数なし・`now()`/`heal()` コールバック）。
      スキルは `scene.combat.meleeStrike()` 経由でのみ敵へ触る（**全敵総当たり禁止**・SpatialGrid 使用）。
      スキルが `scene.profile` や Scene 内部状態へ直接触らないことをテストで検証。
- [x] **戦士向けオート移動**: `computeWarriorAutoMove()` をジョブ別 strategy として追加。
      **既存の `computeAutoMove()`（火/氷）は 1 行も変更していない**。
- [x] **HUD**: `WarriorHud`（闘気ゲージ / 闘気解放 / コンボ / 不屈 CD / ボス体勢ゲージ・露出）。
      純ロジック `warriorHudState()` と表示層を分離。**戦士周回のみ生成**。
- [x] **保存**: `active_run.warriorState` を追加（**`save_version` は v6 のまま**・移行不要）。
      再読込で闘気・コンボ・不屈 CD・ボス体勢を初期化して稼げない。
      戦士 8 スキルすべてが `serializeState`/`restoreState` で CD を保存。
- [x] **テレメトリ**: 周回集計 30 キー＋スキル別 8 キー。**火/氷でもキー構造は同じ**（値が 0）。外部送信なし。
- [x] **F8 / F9**: F8 のジョブ別分析へ戦士セクション＋警告 3 種。
      **F9 は戦士周回のみ戦士検証パネル**（火/氷では従来どおり状態異常パネル）。F10 は不変。
- [x] **品質別 skillCaps 13 種**追加（ダメージ 6 / 演出 7・low ≤ medium ≤ high ≤ ultra・**未参照 cap 0**）。
- [x] **自動テスト 17 スイート**＋`validate-data` の M8-B ブロック＋`validate.yml` ステップ。
      **全 92 スイート通過・validate-data 0 エラー 0 警告**。
- [x] **非回帰**: `tests/three-job-nonregression.mjs` が火/氷の**候補列（300 seed）・48 スキルの実行トレース・
      保存キー一覧**を SHA-256 のハッシュ固定で検証。**火の魔女・氷術師は 1 件も変更していない**。

### M8-B で**実装しない**もの（対象外）
- [ ] 戦士の active6 種目以降 / evolution4 種目以降
- [ ] 新しい共通状態異常（出血・スタン等）/ 火・氷との属性反応
- [ ] 装備・武器選択 / クリティカル特化設計 / 手動入力コンボ
- [ ] 新 enemy・boss・difficulty / 4 人目のジョブ / 転生レガシー / UI 全面改修 / 正式画像素材
- [ ] `save_version` の更新 / 火の魔女・氷術師のバランス変更

### M8-B で見つけて直した既存の不備
- [x] **`heavy_armor` の `knockbackResist`** — プレイヤーがノックバックされる仕組みが存在しないため
      **一度も参照されない死にフィールド**になっていた。modifier・`modifierKeys`・`balance.warrior.mitigation` の
      3 つの `*KnockbackResist` をすべて削除した（「死にフィールド禁止」の原則に従い、予約値として残さない）。
- [x] **`charge_slash.levels[].visual`** — 実装が `visualScale()` を使わないため未参照だった。データから削除。

### M8-B で残した既知の問題（→ M8-B.1 で修正済み）
- [x] `BattleScene._refreshStatusPassives()` が**通常のレベルアップでパッシブを取得したときに呼ばれない**
      （呼ばれるのは周回開始時と F9 デバッグ操作時のみ）。氷パッシブ「余寒残留」の
      `chillDecayMult` / `iceStatusDurationMult` が周回途中の取得で反映されなかった。
      M8-B の時点では「氷術師の数値・挙動を変更しない」という絶対条件に抵触するため見送り、
      **Milestone 8-B.1 で修正した**（下記）。

> **実ブラウザ未確認**: M8-B も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのスモークのみ）。
> `docs/test-guide.md` の **Milestone 8-B** 項目（A〜K）を実ブラウザで確認すること。

---

## Milestone 8-B.1: passive 再計算バグ修正 — 完了

M8-B で記録した既知の問題（status passive が周回中に反映されない）を修正した。
**新規コンテンツ・バランス変更・データ変更は一切ない。**

- [x] **バグの特定**: `BattleScene._refreshStatusPassives()` が呼ばれるのは
      周回開始時 / 途中再開時 / F9 デバッグ操作の 3 か所だけで、
      **通常のレベルアップ（`applyCandidate` → `passives.acquireOrLevel`）から呼ばれていなかった**。
      `StatusEffectManager` へ **push 型**で渡す `chillDecayMult` / `iceStatusDurationMult`（余寒残留）だけが
      取り残されていた。pull 型で毎回読まれる `iceDamage` / `cooldown` / `area` は影響なし。
- [x] **`passives.version` を単一トリガー化**: `_refreshStatusPassivesIfNeeded(force)` を追加。
      version が変わったときだけ再構築し、同じフレームでは何もしない（毎フレーム無条件の再計算はしない）。
      `PassiveManager` インスタンスが差し替わったとき（F8 検証周回）も取りこぼさない。
- [x] **完全再構築**: 現在の passive 所持状態から毎回作り直す（現在値への加算をしない）。
      何回呼んでも・保存復元を繰り返しても倍率が累積しない。
- [x] **発火経路**: 周回開始/途中再開（force・1回）/ レベルアップ確定（即時）/
      メインループ（gate・`statusFx.update` の直前）/ F8 検証周回開始（force）/ F9（force）。
- [x] **ジョブ分離の明示化**: status 乗率は**周回のジョブが氷術師のときだけ**適用する。
      火の魔女 / 戦士では常に恒等値（1, 1）。判定は周回開始時に固定した `jobId`（`active_run.jobId` が正）で行い、
      `profile.selectedJobId` を直接読まない。
- [x] **戦士側の同種ハザードも塞いだ**: `_refreshWarriorMods()` にも
      「PassiveManager インスタンスが変わったら再計算する」保険を追加（冪等なので値は変わらない）。
- [x] **自動テスト 6 スイート追加**（`status-passive-refresh` / `-levelup-refresh` / `-version-gating` /
      `-save-reload` / `-job-isolation` / `-nonregression`）。**全 98 スイート通過・validate-data 0 エラー 0 警告**。
      テストは production の `BattleScene.prototype` のメソッドを直接呼ぶ（ロジックを複製しない）。
- [x] **非回帰**: data 変更 0・`save_version` v6 のまま・保存キー追加 0・
      ドラフト候補列（300 seed）と 火/氷 48 スキルのランタイムトレースが M8-A / M8-B 時点と SHA-256 完全一致・
      status RNG の cursor 不変・戦士の `_refreshWarriorMods` 挙動不変。

### M8-B.1 で**実装しない**もの（対象外）
- [ ] 新 skill / passive / evolution / job / 状態異常 / 属性反応
- [ ] 火・氷・戦士のバランス変更 / 戦士の active 拡張
- [ ] `save_version` の更新 / UI 追加 / F10 全面改修 / 状態異常システムの再設計
- [ ] `PassiveManager` の全面書き換え / 無関係な cleanup・refactor

### M8-B.1 での挙動変化（意図したもの）
- [x] 火の魔女 / 戦士の周回で F9 の氷術師パネルから余寒残留を付与しても、
      `chillDecay` / `iceStatusDuration` の乗率は変化しなくなった（ジョブ分離の明示化による）。
      状態異常の乗率を検証する場合は氷術師の周回で行う（`docs/test-guide.md` に注記済み）。

> **実ブラウザ未確認**: M8-B.1 も Phaser 実プレイ確認は行っていない（Node 純ロジックのみ）。
> `docs/test-guide.md` の **Milestone 8-B.1** 項目（A〜G）を実ブラウザで確認すること。

---

## Milestone 8-C: 戦士スキル拡張 Wave1 — 完了

戦士の **active を 10 種追加して計 15 種**、**進化を 5 種追加して計 8 種**にした。
passive 4 種・Job Lv1〜100 の基盤は据え置き。既存 5 active・3 進化の数値と挙動は変えていない。

- [x] **active10 追加**: 兜割り `armor_breaker` / 双牙斬 `twin_fang_slash` / 処刑斬 `execution_strike` /
      跳躍強襲 `leap_smash` / 薙ぎ進軍 `sweeping_advance` / 迎撃の構え `counter_stance` /
      戦吼 `war_cry` / 鎖鉤 `chain_hook` / 震脚 `shockwave_stomp` / 怒涛連撃 `relentless_combo`。
      すべて `element: physical` / `jobs:["warrior"]` / maxLevel8 / 残響・分身は `forbidden`。
- [x] **進化5 追加**: 断界兜割（兜割り+剛力Lv4）/ 血断処刑（処刑斬+血気Lv4）/
      軍神咆哮（戦吼+戦闘本能Lv4）/ 金剛迎撃（迎撃の構え+重装Lv4）/
      **天墜崩撃（跳躍強襲+active 地砕きLv6）**。地砕きは置換されず CD にも触らない。
- [x] **処刑の一元化**: `WarriorCombatSystem.executePolicy()` が可否を判断し、
      `BattleScene.executeTarget()` が「残り HP ぶんのダメージ」を共通 `dealDamage` 経路へ流す。
      **即死しうるのは通常敵だけ**（エリート/ボスは欠損 HP 参照の追加ダメージのみ・ボスは上限つき）。
      1 秒あたりの処刑数にも上限があり、死亡イベント・撃破統計・撃破回復は二重に走らない。
- [x] **反撃の調停**: `consumeCounterEvent()` が 1 被弾につき優先度最上位の 1 系統だけを選ぶ。
      優先度は `balance.json` の `warrior.counter.priority`（金剛迎撃 3 > 不落の城壁 2 > 迎撃の構え 1）。
      全体クールダウン＋`_inWarriorCounter` の再入ガードで counter → counter の再帰なし。
      軽減は合算せず最大値を採り、合計 70% でクランプ。**不屈（基礎能力）は反撃枠を占有しない**。
- [x] **戦吼の timed buff**: 新しい formal status を作らず `WarriorCombatSystem` 上で持つ。
      **重ねがけしない**（refresh）。強度・持続は `balance.json` の `warrior.warCry.max*` でクランプ。
      軍神咆哮の `graceRefill` はコンボ「猶予」だけを戻し、コンボ値は無料で配らない。
- [x] **移動・引き寄せの共通経路**: `pullTarget` / `movePlayerTowards` / `preferredMeleeTarget` /
      `bossTelegraphing` / `warriorPullConfig` を `BattleScene` へ追加。スキルは座標を直接書き換えない。
      **ボスは引き寄せられない**（代わりにこちらが安全距離だけ踏み込む）・エリートは大幅に短い・
      壁外/NaN/テレポートを作らない・`SpatialGrid` を必ず更新・慣性を残さない。
- [x] **進化が基礎クラスを再利用する仕組み**: `applyEvolvedSemantics(cls)` を `WarriorSkillBase` へ追加。
      軍神咆哮 / 金剛迎撃 / 天墜崩撃は基礎スキルのロジックを継承し、data の読み先だけ進化定義へ差し替える。
- [x] **Job Lv80「打撃数 +1」はちょうど 6 種**（`great_cleave` `shield_bash` `ground_slam` +
      `armor_breaker` `twin_fang_slash` `relentless_combo`）。弾は 1 つも増えない。進化は全て対象外。
- [x] **品質別 skillCaps 20 種追加**（ダメージ/イベント系 9・演出系 11。未参照 cap 0・全 185 件が単調）。
      演出上限を 1 まで落としてもダメージ・命中は変わらない。
- [x] **保存**: `save_version` は **v6 のまま**。`warriorState.timedBuffs`（戦吼バフ・反撃の構え）を追加。
      構えは**使用回数も保存**して再読込で使い直せない。跳躍・引き寄せ・連撃の途中状態は復元しない
      （薙ぎ進軍だけ残り時間と消化済み打撃数を引き継いで「再開」する）。敵オブジェクト参照は保存しない。
- [x] **テレメトリ / F8 / F9**: 周回全体 14 指標・スキル別 5 指標を追加（`summary()` と 1:1・外部送信なし）。
      F8 の戦士分析へカタログ規模・Lv80 対象数・Wave1 カウンタ・警告 4 種を追加。
      F9 の戦士検証パネルへ active15 の切替・進化 8 の条件達成（active 補助対応）・
      処刑圏内へ / 戦吼バフ付与解除 / 構えを開く / 被弾 1 回で反撃 / 敵を遠方へ配置 を追加。**F10 は不変**。
- [x] **自動テスト 19 スイート追加**＋`validate-data` の M8-C ブロック＋`validate.yml` へ 19 ステップ。
      **全 116 スイート通過・validate-data 0 エラー 0 警告**。`HEAVY=1` で seed 数を増やせる。
- [x] **火の魔女・氷術師は完全に非回帰**（`tests/three-job-wave1-nonregression.mjs` がハッシュ固定で保証）。

### M8-C で**実装しない**もの（対象外）
- [ ] 戦士の active16 種目以降 / evolution9 種目以降 / 新しい passive
- [ ] 4 人目のジョブ / 属性反応（physical × fire / ice）/ 新しい formal status
- [ ] 装備 / 武器選択 / 新しい敵・ボス・難易度
- [ ] 転生レガシー / UI 全面改修 / 正式画像素材
- [ ] 遠距離の斬撃波を主軸にした設計
- [ ] 戦士 完成監査（カタログが揃ってから・M7-E / M8-A と同じ 12 観点）

### M8-C で見つけて直した既存の不備
- [x] `data` に宣言していた `killChain.killHealBonus` が未参照だったため、
      `WarriorCombatSystem.noteKillHealBonus()` を追加して血断処刑の撃破回復強化を実装した
      （撃破回復の毎秒上限は共有するので永久機関にならない）。
- [x] テスト用モック `tests/warrior-common.mjs` の `combat.nearestEnemy` がボスを候補に含めておらず、
      production の `BattleScene.nearestTarget` と挙動が食い違っていたのを揃えた。

> **実ブラウザ未確認**: M8-C も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのみ）。
> `docs/test-guide.md` の **Milestone 8-C** 項目を実ブラウザで確認すること。

---

## Milestone 8-C.1: 戦士 4 枠時の進化導線修正 — 完了

M8-C で戦士の active が 5 → 15 になった結果、production の `SkillDraftManager` を使った
200 seed シミュレーションで **active 枠 4 の「進化 1 個以上」到達率が 92.5% → 46.5%** へ落ちていた。
**閾値を下げるのではなく、production の抽選導線を直した**回。

- [x] **修正前分析**（`docs/warrior-draft-analysis-wave1.md`）: 進化 0 の周回では
      **所持している進化元の最高 Lv が平均 7.03**（あと 1 段階で届かない）・補助は 4.85/8 レシピで充足・
      条件成立後の未提示 0・候補ゼロ 0。原因は「base Lv8 不足（主因）」「slot4 特有の新 active 希釈（副因）」
      「simulation が production 経路を通っていなかった（16pt ぶん）」の 3 つ。
- [x] **接続不良の特定**（§優先1）: 既存 synergy（M6-F）は
      **「所持している基礎 → その補助スキル」の一方向しか無く**、逆方向が存在しなかった。
      pity（`draftsSinceProgress`）も進化成立でしかリセットされず、基礎 Lv8 の詰まりを救えなかった。
      火 / 氷は補助が active 中心なので露見しなかったが、戦士は 8 進化中 7 件が passive 補助で
      passive が早期に最大化されるため、基礎 active の Lv8 だけが最後まで残る構造だった。
- [x] **data 駆動の導線補助**: `data/skill-config.json` へジョブ限定の `guidance` ブロックを追加。
      `SkillDraftManager._guidanceMult()` が **data の進化レシピからのみ**対象を導出する
      （**特定 skill ID のハードコードなし**）。倍率は役割ごとの最大値だけを採り（重複上限）、
      `maxMultiplier` で必ず頭打ち。倍率はすべて 1 以上（重みを下げる補正は作らない）。
- [x] **進化導線 pity**: `guidanceStall` を追加。進展（基礎の取得/強化・補助の取得/強化・進化取得）で
      リセット。**保存するので save/reload で稼げない**。**RNG 消費は 1 も増やさない**（重みだけを変える）。
- [x] **他ジョブへの影響ゼロ**: `guidance.jobs` に載っていないジョブでは倍率が常に 1 で、
      候補オブジェクトにフィールドすら付かず、`guidanceStall` も進まない。
- [x] **テスト閾値を復元**: 枠4 ≥1 80%/平均1.0/0個 ≤20%・枠6 ≥1 95%/≥2 60%/平均1.7・
      枠8 ≥1 95%/≥2 65%/平均1.8。既存の到達率テストも production 経路（`open()` ＋ synergy ＋ pity ＋
      reroll/banish/skip）を通すように直した。
- [x] **共通 simulation ハーネス**（`tests/warrior-draft-sim.mjs`）: 独自抽選器を作らず
      production の `SkillDraftManager` / `SeededRandom` / `poolEligibility` / `SkillCatalog` /
      実 rarity / 実 synergy / 実 pity / 実 reroll・banish・skip / 実進化条件だけを使う。
      5 戦略（evolution-first / balanced / random-valid / new-skill-priority / one-build-focus）＋
      M8-B/M8-C 互換の素朴戦略。`Math.random` は 1 度も呼ばない。
- [x] **F8 / テレメトリ**: F8 の戦士分析へ「戦士 進化導線（M8-C.1）」（guidance の有効/無効・
      補助回数・pity・条件成立中・警告 3 種）を追加。`CombatTelemetry.draftGuidance` を追加（外部送信なし）。
      **F9 / F10 は変更なし**。
- [x] **自動テスト 9 スイート追加**＋既存 5 スイートの更新＋`validate-data` の guidance 検証＋
      `validate.yml` へ 9 ステップ。**全 125 スイート通過・validate-data 0 エラー 0 警告**。
- [x] **火の魔女・氷術師は完全に非回帰**（候補列 300 seed の SHA-256・48 スキルのランタイムトレースが一致）。

### 結果（200 seed・素朴戦略）

| 構成 | 前 | 後 | 目標 |
|------|----|----|------|
| 枠4 / 40 lv・≥1 | 62.5%（`_generate` 直呼びでは 46.5%）| **89.5%** | 80% |
| 枠4 / 40 lv・平均 | 0.70 | **1.26** | 1.0 |
| 枠4 / 40 lv・0 個 | 37.5% | **10.5%** | 20% |
| 枠6 / 60 lv・≥1 / ≥2 / 平均 | 99.0% / 70.5% / 1.91 | **100.0% / 91.0% / 2.42** | 95% / 60% / 1.7 |
| 枠8 / 80 lv・≥1 / ≥2 / 平均 | 100.0% / 100.0% / 3.50 | **100.0% / 100.0% / 3.92** | 95% / 65% / 1.8 |

過剰誘導なし: 最頻進化シェア 34.8% → **30.4%**、build 多様性 61.9% → **66.5%**、
新規取得率が同 rarity 中央値の 3 倍超は **0 件**、進化を持たない active の取得は **+3.9%**。

### M8-C.1 で**実装しない**もの（対象外）
- [ ] 新しい active / passive / evolution / ジョブ
- [ ] スキルの damage / cooldown 変更・闘気 / コンボ / 回復 / 体勢の変更
- [ ] 火 / 氷のドラフト変更・global な rarity / synergy 変更
- [ ] active 枠数の変更・進化の強制付与・候補を進化 1 択へ固定
- [ ] `save_version` の更新・UI 全面改修・属性反応

### M8-C.1 で不採用にした案（理由つき）
- [ ] 進化元の**新規取得**を無条件に優遇 — 実測でレアリティ階層が歪んだ（rare の進化元の取得率が
      同 rarity 中央値の 4.8 倍）。補助が揃っているときだけに限定した。
- [ ] slot4 で無関係な新 active の重みを抑制 — 到達率がほとんど変わらず（88.7% → 88.7%）、
      build 多様性だけ下がったので**採用せず data のフィールドも残していない**。

> **実ブラウザ未確認**: M8-C.1 も Phaser 実プレイ確認は行っていない（Node 純ロジックのみ）。
> `docs/test-guide.md` の **Milestone 8-C.1** 項目（A〜I）を実ブラウザで確認すること。

---

## Milestone 8-D: 戦士スキル拡張 Wave2 — 完了

M8-C（Wave1）の 15 active / 8 進化の上へ、**active 15 → 25・進化 8 → 13** を積んだ回。
passive は 4 種のまま・Job Lv1〜100 も据え置き・**Job Lv80「打撃数 +1」の対象は 3 ジョブとも 6 種のまま**。

- [x] **新 active 10 種**（すべて物理近接・Lv1〜8 データ駆動・`jobs:["warrior"]` / `isCommon:false`）:
      昇竜斬 `rising_slash` / 鉄壁突進 `shield_charge` / 燕返し `backstep_riposte` / 豪腕投げ `battlefield_throw` /
      三段砕き `triple_crush` / 刃防陣 `blade_guard` / 狂戦猛進 `berserker_rush` / 戦斧投擲 `war_axe_throw` /
      破城膝撃 `breaker_knee` / 戦旗招集 `rallying_banner`
- [x] **新 evolution 5 種**: 天衝断空 `heaven_rending_ascent`（+剛力）/ 城塞蹂躙 `fortress_rampage`（+重装）/
      無影燕返 `shadow_swallow_riposte`（+戦闘本能）/ 山岳投擲 `mountain_hurl`（+**active** 地砕き Lv6・**置換せず CD も触らない**）/
      血盟戦旗 `blood_oath_standard`（+血気）
- [x] **共通機構 5 つを `WarriorCombatSystem` へ集約**（BattleScene へ状態を散らさない）:
      打ち上げ（`launchPolicy` / `launchDurationMs` / `launchImmuneMs`）・
      前面防御（`beginFrontGuard` / `frontGuardMitigation` / `endFrontGuard`）・
      掴み / 投げ（`grabPolicy` / `beginGrab` / `endGrab` / `noteThrowImpact`）・
      戦旗の陣（`placeRallyField` / `updateRallyPosition` / `rallyBonus`）・
      低 HP スケーリング（`lowHpDamageMultiplier`）。**すべて `balance.json` の上限で頭打ち**。
- [x] **打ち上げ / 掴みは通常敵だけ**。エリートは体勢削り / その場叩きつけ、ボスは掴めず重い体勢打撃へ置換。
      可否判断はスキル側に書かず共通経路へ一元化（スキルは `isBoss` を見ない）。
- [x] **前面防御は方向の分かる被弾だけ**（`requireDirection: true`）。側面 ×0.35・背面 ×0・上限 55%・
      合計軽減は従来どおり 70% クランプで**無敵にならない**。`Player.takeDamage(amount, from)` の第 2 引数は任意。
- [x] **掴みは敵オブジェクトを保持しない**（`_seq` のみ）・同時 1 体・時間切れで必ず解除・**保存しない**・
      **投げから投げが連鎖しない**・死亡イベントは共通 `dealDamage` が 1 回だけ出す。
- [x] **戦旗の陣は常に 1 つ**（重ねがけは置換）。効果は**内側にいるときだけ**。
      血盟戦旗の回復強化は**既存の毎秒 cap を共有**したまま（永久機関にならない）。
- [x] **低 HP スケーリングは自傷せず処刑もせず**必ず頭打ち（×1.6）。
- [x] **戦斧投擲は `Projectile` を使わない**（`combat.thrownStrike` = `meleeStrike` の `isThrown` 版）。
      近接倍率が乗らず、同一敵へは行き / 帰りで最大 2 回、射程と壁で必ず折り返す。
- [x] **残留の掃除**: `_airborneUntil` / `_launchImmuneUntil` / `_launchHeight` / `_grabbed` を
      `Enemy.reset()` と `onEnemyRemoved()` の**両方**が戻す。既定値では移動抑止が一切かからない。
- [x] **品質別 skillCaps 20 種追加**（damage / event 系 10・visual 系 10・**未参照 cap 0**・
      low ≤ medium ≤ high ≤ ultra・すべて正の数）。品質を落としてもゲーム数値は変わらない。
- [x] **guidance の追調整**: `activeSupportWeightMultiplier`（1.6）を 1 キーだけ追加。
      **補助が active のレシピ**（枠を 1 つ食い必要 Lv も高い）の補助側だけを補正する。
      判定は候補のカテゴリのみで **skill ID のハードコードなし**。**M8-C.1 のしきい値は 1 つも下げていない**。
- [x] **到達率（素朴戦略・200 seed）**: 枠4/40lv 進化1個以上 **85.0%**（平均 1.17・0 個 15.0%）/
      枠6/60lv 99.0%（2 個以上 88.0%・平均 2.38）/ 枠8/80lv 100%（2 個以上 98.5%・平均 3.46）。
      **13 進化すべて・25 active すべてが取得 0 件なし**・最頻進化シェア 19.3%（悪化なし）・
      候補ゼロ / 他ジョブ混入 / 重複 / 枠違反 0 件。
- [x] **F8 / F9 へ Wave2 の項目を追加**（打ち上げ / 前面防御 / 掴み・投げ / 三段 / 刃防陣 / 低 HP /
      戦斧 / 踏み込み / 戦旗・active 補助進化の到達率・build 偏りの警告）。**F10 は不変**。
- [x] **自動テスト 21 スイート追加**＋`validate-data` の M8-D ブロック＋`validate.yml` へ 21 ステップ
      （**全 147 スイート通過**・`validate-data` 0 エラー 0 警告）。
- [x] **火の魔女・氷術師は完全に非回帰**（候補列 300 seed / 48 スキルのランタイムとも SHA-256 一致・
      状態異常 5 種のまま・`Projectile` 無変更）・**save_version v6 維持**。

### M8-D で**実装しない**もの（対象外）
- [ ] active 26 種以上・進化 14 種以上・新しい passive・新ジョブ
- [ ] 属性反応・新しい formal status・装備・武器選択
- [ ] 新しい敵 / ボス / 難易度・転生レガシー・UI 全面改修・正式グラフィック素材
- [ ] 戦士の完成監査（カタログが 30/18 まで揃ってから）

### M8-D で見つけて直した既存の不備
- [ ] `WarriorCombatSystem.update()` が Wave2 の時限状態（前面防御 / 掴み / 戦旗の陣）を
      減らしていなかった → 稼働時間が記録されず、陣も時間で消えなかった。tick を追加。
- [ ] `WARRIOR_DEFAULTS` に Wave2 のブロックが無く、balance を渡さないと
      `beginFrontGuard` が例外を投げた → 既定値を追加。
- [ ] 燕返しが宣言どおりの距離を踏み込んで**相手を追い越し**、命中 0 になっていた
      → 間合いのぶんだけ進む `_lungeWant()` を追加。
- [ ] 戦斧の「行き / 帰りで最大 2 回」が**行きで 2 回**消費されていた
      → 行きと帰りで別々の回数マップに分離。

> **実ブラウザ未確認**: M8-D も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのみ）。
> `docs/test-guide.md` の **Milestone 8-D** 項目を実ブラウザで確認すること。

---

## Milestone 8-E: 戦士スキル拡張 最終Wave — 完了

M8-D（Wave2）の 25 active / 13 進化の上へ、**active 25 → 30・進化 13 → 18** を積んで
**3 ジョブがそろって 30 / 4 / 18 の同規模**へ到達させた回。
passive は 4 種のまま・Job Lv1〜100 も据え置き・**Job Lv80「打撃数 +1」の対象は 3 ジョブとも 6 種のまま**。

- [x] **新 active 5 種**（すべて物理・Lv1〜8 データ駆動・`jobs:["warrior"]` / `isCommon:false`）:
      貫穿突き `piercing_lunge` / 一騎討ち `duel_challenge` / 修羅の構え `battle_trance` /
      震天踏破 `earthshaker_march` / 刃返し `weapon_deflection`
- [x] **新 evolution 5 種**: 神速貫陣 `godspeed_impaler`（+戦闘本能 Lv4）/
      覇王討ち `king_slayer_duel`（+剛力 Lv4）/ 血染修羅 `blood_asura_trance`（+血気 Lv4）/
      大陸震砕踏破 `continental_quake_march`（+重装 Lv4）/
      天鏡返し `heaven_mirror_reversal`（+**active** 反撃の構え Lv4・**置換せず CD も触らない**）
- [x] **共通機構 5 つを `WarriorCombatSystem` へ集約**（BattleScene へ状態を散らさない）:
      直線の対象選択（`beginPiercingLunge` / `resolveLineMeleeTargets` / `noteLineStepIn`）・
      決闘（`beginDuelChallenge` / `getDuelModifiers` / `duelPoiseMultiplier` / `retargetDuel` / `clearDuelTarget`）・
      構え（`beginBattleTrance` / `getBattleTranceModifiers` / `endBattleTrance`）・
      進軍（`beginEarthshakerMarch` / `resolveMarchStomp`）・
      弾き返し（`beginDeflectionWindow` / `canDeflectProjectile` / `tryDeflectProjectile` /
      `arbitrateDeflectionAndCounter`）。**すべて `balance.json` の上限で頭打ち**。
- [x] **貫穿突きは弾ではない**（踏み込み＋近接の直線判定）。射程は `line.maxLineLength` 300px で頭打ちで
      **画面端まで届かない**。射線上にエリート / ボスがいると通常敵の枠が
      `toughSingleTargetRatio` 由来の少数に絞られ、**硬い相手ほど威力が 1 点へ集まる**。
      ボス予兆中は踏み込まない。
- [x] **一騎討ちは正式な状態異常を作らない**（相手へ debuff を貼らない）。同時 1 体・再発動は置換・
      優先度は data 由来で ボス > エリート > 高 HP 通常敵・**敵オブジェクトを保持せず `_seq` だけ**・
      死亡 / プール返却 / Scene 終了 / 時間切れで必ず解除。覇王討ちの延長は合計上限つきで
      **ボスを永久ロックできない**。
- [x] **修羅の構えも formal status ではない**（同時 1 つ・重ねがけせず上書き）。攻撃補正は
      **闘気解放との合成上限** `combinedOffenseCap`(0.85) で頭打ち。リスクは**軽減の実効値の小幅低下だけ**で、
      **重装 / 闘気解放 / 不屈のいずれも無効化せず**、`minMitigationAfterPenalty` を下回らない（**負にならない**）。
      **自傷もライフスティールもしない**。血染修羅の撃破回復も既存の毎秒 cap を共有する。
- [x] **震天踏破は移動しながら複数地点**を踏む（大地砕き / 震脚との差）。1 発動 = 1 recordCast・
      距離と時間の**両方**で必ず終わり・`worldMargin` で壁の内側にクランプ・座標が NaN にならない。
- [x] **刃返しは完全無効化ではない**。allowlist（`bossBullet` / `bullet`）+ denylist
      （`beam` / `telegraph` / `hazard` / `dot` / `ground`）を `canDeflectProjectile()` に一元化。
      窓ごとの上限を超えた弾はそのまま通る。反射弾は**世代 1 で止まり再反射しない**・元弾の特殊効果を
      引き継がない・短命。同じ弾を 2 度弾かない。`recordCast` は窓開始時の 1 回だけ。
- [x] **1 イベント = 最大 1 系統**（`arbitrateDeflectionAndCounter()`）。弾イベントは弾き返しの枠だけ、
      近接イベントは反撃の回数だけを消費する。
- [x] **残留の掃除**: `_duelMark` / `_lineAlong` を `Enemy.reset()` と `onEnemyRemoved()` の**両方**が戻す。
      `Projectile._clearState()` が `_deflectId` / `alreadyDeflected` / `deflectGeneration` /
      `suppressSpecialEffects` を戻す。既定値では従来と完全に同じ経路を通る。
- [x] **品質別 skillCaps 12 種追加**（event 系 7・visual 系 5・**未参照 cap 0**・
      low ≤ medium ≤ high ≤ ultra・すべて正の数）。演出上限がダメージや成否を減らすことはない。
- [x] **guidance の追調整**: `highRequirementSupportLevel`(6) / `highRequirementSupportMultiplier`(1.5) を
      2 キーだけ追加。**役割ごとの max であって積み上がらない**・**skill ID のハードコードなし**・
      **M8-C.1 のしきい値は 1 つも下げていない**。あわせて `heaven_mirror_reversal` の補助要求を
      `counter_stance` Lv4 に、`weapon_deflection` の rarity を uncommon にした（data 側の設計判断）。
- [x] **到達率（素朴戦略・200 seed）**: 枠4/40lv 進化1個以上 **89.5%**（平均 1.28・0 個 10.5%）/
      枠6/60lv 99.0%（2 個以上 94.5%・平均 2.65）/ 枠8/80lv 100%（2 個以上 99.5%・平均 3.92）。
      **18 進化すべて・30 active すべて・passive 4 すべてが取得 0 件なし**・
      最頻進化シェア 16.2 / 13.8 / 11.7%（M8-D の 19.3% から改善）・
      build の種類 89.8 / 97.2 / 99.3%・候補ゼロ / 他ジョブ混入 / 重複 / 枠違反 0 件。
- [x] **F8 / F9 へ 最終Wave の項目を追加**（貫穿突き / 一騎討ち / 修羅の構え / 震天踏破 / 刃返し /
      反射弾・カタログ 30/4/18・active 補助進化の到達率・6 種の警告）。**F10 は不変**。
- [x] **自動テスト 16 スイート追加**＋`validate-data` の M8-E ブロック＋`validate.yml` へ 16 ステップ
      （**全 163 スイート通過**・`validate-data` 0 エラー 0 警告）。
- [x] **火の魔女・氷術師は完全に非回帰**（候補列 300 seed / 48 スキルのランタイムとも SHA-256 一致・
      状態異常 5 種のまま・`Projectile` の追加は既定値が無害な 4 フィールドのみ）・**save_version v6 維持**。

### M8-E で**実装しない**もの（対象外）
- [ ] active 31 種以上・進化 19 種以上・新しい passive・新ジョブ
- [ ] 属性反応・新しい formal status・装備・武器選択
- [ ] 新しい敵 / ボス / 難易度・転生レガシー・UI 全面改修・正式グラフィック素材
- [ ] Job Lv80「打撃数 +1」の対象追加
- [ ] 戦士の完成監査（**M8-F**）・全体の抽選設計変更

### M8-E で見つけて直した既存の不備
- [ ] `WARRIOR_DEFAULTS` に最終Wave のブロックが無く、balance を渡さないと
      `beginPiercingLunge` が例外を投げた → 既定値（line / duel / trance / deflection / march）を追加。
- [ ] `restoreTimedBuffs()` が決闘の復元で `duelStarts` を**二重に**戻していた
      （`restoreDuelState()` はもともと数えていない）→ テレメトリが負値になっていたので削除。
      弾き返しの窓カウンタも 0 未満へ下がらないようにクランプした。
- [ ] `canDeflectProjectile()` が `deflectGeneration` を見ておらず、
      印（`alreadyDeflected`）が落ちた反射弾を再び弾けてしまった → 世代だけで止まるガードを追加。
- [ ] 弾き返しの枠を使い切ると `deflectionActive` が false になり、
      **「上限に達した窓へ弾が来た」を 1 度も計測できなかった** → 窓の開閉だけを見る
      `deflectionWindowOpen` を足し、調停までは通して `capReached` を正しく数えるようにした
      （弾自体はそのまま素通りする＝挙動は変わらない）。
- [ ] `warrior-build-diversity` の `formedButNotOffered` が、進化 18 種では
      「同時に成立したレシピが 3 枠に収まらない」だけで誤検知していた
      → **進化候補が 1 つも出なかった draft** だけを数えるよう修正し、
      良性のケースは `formedPartiallyOffered` として分離した。

> **実ブラウザ未確認**: M8-E も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのみ）。
> `docs/test-guide.md` の **Milestone 8-E** 項目（A〜G）を実ブラウザで確認すること。

---

## Milestone 8-F: 戦士 完成監査 — 完了

M8-E で戦士が **active30 / passive4 / evolution18 = 52** に到達し、火の魔女（M8-A）・氷術師（M7-E）と
同規模になったのを受けた**監査だけの回**。**新 active / passive / 進化 / ジョブは 1 件も追加していない。**

- [x] **カタログ整合性**: active30 / passive4 / evolution18 / 合計52。id 重複 0・未知クラス 0・
      「JSON だけ / class だけ / docs だけ」0・orphan 0・`displayName` 重複 0。
- [x] **プール分離**: `flame_witch` / `frost_mage` / `warrior` の 3 プールが互いに素・他ジョブ混入 0。
      判定は `poolEligibility.memberAllowedForJob` 1 か所。
- [x] **rarity と役割**: common7 / uncommon13 / rare10 / **legendary 0**（戦士は legendary 段を進化 18 件で担う。
      火 / 氷は legendary active 3 件ずつという設計差で、これは変えていない）。castMode は 30 件すべて `cooldown`。
- [x] **進化 18 件の到達性**: 全件が「条件形成 > 0・提示 > 0・取得 > 0」。提示 / 形成 ≈ 100%
      （低い取得率は「提示の詰まり」ではなく「base を Lv8 まで伸ばせるか」に集約される）。
- [x] **production 抽選 simulation**（`SkillDraftManager` / `SeededRandom` / `poolEligibility` /
      `SkillCatalog` / 実 rarity / 実 guidance / 実 pity / 実 synergy / 実 reroll・banish・skip を直接駆動・
      **`Math.random` を 1 度も使わない**）: 200 seed（`HEAVY=1` で 500）× 5 戦略 ＋ 素朴戦略 × 枠 4 / 6 / 8。
      **M8-C.1 のしきい値を 1 つも下げずに**すべて達成（枠4 ≥1 個 98.0〜100% / 平均 2.19〜3.55 / 0 個 ≤2.0%、
      枠6 ≥1 個 100% / 平均 3.37〜5.33、枠8 ≥1 個 99.5〜100% / 平均 4.51〜7.05）。
      最頻進化シェア **10.7%**・build の種類 枠4 185〜199 / 200・**候補ゼロはすべて飽和由来**（飽和以外 0 件）。
- [x] **`SkillAudit` 48 件**: 未解決 issue 0。`echoPolicy` / `clonePolicy` = `forbidden`・
      `canTriggerEcho` / `canBeCopiedByClone` = `false`・`damageTags` が物理であることまで含めて全件確認。
- [x] **`recordCast` の 1:1 48 件**: 全件 cast > 0。**スキル側は 1 度も `recordCast` を呼ばない**
      （基底 `update` が 1 回だけ記録する）。多段 / tick / 反撃 / 反射で記録が増えない。
- [x] **cooldown 保存 48 件**: 0 / 中間 / 最大付近が往復・復元直後に無料 cast が出ない・
      攻撃速度 / 構え / 闘気解放で CD が変わっても壊れない・進化置換の前後で混ざらない・**改ざん耐性**。
- [x] **`runtimeState` 48 件**: 宣言と実使用が一致・no-op serialize 0・
      **オブジェクト参照 / Phaser 実体の保存 0 件**（敵は安定 runtime id `_seq` で保存）・
      復元で二重再生しない・旧セーブのキー欠落で例外にならない。
- [x] **固有機構**: 闘気（獲得予算 / 解放 / 稼働率 41.9%）・コンボ（猶予 / 減衰 / しきい値）・
      撃破回復（毎秒 cap 共有・overheal なし・**自傷経路 0**）・不屈・軽減（合計 70% クランプで**無敵にならない**）・
      反撃と弾き返しの調停（**1 イベント = 最大 1 系統**）・処刑（エリート / ボスは対象外）・
      ノックバック / 打ち上げ / 掴み / 投げ（通常敵だけ・場外 0）・エリートの体勢・ボスの崩し
      （39 回 / 露出 118.9s / しきい値 ×3.00 で**永久拘束にならない**）・移動（`worldMargin` クランプ・NaN 0）。
- [x] **cap と死にフィールド**: `balance.json` の `skillCaps` 217 件すべてが参照済み（未参照 0）・
      `low ≤ medium ≤ high ≤ ultra` かつすべて正・進化 18 件の `safetyCaps` すべて有効・**死にフィールド 0**。
- [x] **telemetry / F8 / F9**: キーと実装が 1:1・dead key 0・外部送信 0・**F10 は不変**。
- [x] **性能**: 10 分相当の Node 実測で low 2.5s / medium 2.5s / high 2.7s / ultra 3.1s、
      1 フレーム最大処理は 4 品質とも上限内（238 / 335 / 424 / 534 ≤ 360 / 540 / 720 / 960）。
      `PoolManager` の取り違え 0・`SpatialGrid` 経由で全敵総当たり 0。
- [x] **セーブ / 決定性**: 保存 → 再読込で 48 スキル・戦士状態・telemetry が一致、
      旧セーブ（v5 以前 / キー欠落 / 戦士状態なし）で起動不能にならない、
      同 seed で候補列とランタイムが一致（**`save_version` は v6 のまま・保存キーを 1 つも増やしていない**）。
- [x] **バランス分布**: 最大ダメージシェア 13.6%・**死にスキル 0 件**・
      **evo/base < 1.0 の逆転 0 件**・全部盛りシェア最大 20.6%（他を全部食う進化 0 件）・
      永久状態 0（構え / 決闘 / 弾き窓 / 陣 / 闘気解放 / 露出 / 掴み / 反撃窓すべて 0 に戻る）。
- [x] **自動テスト 23 スイート追加**＋`validate-data` の M8-F ブロック（16 節）＋`validate.yml` へ 23 ステップ
      （**全 185 スイート通過**・`validate-data` 0 エラー 0 警告）。
      いずれも **regex だけでなく production の class / prototype / manager を直接駆動する実測**で、
      修正を巻き戻すと落ちる。
- [x] **火の魔女・氷術師は完全に非回帰**（候補列 / 48 スキルのランタイム / セーブ / 状態異常 RNG とも
      SHA-256 一致・`tests/three-job-completion-nonregression.mjs`）。

### M8-F で**実装しない**もの（対象外）
- [ ] 新しい active / passive / 進化 / ジョブ
- [ ] 属性反応・新しい formal status・装備・武器選択
- [ ] 新しい敵 / ボス / 難易度・転生レガシー・周回長の拡張・UI 全面改修・正式グラフィック素材
- [ ] 全体のバランス改修・火 / 氷の仕様変更・不要な `save_version` 更新・無関係な refactor

### M8-F で見つけて直した不備（8 件 + 死にフィールド 1 件）

優先度は M8-F の指定順（crash → save 破損 → プール漏れ → … → balance）。

- [ ] **戦士 48 スキルの `restoreState({cdLeft})` が負数 / NaN / ±Infinity / 桁外れをそのまま採用**していた
      → `WarriorSkillBase` / `WarriorEvolvedBase` へ共通 `restoreCd()` を追加。非有限値は採用せず、
      有限値は ±`MAX_RESTORED_CD_MS`(120s) へクランプ。35 ファイルの生の代入をこの 1 か所へ寄せた。
      **火 / 氷の restore は 1 行も変えていない**（27 ファイルは従来の代入のまま）。
- [ ] **陣（`placeRallyField`）の半径が上限クランプされていなかった**（改ざんで半径 1e9 = 永久バフ）
      → `balance.warrior.rally.maxRadius`(280) を追加してクランプ。
- [ ] **反撃窓（`beginCounterWindow` と復元）の回数と持続が上限クランプされていなかった**
      （改ざんで「999 回・1e9ms」= 実質無限反撃）→ `counter.maxCountersPerWindow`(6) /
      `counter.maxWindowMs`(6000) を追加し、開始時と復元時の両方でクランプ。
- [ ] **旋風斬（`WhirlwindSlashSkill.restoreState`）が回転の残り時間をクランプしていなかった**
      （改ざんで永久回転）→ data の `duration` で頭打ちにした。血戦旋風も同じ経路。
      他の再開型（薙ぎ進軍 / 刃防陣）は既にクランプ済みだった。
- [ ] **進化済みの基礎 active が空き枠へ「新規」候補として戻っていた**（200 seed 中 38 回）
      → 取得すると進化と基礎を**同時所持**でき「元 active と同時稼働しない」に違反した。
      抽選コンテキストへ `evolvedBaseIds` を**加算的に**追加し `SkillDraftManager._eligible` が除外する。
      未指定なら従来と完全に同一挙動なので**火 / 氷の候補列ハッシュは不変**。
- [ ] **M8-B / M8-C の 21 スキルが `destroy()` 後も発動し続けた**（進化置換・Scene 終了のあとに
      「墓場から」攻撃が飛ぶ余地）→ 2 つの戦士基底の `update()` に破棄ガード、
      `destroy()` に `_dead = true` を置いた（1 か所）。
- [ ] **決闘マーカー（`Enemy._duelMark`）が時間切れ / 再指定 / 解除で外れなかった**
      （生きている敵に古いマーカーが `Enemy.reset()` まで残った）→ `BattleScene._setDuelMark` /
      `_clearDuelMark` で寿命を一元化し、決闘が終わったフレームと Scene 終了で必ず外す。
- [ ] **`crimson_execution`（血断処刑）が base より弱かった**（群れの中で総ダメージ 69% の逆転）
      → 原因は `safetyCaps.maxTargetsPerStrike: 10` が base `execution_strike` の実効 breadth
      （品質上限 24 のもとで実測 20）より狭かったこと。**10 → 20** にした（修正後 evo/base = 1.37・
      依然として有界で品質上限以下）。18 進化のうち逆転はこの 1 件だけ。
- [ ] **data の死にフィールド `charge_slash.config.hitOncePerTarget`**（コメントでしか触れられておらず
      挙動はハードコードだった）→ 実装から読むようにした。現在の data は `true` なので挙動は不変。

> **実ブラウザ未確認**: M8-F も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのみ）。
> `docs/test-guide.md` の **Milestone 8-F** 項目を実ブラウザで確認すること。

---

## Milestone 9-A: 3 ジョブ横断・共通システム総合監査 — 完了

**新しい active / passive / 進化 / ジョブは 1 件も追加していない。** 3 ジョブの個別完成監査
（氷 M7-E / 火 M8-A / 戦士 M8-F）を受け、共通システム・品質設定・性能・セーブ・telemetry・
balance を横断監査した回。

- [x] **最優先: 品質と gameplay の分離。** M8-F 記録の `great_cleave` 分岐（low 58 / high 59）を
      修正前 tree の production 経路で再現し、根本原因を品質別 cap の誤分類と特定。
      **敵プール上限（60〜320 体）・弾プール上限（120〜700）・skillCaps 161 件・hitStop・
      魂炎ノード 2 種**も品質依存だった。
- [x] **cap 分類**: 全 217 件を **visual 47 / gameplay 150 / safety 20** へ（正は
      `balance.json` の `skillCapClasses`）。gameplay / safety は**単一値 `{ value }`**
      （品質キーを構造的に持てない形）、visual だけ 4 段階（単調非減少）。
- [x] **canonical value = 旧 high（出荷既定品質）**。低品質は強化・high 不変・ultra は
      計測実績のある high へ整列。**特定スキルを low の挙動へ揃える全体 nerf は 0 件**。
      選択手順と理由は `docs/quality-cap-classification.md`。
- [x] **gameplayLimits { maxEnemies: 200, maxProjectiles: 400 } を新設**し、`effectQuality` から
      gameplay キーを削除（残留は validate-data がエラー化）。hitStop を全品質有効へ。
      魂炎の恒久強化ノードの品質ゲートを削除。
- [x] **結果: gameplay trace が 3 ジョブ × active30 / evolution18 × 4 品質で byte-identical**
      （cast / hit / damage / kill / 対象列 / cooldown / runtimeState / status RNG cursor /
      闘気・コンボ・体勢）。品質が変えるのは演出だけ（visual 47 件中 45 件が low < ultra）。
- [x] **cdLeft 改ざん耐性を全 144 スキルへ**: 火 / 氷 96 スキルに M8-F と同種の脆弱性が残っていたため、
      `SkillManager.restoreRuntime` の共通入口 `_sanitizeRuntimeState` で一律無害化
      （非有限値は不採用・±120s クランプ・**正当なセーブと候補列 / runtime trace は不変**）。
- [x] **横断カタログ**: 各 30/4/18・全体 **90/12/54 = 156**・重複 0・orphan 0・プール互いに素・
      `memberAllowedForJob` 全数一致・暗黙 common 0・Lv80 各 6・進化の Lv80 対象 0。
- [x] **横断抽選**（production 駆動・200 seed × 枠 4/6/8）: leakage / duplicate / slot 違反 /
      非飽和候補ゼロ = 0。**しきい値の変更 0 件**。進化 54 件の到達性を全数実駆動で確認。
- [x] **横断バランス比較**（共通 profile）: 死にスキル 0・utility 0 = 0・一極集中なし。
      ジョブ間 DPS 比はヘッドレスのハーネス由来と分析し documented note へ（**balance 変更 0 件・
      個性は均一化しない**）。
- [x] **combat path**: skillId 全経路・element/physical 分離・再帰ガード固定。重複実装は
      cooldown 復元の 1 件のみ（共通入口化で解消）。対ボス / 資源の別実装は意図した
      job-specific policy として記録。
- [x] **F8 へ 3 ジョブ比較表示を追加**（カタログ / rarity / Lv80 / cap 分類 / 品質不変の明示）。
      既存のジョブ固有表示は不変・**F10 は 1 行も変えていない**。
- [x] **セーブ / telemetry / 性能 / Pool / SpatialGrid / dead field / warning / 決定論** の横断監査
      （詳細は `docs/cross-job-system-audit.md`）。
- [x] **自動テスト 25 スイート追加**（`cross-job-*` 24 + `three-job-system-nonregression`・
      **全 210 スイート通過**）・validate.yml へ 25 ステップ（計 211）・validate-data へ
      M9-A ブロック（**0 エラー 0 警告**）。品質修正を巻き戻すと invariance テストが必ず落ちる。
- [x] **save_version v6 維持**（保存キー追加 0）・**火 / 氷 / 戦士の候補列と runtime trace を
      SHA-256 固定**（`three-job-system-nonregression.mjs`）。

### M9-A で見つけて直した不備
- [ ] gameplay / safety に当たる skillCaps **161 件が品質依存**（対象数・弾数・tick・状態付与が
      品質で変化 → Combo / 攻撃速度しきい値 / 主発動回数が分岐）→ 単一値化（canonical = 旧 high）。
- [ ] **敵 / 弾プール上限が品質別**（敵 60〜320 体 = XP / kill も品質依存）→ `gameplayLimits` へ。
- [ ] **hitStop が high / ultra のみ**（ロジック経過時間が品質依存）→ 全品質有効。
- [ ] **魂炎の恒久強化 2 ノードが低品質で無効**（品質で恒久強化が消えた）→ ゲート削除。
- [ ] **火 / 氷 96 スキルの cdLeft 改ざん脆弱性**（NaN / ±Infinity / 桁外れ受け入れ）→
      `restoreRuntime` 共通入口で全ジョブ無害化。

### M9-A で**実装しない**もの（対象外）
- [ ] 新 active / passive / 進化 / ジョブ・属性反応・転生レガシー・装備
- [ ] 新しい敵 / ボス / 難易度・周回時間拡張・UI 全面改修・正式素材
- [ ] 3 ジョブの個性を均一化する大規模 balance 変更・rarity 体系の全面変更
- [ ] save_version の不要な更新・無関係な refactor

> **実ブラウザ未確認**: M9-A も Phaser 実プレイ確認は行っていない（Node 純ロジック＋最小モックのみ）。
> `docs/test-guide.md` の **Milestone 9-A** 項目（同 seed・同 save で 4 品質比較）を実ブラウザで確認すること。

---

### 次のマイルストーン候補
- [ ] **火と氷の属性反応**（炎上⇄冷気/凍結の相互作用・付与時の source element を活用）
- [ ] **転生レガシー / ジョブ間継承**（`futureInheritanceSettings` / `extraAllowedIds` が拡張口）
- [ ] **周回長の拡張**（10分 / 15分 / 無限モード）・**追加の敵 / ボス / 難易度**
- [ ] **4 人目のジョブ**（3 ジョブぶんの基盤・横断監査・テスト雛形がそろっている）
- [ ] **実ブラウザでの M7-E 〜 M9-A 手動確認**（コード変更を伴わない検証タスク。
      M9-A の「4 品質で結果が一致し演出だけ変わる」確認価値が特に高い）

---

## 拡張余地（今後）
- [ ] 周回長の拡張（10分/15分/無限モード）
- [ ] 追加の敵・ボス
- [ ] 実績システム・図鑑の本実装
- [ ] スキル分岐（熟練度による）
