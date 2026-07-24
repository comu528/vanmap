# ジョブシステム（Milestone 7-A で複数ジョブ化）

M6-A で導入したジョブ基盤（`data/jobs.json`・`data/job-progression.json`）を、M7-A で **複数ジョブ** へ拡張した。
現在のジョブは **火の魔女（flame_witch・火属性）** と **氷術師（frost_mage・氷属性）** の2種。ジョブごとに
スキルプール／Job XP／Job Lv／統計を **完全分離** し、ジョブ補正は使用中の属性へのみ適用する。

- データ: `./data/jobs.json`（ジョブ定義）/ `./data/job-progression.json`（XP曲線・到達報酬）
- 純ロジック: `./src/systems/JobProgressionManager.js`（XP/Lv/周回報酬）/ `./src/systems/JobModifierManager.js`（補正解決・適用・複数属性）
- 検証: `node tests/multi-job-selection.mjs` / `node tests/frost-job-progression.mjs`

## ジョブ一覧
| jobId | 表示名 | element | 初期スキル | active | passive | 進化 | Job Lv |
|-------|--------|---------|-----------|--------|---------|------|--------|
| `flame_witch` | 火の魔女 | fire | `fireball` | 30 | 4（共通） | 18 | 1〜100 |
| `frost_mage` | 氷術師 | ice | `frost_shard` | 25 | 4（氷専用） | 13 | 1〜100 |

- **火の魔女は M7-A/M7-B/M7-C で変更なし**（active30 / passive4 / evo18・同 seed 抽選結果不変）。
- **氷術師は M7-A で active5/passive4/evo3、M7-B で active15/passive4/evo8、M7-C で active25/passive4/evo13 へ拡張**（下記「Milestone 7-B」「Milestone 7-C」）。
- **氷術師（M7-A 新規）**:
  - active5: `frost_shard`（氷晶弾）/ `frost_nova`（氷輪爆）/ `glacial_lance`（氷河槍）/ `permafrost_field`（永久凍土）/ `ice_wall`（氷壁）
  - passive4: `frost_amplification`（氷晶増幅・氷Dmg）/ `rapid_freezing`（急速冷却・氷CD）/ `frozen_expansion`（凍域拡張・範囲）/ `lingering_cold`（余寒残留・氷状態持続＋冷気減衰緩和）
  - evolution3:
    - `diamond_blizzard`（ダイヤモンドブリザード）← `frost_shard` Lv8 ＋ `rapid_freezing` Lv4
    - `absolute_zero_domain`（絶対零度領域）← `frost_nova` Lv8 ＋ `frozen_expansion` Lv4
    - `heaven_piercing_glacier`（天穿氷河槍）← `glacial_lance` Lv8 ＋ `frost_amplification` Lv4
  - ジョブが扱う状態異常 `statusEffects`: `chill` / `frozen` / `freeze_immunity` / `frostbreak_vulnerability`（詳細は `./docs/status-effects.md`）。

## ジョブ選択と active_run への固定
- 拠点の「ジョブ育成」タブが **火の魔女／氷術師のカード表示＋選択画面** へ拡張された。選択ジョブは `profile.selectedJobId`（**既定 `flame_witch`**）。
- **進行中の周回があるときはジョブ変更不可**（`active_run` が残っている間は選べない）。変更は **次の新規周回から**有効。
- 周回開始時に `active_run.jobId` へ**周回ジョブを固定**する。周回中はそのジョブのプール／補正で進行し、途中でジョブを変えても
  進行中周回には影響しない。`active_run.jobElement`（fire/ice）も保存する。
- ジョブごとに **スキルプール／Job XP／Job Lv／統計を完全分離**（`profile.jobProgress.flame_witch` と `profile.jobProgress.frost_mage` は別）。

## Job XP / Job Lv（ジョブごとに分離）
XP曲線・周回報酬の計算は両ジョブ共通（`totalXpForLevel(L)=25(L-1)²+75(L-1)`・周回終了時にまとめて付与・二重獲得防止）で、
`data/job-progression.json` の `jobs.<id>` に各ジョブの `perLevelBonuses` と `milestones` を持つ。`JobProgressionManager` は
ジョブ非依存で、`profile.jobProgress[jobId].totalXp` を唯一の正として都度 Lv を算出する。

### 氷術師の基本成長（`perLevelBonuses`・Lv1 は恒等）
| 成長 | 係数 | 対象 |
|------|------|------|
| 氷属性ダメージ | +0.35%/Lv | element:ice のダメージ（`elementDamageMult`） |
| 冷気付与量 | +0.30%/Lv | `chillAmount` 等（`statusPowerMult`） |
| 粉砕 | +0.40%/Lv | 粉砕ダメージ（`shatterDamageMult`） |

### 氷術師の到達レベル報酬（`milestones`）
| Lv | 報酬 | 効果 |
|----|------|------|
| 5 | 氷晶強化 | 氷ダメージ +5% |
| 10 | 冷気増幅 | 冷気付与量 +10% |
| 20 | 急速詠唱 | 氷 active の CD −5% |
| 30 | 選択の余地 | 周回開始時リロール +1 |
| 40 | 凍結狩り | 冷気状態の敵へ氷 +10% / frozen・氷砕脆弱の敵へ +20%（**frozen 優先で二重適用しない**） |
| 50 | 氷砕連鎖 | 凍結中の通常敵/エリートが氷ダメージで死亡時に小粉砕爆発（1体1回・**再帰なし**・ボス対象外） |
| 60 | 進化魔法強化 | 氷進化スキルの全ダメージ +20% |
| 70 | 高位氷術適性 | rare 抽選重み ×1.15 / legendary ×1.25（氷術師の抽選のみ） |
| 80 | 氷弾増殖 | `projectile` タグの氷 active の発射数 +1（地面/壁/凍結確率/冷気/Nova回数は増やさない） |
| 90 | 極低温詠唱 | 氷 active の CD を追加で −10%（下限維持） |
| 100 | 絶対零度 | 通常/エリートの確定凍結閾値 −20% / ボス氷砕閾値 −15% / 凍結持続 +20%（安全下限維持・完全永久凍結なし） |

火の魔女の到達報酬（火力/残響/爆炎 など）は M6-C から不変。

## JobModifierManager（複数ジョブ・複数属性）
`JobModifierManager` は fire 専用から複数ジョブ・複数属性へ拡張された。周回開始時に Job Lv から補正を **`resolve`** して凍結し、
周回中は固定する（`active_run.resolvedJobModifiers`）。要点:
- **`primaryElement`**（火の魔女=fire / 氷術師=ice）に一致する属性のダメージへのみ属性補正を適用する。
  **火補正を氷へ／氷補正を火へ誤適用しない**（`damageMultiplier` が `tags.element !== primaryElement` で 1 を返す）。
- 共通フィールド: `jobId` / `primaryElement` / `elementDamageMult` / `dotDamageMult` / `statusPowerMult` / `shatterDamageMult` /
  `chilledDamageMult` / `frozenDamageMult` / `areaMult` / `explosionAreaMult` / `cooldownMult` / `evolvedDamageMult` /
  `projectileCountBonus` / `projectileSpeedMult` / `rareWeightMult` / `legendaryWeightMult` / `extraRerolls` / `echo` /
  `shatterOnFrozenKill` / `absoluteZero`。
- **火の魔女の補正は同値維持**（旧 `fireDamageMult`/`fireAreaMult` は `coerceResolved` で `elementDamageMult`/`areaMult` へ移行・非回帰）。
- 状態対象ボーナス（Lv40 凍結狩り）は `frozen`/氷砕脆弱を優先し `chilled` と二重適用しない。

## 保存（save_version は v6 維持）
`profile` へ `selectedJobId`（既定 `flame_witch`）・`jobProgress.frost_mage` を加算追加。`unlockedJobs` は既定で
`['flame_witch','frost_mage']`（移行時に `frost_mage` を加算的に含める）。`active_run` へ `jobId`/`jobElement`/`jobLevelAtStart`/
`resolvedJobModifiers`/`statusRng`/ボス frostbreak 状態 などを保存する（詳細は `./docs/save-format.md`）。加算的追加のため **`save_version` は v6 のまま**。

## ダメージ適用順（`JobModifierManager` の位置）
1. JSON 基礎値 → 2. スキル Lv → 3. passive → 4. 熟練度 → 5. Job Lv 基本成長 → 6. Job 到達報酬 →
7. 状態対象ボーナス（chilled/frozen）→ 8. 進化補正 → 9. echo/clone 倍率 → 10. 安全下限/上限。
氷ダメージには氷パッシブ（氷晶増幅）とボス氷砕脆弱（×1.15）を追加乗算し、**火ダメージには適用しない**（詳細は `./docs/architecture.md`）。

## 将来のジョブを追加する手順
1. `data/jobs.json` にジョブ定義を追加（`id`/`element`/`iconKey`/`statusEffects`/`initialActiveSkills`/`activeSkillPool`/
   `passiveSkillPool`/`evolutionPool`/`baseActiveSlots`/`basePassiveSlots`/`tags`）。
2. `data/job-progression.json` の `jobs.<id>` に `element`/`levelCap`/`xpCurve`/`xpReward`/`perLevelBonuses`/`milestones` を追加。
3. `data/skills.json`/`data/passives.json`/`data/skill-evolutions.json` に新スキル・進化を追加し、各挙動クラスを `SkillManager` の
   REGISTRY へ登録（`element` を持たせる）。
4. 新しい属性補正／状態異常が必要なら `JobModifierManager.resolve`（milestone type）と `data/status-effects.json` を拡張する。
5. `profileSchema.js` の `unlockedJobs` 既定へ id を足せば選択可能になる（`profile.jobProgress[id]` は加算的に初期化）。
6. `node tests/validate-data.mjs`・`node tests/multi-job-selection.mjs` を通す。継承（`futureInheritanceSettings`）・転生レガシーは拡張口のみ（未実装）。

## Milestone 7-B: 氷術師ビルド拡張（active15 / 進化8 へ・save_version は v6 のまま）
氷術師（frost_mage）へ専用 active を **10種**・進化を **5種** 追加し、**active 15種 / passive 4種（M7-B で追加なし）/ 進化 8種 / Job Lv1〜100** に拡張した。
火の魔女（active30/passive4/進化18）は不変で同 seed の抽選結果も不変。冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路を使い
（独自凍結タイマーなし）、Math.random 不使用（決定論）・draft RNG cursor 不変。**save_version は v6 のまま**（加算的）。数値は `data/skills.json` が正。

### 新 active10種（すべて氷術師専用・`element:"ice"`・maxLevel8・Lv1〜8 データ駆動）
| スキル | id | rarity | castMode | 役割 | Lv80発射数 |
|--------|----|--------|----------|------|-----------|
| 氷柱斉射 | `icicle_volley` | common | cooldown | 時間差の連射（複数弾） | **対象** |
| 氷晶環 | `frost_orbit` | common | continuous | 常設の周回接触（再構築） | 対象外 |
| 凍結光線 | `freezing_ray` | uncommon | continuous | 冷気ランプ・指定間隔のみ粉砕するビーム | 対象外 |
| 雹嵐 | `hailstorm` | uncommon | periodic | 範囲の雹 | 対象外 |
| 氷結地雷 | `cryo_mine` | common | reactive | 罠/爆発・frozen 敵を粉砕（反応型） | 対象外 |
| 雪精霊 | `frost_spirit` | uncommon | continuous | 常設の召喚（再構築） | 対象外 |
| 氷牢封印 | `ice_prison` | rare | cooldown | 制御/範囲・冷気十分で短時間凍結、不足で大幅減速、ボスは氷砕ゲージ | 対象外 |
| 雪崩奔流 | `avalanche` | uncommon | periodic | 波/範囲・通常押し流し/エリート軽減/ボス移動なし/frozen 粉砕 | 対象外 |
| 氷鏡結界 | `mirror_ice` | rare | defensive | 敵弾吸収＋氷反撃弾（複製なし） | 対象外 |
| 氷河墜落 | `glacier_drop` | legendary | cooldown | 予告後に落下する遅延大範囲/爆発・frozen 粉砕・ボス氷砕・凍結床残留 | 対象外 |

- **Job Lv80「発射数+1」対象の新 active は `icicle_volley` のみ**（`SkillAudit` で一元管理・新進化5種は全て対象外）。
- proc係数（凍結寄与）: icicle_volley≈0.38 / frost_orbit≈0.20 / freezing_ray≈0.12 / hailstorm≈0.22 / cryo_mine≈0.75 /
  frost_spirit≈0.42 / ice_prison≈0.95(主)・0.45(周辺) / avalanche≈0.55 / mirror_ice≈0.30 / glacier_drop≈0.95(主)・0.15(残留床)。
- `mirror_ice` は echoPolicy=clonePolicy=forbidden（複製なし）・既存 `bossBulletPool` の absorbable メタを再利用。`cryo_mine` は反応型で canTriggerEcho=false。

### 新 進化5種（`EvolvedSkillBase`・単一形態・`element:"ice"`・Lv80発射数対象外・evolved タグ）
| 進化 | id | 置換元 | 条件（基礎Lv8＋補助Lv4） | castMode |
|------|----|--------|--------------------------|----------|
| 天晶氷嵐 | `crystal_tempest` | `icicle_volley` | icicle_volley Lv8 ＋ frost_amplification Lv4 | cooldown |
| 絶対零光 | `absolute_zero_ray` | `freezing_ray` | freezing_ray Lv8 ＋ rapid_freezing Lv4 | continuous |
| 白魔大氷災 | `whiteout_cataclysm` | `hailstorm` | hailstorm Lv8 ＋ lingering_cold Lv4 | periodic |
| 雪后氷霊陣 | `frost_queen_court` | `frost_spirit` | frost_spirit Lv8 ＋ frozen_expansion Lv4 | continuous（常設・再構築） |
| 終末氷河奔流 | `world_end_avalanche` | `avalanche` | avalanche Lv8 ＋ ice_wall(active) Lv4 | periodic |

- 進化は基礎 active を置換し active/passive 枠を消費しない。補助条件スキルは消費しない。**passive は4種のまま**（M7-B で追加なし）。
- 主発動時のみ `recordCast`（各弾/tick/命中/雹/地雷起爆/精霊射撃/波接触/粉砕/frostbreak では記録しない）。echo/clone は1世代・再帰なし。
- 検証: `frost-skills-wave2.mjs`／`frost-evolutions-wave2.mjs`／`frost-policy-audit.mjs`／`frost-runtime-save-wave2.mjs`／`frost-determinism-wave2.mjs`・`validate-data.mjs`（M7-B 検証ブロック）。詳細は `./docs/skill-catalog.md`・`./docs/status-effects.md`。

## Milestone 7-B.1: 状態異常の視認性（氷術師の状態が見えるように）
M7-B.1 で、氷術師の状態異常が**通常プレイ中に視認・確認できる**ようになった（冷気の段階/frozen/粉砕/ボス氷砕ゲージ/F10 状態デバッグ）。
**新スキル/パッシブ/進化/ジョブは追加せず・Job Lv 報酬や数値は不変**（`elementDamageMult`/`statusPowerMult`/`shatterDamageMult`/凍結確率/ボス氷砕値はそのまま）。
表示は演出であり戦闘結果を変えない・表示状態は保存しない・`save_version` は v6 のまま。詳細は `./docs/status-visuals.md`・`./docs/status-debug.md`。

## Milestone 7-C: 氷術師ビルド拡張・第2波（active25 / 進化13 へ・save_version は v6 のまま）
氷術師（frost_mage）へ専用 active を **10種**・進化を **5種** 追加し、**active 25種 / passive 4種（M7-C で追加なし）/ 進化 13種 / Job Lv1〜100** に拡張した。
火の魔女（active30/passive4/進化18）は不変で同 seed の抽選結果も不変。冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路を使い
（独自タイマーなし）、Math.random/Date.now/performance.now 不使用（index ベース決定論・同点は `_seq`→x→y）・draft RNG cursor 不変。**save_version は v6 のまま**（加算的）。数値は `data/skills.json`/`data/skill-evolutions.json` が正。

### 新 active10種（すべて氷術師専用・`element:"ice"`・`isCommon:false`・maxLevel8・Lv1〜8 データ駆動）
| スキル | id | rarity | castMode | 役割 | Lv80発射数 |
|--------|----|--------|----------|------|-----------|
| 霜輪飛刃 | `rime_boomerang` | common | cooldown | 往復 projectile・往路/復路で別命中・復路で凍結敵粉砕 | **対象** |
| 氷鎖連閃 | `frost_chain` | uncommon | cooldown | 高冷気優先の瞬間連鎖・後半減衰・同一敵へ再連鎖しない | 対象外 |
| 氷晶開花 | `crystal_bloom` | common | periodic | 発芽→開花の設置・開花時のみ粉砕（pulse は弱い） | 対象外 |
| 白霧氷界 | `snowblind_mist` | uncommon | continuous | 追従霧・持続冷気・粉砕なし | 対象外 |
| 極星氷弾 | `polar_star` | rare | cooldown | 大型星＋pulse＋着弾爆発＋氷片の複合弾 | **対象** |
| 砕氷衝波 | `icebreaker_wave` | common | cooldown | 扇状衝波・通常敵push/エリート軽減/ボスpushなし/凍結敵粉砕 | 対象外 |
| 氷刻停止 | `frozen_clock` | legendary | periodic | 全画面時計波・直接凍結せず FreezeSystem 委譲 | 対象外 |
| 氷晶屈折 | `crystal_refraction` | rare | cooldown | 屈折 projectile・最終屈折のみ粉砕 | 対象外 |
| 冬冠結界 | `winter_halo` | uncommon | defensive | 氷冠吸収＋近距離冷気反撃（`mirror_ice` と差別化・複製なし） | 対象外 |
| 氷彗星群 | `comet_sleet` | rare | periodic | 予告＋barrage・大彗星のみ粉砕（黄金角で落下点分散） | 対象外 |

- **Job Lv80「発射数+1」対象は明示フラグ（`lv80ProjectileTarget:true`・`SkillAudit.appliesLv80ProjectileCount`）で管理**し projectile タグでは自動適用しない。新 active では `rime_boomerang`/`polar_star`。氷全体の対象は計5種（`frost_shard`/`glacial_lance`/`icicle_volley`/`rime_boomerang`/`polar_star`）・新進化5種は全て対象外。
- 一次 proc（`procCoefficient`）: rime_boomerang0.38 / frost_chain0.38 / crystal_bloom0.16 / snowblind_mist0.14 / polar_star0.70 / icebreaker_wave0.60 / frozen_clock0.65 / crystal_refraction0.38 / winter_halo0.32(反撃) / comet_sleet0.42。二次 proc は `config`（rime_boomerang 復路0.50 / crystal_bloom 開花0.75 / polar_star pulse0.12・shard0.30 / comet_sleet 大彗星0.80 等）。
- `frozen_clock`/`winter_halo` は echoPolicy=clonePolicy=forbidden（複製・残響なし）。`crystal_bloom`/`snowblind_mist`/`comet_sleet` は custom（攻撃部分のみ複製）。

### 新 進化5種（`EvolvedSkillBase`・単一形態・`element:"ice"`・Lv80発射数対象外・evolved タグ）
| 進化 | id | 置換元 | 条件（基礎Lv8＋補助Lv4） | castMode |
|------|----|--------|--------------------------|----------|
| 冥氷処刑輪 | `rime_execution_wheel` | `rime_boomerang` | rime_boomerang Lv8 ＋ frost_amplification Lv4 | cooldown |
| 永劫氷鎖 | `eternal_frost_chain` | `frost_chain` | frost_chain Lv8 ＋ rapid_freezing Lv4 | cooldown |
| 世界氷晶樹 | `crystal_world_tree` | `crystal_bloom` | crystal_bloom Lv8 ＋ frozen_expansion Lv4 | periodic |
| 永久白霧 | `everlasting_white_mist` | `snowblind_mist` | snowblind_mist Lv8 ＋ lingering_cold Lv4 | continuous |
| 零刻世界 | `zero_hour_world` | `frozen_clock` | frozen_clock Lv8 ＋ ice_prison(補助 active) Lv4 | periodic |

- 進化は基礎 active を置換し active/passive 枠を消費しない。補助条件スキルは消費しない。**passive は4種のまま**（M7-C で追加なし）。`zero_hour_world` の条件に使う `ice_prison` は進化条件用の補助 active で**置換しない**。
- 主発動時のみ `recordCast`（各弾/tick/命中/pulse/開花/衝波/wave/屈折/彗星落下/粉砕/frostbreak では記録しない）。echo/clone は1世代・再帰なし（`zero_hour_world` は forbidden）。
- ボスは通常 frozen にせず chill→氷砕ゲージへ変換し、`frozen_clock`/`zero_hour_world` の `bossGaugeMult` はボス氷砕ゲージ量のみへ1命中1回だけ適用する（`applyIceHit` のボス分岐で chill→ゲージ変換に掛かるだけで damage/chill/proc や通常敵・炎には掛からず二重加算しない。ボス氷砕の cooldown/threshold/vulnerability は不変）。
- 検証: `frost-skills-wave3.mjs`／`frost-evolutions-wave3.mjs`／`frost-policy-audit-wave3.mjs`／`frost-runtime-save-wave3.mjs`／`frost-determinism-wave3.mjs`・`validate-data.mjs`（M7-C 検証ブロック）。**全44スイート通過・validate-data 0エラー0警告**。実描画・体感は本環境では未検証。詳細は `./docs/skills.md`・`./docs/skill-catalog.md`・`./docs/status-effects.md`。
