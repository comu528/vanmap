# スキル詳細（氷術師の新スキル・Milestone 7-C）

氷術師（frost_mage）へ Milestone 7-C で追加した **新 active10種・新進化5種** の役割・rarity・castMode・proc をまとめる。
数値の正は `data/skills.json`／`data/skill-evolutions.json`（Lv1〜8 データ駆動）で、本書は概要（指示なく数値を変更しない）。
冷気/凍結/粉砕/ボス氷砕はすべて既存 `StatusEffectManager`／`FreezeSystem` 経路を使い、独自タイマー・独自状態種別を持たない（詳細は `./docs/status-effects.md`）。
全新スキルは **Math.random/Date.now/performance.now 不使用の index ベース決定論**（同点は entity `_seq`→x→y で安定決定）。氷術師は M7-C で **active25 / passive4（追加なし）/ 進化13**。

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
- `frozen_clock`/`zero_hour_world` の `bossGaugeMult` は設計上の予約値で、氷砕ゲージ加算は標準 chill 経路が担うため二重適用しない（ボス氷砕の cooldown/threshold/vulnerability は不変）。

## runtimeState・保存・テレメトリ・デバッグ
- CD/設置/遅延/防御/barrage の runtimeState を `active_run.skillRuntime` へ保存し、再開時の無料再発動・二重生成・進化前後の同時稼働を防ぐ。飛行中 projectile/Graphics/Text/Tween/entity 参照/particle/overlay/F10 選択は保存しない（詳細は `./docs/save-format.md`）。
- 品質別 `skillCaps` 23種を `data/balance.json` へ追加（装飾上限と damage event 上限を区別・`winter_halo` の防御耐久は visual cap で減らさない）。詳細は `./docs/balance-testing.md`・`./docs/data-format.md`。
- CombatTelemetry へスキル固有 extra（`recordExtra`）を追加。共通 chill/freeze/shatter/frostbreak は既存経路で記録し二重カウントしない・外部送信なし。
- `?debug=1` の **F9** で新 active10・新進化5 を付与/Lv切替/進化条件達成/即時進化でき、`debugRun` として通常 profile 統計/Job XP/残り火/魂炎へ影響しない。
- 状態表示（冷気段階/氷殻/SHATTER/ボス氷砕ゲージ/FROST BREAK/F10）は M7-B.1 の表示層へ自動反映され、スキルクラスから状態演出を直接生成しない（`./docs/status-visuals.md`・`./docs/status-debug.md`）。

## 検証
`frost-skills-wave3.mjs`／`frost-evolutions-wave3.mjs`／`frost-policy-audit-wave3.mjs`／`frost-runtime-save-wave3.mjs`／`frost-determinism-wave3.mjs`・`validate-data.mjs`（M7-C 検証ブロック）。
**全44スイート通過・validate-data 0エラー0警告**。実ブラウザでの描画・当たり判定・視認性・体感バランス・60FPS は本環境では**未検証**（`./docs/test-guide.md` の M7-C 項目）。実行していない項目を「確認済み」と報告しない。
