# 引き継ぎメモ（Milestone 5 開始用）

このファイルは、次セッションが最初に読むための引き継ぎ資料です。実装済み内容は現在のコード・
README・TODO・docs・data を確認して記載しています。**次の作業は Milestone 5-A（空間グリッドと
戦闘パフォーマンス最適化）** です。

---

## 1. ブランチ / リポジトリ

- 作業ブランチ: **`claude/funny-heisenberg-frhgq9`**（このブランチで開発・コミット・プッシュ）
- 直近コミット: `7524f1f Milestone 4: スキル進化・転生・魂炎・転生強化・拠点拡張`
- 仮タイトル: **Reincarnation Flame Survivor**（見下ろし型2Dサバイバー、火の魔女）

---

## 2. 実装済み機能（Milestone 1〜4）

### Milestone 1
静的サイト / GitHub Pages / Phaser 起動（640×360, pixelArt, FIT, WebGL優先→Canvasフォールバック）/
タイトル / 仮ドット素材の実行時生成（外部画像なし）/ プレイヤー移動・ダッシュ / 敵出現 / 自動火球 /
敵撃破 / 経験値 / レベルアップ3択。

### Milestone 2
5種スキル（火球・火柱・燃える軌跡・周回する炎・隕石、各最大Lv8、JSON駆動）/ ボス戦（突進・円形弾・
召喚・HP50%激昂）/ リザルト / EffectManager（**判定と演出の分離**）/ オート移動改善 / 一時停止メニュー /
途中再開（localStorage）。

### Milestone 3
拠点（BaseScene）/ 残り火の正式実装（生存・討伐・ボス・難易度・勝敗補正、敗北時も少量、二重加算防止）/
恒久強化10種 / 難易度選択・解放（勝利で次解放）/ スキル熟練度（Lv1-20）/ profile 拡張＋移行 /
BattleScene の責務分離（SpawnManager / BattleManager / PauseMenu / ProgressionManager）。

### Milestone 4
- **スキル進化3種**（`data/skill-evolutions.json` 駆動、ハードコードなし）:
  火球→業火弾幕 / 火柱→煉獄噴火 / 燃える軌跡→永劫火界。金枠の進化候補→専用演出（EvolutionScene、
  **演出は置換処理と分離**）→枠を消費せず置換、一周一度。進化後ダメージは基礎スキル熟練度へ加算。
- **熟練度と進化の連携**: Lv5 候補率↑ / Lv10 初期Lv2 / Lv15 進化条件緩和 / Lv20 進化後追加効果。
- **転生**（拠点「転生」タブ、二段階確認）: 条件は難易度3クリア or **今周回**の累計残り火5000
  （farming 防止のため cycle 単位で判定）。リセット/維持は §4 参照。
- **魂炎（soulflame）**: log/√で緩やかに獲得、初回≥1、`lastReincarnationId` で二重取得防止。
- **魂炎強化10種**: 選択肢拡張(4択)/初期火力/初期スキルLv/連鎖拡張/敵密度/エフェクト上限/恒久上限/
  倍速(1.5x・2x)/オートダッシュ/開始ボーナス。戦闘へ反映。
- **拠点**: 概要/恒久強化/熟練度/難易度/転生/魂炎強化の6タブ＋スクロール（ホイール/ドラッグ/バー/キー）。
- **安全上限**: `balance.combatCaps` と各進化 `safetyCaps` を毎フレーム予算化（AoE/追撃火球/死亡爆発連鎖/
  感染世代/ダメージ数字/パーティクル）。**上限到達でも戦闘ロジックは停止しない**。ボスへ感染・引き寄せ非適用。
- `?debug=1` のときだけ F1（拠点/戦闘）で最小テスト機能。通常URLでは非公開。

> 実プレイの体感・描画・エフェクトは自動確認できていない（ヘッドレスでのロジック/遷移確認のみ）。

---

## 3. 主要ファイル構成（現状）

```
index.html / .nojekyll / README.md / TODO.md
styles/main.css
src/
  main.js                起動・シーン登録・全画面。?debug=1 で window.RFS に各Manager公開
  config/game-config.js  定数・Phaser設定・テクスチャキー
  scenes/  Boot / Title / Base(拠点) / Battle / LevelUp / Evolution(進化演出) / Result
  entities/ Player / Enemy(炎上対応) / Boss / Projectile(貫通減衰) / ExperienceGem
  skills/  SkillBase / Fireball / FlamePillar / BurningTrail / OrbitingFlame / Meteor /
           EvolvedSkillBase / InfernalBarrage / PurgatoryEruption / EternalPyre
  systems/ DataManager / SaveManager / ProgressionManager / ReincarnationManager /
           EvolutionManager / SpawnManager / BattleManager / PoolManager / SkillManager / EffectManager
  ui/      HUD / PauseMenu
  utils/   math(createRng含む) / time / validation
data/  balance / skills / enemies / bosses / permanent-upgrades /
       skill-mastery / skill-evolutions / reincarnation（すべて JSON）
docs/  game-design / architecture / data-format / save-format / test-guide / handoff-m5(本ファイル)
tests/validate-data.mjs   Node標準のみのデータ検証
.github/workflows/  static.yml（公開） / validate.yml（データ検証）
```

### 当たり判定・敵検索の現状（M5-A の対象）
- `BattleScene.checkCollisions()` が **弾×敵を総当たり（O(弾×敵)）**。
- `BattleScene.targetsInRadius/nearestTarget/densestPoint` も敵配列を線形走査。
- 最寄り敵/ジェムの再計算は 120ms 間隔（`updateRecalc`）。
- 敵・弾・ジェムは `PoolManager`（`Pool`）で再利用。敵の最大数は `effSettings.maxEnemies`＋魂炎の敵密度、
  弾は `effSettings.maxProjectiles`＋エフェクト上限。品質は `data/balance.json` の `effectQuality`。

---

## 4. profile v4 と active_run の概要

`save_version` は現在 **4**（`data/balance.json` の `saveVersion`）。詳細は `docs/save-format.md`。

### profile（localStorage キー `rfs_profile`）
`embers / lifetimeEmbers / permanentUpgrades{id:level} / selectedDifficulty / unlockedDifficulties /
highestClearedDifficulty / skillMastery{id:{casts,hits,kills,damage,maxLevel,runsUsed,evolutions}} /
statistics{totalPlayTime,totalRuns,totalWins,totalDefeats,totalKills,totalBossKills,highestDamage} /
lastResultId / reincarnationCount / soulflame / lifetimeSoulflame / reincarnationUpgrades{id:level} /
highestEverDifficulty / lastReincarnationId / reincarnationHistory[] / unlockedFeatures / evolutionStatistics /
currentCycle{cycleNumber,cycleEmbers,cycleHighestDifficulty,cycleBossKills,cycleStartTime}`。
- v1/v2/v3 から **明示マッピングで移行**（不足は安全な初期値）。起動不能にしない。
- 転生でのリセット: 所持残り火・恒久強化・選択難易度・解放難易度（開始へ）・今周回のクリア進捗（`currentCycle`）。
- 転生で維持: 転生回数・魂炎・累計魂炎・魂炎強化・熟練度累計・統計・過去最高難易度・設定。

### active_run（localStorage キー `rfs_active_run`）
`inProgress / save_version / difficulty / elapsedSec / playerHp / maxHp / playerLevel / xp / xpToNext /
skills{id:level} / evolvedBase[] / kills / bossActive / bossHp / rngSeed / bonus / cycleNumber / updated_at`。
- 敵の個体位置は保存しない（`elapsedSec` と進行状況から再構築、`createRng(seed)` で決定論スポーン）。
- `save_version>=2` は互換で再開可。**`cycleNumber` が現在の `reincarnationCount` と不一致なら破棄**（転生またぎ再開防止）。
- 自動保存: 20秒毎 / レベルアップ選択後 / 一時停止時 / タブ非表示時。勝敗確定・転生で削除。

### settings（localStorage キー `rfs_settings`）
`effectQuality(low/medium/high/ultra) / damageNumbers / screenShake / whiteFlash / autoMove / speed`。

---

## 5. ビルド・公開・環境の制約（必ず守る）

- **GitHub 上の Claude Code 環境**で作業している。ローカルPCへのソフトのインストールを前提にしない
  （Godot/Unity等のエディタ起動・ローカル実プレイ確認・Windows実行ファイル生成・常駐サーバー起動は不可）。
- **npm・ビルド工程を新たに必須化しない。** `package.json` なし、TypeScript なし、外部API/DB/バックエンドなし。
- **静的構成を維持**: HTML / CSS / JavaScript（ES Modules）/ **Phaser 3.90.0**。Phaser は CDN 固定
  `https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js`。
- **すべて相対パス**（`./src/...` 等）。ルート絶対パス禁止（GitHub Pages のリポジトリ名付きURLで壊れないため）。
- GitHub Pages 公開は **`.github/workflows/static.yml`** を使用（Pages画面から作成・稼働中）。
  **`.github/workflows/validate.yml`**（`node tests/validate-data.mjs`）を維持。
- **`pages.yml` は削除済み。再作成しない。** Pages ワークフローを追加・重複させない。
- 仮素材はすべて `BootScene` が実行時生成（正式な画像素材は追加しない、全面的なグラフィック改修もしない）。
- 実行していないものを「動作確認済み」と報告しない。

---

## 6. 既知の問題

- **当たり判定・敵検索が総当たり/線形**（O(弾×敵)、`targetsInRadius`/`nearestTarget`/`densestPoint`）。
  進化スキルで弾・爆発・感染が増えるため、現状は毎フレームの安全上限（`combatCaps`/`safetyCaps`）で暴走を
  防いでいるが、本格的な空間分割最適化は未実装 → **M5-A の主対象**。
- 極端な高密度＋倍速では体感負荷が上がる可能性。倍速は physics/time/tween の timeScale とロジック dt を
  一括スケールしている。
- 転生条件を「今周回(cycle)の累計残り火」で判定（無限転生 farming 防止の設計判断。docs に記録済み）。
- 5分生存は難しめ（バランスは M1〜M4 で意図的に全面調整していない。恒久強化・転生・魂炎で徐々に到達しやすくなる設計）。
- ヘッドレス Chromium は RAF が間引かれ、非フォーカス時に自動一時停止が働くため、実時間ループ継続や
  時間依存の演出タイミングは自動計測が不安定。ロジックは決定論的に別途検証している。

---

## 7. 次の作業: Milestone 5-A「空間グリッドと戦闘パフォーマンス最適化」

### 目的
大量の敵・弾・エフェクト（特に進化スキル）でも安定動作するよう、近傍検索を最適化する。

### 想定スコープ（実装対象）
- 空間グリッド（uniform grid / bucket）を導入し、`checkCollisions`（弾×敵）と `targetsInRadius` /
  `nearestTarget` / `forEachEnemyInRadius` / `densestPoint` をグリッド近傍検索へ置換。
- 毎フレーム全敵への重い処理を避ける。画面外エフェクトの削減、パーティクル/敵/弾の上限運用の見直し。
- 既存の安全上限（`combatCaps`/`safetyCaps`）とオブジェクトプールは維持・活用。
- 計測は `?debug=1` の FPS/敵数/弾数/パーティクル数/プール使用数 表示の追加を検討（本格デバッグパネルは M5-B以降）。

### やらないこと（重要）
- **保存機能は実装しない**（フォルダ保存 / `showDirectoryPicker` / IndexedDB ハンドル / バックアップ /
  JSON 入出力 / 競合解決 は M5-B 以降）。
- **ゲームバランスを変更しない**（敵HP・攻撃力・経験値・スキル威力・難易度倍率・報酬などの数値を触らない）。
  最適化はあくまで内部実装の置換で、**戦闘結果（与ダメージ・撃破・出現）を変えない**こと。
- 正式な画像素材の追加・全面グラフィック改修・新キャラ/新属性・実績システム完成 はしない。

### 非回帰の担保方針
- M1〜M4 の自動確認と同じ手法（ヘッドレス＋`?debug=1` の `window.RFS` 経由）で、最適化前後の
  与ダメージ・撃破・進化・転生・魂炎が不変であることを確認する。`node tests/validate-data.mjs` を維持。

---

## 8. 開発時の確認コマンド（ローカル不要・GitHub 環境内）

- データ検証: `node tests/validate-data.mjs`（Node標準のみ）。CI は `validate.yml`。
- 構文チェック: `node --check <file>`（各 `src/**/*.js`）。
- ヘッドレス確認（任意）: CDN は環境ポリシーで遮断される場合があるため、npm から取得した同一 Phaser を
  Playwright の route で差し替えて index.html を無改変のまま起動し、`window.RFS`（`?debug=1`）でロジック検証。
  過去セッションのスクリプトはセッション用スクラッチにあり、リポジトリには含めない。
