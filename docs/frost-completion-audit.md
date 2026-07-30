# 氷術師 完成監査（Milestone 7-E）

M7-D で氷術師のカタログ（active30 / passive4 / 進化18）が完成したため、M7-E では**新規コンテンツを一切追加せず**
カタログ整合性・プール分離・進化到達性・死にコンテンツ・監査・保存/決定論・上限/後始末/テレメトリを一括で検証した。
関連: `./frost-draft-analysis.md`（抽選分析）/ `./frost-balance-report.md`（バランス分析と修正）。

## 1. カタログ整合性（`tests/frost-completion-catalog.mjs`）

| 項目 | 結果 |
|------|------|
| 氷術師 active / passive / 進化 / 合計 | **30 / 4 / 18 / 52** |
| 火の魔女 active / passive / 進化 | **30 / 4 / 18**（非回帰） |
| `SkillCatalog` issues | **0**（両ジョブ） |
| duplicate id / duplicate 表示名 | **0** |
| 未登録クラス / 孤立クラス | **0**（JSON ↔ `SkillManager.REGISTRY` 双方向一致） |
| Lv80「発射数+1」対象 | `frost_shard` `glacial_lance` `icicle_volley` `rime_boomerang` `polar_star` `glacial_spear_rain` の**6種**（進化は全て対象外） |

## 2. プール分離

- 氷 active 30 種はすべて `jobs:["frost_mage"]` / `isCommon:false`。火の魔女へ 1 件も出ない（逆も同じ）。
- 氷 passive 4 種はすべて `frost_mage` の `passiveSkillPool` 所属。`isCommon:true` も `jobs:["*"]` も無い。
- **`jobs` 未指定を暗黙の共通として扱わない**（`poolEligibility.memberAllowedForJob` が単一の正）。
- `SkillCatalog` の一覧＝`poolEligibility` の適格集合＝`SkillDraftManager` の候補母集合（3者一致をテストで固定）。
- 200 seed × 5 戦略 × 3 枠の実抽選で **他ジョブ混入 0 件**。

## 3. 進化到達可能性（`tests/frost-evolution-reachability.mjs` / `frost-evolution-distribution.mjs`）

- 18 進化すべてが「base が氷プールに実在・base maxLevel 8・補助が氷プールに実在・必要Lv が上限内」。
- **自己参照・循環参照・進化の進化・分岐進化はいずれも 0 件**。
- 進化は base を置換し **active 枠を増やさない**。進化後の追加 Lv は無い（単一形態）。
- 進化スキルは `draftCatalog` に含まれず通常抽選へ出ない。条件成立時のドラフトでは進化元 active の通常候補が予約除外される。
- **条件成立後に提示されなかった周回は 0%**（`conditionNotOffered = 0` が全戦略・全枠で成立）。
- **到達不能（全戦略・全枠を通じて取得 0）の進化は無い**。

進化対応表・補助の共有数・進化非対象 12 種は `./skill-catalog.md`（Milestone 7-E 節）を参照。

### 個別進化の到達率（evolution-first・slot6・200 seed）

| 進化 | base rarity | 補助種別 | base取得 | base Lv8 | 補助必要Lv | 条件成立 | 取得 |
|------|-------------|----------|----------|----------|------------|----------|------|
| `heavenfall_glacier_lances` | common | passive | 55% | 54% | 82% | 49% | 49% |
| `crystal_world_tree` | common | passive | 47% | 45% | 77% | 40% | 40% |
| `crystal_tempest` | common | passive | 46% | 44% | 82% | 40% | 40% |
| `rime_execution_wheel` | common | passive | 48% | 46% | 82% | 40% | 39% |
| `absolute_zero_domain` | common | passive | 43% | 41% | 77% | 36% | 36% |
| `diamond_blizzard` | common | passive | 41% | 40% | 69% | 33% | 33% |
| `crystal_sentinel_legion` | uncommon | passive | 36% | 24% | 69% | 19% | 19% |
| `frost_queen_court` | uncommon | passive | 35% | 25% | 77% | 19% | 19% |
| `heaven_piercing_glacier` | uncommon | passive | 30% | 24% | 82% | 19% | 19% |
| `absolute_zero_ray` | uncommon | passive | 31% | 20% | 69% | 18% | 18% |
| `whiteout_cataclysm` | uncommon | passive | 33% | 21% | 46% | 16% | 16% |
| `everlasting_white_mist` | uncommon | passive | 27% | 16% | 46% | 13% | 13% |
| `eternal_frost_chain` | uncommon | passive | 25% | 17% | 69% | 12% | 12% |
| `world_end_avalanche` | uncommon | **active** | 28% | 19% | 9% | 6% | 6% |
| `continental_glacier_rush` | rare | passive | 13% | 2% | 77% | 2% | 2% |
| `eternal_sealed_coffin` | rare | **active** | 12% | 3% | 3% | 1% | 1% |
| `polar_night_aurora` | legendary | passive | 4% | 0% | 46% | 0% | 0% |
| `zero_hour_world` | legendary | **active** | 4% | 0% | 3% | 0% | 0% |

**低率の要因（均一化はしない・理由の記録）**

- **base のレアリティが支配的**: common base の進化は 33〜49%、uncommon は 12〜19%、rare は 1〜2%、legendary は 0〜1%。
  進化条件が「base を **Lv8** まで上げる」であるため、提示率がそのまま Lv8 到達率へ効く。
- **active 補助（`ice_prison` / `ice_wall`）はさらに不利**: passive 補助と違い **active 枠を 1 つ余分に使う**ため、
  同じ uncommon でも `world_end_avalanche`（active 補助）は 6%、`eternal_frost_chain`（passive 補助）は 12%。
- 火の魔女も同じ構造で、`hexagram_inferno_array`（rare base）は evolution-first・slot6 で **取得 0%**。
  氷術師は同条件で **18/18 が取得される**ため、火の魔女より到達性は良い。
- `zero_hour_world` / `polar_night_aurora` は evolution-first・slot6 では 0% だが、**枠や戦略を変えると成立する**
  （全戦略・全枠の合算では取得 > 0）。これは「終盤の legendary 軸を狙って初めて届く」設計として妥当と判断し、
  M7-E では数値を変更しない。

## 4. 死にコンテンツ監査（`tests/frost-dead-content-audit.mjs`）

- **死にパラメータ 0 件**（宣言された Lv 成長値・効果値がすべて実装から参照される）。
  M7-E で 6 件の死にフィールドを修正した（詳細は `./frost-balance-report.md`）。
- `levels[]` は Lv1→Lv8 で必ず 1 つ以上の値が変化する（成長しない成長項目 0 件）。
- `bossGaugeMult` は Lv で単調非減少、かつ `StatusEffectManager` のボス分岐で**ゲージ量のみへ 1 回**適用される。
- `runtimeState` 宣言 ↔ `serializeState`/`restoreState`、`echoPolicy=custom` ↔ `echoCast`、
  `clonePolicy=custom` ↔ `cloneCast`、`lv80ProjectileTarget` ↔ `fireProjectileCount` がすべて一致。
- **未使用 quality cap**: 氷術師側 0 件（火の魔女由来の既存 5 件のみ許容・下記）。
- **ハズレ候補・死に候補**: 提示 0 / 取得 0 の active・passive・進化はいずれも 0 件。

## 5. SkillAudit 完全監査（`tests/frost-complete-skill-audit.mjs`）

active30 + 進化18 = 48 件すべてについて id / class / data / job / rarity / castMode / mainCastEvent /
echoPolicy / clonePolicy / canTriggerEcho / canBeCopiedByClone / lv80ProjectileTarget / element /
procCoefficient / chillAmount / bossGaugeMult / recordCast / 再帰 / quality cap / SpatialGrid / cleanup / telemetry を検証。

**未解決 issue: 0 件。** 残る「意図した仕様」は次の 2 種類のみで、テスト出力に明示される。

1. **クラス内 `recordCast` 0 件**（多数）— 基底 `SkillBase.update` / `EvolvedSkillBase.update` が
   cooldown 発火時に主発動として 1 回だけ記録するパターン。
2. **`mirror_ice` は意図的に `recordCast` 0 回** — 防御スキルは発動数に数えず残響カウンタも進めない（`isDefensive`）。

### recordCast 監査
主発動 1 回あたり `recordCast` は 1 回。projectile / multi-hit / chain hop / DoT tick / pulse / summon shot /
trap / field tick / wave / barrage / mark 起爆 / shatter / frostbreak / status 付与 / 進化内部派生では呼ばない
（派生メソッド本体を波括弧対応で切り出して検証）。`echoCast` / `cloneCast` からも呼ばない。

### echo / clone 監査
- `standard` は基底 `fire()` の再実行で実動作する。
- `custom` は必ず `echoCast` / `cloneCast` を実装している（no-op でない）。M7-E で 3 件を修正（`./frost-balance-report.md`）。
- `forbidden` は `canTriggerEcho:false` / `canBeCopiedByClone:false` と一致し無料生成を防ぐ。
- 防御耐久・召喚無制限増殖・field/mist/aurora の重複常設・barrage 無制限・marker 複製・全画面制圧の複製はいずれも無し。
- echo→echo / clone→clone / 相互再帰なし（`_echoScale` は 1 経路・powerMultiplier は 1 回だけ）。

## 6. Job Lv / Lv80 監査

- 氷術師 Job Lv1〜100 の modifier / milestone は `JobModifierManager` が周回開始時に解決し `resolvedJobModifiers` として固定する。
  reload で値は変わらない。スキルから `profile.jobLevel` を直接参照しない。
- 火 modifier を氷へ・氷 modifier を火へ誤適用しない（`_damageTags` の element 一致時のみ）。
- **Lv80「発射数+1」は明示 flag の 6 種のみ**（`SkillAudit.appliesLv80ProjectileCount` が `lv80ProjectileTarget === true` を返す。
  tag からの自動導出はしない）。進化 18 種は全て対象外。
- Lv50 の氷砕連鎖は `isShatter` で再帰しない。Lv100 の絶対零度でもボスは通常凍結しない（ゲージへ変換）。

## 7. 保存・復元 / 決定論（`frost-complete-runtime-save.mjs` / `frost-complete-determinism.mjs`）

- 48 件すべてで `serializeRuntime` → `restoreRuntime` の往復が例外なく成功。**runtimeState を保存するのは 45 件**。
- runtimeState に Graphics / Text / Tween / Timer / entity 参照は含まれない（JSON 化可能・循環参照なし）。
- CD（`cdLeft` / `*Left`）は必ず保存・復元。設置 / 召喚 / 砲台 / 印 / 波 / 弾幕は復元で二重生成せず、
  `restoreRuntime` を 2 回適用しても増えない（冪等）。
- 氷印 / 氷棺は**ボス印のみ復元**し通常敵の印は破棄する。復元後の命中数は数え直すため無料起爆しない。
- 進化後は元 active のインスタンスも runtime も残らず、再開後も進化済みのまま（元 active が復活しない）。
- 全 48 件が Math.random / Date.now / performance.now / 抽選RNG を使わず、同一入力で呼び出し列が完全一致。
- 状態異常 RNG は保存/復元で cursor・state・以後の乱数列が完全一致（**RNG drift 0**）。
- **save_version は v6 のまま**（M7-E は加算的変更のみ）。

## 8. quality cap / cleanup / telemetry

- skillCaps 157 件すべてが正の有限数かつ `low ≤ medium ≤ high ≤ ultra`。
- **氷術師側の未参照 cap は 0**。火の魔女由来の既存 5 件（`maxBarrierEffects` `maxBurningEnemyIndex`
  `maxChainTargets` `maxCopyGeneration` `maxMainCastEventsPerFrame`）だけは、参照を足すと火の魔女の挙動が変わるため
  **M7-E の対象外として保持**する（テストの許容リストに明記）。
- 実装が参照する cap 名 127 件はすべて `balance.json` に実在（名前違い 0）。
- 表示上限（`StatusVisualManager`）と判定上限（`skillCaps`）は分離しており、表示上限は damage / chill / 防御に影響しない。
- low 品質でも主要スキルの生成数は 1 以上（0 件化しない）。`maxIcePrisons` / `maxWorldEndAvalancheWaves` は
  「品質で主効果（対象数・波数）を削らない」よう値を引き上げた（`./frost-balance-report.md`）。
- 48 件すべての `destroy()` が保持コレクションを空にし、`SkillManager.destroy()` からも例外なく伝播する。
- `Enemy.reset()` が `_chill` / `_chillSlow` / `_frozenUntil` / `_freezeImmuneUntil` / `_igniteUntil` /
  `_iceSeal` / `_iceHitCount` をクリアする（プール再利用で残らない）。
- 状態索引は死亡 / プール返却 / `clearAll` で掃除され、`StatusDebugPanel` / `StatusVisualManager` は
  `destroy()` でイベント購読を解除する（リスナー残留なし）。
- テレメトリは 48 件すべてが自前記録か combat 共通経路へ接続。`recordCast` 回数 = `casts`、残響/分身は casts を増やさない。
  debugRun は `summaryBySkill` / `recentRuns` に入らず `debugRuns` のみ。**外部送信なし**。

## 9. F8 / F9 / F10

- **F8**（Balance Playtest）: 火の魔女 / 氷術師とも同じ画面で検証できる。M7-E で
  「📊 ジョブ分析を表示」を追加し、カタログ / rarity / 取得状況 / 進化到達 / damage share /
  状態異常カウンタ / 周回テレメトリ / ボス氷砕 / bossGaugeMult / 性能・上限到達 / debugRun 状態を表示する（表示のみ・profile 不変・外部送信なし）。
- **F9**（氷術師デバッグ）: active30・進化18 すべてを取得/Lv1〜8/進化条件達成でき、冷気・凍結・耐性・粉砕・
  ボス氷砕ゲージ・Job Lv 切替を検証できる。
- **F10**（状態デバッグ）: chill / slow / frozen / immunity / freezeChance 内訳 / RNG roll / hitGroup /
  skip 理由 / ボスゲージ / frostbreak / vulnerability / 実動作カウンタに加え、M7-E で
  **直近の状態イベント履歴**（上限 `maxStatusDebugHistory`・保存しない）を追加した。

## 10. 火の魔女 非回帰

- カタログ 30/4/18・`SkillCatalog` issues 0。
- 同 seed 候補列（`passive-pool-audit.mjs` の 300 seed 比較）・passive プール分離・保存系はすべて不変。
- 火の魔女の data 値・実装は M7-E で 1 件も変更していない（変更はすべて氷術師側と共通エンジンの既定 0/1 追加）。

---

## 補記: Milestone 9-A（3 ジョブ横断監査）での追加確認

- 本書（M7-E）の監査結果は M9-A の横断監査でも維持されている（カタログ / プール / 抽選 /
  recordCast / cooldown / runtimeState / 決定論を 3 ジョブ同一条件で再確認）。
- **品質分離（M9-A）による変更**: 本ジョブの gameplay / safety に当たる cap は単一値
  （canonical = 旧 high）になった。品質で対象数・実体数・tick 数が変わる挙動は**仕様から削除**された。
- **cdLeft の改ざん耐性**が `SkillManager.restoreRuntime` の共通入口として全 48 スキルへ適用された
  （正当なセーブの復元結果は不変）。
- 詳細は `./cross-job-system-audit.md` / `./quality-cap-classification.md`。
