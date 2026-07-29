# 戦士スキル拡張 Wave2（Milestone 8-D）設計メモ

M8-C（Wave1）で **active 5 → 15 / 進化 3 → 8** にした上へ、さらに
**active 15 → 25・進化 8 → 13** を積んだ回。passive は 4 種のまま増やしていない。

- 対象ジョブ: `warrior`（`element: physical`）のみ。火の魔女・氷術師は完全に非回帰。
- `save_version` は **6 のまま**（追加フィールドのみ・移行不要）。
- 新しい formal status は 1 つも増やしていない（共通状態異常は 5 種のまま）。
- 新しい npm 依存・ビルド工程・外部通信はなし。
- Job Lv80「打撃数 +1」の対象は **6 種のまま**（Wave2 の 15 種はすべて対象外）。

---

## 1. 何を足したか

### active10

| id | 名称 | rarity | 役割（設計上の担当） | 主な制約 |
|----|------|--------|----------------------|----------|
| `rising_slash` | 昇竜斬 | common | 前方の狭い斬り上げ。通常敵を短く止める | **通常敵だけ**打ち上げる。エリート / ボスは体勢へ変換。同一敵は 1 発動 1 回・免疫あり |
| `shield_charge` | 鉄壁突進 | uncommon | 前面防御つきの中距離突進 | 強く守れるのは**前方だけ**。側面は弱く背面はほぼ守れない。終点衝撃は 1 発動 1 回 |
| `backstep_riposte` | 燕返し | uncommon | 後退 → 踏み込みの斬り返し | 後退中は軽減だが**無敵ではない**。反撃の調停とは別系統。相手を追い越さない |
| `battlefield_throw` | 豪腕投げ | rare | 通常敵を掴んで密集地点へ投げる制圧 | 掴めるのは**通常敵だけ**。エリートはその場叩きつけ、ボスは体勢打撃へ置換 |
| `triple_crush` | 三段砕き | common | 三段の打撃コンボ。最終段が本命 | 1 発動 = 1 cast。コンボ閾値で最終段だけ伸びる |
| `blade_guard` | 刃防陣 | uncommon | 能動防御＋ごく近距離の周期斬り | **反撃ではない**。弾を完全無効化しない。旋風斬より狭く低火力 |
| `berserker_rush` | 狂戦猛進 | rare | 低 HP ほど重い連続踏み込み | **自傷せず処刑もしない**。倍率は必ず頭打ち。近距離だけを見て向き直る |
| `war_axe_throw` | 戦斧投擲 | uncommon | 往復する短距離の投擲 | **近接倍率が乗らない**（`thrown`）。同一敵へは行き / 帰りで最大 2 回。画面端まで飛ばない |
| `breaker_knee` | 破城膝撃 | common | 超近距離の単体・体勢特化 | 兜割りより CD と射程が短く体勢削りが高い。わずかに外れたときだけ踏み込む |
| `rallying_banner` | 戦旗招集 | rare | その場へ短時間の陣（自己バフ） | 陣は**常に 1 つ**。効果は**内側にいるときだけ**。他ジョブでは張れない |

### evolution5

| 進化 id | 名称 | 基礎 | 補助 | 特徴 |
|---------|------|------|------|------|
| `heaven_rending_ascent` | 天衝断空 | `rising_slash` | `brute_force` Lv4 | 二段の斬り上げ。打ち上げは一段目だけ、二段目で叩き落とす |
| `fortress_rampage` | 城塞蹂躙 | `shield_charge` | `heavy_armor` Lv4 | 突進が長く終点衝撃が広い。前面軽減も強い（上限は 55%） |
| `shadow_swallow_riposte` | 無影燕返 | `backstep_riposte` | `combat_instinct` Lv4 | 二度差し返す。二段目だけ近距離 retarget 可。コンボは**猶予だけ**戻す |
| `mountain_hurl` | 山岳投擲 | `battlefield_throw` | **active** `ground_slam` Lv6 | 着地点に巨大衝撃。エリートは叩きつけ＋追撃。**地砕きは置換されず CD も変わらない** |
| `blood_oath_standard` | 血盟戦旗 | `rallying_banner` | `bloodlust` Lv4 | 陣の内側で倒したときだけ血気の回復が小幅に伸びる。秒間 cap は外さない |

---

## 2. 共通機構は WarriorCombatSystem に集約した

BattleScene へスキルごとの状態を散らさない、という M8-B からの方針を守っている。
Wave2 で足したのは次の 5 つで、**すべて data（`balance.json` の `warrior`）で頭打ちになる**。

| 機構 | API | data の上限 | 誰が使うか |
|------|-----|-------------|-----------|
| 打ち上げ | `launchPolicy` / `launchDurationMs` / `launchImmuneMs` | `launch` | 昇竜斬・天衝断空 |
| 前面防御 | `beginFrontGuard` / `updateFrontGuardFacing` / `frontGuardMitigation` / `endFrontGuard` | `frontalGuard` | 鉄壁突進・城塞蹂躙 |
| 掴み / 投げ | `grabPolicy` / `beginGrab` / `endGrab` / `noteThrowImpact` | `grab` | 豪腕投げ・山岳投擲 |
| 戦旗の陣 | `placeRallyField` / `updateRallyPosition` / `rallyBonus` / `clearRallyField` | `rally` | 戦旗招集・血盟戦旗 |
| 低 HP スケーリング | `lowHpDamageMultiplier` | `lowHp` | 狂戦猛進 |

### 打ち上げ（launch）

```
launchPolicy(target):
  エリート / ボス（allowElite / allowBoss が false）
      → 浮かせない。poiseDamage × poiseConversion を体勢削りへ加算して返す
  直前に浮かせた相手（_launchImmuneUntil）→ 浮かせない
  それ以外 → 浮かせる（滞空は maxAirborneMs で頭打ち）
```

- 浮いている間は `Enemy.update` の移動が止まる（`_airborneUntil`）。
- 残留（`_airborneUntil` / `_launchImmuneUntil` / `_launchHeight`）は
  `Enemy.reset()` と `onEnemyRemoved()` の**両方**が必ず 0 に戻す。
- 同一敵を 1 発動につき何回浮かせられるかは、`meleeStrike` の
  `launch.counts`（`_seq` → 回数の Map）と `launch.maxPerTarget` で決まる。敵参照は持たない。

### 前面防御（frontalGuard）

```
frontGuardMitigation(ctx):
  方向が分からない（fromX/fromY が無い）→ 0    ※requireDirection: true
  前方（|角度差| ≤ arc/2）→ mitigation
  側面                    → mitigation × sideMultiplier
  背面                    → mitigation × backMultiplier（既定 0）
```

`mitigation` は `maxFrontalMitigation`（0.55）でクランプされ、
さらに既存の合計軽減上限（`mitigation.maxTotalReduction` = 0.70）が必ず効く。**無敵にはならない。**

**火 / 氷が非回帰である理由**: `Player.takeDamage(amount, from)` の第 2 引数は任意で、
火 / 氷の被弾経路は `from` を渡さない。`requireDirection: true` なので前面軽減は常に 0 になり、
被弾計算は 1 バイトも変わらない。

### 掴み / 投げ（grab）

- `beginGrab` は**敵オブジェクトを保持しない**。安定 runtime id（`_seq`）だけを持つ。
- 掴めるのは同時に 1 体（`maxGrabPerCast`）。**投げから投げが連鎖しない。**
- 対象の死亡・プール返却は `onEnemyRemoved` が拾って必ず解除する。
- 時間切れ（`maxThrowMs`）でも必ず解除される。掴んだまま固まらない。
- 掴みは**保存しない**（reload で敵参照や無料の着地衝撃を作らない）。

### 戦旗の陣（rally）

- 陣は常に 1 つ（`maxFields: 1`）。再設置は置換（refresh）で、重ねがけしない。
- 効果が乗るのは `updateRallyPosition()` が内側と判定したときだけ。外へ出れば即座に 0。
- 効果は既存の経路へ**加算的に**入る:
  `meleeAreaMultiplier()` / `addFury()` / `comboGraceLeftMs` / `damageReduction()` / `_killHeal()`。
- 血盟戦旗の回復強化は**既存の毎秒 cap を共有**したまま cap を少し上げるだけなので、永久機関にならない。

### 低 HP スケーリング（lowHp）

```
multiplier = clamp(1 + 欠損HP割合 × missingHpBonus, 1, maxMissingHpMultiplier)
```

自傷しない・処刑もしない・必ず頭打ち（1.6 倍）。実装は `WarriorCombatSystem` の 1 か所だけ。

---

## 3. 既存の共通経路へ足したもの

| 場所 | 追加 | 火 / 氷への影響 |
|------|------|-----------------|
| `BattleScene.meleeStrike` | `isThrown` / `launch` / `seqHitCounts` / `toughPoiseBonus` | いずれも**明示したときだけ**分岐。未指定なら従来と同一 |
| `BattleScene.onWarriorDamage` | 被弾方向 ctx（`fromX` / `fromY`） | 戦士周回でのみ渡る。方向なしでは前面軽減 0 |
| `Player.takeDamage` | 第 2 引数 `from`（任意） | 渡さなければ挙動が変わらない |
| `Enemy` | `_airborneUntil` / `_launchImmuneUntil` / `_launchHeight` / `_grabbed` | 既定値（0 / false）では移動抑止が一切かからない |
| `Projectile` | **変更なし** | 完全に不変（戦斧はスキル側の移動判定で表現し、弾を使わない） |

戦斧を `Projectile` にしなかったのは、`Projectile.reset()` が火 / 氷向けの
状態異常フィールドを持っており、そこへ物理投擲を混ぜると非回帰ハッシュが壊れるため。
代わりに **`combat.thrownStrike`（= `meleeStrike` の `isThrown` 版）を毎フレーム動かす**方式にした。

---

## 4. 抽選（guidance）の追調整

active が 25 に増えると特定の組み合わせを引く確率が薄まる。
**M8-C.1 のしきい値は 1 つも下げず**、guidance へ data キーを 1 つ足すだけで吸収した。

| 追加キー | 値 | 何のため |
|---------|----|---------|
| `activeSupportWeightMultiplier` | 1.6 | **補助が active** のレシピの補助側への追加補正 |

passive 補助は最大 Lv が低く（4）別枠なので早期に埋まるが、
active 補助は active 枠を 1 つ食い必要 Lv も高い（`ground_slam` Lv6）。
カタログ拡張で不利になるのはこちらだけなので、そこだけを補正する。
判定は候補のカテゴリ（`m.category === 'active'`）だけで、skill ID は実装に書かない。

詳細と実測は `./warrior-evolution-guidance.md` §9。

---

## 5. やっていないこと

- active 26 種以上 / 進化 14 種以上 / passive の追加 / 新ジョブ
- 属性反応・新しい formal status・装備・武器選択
- 新しい敵 / ボス / 難易度
- 転生レガシー・UI 全面改修・正式グラフィック素材
- 火 / 氷の数値・挙動・候補列・状態異常・保存結果の変更
- Job Lv80 対象の追加（3 ジョブとも 6 種のまま）
- `save_version` の更新

---

## 6. 検証

| 観点 | テスト |
|------|--------|
| カタログ / プール / 抽選 / guidance / 進化 | `warrior-wave2-catalog` `-pool` `-draft` `-guidance` `-evolutions` |
| スキル個別（10 種） | `warrior-rising-slash` `-shield-charge` `-backstep-riposte` `-battlefield-throw` `-triple-crush` `-blade-guard` `-berserker-rush` `-war-axe-throw` `-breaker-knee` `-rallying-banner` |
| 保存 / 決定論 / 品質 / 後始末 / テレメトリ | `warrior-wave2-runtime-save` `-determinism` `-quality-cap` `-cleanup` `-telemetry` |
| 3 ジョブ非回帰 | `three-job-wave2-nonregression` |
| データ整合 | `node tests/validate-data.mjs` |

実ブラウザでの手順は `./test-guide.md` の M8-D チェックリストを参照。
