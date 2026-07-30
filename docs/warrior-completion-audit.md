# 戦士 完成監査（Milestone 8-F）

M8-E で戦士のカタログが **active 30 / passive 4 / evolution 18（合計 52）** に到達し、
火の魔女（M8-A）・氷術師（M7-E）と同規模になった。M8-F はその**完成監査**で、
**新しいスキル / passive / 進化 / ジョブは 1 件も追加していない**。

- 対象ジョブ: `warrior` のみ。火の魔女・氷術師は**完全に非回帰**（ハッシュで保証）。
- `save_version` は **6 のまま**（保存キーを 1 つも増やしていない）。
- 新しい npm 依存・ビルド工程・外部通信はなし。
- 実ブラウザでの確認は**未実施**（`docs/test-guide.md` の M8-F 項目）。

---

## 1. 監査した 12 観点と結果

| 観点 | 結果 |
|------|------|
| 完成カタログ（30 / 4 / 18 / 52） | ✅ 重複 0・未知クラス 0・JSON だけ / class だけ / docs だけ 0・orphan 0 |
| プール分離 | ✅ 3 ジョブのプールが互いに素・他ジョブ混入 0 |
| rarity / role / support | ✅ 3 段（common7 / uncommon13 / rare10）・legendary は進化が担う |
| 進化到達性（18 件） | ✅ 全件が条件形成 > 0・提示 > 0・取得 > 0 |
| production 抽選 simulation | ✅ 5 戦略 × 枠4/6/8 でしきい値をすべて満たす |
| SkillAudit（48 件） | ✅ 未解決 issue 0 |
| recordCast（48 件） | ✅ 1 主発動 = 1 記録・派生で増えない |
| cooldown 保存（48 件） | ✅ 全件往復・改ざん耐性を追加（**不備 1 件を修正**） |
| runtimeState（48 件） | ✅ 宣言と実使用が一致・オブジェクト参照 0 |
| 固有機構（闘気 / コンボ / 回復 / 不屈 / 防御 / 敵種別 / 移動） | ✅ 上限と解除条件がすべて効く（**不備 4 件を修正**） |
| cap / 死にフィールド | ✅ skillCaps 217 件すべて参照・死にフィールド 0（**不備 1 件を修正**） |
| telemetry / F8 / F9 | ✅ 1:1・dead key 0・外部送信なし・F10 不変 |

---

## 2. 見つけて直した不備（8 件）

優先度は `M8-F §25` の順（crash → save 破損 → プール漏れ → … → balance）。

| # | 優先度 | 不備 | 影響 | 修正 |
|---|--------|------|------|------|
| 1 | 2（save 破損 / reload 悪用） | 戦士 48 スキルの `restoreState({cdLeft})` が**負数 / NaN / ±Infinity / 桁外れをそのまま採用**していた | 改ざんされた保存で `_cd = NaN` になり、以後そのスキルが二度と撃てない（または常に撃てる）状態を作れた | `WarriorSkillBase` / `WarriorEvolvedBase` へ共通の `restoreCd()` を追加し、非有限値は採用せず有限値を ±`MAX_RESTORED_CD_MS`(120s) へクランプ。35 ファイルの生の代入をこれ 1 か所へ寄せた（**火 / 氷の restore は 1 行も変えていない**） |
| 2 | 2（reload 悪用） | 陣（`placeRallyField`）が**半径を上限クランプしていなかった** | 改ざんで半径 1e9 の陣を作れば「常に内側」＝永久バフになった | `balance.warrior.rally.maxRadius`(280) を追加してクランプ |
| 3 | 7（無限 / 永久状態） | 反撃窓（`beginCounterWindow` / 復元）が**持続と回数を上限クランプしていなかった** | 改ざんで「999 回・1e9ms」の反撃窓＝実質無限反撃を作れた | `balance.warrior.counter.maxCountersPerWindow`(6) / `maxWindowMs`(6000) を追加し、開始時と復元時の両方でクランプ |
| 4 | 7（無限 / 永久状態） | 旋風斬（`WhirlwindSlashSkill.restoreState`）が**回転の残り時間をクランプしていなかった** | 改ざんで永久に回り続ける（＝継続ダメージが止まらない）状態を作れた。血戦旋風も同じ経路 | data の `duration` で頭打ちにした（他の再開型 — 薙ぎ進軍・刃防陣 — は既にクランプ済み） |
| 5 | 8（敵種別 / 状態の誤処理） | **進化済みの基礎 active が空き枠へ「新規」候補として戻っていた**（200 seed 中 38 回） | 取得すると進化と基礎を**同時に所持**できた（`元activeと同時稼働しない` 違反） | 抽選コンテキストへ `evolvedBaseIds` を加算的に追加し、`SkillDraftManager._eligible` が除外する。未指定なら従来と完全に同じ挙動なので**火 / 氷の候補列ハッシュは不変** |
| 6 | 9（残留 / 死にデータ） | M8-B / M8-C の **21 スキルが `destroy()` 後も発動し続けた**（`_dead` ガードが無かった） | 進化置換・Scene 終了のあとに「墓場から」攻撃が飛ぶ余地があった | `WarriorSkillBase` / `WarriorEvolvedBase` の `update()` に破棄ガードを、`destroy()` に `_dead = true` を置いた（1 か所） |
| 7 | 9（残留） | 決闘マーカー（`Enemy._duelMark`）が**時間切れ / 再指定 / 解除で外れなかった** | 生きている敵に古いマーカーが残り続けた（`Enemy.reset()` まで消えない） | `BattleScene._setDuelMark` / `_clearDuelMark` でマーカーの寿命を 1 か所にまとめ、決闘が終わったフレームと Scene 終了で必ず外す |
| 8 | 13（balance・最小） | **`crimson_execution`（血断処刑）が base より弱かった**（群れの中で総ダメージ 69%） | `safetyCaps.maxTargetsPerStrike: 10` が base の実効的な breadth（品質上限 24 で実測 20）より狭く、**進化すると火力が下がる**逆転だった | 同 cap を **10 → 20** にした（依然として有界・品質上限以下）。18 進化のうち逆転はこの 1 件だけで、修正後は evo/base = 1.37 |

### あわせて直した data の死にフィールド（1 件）

| フィールド | 状態 | 対応 |
|-----------|------|------|
| `charge_slash.config.hitOncePerTarget` | data にあるがコメントでしか触れられておらず、挙動はハードコードだった | 実装から読むようにした（`false` を宣言すれば毎フレーム判定に切り替わる。現在の data は `true` なので挙動は不変） |

---

## 3. production 抽選 simulation の結果

`tests/warrior-draft-sim.mjs` が production の `SkillDraftManager` / `SeededRandom` /
`poolEligibility` / `SkillCatalog` / 実 rarity / 実 guidance / 実 pity / 実 synergy /
実 reroll・banish・skip をそのまま駆動する。**`Math.random` は 1 度も使わない。**

条件: 200 seed（`HEAVY=1` で 500）× 5 戦略 × 枠4 / 6 / 8（level-up 60 / 90 / 150）。

### 到達率（しきい値は M8-C.1 から 1 つも下げていない）

| 枠 | 戦略 | 平均 | 0 個 | ≥1 | ≥2 | ≥3 | 目標 |
|----|------|------|------|-----|-----|-----|------|
| 4 | evolution-first | 3.54 | 0.0% | 100% | 99.5% | 94.5% | ≥1 80% / 平均 1.0 / 0 個 ≤20% |
| 4 | balanced | 3.12 | 0.0% | 100% | 97.0% | 78.5% | 〃 |
| 4 | random-valid | 2.19 | 2.0% | 98.0% | 75.5% | 39.0% | 〃 |
| 4 | new-skill-priority | 2.21 | 2.0% | 98.0% | 75.5% | 41.5% | 〃 |
| 4 | one-build-focus | 3.55 | 0.0% | 100% | 100% | 92.5% | 〃 |
| 4 | 素朴（first-candidate）| 2.21 | 1.0% | 99.0% | 80.0% | 34.5% | 〃 |
| 6 | 5 戦略 | 3.37〜5.33 | 0.0% | 100% | 96.5〜100% | 78.5〜100% | ≥1 95% / ≥2 60% / 平均 1.7 |
| 8 | 5 戦略 | 4.51〜7.05 | 0.0% | 100% | 99.5〜100% | 96.5〜100% | ≥1 95% / ≥2 65% / 平均 1.8 |

### 健全性

| 指標 | 実測 |
|------|------|
| 提示 0 / 取得 0 の active | **0 件 / 0 件**（30 種すべて） |
| 取得 0 の passive | **0 件**（4 種すべて） |
| 条件形成 0 / 提示 0 / 取得 0 の進化 | **0 件 / 0 件 / 0 件**（18 種すべて） |
| 他ジョブ混入 / 候補の重複 / 枠違反 | **0 件** |
| 条件成立なのに進化候補が 1 つも出ない draft | **0 件** |
| 候補ゼロ | **すべて飽和由来**（所持がすべて上限＋残り進化なし）。**飽和以外は 0 件** |
| 最頻進化のシェア | **10.7%**（全戦略合算・目標 35% 以下） |
| build の種類 | 枠4 185〜199 / 200・枠6 198〜200 / 200・枠8 199〜200 / 200 |
| rarity の階層（1 種あたりの初回提示） | common 96.9 > uncommon 67.5 > rare 24.5 |

### 進化の取得数（全戦略合算 3000 run）

| 進化 | 条件形成 | 提示 | 取得 |
|------|---------|------|------|
| `mountain_hurl` | 80 | 80 | 80 |
| `heaven_crushing_descent` | 196 | 196 | 196 |
| `heaven_mirror_reversal` | 213 | 213 | 212 |
| `king_slayer_duel` | 353 | 353 | 353 |
| `war_god_roar` | 364 | 364 | 364 |
| （中略・12 件） | | | |
| `godspeed_impaler` | 1402 | 1402 | 1402 |
| `heaven_rending_ascent` | 1408 | 1408 | 1408 |

**条件が形成されたらほぼ必ず提示されている**（提示 / 形成 ≈ 100%）ので、
低い取得率は「提示の詰まり」ではなく「base を Lv8 まで伸ばせるか」に集約される。

### 低率 3 件の分析（均一化していない）

| 進化 | base（rarity）| 補助 | 枠4 / 6 / 8 | 低さの理由 |
|------|---------------|------|-------------|-----------|
| `mountain_hurl` | `battlefield_throw`(rare) | **active** `ground_slam` Lv6 | 21 / 25 / 34 | rare な base ＋ **active 補助で枠を 2 つ使う**（二重ハンデ） |
| `heaven_crushing_descent` | `leap_smash`(uncommon) | **active** `ground_slam` Lv6 | 43 / 59 / 94 | active 補助で枠を 2 つ使う |
| `heaven_mirror_reversal` | `weapon_deflection`(uncommon) | **active** `counter_stance` Lv4 | 39 / 71 / 104 | 同上（M8-E で Lv6 → Lv4 へ緩めた結果 0〜3 件 → 200 件超へ改善） |

いずれも **到達不能ではない**（HEAVY 500 seed でも取得 > 0）。
`active` 補助の 3 件は平均取得が passive 補助の 15 件より低く、**枠負担どおりの構造**になっている。
分布は最小 80 / 中央 814 / 最大 1408 と幅が残っており、**build に個性がある**（機械的な均一化をしていない）。

---

## 4. 48 スキルの監査結果

### SkillAudit（未解決 issue 0）

48 件すべてで確認した項目:
id / class / data / job / rarity / category / castMode / mainCastEvent /
`echoPolicy`・`clonePolicy` = `forbidden` / `canTriggerEcho`・`canBeCopiedByClone` = `false` /
runtimeState / serialize / restore / cooldown 保存 / damageTags（物理）/ recordCast /
PoolManager・SpatialGrid（全敵総当たり 0）/ 対象選択 / cleanup / telemetry / Job Lv80 / cap /
data フィールドの参照。

意図した仕様として note に残したもの:
- 一部のスキルが `isElite` / `isBoss` を**読む**（優先度・引き寄せ距離・表示の材料）。
  **可否そのものは共通経路**（`launchPolicy` / `grabPolicy` / `executePolicy` / `duelPriority` /
  `resolveLineMeleeTargets`）が決める。実測でもエリート / ボスは 1 度も浮かず・掴まれず・処刑されない。

### recordCast（1 主発動 = 1 記録）

- 48 件すべてで `cast > 0`。**スキル側は 1 度も `recordCast` を呼ばない**（基底 `update` が 1 回だけ記録する）。
- 主発動の回数を表す extra（`lunges` / `marches` / `windows` / `charges` / `trances` / `duels`）は
  **すべて cast と一致**。派生（`stomps` / `thrusts` / `deflected` / `stages` / `guardTicks` /
  `axeHits` / `penetrations` / `reflected` / `slashes`）は cast を超えても cast を増やさない。
- `Projectile` / `WarriorCombatSystem` からも `recordCast` を呼ばない（弾・反射弾・反撃で増えない）。
- 保存 → 復元だけでは cast が 1 も増えない。

### cooldown 保存

- 48 件すべてで 0 / 中間 / 最大付近の CD が往復する。
- CD が残っている間は 1 度も撃たず、CD を越えれば撃つ（実測）。
- 攻撃速度 / 修羅の構え / 闘気解放 / コンボ閾値の下でも `cdLeft` が有限。
- 改ざん値（NaN / ±Infinity / 文字列 / null / undefined / object / 配列 / boolean）は**採用されない**。
  桁外れ（±1e12）は ±120s へクランプ。通常の負数（発動できないフレームで少し負になる）はそのまま往復する。
- 進化置換の前後で CD が混ざらない。dt=0（一時停止）・可変 dt でも壊れない。

### runtimeState

- 48 件すべてが `serializeState` / `restoreState` を持ち、保存値は**すべて単純な値**。
- 座標 / 角度 / castKey / target / plan / hitSet は保存しない。
  敵・弾・Phaser の実体（scene / tween / graphics / timer / sprite）も保存しない。
- 10 回復元しても値が積み上がらない。旧セーブ（キー欠落）・巨大値でも例外にならない。
- **「残り時間ぶんだけ再開する」設計を選んでいるのは 10 件**
  （旋風斬 / 血戦旋風 / 薙ぎ進軍 / 刃防陣 / 反撃の構え / 迎撃の構え / 刃返し / 天鏡返し / 戦旗招集 / 血盟戦旗）。
  いずれも残り時間が data の上限で頭打ちになり、最初からやり直しにも二重化にもならない。

---

## 5. 固有機構の監査結果

### 闘気 / コンボ

- 獲得源 5 種（近接命中 / 撃破 / コンボ / 被弾 / 軽減）すべてが実測で動く。
- 1 発動あたり（`maxGainPerCast` 6）・1 秒あたり（`maxGainPerSecond` 16）の上限が効く。
- 100 到達で自動解放 → 各倍率が乗り → 時間で必ず終わる。解放中の獲得は ×0.15 へ減衰。
- 3 分相当の連続戦闘でも闘気は 0〜100 の範囲で有限、解放は 4 回程度、暴走しない。
- コンボはジョブ全体で 1 本。閾値 4 段（10 / 25 / 50 / 100）に到達し、猶予後に減衰して負にならない。
- 戦吼 / 陣 / 構えの猶予延長が**加算的に**乗る。

### 回復

- 闘気解放の回復は**一括全快しない**（予定量を時間で分割）。overheal しない。
- 撃破回復は**血気を取っているときだけ**効く。毎秒上限（最大 HP × 1.5%）で頭打ち。
- エリート ×3 / ボス ×8 の倍率が data どおり。
- 血盟戦旗 / 血染修羅の強化は**既存の毎秒上限を共有**したまま cap を少し上げるだけ（無限回復にならない）。
- ライフスティールも自傷も無い。命中では回復しない（撃破時のみ）。回復が回復を呼ばない。

### 不屈

- しきい値未満で 1 回だけ発動し、CD 45 秒。連続発動しない。HP0 では発動しない。
- **構えの軽減低下では無効化されない**。不屈 + 構えでも合計軽減は下限を割らず上限も超えない。
- 回復は一括全快せず、時間で入る。

### 防御（11 系統）

- 全部盛り（重装 + 解放 + 前面防御 + 反撃窓 + 陣 + 突進 + 不屈）でも合計軽減は **70% で頭打ち**。
  被ダメージが 0 にならない（最低 30% は通る）。
- 構えの penalty は**最後に引かれ**、下限 0% を割らない。重装ぶんを削り取らない。
- 前面防御は**方向の分かる被弾だけ**（前 > 横 ×0.35 > 後ろ ×0・方向なしは 0）。
- **1 イベント = 最大 1 反応系統**。近接被弾は優先度の高い反撃だけ、弾イベントは弾き返しだけを消費する。
  連続被弾でも全体 CD で頭打ち。
- 反撃 → 反撃 / 弾き返し → 弾き返しの再帰なし。反射弾は世代 1 で止まる。
- 弾けるのは allowlist（`bossBullet` / `bullet`）だけ。denylist（`beam` / `telegraph` / `hazard` /
  `dot` / `ground`）・味方弾・消えた弾は弾けない。
- save / reload で窓を使い回せない（使用済み回数を引き継ぐ）。

### 敵種別

| 種別 | 効くもの | 効かないもの |
|------|---------|-------------|
| 通常敵 | ノックバック / 打ち上げ / 掴み / 投げ / 処刑 / 引き寄せ | 体勢ゲージ（持たない） |
| エリート | stagger（しきい値）＋免疫 / 体勢削り / 決闘優先度 中 | 打ち上げ・掴み・処刑（すべて拒否され体勢へ変換） |
| ボス | stance break → exposed / しきい値 ×1.25（上限 ×3）/ 決闘優先度 最上位 | 打ち上げ・掴み・処刑・引き寄せ |

- 露出は時間で必ず終わる（永久拘束なし）。露出時間は周回の 50% 以下。
- 全 30 active を同時に持って 40 秒回しても、敵の座標が有限・場外へ出ない・無限に浮かない・
  同時に掴んでいるのは 1 体以下・決闘マーカーは 1 体以下。
- 体勢は氷砕とは**別フィールド・別しきい値**。`WarriorCombatSystem` の実コードは氷の状態へ触らない。

### 移動（17 スキル）

- 壁際 / 隅 / 敵全滅 / ボス予兆 / 可変 dt / 2 倍速 / 全品質で例外なし・座標が有限・画面内。
- 1 フレームの移動量が 200px 未満（テレポート化しない）。
- 保存に座標を含めない。復元だけでは 1px も動かない。
- `movePlayerTowards` が壁内クランプと NaN ガードを 1 か所で持つ。

---

## 6. 性能（Node 純ロジック）

条件: 敵 80 + エリート 20 + ボス 1・敵弾多数・**active 30 種すべて Lv8**・
32ms ステップ（2 倍速）× 18750 = **10 分相当**。

| 品質 | 処理時間 | 1 フレーム最大打撃 | 上限 | 平均 | 反射弾 | 弾いた id 集合 | 反撃窓 |
|------|---------|------------------|------|------|--------|--------------|--------|
| low | 2.4s | 238 | 360 | 11.3 | 4 | 0 | 0 |
| medium | 2.5s | 335 | 540 | 15.5 | 5 | 0 | 1 |
| high | 2.6s | 424 | 720 | 19.3 | 6 | 0 | 1 |
| ultra | 3.0s | 534 | 960 | 25.3 | 8 | 0 | 1 |

- 3000 → 12000 フレームでも反射弾 / 弾いた id 集合 / 反撃窓 / 同一敵ヒット記録 / cast 予算がすべて有界。
- **品質は「1 打撃で同時に処理する敵の数」を絞る**。1 命中あたりのダメージ・上限の階層・
  弾ける種別の判定は品質で変わらない。
  そのぶん低品質ではコンボの伸びがわずかに遅く、`great_cleave` の発動回数が 58 → 59 と 1 だけ前後する
  （M8-B から 3 ジョブ共通の設計上の帰結。M8-F で新たに生じたものではない）。
- **実ブラウザの FPS / メモリは未計測。**

---

## 7. バランスの分布（構造的な異常の有無）

条件: 敵 30 + エリート 6 + ボス・active 30 種 Lv8・32ms × 9000（`HEAVY=1` で 18000）。

| 指標 | 実測 |
|------|------|
| ダメージまたは utility を出さない active | **0 件**（`weapon_deflection` はダメージ 0 だが弾き 390 発・反射 6 発の防御スキル。`chain_hook` は引き寄せ 83 回、`breaker_knee` は体勢削り 329 回） |
| 最大ダメージシェア | **13.6%**（`great_cleave`・目標 35% 以下） |
| 進化 18 件が base より弱い（evo/base < 0.9） | **0 件**（最小 1.07 = `blood_oath_standard`・最大 6.14 = `heaven_rending_ascent`。修正前は `crimson_execution` が **0.69**） |
| 進化が全部盛りでシェア 45% 超 | **0 件**（最大 20.6% = `thousand_blade_dance`） |
| 永久状態（構え / 決闘 / 窓 / 陣 / 解放 / 露出 / 掴み / 反撃窓） | **0 件**（64s 進めてもすべて 0 に戻る） |
| 無限回復 / overheal / 自傷経路 | **なし**（実装に `hp -=` / `selfDamage` / `hpCost` が存在しない・低 HP 倍率は上限 2.0 以内） |
| ボスの永久拘束 | **なし**（崩し 39 回 / 露出合計 118.9s / しきい値 ×3.00 で頭打ち＝露出が連続しない） |
| 通常敵の場外流出 / 無限滞空 | **なし**（場外へ出た敵 0 体） |
| 弾き返しの完全無効化 | **なし**（検知 202,414 / 弾き **390 = 0.2%** / 反射 6） |
| 闘気解放の常時化 | **なし**（24 回 / 稼働率 **41.9%**） |
| 最終Wave 5 種の合計シェア | **11.7%**（既存 25 種 88.3%＝全ハズレにならない） |

30 active 全件の分布表と 18 進化全件の evo/base は `./warrior-completion-balance.md` §1〜§2。

---

## 8. 非回帰（火の魔女 / 氷術師）

| 指標 | 結果 |
|------|------|
| 候補列 300 seed（火 / 氷） | SHA-256 が M8-A 完了時点（`ec503fe`）と**完全一致** |
| 48 スキルのランタイム（火 / 氷） | SHA-256 が**完全一致** |
| 共通状態異常 | **5 種のまま** |
| `save_version` | **6 のまま** |
| 火 / 氷の restore 経路 | **1 行も変えていない**（`restoreCd` は戦士の基底だけ・`SkillBase` には足していない） |
| `_dead` ガード | 戦士の基底だけ（`SkillBase` には足していない） |
| `evolvedBaseIds` | 未指定なら従来と完全に同じ候補（火 / 氷で明示的に確認） |
| guidance | **値を 1 つも変えていない**（M8-E の 10 キーが固定値検査を通る） |
| 火 / 氷が使う skillCaps | 形（4 段階・正数・単調性）が保たれている |
| 火 / 氷の周回での戦士機構 | 全 API が `null` / `0` を返し、テレメトリも全 0 |

---

## 9. M8-F で変えた data（3 キー追加 ＋ 1 値変更）

```jsonc
// balance.json → warrior
"rally":   { ..., "maxRadius": 280 },                         // 追加（改ざんで永久バフを作らせない）
"counter": { ..., "maxCountersPerWindow": 6, "maxWindowMs": 6000 },  // 追加（無限反撃を作らせない）

// skill-evolutions.json → crimson_execution
"safetyCaps": { ..., "maxTargetsPerStrike": 20 }              // 10 → 20（base より弱い逆転の解消）
```

**火 / 氷の data は 1 バイトも変えていない。** guidance / rarityWeights / synergy / pity も不変。

---

## 9.5. あわせて直した docs の誤記（ゲーム実装には無関係）

M8-F の指示に従って M8-E のドキュメントを実ファイルで突き合わせ、次の 3 件の誤記を直した。
いずれも**コードにも data にも影響しない docs だけの修正**。

| 文書 | 誤記 | 実際 |
|------|------|------|
| `docs/project-state.md` の「Fixed critical bugs」表 | M8-E の行が **4 件**（#16〜19）しか無く、`WARRIOR_DEFAULTS` に最終Wave のブロックが無くて `beginPiercingLunge` が例外を投げた不備が抜けていた（同ファイル内の「M8-E で見つけて直した既存の不備」表と `TODO.md` は正しく 5 件を載せていた） | **5 件**。抜けていた 1 件を #20 として追加し、表と報告・TODO の件数を一致させた |
| `docs/skill-catalog.md` | 「進化を持たない active は 11 種」 | **12 種**（`charge_slash` `ground_slam` `twin_fang_slash` `sweeping_advance` `chain_hook` `shockwave_stomp` `relentless_combo` `triple_crush` `blade_guard` `berserker_rush` `war_axe_throw` `breaker_knee`）。id を明記する形へ直した |
| `docs/warrior-skill-matrix.md` | 「4 passive はいずれも 4〜5 件を担当」 | `combat_instinct` 4 / `bloodlust` 4 / `heavy_armor` 4 / `brute_force` **3**。件数を明記する形へ直した |

`docs/project-state.md` の M8-E 行の番号は既存の #16〜19 を動かさず #20 を追記した
（既に他の文書から番号で参照されているため、振り直さない）。

---

## 10. テスト（23 スイート追加・全 185 通過）

| 観点 | スイート | アサーション |
|------|----------|-------------|
| カタログ | `warrior-completion-catalog` | 425 |
| 抽選 | `warrior-completion-draft` | 328 |
| 進化到達性 | `warrior-completion-evolutions` | 404 |
| 低取得率の構造分析 | `warrior-completion-low-rate` | 110 |
| SkillAudit | `warrior-completion-skill-audit` | 1746 |
| recordCast | `warrior-completion-record-cast` | 269 |
| cooldown 保存 | `warrior-completion-cooldown-save` | 2012 |
| runtimeState | `warrior-completion-runtime-state` | 1733 |
| 闘気 / コンボ | `warrior-completion-fury-combo` | 51 |
| 回復 | `warrior-completion-recovery` | 33 |
| 防御 | `warrior-completion-defense` | 51 |
| 敵種別 | `warrior-completion-enemy-types` | 198 |
| 移動 | `warrior-completion-movement` | 447 |
| 投擲 / 陣 | `warrior-completion-projectile-field` | 198 |
| Job Lv / passive | `warrior-completion-job-passive` | 258 |
| telemetry | `warrior-completion-telemetry` | 208 |
| F8 / F9 / F10 | `warrior-completion-debug-panels` | 90 |
| 性能 | `warrior-completion-performance` | 137 |
| cap / 死にフィールド | `warrior-completion-caps-fields` | 1513 |
| セーブ | `warrior-completion-save` | 217 |
| 決定性 | `warrior-completion-determinism` | 283 |
| バランス | `warrior-completion-balance` | 260 |
| 3 ジョブ非回帰 | `three-job-completion-nonregression` | 354 |

- **全 185 スイート通過・失敗 0**（`validate.yml` のステップ数は `validate-data` を含めて **186**）。
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**（M8-F ブロック 16 節を追加）。
- いずれも **regex だけでなく production の class / prototype / manager を直接駆動する実測**で、
  M8-F の修正を巻き戻すと落ちる:

| 巻き戻すと落ちるもの | 落ちるスイート |
|---------------------|----------------|
| `restoreCd()` を生の代入へ戻す | `warrior-completion-cooldown-save`（改ざん節） |
| `evolvedBaseIds` の除外を外す | `warrior-completion-draft`（進化済み基礎の再提示） |
| `_dead` ガードを外す | `warrior-completion-runtime-state`（破棄後の発動） |
| 旋風の復元クランプを外す | `warrior-completion-save`（改ざん節） |
| `rally.maxRadius` を外す | `warrior-completion-projectile-field` |
| `counter.maxCountersPerWindow` / `maxWindowMs` を外す | `warrior-completion-defense` |
| `crimson_execution` の cap を 10 へ戻す | `warrior-completion-balance`（evo/base ≥ 0.9） |
| `hitOncePerTarget` の接続を外す | `warrior-completion-caps-fields`（死にフィールド 0） |
| 決闘マーカーの寿命管理を外す | `warrior-completion-enemy-types`（残留 0） |

- 更新した既存のもの: `tests/warrior-draft-sim.mjs`（候補ゼロを `saturatedNone` /
  `unsaturatedNone` に分解・飽和判定を進化込みの実上限へ・`evolvedBaseIds` を渡す）/
  `tests/warrior-common.mjs`（`_duelMarkSeq` / `setDuelMark` / `clearDuelMark` / `cleanupWarrior` を
  production と同じ形で追加）/ `tests/validate-data.mjs`（M8-F ブロック）/
  `.github/workflows/validate.yml`（23 ステップ追加・計 186）。

---

## 11. 残っている警告と既知の制約

`validate-data` は **0 エラー / 0 警告**。以下は完成監査の warning ではなく、
理由を記録して**意図的に残している**もの。

| 項目 | 内容 | 理由 |
|------|------|------|
| `tranceOffenseCapped` が実プレイで 0 | 修羅の構えの合成上限に届くカウンタ | 出荷 data では「解放中でも構えの上限ぶんの余地が残る」ので届かない。安全弁として残し、上限が効く config でテストしている |
| `mountain_hurl` の取得率が最下位 | 全戦略合算 3000 run で 80 件 | rare な base ＋ active 補助の二重ハンデ。**到達不能ではない**（設計どおりの代償） |
| `counter_stance` が自身の進化を持ちつつ補助も兼ねる | M8-C.1 の不変条件を M8-E で意図的に緩めた箇所 | 天鏡返しは構えを置換せず CD にも触らないので `adamant_counter` への道は塞がれない |
| 品質で `great_cleave` の発動回数が 1 前後する | 低品質では 1 打撃の対象数が減り、コンボの伸びがわずかに遅い | M8-B から 3 ジョブ共通の帰結。1 命中あたりのダメージと判定規則は不変 |
| 既存の `FROST_*` completion warning 5 件 | 氷術師 M7-E からの既知項目 | M8-F では触っていない（`docs/frost-balance-report.md`） |

---

## 12. 実ブラウザ未確認

**M8-F は Node 純ロジック＋最小モックでの検証だけ。** 以下は未確認。

- 全 48 スキルの実描画・決闘マーカーの視認性・構えのリスクの体感
- 実 FPS / メモリ（敵 100・敵弾多数・2 倍速・10 分・全品質）
- JS エラーの有無
- 保存 / 復元をブラウザで行ったときの挙動

手順は `docs/test-guide.md` の **Milestone 8-F** 節にある。

---

## 13. 次の Milestone 候補

3 ジョブすべてのカタログ（各 30 / 4 / 18）と完成監査（氷 M7-E / 火 M8-A / 戦士 M8-F）が揃ったので、
次はジョブ単体の作業ではない選択肢が中心。

1. **3 ジョブ横断の総合監査** — 個別監査は 3 ジョブとも完了した。次はジョブ間の比較
   （同規模なのに体験が違うか）・共通機構の重複（3 ジョブで似た処理が別実装になっていないか）・
   共有 cap / balance キーの整合・3 ジョブ同時の性能を見る回。
2. **火と氷の属性反応**（炎上⇄冷気 / 凍結の相互作用）
3. **転生レガシー / ジョブ間継承**（`futureInheritanceSettings` / `extraAllowedIds` が拡張口）
4. **周回長の拡張**（10 分 / 15 分 / 無限モード）・**追加の敵 / ボス / 難易度**
5. **4 人目のジョブ** — 3 ジョブぶんの基盤・監査観点・テスト雛形がそろっている
6. **実ブラウザでの M7-E 〜 M8-F 手動確認**（コード変更を伴わない検証タスク）

関連文書: `./warrior-completion-matrix.md`（48 スキルの一覧表）/
`./warrior-completion-balance.md`（バランス分布の詳細）/ `./warrior-design.md` /
`./warrior-final-wave.md` / `./skill-catalog.md`
