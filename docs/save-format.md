# セーブフォーマット

セーブは JSON。**M5-B で保存レイヤーを実装済み**。localStorage を「同期のライブキャッシュ（唯一の
即時読み書き先）」として維持しつつ、対応ブラウザでは **File System Access API** でユーザーが選択した
フォルダへミラー保存し、バックアップ/JSON入出力/競合解決を行う。既存の同期呼び出し（ProgressionManager 等）は
変更していない（フォルダ保存は非同期のミラーとして上乗せ）。

## 保存レイヤーの構成（M5-B）
- `src/storage/StorageAdapter.js` … 保存先の共通インターフェース（read/write/remove/listBackups/createBackup/
  restoreBackup/pruneBackups/getMetadata/testConnection）。単位は「エンベロープ」。
- `BrowserStorageAdapter`（localStorage）/ `FolderStorageAdapter`（FS Access API）/ `MemoryStorageAdapter`（テスト）。
- `SaveCoordinator` … 保存要求のデバウンス/キュー、直列書き込み、フォルダ+ミラー、バックアップ方針、
  manifest 更新、複数タブ制御。`SaveValidator`（checksum/エンベロープ/インポート検証）、`SaveConflictResolver`（競合検出/推奨）。
- `SaveService` … UI と上記を繋ぐファサード（接続/再接続/解除/今すぐ保存/再読込/エクスポート/インポート/バックアップ/競合）。
- `SaveManager` … localStorage のライブキャッシュ + v5 移行 + coordinator への通知。

## 対応ブラウザ / 非対応時
- **フォルダ保存**は `window.showDirectoryPicker()`（Chrome/Edge 等の Chromium 系、**HTTPS** 必須＝GitHub Pages 前提）で使用可能。
- **非対応/権限拒否/フォルダ未接続**でも、ブラウザ内保存（localStorage）と JSON 入出力でゲームは起動・プレイ・保存できる。
- フォルダ書き込みに失敗しても、ブラウザ内保存へフォールバックし、ゲーム進行やリザルト確定は失敗させない。

## save_version
`data/balance.json` の `saveVersion`（現在 `5`）を各セーブに埋め込む。
- **profile**: 版差（v1〜v4）があれば **明示マッピングで移行** し版数を v5 へ更新する（旧 `currencies.ember`→`embers`、
  `difficultyUnlocked`→`unlockedDifficulties`、`stats`→`statistics` 等。転生系フィールドは安全な初期値）。
  移行は `src/systems/profileSchema.js` の `migrateProfile`（純粋関数・Nodeでテスト可）。
- **移行前バックアップ**: v5 へ移行する前に、旧 `rfs_profile` / `rfs_active_run` を
  `rfs_profile_backup_v{old}_{時刻}` / `rfs_active_run_backup_v{old}_{時刻}` へ退避し、`rfs_migrations` に記録する。
  古い不要キーは**即時削除しない**（将来の掃除用に記録を残す）。
- **active_run**: 実行データは v2 以降でスキーマ互換のため `save_version>=2` を許容して再開する。
  加えて `cycleNumber` が現在の `reincarnationCount` と一致しない（＝転生をまたいだ）場合は破棄する。
  過古版・破損・必須欠落なら破棄して「新規のみ可」に安全にフォールバックする（起動不能にはならない）。
- BootScene が `SaveManager.init(saveVersion, gameVersion)` で版数を注入する。

## 保存先の優先順位（M5-B 実装済み）
- **フォルダ接続時**: (1) フォルダ保存（primary）→ (2) ブラウザ内へミラー保存。
- **フォルダ未接続時**: (1) ブラウザ内保存（primary）→ (2) 手動 JSON エクスポート。
- フォルダ書き込み失敗時はブラウザ内保存へ安全にフォールバック（`degraded` 表示、ゲームは継続）。
- フォルダ内とブラウザ内が競合したら `SaveConflictResolver` が検出し、**ユーザーに選択させる**（自動決定しない）。

## エンベロープ（保存データ共通形式・M5-B）
profile.json / active_run.json / settings.json は、ゲームデータ本体（payload）に加えメタ情報を持つ。
```jsonc
{
  "formatVersion": 1,
  "type": "profile",              // profile | activeRun | settings
  "saveVersion": 5,
  "gameVersion": "0.5.0",
  "saveId": "一意ID（保存系列の同一性）",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "writerId": "ブラウザ・タブ単位の一意ID",
  "checksum": "fnv1a:xxxxxxxx",   // payload の破損検出（暗号用途ではない）
  "payload": { /* profile / active_run / settings のデータ本体 */ }
}
```
- checksum は `SaveValidator` の安定 JSON 文字列化（キー順固定）→ FNV-1a 32bit。算出不能時は `len:<長さ>` へフォールバック。
- localStorage のライブキャッシュ（`rfs_profile` 等）は後方互換のため**生の payload**のまま保持し、
  エンベロープ化した複製は `rfs_env_profile` 等（ブラウザ内 durable/ミラー）に保存する。

## フォルダ構成（M5-B）
```
ReincarnationFlameSurvivorData/
├─ profile.json
├─ active_run.json
├─ settings.json
├─ manifest.json
└─ backups/
   ├─ profile_YYYYMMDD_HHMMSS.json
   ├─ active_run_YYYYMMDD_HHMMSS.json
   └─ settings_YYYYMMDD_HHMMSS.json（自動最大10・手動最大5世代、古い順に削除）
```
`window.showDirectoryPicker()` で取得したフォルダの**専用サブフォルダ内のみ**に書き込む。ユーザーの他ファイル・
他フォルダは削除・変更しない。既存の同名フォルダがあれば再利用する。`FileSystemDirectoryHandle` は IndexedDB に保存し、
次回起動で再取得する（起動時に許可ダイアログは出さない。権限が無ければ状態を「再許可が必要」とし、
ユーザーが「再接続」を押したときに許可を求める）。非対応時は localStorage / JSON 入出力へフォールバック。

### manifest.json
`formatVersion / gameVersion / saveVersion / createdAt / updatedAt / latestSaveId /
profileUpdatedAt / activeRunUpdatedAt / settingsUpdatedAt / backupCount / writerId /
files{ profile, activeRun, settings }` を持ち、**本ファイル群の書き込み後に最後に更新**する。
`manifest.latestSaveId` と実ファイルの `saveId` が食い違う場合は競合として扱う。

## 安全な書き込み（M5-B）
フォルダ保存は次の手順で行う: 1) `*.tmp.json` へ書く → 2) 読み直して一致検証 → 3) 本ファイルへ書く →
4) 読み直して checksum 検証 → 5) `manifest.json` を最後に更新 → 6) 一時ファイルを削除。
- **制約**: ブラウザ API には原子的 rename が無いため「一時→本ファイルの原子的差し替え」はできない。
  代わりに**上書き前バックアップ + 書き込み後検証**で破損リスクを下げる（電源断等の完全な保証はしない）。

## バックアップ（M5-B）
profile/active_run/settings を上書きする前に、必要に応じて旧データを `backups/` へ退避する。
- 作成条件: 転生 / 魂炎強化購入 / 恒久強化購入 / セーブ移行 / インポート / 競合解決 / 手動 / 一定間隔を超えた定期保存。
- 上限/間隔（`data/balance.json` の `save`）: **自動最大10世代・手動最大5世代・自動の最小間隔5分**。20秒保存ごとに毎回は作らない。
- 削除対象はゲームが作成したバックアップのみ。復元前には現在データを自動バックアップし、復元は確認画面を出す。

## JSON エクスポート / インポート（M5-B）
- **エクスポート**: 一式（`exportFormatVersion/exportedAt/gameVersion/saveVersion/profile/activeRun/settings/manifest相当`）、
  または profile/active_run/settings 単体を、`ReincarnationFlameSurvivor_Save_YYYYMMDD_HHMMSS.json` として
  Blob + Object URL でダウンロード（外部送信なし）。
- **インポート**: JSON 構文 / exportFormatVersion / saveVersion / 必須項目 / 型 / 負の通貨 / 不正な強化レベル /
  存在しない難易度・スキル・進化 / 巨大ファイル（`save.maxImportBytes`）/ **プロトタイプ汚染キー
  (`__proto__`/`prototype`/`constructor`)** を検証（`SaveValidator.validateImportBundle`）。既存オブジェクトへ
  そのまま `Object.assign` せず、`sanitize` で危険キーを除去し `migrateProfile` を通して既定スキーマへマッピングする。
  適用前に現在データとインポートデータを比較表示し、置換 / 現在維持 / キャンセル をユーザーが選ぶ（自動マージなし）。置換前に自動バックアップ。

## 競合解決（M5-B）
判定に使う値: `saveId / updatedAt / saveVersion / writerId / reincarnationCount / lifetimeSoulflame /
lifetimeEmbers / statistics.totalPlayTime / currentCycle.cycleNumber / active_run 経過時間`。
競合条件: saveId が異なる / updatedAt が大きく異なる / 一方だけ進行度が高い / 別 writerId 更新 /
profile と active_run の cycleNumber 不一致 / manifest と実ファイルの saveId 不一致。
解決画面はブラウザ内とフォルダ内を横並び表示し、**採用（ブラウザ/フォルダ）/ 両方エクスポート / 読み取り専用で開始**を選ばせる。
推奨は表示するが最終決定はユーザー。採用しなかった側はバックアップする。更新日時だけで自動決定しない。

## 複数タブ制御（M5-B）
`BroadcastChannel('rfs_save')` + localStorage の書き込みロック（`rfs_writer_lock` = {writerId, ts}）+
タブ単位 writerId（sessionStorage）で上書き事故を軽減する。先に開いたタブが書き込み可能、後から開いたタブは
読み取り専用（データ管理画面の「書込権を引き継ぐ」で最新を再読込して引き継げる）。
**制約**: ブラウザ API では厳密な排他はできないため、これは事故軽減であり完全な保証ではない。

## 保存失敗時の挙動（M5-B）
フォルダ選択キャンセル / 権限拒否・失効 / 容量不足 / 読み書き失敗 / 不正JSON / checksum 不一致 /
manifest 不整合 / cycleNumber 不一致 / ハンドル復元失敗 / IndexedDB 不可 / localStorage 容量不足 /
ダウンロード失敗 / 複数タブ競合 を個別に扱い、クラッシュさせず分かりやすいメッセージと console 記録を行う。
保存不能でもメモリ内の進行は維持し、状態はデータ管理画面（および `degraded`/`readOnly` 表示）で確認できる。

## profile.json（payload・v5）
> v4→v5 は保存フォーマットの版上げのみで、profile payload のゲームデータ項目は M4 と同一。
```jsonc
{
  "save_version": 5,
  "game_version": "0.5.0",
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

  // --- Milestone 4: 転生・魂炎 ---
  "reincarnationCount": 0,                           // 転生回数（維持）
  "soulflame": 0,                                    // 所持魂炎（維持）
  "lifetimeSoulflame": 0,                            // 累計魂炎（維持）
  "reincarnationUpgrades": { "extra_choice": 1 },    // 魂炎強化 id -> level（維持）
  "highestEverDifficulty": 0,                        // 過去最高難易度（維持）
  "lastReincarnationId": null,                       // 魂炎の二重取得防止
  "reincarnationHistory": [ /* {id,count,soulflame,at,...} 最大50 */ ],
  "unlockedFeatures": {},
  "evolutionStatistics": { "infernal_barrage": { "damage": 0, "kills": 0, "times": 0 } },
  "currentCycle": {                                  // 今周回の進捗（転生でリセット）
    "cycleNumber": 0, "cycleEmbers": 0, "cycleHighestDifficulty": 0,
    "cycleBossKills": 0, "cycleStartTime": "ISO8601"
  },
  "achievements": []
}
```
**M4 実装済み**: 周回終了時に `completeRun()` が上記統計＋`currentCycle.cycleEmbers/cycleBossKills` と
進化統計（基礎スキル熟練度への加算・`evolutions`・`evolutionStatistics`）を更新。
`ReincarnationManager.reincarnate()` が魂炎を加算（`lastReincarnationId` で二重防止）し、
リセット（embers/permanentUpgrades/selectedDifficulty/unlockedDifficulties/highestClearedDifficulty/currentCycle）と
維持（reincarnationCount/soulflame/lifetimeSoulflame/reincarnationUpgrades/skillMastery/statistics/highestEverDifficulty）を適用、
`active_run` を破棄して即保存。魂炎強化購入は `reincarnationUpgrades[id]` を増やし `soulflame` を減算して即保存。
転生条件は farming 防止のため `currentCycle.cycleEmbers`（今周回）と当周回の `highestClearedDifficulty` で判定。

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
  "evolvedBase": ["fireball"],                        // 当周回で進化済みの基礎スキル（M4）
  "rngSeed": 123456789,                              // 乱数シード（決定論再構築用）
  "cycleNumber": 0                                   // 転生周回番号（M4・またぎ再開防止）
}
```
敵の個体位置までは保存しない。再開時は `elapsedSec` と進行状況から戦闘を安全に再構築する
（`utils/math.js` の `createRng(seed)` を用いた決定論的スポーン。M2 で実装）。

**M2→M4 実装済み**: 実際の値で `save_version / inProgress / difficulty / elapsedSec / playerHp / maxHp /
playerLevel / xp / xpToNext / skills(id→level) / evolvedBase / kills / bossActive / bossHp / rngSeed /
bonus / cycleNumber / updated_at` を保存。自動保存は 20秒毎・レベルアップ選択後・一時停止時・
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
  "autoMove": false,
  "speed": 1                   // 倍速（魂炎で解放時のみ 1.5/2 を選択可能・M4）
}
```
**M1→M4 実装済み**: `SaveManager.loadSettings/saveSettings`（既定値マージ）。品質・数字・揺れ・倍速の切替は一時停止メニュー。

## 自動保存タイミング（M5-B 実装済み）
20秒毎 / レベルアップ選択後 / 進化選択後 / 一時停止時 / 戦闘終了時 / 恒久強化購入時 / 魂炎強化購入時 /
転生時 / 設定変更時 / タブ非表示直前 / 「今すぐ保存」。短時間の連続要求は `SaveCoordinator` が
デバウンス（既定 800ms）＋キューで整理し、**同時書き込みを避け・最新状態を最後に保存**する
（古い保存が新しい保存を上書きしない）。書き込み失敗でも未処理要求が無限ループしない。

## バックアップ / 復旧（M5-B 実装済み）
本ファイル上書き前に `backups/` へ複製（自動最大10・手動最大5世代、古い順に削除。自動は最小5分間隔）。
破損検出は checksum + 書き込み後検証。復元は**自動では行わず**、データ管理画面で候補を提示してユーザーが選ぶ。
復元前には現在データを自動バックアップする。

## Milestone 6-A: ジョブ・パッシブ・スキル抽選（save_version 6）
`saveVersion` を **6** に更新。v1〜v5 から安全に移行（移行前の旧キー退避は M5-B と同じ）。
旧 active_run の既存アクティブスキルは削除せず、超過周回はその周回のみ所持維持（新規取得のみ禁止）。

### profile 追加フィールド（v6）
```jsonc
{
  "selectedJobId": "flame_witch",
  "unlockedJobs": ["flame_witch"],
  "jobProgress": {},                 // jobId -> 進捗（将来のジョブ育成特典）
  "passiveMastery": {                // active とは別体系（ダメージ統計は持たない）
    "power_amp": { "runsUsed": 0, "maxLevel": 0, "picks": 0, "appliedTimeMs": 0 }
  },
  "futureInheritanceSettings": {},   // 将来の継承枠設定（M6-A 未使用の拡張口）
  "reincarnationUpgrades": { "active_skill_slots": 0 } // 魂炎強化（4→6→8枠）
}
```
移行時、v5 以前は上記を安全な既定値で付与し、既存の残り火/魂炎/強化/熟練度/統計/転生系は保持する。

### active_run 追加フィールド（v6）
```jsonc
{
  "jobId": "flame_witch",
  "activeSkillSlots": 4, "passiveSkillSlots": 4,
  "skills": { "fireball": 3 },        // アクティブ（従来）
  "passiveSkills": { "power_amp": 2 },// パッシブ id -> level
  "draftState": {
    "seed": 123, "cursor": 5, "levelUpSequence": 3, "currentDraftId": "3:5",
    "currentCandidates": [ /* 表示中の候補（再読込で不変） */ ],
    "rerollsRemaining": 1, "banishesRemaining": 1, "skipsRemaining": 1, "banishedSkillIds": []
  }
}
```
JSON エクスポート/インポート・バックアップ・競合比較は payload 全体を扱うため、新フィールドも自動的に保持される
（インポートは `migrateProfile` を通すため未知キーは採用されず、passiveMastery/jobs は既定へマッピングされる）。

## Milestone 6-B: 火の魔女スキル拡張（save_version は 6 のまま）
新 active 10種・進化5種の追加は **active_run へ加算的なフィールドを足すだけ**で、profile/active_run の既存構造を変えない。
そのため **`saveVersion` は 6 のまま**（不要な版上げをしない）。v1〜v6 からの移行は M6-A と同じ経路で、既存データを保持する。

### active_run.skillRuntime（新規・任意フィールド）
新スキルの実行時状態（不死鳥/障壁のクールダウン・所持刻印・召喚など再開に必要な最小限）を保存する。
無い（旧セーブ・新スキル未所持）場合は空として安全に再開する。
```jsonc
{
  "skillRuntime": {
    "phoenix_feather": { "ready": true, "cdLeft": 0 },       // 不死鳥: 準備状態と残りCD（再読込でCDを巻き戻さない）
    "flame_barrier":   { "cdLeft": 0, "hitsLeft": 0 },        // 障壁: 残りCDと残り被弾回数
    "fire_spirit":     { "spawned": 2 }                       // 召喚数など（スキル側 serializeState/restoreState）
    // 追尾/渦/刻印など瞬間的な弾・敵状態は保存せず、時間経過から自然に再構築する
  }
}
```
- 保存対象: 新スキルの所持/レベル/進化（既存の `skills`/`evolvedBase`）・枠（`activeSkillSlots`）・候補/追放（既存の `draftState`）・
  **不死鳥CD / 障壁CD・被弾残 / スキル固有ランタイム**（`skillRuntime`）。統計は profile 側 `skillMastery`（新スキル分も同形式）で保持。
- `SkillManager.serializeRuntime()`／`restoreRuntime()` が各スキルの `serializeState/restoreState` を集約する。
  `BattleManager` のスナップショットが `active_run.skillRuntime` に載せ、`BattleScene.restoreFromRun()` が復元する。
- 一時停止中は CD が進まず、再読込で CD を巻き戻せない（不死鳥を再読込で再充填する不正を防ぐ）。
- 敵に付いた起爆刻印（`Enemy._mark`）は敵個体を保存しないため復元しない（再開後の攻撃で付け直す）。
- profile 側は M6-A の `skillMastery`（active）を新スキルにもそのまま使う（casts/hits/kills/damage/maxLevel/runsUsed/evolutions ＋
  防御系の追加統計は `recordExtra` で同オブジェクトに格納）。新しい報酬体系や新通貨は追加しない。

## Milestone 6-C: 火の魔女ジョブ育成（save_version は 6 のまま）
周回をまたぐジョブレベルを追加する。`profile.jobProgress`（M6-A で空 `{}` の拡張口）を**加算的に**埋め、`active_run` へ周回開始時の凍結値を足すだけで既存構造を変えない。
そのため **`saveVersion` は 6 のまま**（jobProgress は既定値を安全に補える加算的追加なので、不要な v7 更新をしない）。v1〜v6 からの移行は M6-A/M6-B と同じ経路で既存データを保持し、**転生でもリセットしない**。

### profile.jobProgress（v6・M6-A の空 `{}` を実データで埋める）
`jobLevel` は保存せず `totalXp` から都度算出する。`jobId` キーで将来の複数ジョブへ拡張できる。
```jsonc
{
  "jobProgress": {
    "flame_witch": {
      "totalXp": 63700,              // 唯一の正（Lv100超過分も保持）
      "runs": 12, "wins": 3, "losses": 9,
      "totalSurvivalSeconds": 4200, "totalKills": 51000,
      "eliteKills": 120, "bossKills": 3,
      "highestBattleLevel": 41, "highestDifficultyPlayed": 4, "highestDifficultyCleared": 3,
      "totalEvolutions": 5, "lastPlayedAt": "2026-07-17T...", "lastXpGain": 5120,
      "lastAwardedRunId": "run_abc", "awardedRunIds": ["...", "..."]  // 二重獲得防止（上限40件で保持）
    }
  }
}
```
- 旧セーブ（`jobProgress` 無し・v1〜v5）は `flame_witch` を `totalXp=0` で開始（`emptyEntry`）。欠落フィールドは加算的に補完する。
- 安全化: `profileSchema.js` の `safeJobProgress` が **プロトタイプ汚染キーを除外**し、負数/非有限を安全化（`totalXp` は有限非負へ丸める）。
- 統計（runs/wins/losses/…/lastXpGain）は `JobProgressionManager.awardRun` が周回終了時に更新する。将来のジョブ実績/レガシー条件用の構造（現時点で転生レガシー判定には未使用）。

### active_run 追加フィールド（v6・周回開始時のジョブレベル凍結）
周回開始時にジョブレベルから解決した補正を凍結し、周回中は固定する。途中再開時はこの凍結値（`resolvedJobModifiers`）を使うため、
周回中に profile 側レベルが変わっても進行中周回へは反映されない。ジョブXPはリザルト確定後に profile へ加算し、次の周回から新レベルが適用される。
```jsonc
{
  "jobId": "flame_witch",
  "jobLevelAtStart": 50,               // 周回開始時のジョブレベル（表示・演出用）
  "jobTotalXpAtStart": 63700,          // 周回開始時の累計XP
  "resolvedJobModifiers": { /* JobModifierManager.resolve の結果（凍結した全補正値） */ },
  "jobProgressionVersion": 1,          // job-progression.json の version
  "jobRuntime": { "echoCount": 3 }     // 残響カウンター（再開で巻き戻さない）
}
```
- `resolvedJobModifiers` は `JobModifierManager.serialize()`／`restore()` で保存・復元する（`BattleScene.restoreFromRun` が適用）。
- 火の魔女以外・未定義ジョブ・Lv1 では恒等（`identity`）が凍結されるため M6-B 以前と完全一致。

### 保存システム統合（M5-B 非回帰）
- ブラウザ保存/フォルダ保存/JSON 入出力/バックアップ/競合検出/複数タブ/保存キューを壊さない。付与と profile 保存は M5-B の `SaveCoordinator` 経由（`SaveManager.saveProfile`）。
- 比較/競合/インポート表示に **選択ジョブ・火の魔女ジョブレベル・`jobTotalXp`** を追加（`StorageAdapter.summarize`／`SaveConflictResolver.extractMeta`）。
- `jobProgress` はエクスポート/インポート/バックアップ/復元/競合解決で失われない（payload 全体を扱い、インポートは `migrateProfile` を通す）。

## Milestone 6-D: 火の魔女ビルド拡張・第2波（save_version は 6 のまま）
新 active 10種・進化5種の追加は、M6-B の `active_run.skillRuntime`（`SkillManager.serializeRuntime`）へ **各スキルの実行時状態を加算的に足すだけ** で、profile/active_run の既存構造を変えない。
そのため **`saveVersion` は 6 のまま**（不要な版上げをしない）。v1〜v6 からの移行は M6-A/M6-B/M6-C と同じ経路で、既存データを保持する。

### active_run.skillRuntime（第2波スキルの追加フィールド・任意）
M6-B の `skillRuntime`（不死鳥/障壁CD・召喚数など）に、第2波スキルの再開に必要な最小限を加算する。無い（旧セーブ・新スキル未所持）場合は空として安全に再開する。
```jsonc
{
  "skillRuntime": {
    "scorching_ray":      { "cdLeft": 0 },                       // 灼熱光線: 残りCD
    "ember_minefield":    { "cdLeft": 0 },                       // 火種地雷: 残りCD（個々の地雷位置は保存しない）
    "ricochet_ember":     { "cdLeft": 0 },                       // 跳炎弾: 残りCD
    "four_sided_inferno": { "cdLeft": 0 },                       // 四方炎獄: 残りCD
    "molten_chains":      { "cdLeft": 0 },                       // 熔火鎖: 残りCD（鎖接続は再構築）
    "ash_doppelganger":   { "clones": 2, "replayPending": false },// 灰燼分身: 分身数・複製待機
    "bloodfire_pact":     { "cdLeft": 0, "buffLeft": 0 },        // 血炎契約: 残りCD・強化残り時間
    "bullet_furnace":     { "charge": 5, "timeLeft": 0, "releasePending": false }, // 弾喰い炉: チャージ・時間・放出待機
    "blazing_step":       { "charges": 2, "nextChargeLeft": 0 }, // 爆炎歩法: 残りチャージ数・次チャージまで
    "solar_annihilation_array": { "cdLeft": 0 }                  // 新進化の必要 runtime（同形式で加算）
    // 個々の弾/地雷/分身/鎖/光線/波の位置は保存せず、レベル＋runtimeState から再構築する
  }
}
```
- **保存対象**: 灼熱光線/地雷/跳炎弾/四方炎獄/熔火鎖の CD、灰燼分身の分身数・複製待機、血炎契約の CD・強化時間、弾喰い炉のチャージ・時間・放出待機、爆炎歩法のチャージ数・次チャージ、新進化の必要 runtime。統計は profile 側 `skillMastery`（新スキル分も同形式・`recordExtra`）で保持する。
- **保存しない**: 個々の弾/地雷/分身/鎖の位置。これらはレベル＋ runtimeState から自然に再構築する。
- **再読込での悪用防止**: remaining 値（CD/チャージ/時間/分身数）を保存・復元することで、血炎契約の CD 回復・弾喰い炉のチャージ複製・爆炎歩法のチャージ全回復・地雷/分身の二重生成・星喰い炉の再放出・太陽滅却陣の多重生成 を防ぐ。一時停止中は update が止まるため CD/チャージも進まない。
- `SkillManager.serializeRuntime()`／`restoreRuntime()` が各スキルの `serializeState/restoreState` を集約し、`BattleScene.restoreFromRun()` が復元する。加算的追加のため **`save_version` は 6 のまま**（構造変更が無いので明確な移行は不要）。転生でもリセットしない。

## Milestone 6-E: 火の魔女ビルド完成・第3波（save_version は 6 のまま）
新 active 5種・進化5種の追加は、M6-B/M6-D の `active_run.skillRuntime`（`SkillManager.serializeRuntime`）へ **各スキルの実行時状態を加算的に足すだけ** で、profile/active_run の既存構造を変えない。
そのため **`saveVersion` は 6 のまま**（不要な版上げをしない）。v1〜v6 からの移行は M6-A/M6-B/M6-C/M6-D と同じ経路で、既存データを保持する。全スキル監査で追加した `castMode`/`mainCastEvent`/`lv80ProjectileTarget` は `data/skills.json`・`data/skill-evolutions.json` 側のメタで、セーブ payload には含めない（保存フォーマットに影響しない）。

### active_run.skillRuntime（第3波スキルの追加フィールド・任意）
M6-B/M6-D の `skillRuntime` に、第3波スキルの再開に必要な最小限を加算する。無い（旧セーブ・新スキル未所持）場合は空として安全に再開する。
```jsonc
{
  "skillRuntime": {
    "funeral_pyres":        { "cdLeft": 0 },                          // 火葬の墓標: 残りCD（個々の墓標位置は保存しない）
    "magma_vein":           { "cdLeft": 0 },                          // 炎脈走破: 残りCD（亀裂区間は再構築）
    "tri_flame_array":      { "cdLeft": 0 },                          // 三角焔陣: 残りCD（陣は再構築）
    "scorching_resonance":  { "cdLeft": 0 },                          // 灼熱共鳴: 残りCD（共鳴段階は再開時に炎上数から再計算）
    "core_overdrive":       { "heat": 0.5, "overheatLeft": 0, "cdLeft": 0 },            // 炉心暴走: 熱量・オーバーヒート残・残りCD
    "doomsday_core":        { "heat": 0.75, "overheatLeft": 0, "doomLeft": 0, "cdLeft": 0 } // 終末炉心: 熱量・過熱残・終末残・残りCD
    // 個々の墓標/亀裂/陣/弾の位置は保存せず、レベル＋runtimeState から再構築する
  }
}
```
- **保存対象**: 火葬の墓標/炎脈走破/三角焔陣/灼熱共鳴の CD、炉心暴走の熱量/オーバーヒート残/CD、終末炉心の熱量/オーバーヒート残/終末残/CD、新進化の必要 runtime。**灼熱共鳴の共鳴段階は保存せず、再開時に炎上中の敵数から再計算する**。統計は profile 側 `skillMastery`（新スキル分も同形式・`recordExtra`）で保持する（個別統計例: 火葬の墓標=pyresCreated/pyreEruptions/deathsUsed/eruptionKills、炎脈走破=veinsCreated/segmentsCreated/intersections/totalGroundDamage、三角焔陣=arraysCreated/enemiesInside/edgeHits/maxEnemiesInsideOneArray、灼熱共鳴=resonancePulses/maxResonanceLevel/burningEnemiesCounted/resonanceExplosions、炉心暴走=overdriveCasts/maxHeatReached/overheats/timeAtHighHeat/doomsdayStates）。新しい熟練度報酬や新通貨は追加しない。
- **保存しない**: 個々の墓標/亀裂/陣/弾の位置、敵死亡イベント履歴（`recentDeathEvents`）、炎上索引（`_burningIndex`）。これらはランタイムの一時状態で、レベル＋ runtimeState と再開後の戦闘から自然に再構築する。
- **再読込での悪用防止**: remaining 値（CD/熱量/オーバーヒート/終末/分身）を保存・復元することで、**炉心熱量の初期化・オーバーヒート解除・終末の再開始・CD全回復・墓標の二重生成** を防ぐ。一時停止中は update が止まるため CD/熱量も進まない。
- `SkillManager.serializeRuntime()`／`restoreRuntime()` が各スキルの `serializeState/restoreState` を集約し、`BattleScene.restoreFromRun()` が復元する。加算的追加のため **`save_version` は 6 のまま**（構造変更が無いので明確な移行は不要）。転生でもリセットしない。

## Milestone 6-F: 通常プレイ整備・バランス検証基盤（save_version は 6 のまま）
**新スキルは追加しない**。`profile.balanceTelemetry`（ローカル戦闘テレメトリの集計）を**加算的に追加**し、`active_run.draftState` に
`draftsSinceProgress`（抽選の pity カウンター）を足すだけで既存構造を変えない。そのため **`saveVersion` は 6 のまま**（不要な版上げをしない）。
v1〜v6 からの移行は M6-A〜M6-E と同じ経路で、既存データを保持する。**テレメトリは外部送信しない**。

### profile.balanceTelemetry（新規・任意フィールド・加算的追加）
1周回ぶんの戦闘テレメトリを集計した開発向けデータ。無い（旧セーブ・未計測）場合は空として安全に扱う。`RunBalanceSummary` が
**immutable に集計**し、通常周回と debugRun を**分離**して保持する（上限は `data/balance-thresholds.json` の `telemetry`）。
```jsonc
{
  "balanceTelemetry": {
    "enabled": true,
    "summaryBySkill": {                 // 通常周回の集計（最大80スキル）
      "fireball": {
        "runs": 8, "casts": 1200, "hits": 3400, "kills": 900,
        "damage": 152000, "dps": 84.4, "damageShare": 0.31,
        "echo": 40, "clone": 6, "capReached": 12, "defensiveValue": 0
      }
    },
    "recentRuns": [ /* 通常周回の周回サマリ（最大10・FPS平均/最低/p95・cap・seed 等） */ ],
    "debugRuns":  [ /* F4〜F8 のデバッグ補正を使った周回（最大10・通常統計と分離） */ ]
  }
}
```
- **debugRun 分離**: F4〜F8 のデバッグ補正を使った周回（Balance Playtest=F8 は常に debugRun）は `debugRuns` へ振り分け、
  `summaryBySkill`／`recentRuns`（通常統計）へは**混ぜない**。
- **上限**: `summaryBySkill` は最大80スキル、`recentRuns`/`debugRuns` は各最大10周、全体の目安上限 `softMaxBytes=262144`。超過分は捨てる。
- **型安全な取り込み**: `profileSchema.js` がプロトタイプ汚染キーを除外し、非有限/負数を安全化して取り込む（インポート/移行でも壊れない）。
- **保存は低優先・失敗許容**: 周回終了時の集計→`profile.balanceTelemetry` 加算は**主要セーブより低優先**で try/catch し、
  **失敗してもゲーム進行・主要セーブ（残り火/JobXP/profile 本体）を壊さない**。M5-B の `SaveCoordinator` 経由で保存する。

### active_run.draftState の `draftsSinceProgress`（M6-A の拡張・既存 serialize 経由）
シナジー補助の pity カウンター（進化に近づかないドラフトが続いた回数）。既存の `draft.serialize`（`active_run.draftState`）に含めて保存し、
進化成立で `markProgress()` によりリセットする。無い場合は 0 として安全に再開する。決定論は不変で、`synergy=null`（補助なし）は旧挙動と byte 一致。

### 保存フォーマットへの影響なし
シナジー補助（`skill-config.json`）・バランス警告しきい値（`balance-thresholds.json`）・fallback→JSON 定数は **data 側の設定/メタ**で、
セーブ payload には含めない（保存フォーマットに影響しない）。`SkillCatalog`/`DraftBalanceAnalyzer`/`CombatTelemetry`/`RunBalanceSummary`/
`BalanceWarnings`/`BalancePlaytest` は純ロジックで、保存レイヤー（M5-B）を壊さない。エクスポート/インポート/バックアップ/競合解決は
payload 全体を扱うため `balanceTelemetry` も自動的に保持される（インポートは `migrateProfile` を通す）。加算的追加のため **`save_version` は 6 のまま**・転生でもリセットしない。

## Milestone 7-A: 2人目のジョブ・状態異常/凍結（save_version は 6 のまま）
2人目のジョブ **氷術師（frost_mage）** と汎用状態異常フレームワークを追加する。profile へ `selectedJobId`/`jobProgress.frost_mage` を、
`active_run` へ `jobElement`/`statusRng`/ボス frostbreak 状態を**加算的に足すだけ**で既存構造を変えない。そのため **`saveVersion` は 6 のまま**。
v1〜v6 からの移行は M6-A〜M6-F と同じ経路で既存データを保持し、転生でもリセットしない。詳細は `docs/jobs.md`・`docs/status-effects.md`。

### profile（v6・複数ジョブ）
`unlockedJobs` の既定に `frost_mage` を含め、`jobProgress` へ `frost_mage` エントリを加算的に足す。`selectedJobId` は M6-A から存在（既定 `flame_witch`）。
```jsonc
{
  "selectedJobId": "flame_witch",                    // 選択中ジョブ（進行中周回があるときは変更不可）
  "unlockedJobs": ["flame_witch", "frost_mage"],     // M7-A: frost_mage を既定で選択可能（加算的）
  "jobProgress": {
    "flame_witch": { "totalXp": 63700, /* …M6-C の形式… */ },
    "frost_mage":  { "totalXp": 0, "runs": 0, /* 同形式・ジョブごとに完全分離 */ }
  }
}
```
- `profileSchema.js` の移行: 旧セーブで `unlockedJobs` に `flame_witch`/`frost_mage` が無ければ加算的に補い、`selectedJobId` が未設定なら `flame_witch`。
  `jobProgress` はジョブ id ごとに独立（`safeJobProgress` がプロトタイプ汚染キー除外・負数/非有限を安全化）。Job Lv は保存せず `totalXp` から算出する。
- 拠点のジョブ育成タブは `unlockedJobs` を**選択画面**として表示し、選んだ id を `selectedJobId` に保存する。

### active_run（v6・氷術師の周回で使う追加フィールド）
周回開始時に固定するジョブ情報（M6-C の `jobId`/`jobLevelAtStart`/`resolvedJobModifiers`/`jobRuntime` 等）に加え、M7-A で次を足す。
```jsonc
{
  "jobId": "frost_mage",
  "jobElement": "ice",                    // 周回ジョブの属性（fire/ice。ダメージタグの既定 element）
  "resolvedJobModifiers": { /* JobModifierManager.resolve の凍結結果（氷用フィールドを含む） */ },
  "statusRng": { "seed": 12345, "cursor": 87 },  // 状態異常専用 SeededRandom の cursor（凍結判定を引き直せない）
  "bossFrost": {                          // ボス在戦時のみ。氷砕ゲージ/break回数/脆弱残り時間
    "gauge": 180, "breaks": 2, "vulnRemainMs": 1200
  }
  // 個々の敵の冷気/凍結/氷弾位置/凍土位置/氷壁位置は保存しない（再開時に安全に再構築）
}
```
- `statusRng` は `StatusEffectManager.serialize()/restore()` 経由。候補抽選用の `draftState.seed` とは独立で、**再読込で凍結判定を引き直せない**。
- `bossFrost` は再読込での**ゲージ初期化・脆弱延長の悪用を防ぐ**ため保存する（`vulnRemainMs` から復元）。ボス不在時は保存しない。
- 氷スキル8種はすべて `serializeState()`＝`{ cdLeft: this._cd }` / `restoreState()` を実装し、既存の `active_run.skillRuntime`
  （`SkillManager.serializeRuntime`／`restoreRuntime`）へ**残りクールダウンだけ**を加算的に保存・復元する。これにより
  **再読込で CD が全回復して即時再発動する不正を防ぐ**（火の魔女の M6-D/E スキルと同じ `cdLeft` パターン・火の runtimeState には影響しない）。
  凍土/氷壁/絶対零度領域/弾の**位置は保存せず**、再開後は空から安全に再構築するため**二重生成しない**（`tests/frost-cooldown-save.mjs` で検証）。
- JSON エクスポート/インポート・バックアップ・競合比較は payload 全体を扱うため新フィールドも自動保持される（インポートは `migrateProfile` を通す）。
  加算的追加のため **`save_version` は 6 のまま**・転生でもリセットしない。

## Milestone 7-B: 氷術師ビルド拡張・第2波（save_version は 6 のまま）
氷術師へ新 active10種・進化5種を追加するが、M6-B/M7-A の `active_run.skillRuntime`（`SkillManager.serializeRuntime`）へ **各スキルの実行時状態を加算的に足すだけ** で、
profile/active_run の既存構造を変えない。そのため **`saveVersion` は 6 のまま**。v1〜v6 からの移行は M6-A〜M7-A と同じ経路で、既存データを保持し転生でもリセットしない。
状態RNG（`statusRng`）・ボス frostbreak 状態（`bossFrost`）の保存は M7-A のまま。

### active_run.skillRuntime（M7-B 氷スキルの追加フィールド・任意）
無い（旧セーブ・新スキル未所持）場合は空として安全に再開する。CD型は `cdLeft` のみ、常設型（周回接触/召喚）は runtimeState を**保存せず再構築**する。
```jsonc
{
  "skillRuntime": {
    "icicle_volley": { "cdLeft": 0 },                        // 連射: 残りCD
    "freezing_ray":  { "cdLeft": 0 },                        // 凍結光線: 冷気ランプ間隔の残りCD
    "hailstorm":     { "cdLeft": 0 },                        // 雹嵐: 残りCD
    "cryo_mine":     { "cdLeft": 0 },                        // 氷結地雷: 残りCD（個々の地雷位置は保存しない）
    "ice_prison":    { "cdLeft": 0 },                        // 氷牢封印: 残りCD
    "avalanche":     { "cdLeft": 0 },                        // 雪崩奔流: 残りCD
    "mirror_ice":    { "cdLeft": 0, "activeLeft": 0, "durabilityLeft": 0 }, // 氷鏡結界: 残りCD・展開残り時間・残り耐久
    "glacier_drop":  { "cdLeft": 0, "pendingImpactLeft": 0, "pendingImpactX": 0, "pendingImpactY": 0 }, // 氷河墜落: 残りCD＋落下待機(残り時間/着弾座標)
    "crystal_tempest": { "cdLeft": 0 }, "absolute_zero_ray": { "cdLeft": 0 },   // 進化: cooldown/continuous 型は cdLeft
    "whiteout_cataclysm": { "cdLeft": 0 }, "world_end_avalanche": { "cdLeft": 0 }
    // frost_orbit / frost_spirit / frost_queen_court（常設型）は runtimeState を保存せず、レベルから再構築する
  }
}
```
- **保存対象**: 上記 CD 型・`mirror_ice`（cdLeft/activeLeft/durabilityLeft）・`glacier_drop`（cdLeft/pendingImpact*）。統計は profile 側 `skillMastery`（新スキル分も同形式・`recordExtra`）で保持。
- **保存しない**: 常設型（`frost_orbit`/`frost_spirit`/`frost_queen_court`）の runtimeState、個々の氷弾/雹/地雷/精霊/波/凍結床の位置。これらはレベル＋runtimeState と再開後の戦闘から自然に再構築する。
- **再読込での悪用防止**: `glacier_drop` は落下待機（`pendingImpactLeft`/座標）を保存・復元し、**無料の再発動・二重落下**を防ぐ。`mirror_ice` は展開残り時間/耐久を保存し再展開の悪用を防ぐ。CD型は残りCDを保存して即時再発動を防ぐ。一時停止中は update が止まるため CD/待機も進まない。
- `SkillManager.serializeRuntime()`／`restoreRuntime()` が各スキルの `serializeState/restoreState` を集約し、`BattleScene.restoreFromRun()` が復元する（`tests/frost-runtime-save-wave2.mjs` で実スキルクラスを最小 Phaser モックで駆動し CD/pending/durability 保存を検証）。加算的追加のため **`save_version` は 6 のまま**。

## Milestone 7-B.1: 状態異常の視認性（表示状態は保存しない・save_version は 6 のまま）
状態異常を通常プレイ中に見て確かめるための**表示層とデバッグ**を追加するが、これらは**演出とランタイムの一時状態**であり、セーブ payload には一切含めない。
そのため profile/active_run の保存フォーマットは変わらず、**`saveVersion` は 6 のまま**。v1〜v6 からの移行は M6-A〜M7-B と同じ経路で、既存データを保持し転生でもリセットしない。詳細は `docs/status-visuals.md`・`docs/status-debug.md`。

### 保存しない表示状態（再開時に現在状態から再構築）
次はすべてランタイムの表示/計測用で、**保存せず**再開時に権威フィールドから作り直す:
- 状態アイコン / 冷気・凍結・氷片の overlay / Tween / floating text（「SHATTER」等） / FROST BREAK 演出。
- F10 状態デバッグの選択対象 / visual history。
- `StatusEffectManager` の実動作カウンタ（`chillApplications`/`chillAmountTotal`/`freezeAttempts`/`freezeSuccesses`/`immunitySkips`/`hitGroupSkips`/`bossGaugeApplications`）と
  発火イベント・エンティティ別 `_statusDebug`（freeze 内訳）。

### 変わらず保存する状態（M7-A/M7-B のまま）
- **状態RNG**（`active_run.statusRng` の seed/cursor）は従来どおり保存し、再読込で凍結判定を引き直せない。
- **ボス frostbreak 状態**（`active_run.bossFrost` の gauge/breaks/vulnRemainMs）は従来どおり保存し、ゲージ初期化・脆弱延長の悪用を防ぐ。
- 氷スキルの `active_run.skillRuntime`（CD 等）も M7-A/M7-B のまま。表示層はこれらの権威値を**読むだけ**で、保存内容を変えない。

表示状態を保存しないことで、再読込しても状態そのもの（冷気量/凍結残/耐性/氷砕ゲージ）は権威フィールドから正しく再現され、overlay/アイコン/デバッグ表示はその現在状態に追従して作り直される
（`tests/status-visibility-nonregression.mjs` で、表示追加により保存往復・状態RNG cursor・ボス氷砕値が不変であることを検証）。

## Milestone 7-C: 氷術師ビルド拡張・第2波（save_version は 6 のまま）
氷術師へ新 active10種・進化5種を追加するが、M6-B/M7-A/M7-B の `active_run.skillRuntime`（`SkillManager.serializeRuntime`）へ **各スキルの実行時状態を加算的に足すだけ** で、
profile/active_run の既存構造を変えない。そのため **`saveVersion` は 6 のまま**。v1〜v6 からの移行は M6-A〜M7-B と同じ経路で、既存データを保持し転生でもリセットしない。
状態RNG（`statusRng`）・ボス frostbreak 状態（`bossFrost`）の保存は M7-A のまま。

### active_run.skillRuntime（M7-C 氷スキルの追加フィールド・任意）
無い（旧セーブ・新スキル未所持）場合は空として安全に再開する。CD 型は `cdLeft` のみ、設置/遅延/防御/barrage 型は追加の待機・耐久・進行フィールドを持つ。
**再開時の無料再発動・二重生成（bloom/mist/clock wave/halo 耐久/comet barrage/進化前後の同時稼働）を防ぐ**ために保存する。飛行中 projectile/Graphics/Text/Tween/entity 参照/particle/overlay/F10 選択は**保存しない**。
```jsonc
{
  "skillRuntime": {
    "rime_boomerang":     { "cdLeft": 0 },                  // 霜輪飛刃: 残りCD（飛行中の氷輪は保存しない）
    "frost_chain":        { "cdLeft": 0 },                  // 氷鎖連閃: 残りCD
    "icebreaker_wave":    { "cdLeft": 0 },                  // 砕氷衝波: 残りCD
    "polar_star":         { "cdLeft": 0 },                  // 極星氷弾: 残りCD
    "crystal_refraction": { "cdLeft": 0 },                  // 氷晶屈折: 残りCD
    "crystal_bloom":      { "cdLeft": 0, "buds": [ { "x": 0, "y": 0, "growLeft": 0, "pulseLeft": 0 } ] }, // 氷晶開花: 残りCD＋芽(座標/成長残り/pulse残り)
    "snowblind_mist":     { "cdLeft": 0, "activeLeft": 0, "centerX": 0, "centerY": 0, "tickLeft": 0 },    // 白霧氷界: CD＋展開残り＋霧中心＋tick残り
    "frozen_clock":       { "cdLeft": 0, "remainingWaves": 0, "nextWaveLeft": 0, "waveIndex": 0, "origin": null }, // 氷刻停止: 波の進行状態
    "winter_halo":        { "cdLeft": 0, "activeLeft": 0, "durabilityLeft": 0 },                          // 冬冠結界: CD＋展開残り＋残り耐久（防御）
    "comet_sleet":        { "cdLeft": 0, "barrageActive": false, "cometsRemaining": 0, "nextCometLeft": 0, "barrageIndex": 0, "targetCenter": null, "telegraphLeft": 0 }, // 氷彗星群: barrage 進行状態
    // 進化:
    "rime_execution_wheel":   { "cdLeft": 0 },
    "eternal_frost_chain":    { "cdLeft": 0 },
    "crystal_world_tree":     { "cdLeft": 0, "trees": [ { "x": 0, "y": 0, "growLeft": 0, "pulseLeft": 0, "phase": 0 } ] }, // 世界氷晶樹: 樹の状態
    "everlasting_white_mist": { "cdLeft": 0, "activeLeft": 0, "center": null, "tickLeft": 0, "whiteoutLeft": 0 },
    "zero_hour_world":        { "cdLeft": 0, "remainingWaves": 0, "nextWaveLeft": 0, "waveIndex": 0, "origin": null }
  }
}
```
- **保存対象**: 上記 CD 型・設置（`crystal_bloom` 芽 / `crystal_world_tree` 樹）・追従（`snowblind_mist`/`everlasting_white_mist` 中心＋tick）・遅延/波（`frozen_clock`/`zero_hour_world` の波進行）・防御（`winter_halo` 耐久）・barrage（`comet_sleet`）。統計は profile 側 `skillMastery`（新スキル分も同形式・`recordExtra`）で保持。
- **保存しない**: 飛行中の projectile（霜輪/屈折弾/彗星/星）・Graphics/Text/Tween・entity 参照・particle・overlay・F10 選択対象。これらはレベル＋runtimeState と再開後の戦闘から自然に再構築する。
- **再読込での悪用防止**: 設置物（芽/樹）・追従霧・時計/零刻の波・氷冠耐久・彗星 barrage を保存・復元し、**無料の再発動・二重生成・進化前後の同時稼働**を防ぐ。CD 型は残りCDを保存して即時再発動を防ぐ。一時停止中は update が止まるため CD/待機/barrage も進まない。
- `SkillManager.serializeRuntime()`／`restoreRuntime()` が各スキルの `serializeState/restoreState` を集約し、`BattleScene.restoreFromRun()` が復元する（`tests/frost-runtime-save-wave3.mjs` で実スキルクラスを graphics 対応の最小 Phaser モックで駆動し、CD/設置/波/耐久/barrage 保存と二重生成防止を検証）。加算的追加のため **`save_version` は 6 のまま**。

## Milestone 7-D: 氷術師ビルド拡張・最終波（save_version は 6 のまま・カタログ完成）
氷術師へ新 active5種・進化5種を追加するが、M6-B/M7-A〜M7-C の `active_run.skillRuntime`（`SkillManager.serializeRuntime`）へ **各スキルの実行時状態を加算的に足すだけ** で、
profile/active_run の既存構造を変えない。そのため **`saveVersion` は 6 のまま**。v1〜v6 からの移行は M6-A〜M7-C と同じ経路で、既存データを保持し転生でもリセットしない。
状態RNG（`statusRng`）・ボス frostbreak 状態（`bossFrost`）の保存は M7-A のまま。**表示状態・氷印/氷棺 overlay は保存しない**。

### active_run.skillRuntime（M7-D 氷スキルの追加フィールド・任意）
無い（旧セーブ・新スキル未所持）場合は空として安全に再開する。CD 型は `cdLeft`、反応型は `markLeft`、常設型は `deployLeft`/`recastLeft`。設置/砲台/氷山/barrage 型は追加の待機・進行フィールドを持つ。
**再開時の無料再発動・二重生成（barrage/砲台/氷山/氷印無料起爆/aurora 帯/進化前後の同時稼働）を防ぐ**ために保存する。飛行中 projectile/Graphics/Text/Tween/entity 参照/particle/overlay/F10 選択/表示状態は**保存しない**。
```jsonc
{
  "skillRuntime": {
    "glacial_spear_rain": { "cdLeft": 0, "barrage": { "spearsRemaining": 0, "nextSpearLeft": 0, "barrageIndex": 0, "targetCenter": null, "telegraphLeft": 0 } }, // 氷槍豪雨: CD＋barrage 進行
    "snowflake_sentry":   { "deployLeft": 0, "nextInstanceId": 1, "sentries": [ { "instanceId": 1, "x": 0, "y": 0, "activeLeft": 0, "shotLeft": 0, "pulseCounter": 0 } ] }, // 六花砲台: 展開待機＋各砲台
    "iceberg_ram":        { "cdLeft": 0, "icebergs": [ { "x": 0, "y": 0, "direction": 0, "activeLeft": 0, "travel": 0, "collapsePending": false, "instanceId": 1 } ] }, // 氷山奔衝: CD＋滑走中の氷山
    "absolute_ice_seal":  { "markLeft": 0, "nextInstanceId": 1, "bossMark": null }, // 絶対氷封: CD＋ボス印のみ（通常敵印は捨てる）
    "aurora_veil":        { "recastLeft": 0, "activeLeft": 0, "tickLeft": 0, "burstLeft": 0, "phase": 0, "castIndex": 0, "layoutIndex": 0 }, // 極光氷幕: 帯の進行状態
    // 進化:
    "heavenfall_glacier_lances": { "cdLeft": 0, "barrage": { "spearsRemaining": 0, "nextSpearLeft": 0, "barrageIndex": 0, "targetCenter": null, "telegraphLeft": 0 } },
    "crystal_sentinel_legion":   { "deployLeft": 0, "nextInstanceId": 1, "sentries": [ { "instanceId": 1, "x": 0, "y": 0, "activeLeft": 0, "shotLeft": 0, "linkCounter": 0 } ] },
    "continental_glacier_rush":  { "cdLeft": 0, "glaciers": [ { "x": 0, "y": 0, "direction": 0, "activeLeft": 0, "travel": 0, "instanceId": 1 } ] },
    "eternal_sealed_coffin":     { "markLeft": 0, "nextInstanceId": 1, "bossMark": null }, // 副棺は伝播1世代・再伝播しない（保存は主印CDとボス印のみ）
    "polar_night_aurora":        { "recastLeft": 0, "activeLeft": 0, "tickLeft": 0, "burstLeft": 0, "pillarCounter": 0, "phase": 0, "layoutIndex": 0 }
  }
}
```
- **保存対象**: CD/反応 CD（`cdLeft`/`markLeft`）・常設待機（`deployLeft`/`recastLeft`）・barrage（氷槍）・砲台/氷山/氷河の実体・aurora 帯の進行。統計は profile 側 `skillMastery`（新スキル分も同形式・`recordExtra`）で保持。
- **氷印/氷棺マーカーの復元方針**（重要）: 氷印/氷棺は `Enemy._iceSeal`（skill-local マーカー・正式 status ではない）で、命中数は `Enemy._iceHitCount` が持つ。**通常敵の印は pool 再利用で個体を再特定できないため保存・復元せず捨てる**（再開時に無料起爆させない）。**ボス（`scene.boss`）の印のみ再関連付け**し、**CD（`markLeft`）は必ず復元**して即時再付与を防ぐ。`Enemy._iceSeal`/`_iceHitCount` は `Enemy.reset` でクリアされる（pool 残留防止）。
- **保存しない**: 飛行中の projectile（氷槍/砲台弾）・Graphics/Text/Tween・entity 参照・particle・overlay・**氷印/氷棺の表示 overlay**・F10 選択対象・**表示状態全般**。これらはレベル＋runtimeState と再開後の戦闘から自然に再構築する。
- **再読込での悪用防止**: barrage・砲台・氷山・氷河・aurora 帯・氷印 CD を保存・復元し、**無料の再発動・二重生成・氷印の無料起爆・進化前後の同時稼働**を防ぐ。一時停止中は update が止まるため CD/待機/barrage も進まない。
- `SkillManager.serializeRuntime()`／`restoreRuntime()` が各スキルの `serializeState/restoreState` を集約し、`BattleScene.restoreFromRun()` が復元する（`tests/frost-runtime-save-wave4.mjs` で実スキルクラスを graphics 対応の最小 Phaser モックで駆動し、CD/barrage/砲台/氷山/marker（ボスのみ復元・通常敵は捨てる）/aurora 保存と二重生成・無料起爆防止を検証）。加算的追加のため **`save_version` は 6 のまま**。

## Milestone 7-E: 保存フォーマットの変更なし（v6 維持）
M7-E は監査 Milestone であり、`profile` / `active_run` / `skillRuntime` のスキーマを一切変更していない
（`save_version` は **v6** のまま・移行処理も不要）。

監査で固定した保存側の不変条件（`tests/frost-complete-runtime-save.mjs` / `frost-complete-determinism.mjs`）:

- 氷術師 active30 + 進化18 = 48 件すべてで `SkillManager.serializeRuntime()` → `restoreRuntime()` の往復が成立し、
  **runtimeState を保存するのは 45 件**（残りは基底の CD 管理のみで固有状態を持たない）。
- runtimeState に **Graphics / Text / Tween / Timer / entity 参照を含まない**（JSON 化可能・循環参照なし）。
- CD（`cdLeft` / `markLeft` / `deployLeft` / `recastLeft` などの残り時間）は**必ず**保存・復元する（再開直後の無料 cast の防止）。
- 設置 / 召喚 / 砲台 / 印 / 波 / 弾幕は復元で二重生成せず、`restoreRuntime` を 2 回適用しても増えない（**冪等**）。
- 氷印 / 氷棺は**ボス印だけ**復元し、通常敵の印は破棄する。復元後の命中数は数え直す（無料起爆の防止）。
- 進化後は元 active のインスタンスも runtime も残らず、再開後も進化済みのまま（元 active が復活しない）。
- 状態異常 RNG は保存/復元で cursor・state・以後の乱数列が**完全一致**する（RNG drift 0）。
- F10 の直近イベント履歴・表示状態・選択中デバッグ対象は**保存しない**。


---

## Milestone 8-A: 保存フォーマットの変更なし（v6 維持）

`save_version` は **v6 のまま**。スキーマの追加・削除・改名はしていない。

ただし `active_run.skillRuntime` に載るスキルが増えた（**火の魔女 48 件すべて**）。
これは既存フィールド（`skillRuntime` は `{ skillId: {...} }` の自由形式）への加算的な変更で、移行処理は不要。
旧セーブ（一部スキルの runtime を持たない）から復元しても、`restoreState` が呼ばれないだけで従来どおり動く。

新しく保存されるキー（抜粋）:

| skill | キー |
|-------|------|
| `fireball` / `flame_pillar` / `meteor` / `flame_lance` / `scatter_flame` / `homing_wisp` / `chain_flame` / `detonation_mark` / `burning_trail` / `lava_bomb` / `flame_vortex` / 進化 8 種 | `cdLeft` |
| `orbiting_flame` | `angle` / `castPulse` |
| `fire_spirit` | `angle` / `castPulse` / `shotTimers[]` |
| `eternal_pyre` | `auraTick` / `infectTick` / `castPulse` |
| `ash_doppelganger` | `copyTimers[]` |
| `ash_legion` | `angle` / `timers[]` |
| `solar_annihilation_array` | `focusLeft` / `tickLeft` / `mirrorAngle` / `castPulse` |

設置物・召喚物・分身の**実体は保存しない**（寿命つき、または `_rebuild`/`_ensure` が data の個数へ再構築するため
二重生成しない）。Graphics / Text / Tween / Timer / enemy / projectile 参照も保存しない。

## Milestone 8-B: 戦士のランタイム状態（`save_version` は 6 のまま）

戦士（`warrior`）の追加にあたり、`active_run` へ **`warriorState` を 1 キーだけ追加**した。
**既存キーの意味・型・値は 1 件も変更していない**（`node tests/three-job-nonregression.mjs` §6 が
保存キー一覧を機械的に検証する）。したがって **`save_version` は 6 のままで、移行処理は不要**。

### `active_run.warriorState`

戦士の周回でだけ書き込まれる（他ジョブは `null`）。

```json
{
  "fury": 42.5,
  "releaseLeftMs": 0,
  "recovery": { "leftMs": 0, "totalMs": 5000, "remainAmount": 0 },
  "combo": 27,
  "comboGraceLeftMs": 1200,
  "unyielding": { "cooldownLeftMs": 30000, "activeLeftMs": 0, "healLeftMs": 0, "healRemain": 0, "triggers": 1 },
  "bossPoise": { "gauge": 180, "thresholdMult": 1.25, "breaks": 1, "cooldownLeftMs": 0, "exposedLeftMs": 0, "reactionLeftMs": 0 },
  "chargeLeftMs": 0,
  "telemetry": { "...": "周回集計（外部送信なし）" }
}
```

### 何を復元し、何を復元しないか

| 項目 | 復元する | 理由 |
|------|----------|------|
| 闘気 / コンボ / 猶予 / 解放残り / 回復残り | ○ | 再読込で 0 へ戻して稼ぎ直せないようにする |
| 不屈のクールダウン / 発動回数 | ○ | 再読込で不屈を撃ち直せないようにする |
| ボス体勢ゲージ / 崩し回数 / しきい値倍率 | ○ | 崩し直しが簡単にならないようにする |
| 突進の軽減ウィンドウ残り | ○ | 軽減窓だけを引き継ぐ |
| 周回テレメトリ | ○ | 統計が途中でリセットされないようにする |
| **cast 予算（`castKey` ごとの加算上限）** | × | セッションを跨いで意味を持たないため。復元時は空から始める |
| **同一敵の命中記録** | × | 死んだ敵オブジェクトへの参照を保持しないため |
| **闘気の毎秒窓 / 撃破回復の毎秒窓** | × | 復元時刻で開き直す（上限そのものは常に効く） |
| **突進の途中状態（座標・経路）** | × | 無料の再ダッシュ・座標の飛びを防ぐため。クールダウンだけ戻す |

### スキルごとの `skillRuntime`

戦士 active5 ＋ evolution3 の **8 件すべて**が `serializeState` / `restoreState` を持ち、
最低限 `cdLeft`（クールダウン残り）を保存する。加えて

- `shield_bash` … `mitigationLeft`（軽減窓の残り）
- `whirlwind_slash` / `bloodstorm_whirlwind` … `spinLeftMs` / `spinTickLeft`（回転の**再開**であり、発動回数は増えない）
- `charge_slash` … `cdLeft` のみ（突進の途中状態は捨てる）
- `unyielding_fortress` … `windowLeftMs` / `counterUsed` / `mitigationLeft`（復元後に反撃が復活しない）

### 旧セーブ・他ジョブ

- `warriorState` が無い旧セーブ、火 / 氷のセーブでは `WarriorCombatSystem` が初期値のまま動く（`enabled=false`）。
- 型が壊れた `warriorState`（数値でない・配列など）を渡しても、`restore()` は既知キーの数値だけを受け取り、
  それ以外は既定値のままにする。**旧データで起動不能にならない**。

## Milestone 8-B.1: 保存フォーマットの変更なし（v6 維持）

M8-B.1 は **`BattleScene` の呼び出しタイミングの修正**であり、保存されるデータは 1 バイトも変わらない。

- **`save_version` は 6 のまま**。移行処理も不要。
- `active_run` / `profile` に**キーを追加していない**。特に
  `_statusPassiveVersion`（最後に status passive を反映した version）は**保存しない**。
  これは「その Scene インスタンスが何回再構築したか」を表す実行時の値であり、
  復元時は `PassiveManager` の現在状態から再生成すればよいため。
- passive の level は従来どおり `active_run.passiveSkills`（`PassiveManager.serialize()`）に保存される。

### 復元時の流れ

1. `restoreFromRun()` が `passiveSkills` を `PassiveManager.loadFrom()` へ渡す
2. `create()` の最後で `_refreshStatusPassivesIfNeeded(true)` を **1 回だけ** force 実行する
3. その時点の passive 所持状態から乗率を完全再構築して `StatusEffectManager` へ書き込む

このため **「継続してプレイした場合」と「セーブ → リロードした場合」で乗率が完全に一致**する。
復元は完全再構築であって差分加算ではないので、リロードを繰り返しても倍率は累積しない。

### 旧セーブ

- `passiveSkills` が無い旧セーブでも壊れない（未取得として恒等値になる）。
- 未知の passive id・不正な level（文字列 / 負値 / 巨大値）が混ざっていても、
  `PassiveManager.loadFrom()` が既知 id だけを受け取り、`setLevel()` が 0..maxLevel でクランプする。
