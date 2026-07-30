# 火の魔女 完成監査（Milestone 8-A）

火の魔女（`flame_witch`）の **active30 / passive4 / evolution18** を対象にした完成監査の結果。
新しい active / passive / 進化 / ジョブ / 状態異常 / 敵 / ボス / 難易度は**一切追加していない**（監査と、そこで見つかった不具合の修正のみ）。
氷術師（`frost_mage`）の数値・挙動・候補列・状態異常・保存・カタログは**変更していない**（非回帰は本書末尾）。

- 対象コミット: 本 Milestone のコミット（`docs/project-state.md` を参照）
- 自動テスト: `tests/flame-*.mjs`（12 本）＋ `tests/validate-data.mjs` の M8-A ブロック
- 共通土台: `tests/flame-audit-common.mjs`（実データ読み込み・production 抽選コンテキスト・Phaser 非依存モック）

---

## 1. カタログ整合性とプール分離

`SkillCatalog.buildCatalog()`（production）を唯一の正として検証した。

| 項目 | 結果 |
|------|------|
| active | **30**（`jobs.json` の `activeSkillPool` と一致） |
| passive | **4**（`power_amp` / `swift_cast` / `scorch_expand` / `ember_persist`） |
| evolution | **18** |
| 合計 | **52** |
| `catalog.issues` | **0 件** |
| duplicate id / displayName | **0 件**（skills / evolutions / passives をまたいでグローバル一意） |
| 未登録クラス（JSON だけ存在） | **0 件** |
| 孤立クラス（REGISTRY だけ存在） | **0 件** |
| `SkillCatalog` = `poolEligibility` = `SkillDraftManager` の適格集合 | **一致** |
| 火 skill が氷へ出る / 氷 skill が火へ出る | **0 件** |
| 明示共通（`isCommon:true` / `jobs:["*"]`） | **0 件**（`jobs` 未指定を暗黙共通扱いしない） |
| Job Lv80「発射数+1」対象 | **6 種のみ**（`fireball` `flame_lance` `scatter_flame` `homing_wisp` `ricochet_ember` `core_overdrive`）・進化 18 種は対象外 |

rarity 分布（active30）: **common 8 / uncommon 10 / rare 9 / legendary 3**。

## 2. 進化対応表（18 件・到達可能性）

すべて `base Lv8 ＋ 補助 Lv4` の単一条件で、**分岐進化なし**（1 base → 1 進化）。
base / 補助はすべて `flame_witch` のプール内にあり、必要 Lv は上限内、自己参照・循環参照・進化の進化は 0 件。

| evolution | base（Lv8） | 補助 | 種別 | 必要Lv |
|---|---|---|---|---|
| `infernal_barrage` | `fireball` | `orbiting_flame` | active | 4 |
| `purgatory_eruption` | `flame_pillar` | `meteor` | active | 4 |
| `eternal_pyre` | `burning_trail` | `orbiting_flame` | active | 4 |
| `thousand_flame_lances` | `flame_lance` | `swift_cast` | passive | 4 |
| `hundred_wisp_parade` | `homing_wisp` | `fire_spirit` | active | 4 |
| `solar_core_collapse` | `lava_bomb` | `scorch_expand` | passive | 4 |
| `infernal_vortex_wheel` | `flame_vortex` | `burning_trail` | active | 4 |
| `apocalypse_chain` | `detonation_mark` | `power_amp` | passive | 4 |
| `solar_annihilation_array` | `scorching_ray` | `swift_cast` | passive | 4 |
| `hellfire_mine_network` | `ember_minefield` | `detonation_mark` | active | 4 |
| `inferno_blade_domain` | `flame_crescent` | `flame_barrier` | active | 4 |
| `ash_legion` | `ash_doppelganger` | `fire_spirit` | active | 4 |
| `star_devouring_furnace` | `bullet_furnace` | `phoenix_feather` | active | 4 |
| `necroflame_mausoleum` | `funeral_pyres` | `phoenix_feather` | active | 4 |
| `world_scorching_rift` | `magma_vein` | `burning_trail` | active | 4 |
| `hexagram_inferno_array` | `tri_flame_array` | `flame_vortex` | active | 4 |
| `universal_flame_resonance` | `scorching_resonance` | `chain_flame` | active | 4 |
| `doomsday_core` | `core_overdrive` | `bloodfire_pact` | active | 4 |

集計:

- 進化対象 active **18 種** / 進化非対象 **12 種**
  （`orbiting_flame` `meteor` `scatter_flame` `chain_flame` `fire_spirit` `phoenix_feather` `flame_barrier`
  `ricochet_ember` `bloodfire_pact` `four_sided_inferno` `molten_chains` `blazing_step`）
- 分岐進化 **0 件**
- 補助の共有: active 補助 `orbiting_flame`×2 / `fire_spirit`×2 / `burning_trail`×2 / `phoenix_feather`×2 /
  `meteor`×1 / `detonation_mark`×1 / `flame_barrier`×1 / `flame_vortex`×1 / `chain_flame`×1 / `bloodfire_pact`×1
- passive 補助の要求数: `swift_cast`×2 / `power_amp`×1 / `scorch_expand`×1 / **`ember_persist`×0**
- 到達不能 / 循環 / 自己参照: **0 件**

> **`ember_persist` は進化補助ではない**（火の 18 進化のうち passive 補助はわずか 4 件で、14 件は active 補助）。
> ただし `duration` modifier が `PassiveManager.getDurationMultiplier()` → 各スキルの `passiveDurationMult()` で
> 実際に参照されるため、**死に passive ではない**。氷術師（passive 補助 4/4）とは設計が異なる点として記録する。

進化は `EvolutionManager` / `SkillManager.evolve()` が base を**置換**する（active 枠は増えない）。
進化後は追加 Lv を持たず（単一形態）、通常ドラフト候補（`draftCatalog`）にも含まれない。
`support` に active を使う進化でも、置換されるのは base だけで support は残る。

## 3. 死にコンテンツの解消（M8-A の主な修正）

### 3.1 死にパラメータ 21 件 → 0 件

| # | 対象 | 対応 |
|---|------|------|
| 1-3 | `fireball` / `flame_pillar` / `burning_trail` の `evolution` ブロック（`skills.json` 側の旧定義） | **削除**（進化の正は `skill-evolutions.json` のみ・実装は一度も読んでいなかった） |
| 4 | `bloodfire_pact.buffDamage` / `buffMs` | **削除**（実装が「no-op タイマー」と明記していた予約値。HP コストの見返りは発動時のバーストで表現する設計を維持し、バランスは不変） |
| 5 | `four_sided_inferno.burnMs` | **削除**（炎上を付与する経路が無く、追加すると火力バランスが変わるため予約値を除去） |
| 6 | `inferno_blade_domain.projectileCount.sweeps` | **削除**（多段化するとバランスが変わるため） |
| 7 | `necroflame_mausoleum.area.senseRadius` | **削除**（対応する感知処理が無い） |
| 8 | `universal_flame_resonance.config.countRadius` | **削除**（共鳴 tier は `burningCount()`＝全画面で決まる設計と矛盾していた） |
| 9 | `infernal_barrage.chain.onKillExtra` | **実装へ接続**（撃破時の追撃火球数。値 1 のため挙動は不変） |
| 10 | `infernal_barrage.chain.chainExplosion` | **実装へ接続**（着弾爆発の有無ゲート。値 1 のため挙動は不変） |
| 11 | `purgatory_eruption.pull.excludeBoss` | **実装へ接続**（ハードコードのボス除外を data 駆動へ。挙動不変） |
| 12 | `solar_core_collapse.pull.excludeBoss` | **実装へ接続**（同上） |
| 13 | `thousand_flame_lances.chain.splitOnPierce` | **実装へ接続**（分裂世代数。`safetyCaps.maxSplitGenerations` でクランプ・値 2 のため不変） |
| 14 | `thousand_flame_lances.damage.rampMax` | **実装へ接続**（連続命中の上昇上限。従来のハードコード `×1.6` と同値） |
| 15 | `hundred_wisp_parade.chain.splitOnKill` | **実装へ接続**（撃破時の分裂数。値 1 のため不変） |
| 16 | `infernal_vortex_wheel.chain.infect` | **実装へ接続**（感染世代番号。値 1 のため不変） |
| 17 | `apocalypse_chain.chain.spreadOnChain` | **実装へ接続**（連鎖時の拡散ゲート。値 1 のため不変） |
| 18 | `apocalypse_chain.projectileCount.spreadCount` | **実装へ接続**（1 起爆あたりの拡散上限。総数は `maxSpreadPerChain` が上限のまま） |
| 19 | `solar_annihilation_array.projectileCount.auxBeams` | **実装へ接続**（補助光線の本数上限。`mirrors` と同値のため不変） |
| 20 | `hellfire_mine_network.projectileCount.markTargets` | **実装へ接続**（1 爆発あたりの刻印数上限） |
| 21 | `hexagram_inferno_array.projectileCount.vertices` | **実装へ接続**（陣の頂点数。既定 6 のため不変） |

### 3.2 未参照 quality cap 5 件 → 0 件（M7-E の残課題を解消）

| cap | 対応 |
|-----|------|
| `maxCopyGeneration` | **削除**（`maxEchoCloneGeneration` と値・用途が完全重複） |
| `maxChainTargets` | **削除**（`maxChainDepth` と値・用途が完全重複） |
| `maxBurningEnemyIndex` | **削除**（炎上索引は敵数（`maxEnemies`）で自然に有界。参照を足すと低品質で共鳴段階＝火力が変わるため） |
| `maxBarrierEffects` | **削除**（複数障壁の概念が無く、参照を足すと低品質で反撃回数＝火力が変わるため） |
| `maxMainCastEventsPerFrame` | **削除**（残響の毎フレーム上限は `combatCaps.maxEchoPerFrame` が担う。参照を足すと低品質で発動数・残響が変わるため） |

**方針**: 「使うと品質によってダメージが変わってしまう cap」は追加せず削除した。
`validate-data.mjs` の許容リストは**空**になり、以後は未参照 cap があるとエラーになる。

### 3.3 死にフィールド（実装側）

- `SkillBase._initCd` — 宣言のみで一度も読まれていなかった。**削除**。
- `AshLegionSkill.serializeState()` / `SolarAnnihilationArraySkill.serializeState()` が `{}` を返すだけで
  `restoreState` も無かった。**実状態の保存/復元を実装**（下記 4.1）。
- `AshDoppelgangerSkill` は `spawned` を保存していたが `restoreState` が空の no-op だった。**複製タイマーの保存へ置換**。

## 4. 修正した重大な不具合

### 4.1 火の魔女スキル 21 種のクールダウンが保存されず、再開で無料発動していた

M7-A 後に氷術師で修正した不具合（`bad8bd4`）と**同じクラスの欠陥が火の魔女側に残っていた**。
`serializeRuntime()` は `serializeState()` を持つスキルしか保存しないため、以下は `active_run.skillRuntime` に
一切載らず、**リロード直後に CD が全回復して無料で発動**していた。

対象（active 13 / evolution 8）:
`fireball` `flame_pillar` `burning_trail` `orbiting_flame` `meteor` `flame_lance` `scatter_flame` `homing_wisp`
`chain_flame` `lava_bomb` `flame_vortex` `fire_spirit` `detonation_mark` /
`infernal_barrage` `purgatory_eruption` `eternal_pyre` `thousand_flame_lances` `hundred_wisp_parade`
`solar_core_collapse` `infernal_vortex_wheel` `apocalypse_chain`

修正内容:

- CD 型（18 種）は `serializeState(){ cdLeft }` / `restoreState()` を追加。
- 常設型は CD を持たないため、**位相と主発動スロットル**を保存する。
  - `orbiting_flame`: `angle` / `castPulse`
  - `fire_spirit`: `angle` / `castPulse` / 各精霊の `shotTimer`
  - `eternal_pyre`: `auraTick` / `infectTick` / `castPulse`
- 設置物・召喚物そのものは保存しない（寿命つき／`_rebuild`・`_ensure` が data の個数へ再構築するため**二重生成しない**）。
- `ash_doppelganger` / `ash_legion` / `solar_annihilation_array` も同様に、
  複製タイマー・ユニットタイマー・集束ビームの残り時間を保存するようにした（以前は再開直後に全ユニットが無料で一斉発動）。

**結果**: `skillsWithRuntimeState()` は火の魔女 48 件すべてを含むようになり、
`tests/flame-complete-determinism.mjs` の「継続 vs save→reload」比較で無料 cast は 0 件。

### 4.2 `eternal_pyre` / `solar_annihilation_array` の残響・分身が一度も発生しなかった

どちらも `canFire() { return false; }` の常設型で `recordCast` を一度も呼んでおらず、
`recordCast → _onSkillCast → jobMods.registerCast → _triggerEcho` の共通経路に乗っていなかった。
その結果、data で `echoPolicy: standard` を宣言していても **Job Lv50 の残響詠唱・灰燼分身の複製が絶対に起きない**
状態になっていた（進化元の `burning_trail` / `scorching_ray` では発生する＝進化で機能が失われる）。
`solar_annihilation_array` は `echoCast()` を実装済みで、その実装が**到達不能コード**になっていた。

修正内容:

- 主発動イベントを `orbiting_flame` / `fire_spirit` と同じ方式で**スロットルして 1 回だけ記録**する
  （`config.castPulseMs` を data へ追加: `eternal_pyre` 500ms / `solar_annihilation_array` 600ms）。
- `echoPolicy` / `clonePolicy` を実装に合わせて **`custom`（攻撃部分のみ）** へ修正。
- `eternal_pyre` に `echoCast()` / `cloneCast()`（炎の領域を 1 回ぶん追加パルス）を実装。
  以前は `standard` 宣言に対して `fire()` すら無く、仮に呼ばれても no-op だった。

### 4.3 `eternal_pyre` の感染が毎回全敵を総当たりしていた

`spreadInfection()` が `scene.enemyPool.forEachActive(...)` で毎 tick 全敵を走査していた。
M6-E で「全敵走査を避ける軽量索引」として炎上索引（`combat.burningEnemies()`）を用意した目的に反していたため、
索引経由へ付け替えた（対象集合は「生存かつ炎上中・ボス以外」で同じ）。

## 5. SkillAudit / recordCast / echo / clone

48 件すべてで検証し、**未解決 issue は 0**（残るのは下記 2 種の仕様のみ）。

- `id` / 実装クラス / data / job / rarity / `castMode` / `mainCastEvent` / `element`(tags:fire) / `maxLevel`
- `echoPolicy` / `clonePolicy` / `canTriggerEcho` / `canBeCopiedByClone` / `lv80ProjectileTarget`
- `recordCast` は主発動 1 回のみ。派生（`_tick` / `_pulse` / `_burst` / `_chain` / `_shoot` / `_detonate` /
  `_impact` / `_explode` / `_lance` / `_retaliate` / `onEnemyKilled` / `onDash` ほか）では呼ばない。
  `Projectile` / `_chainHit` / `_splitLance` / `chainDetonate` も呼ばない（弾・連鎖・分裂・起爆で発動数が増えない）。
- `echoCast` / `cloneCast` から `recordCast` を呼ばない（残響で発動数が二重にならない）。
- 再帰なし: `echoCast` が自分自身や `requestEchoCast` / `performClone` を呼ばない。
  `CastPolicy` が `origin !== 'normal'` を弾き、`suppressEcho`/`suppressClone` を子へ立て、`generation > maxGen` で停止する。
  `powerMultiplier` は 1 回だけ乗り、`parentSkillId` / `rootSkillId` は子へ引き継がれる。
- 爆発の再帰なし: `isMarkDetonation` で再起爆を止め、`_explosionBudget` / `_deathExpBudget` / `_extraFbBudget` /
  `chainDetonate` の `maxDepth` / `maxSpread` が有限化する。

意図した仕様として残す 2 種:

1. **防御 / 反応スキルは `recordCast` 0 回**（`phoenix_feather` `flame_barrier` `bullet_furnace` `star_devouring_furnace`）。
   発動数に数えず、残響カウンタも進めない。
2. **`echo`/`clone` とも `forbidden` の常設型は `recordCast` 0 回**（`ash_doppelganger` `ash_legion` `blazing_step`）。
   複製の起点であって攻撃サイクルを持たないため、残響カウンタを進めない設計。

## 6. Job Lv 監査（Lv1〜100）

`data/job-progression.json` の `flame_witch` を `JobModifierManager.resolve()` と突き合わせた。

- 基本成長: `fireDamagePerLevel` 0.35%/Lv・`fireDotPerLevel` 0.50%/Lv・`fireAreaPerLevel` 0.10%/Lv（すべて正・実装が参照）
- milestone 11 件（Lv5 / 10 / 20 / 30 / 40 / 50 / 60 / 70 / 80 / 90 / 100）はすべて `resolve()` の `case` に対応
  （`fireDamageMult` / `projectileSpeedMult` / `cooldownMult` / `rerollBonus` / `explosion` / `echo` /
  `evolvedDamageMult` / `rarityWeight` / `projectileCount` / `echoUpgrade`）。**死に milestone 0 件**。
- 属性ダメージ補正は `tags.element === primaryElement` のときだけ適用される（**氷へ誤適用しない / 火へ氷補正が乗らない**）。
- `resolvedJobModifiers` は周回開始時に凍結され、reload で不変。スキルから `profile.jobLevel` を直接参照しているものは 0 件。
- Lv80「発射数+1」は **`lv80ProjectileTarget:true` の 6 種だけ**へ適用され、`fireProjectileCount()` の使用と 1:1 で一致する。
  進化 18 種は対象外。
- Lv100「完全残響」でも `CastPolicy` の generation 上限により再帰キャストは生じない。

## 7. 炎上 / DoT / 爆発 / 共鳴

火の魔女の「炎上（burning）」は**マーカー（`Enemy.ignited` / `_igniteUntil`）** であり、
継続ダメージ自体は各スキルの設置物・領域が `tag:'dot'` で与える（氷の chill/frozen とは別体系）。

- 炎上を付与するのは `eternal_pyre` / `infernal_vortex_wheel` / `solar_core_collapse` / `scorching_resonance`（延長）。
- 炎上数は共鳴段階（`scorching_resonance` / `universal_flame_resonance` の tier）を決める入力になる。

ヘッドレス計測（60 秒・敵 24 体・実スキル駆動）:

| 指標 | 値 |
|------|----|
| 炎上付与 / 延長 | 24 回 / 4,776 回（同一対象への再付与は「延長」＝スタックしない） |
| 同時炎上ピーク | 24 体（対象数を超えない） |
| 平均炎上持続 | 1,600ms |
| DoT tick / 総ダメージ | 40,344 回 / 627,456（平均 15.55/tick） |
| 爆発 / 二次爆発 | 150 回 / **0 回**（一次を上回らない＝再帰なし） |
| 灼熱共鳴パルス | 38 回（tier 最大 2・追加爆発 74 回） |
| 万象炎鳴 | パルス 30 回 / 連鎖 696 本 / 最終爆発 15 回（1 パルスあたり 23.2 本＝無限連鎖でない） |
| 炎上索引の残留 | **0 件**（全敵死亡後に索引が空になる） |

`FLAME_*` 警告は **0 件**（severity=high も 0）。
low / ultra いずれの品質でも DoT tick・DoT ダメージ・炎上付与は 0 にならない。

## 8. 保存・復元・決定論

- 48 件すべてで `serializeRuntime` → `restoreRuntime` の往復が例外なし・JSON 化可能（循環参照なし）。
- runtimeState に Graphics / Text / Tween / Timer / enemy / projectile 参照を含まない。
- 設置物・召喚物・分身・軍勢・砲台は復元で**二重生成しない**（`restoreRuntime` を 2 回適用しても増えない＝冪等）。
- 進化後に元 active のインスタンス・runtime が残らず、reload しても元 active は復活しない。
- 48 件すべてで `Math.random` / `Date.now` / `performance.now` / 抽選 RNG を使わない。
  乱数は seed 由来の `scene.rng` のみ（同 seed で同じ列、別 seed で別の列）。
- 「継続」と「save→reload」で以後の発動量が一致（無料 cast 0・沈黙 0）。
- `save_version` は **v6 のまま**（加算的変更のみ・移行処理不要）。

## 9. cleanup

- 48 件の `destroy()` が保持コレクション（`patches` `orbs` `vortices` `spirits` `mines` `clones` `waves`
  `tethers` `trails` `pyres` `zones` `veins` `segments` `arrays` `beams` `blades` `units` `mausoleums`
  `burnPatches` `visuals`）を空にし、`ring` / `aura` / `_beam` などの単体保持も解放する。
- `SkillManager.destroy()` が全スキルへ伝播し、`skills` が空になる。
- 進化置換で元 active のインスタンスが消え、同一周回で再進化できない。
- `Enemy.reset()` が `_igniteUntil` / `_igniteGen` / `_mark` / `_chill` / `_frozenUntil` / `_freezeImmuneUntil` /
  `_iceSeal` / `_iceHitCount` をクリアする（プール再利用の残留なし）。
- `delayedCall` を使うスキルはすべて `_dead` / `_destroyed` / `gameOver` の破棄ガードを持ち、
  destroy 後に時間を進めても例外・追加ダメージが出ない。
- 死亡イベント履歴は `retain`/`release` と `maxDeathEventsTracked` で有界。

## 10. テレメトリ

- 48 件すべてで cast / hit / damage / extra のいずれかが記録される（テレメトリ 0 のスキルなし）。
- `recordCast` の回数と `casts` が一致し、残響 / 分身の再実行では増えない（**二重計上なし**）。
- 常設型（`orbiting_flame` `fire_spirit` `eternal_pyre` `solar_annihilation_array`）は
  主発動をスロットルして記録する（毎フレーム記録しない）。
- 進化スキルは**自分の id** で記録し、進化後に元 active の damage は増えない。
- `debugRun` は `summaryBySkill` / `recentRuns` へ入らず `debugRuns` にのみ入る。
- 同じ周回スナップショットを 2 回畳み込んでも `samples` に正しく反映され、DPS は跳ねない。
- **外部送信なし**（`fetch` / `XMLHttpRequest` / `sendBeacon` / `WebSocket` / 外部 URL を含まない）。

## 11. 氷術師（frost_mage）の非回帰

M8-A の変更後に、氷側が**一切変わっていない**ことを機械的に確認した。

| 検証 | 結果 |
|------|------|
| 同一 seed のドラフト候補列（300 seed × 8 ドラフト）の SHA-256 | 変更前後で**完全一致** |
| 氷 active30 / 進化18 の呼び出しトレース＋`serializeRuntime` の SHA-256 | 変更前後で**完全一致** |
| 氷カタログ（30 / 4 / 18・issues 0） | 不変 |
| `frost-*` 監査テスト 12 本 | 全通過 |
| `status-save-nonregression` / `status-visibility-nonregression` / `frost-cooldown-save` | 全通過 |
| passive のジョブプール分離（`passive-pool-audit`） | 全通過 |

火の魔女側の同一 seed のドラフト候補列も**変更前後で完全一致**（データ削除は抽選に使うフィールドを含まないため）。

## 12. 残した警告 / 既知の制約

- `FLAME_*` 警告は 0 件（severity=high / medium / low いずれも 0）。
- ヘッドレス計測は「敵が移動せず死なない」飽和条件のため、**火力バランスの判定には使えない**
  （進化前後の比較は data 由来の項目差分で行っている）。
- 抽選シミュレーションは **level-up 回数に強く依存**する（30 回で平均 0.24、60 回で 2.20、90 回で 2.37）。比較は同じ `levelUps` で行う。
- 実ブラウザ（Phaser 実プレイ）確認は本環境では未実施。`docs/test-guide.md` の **Milestone 8-A** 節を参照。

---

## 補記: Milestone 9-A（3 ジョブ横断監査）での追加確認

- 本書（M8-A）の監査結果は M9-A の横断監査でも維持されている（カタログ / プール / 抽選 /
  recordCast / cooldown / runtimeState / 決定論を 3 ジョブ同一条件で再確認）。
- **品質分離（M9-A）による変更**: 本ジョブの gameplay / safety に当たる cap は単一値
  （canonical = 旧 high）になった。品質で対象数・実体数・tick 数が変わる挙動は**仕様から削除**された。
- **cdLeft の改ざん耐性**が `SkillManager.restoreRuntime` の共通入口として全 48 スキルへ適用された
  （正当なセーブの復元結果は不変）。
- 詳細は `./cross-job-system-audit.md` / `./quality-cap-classification.md`。

---

> **M9-A.1 追記**: 本監査の後、3 ジョブ横断の production 全経路ハーネス（弾 / DoT / 場 / reactive /
> ボス / XP まで解決）が完成し、ジョブ間の絶対比較と warning 分類が
> `docs/cross-job-final-balance.md` に記録された（本ジョブのバランス値の変更は 0 件）。
> ハーネスの構成は `docs/cross-job-full-balance-harness.md`。
