# 3 ジョブ横断・共通システム総合監査（Milestone 9-A）

3 ジョブ（火の魔女 / 氷術師 / 戦士）がそれぞれ **active30 / passive4 / evolution18 = 52** に到達し、
個別完成監査（氷 M7-E / 火 M8-A / 戦士 M8-F）を終えたのを受けた**横断監査**。
**新しいコンテンツは 1 件も追加していない。**

- 最優先課題（M8-F 記録の「品質が戦闘結果へ影響する」）の解消:
  `./quality-cap-classification.md` / `./quality-gameplay-invariance.md`
- バランス比較: `./cross-job-balance.md`
- 横断カタログ表: `./cross-job-completion-matrix.md`

---

## 1. 監査した観点と結果

| 観点 | 結果 | テスト |
|------|------|--------|
| 品質と gameplay の分離 | **gameplay trace が 4 品質で byte-identical**（144 skill / RNG cursor 含む）。**不備 1 群（161 cap + 4 経路）を修正** | quality-gameplay-invariance / quality-rng-invariance / quality-visual-reduction |
| cap 分類 | 217 件を visual 47 / gameplay 150 / safety 20 へ確定。誤分類（品質依存の gameplay cap）161 件を単一値化 | quality-cap-classification |
| 横断カタログ | 各 30/4/18/52・全体 90/12/54/156・重複 0・orphan 0・Lv80 6×3・SkillCatalog issues 0×3 | cross-job-catalog |
| プール分離 | 3 ジョブ互いに素・`memberAllowedForJob` = プール所属が 156 メンバー全数一致・暗黙 common 0 | cross-job-pool-isolation |
| 抽選 | production 駆動 200 seed × 枠 4/6/8 × 3 ジョブ。leakage / duplicate / slot 違反 / 非飽和候補ゼロ = 0。しきい値はすべて維持 | cross-job-draft-audit |
| 進化 54 件 | data 整合・到達可能性（条件を組めば提示される）を全数実駆動 | cross-job-evolution-audit |
| バランス比較 | 共通 profile で死にスキル 0 / utility 0 = 0 / top share 上限内。ジョブ間比率は記録のみ（均一化しない） | cross-job-balance-comparison |
| combat path | skillId が全経路に乗る・element/physical 分離・再帰ガード固定・重複実装 0（意図した policy 差は記録） | cross-job-combat-paths |
| recordCast 144 | 基底 1:1・custom-cast は mainCastEvent 宣言つきのみ・戦士はスキル側呼び出し 0・restore で増えない | cross-job-record-cast |
| cooldown 保存 144 | 往復一致・**改ざん耐性を共通入口で全ジョブへ拡張**（不備 1 件を修正） | cross-job-cooldown-save |
| runtimeState 144 | JSON 安全・オブジェクト参照 0・壊れた入力 / 旧セーブ / 二重 restore に耐える・destroy で残留 0 | cross-job-runtime-state |
| status / resource | ジョブ外で恒等・event cap 固定・永久状態 0・passives.version ゲート維持 | cross-job-status-resource |
| 防御 | 3 ジョブとも完全無効化なし・上限は data 固定・拘束は 3 方式とも頭打ち | cross-job-defense |
| セーブ | v6 維持・migration 冪等・ジョブ切替 / 不正値 / 旧セーブ安全・folder/browser 往復・競合検出 | cross-job-save-switching / cross-job-folder-save |
| telemetry | キー構造がジョブ不変・dead key 0・外部送信 0・debugRun 分離・品質はヘッダ表示のみ | cross-job-telemetry |
| F8 / F9 / F10 | **F8 へ 3 ジョブ比較を追加**・既存表示維持・F10 不変・profile 汚染なし | cross-job-debug-panels |
| 性能 | 品質を変えても gameplay イベント数不変・実行時間比 < 5・long run で配列増加なし | cross-job-performance |
| Pool / SpatialGrid | acquire/release/reset/上限/再利用・グリッド残留 0・プール上限は gameplayLimits 由来 | cross-job-pool-spatial |
| dead field / cap | 未参照 0・予約 0・分類と形の矛盾 0・WARRIOR_DEFAULTS と data 一致 | cross-job-caps-fields |
| warning 体系 | FLAME/FROST 重複 0・同義コードの severity 一致・validate-data 0/0・設計差は documented note | cross-job-warning-consistency |
| 決定論 | 候補列 / runtime trace が run 間・品質間で一致 | cross-job-determinism |
| 非回帰の固定 | 3 ジョブの候補列・runtime trace・cap 分類数を SHA-256 で固定 | three-job-system-nonregression |

---

## 2. 見つけて直した不備

優先度順（M9-A §19）。**§1 が本 Milestone の最優先で、修正の大半を占める。**

| # | 優先度 | 不備 | 修正 |
|---|--------|------|------|
| 1 | 1（品質→gameplay） | **skillCaps のうち gameplay / safety に当たる 161 件が品質別の値を持ち、対象数・弾数・tick 数・状態付与数が品質で変わった**（great_cleave 58→59 分岐の根本原因。3 ジョブ全 144 スキルに影響） | 217 件を分類（`skillCapClasses`）し、gameplay 150 / safety 20 を単一値 `{ value }`（canonical = 旧 high）へ。`DataManager.skillCap` が単一値を品質と無関係に解決 |
| 2 | 1（品質→gameplay） | **敵プール上限（60〜320）と弾プール上限（120〜700）が品質別** —— 敵の数・XP・kill が品質依存だった | `gameplayLimits { maxEnemies: 200, maxProjectiles: 400 }` を新設し、`effectQuality` からキーを削除（残留は validate-data がエラー化） |
| 3 | 1（品質→gameplay） | **hitStop が high / ultra のみ** —— 低品質はロジック経過時間が変わった | 全品質で有効化（演出でなくロジック frame 停止のため） |
| 4 | 1（品質→gameplay） | **魂炎の恒久強化ノードが品質で無効化**（敵密度は low・弾上限は low / medium で消えた） | 品質ゲートを削除（恒久強化は品質非依存） |
| 5 | 3（save exploit） | **火 / 氷 96 スキルの `restoreState({cdLeft})` が NaN / ±Infinity / 桁外れを採用できた**（M8-F が戦士へ入れた `restoreCd()` と同種の改ざん脆弱性が火 / 氷に残っていた） | `SkillManager.restoreRuntime` の共通入口 `_sanitizeRuntimeState` で全 144 スキル一律に無害化（非有限値は不採用・±120s クランプ）。**27 ファイルの restore 実装と正当なセーブの復元結果は 1 件も変えない**（候補列 / runtime trace ハッシュ不変を確認） |

- 5 は M9-A §9 の指示（「同じ改ざん脆弱性がある場合のみ、候補列・runtime trace を壊さない最小修正」）に従い、
  火 / 氷の各ファイルへ helper を移植せず **1 か所の共通入口**で対応した。戦士は基底 `restoreCd()` との二重防御。
- これ以外の crash / pool leakage / death event 二重 / 無限状態 / job leakage は**発見 0 件**
  （per-job 完成監査で修正済みの状態が維持されている）。

## 3. balance / guidance / しきい値

- **バランス値の変更 0 件**（damage / cooldown / 敵 / 報酬 / rarity / weight とも）。
- **guidance のキー・しきい値の変更 0 件**（validate-data の固定値検査を維持）。
- **抽選しきい値の変更 0 件**（戦士の completion しきい値は本文どおり維持。火 / 氷は M8-A / M7-E の
  warning しきい値を per-job スイートが維持し、横断テストは別立ての回帰フロアを持つ）。
- gameplay cap の canonical 化は「値の統一」であって nerf ではない
  （low / medium は強化・high 不変・ultra は計測実績のある high へ整列。`./quality-cap-classification.md`）。

## 4. 共通 combat path の分類

| 経路 | 火 | 氷 | 戦士 | 実装 |
|------|-----|-----|------|------|
| direct / area | ○ | ○ | ○（melee） | `dealDamage` / `aoe` / `meleeStrike`（skillId 必須） |
| projectile | ○ | ○ | 反射弾のみ | `Projectile` プール（実体は gameplay cap） |
| DoT | 炎上 tick | — | — | `tag:'dot'`（マーカー + スキル側 tick） |
| explosion / chain | ○（非再帰） | 粉砕（非再帰） | — | `isMarkDetonation` / `isShatter` / 連鎖 3 固定 |
| status-triggered | 炎上起爆 | 凍結→粉砕 / 氷砕 | — | StatusEffectManager 集約 |
| execute / counter / reflected | — | — | ○ | WarriorCombatSystem 集約（世代 / 回数固定） |
| 対ボス | 爆発縮小 | 氷砕ゲージ | 体勢しきい値上昇 | **意図した job-specific policy（重複ではない）** |
| 資源 | 熱量（核） | — | 闘気・コンボ | 同上 |

「同じ bug を 3 か所で抱える」構造は cooldown 復元だけで、上記 #5 の共通入口化で解消した。
それ以外の別名実装は表のとおり**意図した設計差**として記録する（大規模共通化はしない）。

## 5. 残っている warning と既知の制約

- `validate-data`: **0 エラー / 0 警告**。
- 火 / 氷の既知 warning（`FROST_EVOLUTION_LOW_RATE` ほか）は per-job docs の記録どおり（変更なし）。
- ヘッドレスの限界（documented note）→ **M9-A.1 で解消**:
  - 「fire / frost の弾ダメージが Scene モックで解決されない」「reactive に刺激が無い」の 2 点は、
    production 駆動の完全ハーネス（`./cross-job-full-balance-harness.md`）で解消した。
    絶対比較の正は `./cross-job-final-balance.md`。本ファイルと `./cross-job-balance.md` の
    M9-A 時点の数値は歴史的記録として残す。
- **実ブラウザ**: M9-A.1 で自動化できる範囲（起動 / 3 ジョブ / 4 品質 / 途中切替 / F8 / セーブ往復 /
  相対パス）は console エラー 0 で確認済み。**手入力の体感・長時間・高負荷ピークは未確認**
  （`./browser-validation-gate.md`）。

## 6. 追加 / 変更したファイル（実装）

| ファイル | 内容 |
|----------|------|
| `data/balance.json` | skillCaps の形の変更（値は canonical = 旧 high）・`skillCapClasses` 新設・`gameplayLimits` 新設・`effectQuality` から gameplay キー削除 |
| `src/systems/DataManager.js` | `skillCap` が単一値を解決・`skillCapClasses` / `gameplayLimits` の getter |
| `src/scenes/BattleScene.js` | プール上限を gameplayLimits 由来へ / hitStop 品質非依存 / 魂炎ノードの品質ゲート削除 / **F8 に 3 ジョブ比較を追加** |
| `src/systems/SkillManager.js` | `restoreRuntime` の共通入口 `_sanitizeRuntimeState`（cdLeft 改ざん耐性を 144 skill へ） |
| `tests/cap-shape.mjs` / `tests/cross-job-common.mjs` | 共通ハーネス（cap の形 / 3 ジョブ実駆動 / 汎用 draft sim） |
| `tests/cross-job-*.mjs` × 24 ＋ `three-job-system-nonregression.mjs` | 新規 25 スイート |

save_version は **v6 のまま**（保存キーの追加 0）。
