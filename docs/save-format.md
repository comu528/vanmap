# セーブフォーマット

セーブは JSON。M2 時点で **localStorage のみ**。フォルダ保存/バックアップ/競合解決は **M5** で実装する。
以下は最終形の完全仕様（各項目に実装済み範囲を明記）。

## save_version
`data/balance.json` の `saveVersion`（現在 `2`）を各セーブに埋め込む。
- **profile**: 版差があれば不足フィールドを既定値で補って移行し版数を更新する（追加専用スキーマ）。
- **active_run**: 版不一致・破損・必須欠落なら破棄して「新規のみ可」に安全にフォールバックする
  （途中再開できないだけで起動不能にはならない）。
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

## profile.json
```jsonc
{
  "save_version": 1,
  "game_version": "0.1.0",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "currencies": { "ember": 0, "soulflame": 0 },   // 所持通貨/転生通貨
  "permanentUpgrades": { "max_hp": 3, "base_damage": 5, ... },  // id -> tier
  "difficultyUnlocked": [1, 2],                    // 難易度解放
  "reincarnationCount": 0,                          // 転生回数
  "reincarnationNodes": ["extra_choice"],           // 解放済み転生ノード（転生強化）
  "skillMastery": {                                 // スキル熟練度
    "fireball": { "casts": 0, "hits": 0, "kills": 0, "damage": 0, "evolutions": 0, "maxLevel": 1 }
  },
  "stats": { "runs": 0, "kills": 0, "bossKills": 0, "bestTime": 0 },  // 累計統計
  "achievements": []
}
```
**M1 実装済み**: `save_version, game_version, created_at, updated_at, currencies, permanentUpgrades,
difficultyUnlocked, reincarnationCount, reincarnationNodes, skillMastery, stats, achievements` の
スキーマを `SaveManager` が生成・保持（多くは既定値。実際の加算は M3/M4 で接続）。

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
