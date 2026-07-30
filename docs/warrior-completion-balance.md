# 戦士 バランス分布（Milestone 8-F）

M8-F の**完成監査**で測ったバランス分布。目的は「数値の良し悪しの調整」ではなく、
**死にスキル / 進化の逆転 / 永久状態 / 極端な一極集中**といった**構造的な異常**が無いことの確認。

- **ゲームバランスは M8-F で意図的に変えていない。**変更したのは進化 1 件の `safetyCaps` 値 1 個だけ（§3）。
- 敵 HP・攻撃力・経験値・難易度倍率・報酬・スキルの `damage` / `cooldown` は **1 件も触っていない**。
- 火の魔女・氷術師のバランスは**完全に非回帰**（`tests/three-job-completion-nonregression.mjs`）。
- 測定はすべて Node 上の production クラス実測。**実ブラウザでの体感確認は未実施。**

再現コマンド:

```
node tests/warrior-completion-balance.mjs
node tests/warrior-completion-performance.mjs
HEAVY=1 node tests/warrior-completion-balance.mjs   # seed / 時間を増やした版
```

---

## 1. active 30 件のダメージ分布

条件: 敵 30 体 + エリート 6 体 + ボス 1 体（HP 1e9 で不死）、`active` 30 種すべてを Lv8 で同時所持、
`dt=32ms` × 9000 フレーム（= 約 4.8 分相当）、quality=high、40 フレームごとに被弾、
200 フレームごとに敵弾 10 発を追加。HP は 250 フレームごとに満タン ⇄ 20% を往復させ、
低 HP 補正・撃破回復・不屈をすべて経路に乗せる。

| id | シェア | 総ダメージ | 主発動 | 命中 | 1 発動あたり |
|----|--------|-----------|--------|------|--------------|
| `great_cleave` | 13.6% | 1332160 | 520 | 18393 | 2562 |
| `whirlwind_slash` | 11.4% | 1112352 | 98 | 27802 | 11351 |
| `earthshaker_march` | 9.7% | 949144 | 107 | 9965 | 8871 |
| `triple_crush` | 8.0% | 779202 | 239 | 7463 | 3260 |
| `twin_fang_slash` | 7.8% | 760664 | 595 | 12801 | 1278 |
| `berserker_rush` | 5.4% | 526605 | 114 | 6071 | 4619 |
| `shield_charge` | 4.8% | 464254 | 120 | 4710 | 3869 |
| `ground_slam` | 4.2% | 405508 | 114 | 4791 | 3557 |
| `relentless_combo` | 3.7% | 357573 | 114 | 7320 | 3137 |
| `sweeping_advance` | 3.5% | 341607 | 88 | 6099 | 3882 |
| `counter_stance` | 3.2% | 309999 | 77 | 2006 | 4026 |
| `execution_strike` | 2.7% | 260252 | 159 | 2220 | 1637 |
| `battlefield_throw` | 2.6% | 251548 | 97 | 1539 | 2593 |
| `armor_breaker` | 2.2% | 219085 | 192 | 1191 | 1141 |
| `leap_smash` | 2.2% | 215089 | 102 | 2020 | 2109 |
| `backstep_riposte` | 2.0% | 195535 | 176 | 1421 | 1111 |
| `shockwave_stomp` | 1.9% | 188097 | 225 | 3062 | 836 |
| `piercing_lunge` | 1.8% | 178692 | 273 | 1237 | 655 |
| `shield_bash` | 1.7% | 164523 | 202 | 3009 | 814 |
| `blade_guard` | 1.6% | 157306 | 83 | 4894 | 1895 |
| `war_axe_throw` | 1.5% | 148338 | 150 | 3004 | 989 |
| `charge_slash` | 1.5% | 146551 | 129 | 1690 | 1136 |
| `rising_slash` | 1.2% | 116601 | 365 | 1400 | 319 |
| `rallying_banner` | 0.7% | 64172 | 55 | 876 | 1167 |
| `war_cry` | 0.6% | 57052 | 59 | 1223 | 967 |
| `breaker_knee` | 0.4% | 34726 | 329 | 309 | 106 |
| `battle_trance` | 0.1% | 14336 | 33 | 339 | 434 |
| `chain_hook` | 0.0% | 4758 | 83 | 83 | 57 |
| `duel_challenge` | 0.0% | 4457 | 48 | 48 | 93 |
| `weapon_deflection` | 0.0% | 0 | 45 | 0 | 0 |

合計 9,760,187。**最大シェアは `great_cleave` の 13.6%**（監査しきい値 35% 以下）。
30 件すべてが「ダメージ > 0」または「明示された utility > 0」を満たし、**死にスキルは 0 件**。

### ダメージ 0 / 極小の 3 件が死にスキルでない理由

| id | ダメージ | 実際の役割（測定値） |
|----|----------|---------------------|
| `weapon_deflection` | 0 | 弾き窓 45 回・弾き 390 発・反射 6 発。**ダメージを出さない防御スキル**として設計どおり（`isDefensive: true`）。反射ダメージは進化 `heaven_mirror_reversal` の担当 |
| `duel_challenge` | 4,457 | 決闘 48 回・平均継続で単体ダメージ倍率を供給するバフ。自身の打撃は「印を付ける 1 発」だけ |
| `chain_hook` | 4,758 | 引き寄せ 83 回（`pullDistance` を記録）。**制御スキル**で、火力は引き寄せた先の他スキルが出す |
| `breaker_knee` | 34,726 | 主発動 329 回で体勢削り（`stance_break`）を供給。1 発動あたり 106 は最小だが、崩し回数はトップ |

## 2. 進化 18 件と base の比較

条件は §1 と同じ。「base 単独」と「進化単独」をそれぞれ別の run で測り、
さらに「他 29 active + その進化」の全部盛りでシェアを測る。

| 進化 | base | base 単独 | 進化単独 | evo/base | 全部盛りシェア |
|------|------|-----------|----------|----------|----------------|
| `thousand_blade_dance` | `great_cleave` | 1466938 | 2263034 | 1.54 | 20.6% |
| `bloodstorm_whirlwind` | `whirlwind_slash` | 718766 | 922906 | 1.28 | 14.8% |
| `unyielding_fortress` | `shield_bash` | 207942 | 459426 | 2.21 | 5.1% |
| `skull_splitter` | `armor_breaker` | 262169 | 390798 | 1.49 | 2.9% |
| `crimson_execution` | `execution_strike` | 188784 | 259266 | 1.37 | 3.6% |
| `war_god_roar` | `war_cry` | 33638 | 57050 | 1.70 | 1.1% |
| `adamant_counter` | `counter_stance` | 181632 | 277760 | 1.53 | 5.3% |
| `heaven_crushing_descent` | `leap_smash` | 113088 | 230419 | 2.04 | 4.7% |
| `heaven_rending_ascent` | `rising_slash` | 93888 | 576072 | 6.14 | 7.9% |
| `fortress_rampage` | `shield_charge` | 240096 | 391944 | 1.63 | 8.0% |
| `shadow_swallow_riposte` | `backstep_riposte` | 259773 | 287931 | 1.11 | 4.0% |
| `mountain_hurl` | `battlefield_throw` | 157414 | 238339 | 1.51 | 4.6% |
| `blood_oath_standard` | `rallying_banner` | 40320 | 43008 | 1.07 | 0.7% |
| `godspeed_impaler` | `piercing_lunge` | 137049 | 156939 | 1.15 | 3.1% |
| `king_slayer_duel` | `duel_challenge` | 1584 | 1984 | 1.25 | 0.1% |
| `blood_asura_trance` | `battle_trance` | 870 | 1056 | 1.21 | 0.1% |
| `continental_quake_march` | `earthshaker_march` | 375153 | 736151 | 1.96 | 14.8% |
| `heaven_mirror_reversal` | `weapon_deflection` | 0 | 0 | — | 0.0% |

- **evo/base < 1.0 の逆転は 0 件**（監査しきい値: 0.9 以上）。
- **全部盛りシェアが 45% を超える「他を全部食う」進化は 0 件**（最大は `thousand_blade_dance` の 20.6%）。
- `heaven_mirror_reversal` / `weapon_deflection` はダメージ 0 の防御ペアなので比率では比べず、
  弾き回数・反射回数で比較している（`tests/warrior-completion-defense.mjs`）。
- `heaven_rending_ascent` の 6.14 は base `rising_slash` が「打ち上げ 1 段のみ」で
  進化が「2 段 + 範囲」になる設計差によるもの。全部盛りシェアは 7.9% で一極集中していない。

## 3. M8-F で変更した唯一のバランス値

| 対象 | 変更 | 理由 |
|------|------|------|
| `skill-evolutions.json` → `crimson_execution.safetyCaps.maxTargetsPerStrike` | **10 → 20** | 監査で **evo/base = 0.69**（進化すると弱くなる逆転）が出た。原因は cap 10 が base `execution_strike` の実効的な breadth（品質上限 24 のもとで実測 20）より狭いこと。cap を base 相当へ広げて逆転を解消した。修正後 **1.37**。依然として有界で、品質上限（24）以下 |

この 1 件を巻き戻すと `tests/warrior-completion-balance.mjs` の
`crimson_execution: ... ≥ base ... の 90%` が落ちる（回帰検知つき）。

### 追加した data キー（3 件・いずれも上限クランプ用で既定挙動を変えない）

| キー | 値 | 用途 |
|------|-----|------|
| `balance.warrior.rally.maxRadius` | 280 | 陣の半径クランプ（改ざん保存で無限半径を作れない） |
| `balance.warrior.counter.maxCountersPerWindow` | 6 | 反撃窓の回数クランプ |
| `balance.warrior.counter.maxWindowMs` | 6000 | 反撃窓の持続クランプ |

現在の data はいずれも上限に達しないため、**正常プレイでの挙動は変わらない**
（`WARRIOR_DEFAULTS` にも同じ値を置き、data 欠落時も同じ上限になる）。

## 4. 構造的な異常の不在

| 項目 | 測定 | 結果 |
|------|------|------|
| 永久状態 | 全 active を持ったまま時間だけ 64s 進める | 構え / 決闘 / 弾き窓 / 陣 / 闘気解放 / 露出 / 掴み / 反撃窓すべて 0 に戻る |
| 無限回復 | `killHealMult: 1` で 4.8 分 | overheal なし・撃破回復に毎秒上限・自傷経路 0（`hp -=` / `selfDamage` / `hpCost` が実装に無い） |
| 「瀕死維持が最適」 | 低 HP 倍率の実測平均 | data 上限（2.0 倍）以内。倍率が発散しない |
| ボス永久拘束 | ボス崩し 39 回 / 露出合計 118.9s / しきい値 ×3.00 | 崩しごとにしきい値が上がり、露出が連続しない |
| 通常敵の場外押し出し | ノックバック / 打ち上げ / 投げ | 画面外へ出た敵 0（座標クランプが効く） |
| 弾き返しの過剰 | 検知 202,414 / 弾き 390（**0.2%**）/ 反射 6 | 完全無効化にならない |
| 闘気解放の連発 | 24 回 / 稼働率 41.9% | 常時稼働にならない |
| 最終Wave 5 種の食い合い | 5 種の合計シェア **11.7%** / 既存 25 種 88.3% | M8-E の 5 種が既存 25 種を全ハズレにしない |

## 5. 品質を落としたときの規則

| quality | 10 分相当の計算時間 | 1 フレーム最大処理 | 上限 | 平均 |
|---------|--------------------|-------------------|------|------|
| low | 2.5s | 238 | 360 | 11.3 |
| medium | 2.5s | 335 | 540 | 15.5 |
| high | 2.7s | 424 | 720 | 19.3 |
| ultra | 3.1s | 534 | 960 | 25.3 |

- 「1 発動 = 1 記録」「多段でも記録が増えない」「上限の階層（`low ≤ medium ≤ high ≤ ultra`）」は
  4 品質すべてで同じ。品質は**同時処理数の上限だけ**を動かす。
- 品質で主発動回数が前後したのは `great_cleave` の 1 件だけ（58 → 59）。
  低品質では 1 撃あたりの対象数が少なくコンボの伸びがわずかに遅く、
  攻撃速度しきい値を越えるタイミングが 1 回分ずれる。**1 発動あたりのダメージと規則の階層は不変**。
  これは M8-B からある 3 ジョブ共通の帰結で、M8-F で新たに生じた差ではない。

---

関連文書: `./warrior-completion-audit.md`（監査本体）/ `./warrior-completion-matrix.md`（48 スキル一覧）/
`./balance-testing.md`（バランス検証の手順）/ `./flame-balance-report.md` / `./frost-balance-report.md`
