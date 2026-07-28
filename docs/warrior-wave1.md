# 戦士スキル拡張 Wave1（Milestone 8-C）設計メモ

M8-B で作った戦士の基盤（闘気 / コンボ / 回復 / 不屈 / 体勢崩し）の上に、
**active 5 → 15・進化 3 → 8** を積んだ回。passive は 4 種のまま増やしていない。

- 対象ジョブ: `warrior`（`element: physical`）のみ。火の魔女・氷術師は完全に非回帰。
- `save_version` は **6 のまま**（追加フィールドのみ・移行不要）。
- 新しい formal status は 1 つも増やしていない（共通状態異常は 5 種のまま）。
- 新しい npm 依存・ビルド工程・外部通信はなし。

---

## 1. 何を足したか

### active10

| id | 名称 | 役割（設計上の担当） | 主な制約 |
|----|------|----------------------|----------|
| `armor_breaker` | 兜割り | 単体高体勢。硬い相手（エリート/ボス）を崩す起点 | 範囲が狭く回転が遅い。体勢削りは 1 発動につき同一敵 1 回 |
| `twin_fang_slash` | 双牙斬 | 高速コンボ builder。戦士 active で最短 CD | 2 撃目のみ広く・倍率つき。1 発動 = 1 cast |
| `execution_strike` | 処刑斬 | 瀕死狙い。掃討の速度を上げる | **通常敵のみ処刑可**。エリート/ボスは欠損 HP 参照の追加ダメージだけ |
| `leap_smash` | 跳躍強襲 | 距離を詰める。着地で AoE | 跳躍中は**軽減であって無敵ではない**。距離と時間の両方で必ず終わる |
| `sweeping_advance` | 薙ぎ進軍 | 前進しながら左右交互に薙ぐ | 突進斬りのような一点 dash ではない。打撃数と持続の両方に上限 |
| `counter_stance` | 迎撃の構え | 能動 counter。被弾を受け流して返す | 完全無効化しない。1 構えあたりの反撃回数に上限 |
| `war_cry` | 戦吼 | 短時間の自己バフ＋短距離 shock | **重ねがけしない**（refresh）。formal status を作らない |
| `chain_hook` | 鎖鉤 | 引き寄せ／接近補助 | ボスは動かせない（代わりに自分が踏み込む）。エリートは引き寄せが大幅に短い |
| `shockwave_stomp` | 震脚 | 短距離制圧。群れを押し返す | 演出だけ大きく、判定半径は `radius` のまま |
| `relentless_combo` | 怒涛連撃 | 手数で押し切る。撃破で手数を引き継ぐ | 引き継ぎ先は**近距離だけ**。回数上限つき |

### evolution5

| 進化 id | 名称 | 進化元 | 補助 | 役割 |
|---------|------|--------|------|------|
| `skull_splitter` | 断界兜割 | `armor_breaker` | `brute_force` Lv4 | 二段 overhead。二撃目の狭い衝撃で体勢を崩し切る |
| `crimson_execution` | 血断処刑 | `execution_strike` | `bloodlust` Lv4 | 処刑閾値を上げ、仕留めた瞬間の回復を強める |
| `war_god_roar` | 軍神咆哮 | `war_cry` | `combat_instinct` Lv4 | 範囲・バフを強化し、コンボ猶予を立て直す |
| `adamant_counter` | 金剛迎撃 | `counter_stance` | `heavy_armor` Lv4 | 構えが長く、反撃後に短い軽減。反撃の優先度は最上位 |
| `heaven_crushing_descent` | 天墜崩撃 | `leap_smash` | **active** `ground_slam` Lv6 | 着地後に 1 回だけ二次衝撃 |

> 天墜崩撃だけ補助が **active**（地砕き）。地砕きは**置換されず**、CD にも一切触らない。
> 無料発動も行わない。`tests/warrior-wave1-evolutions.mjs` §6 が機械的に固定している。

---

## 2. 実装の中心にある 5 つの決定

### (a) 処刑は「割合即死」を作らない

即死用の別 API を作らず、`BattleScene.executeTarget()` が
**残り HP ぴったりのダメージ**を通常の `dealDamage` 経路へ流す。

```
ExecutionStrikeSkill.fire()
  → combat.meleeStrike({ execute: {...} })
    → WarriorCombatSystem.executePolicy(target, params)   // 可否の一元判定
      → canExecute なら scene.executeTarget(e, skillId)
        → dealDamage(e, 残りHP)                            // 死亡イベントはここで 1 回だけ
```

これにより死亡イベント・撃破統計・撃破回復・進化の撃破フックが**すべて 1 回だけ**走る。

可否の判断はスキル側では行わず、`executePolicy()` に一元化した。

| 対象 | 処刑 | 効果 |
|------|------|------|
| 通常敵 | HP 割合 ≤ 閾値 なら可 | 残り HP ぶんのダメージ |
| エリート | **不可** | 失った HP に比例した追加ダメージのみ |
| ボス | **不可** | 追加ダメージは `bossMissingHpCap`（既定 50%）で頭打ち |

さらに `balance.json` の `warrior.execute.maxExecutesPerSecond` で
1 秒あたりの処刑数を制限し、無限処刑・無限回復を作らない。

### (b) 反撃は「1 被弾 = 最大 1 系統」

反撃を持つスキルが 3 つ（`counter_stance` / `adamant_counter` / `unyielding_fortress`）
同時に存在しうるので、**誰が反撃するか**を `WarriorCombatSystem` に一元化した。

```
Player.takeDamage
  → BattleScene.onWarriorHit(raw, applied)
    → warrior.consumeCounterEvent()     // 優先度が最も高い 1 系統だけを選ぶ
      → 選ばれた skill の performCounter()
```

- 優先度は `balance.json` の `warrior.counter.priority` に集約（`adamant_counter` 3 > `unyielding_fortress` 2 > `counter_stance` 1）。
- `warrior.counter.globalCooldownMs` により、連続被弾でも反撃が無限に出ない。
- `BattleScene._inWarriorCounter` の再入ガードで counter → counter の再帰が起きない。
- 軽減は**合算せず最大値**を採り、`mitigation.maxTotalReduction`（70%）で必ずクランプされる。
- **不屈（基礎能力）は反撃系統ではない**。生存能力なので構え枠を占有しない。
  反撃系統として登録するのは進化「不落の城壁」だけ。

### (c) 戦吼は formal status を作らない

`status-effects.json` を増やすと火/氷の状態異常システムに影響が出るため、
バフは `WarriorCombatSystem` 上の timed buff として持つ。

- **重ねがけしない**（`stack: 'refresh'` = 上書き）。連打しても持続と強度は上書きされるだけ。
- 強度・持続は `balance.json` の `warrior.warCry.max*` で必ずクランプされる。
- 保存は `serializeTimedBuffs()` / `restoreTimedBuffs()`（壊れた保存でも上限内に正規化する）。
- 軍神咆哮の `graceRefill` は**コンボ猶予だけ**を回復する。コンボ値そのものは配らない。
- 他ジョブの周回では `WarriorCombatSystem.enabled = false` なので、そもそもバフが付かない。

### (d) 移動・引き寄せは共通経路だけを通る

スキル側は敵やプレイヤーの座標を直接書き換えない。

| 目的 | 共通 API（BattleScene） | 保証 |
|------|--------------------------|------|
| 敵を引き寄せる | `pullTarget(e, opts)` | ボスは動かない / 壁内へクランプ / `enemyGrid` を更新 / 慣性を残さない |
| 自分が近づく | `movePlayerTowards(x, y, d)` | 壁内へクランプ / NaN を作らない |
| 硬い相手・瀕死を狙う | `preferredMeleeTarget(x, y, r, mode)` | 全敵総当たりをしない |
| ボスの予告確認 | `bossTelegraphing()` | 予告 / 突進中は踏み込まない（完全無視もしない） |

跳躍・進軍・引き寄せはいずれも「距離」と「時間」の**両方**で必ず終わる。
1 フレームあたりの移動量は速度 × dt に収まり、テレポートしない。

進行中の状態は敵オブジェクトを保持せず、**安定 runtime id（`_seq`）と座標だけ**を持つ。
保存にもオブジェクト参照は 1 件も入らない。

### (e) 進化が基礎 active のクラスを再利用する

軍神咆哮 / 金剛迎撃 / 天墜崩撃は基礎スキルのロジックをそのまま使いたいため、
`EvolvedSkillBase` を継承せず基礎クラスを継承している。
data の読み先だけを進化定義へ差し替えるために `applyEvolvedSemantics(cls)` を用意した。

```js
export class WarGodRoarSkill extends WarCrySkill { /* cryParams() だけ上書き */ }
applyEvolvedSemantics(WarGodRoarSkill);   // evoDef / cap() / stats を進化側へ差し替える
```

`stats` は `{ cooldown: evoDef.cooldown }` を合成して返すので、
`SkillBase.update()` の発動判定はそのまま働く。

---

## 3. 上限（二層）

| 層 | 置き場所 | 目的 |
|----|----------|------|
| 進化ごとの安全上限 | `skill-evolutions.json` の `safetyCaps` | その進化の設計上の最大値 |
| 品質別上限 | `balance.json` の `skillCaps` | 端末性能に応じた打ち切り（low ≤ medium ≤ high ≤ ultra） |

M8-C で追加した品質別上限は 20 件。**ダメージ / イベント系**と**演出系**を名前で分けている。

- ダメージ / イベント: `maxOverheadStrikes` `maxTwinFangStrikes` `maxExecutesPerCast`
  `maxLeapImpacts` `maxSweepStrikesPerFrame` `maxCounterWindows` `maxChainPullsPerCast`
  `maxRelentlessStrikes` `maxRelentlessRetargets`
- 演出: `maxOverheadSlashVisuals` `maxTwinSlashVisuals` `maxExecuteMarkers` `maxLeapTrails`
  `maxLandingDebris` `maxSweepTrails` `maxCounterFlashes` `maxWarCryRings`
  `maxChainHookLines` `maxStompDebris` `maxRelentlessSparks`

演出上限を 1 まで落としてもダメージ・命中は一切変わらない（`tests/warrior-wave1-quality-cap.mjs` §4）。

**死にフィールド禁止**: data に書いた値はすべて実装から参照される。
`tests/validate-data.mjs` と各 audit テストが未参照フィールド・未参照 cap を弾く。

---

## 4. Job Lv80「打撃数 +1」

対象はちょうど **6 種**。

```
great_cleave / shield_bash / ground_slam        （M8-B から）
armor_breaker / twin_fang_slash / relentless_combo （M8-C で追加）
```

- 対象は「打撃数」が増えるだけで、**遠距離へ飛ぶ弾は 1 つも増えない**。
- 進化 8 種はすべて対象外（`lv80ProjectileTarget: false`）。
- 追加打撃で `recordCast` は増えず、闘気 / コンボは 1 発動あたりの上限で守られる。
- 火 / 氷の Lv80 対象数（各 6 種）は変えていない。

---

## 5. 保存

`save_version` は 6 のまま。`warriorState` に `timedBuffs`（戦吼バフ・反撃の構え）が
**追加**されただけで、既存キーは 1 つも変わっていない。

| 状態 | 保存するか | 理由 |
|------|-----------|------|
| クールダウン | する | 再読込直後の無料発動を防ぐ |
| 戦吼バフ（残り時間・強度） | する | 復元時も上限内へ正規化する |
| 反撃の構え（残り時間・**使用回数**） | する | 再読込で構えを使い直せないようにする |
| 跳躍・引き寄せ・連撃の途中状態 | **しない** | 再開時の二重移動・無料の着地衝撃を防ぐ |
| 薙ぎ進軍の途中状態 | 残り時間と消化済み打撃数のみ | 「再開」であって「二重化」ではない |
| 敵オブジェクト | **しない** | `_seq`（安定 runtime id）だけを持つ |

旧セーブ（`timedBuffs` なし）・壊れたセーブでも例外を出さず、上限内へ丸める。

---

## 6. テレメトリ / デバッグ

ローカル表示のみ・外部送信なし。

- 周回全体（`WarriorCombatSystem.summary()` ↔ `CombatTelemetry.warrior`、1:1）:
  `executions` `executeFailures` `executeOverkill` `counters` `counterBySource`
  `warCryApplications` `warCryUptimeSeconds` `chainPulls` `chainPullDistance`
  `bossApproaches` `leapLandings` `sweepDistance` `relentlessChains` `relentlessRetargets`
- スキル別: `executions` `counters` `pullDistance` `retargets` `movementDistance`
- **F8**（バランス検証）: 戦士カタログ規模・Lv80 対象数と、上記カウンタ・警告行。
- **F9**（戦士デバッグ・`?debug=1`・戦士周回のみ）: 戦吼の残り/強度、構えの一覧と優先度、
  処刑の閾値と成立/失敗、引き寄せ・跳躍・進軍・連撃のカウンタ、Lv80 対象一覧。
  操作ボタンに「処刑圏内へ」「戦吼バフ付与/解除」「構えを開く」「被弾 1 回で反撃」
  「敵を遠方へ配置」を追加した。
- **F10（品質切替）は変更していない。**

火 / 氷の周回ではキー構造だけが存在し、値はすべて 0 のまま。

---

## 7. 非回帰

火の魔女・氷術師は完全に据え置き。次のハッシュが 1 バイトでも動いたら失敗する。

| 対象 | ハッシュ（M8-A / ec503fe 時点） |
|------|--------------------------------|
| 火 300 seed 候補列 | `15a8585c4f60681b…` |
| 氷 300 seed 候補列 | `bd38bcf580523b7a…` |
| 火 48 スキルのランタイム | `1f0f2c1805bf06fa…` |
| 氷 48 スキルのランタイム | `029a44bd73b485ae…` |

`tests/three-job-wave1-nonregression.mjs` が上記に加えて、
火 / 氷のスキルが戦士 API（`meleeStrike` `pullTarget` `executeTarget` など）を
1 つも呼ばないことも確認する。

---

## 8. 検証

M8-C で追加したテストは 19 本（すべて Node.js 標準機能のみ・`HEAVY=1` で seed 数を増やせる）。

```
node tests/warrior-wave1-catalog.mjs        node tests/warrior-counter-arbitration.mjs
node tests/warrior-wave1-pool.mjs           node tests/warrior-war-cry.mjs
node tests/warrior-wave1-draft.mjs          node tests/warrior-chain-hook.mjs
node tests/warrior-wave1-evolutions.mjs     node tests/warrior-relentless-combo.mjs
node tests/warrior-armor-breaker.mjs        node tests/warrior-wave1-job80.mjs
node tests/warrior-execution.mjs            node tests/warrior-wave1-runtime-save.mjs
node tests/warrior-leap.mjs                 node tests/warrior-wave1-determinism.mjs
node tests/warrior-sweeping.mjs             node tests/warrior-wave1-quality-cap.mjs
                                            node tests/warrior-wave1-cleanup.mjs
                                            node tests/warrior-wave1-telemetry.mjs
                                            node tests/three-job-wave1-nonregression.mjs
```

`.github/workflows/validate.yml` にすべて登録済み。
ブラウザでの目視確認項目は `./test-guide.md` の M8-C セクションを参照。

---

## 9. M8-C で**やっていない**こと

仕様どおり、次は追加していない。

- active16 種目以降 / 進化 9 種目以降 / 新しい passive / 新しいジョブ
- 属性反応（physical × fire / ice）
- 新しい formal status / 装備 / 武器選択
- 新しい敵・ボス・難易度
- 転生レガシー / UI 全面改修 / 正式画像素材
- 遠距離の斬撃波を主軸にした設計
- 戦士の完成監査（火の魔女 M8-A に相当する回）
