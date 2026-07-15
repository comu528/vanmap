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

## Milestone 4 — 進化・転生・魂炎

- [ ] スキル進化3種（`data/skills.json` の `evolution`）:
      火球→業火弾幕 / 火柱→煉獄噴火 / 燃える軌跡→永劫火界
- [ ] 進化条件成立時にゲーム一時停止＋専用演出
- [ ] `scenes/ReincarnationScene.js` と `systems/ReincarnationManager.js`
- [ ] 転生条件（難易度3クリア or 累計残り火）、リセット/維持項目の処理（`data/reincarnation.json`）
- [ ] 魂炎（soulflame）ノード解放: 候補3→4、初期スキル追加、進化条件緩和、敵/エフェクト上限増加、
      連鎖回数増加、恒久上限増加、倍速モード、オートダッシュ、転生ダメージ倍率
- [ ] 「ゲームルールが徐々に壊れる」成長の実装（敵数・範囲・連鎖・エフェクト量が転生で増加）

---

## Milestone 5 — 保存・デバッグ・パフォーマンス

### 保存
- [ ] `systems/FolderSaveManager.js`: `window.showDirectoryPicker()`、
      `ReincarnationFlameSurvivorData/`（profile/active_run/settings/backups）
- [ ] 自動保存（20秒毎/候補選択後/一時停止/戦闘終了/恒久強化購入/転生/タブ非表示直前）
- [ ] バックアップ（上書き前に複製、最大10世代、破損時に復元候補提示、自動復元しない）
- [ ] `FileSystemDirectoryHandle` を IndexedDB へ保存し次回起動で再取得（権限不足でもクラッシュしない）
- [ ] 非対応ブラウザ: IndexedDB/localStorage + JSON ダウンロード/インポート、理由の画面表示
- [ ] 優先順位と競合解決（`updated_at` 比較でユーザー選択）
- [ ] `ui/SaveDataPanel.js`（データ管理画面）

### デバッグ（`?debug=1` 時のみ・`systems/DebugManager.js` + `ui/DebugPanel.js`）
- [ ] 無敵/経験値追加/レベル追加/任意スキル取得・Lv変更・進化/残り火・魂炎追加/敵全滅/ボス即時/
      速度0.5〜5倍/経過時間変更/転生条件達成
- [ ] FPS/敵数/弾数/パーティクル数/プール使用数の表示

### パフォーマンス
- [ ] 最寄り敵検索の空間グリッド化、当たり判定の総当たり解消（M1 は総当たり）
- [ ] 画面外エフェクト削減、パーティクル/敵/弾の安全上限、低負荷モード
- [ ] タブ非表示中に処理を進めない（M1 実装済みの自動停止を保存と統合）

---

## 拡張余地（M5以降）
- [ ] 周回長の拡張（10分/15分/無限モード）
- [ ] 追加の敵・ボス・スキル・進化
- [ ] 実績システムの本実装
- [ ] スキル分岐（熟練度による）
