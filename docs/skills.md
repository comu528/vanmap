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
