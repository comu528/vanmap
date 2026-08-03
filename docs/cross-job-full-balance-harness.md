# 横断 balance ハーネス（Milestone 9-A.1）

M9-A の横断監査が残した最大の制約 —— **fire / frost の弾ダメージ・DoT・場・reactive が
ヘッドレスの Scene モックでは解決されない** —— を取り除いた、production 駆動のハーネス。

- 比較結果: `./cross-job-final-balance.md`
- 品質不変性: `./quality-gameplay-invariance.md`
- 実ブラウザ検証: `./browser-validation-gate.md`

---

## 1. 何が変わったか（M9-A → M9-A.1）

| | M9-A（`tests/cross-job-common.mjs`） | M9-A.1（`tests/cross-job-harness.mjs`） |
|---|---|---|
| 駆動対象 | `SkillManager` ＋ スキル class（Scene は簡易モック） | **`BattleScene.prototype` を直接**（production の update ループ） |
| projectile | 生成のみ記録・命中しない | **production の `Projectile` プール + Arcade 相当の位置積分 + `checkCollisions`** で命中・貫通・爆発・跳弾・分裂・反射まで解決 |
| DoT | 未解決 | `tag:'dot'` の tick が `dealDamage` を通る |
| 場 / 遅延 | 未解決 | `time.delayedCall` を driver が進めるので陣・軌跡・遅延起爆が解決 |
| reactive | 発動刺激が無い | **共通 stimulus timeline**（17 イベント / 12 種別）を 3 ジョブへ同一適用 |
| 敵 / 湧き | 固定配置 | production の `SpawnManager`（`data/balance.json` の `run.phases`・難易度倍率） |
| ボス | 不死の的 | production の `Boss`（chase / telegraph / charge・氷砕・体勢崩し） |
| XP / Lv | なし | `ExperienceGem` → `grantXp` → level-up（driver が所持スキルを 1 段上げる決定論規則） |
| 死亡 | なし | `onPlayerDeath` / `_recordDeathEvent` / 不死鳥・障壁の復活経路 |

**推測による置換はしていない。** 弾を「即着弾」扱いにしたり DoT を一括ダメージにしたり
echo / clone / chain の回数を推定したりせず、すべて production の実装が決める。

## 2. 差し替えたもの（gameplay に触らない層だけ）

`tests/phaser-stub.mjs` が Phaser 側のプリミティブ（`Math` / `Geom` / GameObject の setter /
Arcade Body / `add.*` / `physics.*`）を提供し、`makeBattle()` が以下だけを置き換える。

| 置き換え | 理由 |
|---|---|
| `updateHud` / `updateHudSkills` / `showBanner` / `hud` | 表示。値は telemetry から直接読む |
| `autoSave` / `saveRun` / `finishRun` / `onResult` | セーブ・シーン遷移（`./cross-job-full-balance-harness.md` §6 のセーブ隔離） |
| `requestHitStop` | frame を止めない（run 間の等時性を保つ）。呼び出し回数は数える |
| `openLevelUp` | 抽選 UI の代わりに決定論的な level-up 規則 |
| `checkBossTime` | ボス出現時刻を profile が決める |
| `effects.*` | 演出。**visual オブジェクト数だけ**数える（品質差の観測に使う） |

`dealDamage` / `damageArea` / `aoe` / `meleeStrike` / `checkCollisions` / `updateProjectiles` /
`updateEnemies` / `updateGems` / `targetsInRadius` / `nearestTarget` / `shatterEnemy` /
`detonateMark` / `chainDetonate` / `_chainHit` / `_splitLance` / `_ricochetBounce` /
`_spawnIceFragments` / `onEnemyKilled` / `onBossKilled` / `grantXp` / `_recordDeathEvent` /
`executeTarget` / `launchTarget` / `grabTarget` / `throwGrabbed` / `pullTarget` /
`tryDeflectProjectile` / `createReflectedPhysicalProjectile` は**すべて production 実装のまま**。
`tests/cross-job-full-harness.mjs` §1 が `scene[m] === BattleScene.prototype[m]` を機械的に検査する。

## 3. battle profile（3 ジョブ完全同一）

| profile | 時間 | dt | 湧き | ボス | 敵弾 | 用途 |
|---------|------|----|------|------|------|------|
| `normal` | 180s | 32ms | production phases（900→550→320ms） | なし | なし | 基準 DPS / 進行 |
| `elite` | 180s | 32ms | + エリート 6s ごと・接敵湧き 2.5s | なし | 1.5s | エリート処理・接敵 |
| `boss` | 300s | 32ms | 少数 | 3s に出現 | 1.1s | ボス撃破時間・対ボス手段 |
| `survival` | 180s | 32ms | 密（700ms・cap 110）+ 接敵 1.2s | なし | 0.9s | 被弾 / 回復 / 生存 |
| `stimulus` | 26s | 32ms | 接敵のみ（硬い敵） | 硬いボス | 2.5s | reactive / 防御の全刺激 |

- **固定条件**: seed / dt / 時間 / 湧き / 敵定義 / 難易度 1 / gameplay cap / Job Lv なし / 恒久強化なし /
  build（`slot8` = プール先頭 8 種 Lv8 + passive 4、`full` = 30 種 Lv8、`evolved` = 進化 18 種）。
- **個性として残す差**: 実効 maxHp（火 100 / 氷 100 / 戦士 120 = 戦士 passive 由来）・属性・資源・状態異常。
- `closeSpawnEvery` / `closeSpawnDist` / `closeSpawnHpMult` は**3 ジョブへ同一に**適用する profile 変数。
  ヘッドレスの autoMove は完全に kite できてしまうため、接敵距離帯（近接 / 接触 / 軌跡）を通すために置いた。
- seed: 既定 3 seed（`HEAVY=1` で 5〜7 seed・profile も 4 種へ拡張）。

## 4. 観測しているもの（§7 の全カテゴリ）

`collectMetrics()` が返すカテゴリ: `offense`（総ダメージ / DPS / kill / elite / boss / 最大単発 /
cast / hit / zero-hit / zero-utility / top share / boss kill time / boss HP 残）・
`defense`（HP / 死亡 / 生存時間 / **被ダメージ** / 軽減 / 回復 / 不屈）・
`utility`（冷気 / 凍結 / 耐性 / ボスゲージ / 氷砕 / 粉砕 / 炎上ダメージ / 氷ダメージ /
ノックバック / 体勢 / stagger / 崩し / 反撃 / 処刑 / 打ち上げ / 掴み / 移動）・
`resource`（闘気 / 解放 / 超過 / 稼働 / コンボ）・`progression`（Lv / XP / level-up）・
`pools`・`visual`・`paths`（36 経路の呼び出し回数 + 弾種別）・`deathEvents`。

**`statsList()` は使わない。** casts / damage / kills がすべて 0 の行を落とすため
reactive スキルが消える。`skills.stats` の Map を直接読む。

## 5. 品質の扱い

- `gameplayTrace()` は cast / hit / kill / damage / extra / runtime / 資源 / status RNG cursor /
  pools / deathEvents / telemetry を含み、**`run.quality` と FPS 計測だけを除く**。
- 4 品質 × 3 ジョブ × 全 profile で byte-identical（`cross-job-quality-full-invariance.mjs` 254 件）。
- 周回途中の切替も gameplay 不変（`cross-job-quality-midrun-switch.mjs` 78 件）。
- visual は `effects.*` の呼び出し数で観測（low 9,282 / ultra 56,793 = 演出だけが減る）。

## 6. セーブ隔離

- ハーネスの `CombatTelemetry` は**常に `debugRun: true`**。`RunBalanceSummary.applyRun` は
  `debugRuns` へしか積まず、`summaryBySkill` / `recentRuns` は 1 バイトも変わらない
  （対照実験として `debugRun:false` にすると両方が変わることも確認）。
- 周回中の `localStorage` / `sessionStorage` 書き込みは **0 件**（spy で計測）。
- ハーネスは `SaveManager` も `BattleManager` も import しない。`save_version` は **v6**・保存キー追加 0。

## 7. 決定論

- 同 seed・同 profile・同 job の 2 回実行が trace まで完全一致。
- seed / job / profile を変えると trace が変わる（どれも実際に効いている）。
- `Math.random` は harness・stub・`BattleScene` / `SpawnManager` / `StatusEffectManager` /
  `SkillManager` / `Boss` のいずれにも無い。
- profile は JSON 往復で不変な固定値（関数・乱数を仕込めない）。

## 8. 見つけて直した bug（最小修正・2 件）

| # | 不備 | 修正 | 影響 |
|---|------|------|------|
| 1 | `CombatTelemetry.status.burningDamage` が**宣言され F8 が表示していたのに、発行元が 1 つも無い dead key**（常に 0） | `dealDamage` で `element==='fire'` かつ `isDoT`/`tag:'dot'` の命中を集計 | 観測のみ。damage / 状態 / RNG に影響なし（品質不変性ハッシュも不変）。実測 6,399（full build）/ 15,027（evolved） |
| 2 | `BattleScene._damageTakenTotal` が `finalizeTelemetry` と F8 から参照されているのに**加算する場所が無い dead field**（`damageTaken` が常に 0） | `Player.takeDamage` の HP 減算と同じ位置で実被弾量を累計（障壁 / 軽減の後） | 観測のみ。順序・判定・RNG に影響なし |

**バランス値の変更は 0 件**（`./cross-job-final-balance.md`）。

## 9. 巻き戻し検知

| 巻き戻し | 落ちるテスト |
|----------|--------------|
| 弾を「即着弾」扱いへ戻す / `checkCollisions` をモックへ差し替える | `cross-job-projectile-resolution`（弾種カバレッジ・命中 0 検知）＋ `cross-job-full-harness` §1（`prototype` 同一性） |
| DoT を一括ダメージへ | `cross-job-dot-persistent-resolution` §1 |
| reactive を無条件 cast へ | `cross-job-reactive-stimulus` §2（production フック経由の確認） |
| 品質で gameplay 差を再導入 | `cross-job-quality-full-invariance` ＋ `cross-job-quality-midrun-switch` ＋ `validate-data` |
| ハーネスへ独自 damage 式 / `Math.random` / 品質分岐を追加 | `cross-job-full-harness` §2 ＋ `cross-job-balance-determinism` §5 |
| debugRun を外す / セーブへ書く | `cross-job-harness-save-isolation` |
| プール上限 / グリッド解除を壊す | `cross-job-harness-cleanup` |
| 必須依存（npm / Playwright）を追加する | `cross-job-browser-gate` §4 |

## 10. テスト（15 スイート）

`cross-job-full-harness` / `cross-job-projectile-resolution` /
`cross-job-dot-persistent-resolution` / `cross-job-reactive-stimulus` /
`cross-job-boss-profile` / `cross-job-survival-profile` / `cross-job-balance-final` /
`cross-job-balance-warning-classification` / `cross-job-quality-full-invariance` /
`cross-job-quality-midrun-switch` / `cross-job-balance-determinism` /
`cross-job-harness-save-isolation` / `cross-job-harness-cleanup` /
`cross-job-browser-gate` / `three-job-balance-harness-nonregression`。

`HEAVY=1` で seed 数と profile 数が増える（既定は CI 実行時間に収まる構成）。


---

## 11. M9-A.2 での位置づけ（Node と実ブラウザの役割分担）

M9-A.2 で実ブラウザの長時間プレイテスト（`./browser-longrun-playtest.md`）を実施した。
**両者は測るものが違う**ので、数値を直接比較しない。

| | Node ハーネス（本書） | 実ブラウザ（M9-A.2） |
|---|---|---|
| build | 固定（`slot8` / `full` / `evolved`） | **production の通常 draft**（seed / strategy が決める） |
| dt | **32ms 固定** → 同 seed で byte-identical | 実時間（2 倍速 × 59fps ≒ 33ms）→ run 間で完全一致はしない |
| 担当する証明 | 品質不変性・構造異常 0・回帰フェンス・決定論 | 到達点・進行曲線・実 FPS / heap・UI と入力・save/resume |
| 使いどころ | 回帰検知（CI で毎回） | 節目の実機確認（CI ではブラウザを起動しない） |

**byte-identical は Node の担当**であり、実ブラウザでそれを主張してはいけない
（`tests/browser-quality-plan.mjs` が「主張していないこと」を機械検査する）。
実ブラウザで見るのは「gameplay 上限が品質で変わらない」「低品質で gameplay が減らない」
「取得スキルの集合が 4 品質で完全一致（draft が品質非依存）」の 3 点。
