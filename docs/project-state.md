# Project State

> Reincarnation Flame Survivor の**現在地**を 1 枚にまとめた引き継ぎ用ファイル。
> **各 Milestone 完了時に必ず更新する**（完了報告の要約・コミットID・テスト結果・次 Milestone）。
> compact 後・新セッション開始時は `CLAUDE.md` → `README.md` → `TODO.md` → 本ファイル → `git log -5 --oneline` の順で確認する。
>
> 最終更新: Milestone 8-D 完了時点

## Current branch

- ブランチ: **`claude/funny-heisenberg-frhgq9`**（`CLAUDE.md` の継続ブランチ。指定なき限りここへコミット・プッシュ）
- 直近コミット:
  - `M8D_COMMIT` Milestone 8-D: 戦士スキル拡張 Wave2（active25 / 進化13・打ち上げ/前面防御/掴み投げ/戦旗/低HP）
  - `02ab13e` Milestone 8-C.1 ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `6f9b1de` Milestone 8-C.1: 戦士4枠時の進化導線修正（ジョブ限定 guidance ＋ 進化導線 pity）
  - `7e24e1a` Milestone 8-C ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `bae3f34` Milestone 8-C: 戦士スキル拡張 Wave1（active15 / 進化8・処刑/反撃調停/戦吼/引き寄せ）
  - `4a621b6` Milestone 8-B.1 ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `601fe2a` Milestone 8-B.1: passive 再計算バグ修正（status passive を passives.version で単一トリガー化）
  - `4c8bd10` Milestone 8-B: 戦士 基盤実装（active5/passive4/進化3・闘気/コンボ/強靱/不屈/体勢崩し）
  - `ec503fe` docs: M8-A 取り込み後の継続ブランチを docs/project-state.md へ反映
  - `2846906` Milestone 8-A ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `bca7ec3` Milestone 8-A: 火の魔女 完成監査（CD保存漏れ/残響未発火/死にフィールド/未参照capの修正）
  - `338f25c` 環境整備: CLAUDE.md へ Compact Instructions を追記し docs/project-state.md を新規作成
- 作業ツリー: クリーン（未コミットの変更なし）

## Current milestone

- **Milestone 8-D（戦士スキル拡張 Wave2）完了・停止中。** 次の指示待ち。
- 戦士を **active 15 → 25 / evolution 8 → 13** へ拡張した（passive は 4 種のまま・Job Lv1〜100 据え置き）。
- **Job Lv80「打撃数 +1」の対象は 3 ジョブとも 6 種のまま**（Wave2 の 15 種はすべて対象外）。
- 火の魔女・氷術師は**数値 / 挙動 / 候補列 / 状態異常 / 保存とも完全に不変**。`save_version` は **v6 のまま**。

### M8-D で足したもの

| 分類 | 内容 |
|------|------|
| active 10 | 昇竜斬 `rising_slash` / 鉄壁突進 `shield_charge` / 燕返し `backstep_riposte` / 豪腕投げ `battlefield_throw` / 三段砕き `triple_crush` / 刃防陣 `blade_guard` / 狂戦猛進 `berserker_rush` / 戦斧投擲 `war_axe_throw` / 破城膝撃 `breaker_knee` / 戦旗招集 `rallying_banner` |
| evolution 5 | 天衝断空 `heaven_rending_ascent` / 城塞蹂躙 `fortress_rampage` / 無影燕返 `shadow_swallow_riposte` / 山岳投擲 `mountain_hurl` / 血盟戦旗 `blood_oath_standard` |
| 共通機構 5 | 打ち上げ `launch` / 前面防御 `frontalGuard` / 掴み・投げ `grab` / 戦旗の陣 `rally` / 低 HP スケーリング `lowHp` |
| skillCaps | 20 件追加（damage/event 10・visual 10・計 205 件・**未参照 0**） |
| guidance | `activeSupportWeightMultiplier`（1.6）を 1 キー追加 |

### M8-D の重要な設計判断

1. **共通機構はすべて `WarriorCombatSystem` へ集約した。** BattleScene へスキルごとの状態を散らさない。
   スキルクラスは判断をせず、`launchPolicy()` / `grabPolicy()` の結果に従うだけ
   （**スキル側で `isBoss` / `isElite` を見ない**）。上限はすべて `balance.json` の `warrior` ブロック。
2. **打ち上げ・掴みが効くのは通常敵だけ。** エリートは体勢削り / その場叩きつけ、ボスは掴めず重い体勢打撃へ置換。
   打ち上げは滞空 `maxAirborneMs`（900ms）と免疫 `immuneMs`（1200ms）で無限に浮かせられない。
3. **前面防御は方向の分かる被弾だけ**（`requireDirection: true`）。
   側面 ×0.35・背面 ×0・単体上限 55%・合計軽減は従来どおり 70% クランプ＝**無敵にならない**。
   `Player.takeDamage(amount, from)` の第 2 引数は**任意**で、火 / 氷の被弾経路は渡さない
   → **火 / 氷の被弾計算は 1 バイトも変わらない**。
4. **掴みは敵オブジェクトを保持しない**（安定 runtime id `_seq` のみ）。同時 1 体・時間切れで必ず解除・
   **保存しない**（reload で敵参照や無料の着地衝撃を作らない）・**投げから投げが連鎖しない**。
5. **戦旗の陣は常に 1 つ**（重ねがけは置換）。効果が乗るのは**戦士本人が内側にいるときだけ**で、
   外へ出れば即座に 0。血盟戦旗の回復強化は**既存の毎秒 cap を共有**したまま cap を少し上げるだけ
   ＝永久機関にならない。
6. **低 HP スケーリングは自傷せず処刑もせず**必ず頭打ち（×1.6）。実装は 1 か所だけ。
7. **戦斧投擲は `Projectile` を使わない。** `Projectile.reset()` は火 / 氷の状態異常フィールドを多数持ち、
   そこへ物理投擲を混ぜると非回帰ハッシュが壊れるため、`combat.thrownStrike`
   （= `meleeStrike` の `isThrown` 版）を毎フレーム動かす「移動する判定ボリューム」として実装した。
   **近接ダメージ倍率が乗らない**・同一敵へは行き / 帰りで最大 2 回。
8. **共通経路への追加は「明示したときだけ効く」形にした。**
   `meleeStrike` の `isThrown` / `launch` / `seqHitCounts` / `toughPoiseBonus` はいずれもオプションで、
   未指定なら従来と完全に同じ経路を通る。`Enemy` の 4 フィールドも既定値（0 / false）では移動抑止が働かない。
9. **guidance の追調整はしきい値を 1 つも下げずに行った。**
   active25 で薄まるのは「補助が **active** のレシピ」（枠を 1 つ食い必要 Lv も高い）だけなので、
   そこにだけ `activeSupportWeightMultiplier`（1.6）を乗せる。
   判定は候補のカテゴリ（`m.category === 'active'`）だけで、**skill ID のハードコードなし**。
   1.9 / 2.2 も測ったが `mountain_hurl` はほぼ伸びず素朴戦略の枠4 到達率だけ落ちたので 1.6 を採用。

### M8-D の到達率（200 seed・素朴戦略・しきい値は M8-C.1 から据え置き）

| 構成 | 実測 | 目標 |
|------|------|------|
| 枠4 / 40lv・進化 1 個以上 / 平均 / 0 個 | **85.0% / 1.17 / 15.0%** | 80% 以上 / 1.0 以上 / 20% 以下 |
| 枠6 / 60lv・1 個以上 / 2 個以上 / 平均 | **99.0% / 88.0% / 2.38** | 95% / 60% / 1.7 |
| 枠8 / 80lv・1 個以上 / 2 個以上 / 平均 | **100.0% / 98.5% / 3.46** | 95% / 65% / 1.8 |
| 最頻進化のシェア（枠4 / 6 / 8） | **19.3% / 16.8% / 14.2%** | 35% 以下 |
| 取得 0 の active / evolution | **0 件 / 0 件** | 0 件 |
| 候補ゼロ / 混入 / 重複 / 枠違反 | **0 件** | 0 件 |

active 補助の進化（`heaven_crushing_descent` / `mountain_hurl`）は guidance の追調整で
枠4 で 8 → 20 件、枠6 で 84 → 110 件、枠8 で 177 → 255 件（5 方針 × 200 seed = 1000 run）へ改善した。

## Completed milestones

| Milestone | 内容 |
|-----------|------|
| M1 | 起動・タイトル・移動・ダッシュ・敵出現・自動攻撃・経験値・レベルアップ3択 |
| M2 | 複数スキル・5分ボス・勝利・リザルト・途中再開 |
| M3 | 拠点・残り火・恒久強化・難易度・熟練度・統計 |
| M4 | 進化・転生・魂炎 |
| M5-A | SpatialGrid・PoolManager・性能計測・品質別上限・負荷テスト |
| M5-B | browser/folder save・JSON入出力・backup・競合解決・multi-tab・SaveCoordinator |
| M6-A〜E | スキル抽選基盤（SeededRandom / SkillDraftManager）・火の魔女 active30 / 進化18・CastPolicy / SkillAudit |
| M6-F | SkillCatalog・DraftBalanceAnalyzer・CombatTelemetry・RunBalanceSummary・BalanceWarnings・BalancePlaytest（F8） |
| M7-A | 2人目ジョブ「氷術師」＋汎用状態異常基盤（active5 / 進化3）。以後 CD 保存修正（`bad8bd4`） |
| M7-B | 氷術師 active15 / 進化8。追加監査で passive のジョブプール分離を修正（`9eb7277`） |
| M7-B.1 | 状態異常の視認性（StatusVisualManager / BossFrostbreakDisplay / StatusDebugPanel F10）（`aee0886` `602277b`） |
| M7-C | 氷術師 active25 / 進化13（`586ef02` `8ad5ec2`）。追加監査で `bossGaugeMult` の死に項目を修正（`303c391`） |
| M7-D | 氷術師 active30 / 進化18（カタログ完成・火の魔女と同規模）（`afc4401` `3a3f9cc`） |
| M7-E | 氷術師 完成監査（カタログ / プール分離 / 進化到達率 / 抽選シミュレーション / 死にコンテンツ / 保存 / 決定論 / 状態異常 / cap / cleanup / telemetry）（`3e6c7ed`） |
| M8-A | 火の魔女 完成監査（カタログ / プール分離 / 進化到達率 / 抽選シミュレーション / 死にコンテンツ / SkillAudit / 保存 / 決定論 / 炎上・DoT・爆発・共鳴 / cap / cleanup / telemetry）（`bca7ec3` `2846906` `ec503fe`） |
| M8-B | **3 人目のジョブ「戦士」基盤実装**（active5 / passive4 / 進化3 / Job Lv1〜100 ／ 闘気・コンボ・強靱・不屈・撃破回復・体勢崩し ／ 近接判定の共通経路 ／ 戦士 HUD・オート移動・F8/F9 ／ `warriorState` 保存 ／ 3ジョブ非回帰）（`4c8bd10`） |
| M8-B.1 | passive 再計算バグ修正（status 乗率・戦士 mods を `passives.version` 単一トリガーへ）（`601fe2a` `4a621b6`） |
| M8-C | 戦士スキル拡張 Wave1（active15 / 進化8・処刑 / 反撃調停 / 戦吼 / 引き寄せ）（`bae3f34` `7e24e1a`） |
| M8-C.1 | 戦士 4 枠時の進化導線修正（ジョブ限定 guidance ＋ 進化導線 pity・新規コンテンツなし）（`6f9b1de` `02ab13e`） |
| **M8-D** | **戦士スキル拡張 Wave2**（active25 / 進化13・打ち上げ / 前面防御 / 掴み投げ / 戦旗の陣 / 低 HP スケーリング・guidance へ active 補助補正を 1 キー追加）（`M8D_COMMIT`） |

## Job catalog counts

| ジョブ | id | 属性 | active | passive | evolution | Job Lv |
|--------|----|------|--------|---------|-----------|--------|
| 火の魔女 | `flame_witch` | fire | **30** | **4** | **18** | 1〜100 |
| 氷術師 | `frost_mage` | ice | **30** | **4** | **18** | 1〜100 |
| **戦士** | **`warrior`** | **physical** | **25** | **4** | **13** | **1〜100** |

- 合計: 火 52 / 氷 52 / **戦士 42**（M8-D Wave2 時点）。`SkillCatalog.buildCatalog()` の issues は **3 ジョブとも 0**。
- active slot 4 → 6 → 8（転生で拡張）、passive slot 4。全 active は maxLevel 8、進化は単一形態（Lv 固定）。
- Job Lv80「発射数+1」対象は**明示 flag（`lv80ProjectileTarget:true`）のみ**。
  火 6 種（`fireball` `flame_lance` `scatter_flame` `homing_wisp` `ricochet_ember` `core_overdrive`）/
  氷 6 種（`frost_shard` `glacial_lance` `icicle_volley` `rime_boomerang` `polar_star` `glacial_spear_rain`）。
  **進化 18 種は両ジョブとも全て対象外。**
- 火 passive 4 種: `power_amp` / `swift_cast` / `scorch_expand` / `ember_persist`。
- 氷 passive 4 種: `frost_amplification` / `rapid_freezing` / `frozen_expansion` / `lingering_cold`。
- **戦士 passive 4 種**: `brute_force`（剛力）/ `heavy_armor`（重装）/ `combat_instinct`（戦闘本能）/ `bloodlust`（血気）。
- **戦士 active 25 種**（M8-B の 5 ＋ M8-C の 10 ＋ M8-D の 10）:
  `great_cleave`（初期）/ `shield_bash` / `whirlwind_slash` / `charge_slash` / `ground_slam` ＋
  `armor_breaker` / `twin_fang_slash` / `execution_strike` / `leap_smash` / `sweeping_advance` /
  `counter_stance` / `war_cry` / `chain_hook` / `shockwave_stomp` / `relentless_combo` ＋
  `rising_slash` / `shield_charge` / `backstep_riposte` / `battlefield_throw` / `triple_crush` /
  `blade_guard` / `berserker_rush` / `war_axe_throw` / `breaker_knee` / `rallying_banner`。
  **全て物理**で、画面を横断する斬撃波・弾は 1 つも生成しない。
  唯一の例外は `war_axe_throw`（往復する短距離投擲）だが、これも `Projectile` を使わず
  スキルが動かす判定ボリュームで、**近接ダメージ倍率が乗らない**（`isThrown`）。
- **戦士 evolution 13 種**（M8-B の 3 ＋ M8-C の 5 ＋ M8-D の 5）:
  `thousand_blade_dance`（大薙ぎ+戦闘本能）/ `bloodstorm_whirlwind`（旋風斬り+血気）/
  `unyielding_fortress`（盾撃+重装）＋ `skull_splitter`（兜割り+剛力）/
  `crimson_execution`（処刑斬+血気）/ `war_god_roar`（戦吼+戦闘本能）/
  `adamant_counter`（迎撃の構え+重装）/ `heaven_crushing_descent`（跳躍強襲+**active 地砕き Lv6**）＋
  `heaven_rending_ascent`（昇竜斬+剛力）/ `fortress_rampage`（鉄壁突進+重装）/
  `shadow_swallow_riposte`（燕返し+戦闘本能）/ `mountain_hurl`（豪腕投げ+**active 地砕き Lv6**）/
  `blood_oath_standard`（戦旗招集+血気）。
  **進化を持たない active は 11 種**（Wave1 の 6 種 ＋ `triple_crush` `blade_guard`
  `berserker_rush` `war_axe_throw` `breaker_knee`）。
  `ground_slam` は**天墜崩撃と山岳投擲の 2 つ**の active 補助を兼ねる（置換されず CD にも触らない）。
- **戦士の Lv80「打撃数+1」対象は 6 種のまま**（`great_cleave` `shield_bash` `ground_slam`
  `armor_breaker` `twin_fang_slash` `relentless_combo`）。**進化 13 種と Wave2 の active 10 種は全て対象外。**
- **戦士は共通状態異常を 1 つも使わない**（`jobs.json` の `statusEffects` が空）。体勢は専用ゲージ。
- 火の進化 18 件は **すべて base Lv8 ＋ 補助 Lv4・分岐なし**。うち **active 補助 14 件 / passive 補助 4 件**。
  進化対象 active 18 種 / 非対象 12 種。
- 一覧・進化対応表は `docs/skill-catalog.md`（Milestone 7-E 節 / Milestone 8-A 節）。

## Save version

- **`save_version` = v6**（M8-A / M8-B とも加算的変更のみでスキーマ不変・移行処理不要）。
- 保存先: localStorage（browser save）＋ folder save / import / export / backup / conflict resolution / multi-tab（SaveCoordinator）。
- `active_run` に途中再開用の状態を保持: `jobId` / `jobElement` / `initialSkill` / 各 pool / `jobLevelAtStart` /
  `resolvedJobModifiers` / `skillRuntime` / status RNG cursor / boss frostbreak state。
- **M8-A で `skillRuntime` に載るスキルが増えた**（火の魔女 48 件すべて）。既存フィールドへの加算的変更で移行不要。
- **M8-C で `warriorState.timedBuffs` を追加**（戦吼バフ・反撃の構え。**構えは使用回数も保存**して
  再読込で使い直せない）。跳躍 / 引き寄せ / 連撃の途中状態は意図的に復元しない
  （薙ぎ進軍だけ残り時間と消化済み打撃数を引き継いで「再開」する）。旧セーブ / 壊れた保存でも落ちない。
- **M8-B で `active_run.warriorState` を 1 キー追加**（戦士周回のみ・他ジョブは `null`）。
  闘気 / コンボ / 猶予 / 解放残り / 回復残り / 不屈 CD・発動回数 / ボス体勢（ゲージ・崩し回数・しきい値倍率）/
  突進の軽減窓 / 周回テレメトリ を復元する ＝ **再読込で初期化して稼げない**。
  一方 **cast 予算・同一敵の命中記録・突進の途中状態は意図的に復元しない**（古い敵参照を持たない／無料再ダッシュを防ぐ）。
- **M8-D で `warriorState.timedBuffs` へ 2 キー追加**（`frontGuard` / `rallyField`）。
  どちらも復元時に `balance.warrior` の上限でクランプされるので、保存ファイルを書き換えても上限を超えられない。
  **掴み（`_grab`）は保存しない**（敵の runtime id を保存すると別の敵へ再結合しうるため）。
  突進 / 踏み込み / 投げ / 段 / 斧の飛行も保存せず、CD だけを保存する（無料の再発動・座標の飛びを防ぐ）。
  例外は**刃防陣だけ**で、`guardLeftMs` / `guardTicks` を保存して残り時間から「再開」する。
- 戦士 38 スキル（active25 + 進化13）すべてが `skillRuntime` に載る（最低でも `cdLeft`）。
- 詳細は `docs/save-format.md`。

## Important architecture

- **決定論**: `SeededRandom`（mulberry32）。draft RNG / status RNG / combat・skill RNG を**分離**。
  ゲームプレイ判定に `Math.random` / `Date.now` / `performance.now` を使わない。
- **抽選の正**: `SkillDraftManager`（production）。カタログ表示・シミュレーション・テストは
  **`poolEligibility.memberAllowedForJob` を単一の正**として共有する。`jobs` 未指定を暗黙の共通扱いにしない
  （明示共通は `isCommon:true` か `jobs:["*"]` のみ。現状どちらも 0 件）。
- **状態異常**: `data/status-effects.json` → `StatusEffectRegistry` → `StatusEffectManager` / `FreezeSystem`。
  正式状態は **5 種**（burning / chill / frozen / freeze_immunity / frostbreak_vulnerability）。
  **炎上（burning）はマーカーで、継続ダメージ自体は各スキルが `tag:'dot'` で与える**（M6-E からの設計・M8-A で確認）。
  ボスは通常凍結せず**氷砕ゲージへ変換**。粉砕は非再帰（`isShatter`）。
- **skill-local マーカー**: 氷印 / 氷棺は正式 status ではなく `Enemy._iceSeal` / `_iceHitCount`（`reset()` でクリア）。
- **`bossGaugeMult`**: `applyIceHit` のボス分岐のみで `addBossGauge` の量へ 1 回だけ乗る。
- **上限は二層**: 進化ごとの `safetyCaps`（`EvolvedSkillBase.cap()`・絶対上限）と
  `balance.json` の `skillCaps`（`combat.skillCap()` / `frameBudget()`・**品質別** low ≤ medium ≤ high ≤ ultra）。
  **未参照 cap は 0 件**（M8-A で火由来 5 件を削除。M8-B で戦士向け 13 件を追加し全て参照済み。
  以後 `validate-data` がエラーにする）。
- **主発動イベント（recordCast）**: 攻撃サイクル単位で 1 回だけ。常設型は `config.castPulseMs` でスロットル
  （`orbiting_flame` / `fire_spirit` / `eternal_pyre` / `solar_annihilation_array`）。これが
  `recordCast → _onSkillCast → jobMods.registerCast → _triggerEcho`（残響）の唯一の起点。
- **runtimeState は全件**: 火・氷とも全 active / 進化が `serializeState`/`restoreState` を持つ
  （常設型は CD ではなく位相・スロットル・各インスタンスのタイマーを保存し、設置物本体は保存しない＝二重生成しない）。
- **表示とロジックの分離**: `StatusVisualManager` / `BossFrostbreakDisplay` / `StatusDebugPanel` は
  イベントを購読するだけで、判定・ダメージ・RNG cursor に影響しない。
- **テレメトリ**: `CombatTelemetry` → `RunBalanceSummary`。debugRun は通常統計と完全分離。**外部送信は禁止**。
- **戦士（M8-B）**: `WarriorCombatSystem` が闘気 / コンボ / 軽減 / 不屈 / 撃破回復 / 体勢の**唯一の管理者**
  （Phaser 非依存・乱数なし・`now()`/`heal()` コールバック経由でテスト可能）。
  戦士スキルは `scene.combat.meleeStrike()` 経由でのみ敵へ触り、**全敵総当たりをしない**（SpatialGrid）。
  Job Lv / passive → 倍率の流し込みは `BattleScene._refreshWarriorMods()` の **1 か所だけ**。
  被弾は `Player.takeDamage` → `scene.onWarriorDamage()` の 1 経路（他ジョブでは素通り）。
  **体勢崩しは氷砕と独立**（別フィールド・別しきい値・別 CD。氷砕は chase 中のみ硬直、体勢崩しは予告/突進も中断）。
- **passive modifier の 2 系統（M8-B.1）**: passive の効果には
  **pull 型**（参照側が毎回 `PassiveManager.getMult()` を読む: `damage` / `cooldown` / `area` / `duration` / `iceDamage` …）と
  **push 型**（別システムへ値を押し込む: `StatusEffectManager.setPassiveMods()` の `chillDecay` / `iceStatusDuration`、
  `WarriorCombatSystem.setMods()` の戦士 13 キー）がある。
  **push 型は「いつ押し込むか」を必ず `passives.version` で駆動する**こと
  （`_refreshStatusPassivesIfNeeded()` / `_refreshWarriorMods()`）。手で呼ぶ設計にすると呼び忘れる（M8-B.1 のバグ）。
  押し込みは常に**現在の所持状態からの完全再構築**にし、現在値への加算をしない（二重適用を構造的に防ぐ）。
- **監査基盤**: `SkillCatalog` / `SkillAudit` / `CastPolicy` / `DraftBalanceAnalyzer` / `BalanceWarnings` /
  `FrostBalanceWarnings`（FROST_* 30 コード）/ **`FlameBalanceWarnings`（M8-A 新規・FLAME_* 30 コード）** /
  `BalancePlaytest`（F8）。すべてローカルのみ。
- **死にフィールド禁止**: 宣言した Lv 成長項目・quality cap は**必ず実装で参照する**か **data から削除する**。
  「予約値」として残さない（`validate-data.mjs` の M7-E / M8-A ブロックがエラーにする）。
  進化定義の正は `skill-evolutions.json` のみ（`skills.json` の旧 `evolution` ブロックは M8-A で廃止）。

## Fixed critical bugs

| # | Milestone | 内容 | コミット |
|---|-----------|------|----------|
| 1 | M7-A 後 | 氷術師スキルの CD が保存されず、reload で全回復・無料 cast・field/wall/domain の二重生成が起きていた | `bad8bd4` |
| 2 | M7-B 後 | 火 passive 4 種が氷術師のドラフトへ混入していた。`poolEligibility.memberAllowedForJob` へ判定を一元化 | `9eb7277` |
| 3 | M7-C 後 | `bossGaugeMult` が data にあるのにコードから一度も参照されない**死んだ成長項目**だった | `303c391` |
| 4 | M7-E | 死にパラメータ 6 件（氷）。`crystal_bloom.interval` ほか | `3e6c7ed` |
| 5 | M7-E | `heaven_piercing_glacier` / `absolute_zero_ray` の `bossGauge.multiplier` が通常敵の冷気まで増やしていた | `3e6c7ed` |
| 6 | M7-E | `echoPolicy`/`clonePolicy` が `custom` なのに実装が無く `fire()` 全体を無料再発動していた 3 件（氷） | `3e6c7ed` |
| 7 | M7-E | 未参照 quality cap 11 件を接続・4 件削除・名前違い 1 件（氷） | `3e6c7ed` |
| 8 | **M8-A** | **火の魔女スキル 21 種の CD が保存されず、reload で全回復して無料発動できていた**（#1 と同じクラスの欠陥が火側に残っていた）。48 件すべてが runtimeState を保存するよう修正 | `bca7ec3` |
| 9 | **M8-A** | **`eternal_pyre` / `solar_annihilation_array` が `recordCast` を一度も呼ばず、data で宣言した残響・分身が一度も発生しなかった**（進化元では発生する＝進化で機能を失う逆転）。主発動をスロットル記録し `echoPolicy`/`clonePolicy` を `custom` へ是正、`eternal_pyre` に `echoCast()` を実装 | `bca7ec3` |
| 10 | **M8-A** | 死にパラメータ 21 件（旧 `evolution` ブロック 3 / `bloodfire_pact.buffDamage`・`buffMs` / `four_sided_inferno.burnMs` ほか）→ 実装へ接続 13 件・削除 8 件で **0 件**へ | `bca7ec3` |
| 11 | **M8-A** | M7-E から残っていた**火由来の未参照 quality cap 5 件**を削除（重複 or 参照すると品質で火力が変わるもの）。`SkillBase._initCd` も削除 | `bca7ec3` |
| 12 | **M8-A** | `eternal_pyre.spreadInfection()` が `enemyPool.forEachActive()` で毎 tick 全敵を総当たりしていたのを炎上索引経由へ（性能改善・対象集合は同じ） | `bca7ec3` |
| 13 | M8-A | `AshLegionSkill` / `SolarAnnihilationArraySkill` の `serializeState()` が `{}` を返すだけで `restoreState` も無く、`AshDoppelgangerSkill` は保存値 `spawned` を復元していなかった（再開直後に全ユニットが無料で一斉発動） | `bca7ec3` |
| 15 | **M8-B.1** | **氷術師の passive「余寒残留」が周回中に効かなかった**。`BattleScene._refreshStatusPassives()` が通常のレベルアップ経路（`applyCandidate`）から呼ばれておらず、`StatusEffectManager` へ push 型で渡す `chillDecayMult` / `iceStatusDurationMult` だけが更新されないままだった（pull 型の `iceDamage` / `cooldown` / `area` は影響なし）。`passives.version` を単一トリガーにする `_refreshStatusPassivesIfNeeded()` を追加し、変化時だけ現在の所持状態から完全再構築するようにした | `601fe2a` |
| 14 | M8-B | 実装中に作り込みかけた**死にフィールド 2 件を作らずに済ませた**: passive `heavy_armor` の `knockbackResist`（プレイヤーがノックバックされる仕組みが存在しない）と `charge_slash.levels[].visual`（`visualScale()` を使わない）。data・`modifierKeys`・`balance.warrior.mitigation` から削除し、「予約値として残さない」原則を維持 | `4c8bd10` |

## Non-regression requirements

以後の作業で**壊してはいけない**もの。

- 火の魔女: active30 / passive4 / evolution18・**同 seed の候補列**・48 件の runtimeState 保存・
  主発動スロットル（`castPulseMs`）・死にフィールド 0・未参照 cap 0
- 氷術師: active30 / passive4 / evolution18・数値・挙動・候補列・状態異常・保存・カタログ（**M8-A / M8-B で完全一致を確認済み**）
- **戦士: active25 / passive4 / evolution13**・物理のみ（火 / 氷の弾を撃たない）・闘気の 3 層上限・軽減 70% クランプ・
  撃破回復の毎秒上限・不屈の CD・エリート stagger 免疫・ボス体勢しきい値の上昇と頭打ち・
  残響/分身の対象外・38 スキルすべての CD 保存
- **戦士 Wave1（M8-C）の 4 機構**:
  処刑は**通常敵のみ**（エリート/ボスは絶対に処刑されない・ボスの追加ダメージは上限つき・毎秒上限あり）／
  **1 被弾 = 最大 1 系統の反撃**（優先度・全体 CD・再入ガード）／
  戦吼バフは**重ねがけしない**（refresh・上限クランプ・formal status を作らない）／
  **ボスは引き寄せられない**（壁外・NaN・テレポートを作らない・SpatialGrid を必ず更新）／
  Job Lv80「打撃数 +1」対象は**ちょうど 6 種**で弾は増えない／
  進化の補助 active（地砕き）は**置換されず CD にも触らない**
- **戦士 Wave2（M8-D）の 5 機構**:
  **打ち上げ・掴みは通常敵だけ**（エリート / ボスは体勢削り・その場叩きつけ・重い体勢打撃へ置換）／
  打ち上げは滞空上限と免疫で**無限に浮かせられない**・残留は `Enemy.reset()` と `onEnemyRemoved()` の両方が戻す／
  **前面防御は方向の分かる被弾だけ**（`requireDirection: true`・側面 ×0.35・背面 ×0・単体 55%・合計 70%）／
  **掴みは敵オブジェクトを保持しない**（`_seq` のみ）・同時 1 体・時間切れで必ず解除・保存しない・**投げの連鎖なし**／
  **戦旗の陣は常に 1 つ**・効果は**内側にいるときだけ**・血の誓いは既存の毎秒 cap を共有／
  **低 HP スケーリングは自傷せず処刑もせず**上限 ×1.6／
  **戦斧は `Projectile` を使わず近接倍率も乗らない**（同一敵へ行き / 帰りで最大 2 回）／
  `meleeStrike` の追加オプションは**明示したときだけ効く**（未指定なら従来と同一経路）／
  `Player.takeDamage` の第 2 引数は任意（火 / 氷は渡さない）
- **3 ジョブのプール完全分離**（各メンバーが適格なジョブは最大 1 つ）
- passive のジョブプール分離／`poolEligibility.memberAllowedForJob` が単一の正／`jobs` 未指定を暗黙共通にしない
- active slot 4→6→8・passive slot 4・Job Lv1〜100・Job XP・熟練度
- 進化 / 転生 / 残り火 / 魂炎 / 難易度
- F8（Balance Playtest ＋ ジョブ別分析）/ F9（デバッグ）/ F10（状態異常デバッグ）
- SkillCatalog / SkillAudit / DraftBalanceAnalyzer / CombatTelemetry / BalanceWarnings /
  FrostBalanceWarnings / **FlameBalanceWarnings**
- StatusEffectManager / StatusVisualManager / FreezeSystem・chill / slow / frozen / immunity / shatter / frostbreak
- burning（マーカー）/ 炎上索引 / 灼熱共鳴 / 万象炎鳴 / 爆発の非再帰（`isMarkDetonation` ほか）
- SpatialGrid / PoolManager / quality cap（low ≤ medium ≤ high ≤ ultra・正数・**未参照ゼロ**）
- browser save / folder save / import / export / backup / 競合解決 / multi-tab
- `active_run` / `skillRuntime` / status RNG cursor（**RNG drift 0**）
- `save_version` = **v6**
- 外部送信の禁止（telemetry / warnings はすべてローカル）
- **`tests/three-job-nonregression.mjs` / `tests/status-passive-nonregression.mjs` /
  `tests/three-job-wave1-nonregression.mjs` / `tests/three-job-wave2-nonregression.mjs` /
  `tests/warrior-wave1-determinism.mjs` / `tests/warrior-wave2-determinism.mjs` のハッシュ 6 種**
  （火/氷の候補列・火/氷のランタイムトレース）。火・氷を触ったら必ずここが落ちる。
  落ちたら「意図した変更か」を必ず確認すること。
- **push 型 passive modifier の反映**（M8-B.1）: status 乗率・戦士 mods は `passives.version` 駆動で、
  レベルアップ取得の直後に反映されること／未変更フレームで再計算しないこと／完全再構築で二重適用しないこと。

## Open warnings

修正せず**理由を記録して残している**もの。

| 警告 | 内容 | 理由 |
|------|------|------|
| `FROST_EVOLUTION_LOW_RATE slot8:atLeast1` | 氷 evolution-first・枠8 の「進化1個以上」が **94.0%**（基準 95%） | 枠が広いほど level-up が分散する希釈特性。`one-build-focus` なら 99.0%。詳細は `docs/frost-balance-report.md` |
| `FROST_EVOLUTION_ZERO_RATE zero_hour_world` | 氷・全戦略合算の取得率 **1.00%** | legendary base ＋ active 補助の二重ハンデ。**到達不能ではない** |
| `FROST_FREEZE_EXCESSIVE` | 状態異常ハーネスで凍結成功率 93.3% | 飽和負荷のテスト条件による。実際の抑止は凍結耐性が担っている |
| （火）`hexagram_inferno_array` の evolution-first/slot6 取得率 0.0% | 合算では 3% | base rare ＋ 補助 rare の二重ハンデ。M6-F 以来の既知の低率。**到達不能ではない** |
| （火）`star_devouring_furnace` / `doomsday_core` の合算取得率 各 1% | — | base が legendary。終盤の legendary 軸として意図的 |

**`FLAME_*` 警告は 0 件**（high / medium / low すべて 0）。火の魔女の未参照 cap も 0 件になり、
M7-E の「火由来の未参照 cap 5 件」は解消済み。**戦士は M8-C 時点でも警告 0 件**
（active15 / passive4 / 進化8 すべてが 400 seed の初回候補で出現し、
進化 8 種すべてが抽選で形成・取得され得ることを確認済み）。

### M8-C で数値を動かした「意図した希釈」

| 項目 | M8-B | M8-C | 理由 |
|------|------|------|------|
| 戦士・進化 1 種以上の到達率（active枠4 / 40 レベルアップ） | 92.5% | **46.5%** | active プールが 5 → 15 になり、進化元と補助が揃う確率が下がった。枠 6 で 97.0%・枠 8 で 100.0% なので**到達不能ではない**。`tests/warrior-draft-determinism.mjs` のしきい値を枠別（4:40% / 6:60% / 8:80%）へ更新した |
| 候補ゼロの発生（枠4） | 12 回/周回 | **約 10 回/100 seed** | プールが広がり「所持がすべて上限」に到達しにくくなったため、むしろ減った。`tests/warrior-wave1-draft.mjs` は「飽和以外の理由で候補ゼロが起きないこと」を検証する |

### M8-B で残した既知の問題 → **M8-B.1 で解消済み**

| 項目 | 状態 |
|------|------|
| `_refreshStatusPassives()` の呼び出し漏れ（余寒残留が周回中に効かない） | **M8-B.1 で修正**。`passives.version` を単一トリガーにする `_refreshStatusPassivesIfNeeded()` を追加し、レベルアップ確定時・メインループ（gate 付き）・周回開始/復元（force）から発火するようにした |

### M8-B.1 での意図した挙動変化

| 項目 | 内容 |
|------|------|
| F9 氷術師パネルのジョブ制限 | status 乗率の適用を「周回のジョブが氷術師のとき」に限定したため、**火の魔女 / 戦士の周回で F9 から余寒残留を付与しても乗率が動かない**。状態異常の乗率を検証する場合は氷術師の周回で行う（`docs/test-guide.md` に注記） |

### 既知の問題 / 制約

- 抽選シミュレーションの結果は **level-up 回数に強く依存**する（火: 30 回で平均 0.24、60 回で 2.20、90 回で 2.37）。
  比較は同じ `levelUps` で行う。
- **戦士は「接敵し続けられるか」が火力を左右する**ため、ヘッドレスの飽和条件（敵が動かない・プレイヤーも動かない）では
  火力バランスを判定できない。闘気の解放頻度も敵密度に強く依存する（`maxGainPerSecond` が効くため）。
- 戦士のカタログは M8-C 時点で **active15 / passive4 / 進化8**。
  火・氷（各 30/4/18）の半分なので、同じ完成監査を行うのは Wave2 以降でカタログが揃ってから。
- 戦士 Wave1 の**体感**（跳躍の気持ちよさ・引き寄せの見た目・反撃の手応え・処刑の爽快感）は
  実ブラウザでしか評価できない。ヘッドレスのテストは「壊れていない」「上限を超えない」までしか見ていない。
- ヘッドレスハーネスは「敵が移動せず死なない」飽和条件であり、刻印起爆・分身の複製対象・炎上源といった
  BattleScene 側の相互作用も再現しない。**DPS の実測値は火力バランスの判定に使えない**
  （進化前後の比較は data 由来の項目差分で行っている）。
- ヘッドレス環境では `requestAnimationFrame` の間引き・非フォーカス自動一時停止のため、実時間ループ依存の計測が不安定。
- passive `ember_persist` は進化補助として要求されない（火は 18 進化中 14 件が active 補助）。
  `duration` modifier が実装から参照されるため死に passive ではないが、氷（passive 補助 4/4）とは設計が異なる。

## Browser verification status

**実ブラウザ（Phaser 実プレイ）確認は本環境では一度も実施していない。** 未実施の項目を「確認済み」と報告しない。

- 検証済み: Node 純ロジック（データ検証・監査・シミュレーション）＋ graphics 対応の最小 Phaser モックによるランタイムスモーク。
  **M8-B で追加した戦士のコードは、ヘッドレスで実際に駆動して命中・闘気・コンボ・体勢・保存まで確認している**
  （ただしそれは Phaser モック上であり、実描画・実操作ではない）。
- **未確認**（要ブラウザ・M8-B 分）:
  - 戦士の**実描画**（近接 arc の見え方・斬撃/衝撃/破片の演出・闘気ゲージ / コンボ表示 / 不屈 CD / ボス体勢ゲージの HUD）
  - **近接の当たり判定の体感**（arc の広さ・射程・向きの決まり方が操作感と合っているか）
  - **闘気解放の体感**（溜まる速さ・解放の強さ・回復量・持続）
  - **コンボの体感**（繋がり方・切れやすさ・閾値の効き）
  - **不屈**（瀕死からの立て直しが成立するか・45 秒 CD が長すぎ/短すぎないか）
  - **体勢崩し**（エリートのよろけ・**ボスの予告/突進を中断できること**・露出中の火力差）
  - **戦士向けオート移動**（密集へ近づく / 接敵距離を保つ / 瀕死で退く / ボス予告を避ける）
  - **F9 戦士検証パネル**の描画と操作、**F8 戦士分析**の表示
  - 戦士での **60FPS 維持**（low/medium/high/ultra × 敵100体 × 2倍速 × active8枠）
  - **保存/再開**（闘気・コンボ・不屈 CD・ボス体勢が残ること／再開直後に一斉発動しないこと）
  - **火/氷の非回帰の目視**（HUD に戦士要素が出ないこと・F9 が従来パネルであること・オート移動が従来どおりであること）
- **未確認**（要ブラウザ・M8-A 以前から継続）:
  - M8-A で挙動を変えた箇所（21 種の CD 復元・`eternal_pyre` / `solar_annihilation_array` の残響/分身 ほか）
  - M7-E で追加した F8 のジョブ別分析パネル・F10 の直近イベント履歴の描画
  - draft / evolution / burning / save / performance の手動チェック一式
- **未確認**（要ブラウザ・M8-B.1 分）:
  - 氷術師で **余寒残留 Lv1 を取得した直後**に冷気の減衰が緩くなること（F10 で冷気を付与して目視）
  - **Lv2〜Lv5 の各段**で段階的にさらに緩くなること
  - active / 進化の取得だけでは変わらないこと
  - **save → reload 後も同じ値**であること（リロードを繰り返しても倍率が二重にならない）
  - **pause → resume** で値が動かないこと
  - 氷術師 → 火の魔女 / 戦士 へジョブを切り替えたとき**前ジョブの乗率が残らない**こと
  - 取得時・リロード時・ジョブ切替時に **JS エラーが出ない**こと
- **未確認**（要ブラウザ・M8-C 分）:
  - 新 active10 / 進化5 の**実描画**（上段斬り・2 連斬り・処刑演出・跳躍と着地・進軍の軌跡・
    構えと反撃のフラッシュ・戦吼のリング・鎖の線・震脚の衝撃波・連撃の火花）
  - **処刑の体感**（通常敵が一撃で片付くこと／エリート・ボスが処刑されないこと）
  - **反撃の体感**（3 系統を持っても反撃演出が 1 つだけ出ること／構え中でもダメージは通ること）
  - **戦吼の体感**（バフの効き・押し返し・連打しても強くならないこと）
  - **移動系の体感**（跳躍の距離と着地の気持ちよさ・進軍の歩き方・引き寄せの滑らかさ・
    ボスが動かず自分が踏み込むこと・壁際で壁の外へ出ないこと）
  - **天墜崩撃を取っても地砕きが残り、地砕き自身の CD どおりに発動し続けること**
  - **Job Lv80** で 6 種だけ打撃が増え、弾は増えないこと
  - **保存/再開**（戦吼バフ・構えが短くなって復元されること／進行中の効果が二重化しないこと）
  - **F8 の戦士カタログ / Wave1 カウンタ**・**F9 の Wave1 セクションと追加操作**の描画
  - **F10 が M8-B から変わっていないこと**
  - 戦士での **60FPS 維持**（low/medium/high/ultra × 敵100体 × 2倍速 × active8枠 × Wave1 スキル）
- **未確認**（要ブラウザ・M8-C.1 分）:
  - 枠 4（転生前）で **40 レベルアップ前後に進化が 1 つ以上成立する**こと（体感）
  - 進化元の強化候補が Lv6〜7 で**出やすく感じる**こと
  - **進化を持たない active（突進斬り / 双牙斬 / 薙ぎ進軍 / 鎖鉤 / 震脚 / 怒涛連撃）も普通に出る**こと
  - 条件成立直後のレベルアップで**必ず進化候補が出る**こと
  - reroll / banish / skip が従来どおり効くこと
  - **save → reload で候補が変わらない**こと（引き直せない・pity を稼げない）
  - 天墜崩撃へ進化しても**地砕きがスキル欄に残る**こと
  - 3〜5 周回して **build が毎回同じにならない**こと
  - 枠 6 / 枠 8 でも悪化していないこと
  - **火 / 氷の周回で候補の出かたが従来どおり**であること（体感）
  - F8 の戦士分析に「戦士 進化導線（M8-C.1）」が出ること
- 手順書: `docs/test-guide.md` の **Milestone 8-C.1** 節（A〜I）／**Milestone 8-C** 節（A〜J）／
  **Milestone 8-B.1** 節（A〜G）／**Milestone 8-B** 節（A〜K）／**Milestone 8-A** 節（A〜H）／**Milestone 7-E** 節。
- 例外: M7-B.1 の氷エフェクトと敵停止のみ、ユーザーが実ブラウザで確認済み。

### M8-D（戦士 Wave2）で未確認のもの

- 新 active 10 種の**実描画**（斬り上げ / 突進 / 後退斬り / 掴み投げ / 三段 / 刃防陣 / 連続踏み込み /
  斧の往復 / 膝撃 / 戦旗の見え方）
- **打ち上げの見え方**（浮いている敵の表現・落下・エリート / ボスが浮かないこと）
- **前面防御の体感**（前 / 横 / 後ろで被弾が違うと分かるか）
- **掴み投げの体感**（掴まれた敵の表現・投げ先の分かりやすさ・ボスに効かないこと）
- **戦旗の内外**（陣の範囲が視覚的に分かるか・外へ出た瞬間に効果が切れると分かるか）
- **低 HP スケーリングの体感**（瀕死で強くなる実感と、それでも死ぬバランス）
- **F8 の Wave2 カウンタ / F9 の Wave2 表示**の描画
- 戦士 active 8 枠 × Wave2 の 10 種で **60FPS 維持**（low/medium/high/ultra × 敵100体 × 2倍速）
- **保存 / 再開**（突進 / 掴み / 斧の飛行中に閉じても無料の再発動が起きないこと・旗が 2 本にならないこと）

## Latest test results

- 実行日時点: Milestone 8-D 完了時（コミット `M8D_COMMIT`）
- **テストスイート: 147 件（`tests/*.mjs` から共通土台 `frost-audit-common.mjs` / `flame-audit-common.mjs` /
  `warrior-common.mjs` / `status-passive-common.mjs` / `warrior-draft-sim.mjs` と `validate-data.mjs` を除く）
  → 全 147 通過・失敗 0**
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**
- M8-D 新規 21 スイート:
  `warrior-wave2-catalog`（504）/ `warrior-wave2-pool`（216）/ `warrior-wave2-draft`（125）/
  `warrior-wave2-guidance`（108）/ `warrior-wave2-evolutions`（190）/
  `warrior-rising-slash`（39）/ `warrior-shield-charge`（1241）/ `warrior-backstep-riposte`（34）/
  `warrior-battlefield-throw`（70）/ `warrior-triple-crush`（29）/ `warrior-blade-guard`（41）/
  `warrior-berserker-rush`（37）/ `warrior-war-axe-throw`（37）/ `warrior-breaker-knee`（34）/
  `warrior-rallying-banner`（59）/ `warrior-wave2-runtime-save`（274）/ `warrior-wave2-determinism`（109）/
  `warrior-wave2-quality-cap`（245）/ `warrior-wave2-cleanup`（172）/ `warrior-wave2-telemetry`（291）/
  `three-job-wave2-nonregression`（1419）
- 更新した既存スイート: `warrior-common`（EXPECTED を 25/4/13 へ・Wave2 の combat API と敵フィールドを追加）/
  `warrior-catalog` `warrior-telemetry` `status-passive-nonregression`（規模とライブ表示キー）/
  `warrior-wave1-catalog` `warrior-wave1-pool` `warrior-wave1-job80` `warrior-wave1-draft`
  `warrior-wave1-telemetry`（Wave1 の範囲に scoping・MOVERS へ Wave2 の移動系を追加）/
  `warrior-evolution-guidance` `warrior-active-support-evolution`（active 補助の追加補正を織り込み）/
  `warrior-draft-guidance-nonregression`（「戦士以外は不変」を正に変更）/ `validate-data`（M8-D ブロック）
- `.github/workflows/validate.yml` へ 21 ステップ追加（計 147 ステップ）。

### M8-D で見つけて直した既存の不備

| 不備 | 影響 | 修正 |
|------|------|------|
| `WarriorCombatSystem.update()` が Wave2 の時限状態を減らしていなかった | 前面防御 / 掴み / 陣が時間で終わらず、稼働時間も記録されない | tick を追加（1 か所へ集約） |
| `WARRIOR_DEFAULTS` に Wave2 のブロックが無い | balance を渡さないと `beginFrontGuard` が例外 | 既定値を追加 |
| 燕返しが宣言どおりの距離を踏み込んで**相手を追い越す** | Lv8 で命中 0 | 間合いのぶんだけ進む `_lungeWant()` |
| 戦斧の「行き / 帰りで最大 2 回」が**行きで 2 回**消費される | 帰りが 1 度も当たらない | 行きと帰りで別の回数マップへ分離 |
| `blood_oath_standard` が `stack` / `worldMargin` を引き継がない | 陣の座標が NaN → 原点に置かれ、内側判定が常に false | 進化側の params へ明示 |
| `blade_guard` の Lv8 火力が旋風斬と同値 | 「低火力・防御寄り」という役割が成立しない | damage 曲線を 8 → 18 へ |
| `breaker_knee` の体勢削りが兜割りより低い | 「体勢特化」という役割が成立しない | poiseDamage を 44 → 126 へ |

## Next milestone

**未定（次の指示待ち）。** 候補は以下。

1. **戦士のカタログ拡張 Wave3**（active25 → 30 / 進化 13 → 18）で火・氷と同規模へ。
   同じ拡張手順・同じ検証基盤（`warrior-common.mjs` ＋ `warrior-draft-sim.mjs` ＋ Wave1 の 19 スイート
   ＋ M8-C.1 の 9 スイート ＋ Wave2 の 21 スイート）がそのまま使える。
   **拡張のたびに枠 4 の到達率が薄まるので、`tests/warrior-slot4-evolution-rate.mjs` と
   `tests/warrior-wave2-draft.mjs` を必ず回すこと。**
   薄まりの吸収は「しきい値を下げる」のではなく **guidance を data で調整する**（M8-C.1 / M8-D と同じ方針）。
2. **戦士 完成監査**（カタログが 30/18 まで揃ってから。M7-E / M8-A と同じ 12 観点）。
3. **火と氷の属性反応** — 炎上⇄冷気/凍結の相互作用（付与時の source element を活用）。
4. **転生レガシー / ジョブ間継承**（`futureInheritanceSettings` / `extraAllowedIds` が拡張口）。
5. **周回長の拡張**（10分 / 15分 / 無限モード）・**追加の敵 / ボス / 難易度**。
6. **実ブラウザでの M7-E / M8-A / M8-B / M8-B.1 / M8-C / M8-C.1 / M8-D 手動確認**（`docs/test-guide.md` の該当節）—
   コード変更を伴わない検証タスク。**M8-D は B（新 active 10 種）・C（エリート / ボスでの挙動）・
   E（保存 / 復元）・F（F8 / F9 / F10）の確認価値が特に高い。**

いずれも**指示された範囲のみ**実装し、未指定の先行実装はしない（`CLAUDE.md` の作業手順）。
