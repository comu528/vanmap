# 品質 cap 分類（Milestone 9-A）

M9-A の中核成果。`balance.json` の全 `skillCaps` 217 件と品質関連の全設定を
**visual / gameplay / safety** の 3 分類へ確定し、**品質が戦闘結果へ影響する経路を 0 にした**。

## 分類の定義

| 分類 | 件数 | data の形 | 品質依存 | 内容 |
|------|------|-----------|----------|------|
| **visual** | **47** | `{ low, medium, high, ultra }`（単調非減少） | **してよい** | 粒子 / trail / debris / 火花 / 輪 / マーカー / オーラ / 土煙 / 表示テキスト / 状態アイコンなど、**当たり判定にもダメージにも関与しない演出だけ**の上限 |
| **gameplay** | **150** | `{ value }`（単一値） | **禁止** | ダメージ対象数 / 命中数 / 弾実体数 / tick 数 / strike 数 / 状態付与数 / 爆発数 / 連鎖数 / 反射弾実体 / 判定数 / field 効果など、**戦闘結果に関与する**上限 |
| **safety** | **20** | `{ value }`（単一値） | **禁止** | 再帰世代（echo / clone / 反射 / kill-chain）/ per-cast 上限 / per-second 上限 / 反撃回数 / 決闘・構え・陣の同時数 / 状態索引 / デバッグ履歴など、**ゲームルールとしての固定上限** |

分類の正は `balance.json` の **`skillCapClasses`**（cap 名 → 分類のマップ）。
`tests/cross-job-quality-cap-classification.mjs` が全 217 件の分類・形・単調性を検証し、
`validate-data` の M9-A ブロックが分類数（47 / 150 / 20）を固定値で突き合わせる。

## 単一値の形が仕様である理由

gameplay / safety cap を `{ value }` にしたのは値の変更ではなく**構造の変更**。
`DataManager.skillCap()` は `value` を持つ cap では品質引数を**読まない**ので、
「品質で戦闘結果が変わる」状態へ**将来の編集で静かに戻すことができない**
（戻すには形を 4 段階へ変える必要があり、`validate-data` と分類テストが必ず落ちる）。

## canonical value の選択（= M8-F までの high）

**gameplay / safety の単一値は、旧 4 段階の `high` の値をそのまま採用した。**

選択手順（M9-A §3.3 の指示どおり）:

1. **全品質値の一覧化** — 旧 data では 217 件中 206 件が品質で変化していた。
   うち gameplay / safety に分類される **161 件が品質依存**（＝すべて誤分類だった）。
2. **production 使用箇所の特定** — `tests/cross-job-caps-fields.mjs` が全 217 件の参照を確認（未参照 0）。
3. **gameplay 上必要な最大値の計測** — 各スキルの data 宣言（`levels` / `safetyCaps`）は
   すべて旧 high 値以下で設計されている（M7-E / M8-A / M8-F の「data の要求値 ≥ 実効値」検査が根拠）。
4. **性能比較** — Node 純ロジックの 10 分相当実測（M8-F）で low 2.5s / high 2.7s / ultra 3.1s。
   high と low の計算量差は約 8% しかなく、**low 機でも high 相当の gameplay 計算は成立する**
   （品質の重い部分は Phaser の描画であり、ロジックではない）。
   M9-A の `cross-job-quality-gameplay-invariance` でも 4 品質の実行時間はほぼ同一。
5. **skill ごとの設計上限との突合** — 進化の `safetyCaps`・data の `maxTargets` はすべて canonical 以下。
6. **nerf の回避** — high は**出荷既定品質**（`profileSchema` の既定 `effectQuality: 'high'`）なので、
   これまでの全バランス計測（M7-E / M8-A / M8-F はすべて high で実測）が**そのまま有効**。
   low / medium のプレイヤーは gameplay が **high 相当へ引き上げ**られ、nerf は発生しない。
7. **ultra を選ばなかった理由** — ultra の値（例: `maxMeleeTargetsPerHit` 32・敵 320 体）は
   opt-in の余剰性能層で、バランス計測の実績が無い。ultra を canonical にすると
   全プレイヤーの gameplay 負荷が最大 +50〜60% になり、低スペック機で破綻しうる。
   ultra 選択者は**演出だけが最大**になり、gameplay は全員と同じ canonical で動く。

### canonical 化による変化の向き

| 旧品質 | gameplay の変化 |
|--------|----------------|
| low | **強化**（対象数・弾数・敵数が high 相当へ。例: 敵上限 60 → 200・`maxMeleeTargetsPerHit` 12 → 24） |
| medium | **強化**（同上。敵上限 120 → 200） |
| high（既定） | **不変**（canonical = high） |
| ultra | 対象数・敵数がわずかに減少（例: 敵上限 320 → 200・`maxMeleeTargetsPerHit` 32 → 24）。**演出は最大のまま**。バランスの正は high 計測なので、これは「計測どおりの挙動へ戻す」変更 |

**特定スキルだけを low 品質の挙動へ揃える全体 nerf は行っていない**（canonical に low 値を使った cap は 0 件）。

## skillCaps 以外で品質から切り離したもの

| 項目 | 旧挙動 | M9-A |
|------|--------|------|
| 敵プール上限 | `effectQuality.{q}.maxEnemies` = 60/120/200/320 | **`gameplayLimits.maxEnemies` = 200**（単一値）。品質ブロックからキー自体を削除（validate-data が残留をエラー化） |
| 弾プール上限 | `effectQuality.{q}.maxProjectiles` = 120/250/400/700 | **`gameplayLimits.maxProjectiles` = 400**（単一値） |
| hitStop | high / ultra のみ有効（＝低品質はロジック経過時間が変わる） | **全品質で有効**（ロジック frame を止める処理は gameplay） |
| 魂炎「敵密度」ノード | low では無効（恒久強化が品質で消えた） | **全品質で有効** |
| 魂炎「エフェクト限界突破」ノード | low / medium では無効 | **全品質で有効**（弾上限へ加算・particleBudget への加算も維持） |

## 品質に残った演出（visual）

`effectQuality`: `particleScale` / `damageNumbers` / `screenShake` / `whiteFlash` / `maxSparksPerBurst`。
`combatCaps.particleBudget`（4 段階）。`statusVisuals` 系の visual cap 47 件。
これらは**表示だけ**を変え、`tests/cross-job-quality-visual-reduction.mjs` が
「low で実際に減っている（47 件中 45 件が low < ultra）」ことも検証する。

## 名前と分類が食い違う既知の例外

| cap | 分類 | 理由 |
|-----|------|------|
| `maxBlazingTrails` | gameplay | 名前は trail だが、**DoT を与える field 実体**の上限 |
| `maxPhoenixEffects` / `maxIcebreakerEffects` / `maxShatterEffectsPerFrame` ほか | visual | 名前は effect だが実使用は演出のみ（ダメージは別経路で必ず入る） |
| `maxStatusDebugHistory` / `statusVisualUpdateInterval` / `chillNearThresholdEffectCooldown` | visual | デバッグ表示 / 表示更新間隔（判定へ関与しない） |

全例外は `tests/cross-job-quality-cap-classification.mjs` の例外リストと一致していないと落ちる。

関連文書: `./quality-gameplay-invariance.md`（不変性の実測）/ `./cross-job-system-audit.md`（監査本体）
