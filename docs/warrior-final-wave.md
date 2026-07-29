# 戦士スキル拡張 最終Wave（Milestone 8-E）設計メモ

M8-D（Wave2）で **active 25 / 進化 13** まで積んだ上へ、さらに
**active 25 → 30・進化 13 → 18** を足して、**火の魔女・氷術師と同規模（30 / 4 / 18）** へ到達させた回。
passive は 4 種のまま増やしていない。

- 対象ジョブ: `warrior`（`element: physical`）のみ。火の魔女・氷術師は完全に非回帰。
- `save_version` は **6 のまま**（追加フィールドのみ・移行不要）。
- 新しい formal status は 1 つも増やしていない（共通状態異常は 5 種のまま）。
- 新しい npm 依存・ビルド工程・外部通信はなし。
- Job Lv80「打撃数 +1」の対象は **3 ジョブとも 6 種のまま**（M8-E の 10 種はすべて対象外）。
- Job Lv1〜100 の成長カーブ・闘気 / コンボ / 回復 / 不屈 / 体勢の既存機構は据え置き。

---

## 1. 何を足したか

### active5

| id | 名称 | rarity | 役割（設計上の担当） | 主な制約 |
|----|------|--------|----------------------|----------|
| `piercing_lunge` | 貫穿突き | common | 前方の**狭い直線**を貫く突き。列に並んだ雑魚を抜く | **弾ではない**（踏み込み＋近接の直線判定）。射程は data で頭打ちで**画面端まで届かない**。硬い相手が射線上にいると単体寄りへ寄る |
| `duel_challenge` | 一騎討ち | rare | 一体を選んで**自分だけ**強くなる単体特化 | **正式な状態異常を作らない**。相手へ debuff を貼らない。同時 1 体・重ねがけせず置換 |
| `battle_trance` | 修羅の構え | uncommon | 攻めへ全振りする短時間の構え | リスクは**軽減の小幅低下だけ**。重装 / 闘気解放 / 不屈を無効化しない。自傷も吸血もしない |
| `earthshaker_march` | 震天踏破 | uncommon | 前へ歩きながら**複数地点**を踏み砕く | 大地砕き / 震脚と違い**移動しながら**。1 回の範囲は小さく最後の一歩だけ重い |
| `weapon_deflection` | 刃返し | uncommon | 短い間だけ**通常の敵弾**を弾き返す | **完全無効化ではない**。予兆 / 光条 / 地形 / DoT は弾かない。窓ごとに弾ける数に上限 |

### evolution5

| 進化 id | 名称 | 基礎 | 補助 | 特徴 |
|---------|------|------|------|------|
| `godspeed_impaler` | 神速貫陣 | `piercing_lunge` | `combat_instinct` Lv4 | 二段突き。二段目は少し広いが**長さは同じ**（画面端まで伸ばさない） |
| `king_slayer_duel` | 覇王討ち | `duel_challenge` | `brute_force` Lv4 | 対象撃破時に**1 回だけ**近距離の格上へ挑み直せる。体勢崩しで小幅延長（合計上限つき） |
| `blood_asura_trance` | 血染修羅 | `battle_trance` | `bloodlust` Lv4 | 構え中の撃破回復が小幅に伸びる。**既存の毎秒 cap は共有したまま** |
| `continental_quake_march` | 大陸震砕踏破 | `earthshaker_march` | `heavy_armor` Lv4 | 最後の一歩が特大。前進中に**小幅な軽減**（合計 70% クランプは維持） |
| `heaven_mirror_reversal` | 天鏡返し | `weapon_deflection` | **active** `counter_stance` Lv4 | 弾き返しと近接反撃が併走する。**構えは置換されず CD にも触らない** |

---

## 2. 共通機構は WarriorCombatSystem に集約した

BattleScene へスキルごとの状態を散らさない、という M8-B からの方針を守っている。
M8-E で足したのは次の 5 つで、**すべて data（`balance.json` の `warrior`）で頭打ちになる**。

| 機構 | API | data の上限 | 誰が使うか |
|------|-----|-------------|-----------|
| 直線の対象選択 | `beginPiercingLunge` / `resolveLineMeleeTargets` / `noteLineStepIn` | `line` | 貫穿突き・神速貫陣 |
| 決闘 | `beginDuelChallenge` / `getDuelModifiers` / `duelPoiseMultiplier` / `retargetDuel` / `clearDuelTarget` | `duel` | 一騎討ち・覇王討ち |
| 構え（timed stance） | `beginBattleTrance` / `getBattleTranceModifiers` / `endBattleTrance` | `trance` | 修羅の構え・血染修羅 |
| 進軍 | `beginEarthshakerMarch` / `resolveMarchStomp` | `march` | 震天踏破・大陸震砕踏破 |
| 弾き返し | `beginDeflectionWindow` / `canDeflectProjectile` / `tryDeflectProjectile` / `arbitrateDeflectionAndCounter` | `deflection` | 刃返し・天鏡返し |

### 直線の対象選択（line）

`meleeStrike` に **opt-in の `line: {length, width, facing, maxTargets}`** を足しただけで、
指定が無ければ従来どおりの扇形判定になる（**火 / 氷の近接経路は 1 バイトも変わらない**）。

```
resolveLineMeleeTargets(射線上の敵, {maxTargets}):
  エリート / ボスが 1 体でもいる
    → 硬い相手は全員入れる。通常敵の枠は maxTargets × toughSingleTargetRatio まで
      （＝硬い相手ほど威力が 1 点へ集まる）
  いない
    → 手前から maxTargets 体まで貫く（貫通数を telemetry へ）
```

射程は `line.maxLineLength`（300px）で頭打ち、幅は `line.maxWidth`（90px）。
踏み込みは `line.maxStepInDistance`（96px）までで、**少しだけ届かないときにしか出ない**。
ボスが予兆中は踏み込まない（無謀に飛び込まない）。

### 決闘（duel）

**formal status ではない。** 相手に何も貼らず、戦士本人の補正としてだけ効く。

- 対象は同時 **1 体**（`duel.maxTargets: 1`）。再発動は置換であって重ねがけしない。
- 優先度は data 由来で **ボス(3) > エリート(2) > 通常(1)**。通常敵は HP の高い相手が選ばれる。
- 補正（近接ダメージ / 体勢削り / 闘気獲得）は **決闘対象へ命中したときだけ**乗る。対象以外は必ず 0。
- **敵オブジェクトを保持しない。** 安定 runtime id（`_seq`）だけを持ち、保存にも id しか出ない。
- 死亡 / プール返却 / ボス除去 / スキル破棄 / Scene 終了 / 時間切れで**必ず解除**される。
  敵側の `_duelMark` は `Enemy.reset()` と `onEnemyRemoved()` の両方が戻す。
- 覇王討ちの延長は「対象の構えを崩したとき」だけで、合計 `duel.maxExtensionMs` を超えない
  （＝**ボスを永久にロックできない**）。

### 構え（trance）

これも **formal status ではない**。同時 1 つ（`trance.maxStances: 1`）で、再発動は上書き。

- 攻撃補正（近接ダメージ / 攻撃速度 / コンボ猶予 / 闘気獲得）は上限つき。
- **闘気解放との合成上限**（`combinedOffenseCap: 0.85`）で必ず頭打ちになる。
  解放中は解放ぶんを差し引いた余地までしか構えの補正が乗らない。
- リスクは**軽減の実効値の小幅低下だけ**（`maxMitigationPenalty: 0.15`）。
  低下は合計軽減から**引く**だけで、重装・闘気解放・不屈のいずれも**無効化しない**。
  合計は `minMitigationAfterPenalty`（0）を下回らない＝**負にならない**。
- 自傷しない・ライフスティールしない・打撃数を無料で増やさない。

### 進軍（march）

`beginEarthshakerMarch` が踏みの回数・間隔・歩幅・半径・時間・軽減をまとめて data 上限へ丸めた
「計画」を返し、スキルはその計画に従うだけ。

- 1 発動 = **1 castKey = 1 recordCast**。踏みごとに cast を数えない。
- 距離（`maxStepDistance × maxStomps`）と時間（`maxMarchMs`）の**両方**で必ず終わる。
- 対象を見失っても現在の方向へ進み続け、`worldMargin` で壁の内側にクランプされる。
  座標が NaN になる経路が無い（`Number.isFinite` ガードつき）。
- ボス予兆中は前進を止めてその場で踏む（完全に無視はしない）。

### 弾き返し（deflection）

**完全無効化ではない。** 何を弾けるかは `canDeflectProjectile()` が allowlist + denylist で一元判定する。

```
弾ける:   bossBullet / bullet（通常の敵弾）
弾けない: beam / telegraph / hazard / dot / ground、味方弾、
          すでに弾かれた弾、反射弾（deflectGeneration >= maxReflectGeneration）
```

- 窓ごとに弾ける数に上限（`maxDeflectionsPerWindow`）。**超えた弾はそのまま通る。**
- 弾いた弾は必ず消え、必要なら**短命の物理反射弾**（オーナーは戦士）になる。
  反射弾は data 上限のダメージ / 速度 / 寿命を持ち、元弾の特殊効果を引き継がない
  （`suppressSpecialEffects: true`）。**世代 1 で止まるので再反射しない。**
- 同じ弾を 2 度弾かない（`_deflectId` の Set。**保存しない**）。
- `recordCast` は**窓の開始時の 1 回だけ**。弾ごとには数えない。
- 品質（F10）は同時演出数と同時実体数だけを絞る。**弾ける「種別」の判定は品質で 1 件も変わらない。**

#### 1 イベント = 最大 1 系統

`arbitrateDeflectionAndCounter(kind)` に調停を集約した。

| イベント | 応じる系統 | 消費するもの |
|----------|------------|--------------|
| `projectile`（敵弾） | 弾き返しだけ | 弾き返しの残り枠のみ（近接反撃は消費しない） |
| `melee`（近接被弾） | 既存の反撃調停だけ | 反撃窓の残り回数のみ（弾き返しは消費しない） |

窓の枠を使い切っていても**窓が開いている間は調停まで通す**（`deflectionWindowOpen`）。
実際に弾けるかは `canDeflectProjectile()` が決め、失敗しても何も消費しない。
これにより「上限到達」が正しく計測でき、上限に達した窓へ飛んできた弾は素通りする。

---

## 3. 抽選導線（active30 でも進化へ届く）

active が 25 → 30 に増えると 1 枠あたりの当たりが薄まる。**M8-C.1 で復元したしきい値は 1 つも下げず**、
guidance へ data キーを 2 つだけ足して吸収した（skill ID のハードコードなし・戦士だけに効く）。

| キー | 値 | 意味 |
|------|-----|------|
| `highRequirementSupportLevel` | 6 | 「高い Lv を要求される補助」とみなす境界 |
| `highRequirementSupportMultiplier` | 1.5 | その補助へ追加で乗る倍率（**役割ごとの max であって積み上げではない**） |

さらに 2 つの data 判断を入れている。

- `heaven_mirror_reversal` の補助要求を `counter_stance` **Lv4**（Lv6 ではなく）にした。
  active 補助の進化は枠を 2 つ使うぶん到達しにくく、Lv6 要求だと 1000 run で 0〜3 件しか成立しなかった。
- `weapon_deflection` の rarity を rare → **uncommon** にした（同じ理由）。

結果（production の抽選ハーネス・200 seed・素朴戦略）:

| 枠 / Lv | 進化 1 個以上 | 2 個以上 | 平均 | 0 個 |
|---------|---------------|----------|------|------|
| 枠4 / 40lv | **89.5%** | – | 1.28 | 10.5% |
| 枠6 / 60lv | **99.0%** | 94.5% | 2.65 | 1.0% |
| 枠8 / 80lv | **100%** | 99.5% | 3.92 | 0% |

**18 進化すべて・30 active すべてが取得 0 件なし**、最頻進化シェアは 16.2 / 13.8 / 11.7%（枠4 / 6 / 8）で
M8-D から**むしろ改善**（過剰誘導なし）。候補なし / 他ジョブ混入 / 重複 / 枠違反はいずれも 0 件。

### active 補助の進化についてのトレードオフ（記録）

M8-C.1 で置いた不変条件「補助として使う active は自身の進化を持たない」は、
`counter_stance`（自身の進化 `adamant_counter` を持つ）を天鏡返しの補助にしたことで**崩れている**。
採用した理由と担保は次のとおり。

- 天鏡返しは「弾き返し＋近接反撃の併走」という設計上、構え系の補助が必然だった。
- 依存する進化（天鏡返し）は補助（`counter_stance`）を**置換しないし CD にも触らない**ので、
  `adamant_counter` への道は塞がれない（両方を目指せる）。
- `tests/warrior-active-support-evolution.mjs` がこの点を明示的に検査している。

---

## 4. 品質段階（F10）と安全上限

M8-E で足した skillCaps は 12 件（**未参照 cap は 0 件**）。

| 種別 | cap |
|------|-----|
| event（実挙動の同時処理数） | `maxLineTargets` / `maxLineThrusts` / `maxDuelTargets` / `maxTranceStances` / `maxMarchStomps` / `maxDeflectionsPerWindow` / `maxReflectedProjectiles` |
| visual（演出の同時表示数） | `maxThrustTrails` / `maxDuelMarkers` / `maxTranceAuras` / `maxMarchDustVisuals` / `maxDeflectSparkVisuals` |

すべて `low ≤ medium ≤ high ≤ ultra` かつ**すべて正の数**（0 にして効果を消す cap は無い）。
**演出上限がダメージや成否を減らすことは無い。** F10 の表示・挙動そのものは M8-D から変えていない。

---

## 5. 保存

`save_version` は **6 のまま**。追加は `active_run.warriorState.timedBuffs` の下に 3 キーだけ。

```
timedBuffs: {
  warCry, counterWindows, frontGuard, rallyField, counterGlobalCdLeftMs,   // M8-C / M8-D
  duel, trance, deflection                                                  // M8-E（追加）
}
```

- 決闘は **seq（安定 runtime id）と残り時間・補正値だけ**。敵オブジェクトは保存しない。
- 弾き返しは窓の残り時間と使用済み回数だけ。**弾いた弾の id 集合や弾オブジェクトは保存しない。**
- 進行中の踏み込み / 進軍 / 突きの途中状態は保存しない（復元で座標が飛ばない・二重再生しない）。
- 復元はすべて `balance.json` の上限を通るので、**改ざんされた保存値でも上限を超えない**。
- 復元は新規発動として数えない（`duelStarts` / `tranceStarts` / `deflectWindows` が水増しされない）。

---

## 6. テレメトリ / F8 / F9

- `WarriorCombatSystem.telemetry` に 36 キー、`CombatTelemetry.warrior` と `summary()` に 35 キーを追加。
  両者は **1:1**（ライブ表示専用キーと秒換算キーを除く）。
- スキル別 stats へ `thrusts` / `penetrations` / `duels` / `duelMs` / `tranceMs` / `stomps` / `deflects` / `reflected` を追加。
- F8（バランス分析）に「戦士 最終Wave」ブロックと 6 種の警告を追加。
- F9（`_warriorReport`）に貫穿突き / 一騎討ち / 修羅の構え / 震天踏破 / 刃返しの現在状態を追加。
- **F10 は変えていない。**
- テレメトリは**端末内のみ**（外部送信なし）。デバッグ操作をした周回は従来どおり `debugRun` として分離。

`tranceOffenseCapped`（合成上限に触れた回数）は安全弁のカウンタで、
**出荷中の data では合成上限に届かないため実プレイでは 0 のまま**である。
`tests/warrior-final-telemetry.mjs` が上限の効く config を明示して経路そのものを検査している。

---

## 7. 非回帰の担保

`tests/three-job-final-catalog-nonregression.mjs` が M8-A 完了時点（ec503fe）のハッシュと突き合わせている。

- 火 / 氷の 300 seed 候補列が **byte-identical**
- 火 / 氷 48 スキルのランタイム挙動が**完全一致**
- 共通状態異常は **5 種のまま**
- 火 / 氷の周回では M8-E の機構が**すべて null / 0 を返す**
- 火 / 氷のスキルが M8-E の API を**1 つも呼ばない**
- `meleeStrike` の `line`・`Projectile` の弾き返しフィールド・`Enemy._duelMark` はいずれも
  **opt-in / 無害な既定値**で、指定が無ければ従来と同一の経路を通る

---

## 8. やっていないこと（意図的）

- active 31 種目以降・進化 19 種目以降・新しい passive
- Job Lv80「打撃数 +1」の対象追加（**6 種のまま**）
- 新ジョブ・属性反応・新しい formal status・装備 / 武器選択
- 新しい敵 / ボス / 難易度・転生レガシー・UI 全面改修・正式画像素材
- 戦士の「完成監査」（別 Milestone）
- 抽選そのものの全体設計変更（guidance は戦士だけに効く data キーの追加のみ）
