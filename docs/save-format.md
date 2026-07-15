# セーブフォーマット

セーブは JSON。M3 時点で **localStorage のみ**。フォルダ保存/バックアップ/競合解決は **M5** で実装する。
以下は最終形の完全仕様（各項目に実装済み範囲を明記）。

## save_version
`data/balance.json` の `saveVersion`（現在 `3`）を各セーブに埋め込む。
- **profile**: 版差があれば **明示マッピングで移行** し版数を更新する（旧 `currencies.ember`→`embers`、
  `difficultyUnlocked`→`unlockedDifficulties`、`stats`→`statistics` 等。不足は安全な初期値）。
- **active_run**: 実行データは v2/v3 でスキーマ互換のため `save_version>=2` を許容して再開する。
  過古版・破損・必須欠落なら破棄して「新規のみ可」に安全にフォールバックする（起動不能にはならない）。
- BootScene が `SaveManager.init(saveVersion, gameVersion)` で版数を注入する。

## 保存先の優先順位
- フォルダ接続時: (1) フォルダ内 JSON → (2) ブラウザ内バックアップ
- フォルダ未接続時: (1) IndexedDB / localStorage → (2) JSON 手動入出力
- フォルダ内とブラウザ内が競合したら `updated_at` を比較しユーザーに選択させる。

## フォルダ構成（M5）
```
ReincarnationFlameSurvivorData/
├─ profile.json
├─ active_run.json
├─ settings.json
└─ backups/
   ├─ profile_YYYYMMDD-HHMMSS.json
   └─ ...（最大10世代、古いものから削除）
```
`window.showDirectoryPicker()` で取得したフォルダにのみ書き込む。勝手な書き込みはしない。
`FileSystemDirectoryHandle` は IndexedDB に保存し、次回起動で再取得（権限が無ければ再許可を求め、
失敗してもクラッシュしない）。`showDirectoryPicker` 非対応時は localStorage / JSON DL・インポートへ。

## profile.json（v3・M3 実装済み）
```jsonc
{
  "save_version": 3,
  "game_version": "0.3.0",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "embers": 0,                                       // 所持残り火
  "lifetimeEmbers": 0,                               // 累計獲得残り火
  "permanentUpgrades": { "max_hp": 3, "base_damage": 5 },  // id -> level
  "selectedDifficulty": 1,                           // 選択中の難易度
  "unlockedDifficulties": [1, 2],                    // 解放済み難易度
  "highestClearedDifficulty": 1,                     // クリア済み最高難易度（0=なし）
  "skillMastery": {                                  // スキル熟練度（周回で加算）
    "fireball": { "casts": 0, "hits": 0, "kills": 0, "damage": 0,
                  "maxLevel": 1, "runsUsed": 0, "evolutions": 0 }
  },
  "statistics": {                                    // 累計統計
    "totalPlayTime": 0, "totalRuns": 0, "totalWins": 0, "totalDefeats": 0,
    "totalKills": 0, "totalBossKills": 0, "highestDamage": 0
  },
  "lastResultId": null,                              // 残り火の二重加算防止

  // Milestone 4 用の前方互換（現状未使用）
  "currencies": { "soulflame": 0 },
  "reincarnationCount": 0,
  "reincarnationNodes": [],
  "achievements": []
}
```
**M3 実装済み**: 周回終了時に `ProgressionManager.completeRun()` が `embers/lifetimeEmbers/statistics/
skillMastery/highestClearedDifficulty/unlockedDifficulties/lastResultId` を更新して保存。
恒久強化購入は `permanentUpgrades[id]` を増やし `embers` を減算して即保存。難易度選択は `selectedDifficulty`。
熟練度レベルは `skillMastery` の累積値から `data/skill-mastery.json` の曲線で算出（保存はしない導出値）。

## active_run.json
```jsonc
{
  "inProgress": true,
  "difficulty": 1,
  "elapsedSec": 123.4,
  "playerHp": 80,
  "playerLevel": 5,
  "xp": 12,
  "skills": { "fireball": 3, "orbiting_flame": 1 },  // id -> level
  "rngSeed": 123456789,                              // 乱数シード（決定論再構築用）
  "pendingCurrency": 40                              // 獲得予定通貨
}
```
敵の個体位置までは保存しない。再開時は `elapsedSec` と進行状況から戦闘を安全に再構築する
（`utils/math.js` の `createRng(seed)` を用いた決定論的スポーン。M2 で実装）。

**M2 実装済み**: 実際の値で `save_version / inProgress / difficulty / elapsedSec / playerHp / maxHp /
playerLevel / xp / xpToNext / skills(id→level) / kills / bossActive / bossHp / rngSeed /
pendingCurrency / bonus / updated_at` を保存。自動保存は 20秒毎・レベルアップ選択後・一時停止時・
タブ非表示時。`BattleScene.restoreFromRun()` が進行状況から戦闘を再構築する（敵個体は復元しない。
ボスは `bossActive` なら再出現し `bossHp` を復元）。勝敗確定で削除。`hasActiveRun()` が true のとき
タイトルの「続きから」が有効になる。

## settings.json
```jsonc
{
  "effectQuality": "high",     // low|medium|high|ultra
  "damageNumbers": true,
  "screenShake": true,
  "whiteFlash": true,
  "autoMove": false
}
```
**M1 実装済み**: `SaveManager.loadSettings/saveSettings`（既定値マージ）。設定 UI は M2。

## 自動保存タイミング（M5 で全対応）
20秒毎 / レベルアップ候補選択後 / 一時停止時 / 戦闘終了時 / 恒久強化購入時 / 転生時 /
タブ非表示直前。非同期保存の失敗を考慮し、定期保存を主とする。

## バックアップ / 復旧（M5）
`profile.json` 上書き前に `backups/` へ複製（最大10世代、古い順に削除）。
JSON 破損時は復元候補を提示し、**自動では復元せずユーザーへ確認**する。
