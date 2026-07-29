# スキル詳細（氷術師の新スキル・Milestone 7-C / 7-D）

氷術師（frost_mage）へ Milestone 7-C で追加した **新 active10種・新進化5種**、Milestone 7-D で追加した **新 active5種・新進化5種** の役割・rarity・castMode・proc をまとめる。
数値の正は `data/skills.json`／`data/skill-evolutions.json`（Lv1〜8 データ駆動）で、本書は概要（指示なく数値を変更しない）。
冷気/凍結/粉砕/ボス氷砕はすべて既存 `StatusEffectManager`／`FreezeSystem` 経路を使い、独自タイマー・独自状態種別を持たない（詳細は `./docs/status-effects.md`）。
全新スキルは **Math.random/Date.now/performance.now 不使用の index／黄金角ベース決定論**（同点は entity `_seq`→x→y／`instanceId`／wave index で安定決定）。氷術師は M7-D で **active30 / passive4（追加なし）/ 進化18** となり、火の魔女と同規模のカタログに到達した（M7-C までの表は下記、M7-D は末尾）。

## proc の考え方
- **一次 proc（`procCoefficient`）**: 主発動の凍結寄与。`freezeChance = baseFreezeChance×proc + chillRatio×chanceFromChill×proc` の proc に相当する。
- **二次 proc（`config`）**: 往路/復路・pulse/bloom・shard・大彗星などスキル内の別 hit leg 用の係数（コードにハードコードせず `config` へ）。
- 多段/広範囲/往復/連鎖でも低い proc＋`sameHitGroupMaxFreezeChecks` で**永久凍結を防止**する。

## 新アクティブ10種（すべて氷術師専用・`element:"ice"`・`isCommon:false`・maxLevel8）

| スキル | id | rarity | castMode | echo/clone | 一次proc | 二次proc（config） | 役割・特徴 |
|--------|----|--------|----------|-----------|---------|----------------------|------------|
| 霜輪飛刃 | `rime_boomerang` | common | cooldown | standard | 0.38（往路） | returnProc 0.50 / shatterMultiplier 1.3 / spreadAngle 0.28 | 敵密集方向へ氷輪を投げ、往路と復路で別 hit leg。**復路は高威力で凍結敵を粉砕**。**Lv80発射数対象**。runtime: cdLeft |
| 氷鎖連閃 | `frost_chain` | uncommon | cooldown | standard | 0.38 | — | 高冷気の敵を優先する瞬間連鎖。後半減衰・**同一敵へ再連鎖しない**。runtime: cdLeft |
| 氷晶開花 | `crystal_bloom` | common | periodic | custom | 0.16（pulse） | bloomProc 0.75 | 発芽→開花の設置。pulse は弱く、**開花時のみ粉砕**。runtime: cdLeft＋芽(x/y/growLeft/pulseLeft) |
| 白霧氷界 | `snowblind_mist` | uncommon | continuous | custom | 0.14 | — | プレイヤー追従の霧。持続冷気・**粉砕なし**。runtime: cdLeft/activeLeft/centerX/centerY/tickLeft |
| 極星氷弾 | `polar_star` | rare | cooldown | standard | 0.70（impact/burst） | pulseProc 0.12 / shardProc 0.30 / shatterMultiplier 1.5 | 大型星＋pulse＋着弾爆発＋氷片の複合弾。**Lv80発射数対象**。runtime: cdLeft |
| 砕氷衝波 | `icebreaker_wave` | common | cooldown | standard | 0.60 | — | 扇状衝波。通常敵 push・エリート軽減・**ボス push なし**・凍結敵粉砕。runtime: cdLeft |
| 氷刻停止 | `frozen_clock` | legendary | periodic | **forbidden** | 0.65 | — | 全画面の時計波。**直接凍結せず FreezeSystem へ委譲**（ボスは氷砕ゲージ）。runtime: cdLeft/remainingWaves/nextWaveLeft/waveIndex/origin |
| 氷晶屈折 | `crystal_refraction` | rare | cooldown | standard | 0.38 | — | 屈折して跳ねる projectile。**最終屈折のみ粉砕**。runtime: cdLeft |
| 冬冠結界 | `winter_halo` | uncommon | defensive | **forbidden** | 0.32（反撃） | — | 氷冠で被弾吸収＋近距離冷気反撃。複数耐久片＋近距離 pulse で `mirror_ice` と差別化・複製なし。runtime: cdLeft/activeLeft/durabilityLeft |
| 氷彗星群 | `comet_sleet` | rare | periodic | custom | 0.42（通常） | largeProc 0.80 / shatterMultiplier 1.5 | 予告→barrage。通常彗星と大彗星、**大彗星のみ粉砕**（落下点は黄金角 2.399963… で分散）。runtime: cdLeft/barrageActive/cometsRemaining/nextCometLeft/barrageIndex/targetCenter/telegraphLeft |

- **Lv80発射数対象**は明示フラグ（`lv80ProjectileTarget:true`・`SkillAudit.appliesLv80ProjectileCount`）で管理し、projectile タグでは自動適用しない。新 active では `rime_boomerang`/`polar_star`。氷全体の対象は計5種（`frost_shard`/`glacial_lance`/`icicle_volley`/`rime_boomerang`/`polar_star`）。
- **粉砕を起こす／起こさない**: 粉砕は復路（rime_boomerang）/開花時（crystal_bloom）/凍結敵（icebreaker_wave）/最終屈折（crystal_refraction）/大彗星（comet_sleet）/複合弾（polar_star）。`snowblind_mist` は冷気のみで粉砕なし。ボスは通常 frozen にせず氷砕ゲージ経路で扱う。
- **echo/clone**: `frozen_clock`/`winter_halo` は forbidden（複製・残響なし）。`crystal_bloom`/`snowblind_mist`/`comet_sleet` は custom（攻撃部分のみ複製・設置/追従は増やさない）。他は standard（1世代・再帰なし）。

## 新進化5種（`EvolvedSkillBase`・単一形態・追加Lvなし・`element:"ice"`・Lv80発射数対象外）

| 進化 | id | 置換元(Lv8) | 補助条件(Lv4) | castMode | echo/clone | proc |
|------|----|-------------|---------------|----------|-----------|------|
| 冥氷処刑輪 | `rime_execution_wheel` | `rime_boomerang` | `frost_amplification`（passive） | cooldown | standard | — |
| 永劫氷鎖 | `eternal_frost_chain` | `frost_chain` | `rapid_freezing`（passive） | cooldown | custom | — |
| 世界氷晶樹 | `crystal_world_tree` | `crystal_bloom` | `frozen_expansion`（passive） | periodic | custom | pulse0.16 |
| 永久白霧 | `everlasting_white_mist` | `snowblind_mist` | `lingering_cold`（passive） | continuous | custom | — |
| 零刻世界 | `zero_hour_world` | `frozen_clock` | `ice_prison`（補助 active・置換しない） | periodic | **forbidden** | 0.65 |

- 進化は基礎 active を置換し active/passive 枠を消費しない。補助条件スキルは消費しない。進化は**基礎 Lv8 より明確に強い到達点**（詳細は `./docs/balance-testing.md`）。
- `frozen_clock`/`zero_hour_world` の `bossGaugeMult` はボス氷砕ゲージ量のみへ適用する。`StatusEffectManager.applyIceHit` のボス分岐で chill→ゲージ変換に1命中1回だけ掛かり（`addBossGauge(e, chillAmt × bossGaugeMult)`）、damage/chillAmount/procCoefficient や通常敵/エリート・炎には掛からず二重加算もしない。`frozen_clock` は Lv別（1.2→1.8 で単調増加）、`zero_hour_world`=2.2 と明確に高い（ボス氷砕の cooldown/threshold/vulnerability は不変）。

## runtimeState・保存・テレメトリ・デバッグ
- CD/設置/遅延/防御/barrage の runtimeState を `active_run.skillRuntime` へ保存し、再開時の無料再発動・二重生成・進化前後の同時稼働を防ぐ。飛行中 projectile/Graphics/Text/Tween/entity 参照/particle/overlay/F10 選択は保存しない（詳細は `./docs/save-format.md`）。
- 品質別 `skillCaps` 23種を `data/balance.json` へ追加（装飾上限と damage event 上限を区別・`winter_halo` の防御耐久は visual cap で減らさない）。詳細は `./docs/balance-testing.md`・`./docs/data-format.md`。
- CombatTelemetry へスキル固有 extra（`recordExtra`）を追加。共通 chill/freeze/shatter/frostbreak は既存経路で記録し二重カウントしない・外部送信なし。
- `?debug=1` の **F9** で新 active10・新進化5 を付与/Lv切替/進化条件達成/即時進化でき、`debugRun` として通常 profile 統計/Job XP/残り火/魂炎へ影響しない。
- 状態表示（冷気段階/氷殻/SHATTER/ボス氷砕ゲージ/FROST BREAK/F10）は M7-B.1 の表示層へ自動反映され、スキルクラスから状態演出を直接生成しない（`./docs/status-visuals.md`・`./docs/status-debug.md`）。

## 検証
`frost-skills-wave3.mjs`／`frost-evolutions-wave3.mjs`／`frost-policy-audit-wave3.mjs`／`frost-runtime-save-wave3.mjs`／`frost-determinism-wave3.mjs`・`validate-data.mjs`（M7-C 検証ブロック）。
**全44スイート通過・validate-data 0エラー0警告**。実ブラウザでの描画・当たり判定・視認性・体感バランス・60FPS は本環境では**未検証**（`./docs/test-guide.md` の M7-C 項目）。実行していない項目を「確認済み」と報告しない。

---

# Milestone 7-D の新スキル（氷術師カタログ完成・active30 / 進化18）

M7-D で氷術師へ **新 active5種・新進化5種** を追加し、火の魔女（active30/進化18/passive4）と同規模のカタログに到達した（passive は4種のまま）。全て `data/skills.json`／`data/skill-evolutions.json` の Lv1〜8 データ駆動で、
冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager`／`FreezeSystem` 経路を使う。**次工程は氷術師カタログの完成監査**（抽選率/進化到達率/バランス分析）。

## 新アクティブ5種（すべて氷術師専用・`element:"ice"`・`jobs:["frost_mage"]`・`isCommon:false`・maxLevel8）

| スキル | id | rarity | castMode | echo/clone | 一次proc | 二次proc（config） | 役割・特徴 |
|--------|----|--------|----------|-----------|---------|----------------------|------------|
| 氷槍豪雨 | `glacial_spear_rain` | common | periodic | echo=clone=custom | 0.42（通常槍） | largeProc 0.80 | 予告付き氷槍を螺旋（黄金角）配置で連続落下、**一定本数ごとの大型槍のみ凍結中の敵を粉砕**。**Lv80発射数対象**。runtime: cdLeft＋barrage(spearsRemaining/nextSpearLeft/barrageIndex/targetCenter/telegraphLeft) |
| 六花砲台 | `snowflake_sentry` | uncommon | continuous | echo=clone=custom | 0.35（砲台弾） | pulseProc 0.18 | 設置砲台が**非frozen 高chill 敵を優先射撃**、一定射撃ごとに六花pulse。**砲台弾は粉砕なし**。runtime: deployLeft/nextInstanceId＋各砲台(instanceId/x/y/activeLeft/shotLeft/pulseカウンタ) |
| 氷山奔衝 | `iceberg_ram` | rare | cooldown | echo=standard・clone=custom | 0.55（接触） | collapseProc 0.75 | 滑走氷山が通常敵を push（**エリート軽減/ボス無効**）、凍結中は最初の接触で粉砕、終端で崩壊＋氷片。runtime: cdLeft＋氷山(x/y/direction/activeLeft/travel/collapsePending/instanceId) |
| 絶対氷封 | `absolute_ice_seal` | rare | reactive | echo=clone=**forbidden** | 0.85（起爆） | markDuration / requiredHits / bossGaugeMult(Lv別1.25→1.50) | 高chill 対象へ**氷印（skill-local マーカー・正式 status ではない）**を刻み、markDuration 経過か氷属性命中数で起爆・凍結中を1回粉砕。**印付与時は freeze roll しない**。runtime: markLeft/nextInstanceId＋ボス印のみ |
| 極光氷幕 | `aurora_veil` | legendary | continuous | echo=clone=**forbidden** | 0.14（tick） | burstProc 0.75 / bossGaugeMult(Lv別1.15→1.35) | 画面横断オーロラ帯が tick でダメージ＋冷気、**一定間隔の burst のみ凍結中を1回粉砕**。帯は複数 query へ分割し毎frame 全敵走査しない。runtime: recastLeft/activeLeft/tickLeft/burstLeft/phase/castIndex/layoutIndex |

- **Lv80発射数対象**は明示フラグ（`lv80ProjectileTarget:true`・`SkillAudit.appliesLv80ProjectileCount`）で管理し、projectile タグでは自動適用しない。M7-D 新規は `glacial_spear_rain` のみ。氷全体の対象は**計6種**（`frost_shard`/`glacial_lance`/`icicle_volley`/`rime_boomerang`/`polar_star`/`glacial_spear_rain`）。
- **氷印/氷棺は skill-local マーカー**: `StatusEffectRegistry` へ登録せず、正式 status 表示へ重複追加しない（skill-local overlay のみ）。`Enemy._iceSeal`（マーカー参照）と `Enemy._iceHitCount`（氷属性命中カウンタ）を追加し `Enemy.reset` でクリア（pool 再利用の残留防止）。命中数起爆は `dealDamage` の ice 分岐が `_iceHitCount` を1回加算しマーカーが差分で判定する。復元方針は「通常敵は捨て（無料起爆しない）・ボスのみ再関連付け・CD は必ず復元」（詳細は `./docs/save-format.md`・`./docs/status-effects.md`）。
- **echo/clone**: `absolute_ice_seal`/`aurora_veil` は forbidden（複製・残響なし）。`glacial_spear_rain`/`snowflake_sentry` は custom（攻撃部分のみ複製・設置/砲台は増やさない）、`iceberg_ram` は echo=standard・clone=custom。
- **粉砕を起こす／起こさない**: 粉砕は大型槍（glacial_spear_rain）/凍結中の接触・崩壊（iceberg_ram）/氷印起爆（absolute_ice_seal）/burst（aurora_veil）。`snowflake_sentry` の砲台弾は粉砕なし（pulse も冷気寄り）。ボスは通常 frozen にせず氷砕ゲージ経路で扱う。

## 新進化5種（`EvolvedSkillBase`・単一形態・追加Lvなし・`element:"ice"`・`lv80ProjectileTarget:false`）

| 進化 | id | 置換元(Lv8) | 補助条件(Lv4) | castMode | echo/clone | bossGaugeMult |
|------|----|-------------|---------------|----------|-----------|---------------|
| 天墜氷槍葬 | `heavenfall_glacier_lances` | `glacial_spear_rain` | `frost_amplification`（passive） | periodic | custom | 1.4（巨大槍） |
| 六花氷衛軍 | `crystal_sentinel_legion` | `snowflake_sentry` | `rapid_freezing`（passive） | continuous | custom | — |
| 大陸氷河奔流 | `continental_glacier_rush` | `iceberg_ram` | `frozen_expansion`（passive） | cooldown | custom | — |
| 永劫封氷棺 | `eternal_sealed_coffin` | `absolute_ice_seal` | `ice_prison`（補助 active・置換しない） | reactive | **forbidden** | 2.0 |
| 極夜天光 | `polar_night_aurora` | `aurora_veil` | `lingering_cold`（passive） | continuous | **forbidden** | 1.7 |

- 天墜氷槍葬: 複数 wave の大規模氷槍雨、巨大槍のみ強化粉砕。runtime: cdLeft＋barrage。
- 六花氷衛軍: 陣形砲台＋砲台間の氷線（主命中で1回粉砕）。runtime: 各砲台(instanceId/x/y/activeLeft/shotLeft/linkCounter)。
- 大陸氷河奔流: 幅広氷河＋崩壊裂片（残留・粉砕なし）。runtime: cdLeft＋氷河。
- 永劫封氷棺: 氷棺印＋起爆時に近傍の未印へ**副棺を最大1世代だけ伝播**（副棺は再伝播しない）。runtime: markLeft＋ボス印。
- 極夜天光: 帯＋burst＋一定回数ごとの極光柱。runtime: recastLeft/activeLeft/tickLeft/burstLeft/pillarCounter/phase/layoutIndex。
- `bossGaugeMult` はボス氷砕ゲージ量のみへ適用する。M7-C 修正済みの共通経路（`dealDamage`/`damageArea`→`opts.bossGaugeMult`（既定1）→`StatusEffectManager.applyIceHit` のボス分岐で chill→ゲージ変換に1命中1回だけ→`addBossGauge`）を維持し、damage/chillAmount/procCoefficient や通常敵/エリート・炎には掛からず二重加算もしない（ボス氷砕の cooldown/threshold/vulnerability は不変）。`absolute_ice_seal`/`aurora_veil` は Lv 単調増加で validate-data が検出する。

## runtimeState・保存・テレメトリ・デバッグ（M7-D）
- CD/barrage/砲台/氷山/marker/aurora の runtimeState を `active_run.skillRuntime` へ保存し、再開時の無料再発動・二重生成・進化前後の同時稼働を防ぐ。飛行中 projectile/Graphics/Text/Tween/entity 参照/particle/overlay/F10 選択・表示状態・氷印 overlay は保存しない（詳細は `./docs/save-format.md`）。
- 品質別 `skillCaps` 19種を `data/balance.json` へ追加（装飾 cap と damage event cap を区別・visual cap でマーカー/防御性能を減らさない）。詳細は `./docs/balance-testing.md`・`./docs/data-format.md`。
- CombatTelemetry へスキル固有 extra（`recordExtra`）を追加。共通 chill/freeze/shatter/frostbreak は既存経路で記録し二重カウントしない・外部送信なし。
- `?debug=1` の **F9** で新 active5・新進化5 を付与/Lv切替/進化条件達成/即時進化でき、`debugRun` として通常 profile 統計/Job XP/残り火/魂炎へ影響しない。
- 状態表示（冷気段階/氷殻/SHATTER/ボス氷砕ゲージ/FROST BREAK/F10・状態カウンタ）は M7-B.1 の表示層へ自動反映され、氷印だけ最小限の skill-local overlay を描画する（`./docs/status-visuals.md`・`./docs/status-debug.md`）。

## 検証（M7-D）
`frost-skills-wave4.mjs`／`frost-evolutions-wave4.mjs`／`frost-policy-audit-wave4.mjs`／`frost-runtime-save-wave4.mjs`／`frost-determinism-wave4.mjs`／`frost-boss-gauge-wave4.mjs`・`validate-data.mjs`（M7-D 検証ブロック）。
**全51スイート通過・validate-data 0エラー0警告**。実ブラウザでの描画・当たり判定・視認性・体感バランス・60FPS は本環境では**未検証**（`./docs/test-guide.md` の M7-D 項目）。実行していない項目を「確認済み」と報告しない。

## Milestone 7-E: 氷術師スキルの監査と修正（新規追加なし）

### 宣言値を実適用へ変更したもの（死にパラメータの解消）
| スキル | 値 | 変更前 | 変更後 |
|--------|----|--------|--------|
| `crystal_bloom` | 設置間隔 | `interval` が未参照で一律 1000ms | キー名を `cooldown` へ改名し Lv1 1600ms → Lv8 1150ms（熟練度/パッシブの CD 倍率も乗る） |
| `polar_star` | 直撃ダメージ | `impactDamage` が未参照 | 直撃した敵へ Lv1 30 / Lv8 66 を適用（射程終端の自然爆発では発生しない） |
| `absolute_ice_seal` | 凍結対象への起爆 | `frozenDamageBonus` が未参照 | ×1.20（Lv1）〜 ×1.50（Lv8） |
| `eternal_sealed_coffin` | 凍結対象への起爆 | `frozenDamageBonus` が未参照 | ×1.50 |
| `heaven_piercing_glacier` | 基礎凍結確率 | `freeze.baseChance` が未参照（進化後の方が凍結しない） | 0.12 を弾へ適用 |
| `crystal_sentinel_legion` | `pulseProc` | 基礎からの複写残骸（pulse 機構なし） | data から削除 |

### ボス氷砕ゲージ倍率の付け替え
`heaven_piercing_glacier` / `absolute_zero_ray` は `bossGauge.multiplier` を `chillAmount` へ乗算していたため
通常敵の冷気まで増えていた。M7-C の共通経路（ボス氷砕ゲージ量のみへ 1 回）へ付け替え、
通常敵の冷気は 48→30 / 12→8（tick）へ戻した。**ボス側のゲージ量は不変**。

### `custom` echo / clone の実装
| スキル | 残響（echoCast） | 分身（cloneCast） |
|--------|------------------|-------------------|
| `absolute_zero_ray` | 追加照射 1 回（粉砕なし・セッションを再生成しない） | 射程 60% の短い光線 1 回 |
| `world_end_avalanche` | 追加の氷河波 1 本のみ | 波の接触ダメージ 1 回のみ（波実体・残留物なし） |
| `continental_glacier_rush` | 縮小氷河 1 本（`cloneCast` へ委譲） | 縮小氷河 1 本 |

いずれも `recordCast` を呼ばない（発動数の二重計上なし）。`forbidden` のスキルは従来どおり複製・残響の対象外。

### 上限の接続（既定品質では実効値が変わらない位置でクランプ）
`maxFrostShards`（`frost_shard` の発射数）/ `maxGlacialLances` / `maxFrostNovaTargetsPerFrame` /
`maxIcePrisons`（同時氷牢数）/ `maxIcebergRams` / `maxContinentalGlacierRushes`（同時1つ）/
`maxAbsoluteZeroRayBranches` / `maxWorldEndAvalancheWaves` / `maxSentryProjectiles`（砲台弾の同時数）/
`maxGlacialSpearTelegraphs` / `maxShatterProjectiles`（粉砕由来の弾数）を実装へ接続した。
`CrystalSentinelLegionSkill` は砲台数の上限に「1フレームあたりの氷線予算」を混ぜていた名前違いを解消した（実効値は不変）。


---

## Milestone 8-A: 火の魔女スキルの監査と修正（新規追加なし）

active30 / 進化18 を対象に監査し、**死にパラメータ 21 件・未参照 quality cap 5 件を 0 件**にした。
新規スキルは追加していない。詳細は `./flame-completion-audit.md`。

### クールダウン保存漏れの修正（21 種）
`fireball` `flame_pillar` `burning_trail` `orbiting_flame` `meteor` `flame_lance` `scatter_flame` `homing_wisp`
`chain_flame` `lava_bomb` `flame_vortex` `fire_spirit` `detonation_mark` と、
進化 `infernal_barrage` `purgatory_eruption` `eternal_pyre` `thousand_flame_lances` `hundred_wisp_parade`
`solar_core_collapse` `infernal_vortex_wheel` `apocalypse_chain` は `serializeState()` を持たず、
**リロードで CD が全回復して無料発動**できていた。CD 型は `cdLeft`、常設型（`orbiting_flame` / `fire_spirit` /
`eternal_pyre`）は回転位相・主発動スロットル・射撃タイマーを保存するようにした。
`ash_doppelganger` / `ash_legion` / `solar_annihilation_array` も、複製タイマー・ユニットタイマー・
集束ビームの残り時間を保存する（以前は再開直後に全ユニットが無料で一斉発動）。

### 残響・分身が発生しなかった 2 進化の修正
`eternal_pyre` / `solar_annihilation_array` は常設型で `recordCast` を一度も呼ばず、
data で宣言した残響・分身が**絶対に発生しない**状態だった（進化元では発生する＝進化で機能を失っていた）。
`config.castPulseMs`（500 / 600ms）で主発動をスロットル記録し、`echoPolicy`/`clonePolicy` を実装に合わせて
`custom`（攻撃部分のみ）へ修正、`eternal_pyre` には `echoCast()`（領域の追加パルス）を実装した。

### 実装へ接続した宣言値（挙動は不変）
`infernal_barrage.chain.onKillExtra` / `.chainExplosion`、`purgatory_eruption.pull.excludeBoss`、
`solar_core_collapse.pull.excludeBoss`、`thousand_flame_lances.chain.splitOnPierce` / `damage.rampMax`、
`hundred_wisp_parade.chain.splitOnKill`、`infernal_vortex_wheel.chain.infect`、
`apocalypse_chain.chain.spreadOnChain` / `projectileCount.spreadCount`、
`solar_annihilation_array.projectileCount.auxBeams`、`hellfire_mine_network.projectileCount.markTargets`、
`hexagram_inferno_array.projectileCount.vertices`。いずれも宣言値＝従来のハードコード値。

### 削除した予約値（実装すると火力が変わるため）
`skills.json` の旧 `evolution` ブロック 3 件、`bloodfire_pact.buffDamage`/`buffMs`、
`four_sided_inferno.burnMs`、`inferno_blade_domain.projectileCount.sweeps`、
`necroflame_mausoleum.area.senseRadius`、`universal_flame_resonance.config.countRadius`。

### 性能
`eternal_pyre.spreadInfection()` が `enemyPool.forEachActive()` で毎 tick 全敵を走査していたのを、
M6-E で用意した炎上索引（`combat.burningEnemies()`）経由へ付け替えた（対象集合は同じ）。

## Milestone 8-B: 戦士スキル（近接・active5 / evolution3）

戦士のスキルは `WarriorSkillBase` / `WarriorEvolvedBase` を継承し、**必ず `scene.combat.meleeStrike()` を通す**。
自前で敵を走査せず（`enemyPool.forEachActive` 禁止）、ダメージ・ノックバック・体勢・闘気・コンボの適用は
すべて `BattleScene.meleeStrike()` と `WarriorCombatSystem` に集約されている。

- 判定形状は「自分中心の円（`arc = 2π`）」か「前方の扇（`arc < 2π`）」のみ。**弾を生成しない**。
- 向きは `facing()` が決める: 敵の密集地点 → 最寄りの敵 → 移動方向 → 右向き、の順。
- 1 発動 = 1 `castKey` = 1 `recordCast`。多段打撃・回転 tick・突進の通過判定では cast を増やさない。
- Job Lv80「打撃数 +1」は `lv80ProjectileTarget: true` を明示したスキルにだけ効く
（`great_cleave` / `shield_bash` / `ground_slam`）。
- 全 8 本が `serializeState` / `restoreState`（最低でも `cdLeft`）と `destroy()`（`_dead` ガード）を持つ。
- 残響・分身は data で `forbidden`。`echoCast` / `cloneCast` を実装していない。

一覧と役割は `./skill-catalog.md` の Milestone 8-B 節、設計意図は `./warrior-design.md`。

## Milestone 8-C: 戦士スキル拡張 Wave1（active15 / evolution8）

M8-B の骨格（`WarriorSkillBase` / `WarriorEvolvedBase` / `meleeStrike()` 一本化）はそのまま。
M8-C で足したのは **共通経路の追加**と、**進化が基礎クラスを再利用する仕組み**の 2 点だけ。

### 追加した共通経路（`scene.combat` 経由でのみ触る）

| API | 用途 | 保証 |
|-----|------|------|
| `preferredMeleeTarget(x, y, r, mode)` | 硬い相手 / 瀕死を優先して狙う | 全敵総当たりをしない（`mode`: `'tough'` / `'lowHp'`） |
| `executeTarget(e, skillId, opts)` | 処刑（残り HP ぶんのダメージ） | 死亡イベント・撃破統計・撃破回復が 1 回だけ走る |
| `pullTarget(e, opts)` | 引き寄せ | ボスは動かない / 壁内へクランプ / `SpatialGrid` 更新 / 慣性を残さない |
| `movePlayerTowards(x, y, d)` | 自分が近づく | 壁内へクランプ / NaN を作らない |
| `bossTelegraphing()` | ボスの予告 / 突進の確認 | 真正面へ踏み込まないための判断材料 |
| `warriorPullConfig()` | `balance.warrior.pull` の取得 | data と実装を 1 か所で結ぶ |

`meleeStrike()` には `toughBonus`（硬い相手への追加倍率）・`execute`（処刑パラメータ）・
`maxExecutes`・`visualCap`（演出専用の品質 cap）を追加した。判定と演出は完全に分離されている。

### 進化が基礎 active のクラスを継承するとき

軍神咆哮 / 金剛迎撃 / 天墜崩撃は `EvolvedSkillBase` ではなく**基礎スキルのクラス**を継承している
（ロジックをそのまま使いたいため）。data の読み先だけを進化定義へ差し替えるために
`WarriorSkillBase.js` の `applyEvolvedSemantics(cls)` をプロトタイプへ適用する。

```js
export class AdamantCounterSkill extends CounterStanceSkill {
  stanceParams() { /* evoDef から読む */ }
}
applyEvolvedSemantics(AdamantCounterSkill);
```

これで `evoDef` / `baseSkillId` / `isEvolved` / `name` / `maxLevel` / `cap()` / `evolvedBonus()` が生え、
`stats` は `{ cooldown: evoDef.cooldown }` を合成して返すので `SkillBase.update()` の発動判定が
そのまま働く。テスト側は `skillSourceDeep()` が `extends` を辿って祖先のソースも見る。

### Wave1 のスキルが守る規約（M8-B から継続 + 追加）

- 判定は「自分中心の円」か「前方の扇」のみ。**弾を生成しない**（`spawnPlayerProjectile` を呼ばない）
- 1 発動 = 1 `castKey` = 1 `recordCast`（多段・tick・引き継ぎで cast を増やさない）
- 乱数を使わない（`Math.random` / Phaser RNG を 1 度も呼ばない）
- 進行中の状態は敵オブジェクトを保持せず、**安定 runtime id（`_seq`）と座標だけ**を持つ
- 進行中の効果は**距離と時間の両方**で必ず終わる
- `serializeState` / `restoreState`（最低でも `cdLeft`）と `destroy()`（`_dead` ガード）を持つ
- Job Lv80「打撃数 +1」は `lv80ProjectileTarget: true` の 6 種だけ

一覧と役割は `./skill-catalog.md` の Milestone 8-C 節と `./warrior-skill-matrix.md`、
設計意図は `./warrior-wave1.md`。

## Milestone 8-C.1: 抽選導線（スキル実装は変更なし）

M8-C.1 は **`SkillDraftManager` の重み計算だけ**を直した回で、スキルの実装・数値・進化条件は 1 件も変えていない。

- `src/skills/**` は **1 ファイルも変更していない**
- `data/skills.json` / `data/skill-evolutions.json` / `data/balance.json` も変更なし
- 変更したのは `src/systems/SkillDraftManager.js` / `src/scenes/BattleScene.js`（ctx を渡す部分と F8 表示）/
  `src/systems/CombatTelemetry.js`（集計キーの追加）/ `data/skill-config.json`（`guidance` ブロックの追加）

抽選側の詳細は `./warrior-evolution-guidance.md`。


## Milestone 8-D: 戦士スキル拡張 Wave2（active25 / evolution13）

Wave1 と同じ土台（`WarriorSkillBase` / `WarriorEvolvedBase` / `applyEvolvedSemantics`）の上に
10 active・5 進化を足した。**必ず `scene.combat` の共通経路を通す**という規則は変わらない。

### Wave2 で足した combat API

| API | 何をするか | なぜ共通経路にするか |
|-----|-----------|---------------------|
| `launchTarget(e, o)` | 通常敵を打ち上げる | 可否・滞空・免疫を 1 か所で判断し、残留の掃除も揃える |
| `grabTarget(e, o)` / `grabbedTarget()` / `releaseGrab()` / `throwGrabbed(o)` | 掴み・投げ | **敵オブジェクトを保持しない**（`_seq` のみ）・壁内クランプ・SpatialGrid 更新 |
| `thrownStrike(o)` | 投擲判定（`meleeStrike` の `isThrown` 版） | 近接ダメージ倍率を掛けないことを 1 か所で保証する |
| `warriorWave2Config(key)` | `balance.warrior.<key>` の取得 | data と実装を 1 か所で結ぶ |

### `meleeStrike` へ足したオプション（いずれも明示したときだけ効く）

| キー | 意味 |
|------|------|
| `isThrown` | 投擲。近接倍率を掛けず、`damageTags` を `['thrown']` にする |
| `launch: { durationMs, height, counts, maxPerTarget, immuneMs }` | 打ち上げ。`counts` は `_seq` → 回数の Map |
| `seqHitCounts` / `seqHitCap` | 同一敵への命中回数の上限（戦斧の往復） |
| `toughPoiseBonus` | エリート / ボスにだけ乗る体勢削りの追加倍率（破城膝撃） |

未指定なら従来と完全に同じ経路を通るので、火 / 氷のスキルは 1 バイトも影響を受けない。

一覧と役割は `./skill-catalog.md` の Wave2 節、設計意図は `./warrior-wave2.md`。
