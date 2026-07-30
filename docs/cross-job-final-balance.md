# 3 ジョブ 最終バランス比較（Milestone 9-A.1）

production を全経路（弾 / DoT / 場 / reactive / 湧き / ボス / XP / 死亡）で駆動した比較。
ハーネスの構成は `./cross-job-full-balance-harness.md`。

**目的は構造異常の検出であって、3 ジョブを同じ数値へ揃えることではない。**
この Milestone で **balance 変更は 0 件**（damage / cooldown / 敵 / 報酬 / rarity / weight / しきい値とも）。

## 1. 測定条件

| 項目 | 値 |
|------|-----|
| seed | 3 seed（101 / 202 / 303 ほか）の**中央値**。`HEAVY=1` で 5〜7 seed |
| dt | 32ms 固定（frame 落ちなし・hitStop で経過時間を変えない） |
| 時間 | normal / elite / survival 180s・boss 300s |
| build | `slot8`（プール先頭 8 種 Lv8 + passive 4）。個性検査のみ `full`（30 種 Lv8）/ `evolved`（進化 18 種） |
| 難易度 | 1（`data/balance.json` の difficulties[0]） |
| Job Lv / 恒久強化 / 転生 | すべてなし |
| quality | high（gameplay へは無関係。4 品質で trace 一致） |

## 2. 実測（3 seed 中央値）

### normal（180s・production phases）

| 指標 | 火の魔女 | 氷術師 | 戦士 |
|------|----------|--------|------|
| DPS | 235 | 85 | 168 |
| 総ダメージ | 42,227 | 15,336 | 30,248 |
| 撃破 | 566 | 558 | 541 |
| 生存 | 180,000ms（全周） | 180,000ms | 180,000ms |
| 残 HP | 100/100 | 100/100 | 120/120 |
| top skill / share | flame_pillar 49.7% | permafrost_field 37.7% | great_cleave 20.3% |
| 到達 Lv | 11 | 12 | 13 |

### elite（180s・エリート + 接敵湧き + 敵弾）

| 指標 | 火 | 氷 | 戦士 |
|------|-----|-----|------|
| DPS | 200 | 77 | 188 |
| 撃破 | 147 | 261 | 609 |
| 生存 | 56,640ms（死亡） | 88,384ms（死亡） | 180,000ms（全周） |
| top share | flame_pillar 48.6% | permafrost_field 32.6% | great_cleave 22.3% |

### boss（300s・production の Boss）

| 指標 | 火 | 氷 | 戦士 |
|------|-----|-----|------|
| **ボス撃破時間（中央値）** | **7,552ms** | **22,176ms** | **12,512ms** |
| 全 seed の内訳 | 7552 / 6880 / 7744 | 16992 / 22176 / 24128 | 12512 / 17952 / 12512 |
| 撃破時 DPS | 458 | 145 | 260 |
| 残 HP | 100/100 | 76/100 | 94/120 |
| 対ボス手段 | 爆発縮小（単体バースト） | 氷砕ゲージ（凍結しない） | 体勢崩し → 露出 |

3 ジョブとも**有限時間で撃破**（ボスに実質無効なジョブは無い）。

### survival（180s・密な湧き + 接敵 + 敵弾 + 被弾 timeline）

| 指標 | 火 | 氷 | 戦士 |
|------|-----|-----|------|
| 生存時間 | 10,528ms | 9,408ms | **43,520ms** |
| 死亡 | 3/3 seed | 3/3 seed | 3/3 seed |
| 回復 | 0 | 0 | 45 |
| 軽減 | 0 | 0 | 359 |
| DPS | 204 | 66 | 136 |

戦士だけが軽減 / 不屈 / 撃破回復を持つため生存が長い（設計どおり）。
**3 ジョブとも最終的には死亡する**（無敵ジョブなし）。

## 3. 構造異常（すべて 0 件）

| 検査 | 火 | 氷 | 戦士 |
|------|-----|-----|------|
| 死にスキル（全 profile / 全 build で utility 0） | 0 | 0 | 0 |
| acquired but zero utility（全 build 合算） | 0 | 0 | 0 |
| cast > 0 かつ hit 0 が恒常化 | 0 | 0 | 0 |
| 未解決の damage 経路 | 0 | 0 | 0 |
| 未解決の弾種別 | 0 | 0 | 0 |
| 反応しない reactive | 0（5/5 反応） | 0（4/4） | 0（5/5） |
| 一極集中（単一スキルが過半 + 他が死ぬ） | なし | なし | なし |
| 永久状態 / 完全無効化 / 無限拘束 | なし | なし | なし |

- 144 スキル（active 90 + evolution 54）すべてに測定可能な utility があることを
  `cross-job-full-harness` §4 が build × profile 横断で確認（各ジョブ 48/48）。
- reactive は共通 stimulus timeline（17 イベント / 12 種別）で 100% 反応。

## 4. 個性（維持すべき差・均一化しない）

`full` build の実測:

| | 火の魔女 | 氷術師 | 戦士 |
|---|---|---|---|
| 炎上 / DoT ダメージ | **6,600** | 0 | 0 |
| 凍結 | 0 | **2** | 0 |
| 体勢ダメージ | 0 | 0 | **986** |
| 資源 | 熱量（核 2 種） | なし | 闘気・コンボ |
| 対ボス | 爆発縮小 | 氷砕ゲージ | 体勢崩し |
| 防御 | 障壁（回数制）・不死鳥 | 氷壁 / 光輪（迎撃上限） | 軽減スタック（≤0.7）・不屈 |
| 拘束 | なし | 凍結 + 耐性サイクル | 体勢崩し（しきい値 ×3 まで） |

3 ジョブは**数値で明確に differ する**。役割差はそのまま残す。

## 5. warning の分類（`harness` / `profile` / `role` / `bug` / `balance`）

目安を超えた指標を分類する。**分類が `bug` または `balance` のものは 0 件**。

| キー | 検出値 | 分類 | 根拠（documented note） |
|------|--------|------|------------------------|
| `DPS_RATIO` | normal 2.76 / elite 2.60 / boss 3.16 / survival 3.09（目安 1.8） | **role** | 火 = 直接火力に全振り・氷 = CC 主体（凍結 / 氷砕は damage 列に載らない）・戦士 = 近接持続 + 防御。同じ数値へ揃えると 3 ジョブの設計が消える。回帰フェンスは ≤ 6.0 |
| `BOSS_KILL_TIME_RATIO` | 2.94（目安 2.0） | **role** | ボスは**凍結しない**（氷砕ゲージ経由）ため氷術師だけ手数が要る。M7-E の設計どおり |
| `SURVIVAL_DIFF` | elite 3.18 / boss 2.94 / survival 4.63（目安 1.4） | **role** | 軽減 / 不屈 / 撃破回復 / 実効 maxHp 120 を持つのは戦士だけ |
| `TOP_SHARE` | elite/火 0.486・boss/火 0.485・normal/火 0.497（目安 0.35） | **profile** | `slot8` = **プール先頭 8 種だけ**の部分 build。全 30 種の実シェアは per-job スイート（`flame-balance-report.md` / `frost-balance-report.md` / `warrior-completion-balance.md`）が 35% 以下で維持している。`full` build では戦士 20.3% / 氷 32.6% |
| `ZERO_UTILITY_IN_PROFILE` | elite/火 1 件・elite/氷 1 件 | **profile** | その profile に刺激が無い reactive（`stimulus` profile では 100% 反応）。build × profile 合算では 0 件 |
| `DAMAGE_TAKEN_RATIO` | profile 依存 | **role** | 火 / 氷は被弾前提が薄く（kite）、戦士は接敵前提 |
| `HEALING_RATIO` | 火 0 / 氷 0 / 戦士 45 | **role** | 回復手段を持つのは戦士のみ（設計） |

`harness` 分類の warning は **0 件**（M9-A の「弾ダメージ未解決」がこの Milestone で解消したため）。

## 6. balance 判断

- **balance 変更 0 件。** damage / cooldown / 敵 HP / 攻撃力 / 経験値 / 難易度倍率 / 報酬 /
  rarity / weight / 抽選しきい値 / guidance しきい値のいずれも変更していない。
- 上表の警告はすべて `role` または `profile`（＝測り方）に分類され、
  **バランス値を動かす根拠にならない**。
- ジョブ間 DPS 比は**暴走検知フェンス（≤ 6.0）としてだけ**使う。バランスの正は
  per-job の completion スイートと実プレイ。

## 7. 修正した bug（balance ではなく観測の欠落・2 件）

| # | 内容 | 修正箇所 |
|---|------|----------|
| 1 | `burningDamage` が**発行元の無い dead key**（宣言 + F8 表示はあるのに常に 0） | `src/scenes/BattleScene.js` `dealDamage`（fire かつ DoT の命中を集計） |
| 2 | `_damageTakenTotal` が**加算箇所の無い dead field**（`damageTaken` が常に 0） | `src/entities/Player.js` `takeDamage`（障壁 / 軽減後の実被弾量） |

どちらも**観測のみ**。damage / 状態 / RNG / 判定順序を変えないことを品質不変性ハッシュの
不変で確認している。

## 8. 未確認

- 実ブラウザでの**実プレイの体感 / 手入力の操作感 / 実機 FPS / 長時間のメモリ増加**は未確認。
  自動化で確認した範囲と未確認の範囲は `./browser-validation-gate.md` に分けて記録した。
- 3 ジョブの数値差が「遊んで楽しいか」は Node では判定できない。
