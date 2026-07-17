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
| `frost_mage` | 氷術師 | ice | `frost_shard` | 5 | 4（氷専用） | 3 | 1〜100 |

- **火の魔女は M7-A で変更なし**（active30 / passive4 / evo18）。
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
