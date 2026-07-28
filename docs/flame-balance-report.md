# 火の魔女 バランスレポート（Milestone 8-A）

Milestone 8-A で行った**修正の内容と、その前後の値**をまとめる。
バランス変更は「明確な破綻が確認できた場合だけ、`flame_witch` 側へ最小限」の方針で行った。
**単なる均一化はしていない**。氷術師（`frost_mage`）の数値・挙動・保存・カタログは変更していない。

---

## 1. 修正した不具合（バランス影響なし）

### 1.1 クールダウン保存漏れ（21 種）— **再開時の無料発動を停止**

| 変更前 | 変更後 |
|--------|--------|
| 21 種が `serializeState()` を持たず、`active_run.skillRuntime` に載らない | 48 種すべてが runtimeState を保存する |
| reload 直後に CD が 0 へ戻り、`meteor`（8 秒 CD）等が**無料で即発動**できた | CD の残りが復元され、無料発動が起きない |
| `ash_doppelganger` / `ash_legion` / `solar_annihilation_array` は再開直後に全ユニットが一斉発動 | 各タイマーを復元して一斉発動しない |

**バランス影響**: 通常プレイ（リロードしない）では**完全に不変**。
リロードを繰り返す抜け道が塞がれる（本来の設計どおりになる）方向の修正。

検証: `tests/flame-complete-determinism.mjs` §3〜§4。
「継続 80 フレーム＋80 フレーム」と「80 フレームで save → restore → 80 フレーム」の発動量が一致し、
CD 復元ありは復元なしより即時発動が多くならない。

### 1.2 死にパラメータ 21 件 → 0 件

**実装へ接続した 13 件はすべて「宣言値 == 従来のハードコード値」** のため、挙動は変わらない。

| 対象 | 変更前（ハードコード） | 変更後（data 参照） | 実効値 |
|------|----------------------|--------------------|--------|
| `infernal_barrage.chain.onKillExtra` | 撃破ごとに固定 1 発 | `onKillExtra`（=1） | 不変 |
| `infernal_barrage.chain.chainExplosion` | 常に着弾爆発 | `chainExplosion > 0` でゲート（=1） | 不変 |
| `purgatory_eruption.pull.excludeBoss` | `if (e.isBoss) return` | `excludeBoss !== false` | 不変 |
| `solar_core_collapse.pull.excludeBoss` | 同上 | 同上 | 不変 |
| `thousand_flame_lances.chain.splitOnPierce` | `cap('maxSplitGenerations', 2)` | `min(cap, splitOnPierce=2)` | 不変 |
| `thousand_flame_lances.damage.rampMax` | `_rampBase * 1.6` | `_rampBase * (1 + rampMax=0.6)` | 不変 |
| `hundred_wisp_parade.chain.splitOnKill` | 撃破ごとに 1 発 | `splitOnKill`（=1） | 不変 |
| `infernal_vortex_wheel.chain.infect` | `o.ignite(1200, 1)` | `o.ignite(1200, infect=1)` | 不変 |
| `apocalypse_chain.chain.spreadOnChain` | 常に拡散 | `spreadOnChain > 0` でゲート（=1） | 不変 |
| `apocalypse_chain.projectileCount.spreadCount` | 1 起爆で `maxSpread`(6) まで拡散 | 1 起爆あたり最大 3（総数は 6 のまま） | ほぼ不変（拡散が分散するだけ） |
| `solar_annihilation_array.projectileCount.auxBeams` | 補助光線 = `mirrors`(4) | `min(mirrors, auxBeams=4, …)` | 不変 |
| `hellfire_mine_network.projectileCount.markTargets` | 空き `maxMarks`(40) まで刻印 | 1 爆発あたり最大 6 | わずかに縮小（複数地雷が同時爆発した際の刻印集中を抑える） |
| `hexagram_inferno_array.projectileCount.vertices` | 6 頂点固定 | `vertices`（=6・偶数へ丸め） | 不変 |

**削除した 8 件**（実装が読める形にすると火力が変わるため、予約値として残さず除去）:

| 対象 | 値 | 削除理由 |
|------|----|---------|
| `fireball` / `flame_pillar` / `burning_trail` の `evolution` ブロック | — | `skill-evolutions.json` と二重管理の旧定義。実装は一度も読んでいない |
| `bloodfire_pact.buffDamage` / `buffMs` | 0.12→0.169 / 2000→2840ms | 実装コメントが「no-op タイマー」と明記。バフを実装すると火属性ダメージが 5〜8% 増える（明確な破綻の証拠なし） |
| `four_sided_inferno.burnMs` | 1200→1760ms | 炎上を付与する経路が無く、追加は純粋なバフになる |
| `inferno_blade_domain.projectileCount.sweeps` | 3 | 多段化すると最大 3 倍のバフになる |
| `necroflame_mausoleum.area.senseRadius` | 44 | 対応する感知処理が無く、既存の `densestPoint(140)` を置き換えると挙動が変わる |
| `universal_flame_resonance.config.countRadius` | 300 | 共鳴 tier は `burningCount()`（全画面）で決まる設計と矛盾。半径判定にすると tier が下がる |

**バランス影響**: `apocalypse_chain` の拡散分散と `hellfire_mine_network` の 1 爆発あたり刻印上限（6）以外は**完全に不変**。
この 2 件も総量の上限（`maxSpreadPerChain` 6 / `maxMarks` 40）は変えていない。

### 1.3 未参照 quality cap 5 件 → 0 件

| cap | 値（low/med/high/ultra） | 対応 |
|-----|--------------------------|------|
| `maxCopyGeneration` | 1/1/1/1 | 削除（`maxEchoCloneGeneration` と完全重複） |
| `maxChainTargets` | 4/6/8/10 | 削除（`maxChainDepth` と完全重複） |
| `maxBurningEnemyIndex` | 120/200/320/480 | 削除（索引は `maxEnemies` で有界。参照すると低品質で共鳴 tier＝火力が下がる） |
| `maxBarrierEffects` | 1/2/2/3 | 削除（複数障壁の概念が無い。参照すると低品質で反撃回数＝火力が下がる） |
| `maxMainCastEventsPerFrame` | 8/12/16/24 | 削除（残響の毎フレーム上限は `combatCaps.maxEchoPerFrame` が担当。参照すると低品質で発動数が変わる） |

**バランス影響なし**（削除前も一度も参照されていなかった）。
`skillCaps` は 157 → **152 件**。`validate-data.mjs` の許容リストは空になり、以後の未参照 cap はエラー。

### 1.4 `eternal_pyre` / `solar_annihilation_array` の残響・分身が発生しなかった

| | 変更前 | 変更後 |
|--|--------|--------|
| 主発動 `recordCast`（10 秒あたり） | **0 回** | 17 回（`castPulseMs` 500 / 600ms でスロットル） |
| Job Lv50「残響詠唱」 | 発生しない | 発生する（`registerCast` の 12 回に 1 回・威力 60%） |
| 灰燼分身の複製対象 | ならない | なる |
| `echoPolicy` / `clonePolicy` | `standard`（実装なし＝no-op） | `custom`（攻撃部分のみ） |
| `eternal_pyre.echoCast()` | 未実装（`fire()` も無いので何も起きない） | 炎の領域を 1 回ぶん追加パルス |
| `solar_annihilation_array.echoCast()` | 実装済みだが**到達不能コード** | 実際に呼ばれる |

**バランス影響（意図した修正）**: Job Lv50 以上でこの 2 進化を使う場合のみ、残響ぶんの追加ダメージが乗る。
Job Lv1〜49 では `registerCast()` が残響を発生させないため**完全に不変**。
進化元（`burning_trail` / `scorching_ray`）では残響が発生していたため、
**進化すると残響を失う**という逆転を解消する修正である。

### 1.5 `eternal_pyre` の感染が全敵総当たりだった

| 変更前 | 変更後 |
|--------|--------|
| `scene.enemyPool.forEachActive()` で毎 tick 全敵を走査 | `combat.burningEnemies(maxIgnited)` で炎上索引だけを走査 |

対象集合は「生存かつ炎上中・ボス以外・世代上限未満」で**同じ**。
敵 100 体・感染 tick 300ms のとき、1 秒あたり約 330 回の不要な走査が消える（性能改善）。

## 2. 変更前後の同 seed 比較

| 比較対象 | 変更前 SHA-256 | 変更後 SHA-256 | 判定 |
|----------|----------------|----------------|------|
| 氷術師 ドラフト候補列（300 seed × 8 ドラフト） | `b1b9fc5d…` | `b1b9fc5d…` | **完全一致** |
| 火の魔女 ドラフト候補列（300 seed × 8 ドラフト） | `7c6102c2…` | `7c6102c2…` | **完全一致** |
| 氷術師 48 スキルの呼び出しトレース＋runtime | `4e104a70…` | `4e104a70…` | **完全一致** |

火の魔女 48 スキルの呼び出しトレースで差が出たのは 3 件のみ:

| skill | 差分 |
|-------|------|
| `eternal_pyre` | `casts` 0 → 17（意図した §1.4 の修正） |
| `solar_annihilation_array` | `casts` 0 → 17（同上） |
| `thousand_flame_lances` | 弾生成の opts に `rampMax: 0.6` が増えただけ（実効上限は従来の `×1.6` と同値） |

呼び出し回数（`calls`）・与ダメージはいずれも変更前後で同一。

## 3. 火力・進化前後の比較

### 3.1 計測の限界（重要）

ヘッドレスハーネス（`tests/flame-audit-common.mjs`）は **敵が移動せず死なない飽和条件**であり、
刻印起爆（`BattleScene.chainDetonate`）・分身の複製対象・炎上源といった
BattleScene 側の相互作用も再現しない。したがって **DPS の実測値は火力バランスの判定に使えない**。

そのため進化前後の比較は、**data 由来の項目差分**（最大 damage / 最大 area / cooldown / 攻撃経路数 / 新機構）で行った。

### 3.2 進化前後の比較（base Lv8 → evolution）

| evolution | base | 最大damage | 最大area | cooldown | 攻撃経路数 | 優位 |
|-----------|------|-----------|---------|----------|-----------|------|
| `infernal_barrage` | `fireball` | 46→46 | 36→34 | 600→520 | 1→1 | cooldown, 新機構（撃破追撃・連鎖爆発・発射数 4→6） |
| `purgatory_eruption` | `flame_pillar` | 66→170 | 64→104 | 1700→2600 | 1→3 | damage, area, 攻撃経路, 新機構 |
| `eternal_pyre` | `burning_trail` | 19→34 | 22→72 | 150→200 | 1→2 | damage, area, 攻撃経路, 新機構（常設領域・感染・死亡爆発） |
| `thousand_flame_lances` | `flame_lance` | 70→60 | — | 560→620 | 1→1 | 新機構（発射数 4→14・全方位 4・貫通 8・ramp・分裂） |
| `hundred_wisp_parade` | `homing_wisp` | 33→22 | 0→70 | 1050→900 | 1→2 | area, cooldown, 攻撃経路, 新機構（防衛鬼火・撃破分裂） |
| `solar_core_collapse` | `lava_bomb` | 120→260 | 74→150 | 1900→6000 | 2→3 | damage, area, 新機構（予告・引き寄せ・大型溶岩） |
| `infernal_vortex_wheel` | `flame_vortex` | 20→90 | 90→74 | 3300→5000 | 1→3 | damage, 攻撃経路, 新機構（移動竜巻・炎上感染・同時爆発） |
| `apocalypse_chain` | `detonation_mark` | 94→180 | 86→120 | 2300→2600 | 1→1 | damage, area, 新機構（連鎖起爆・拡散・最終爆発） |
| `solar_annihilation_array` | `scorching_ray` | 20→160 | 0→120 | 2560→240 | 1→3 | damage, area, cooldown, 攻撃経路, 新機構（鏡・集束爆発） |
| `hellfire_mine_network` | `ember_minefield` | 33→40 | 59→70 | 1970→3600 | 1→2 | damage, area, 攻撃経路, 新機構（連鎖爆発ネットワーク・刻印） |
| `inferno_blade_domain` | `flame_crescent` | 29→52 | 67→78 | 820→1400 | 1→2 | damage, area, 攻撃経路, 新機構（回転防御・障壁反撃） |
| `ash_legion` | `ash_doppelganger` | 0→18 | — | — | 0→1 | damage, 攻撃経路, 新機構（分身＋精霊の混成軍勢） |
| `star_devouring_furnace` | `bullet_furnace` | 28→120 | 75→110 | — | 1→2 | damage, area, 攻撃経路, 新機構（核＋放出弾） |
| `necroflame_mausoleum` | `funeral_pyres` | 68→92 | 64→122 | 2000→2600 | 2→4 | damage, area, 攻撃経路, 新機構（霊廟・炎柱） |
| `world_scorching_rift` | `magma_vein` | 10→62 | 0→44 | 1700→2600 | 1→3 | damage, area, 攻撃経路, 新機構 |
| `hexagram_inferno_array` | `tri_flame_array` | 32→122 | 108→112 | 3200→4200 | 3→6 | damage, area, 攻撃経路, 新機構（六芒星陣・コア引き込み・頂点ビーム） |
| `universal_flame_resonance` | `scorching_resonance` | 26→100 | 92→320 | 1600→2000 | 2→4 | damage, area, 攻撃経路, 新機構（炎上連鎖・最終共鳴爆発） |
| `doomsday_core` | `core_overdrive` | 90→100 | — | 650→650 | 2→8 | damage, 攻撃経路, 新機構（終末フェーズ） |

**18 件すべてが base Lv8 に対して 1 つ以上の明確な優位を持つ**（17 件は 2 つ以上）。
全項目で上回る必要はない設計であり、cooldown が伸びるもの（大技化）や damage 単価が下がるもの
（`thousand_flame_lances` は 70→60 だが発射数が 4→14 に増える）は意図された差別化。

進化後は**追加 Lv を持たず**（単一形態）、echo/clone ポリシーを全件宣言し、runtime を保存する。

## 4. 残した警告

**`FLAME_*` 警告は 0 件**（high / medium / low すべて 0）。M7-E で氷術師に残った 3 件のような未達はない。

理由つきで記録しておく低率（**不具合ではない**）:

| 対象 | 値 | 理由 |
|------|----|------|
| `hexagram_inferno_array` の `evolution-first`/slot6 取得率 | 0.0% | base `tri_flame_array`（rare）＋補助 `flame_vortex`（rare）の二重ハンデ。合算では 3% で到達可能。M6-F 以来の既知の低率 |
| `star_devouring_furnace` / `doomsday_core` の合算取得率 | 各 1% | base が legendary。終盤の legendary 軸として意図的。到達不能ではない |
| `random-valid` / `new-skill-priority` は枠が広いほど進化数が減る | slot8 で 0.46 / 0.56 | 進化を狙わない戦略の希釈特性（枠が広い＝新規取得が長く残る） |

## 5. 性能への影響

| 変更 | 影響 |
|------|------|
| CD 保存 21 件の追加 | `serializeRuntime()` の出力が 21 キー増える（各 1〜3 個の数値）。周回スナップショットは数十バイト増。実行時コストは無視できる |
| `eternal_pyre` の感染を炎上索引経由へ | 敵 100 体で 1 秒あたり約 330 回の全敵走査が消える（**改善**） |
| `eternal_pyre` / `solar_annihilation_array` の主発動記録 | 500 / 600ms に 1 回の `recordCast` が増える（残響予算 `maxEchoPerFrame` 内） |
| `skillCaps` 5 件削除 | `balance.json` が 30 行減る |
| `hellfire_mine_network` の 1 爆発あたり刻印上限 | 同時爆発時の `markEnemy` 呼び出しが減る（**改善**） |

## 6. 実施しなかったこと（対象外）

- active31 以降 / evolution19 以降 / 新 passive / 3 人目 job / 属性反応 / 新 status / 新 enemy・boss・difficulty
- 転生 legacy / job 間継承 / 限界突破 / equipment / pet / UI 全面改修 / 正式素材
- `save_version` の更新（v6 のまま）
- `frost_mage` のバランス変更
