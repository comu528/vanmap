# 戦士（warrior）設計 — Milestone 8-B「戦士 基盤実装」

3 人目のジョブ **戦士（warrior）** の設計と実装をまとめる。
数値の正は `data/*.json`、挙動の正は `src/systems/WarriorCombatSystem.js` と各スキルクラス。
本書は「なぜその形にしたか」と「どこに何があるか」を記録する。

火の魔女（`flame_witch` / fire）・氷術師（`frost_mage` / ice）の
**数値・挙動・候補列・状態異常・保存結果は 1 件も変更していない**（`node tests/three-job-nonregression.mjs` が機械的に保証する）。

---

## 1. 何を作ったか（M8-B の範囲）

| 要素 | 数 | 内容 |
|------|----|------|
| ジョブ | 1 | `warrior`（属性 `physical`・`preferredRange: melee`） |
| active | 5 | 大薙ぎ / 盾撃 / 旋風斬り / 突進斬り / 地砕き |
| passive | 4 | 剛力 / 重装 / 戦闘本能 / 血気 |
| evolution | 3 | 千刃乱舞 / 血戦旋風 / 不落の城壁 |
| Job Lv | 1〜100 | 到達報酬 11 段（Lv5/10/20/30/40/50/60/70/80/90/100） |
| 専用リソース | 2 | **闘気（fury）** と **コンボ（combo）** |
| 専用機構 | 4 | 強靱（被ダメージ軽減）/ 不屈（瀕死時の基礎能力）/ 撃破回復 / 体勢崩し（poise） |

**追加していないもの**（M8-B の範囲外）: active 6 種目以降、evolution 4 種目以降、新しい共通状態異常、
火・氷との属性反応、装備・武器選択、新しい敵 / ボス / 難易度、4 人目のジョブ、転生レガシー、UI 全面改修、正式画像素材。

---

## 2. 設計方針 — 「魔法職の物理版」にしない

火・氷は**遠距離から弾・領域を置く**ジョブである。戦士を同じ形にすると
「見た目が違うだけの 3 人目」になるため、次の 5 点で明確に別のゲーム性にした。

1. **近接専用**。全 active が「自分中心の円」または「前方の arc」でしか当たらない。
   画面を横断する斬撃波は 1 つも無い（`node tests/warrior-active-skills.mjs` が
   「700px 離れた敵に当たらない」「`spawnPlayerProjectile` を呼ばない」を検証する）。
2. **敵の中に居続けることが有利**。接敵中は被ダメージが減り（強靱）、闘気が溜まり、コンボが切れない。
   火・氷が「離れて撃つ」のに対し、戦士は「近づいて殴り続ける」。
3. **被弾を資源に変える**。軽減した分・通った分の両方が闘気になる。
   ただし**自傷で闘気を稼ぐ設計は入れていない**（HP を払って強くなるループは `bloodfire_pact`（火）が既に担っている）。
4. **攻防回復を闘気解放で循環させる**。闘気 100 で自動発動し、
   一定時間だけ攻撃力・攻撃速度・軽減・ノックバック・体勢削りが同時に上がり、時間経過で HP が戻る。
   「高耐久だが火力が低い」にならないよう、**防御と火力を同じリソースの同じ発動で得る**構造にした。
5. **エリート / ボスの陣形へ切り込む価値**を体勢崩しで作る。
   通常敵はノックバックで押し返し、エリートは stagger、ボスは行動を中断させて「露出」させる。

### 避けた設計（意図的に採らなかったもの）

| 避けたもの | 理由 |
|------------|------|
| 全スキルが画面横断の斬撃波 | 火・氷の弾幕と役割が重複する |
| 高耐久・低火力 | 「殴りに行く意味」が無くなる。闘気解放で攻防を同時に得る形にした |
| 接敵するまで無力 | 通常敵ノックバック・接敵軽減・オート移動の接近戦略で「近づく過程」も機能させた |
| 常時吸血 / 敵数比例の無限回復 | 撃破回復は passive「血気」を取ったときだけ・**毎秒上限つき**（`killHeal.perSecondCapPercent`） |
| 自傷で闘気を稼ぐ | 意図的に不採用（上記 3） |
| クリティカル率だけの個性 | クリティカルは既存の共通 modifier。戦士の個性は闘気・コンボ・体勢に置いた |
| スキルごとのコンボゲージ | コンボは**ジョブ全体で 1 本**。スキルを跨いで繋がる（`node tests/warrior-combo.mjs` §8） |
| 体勢崩しが氷砕のコピー | 別フィールド・別しきい値・別クールダウン。**氷砕は chase 中しか硬直させないが、体勢崩しは予告 / 突進も中断する**（下記 7） |

---

## 3. 闘気（fury）

`balance.json` の `warrior.fury` / `warrior.furyRelease` が唯一の数値源。実装は `WarriorCombatSystem`。

### 獲得源（6 種・telemetry のキーと 1:1）

| source | 契機 | 既定係数 |
|--------|------|----------|
| `meleeHit` | 近接命中 | `gainPerMeleeHit`（スキル側 `furyGain` で上書き可） |
| `kill` | 敵 / ボス撃破 | `gainPerKill` |
| `combo` | コンボが増えたとき | `gainPerComboStep` × 増加分 |
| `mitigated` | 強靱で軽減した量 | `gainPerMitigatedDamage` × 軽減量 |
| `damageTaken` | 実際に通ったダメージ | `gainPerDamageTaken` × ダメージ |
| `exposed` | ボス露出中の獲得増加分 | `poise.boss.exposedFuryGainMult` |

### 無限蓄積の防止（3 層）

1. **1 発動あたり**（`fury.maxGainPerCast`）— 同じ `castKey`（＝1 回の発動）内での加算合計。
   多段・多対象で青天井にならない。進化は `furyGain.maxPerCast` でさらに厳しくできる（`setCastLimits`）。
2. **1 秒あたり**（`fury.maxGainPerSecond`）— 雑魚 100 体を巻き込んでも一瞬で満タンにならない。
   `castKey` を持たない加算（撃破・被弾・DoT 経路）もここで守られる。
3. **解放中の減衰**（`fury.releaseGainMult`）— 解放中に稼いで即再解放するループを塞ぐ。

超過分は闘気にならず `telemetry.furyOvercap` に記録される（バランス調整の材料）。

### 闘気解放（furyRelease）

- 100 到達で**自動発動**（プレイヤー操作は不要・`startRelease()` は再入しない）。
- 効果: 近接ダメージ ×`meleeDamageMult` / 攻撃速度 ×`attackSpeedMult`（= クールダウン短縮）/
  被ダメージ軽減 `+damageReduction` / ノックバック ×`knockbackMult` / 体勢削り ×`poiseDamageMult`。
- **回復**: 「最大HPの `recovery.maxHpPercent`＋失った HP の `recovery.missingHpPercent`」を
  `recovery.durationMs` かけて**分割して**返す。一括全快しない。overheal 分は
  `telemetry.overhealPrevented` に落ちるだけで HP には乗らない。
- 終了時に闘気は 0 へ戻る（解放中に稼いだ分も含めて清算）。
- Job Lv50 で解放時間 +1000ms・回復量 +25%、Lv100 でさらに回復量 +20%。

---

## 4. コンボ（combo）

`balance.json` の `warrior.combo`。**ジョブ全体で 1 本**のカウンタで、スキルを跨いで繋がる。

- 近接命中で増える。**同一敵への短時間の多段は増えない**（`sameTargetWindowMs`）。
  1 発動あたりの増加も `maxGainPerCast` で頭打ち。
- 最後の命中から `graceMs` の間は減らない。猶予が切れると毎秒 `decayPerSec` で減衰し、0 で「途切れ」となる。
- **閾値 4 段**（10 / 25 / 50 / 100）でそれぞれ 攻撃速度 / 近接範囲 / 近接ダメージ / 体勢削り＋闘気獲得 が伸びる。
  閾値を跨いだ瞬間だけ 1 回イベントが出る（HUD 演出と telemetry）。
- passive「戦闘本能」で 猶予 ↑ / 減衰 ↓ / 攻撃速度 ↑ / 閾値効果 ↑。Job Lv40 で閾値効果 +20%。
- コンボの増加そのものが闘気を生む（`gainPerComboStep`）＝「殴り続ける」ことへの報酬。

---

## 5. 強靱（被ダメージ軽減）

`balance.json` の `warrior.mitigation`。`Player.takeDamage` → `BattleScene.onWarriorDamage` →
`WarriorCombatSystem.applyIncomingDamage` の 1 経路だけを通る。

| 要素 | 条件 |
|------|------|
| `engagedReduction` | 接敵中（`engagedRadius` 内に敵がいる） |
| `meleeCastReduction` | 近接発動から `meleeCastWindowMs` 以内 |
| `chargeReduction` | 突進斬りの突進中 |
| `furyRelease.damageReduction` | 闘気解放中 |
| `unyielding.damageReduction` | 不屈の発動中 |
| `extra` | スキル由来の一時軽減（盾撃 `mitigationValue` / 不落の城壁 `mitigation.value`） |
| `damageReductionBonus` | Job Lv20 ＋ passive「重装」 |

合計は必ず **`maxTotalReduction`（0.70）でクランプ**する。**軽減 100%（永久無敵）は構造上作れない**
（`node tests/warrior-recovery.mjs` §7 が検証する）。
軽減した量と通った量の両方が闘気になるため、「殴られながら戦う」ことが資源になる。

戦士以外のジョブでは `WarriorCombatSystem.enabled = false` なので `applyIncomingDamage` は
入力をそのまま返し、`Player.takeDamage` の計算は M8-A 以前と 1 命令も変わらない。

---

## 6. 不屈（unyielding）— passive ではなく基礎能力

`balance.json` の `warrior.unyielding`。**戦士なら誰でも持っている基礎能力**で、passive 一覧には存在しない。
（進化「不落の城壁」`unyielding_fortress` は名前が似ているが別物＝盾撃の進化。）

- HP が `hpThreshold`（25%）を割ると自動発動。
- 効果: `damageReduction`（50%）の軽減 ＋ 最大HPの `healMaxHpPercent`（8%）を `durationMs` かけて分割回復。
- **クールダウン `cooldownMs`（45 秒）**。1 周回で何度も撃てない。
- 周回開始 `minRunTimeMs` 以内は発動しない（開始直後の事故防止）。HP 0（死亡後）にも発動しない。
- passive「重装」の `unyieldingPower` で軽減量・回復量が伸びる（ただし合計軽減は上限クランプ）。
- 不屈中に死亡した回数は `telemetry.deathsAfterUnyielding` に残る（強すぎ / 弱すぎの判断材料）。

---

## 7. 体勢崩し（poise）— 通常敵 / エリート / ボスで 3 段構え

`balance.json` の `warrior.poise`。**氷の frostbreak とは完全に独立**（別フィールド・別しきい値・別クールダウン・別演出）。

| 相手 | 挙動 |
|------|------|
| 通常敵 | 体勢ゲージを持たない。`knockback` で押し返すだけ |
| エリート | ノックバックが `knockbackReduction` だけ軽減され、その分が体勢へ変換される（`knockbackToPoise`）。しきい値到達で **stagger**（`staggerMs` の減速＋突進の中断）。直後は `immunityMs` の免疫がつく＝連続 stagger でハメられない |
| ボス | **ノックバックしない**。`poiseDamage` だけがゲージを溜め、しきい値到達で **体勢崩し（stance break）** |

### ボスの体勢崩しと frostbreak の違い

| | 氷砕（frostbreak・氷術師） | 体勢崩し（poise・戦士） |
|---|---|---|
| ゲージ | `boss._frostGauge`（`StatusEffectManager`） | `WarriorCombatSystem.bossPoise.gauge` |
| 溜め方 | 氷属性ヒットの `bossGaugeMult` | 近接の `poiseDamage` |
| 硬直 | `applyFrostStagger` — **chase 中のみ**（予告 / 突進は中断しない） | `applyPoiseStagger` — **予告 / 突進も中断して chase へ戻す** |
| 到達後 | `frostbreak_vulnerability`（氷ダメージ倍率） | `exposed`（近接ダメージ ＋ 闘気獲得の増加） |
| 難化 | しきい値固定 | 崩すたびに `thresholdGrowth`（×1.25）で上昇・`thresholdMaxMult`（×3）で頭打ち |

「近接で体勢を溜め切った対価としてボスの行動をキャンセルできる」ことが戦士の到達点であり、
frostbreak のコピーにならないよう**中断できる行動の範囲**で差をつけた。
崩し直後は `breakCooldownMs` があり、放置すると `poise.decayPerSec` でゲージが戻る。

---

## 8. active5 の役割

| id | 役割 | 判定形状 | 特徴 |
|----|------|----------|------|
| `great_cleave` 大薙ぎ | 主力・初期スキル | 前方 arc | 多段（Lv で 1→3 打撃）。Job Lv80 で +1 |
| `shield_bash` 盾撃 | 押し返し・崩し | 短い前方 arc | 最大級のノックバック＋体勢削り。発動直後に短い軽減。**体勢削りは 1 発動 1 対象 1 回** |
| `whirlwind_slash` 旋風斬り | 群れ処理 | 自分中心の全周・duration あり | 明確な稼働時間を持つ（常設化しない）。闘気解放中は tick が速くなる |
| `charge_slash` 突進斬り | 接近・回避 | 突進経路上（1 体 1 回） | 密集へ短距離ダッシュ。突進中は軽減。**ボス予告中はその方向へ踏み込まない** |
| `ground_slam` 地砕き | 体勢崩し | 自分中心の円 | 最大の体勢削り。闘気解放中（または Job Lv80）に二撃目 |

- すべて `echoPolicy` / `clonePolicy` = `forbidden`。残響・分身から**無料の近接攻撃が増えない**。
- すべて `serializeState` / `restoreState` でクールダウンを保存する（再読込で無料発動しない）。
- 遅延打撃（`delayedCall`）はすべて `_dead` ガードを持ち、破棄後に走らない。

## 9. evolution3 の役割

| 進化 | 基礎＋補助 | 何が変わるか |
|------|-----------|--------------|
| `thousand_blade_dance` 千刃乱舞 | `great_cleave` + `combat_instinct` Lv4 | 連続斬撃 5 段＋締めの全周斬り。1 発動 = 1 cast のまま。コンボ / 闘気は `maxPerCast` で頭打ち |
| `bloodstorm_whirlwind` 血戦旋風 | `whirlwind_slash` + `bloodlust` Lv4 | 回転中の撃破で duration が `perKillMs` ずつ延びる（`maxPerCastMs` / `maxKillExtendPerCast` / `maxSpinDurationMs` の 3 重上限） |
| `unyielding_fortress` 不落の城壁 | `shield_bash` + `heavy_armor` Lv4 | 打撃後に反撃構え。構え中の被弾で **1 構え 1 回だけ** 反撃。反撃は `recordCast` せず、闘気 / コンボも増やさない（`perCounter: 0`） |

進化が宣言した数値（`damage` / `area` / `knockback` / `poiseDamage` / `comboGain` / `furyGain` /
`projectileCount` / `mitigation` / `counterWindow` / `killExtend` / `safetyCaps`）は
**すべて実装から参照される**（`validate-data.mjs` の M8-B ブロックが未参照をエラーにする）。

---

## 10. 実装の置き場所

| 責務 | ファイル |
|------|----------|
| 闘気 / コンボ / 軽減 / 不屈 / 撃破回復 / 体勢 の**唯一の管理者** | `src/systems/WarriorCombatSystem.js`（Phaser 非依存・乱数なし） |
| 戦士スキルの共通土台（向き / 近接半径 / 打撃数 / castKey / CD 倍率） | `src/skills/WarriorSkillBase.js` |
| 近接判定の共通経路（arc 判定・対象上限・ダメージ・ノックバック・体勢・闘気） | `BattleScene.meleeStrike()` |
| 被弾の入口（軽減 → 反応スキル通知） | `Player.takeDamage` → `BattleScene.onWarriorDamage` / `onWarriorHit` |
| Job Lv / passive → 倍率の流し込み | `BattleScene._refreshWarriorMods()`（1 か所だけ） |
| HUD（闘気 / コンボ / 不屈 / ボス体勢） | `src/ui/WarriorHud.js`（純ロジック `warriorHudState` ＋ 表示層） |
| オート移動（戦士 strategy） | `BattleScene.computeWarriorAutoMove()`（既存の `computeAutoMove` は不変） |
| 保存 | `BattleManager.buildRunSnapshot().warriorState` ↔ `BattleScene.restoreFromRun()` |

**スキルクラスは `scene.profile` や Scene の内部状態へ直接触らない。**
必ず `this.warrior`（＝`WarriorCombatSystem`）と `scene.combat.meleeStrike` を通す
（`node tests/warrior-draft-determinism.mjs` §6 が機械的に検証する）。

---

## 11. 決定論と保存

- 戦士のロジックに乱数は 1 か所も無い。すべて命中・撃破・時間で決まる。
  `Math.random` を差し替えても結果が変わらないことをテストで確認している。
- `warriorState` は `active_run` へ追加保存する。**`save_version` は v6 のまま**（加算的変更・移行不要）。
  旧セーブ（`warriorState` なし）や他ジョブのセーブでも壊れない。
- 復元では**闘気・コンボ・不屈CD・ボス体勢ゲージ・崩し回数・しきい値倍率**を引き継ぐ
  ＝ 再読込で初期化して稼ぐことができない。
- 一方、**cast 予算と同一敵の記録は復元しない**（死んだ敵オブジェクトを保持しないため）。
  毎秒窓は復元時刻で開き直す。これは意図的な設計で、`docs/save-format.md` に明記している。

---

## 12. 検証

| テスト | 内容 |
|--------|------|
| `warrior-catalog` | active5 / passive4 / evolution3・データ完全性・クラス登録 |
| `warrior-pool-eligibility` | 3 ジョブのプール分離・混入 0 |
| `warrior-draft-determinism` | 同 seed の候補列一致・Lv8/Lv4 到達性・進化到達率 |
| `warrior-fury` | 獲得源・3 層の上限・解放・減衰 |
| `warrior-combo` | 増減・閾値・同一敵水増し防止・ジョブ 1 本 |
| `warrior-recovery` | 分割回復・overheal 防止・撃破回復の毎秒上限・軽減クランプ |
| `warrior-unyielding` | しきい値・CD・分割回復・重装強化 |
| `warrior-poise` | 通常 / エリート / ボスの 3 段・frostbreak との独立・しきい値上昇 |
| `warrior-active-skills` | 5 種の実動作・遠距離に飛ばない・cast 水増し防止 |
| `warrior-evolutions` | 3 種の実動作・safetyCaps の参照・反撃 1 回 |
| `warrior-job-level` | 到達報酬 11 段・Lv80 対象・単調性・火/氷の非回帰 |
| `warrior-runtime-save` | serialize/restore・CD 保存・旧セーブ耐性 |
| `warrior-save-determinism` | 同一入力の完全一致・保存復元後の続行一致 |
| `warrior-quality-cap` | 13 cap の単調性・参照・low でも止まらない |
| `warrior-cleanup` | destroy・遅延処理の停止・Map の上限 |
| `warrior-telemetry` | telemetry キーの 1:1・HUD 表示状態・外部送信なし |
| `three-job-nonregression` | **火/氷の候補列・ランタイム・保存キーのハッシュ固定** |

実ブラウザでの確認手順は `docs/test-guide.md` の Milestone 8-B 節。

---

## Milestone 8-C: Wave1 で足した 4 つの機構

M8-B の設計思想（**近接だけ・共通経路だけ・上限は必ず data 側**）はそのまま維持し、
active10 / 進化5 を足すために次の 4 機構を追加した。いずれも `WarriorCombatSystem` へ集約している。

### 1. 処刑（execute）

**避けた設計**: 「HP が X% 以下なら即死」を各スキルが自前で書く形。
死亡イベントが二重に走る／撃破回復が二重に入る／ボスへ効いてしまう事故が起きやすい。

**採った設計**: 可否判定を `executePolicy(target, params)` に一元化し、
実際の kill は `BattleScene.executeTarget()` が**残り HP ぴったりのダメージ**を
通常の `dealDamage` 経路へ流す。即死用の別 API は作らない。

- 通常敵のみ処刑可。エリート / ボスは `allowElite` / `allowBoss` が既定で false なので**絶対に処刑されない**。
- エリート / ボスへの効果は「失った HP に比例する追加ダメージ」だけ。ボスは `bossMissingHpCap` で頭打ち。
- `maxExecutesPerSecond` で 1 秒あたりの処刑数を制限し、無限処刑・無限回復を作らない。
- 1 発動あたりの処刑数は品質別 cap（`maxExecutesPerCast`）でも抑える。

### 2. 反撃の調停（counter arbitration）

**避けた設計**: 各スキルが被弾フックを個別に持ち、それぞれが反撃する形。
反撃を 3 つ持つと 1 被弾で 3 回反撃してしまい、さらに反撃が反撃を呼ぶ再帰が起きうる。

**採った設計**: スキルは「構え（counter window）」を `beginCounterWindow()` で登録するだけ。
**誰が反撃するか**は `consumeCounterEvent()` が優先度で 1 系統だけ選ぶ。

- 優先度は `balance.json` の `warrior.counter.priority` に集約
  （`adamant_counter` 3 > `unyielding_fortress` 2 > `counter_stance` 1）。
- `globalCooldownMs` があるので、連続被弾でも反撃が無限に出ない。
- `BattleScene._inWarriorCounter` の再入ガードで counter → counter の再帰が起きない。
- 軽減は**合算せず最大値**を採り、既存の `maxTotalReduction`（70%）で必ずクランプされる。
- **不屈（基礎能力）は反撃系統ではない**。生存能力なので構え枠を占有せず、
  反撃系統として登録するのは進化「不落の城壁」だけ。

### 3. 一時バフ（戦吼）

**避けた設計**: `status-effects.json` へ新しい formal status を足す形。
火 / 氷の状態異常システム（表示・索引・RNG・保存）へ波及し、非回帰条件を壊す。

**採った設計**: `WarriorCombatSystem` 上の timed buff として持つ。共通状態異常は 5 種のまま。

- **重ねがけしない**（`stack: 'refresh'` = 上書き更新）。連打しても持続と強度は上書きされるだけ。
- 強度・持続は `balance.json` の `warrior.warCry.max*` で必ずクランプされる。
- 他ジョブでは `WarriorCombatSystem.enabled = false` なので、そもそもバフが付かない。
- 軍神咆哮の `graceRefill` は**コンボ猶予だけ**を戻す。コンボ値そのものは無料で配らない
  （「殴らずにコンボ閾値へ到達する」経路を作らないため）。

### 4. 引き寄せ / 接近

**避けた設計**: スキルが敵やプレイヤーの座標を直接書き換える形。
`SpatialGrid` の更新漏れ・壁抜け・テレポート・ノックバック慣性の残留が起きる。

**採った設計**: `pullTarget()` / `movePlayerTowards()` を `BattleScene` に置き、スキルは呼ぶだけ。

- **ボスは引き寄せられない**（`bossPullDistance` = 0）。押し引きでハメられないための固定仕様で、
  代わりにこちらが `playerApproachBoss` ぶんだけ踏み込む。
- エリートは引き寄せ距離が大幅に短い（data 側で指定）。
- 壁内へクランプ・NaN を作らない・`enemyGrid.update()` を必ず呼ぶ・引き寄せ直後の慣性を 0 にする。
- 移動は数フレームに分けるのでテレポートしない。距離と時間の**両方**で必ず終わる。
- ボスの予告 / 突進中はその真正面へ踏み込まない（`bossTelegraphing()`）。完全無視もしない。

---

## M8-C で意図的に避けたもの

| 避けたもの | 理由 |
|-----------|------|
| 遠距離の斬撃波 | 「近接専用」という戦士の輪郭が消える。M8-B から一貫して弾を作らない |
| 割合即死 API | 死亡イベント・撃破統計・撃破回復の二重処理を招く |
| エリート / ボスの処刑 | 難易度設計が崩れる。欠損 HP 参照の追加ダメージで代替した |
| 反撃の重ねがけ | 1 被弾で複数反撃 → 実質無敵になる |
| 戦吼の formal status 化 | 火 / 氷の状態異常システムへ波及し非回帰条件を壊す |
| コンボ値の直接付与 | 「殴らずに閾値へ到達する」経路を作らない（猶予だけ戻す） |
| 跳躍中の無敵 | 軽減の合計は必ず 70% でクランプされる。0 ダメージを作らない |
| ボスの引き寄せ | 押し引きでハメられる。こちらが近づく形に置き換えた |
| 敵オブジェクトの保存 | プール再利用で別の敵を掴む。安定 runtime id（`_seq`）だけを持つ |
| 補助 active の置換 | 天墜崩撃の地砕きは残す。CD にも触らず無料発動もしない |

設計メモの全体は `./warrior-wave1.md`、スキル横断の一覧は `./warrior-skill-matrix.md`。
