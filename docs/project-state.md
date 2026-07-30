# Project State

> Reincarnation Flame Survivor の**現在地**を 1 枚にまとめた引き継ぎ用ファイル。
> **各 Milestone 完了時に必ず更新する**（完了報告の要約・コミットID・テスト結果・次 Milestone）。
> compact 後・新セッション開始時は `CLAUDE.md` → `README.md` → `TODO.md` → 本ファイル → `git log -5 --oneline` の順で確認する。
>
> 最終更新: Milestone 9-A.1 完了時点

## Current branch

- ブランチ: **`claude/funny-heisenberg-frhgq9`**（`CLAUDE.md` の継続ブランチ。指定なき限りここへコミット・プッシュ）
- 直近コミット:
  - `0f34e1c` Milestone 9-A.1: 横断 balance ハーネス完成・実ブラウザ検証ゲート（production 全経路駆動 / 絶対比較 / browser gate / dead key 2 件修正）
  - `6c6a2a4` Milestone 9-A ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `01d4e3e` Milestone 9-A: 3 ジョブ横断・共通システム総合監査（品質と gameplay の分離 / cap 分類 / cdLeft 改ざん耐性の全ジョブ化）
  - `8478974` Milestone 8-F ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `dd39087` Milestone 8-F: 戦士 完成監査（cdLeft復元の改ざん耐性 / 進化済み基礎の再提示 / destroy後の残留 / 上限クランプ 3 件）
  - `d8c915b` Milestone 8-E ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `00e886f` Milestone 8-E: 戦士スキル拡張 最終Wave（active30 / 進化18・貫穿突き/一騎討ち/修羅の構え/震天踏破/刃返し）
  - `05587df` Milestone 8-D ドキュメント更新: docs/project-state.md へ commit ID を記載
  - `dec7eaa` Milestone 8-D: 戦士スキル拡張 Wave2（active25 / 進化13・打ち上げ/前面防御/掴み投げ/戦旗/低HP）
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

- **Milestone 9-A.1（横断 balance ハーネス完成・実ブラウザ検証ゲート）完了・停止中。** 次の指示待ち。
- **新コンテンツ 0 件・バランス値 / guidance / しきい値の変更 0 件・save_version v6 維持。**
- **M9-A の測定制約（未解決経路）を解消した:**
  - M9-A まで: fire / frost の弾ダメージ・DoT tick・場 / 遅延・reactive 刺激・死亡イベント / XP が
    横断ハーネスでは解決されず、ジョブ間の絶対比較ができなかった（火:氷 2.72 は見かけ値と記録）。
  - M9-A.1: `tests/phaser-stub.mjs`（Phaser プリミティブのみの最小 stub）＋
    `tests/cross-job-harness.mjs` が **production の `BattleScene.prototype` を直接駆動**
    （SkillManager / 全スキル class / Projectile・Enemy・Boss・Gem / SpawnManager /
    StatusEffectManager / WarriorCombatSystem / CombatTelemetry すべて production 実装のまま。
    置換は表示 / 保存 / シーン遷移だけで、`scene[m] === BattleScene.prototype[m]` を機械検査）。
  - **未解決の damage 経路 0・未解決の弾種別 0・反応しない reactive 0**（144 スキル全件に utility）。
- **共通 battle profile 5 種**（normal / elite / boss / survival / stimulus）で 3 ジョブを同一条件比較:
  - boss kill time 中央値: **火 7,552ms / 戦士 12,512ms / 氷 22,176ms**（3 ジョブとも有限時間で撃破）。
  - survival: 戦士 43.5s ≫ 火 10.5s / 氷 9.4s（軽減 / 不屈 / 回復は戦士のみ＝設計どおり）。
  - warning はすべて **role / profile に分類**（bug / balance 分類 0 件）。`docs/cross-job-final-balance.md`。
- **品質不変性を完全ハーネスで再監査**: 4 品質 × 3 ジョブ × 全 profile ＋ 周回途中切替
  （low→ultra→medium）で gameplay trace byte-identical（254 + 78 assertions）。
- **実ブラウザ検証を自動化で実施**（環境既存ツールのみ・**必須依存の追加 0**）: Phaser 3.90.0 起動 /
  3 ジョブ実プレイ / 4 品質で gameplay 上限同値 / 品質途中切替 / F8 / セーブ往復 v6 / 相対パスを
  **console エラー合計 0** で確認。**手入力の体感・長時間・高負荷ピークは未確認**として
  `docs/browser-validation-gate.md` の external gate へ記録（再現手順 + テンプレートつき）。
- **観測の dead key 2 件を最小修正**（`burningDamage` 発行元なし / `_damageTakenTotal` 加算なし。
  damage / 状態 / RNG へ影響なし＝品質不変ハッシュ不変）。
- **テスト 15 スイート追加で全 225 通過**・validate-data M9-A.1 ブロック（0 エラー 0 警告）・
  validate.yml 226 ステップ。trace / 経路集合 / 測定条件を SHA-256 固定
  （`tests/three-job-balance-harness-nonregression.mjs`）。

### 旧 Current milestone（M9-A）

- **Milestone 9-A（3 ジョブ横断・共通システム総合監査）完了。**
- **新しい active / passive / 進化 / ジョブは 1 件も追加していない。**
- **最優先課題（M8-F 記録の「品質が戦闘結果へ影響する」）を解消した:**
  - 再現: 修正前 tree の production 経路で `great_cleave` 分岐（low 58 / high 59）を確認。
  - 根本原因: 品質別 cap の誤分類。**敵プール上限（60〜320 体）・弾プール上限（120〜700）・
    skillCaps 161 件・hitStop・魂炎ノード 2 種**が品質依存だった。
  - 修正: 全 217 cap を **visual 47 / gameplay 150 / safety 20** へ分類（正は `balance.json` の
    `skillCapClasses`）。gameplay / safety は**単一値 `{ value }`**（canonical = 旧 high ＝出荷既定品質）、
    敵 / 弾上限は新設 `gameplayLimits`（200 / 400）へ。hitStop を全品質有効化・魂炎ノードの品質ゲート削除。
  - 結果: **gameplay trace（cast / hit / damage / kill / 対象列 / cooldown / runtimeState /
    status RNG cursor / 闘気・コンボ・体勢）が 3 ジョブ × active30 / evolution18 × 4 品質で
    byte-identical**。品質が変えるのは演出だけ（visual 47 件中 45 件が low < ultra）。
- **cdLeft 改ざん耐性を全 144 スキルへ拡張:** 火 / 氷 96 スキルに M8-F と同種の脆弱性が残っていた。
  `SkillManager.restoreRuntime` の共通入口 `_sanitizeRuntimeState` で一律無害化
  （非有限値は不採用・±120s クランプ・**正当なセーブと候補列 / runtime trace は不変**）。
- **バランス値・guidance・抽選しきい値の変更 0 件**（ジョブの個性は数値上均一化していない）。
- 横断監査の全項目と結果は `docs/cross-job-system-audit.md`。品質分離の詳細は
  `docs/quality-cap-classification.md` / `docs/quality-gameplay-invariance.md`。
- **全 210 スイート通過**・`validate-data` 0 エラー 0 警告・**save_version v6 維持**・実ブラウザ未確認。

### M9-A の抽選横断実測（200 seed × evolution-first × level-up 60・しきい値変更なし）

| ジョブ | 枠4 ≥1 / 平均 | 枠6 ≥1 / 平均 | 枠8 ≥1 / 平均 | 最頻進化シェア |
|--------|---------------|---------------|---------------|----------------|
| 火の魔女 | 88.0% / 1.30 | 97.5% / 2.08 | 99.5% / 2.30 | 19.8〜23.0% |
| 氷術師 | 100% / 3.50 | 100% / 3.87 | 100% / 2.69 | 9.9〜14.2% |
| 戦士 | 100% / 3.35 | 100% / 4.38 | 100% / 3.75 | 11.8〜13.9% |

leakage / duplicate / slot 違反 / 非飽和候補ゼロ = **9 構成 × 200 seed で 0 件**。
（この表は単一戦略の横断回帰フロア。5 戦略合算の completion しきい値は per-job スイートが維持。）

### 旧 Current milestone（M8-F）

- Milestone 8-F（戦士 完成監査）完了。
- **新しい active / passive / 進化 / ジョブは 1 件も追加していない。** M8-E で確定した
  **active30 / passive4 / evolution18 = 52** のカタログを 12 観点で総点検した回。
- **不備 8 件 + data の死にフィールド 1 件**を修正した（内容は下の「M8-F で見つけて直した不備」）。
- **敵 HP / 攻撃力 / 経験値 / スキルの damage・cooldown / 難易度倍率 / 報酬は 1 件も変えていない。**
  変えた data は `crimson_execution.safetyCaps.maxTargetsPerStrike`（10 → 20）と、
  上限クランプ用のキー 3 件（`rally.maxRadius` / `counter.maxCountersPerWindow` / `counter.maxWindowMs`）だけ。
- **抽選しきい値は 1 つも下げていない**（M8-C.1 の目標をそのまま満たす）。
- 火の魔女・氷術師は**候補列 / ランタイム / セーブ / 状態異常 RNG とも完全に不変**（SHA-256 一致）。
  `save_version` は **v6 のまま**（保存キーを 1 つも増やしていない）。
- **全 185 スイート通過**・`validate-data` 0 エラー 0 警告。**実ブラウザ確認は未実施。**

### M8-F の 12 観点と結果

| 観点 | 結果 |
|------|------|
| 完成カタログ（30 / 4 / 18 / 52） | 重複 0・未知クラス 0・「JSON だけ / class だけ / docs だけ」0・orphan 0・`displayName` 重複 0 |
| プール分離 | 3 ジョブのプールが互いに素・他ジョブ混入 0（判定は `poolEligibility.memberAllowedForJob` 1 か所） |
| rarity / role / support | common7 / uncommon13 / rare10 / **legendary 0**（legendary 段は進化 18 件が担う）・castMode は 30 件すべて `cooldown` |
| 進化 18 件の到達性 | 全件が条件形成 > 0・提示 > 0・取得 > 0。提示 / 形成 ≈ 100% |
| production 抽選 simulation | 200 seed × 5 戦略 ＋ 素朴 × 枠 4/6/8 でしきい値をすべて満たす（下表） |
| `SkillAudit` 48 件 | 未解決 issue 0 |
| `recordCast` 48 件 | 全件 cast > 0・**スキル側は 1 度も `recordCast` を呼ばない**・多段で増えない |
| cooldown 保存 48 件 | 全件往復・復元直後に無料 cast なし・**改ざん耐性を追加**（不備 1 件を修正） |
| `runtimeState` 48 件 | 宣言と実使用が一致・no-op serialize 0・**オブジェクト参照 0 件**（敵は `_seq`） |
| 固有機構 | 闘気 / コンボ / 撃破回復 / 不屈 / 軽減 / 反撃と弾き返しの調停 / 処刑 / 打ち上げ・掴み・投げ / エリート体勢 / ボス崩し / 移動 の上限と解除条件がすべて効く（不備 4 件を修正） |
| cap / 死にフィールド | `skillCaps` 217 件すべて参照・`safetyCaps` 全件有効・**死にフィールド 0**（不備 1 件を修正） |
| telemetry / F8 / F9 | キーと実装が 1:1・dead key 0・外部送信 0・**F10 は不変** |

### M8-F の抽選 simulation（200 seed・しきい値は M8-C.1 から据え置き）

| 枠 | 戦略 | 平均 | 0 個 | ≥1 | ≥2 | 目標 |
|----|------|------|------|-----|-----|------|
| 4 | 5 戦略 ＋ 素朴 | 2.19〜3.55 | 0.0〜2.0% | 98.0〜100% | 75.5〜100% | ≥1 80% / 平均 1.0 / 0 個 ≤20% |
| 6 | 5 戦略 | 3.37〜5.33 | 0.0% | 100% | 96.5〜100% | ≥1 95% / ≥2 60% / 平均 1.7 |
| 8 | 5 戦略 | 4.51〜7.05 | 0.0% | 100% | 99.5〜100% | ≥1 95% / ≥2 65% / 平均 1.8 |

最頻進化シェア **10.7%**（目標 35% 以下）/ build の種類 枠4 185〜199 / 200・枠6 198〜200・枠8 199〜200 /
提示 0・取得 0 の active・passive・進化 **0 件** / 他ジョブ混入・重複・枠違反 **0 件** /
**候補ゼロはすべて飽和由来**（所持がすべて上限＋残り進化なし。飽和以外 0 件）。
低率 3 件（`mountain_hurl` / `heaven_crushing_descent` / `heaven_mirror_reversal`）はいずれも
**active 補助で枠を 2 つ使う**構造由来で、到達不能ではない（HEAVY 500 seed でも取得 > 0）。

### M8-F のバランス分布 / 性能

| 指標 | 実測 |
|------|------|
| 最大ダメージシェア（30 active 同時所持・4.8 分相当） | `great_cleave` **13.6%**（しきい値 35% 以下） |
| 死にスキル | **0 件**（ダメージ 0 の `weapon_deflection` は弾き 390 発・反射 6 発の防御スキル） |
| evo/base < 1.0 の逆転 | **0 件**（修正後。`crimson_execution` は 0.69 → **1.37**） |
| 全部盛りでの進化シェア最大 | `thousand_blade_dance` 20.6%（他を全部食う進化 0 件） |
| 永久状態 | 0（構え / 決闘 / 弾き窓 / 陣 / 闘気解放 / 露出 / 掴み / 反撃窓すべて 0 に戻る） |
| ボス崩し | 39 回 / 露出合計 118.9s / しきい値 ×3.00（永久拘束にならない） |
| 弾き返し | 検知 202,414 / 弾き 390（**0.2%**）/ 反射 6（完全無効化にならない） |
| 性能（10 分相当の Node 実測） | low 2.5s / medium 2.5s / high 2.7s / ultra 3.1s |
| 1 フレーム最大処理 | 238 / 335 / 424 / 534（上限 360 / 540 / 720 / 960 以内） |

### M8-F の重要な設計判断

1. **cooldown 復元を 1 か所へ集約した。** `WarriorSkillBase` / `WarriorEvolvedBase` の
   共通 `restoreCd(value)` が「`typeof value === 'number'` でなければ採用しない・非有限値は採用しない・
   有限値は ±`MAX_RESTORED_CD_MS`(120s) へクランプ」を担う。35 ファイルの生の代入を寄せた。
   **クランプは `[-MAX, +MAX]`**（`[0, MAX]` ではない）。正当なセーブに小さな負の `cdLeft` が入るため
   （0 へ丸めると `warrior-chain-hook` / `warrior-relentless-combo` の往復一致が壊れる）。
   **火 / 氷の 27 ファイルは従来の生の代入のまま**＝ restore の挙動は 1 バイトも変わっていない。
2. **破棄ガードは 2 つの戦士基底にだけ置いた。** `update()` の先頭で `if (this._dead) return;`、
   `destroy()` で `_dead = true`。派生の `destroy()` は `super.destroy()` を呼ぶか自分で `_dead` を立てる。
   火 / 氷の基底には入れていない（共通 `SkillBase` を触っていない）。
3. **進化済み基礎の除外は「加算的」にした。** 抽選コンテキストの `evolvedBaseIds` は
   **未指定なら空集合**として扱われ、渡さなければ従来と完全に同一の候補列になる。
   これを明示的にテストしている（`[]` と省略が同じ結果になること）ので、
   火 / 氷の候補列ハッシュは変わらない。
4. **決闘マーカーの寿命を BattleScene の 2 メソッドへ集約した。**
   `_setDuelMark(target)` / `_clearDuelMark()` が `_duelMarkSeq` を単一の正として持ち、
   再指定・時間切れ・解除・Scene 終了のすべてで古いマーカーを外す。
   スキル側・`WarriorCombatSystem` 側にマーカーの知識を持たせない。
5. **改ざん耐性はすべて data の上限で表現した。** 追加した 3 キーは
   `rally.maxRadius`(280) / `counter.maxCountersPerWindow`(6) / `counter.maxWindowMs`(6000)。
   同じ値を `WARRIOR_DEFAULTS` にも置いたので data 欠落時も同じ上限になる。
   **コードにハードコードした数値は増やしていない。**
6. **balance の修正は 1 値だけに絞った。** 18 進化すべての evo/base を測り、逆転は
   `crimson_execution` の 1 件（0.69）だけだと確認してから `safetyCaps` を 1 つ動かした。
   **バランス改修（全体の数値見直し）はしていない。**
7. **`candidateNone` は欠陥ではないと証明してから記録した。** 候補ゼロを
   `saturatedNone` / `unsaturatedNone` に分解し、飽和判定は進化を含めた実際の上限
   （進化は 1・active は `maxLevel`）で行う。実測は飽和 60 / 非飽和 **0**。

### M8-E で足したもの

| 分類 | 内容 |
|------|------|
| active 5 | 貫穿突き `piercing_lunge`(common) / 一騎討ち `duel_challenge`(rare) / 修羅の構え `battle_trance`(uncommon) / 震天踏破 `earthshaker_march`(uncommon) / 刃返し `weapon_deflection`(uncommon) |
| evolution 5 | 神速貫陣 `godspeed_impaler`(+戦闘本能 Lv4) / 覇王討ち `king_slayer_duel`(+剛力 Lv4) / 血染修羅 `blood_asura_trance`(+血気 Lv4) / 大陸震砕踏破 `continental_quake_march`(+重装 Lv4) / 天鏡返し `heaven_mirror_reversal`(+**active** 反撃の構え Lv4) |
| 共通機構 5 | 直線の対象選択 `line` / 決闘 `duel` / 構え `trance` / 進軍 `march` / 弾き返し `deflection` |
| skillCaps | 12 件追加（event 7・visual 5・計 217 件・**未参照 0**） |
| guidance | `highRequirementSupportLevel`(6) / `highRequirementSupportMultiplier`(1.5) を 2 キー追加 |

### M8-E の重要な設計判断

1. **共通機構はすべて `WarriorCombatSystem` へ集約した。** BattleScene へスキルごとの状態を散らさない。
   スキルクラスは判断をせず、`resolveLineMeleeTargets()` / `duelPriority()` / `canDeflectProjectile()` の
   結果に従うだけ（**スキル側で `isBoss` / `projectileKind` を見ない**）。
   上限はすべて `balance.json` の `warrior` ブロック。
2. **貫穿突きは弾ではない。** 踏み込み＋近接の直線判定（`meleeStrike` の opt-in な `line`）で表現し、
   射程は `line.maxLineLength`（300px）で頭打ち＝**画面端まで届く斬撃波を作らない**。
   射線上にエリート / ボスがいると通常敵の枠が `toughSingleTargetRatio`（0.35）由来の少数に絞られ、
   **硬い相手ほど威力が 1 点へ集まる**。ボス予兆中は踏み込まない。
3. **決闘も構えも formal status ではない。** 相手には何も貼らず、`WarriorCombatSystem` 上の状態として持つ。
   決闘は同時 1 体・再発動は置換・優先度は data 由来（ボス 3 > エリート 2 > 通常 1）・
   **敵オブジェクトを保持せず安定 runtime id（`_seq`）だけ**・死亡 / プール返却 / Scene 終了で必ず解除。
   覇王討ちの延長は合計 `maxExtensionMs` を超えないので**ボスを永久ロックできない**。
4. **構えのリスクは軽減の実効値の小幅低下だけ。** 低下は合計軽減から**引く**だけで、
   重装 / 闘気解放 / 不屈のいずれも**無効化しない**。合計は `minMitigationAfterPenalty`（0）を下回らない
   ＝**負にならない**。攻撃補正は闘気解放との合成上限 `combinedOffenseCap`（0.85）で必ず頭打ち。
   **自傷もライフスティールもしない**（低 HP を維持する最適解を作らない）。
5. **刃返しは完全無効化ではない。** 弾ける種別は allowlist（`bossBullet` / `bullet`）+ denylist
   （`beam` / `telegraph` / `hazard` / `dot` / `ground`）を `canDeflectProjectile()` に一元化。
   窓ごとの上限を超えた弾は**そのまま通る**。反射弾は**世代 1 で止まり再反射しない**・
   元弾の特殊効果を引き継がない（`suppressSpecialEffects`）・短命（`maxReflectLifeMs`）。
   同じ弾を 2 度弾かない（`_deflectId` の Set・**保存しない**）。
6. **1 イベント = 最大 1 系統。** `arbitrateDeflectionAndCounter(kind)` に調停を集約し、
   弾イベントは弾き返しの枠だけ・近接イベントは反撃の回数だけを消費する。
   枠を使い切っていても**窓が開いている間は調停まで通す**（`deflectionWindowOpen`）ので、
   「上限に達した窓へ弾が来た」を正しく計測でき、その弾は素通りする。
7. **`Projectile` へ初めて手を入れた（M8-D の方針からの変更）。** 弾き返しは弾そのものに印を付けないと
   同じ弾を 2 度弾いてしまうため、`_deflectId` / `alreadyDeflected` / `deflectGeneration` /
   `suppressSpecialEffects` の 4 フィールドを足した。**いずれも既定値が完全に無害**で
   `_clearState()` が戻すため、火 / 氷の弾のランタイムハッシュは 1 バイトも変わっていない
   （`tests/three-job-final-catalog-nonregression.mjs` が保証）。
8. **共通経路への追加は「明示したときだけ効く」形にした。**
   `meleeStrike` の `line` は未指定なら従来の扇形判定を通り、敵弾の弾き返しフックも
   `warrior.deflectionWindowOpen && this._deflectOpts` のときにしか動かない。
   `Enemy._duelMark` / `_lineAlong` も既定値では移動にも AI にも影響しない。
9. **guidance の追調整はしきい値を 1 つも下げずに行った。**
   `highRequirementSupportLevel`(6) 以上を要求する補助にだけ `highRequirementSupportMultiplier`(1.5) を乗せる。
   **役割ごとの max であって積み上がらない**・**skill ID のハードコードなし**。
   それでも `heaven_mirror_reversal` が 1000 run で 0〜3 件しか成立しなかったため、
   **data 側で** 補助要求を `counter_stance` Lv6 → **Lv4** に、
   `weapon_deflection` の rarity を rare → **uncommon** に変えた（36 / 68 / 100 件へ改善）。
10. **M8-C.1 の不変条件「補助 active は自身の進化を持たない」を意図的に崩した。**
    天鏡返しの補助 `counter_stance` は自身の進化 `adamant_counter` を持つ。
    天鏡返しは構えを**置換せず CD にも触らない**ので `adamant_counter` への道は塞がれず（両方目指せる）、
    `tests/warrior-active-support-evolution.mjs` がこの点を明示的に検査している。

### M8-E の到達率（200 seed・素朴戦略・しきい値は M8-C.1 から据え置き）

| 構成 | 実測 | 目標 |
|------|------|------|
| 枠4 / 40lv・進化 1 個以上 / 平均 / 0 個 | **89.5% / 1.28 / 10.5%** | 80% 以上 / 1.0 以上 / 20% 以下 |
| 枠6 / 60lv・1 個以上 / 2 個以上 / 平均 | **99.0% / 94.5% / 2.65** | 95% / 60% / 1.7 |
| 枠8 / 80lv・1 個以上 / 2 個以上 / 平均 | **100.0% / 99.5% / 3.92** | 95% / 65% / 1.8 |
| 最頻進化のシェア（枠4 / 6 / 8） | **16.2% / 13.8% / 11.7%** | 35% 以下 |
| build の種類（枠4 / 6 / 8・1000 run） | **89.8% / 97.2% / 99.3%** | M8-D から悪化しない |
| 取得 0 の active / evolution / passive | **0 件 / 0 件 / 0 件** | 0 件 |
| 候補ゼロ / 混入 / 重複 / 枠違反 | **0 件** | 0 件 |

active 補助の進化（1000 run・個別集計）: `heaven_crushing_descent` 6 / 47 / 90（枠4 / 6 / 8）、
`mountain_hurl` 2 / 11 / 40、`heaven_mirror_reversal` 36 / 68 / 100。
M8-D では `heaven_crushing_descent` が枠6 で 7 件だったので**大きく改善**している。

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
| M8-D | 戦士スキル拡張 Wave2（active25 / 進化13・打ち上げ / 前面防御 / 掴み投げ / 戦旗の陣 / 低 HP スケーリング・guidance へ active 補助補正を 1 キー追加）（`dec7eaa` `05587df`） |
| M8-E | 戦士スキル拡張 最終Wave（active30 / 進化18 で**3 ジョブが同規模へ到達**・直線の対象選択 / 決闘 / 構え / 進軍 / 弾き返し・guidance へ高要求補助の補正を 2 キー追加）（`00e886f` `d8c915b`） |
| M8-F | 戦士 完成監査（**新スキル追加なし**・12 観点で 48 スキルを全数監査・不備 8 件 + 死にフィールド 1 件を修正・23 スイート追加で全 185 通過・火 / 氷は SHA-256 一致）（`dd39087` `8478974`） |
| **M9-A** | **3 ジョブ横断・共通システム総合監査**（**品質と gameplay の分離**＝cap 217 件を visual47 / gameplay150 / safety20 へ分類し gameplay trace を 4 品質で byte-identical に・cdLeft 改ざん耐性を全 144 スキルへ・F8 に 3 ジョブ比較・25 スイート追加で全 210 通過・バランス / guidance / しきい値変更 0）（`01d4e3e`） |
| **M9-A.1** | **横断 balance ハーネス完成・実ブラウザ検証ゲート**（production 全経路駆動で未解決 damage 経路 0・共通 profile 5 種で 3 ジョブ絶対比較・warning は role / profile 分類のみ・品質不変を完全ハーネスで再確認・実ブラウザ自動検証 console エラー 0 / 未確認は external gate へ・dead key 2 件最小修正・15 スイート追加で全 225 通過・バランス変更 0）（`0f34e1c`） |

## Job catalog counts

| ジョブ | id | 属性 | active | passive | evolution | Job Lv |
|--------|----|------|--------|---------|-----------|--------|
| 火の魔女 | `flame_witch` | fire | **30** | **4** | **18** | 1〜100 |
| 氷術師 | `frost_mage` | ice | **30** | **4** | **18** | 1〜100 |
| **戦士** | **`warrior`** | **physical** | **30** | **4** | **18** | **1〜100** |

- 合計: 火 52 / 氷 52 / **戦士 52**（M8-E 最終Wave で 3 ジョブが同規模へ到達。**M8-F で戦士 52 件を全数監査済み**）。
  `SkillCatalog.buildCatalog()` の issues は **3 ジョブとも 0**。3 ジョブの active / 進化プールは**互いに素**。
- active slot 4 → 6 → 8（転生で拡張）、passive slot 4。全 active は maxLevel 8、進化は単一形態（Lv 固定）。
- Job Lv80「発射数+1」対象は**明示 flag（`lv80ProjectileTarget:true`）のみ**。
  火 6 種（`fireball` `flame_lance` `scatter_flame` `homing_wisp` `ricochet_ember` `core_overdrive`）/
  氷 6 種（`frost_shard` `glacial_lance` `icicle_volley` `rime_boomerang` `polar_star` `glacial_spear_rain`）。
  **進化 18 種は両ジョブとも全て対象外。**
- 火 passive 4 種: `power_amp` / `swift_cast` / `scorch_expand` / `ember_persist`。
- 氷 passive 4 種: `frost_amplification` / `rapid_freezing` / `frozen_expansion` / `lingering_cold`。
- **戦士 passive 4 種**: `brute_force`（剛力）/ `heavy_armor`（重装）/ `combat_instinct`（戦闘本能）/ `bloodlust`（血気）。
- **戦士 active 30 種**（M8-B の 5 ＋ M8-C の 10 ＋ M8-D の 10 ＋ M8-E の 5）:
  `great_cleave`（初期）/ `shield_bash` / `whirlwind_slash` / `charge_slash` / `ground_slam` ＋
  `armor_breaker` / `twin_fang_slash` / `execution_strike` / `leap_smash` / `sweeping_advance` /
  `counter_stance` / `war_cry` / `chain_hook` / `shockwave_stomp` / `relentless_combo` ＋
  `rising_slash` / `shield_charge` / `backstep_riposte` / `battlefield_throw` / `triple_crush` /
  `blade_guard` / `berserker_rush` / `war_axe_throw` / `breaker_knee` / `rallying_banner` ＋
  `piercing_lunge` / `duel_challenge` / `battle_trance` / `earthshaker_march` / `weapon_deflection`。
  **全て物理**で、画面を横断する斬撃波・弾は 1 つも生成しない。
  唯一の例外は `war_axe_throw`（往復する短距離投擲）だが、これも `Projectile` を使わず
  スキルが動かす判定ボリュームで、**近接ダメージ倍率が乗らない**（`isThrown`）。
  `piercing_lunge` も弾ではなく踏み込み＋近接の直線判定で、射程は 300px で頭打ち。
  唯一「弾」を生むのは `weapon_deflection` / `heaven_mirror_reversal` の**反射弾**だが、
  これは敵弾を弾き返した結果の短命な物理弾で、世代 1 で止まり再反射しない。
- **戦士 evolution 18 種**（M8-B の 3 ＋ M8-C の 5 ＋ M8-D の 5 ＋ M8-E の 5）:
  `thousand_blade_dance`（大薙ぎ+戦闘本能）/ `bloodstorm_whirlwind`（旋風斬り+血気）/
  `unyielding_fortress`（盾撃+重装）＋ `skull_splitter`（兜割り+剛力）/
  `crimson_execution`（処刑斬+血気）/ `war_god_roar`（戦吼+戦闘本能）/
  `adamant_counter`（迎撃の構え+重装）/ `heaven_crushing_descent`（跳躍強襲+**active 地砕き Lv6**）＋
  `heaven_rending_ascent`（昇竜斬+剛力）/ `fortress_rampage`（鉄壁突進+重装）/
  `shadow_swallow_riposte`（燕返し+戦闘本能）/ `mountain_hurl`（豪腕投げ+**active 地砕き Lv6**）/
  `blood_oath_standard`（戦旗招集+血気）＋ `godspeed_impaler`（貫穿突き+戦闘本能）/
  `king_slayer_duel`（一騎討ち+剛力）/ `blood_asura_trance`（修羅の構え+血気）/
  `continental_quake_march`（震天踏破+重装）/ `heaven_mirror_reversal`（刃返し+**active 反撃の構え Lv4**）。
  **進化を持たない active は 12 種**: `charge_slash` `ground_slam` `twin_fang_slash` `sweeping_advance`
  `chain_hook` `shockwave_stomp` `relentless_combo` `triple_crush` `blade_guard` `berserker_rush`
  `war_axe_throw` `breaker_knee`（M8-F の監査で全数確認。`counter_stance` は自身の進化を持つので含まない）。
  `ground_slam` は**天墜崩撃と山岳投擲の 2 つ**の active 補助を兼ねる（置換されず CD にも触らない）。
  `counter_stance` は**自身の進化 `adamant_counter` を持ちつつ天鏡返しの補助も兼ねる**
  （天鏡返しは置換せず CD にも触らないので両方目指せる。M8-C.1 の不変条件を意図的に緩めた箇所）。
- **戦士の Lv80「打撃数+1」対象は 6 種のまま**（`great_cleave` `shield_bash` `ground_slam`
  `armor_breaker` `twin_fang_slash` `relentless_combo`）。
  **進化 18 種と Wave2 / 最終Wave の active 15 種は全て対象外。**
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
- **M8-E で `warriorState.timedBuffs` へ 3 キー追加**（`duel` / `trance` / `deflection`）。
  いずれも復元時に `balance.warrior` の上限でクランプされるので、保存ファイルを書き換えても上限を超えられない
  （構えの軽減低下を巨大にしても合計軽減は `minMitigationAfterPenalty` を下回らない＝負にならない）。
  決闘が保存するのは**安定 runtime id（`seq`）だけ**で敵オブジェクトは入らず、
  対象が見つからなければ復元後に安全に解除される（幽霊対象を残さない）。
  弾き返しは**使用済み回数を引き継ぐ**ので reload で上限をリセットして稼げない。
  **弾いた弾の id 集合（`_deflectedIds`）・反射弾そのもの・進行中の突き / 進軍は保存しない。**
  復元は新規発動として数えないので `duelStarts` / `tranceStarts` / `deflectWindows` が水増しされない。
- 戦士 48 スキル（active30 + 進化18）すべてが `skillRuntime` に載る（最低でも `cdLeft`）。
- **M8-F では保存キーを 1 つも増やしていない**（`save_version` は v6 のまま・移行処理なし）。
  代わりに**復元の入口を固くした**: 戦士 48 スキルの `cdLeft` は共通 `restoreCd()` を通り、
  数値以外（文字列 / null / object）は採用せず、非有限値も採用せず、有限値は ±120s へクランプされる。
  旋風の回転残り時間は data の `duration` で、陣の半径は `rally.maxRadius` で、
  反撃窓の回数と持続は `counter.maxCountersPerWindow` / `counter.maxWindowMs` でクランプされる。
  **保存ファイルを書き換えても上限を超えられない。**
- **M9-A でも保存キーを増やしていない**（v6 のまま）。復元の入口がさらに固くなった:
  **全 144 スキルの `cdLeft` は `SkillManager.restoreRuntime` の共通入口 `_sanitizeRuntimeState` を通り、
  数値以外 / 非有限値は採用されず、±120s へクランプされる**（火 / 氷の 27 ファイルの restore 実装は
  1 行も変えず、正当なセーブの復元結果も不変）。品質設定は settings 側のままで save へ追加していない。
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
| 16 | **M8-E** | `restoreTimedBuffs()` が決闘の復元で `duelStarts` を**二重に**戻し、復元後のテレメトリが **-1** になっていた（`restoreDuelState()` はもともと数えていない）。減算を削除し、弾き返しの窓カウンタも 0 未満へ下がらないようクランプ | `00e886f` |
| 17 | **M8-E** | `canDeflectProjectile()` が `deflectGeneration` を見ておらず、印（`alreadyDeflected`）が落ちた反射弾を**再び弾けてしまう**経路が残っていた。世代だけで止まるガードを追加 | `00e886f` |
| 18 | **M8-E** | 弾き返しの枠を使い切ると `deflectionActive` が false になって調停へ入らず、**「上限に達した窓へ弾が来た」を 1 度も計測できなかった**（`deflectCapReached` が死んだカウンタになっていた）。窓の開閉だけを見る `deflectionWindowOpen` を追加し、調停までは通して正しく数えるようにした（弾は素通りするので挙動は不変） | `00e886f` |
| 19 | **M8-E** | テスト側の `formedButNotOffered`（進化が成立したのに候補へ出なかった数）が、進化 18 種では「同時に成立した 4 件以上が 3 枠に収まらない」だけで誤検知していた。**進化候補が 1 つも出なかった draft** だけを数える形へ修正し、良性ケースを `formedPartiallyOffered` として分離 | `00e886f` |
| 20 | **M8-E** | **`WARRIOR_DEFAULTS` に最終Wave のブロック（line / duel / trance / deflection / march）が無く、`balance` を渡さないと `beginPiercingLunge` が例外を投げた**（data 欠落時にフォールバックが機能しない）。既定値を追加 | `00e886f` |
| 21 | **M8-F** | **戦士 48 スキルの `restoreState({cdLeft})` が負数 / NaN / ±Infinity / 桁外れをそのまま採用**していた。改ざんされた保存で `_cd = NaN` にすると、以後そのスキルが二度と撃てない（または常に撃てる）状態を作れた。`WarriorSkillBase` / `WarriorEvolvedBase` へ共通 `restoreCd()` を追加し、非有限値は採用せず有限値を ±`MAX_RESTORED_CD_MS`(120s) へクランプ。35 ファイルの生の代入をこの 1 か所へ寄せた（**火 / 氷の 27 ファイルは 1 行も変えていない**） | `dd39087` |
| 22 | **M8-F** | **陣（`placeRallyField`）の半径が上限クランプされていなかった**。改ざんで半径 1e9 の陣を作れば「常に内側」＝永久バフになった。`balance.warrior.rally.maxRadius`(280) を追加してクランプ | `dd39087` |
| 23 | **M8-F** | **反撃窓（`beginCounterWindow` と復元）の回数と持続が上限クランプされていなかった**。改ざんで「999 回・1e9ms」の窓＝実質無限反撃を作れた。`counter.maxCountersPerWindow`(6) / `counter.maxWindowMs`(6000) を追加し、開始時と復元時の両方でクランプ | `dd39087` |
| 24 | **M8-F** | **旋風斬（`WhirlwindSlashSkill.restoreState`）が回転の残り時間をクランプしていなかった**。改ざんで永久に回り続ける（継続ダメージが止まらない）状態を作れた。血戦旋風も同じ経路。data の `duration` で頭打ちにした（他の再開型 — 薙ぎ進軍 / 刃防陣 — は既にクランプ済みだった） | `dd39087` |
| 25 | **M8-F** | **進化済みの基礎 active が空き枠へ「新規」候補として戻っていた**（200 seed 中 38 回）。取得すると進化と基礎を**同時所持**でき「元 active と同時稼働しない」に違反した。抽選コンテキストへ `evolvedBaseIds` を**加算的に**追加し、`SkillDraftManager._eligible` が除外する（未指定なら従来と完全に同一挙動なので**火 / 氷の候補列ハッシュは不変**） | `dd39087` |
| 26 | **M8-F** | **M8-B / M8-C の 21 スキルが `destroy()` 後も発動し続けた**（`_dead` ガードが無く、進化置換・Scene 終了のあとに「墓場から」攻撃が飛ぶ余地があった）。2 つの戦士基底の `update()` に破棄ガードを、`destroy()` に `_dead = true` を置いた（1 か所） | `dd39087` |
| 27 | **M8-F** | **決闘マーカー（`Enemy._duelMark`）が時間切れ / 再指定 / 解除で外れなかった**（生きている敵に古いマーカーが `Enemy.reset()` まで残った）。`BattleScene._setDuelMark` / `_clearDuelMark` でマーカーの寿命を 1 か所へ集約し、決闘が終わったフレームと Scene 終了で必ず外す | `dd39087` |
| 28 | **M8-F** | **`crimson_execution`（血断処刑）が base より弱かった**（群れの中で総ダメージ 69% の逆転）。`safetyCaps.maxTargetsPerStrike: 10` が base `execution_strike` の実効 breadth（品質上限 24 のもとで実測 20）より狭かった。**10 → 20** にした（修正後 evo/base = 1.37・依然として有界で品質上限以下）。18 進化のうち逆転はこの 1 件だけ | `dd39087` |
| 29 | **M8-F** | **data の死にフィールド `charge_slash.config.hitOncePerTarget`**（コメントでしか触れられておらず、挙動はハードコードだった）。実装から読むようにした（`false` を宣言すれば毎フレーム判定に切り替わる。現在の data は `true` なので挙動は不変） | `dd39087` |
| 30 | **M9-A** | **skillCaps のうち gameplay / safety に当たる 161 件が品質別の値を持ち、対象数・弾実体数・tick 数・状態付与数が演出品質で変化した**（great_cleave の主発動分岐 low58/high59 の根本原因。Combo 進行・攻撃速度しきい値到達・XP / kill にまで波及し、3 ジョブ全 144 スキルが対象）。217 件を分類し gameplay / safety を単一値 `{ value }`（canonical = 旧 high）へ | `01d4e3e` |
| 31 | **M9-A** | **敵プール上限（品質別 60〜320 体）と弾プール上限（120〜700）が品質依存** —— 敵の同時数＝XP / kill / 密度そのものが品質で変わった。新設 `gameplayLimits`（200 / 400）へ移し、`effectQuality` からキーを削除（残留は validate-data がエラー化） | `01d4e3e` |
| 32 | **M9-A** | **hitStop が high / ultra のみ有効**で、ロジックの経過時間が品質依存だった。全品質で有効化 | `01d4e3e` |
| 33 | **M9-A** | **魂炎の恒久強化ノードが品質で無効化されていた**（敵密度は low で、弾上限は low / medium で効かない＝品質を下げると恒久強化が消えた）。品質ゲートを削除 | `01d4e3e` |
| 34 | **M9-A** | **火 / 氷 96 スキルの `restoreState({cdLeft})` に M8-F と同種の改ざん脆弱性**（NaN / ±Infinity / 桁外れを採用できた）。各ファイルを触らず `SkillManager.restoreRuntime` の共通入口 `_sanitizeRuntimeState` で全 144 スキル一律に無害化（非有限値は不採用・±120s クランプ・**正当なセーブの復元結果と候補列 / runtime trace は SHA-256 一致で不変**） | `01d4e3e` |
| 35 | **M9-A.1** | **`CombatTelemetry.status.burningDamage` が dead key**（宣言され F8 が表示していたのに発行元が 1 つも無く常に 0）。`BattleScene.dealDamage` で fire かつ DoT（`isDoT` / `tag:'dot'`）の命中を集計するよう最小修正。観測のみ＝damage / 状態 / RNG に影響なし（品質不変ハッシュ不変）。実測 6,399（full build） | M9-A.1 |
| 36 | **M9-A.1** | **`BattleScene._damageTakenTotal` が dead field**（`finalizeTelemetry` と F8 が参照するのに加算箇所が無く `damageTaken` が常に 0）。`Player.takeDamage` の HP 減算と同じ位置（障壁 / 軽減の後）で実被弾量を累計。観測のみ | `0f34e1c` |
| 14 | M8-B | 実装中に作り込みかけた**死にフィールド 2 件を作らずに済ませた**: passive `heavy_armor` の `knockbackResist`（プレイヤーがノックバックされる仕組みが存在しない）と `charge_slash.levels[].visual`（`visualScale()` を使わない）。data・`modifierKeys`・`balance.warrior.mitigation` から削除し、「予約値として残さない」原則を維持 | `4c8bd10` |

## Non-regression requirements

以後の作業で**壊してはいけない**もの。

- 火の魔女: active30 / passive4 / evolution18・**同 seed の候補列**・48 件の runtimeState 保存・
  主発動スロットル（`castPulseMs`）・死にフィールド 0・未参照 cap 0
- 氷術師: active30 / passive4 / evolution18・数値・挙動・候補列・状態異常・保存・カタログ（**M8-A / M8-B で完全一致を確認済み**）
- **戦士: active30 / passive4 / evolution18**・物理のみ（火 / 氷の弾を撃たない）・闘気の 3 層上限・軽減 70% クランプ・
  撃破回復の毎秒上限・不屈の CD・エリート stagger 免疫・ボス体勢しきい値の上昇と頭打ち・
  残響/分身の対象外・48 スキルすべての CD 保存
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
- **戦士 最終Wave（M8-E）の 5 機構**:
  **貫穿突きは弾ではない**（射程 300px で頭打ち・画面端まで届かない）／
  射線上にエリート / ボスがいると通常敵の枠が絞られる（`toughSingleTargetRatio`）／
  **決闘も構えも formal status を作らない**（相手へ debuff を貼らない）／
  決闘は**同時 1 体**・敵オブジェクトを保持しない（`_seq` のみ）・死亡 / プール返却 / Scene 終了で必ず解除・
  延長には合計上限があり**ボスを永久ロックできない**／
  構えの対価は**軽減の小幅低下だけ**で、重装 / 闘気解放 / 不屈を**無効化せず**合計軽減が**負にならない**・
  攻撃補正は闘気解放との**合成上限**で頭打ち・**自傷もライフスティールもしない**／
  **震天踏破は距離と時間の両方で必ず終わる**（壁外・NaN・無限歩行なし）／
  **刃返しは完全無効化ではない**（allowlist + denylist・窓ごとの上限・超えた弾は通る）／
  反射弾は**世代 1 で止まり再反射しない**・元弾の特殊効果を引き継がない・短命／
  同じ弾を 2 度弾かない（`_deflectId` の Set は**保存しない**）／
  **1 イベント = 最大 1 系統**（`arbitrateDeflectionAndCounter()`）／
  `meleeStrike` の `line`・`Projectile` の 4 フィールド・`Enemy._duelMark` は
  **いずれも opt-in / 無害な既定値**（未指定なら従来と同一経路）／
  天鏡返しは `counter_stance` を**置換せず CD にも触らない**
- **戦士 完成監査（M8-F）で固めた不変条件**:
  戦士 48 スキルの `cdLeft` 復元は**共通 `restoreCd()` を通る**（数値以外を採用しない・非有限値を採用しない・
  ±120s へクランプ・**クランプ範囲は `[-MAX, +MAX]`** で 0 へ丸めない）／
  **火 / 氷の 27 ファイルの restore は生の代入のまま**（触ったら非回帰ハッシュが落ちる）／
  2 つの戦士基底に**破棄ガード**がある（`destroy()` 後に `update()` が何もしない）／
  **進化済みの基礎 active は候補へ戻らない**（`evolvedBaseIds`。未指定なら従来と同一挙動という加算性も含めて不変条件）／
  **決闘マーカーの寿命は `_setDuelMark` / `_clearDuelMark` の 2 メソッドだけが持つ**／
  陣の半径 / 反撃窓の回数と持続 / 旋風の回転残り時間は**すべて data の上限でクランプされる**／
  **evo/base < 1.0 の逆転が 0 件**（18 進化すべて）／
  **死にフィールド 0・未参照 `skillCaps` 0**（217 件）／
  **候補ゼロは飽和由来のみ**（非飽和の候補ゼロが出たら抽選の欠陥）
- **品質と gameplay の分離（M9-A）**:
  gameplay / safety cap は**単一値 `{ value }` の形**で品質キーを持たない（4 段階へ戻すと validate-data と
  分類テストが落ちる）／敵 / 弾プール上限は `gameplayLimits` 由来（`effectQuality` に置けない）／
  hitStop・魂炎ノードは品質非依存／**gameplay trace は 4 品質で byte-identical**
  （`tests/cross-job-quality-gameplay-invariance.mjs` ほか）／visual cap 47 件だけが品質で変わる／
  cdLeft は `restoreRuntime` の共通入口で全ジョブ無害化される
- **横断 balance ハーネスの原則（M9-A.1）**: ハーネスは production の `BattleScene.prototype` を
  直接駆動する（独自 damage 式 / 即着弾扱い / DoT 一括化 / 回数推測 / Math.random / 品質分岐 /
  production に無い補正は禁止＝`cross-job-full-harness` §1-2 が機械検査）／ハーネス周回は常に
  debugRun でセーブへ書かない（`cross-job-harness-save-isolation`）／未解決 damage 経路 0・
  未解決弾種 0・無反応 reactive 0（`cross-job-projectile-resolution` ほか）／
  npm / build / Playwright を必須依存にしない（`cross-job-browser-gate` §4 が package.json 等の
  不在を検査）
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
  `tests/three-job-final-catalog-nonregression.mjs` /
  `tests/warrior-wave1-determinism.mjs` / `tests/warrior-wave2-determinism.mjs` /
  `tests/warrior-final-determinism.mjs` /
  `tests/three-job-completion-nonregression.mjs` / `tests/warrior-completion-determinism.mjs` /
  `tests/three-job-system-nonregression.mjs`（M9-A: 3 ジョブの候補列・runtime trace・cap 分類 47/150/20・
  gameplayLimits 200/400 を SHA-256 固定）/
  `tests/three-job-balance-harness-nonregression.mjs`（M9-A.1: production 全経路 trace（3 ジョブ ×
  normal / boss）・経路カバレッジ集合・profile / stimulus / 上限 / カタログの測定条件を SHA-256 固定）のハッシュ**
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

**M8-F の残留 warning は 0 件**（`validate-data` 0 エラー 0 警告・185 スイート全通過）。
監査で「低い」と分かったが**警告ではなく構造として記録した**もの: active 補助を要求する進化 3 件
（`mountain_hurl` / `heaven_crushing_descent` / `heaven_mirror_reversal`）の取得率が
passive 補助の 15 件より低いこと。**枠を 2 つ使う二重ハンデどおりの結果**で到達不能ではなく
（HEAVY 500 seed でも取得 > 0）、均一化すると build の個性が消えるため意図的に残している。

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
- **戦士に legendary rarity の active が 1 件も無い**（common7 / uncommon13 / rare10）。
  火 / 氷は legendary active を 3 件ずつ持つ。戦士は legendary 段を進化 18 件が担う設計で、
  M8-F では**意図的に変えていない**（rarity を足すと抽選の重みが全体的に動くため）。
- **`great_cleave` の主発動回数だけが品質で 1 回ずれる**（58 → 59）。低品質では 1 撃あたりの対象数が
  少なくコンボの伸びがわずかに遅く、攻撃速度しきい値を越えるタイミングが 1 回分ずれる。
  **1 発動あたりのダメージと規則の階層は 4 品質で不変**。M8-B からある 3 ジョブ共通の帰結で、
  M8-F で新たに生じた差ではない。
- **M8-F の性能数値は Node 純ロジックの計算時間**（10 分相当で 2.5〜3.1s）であり、
  **実ブラウザの FPS ではない**。描画・入力・Phaser の内部処理は含まれていない。
- **M9-A の canonical 化で低品質の gameplay 計算量が high 相当へ増えた**（敵 200 体上限・対象数 canonical）。
  Node 実測ではロジック差は小さい（M8-F 実測で low と high の差 約 8%・M9-A の 4 品質実行時間はほぼ同一）が、
  **低スペック実機の low で FPS が悪化しないかは実ブラウザで要確認**。演出は従来どおり low で軽い。
- **ultra の gameplay 値は canonical（high）へ整列した**（例: 敵上限 320 → 200・
  `maxMeleeTargetsPerHit` 32 → 24）。バランス計測の正は high なので意図した整列だが、
  ultra 常用者には「敵がやや減った」と見える可能性がある（演出は最大のまま）。
- **横断ハーネスの限界 → M9-A.1 で解消**: 「fire / frost の弾ダメージが Scene モックで解決されない」
  制約は M9-A.1 の production 駆動ハーネス（`tests/cross-job-harness.mjs`）で解消し、
  ジョブ間の絶対比較が可能になった（`docs/cross-job-final-balance.md`）。M9-A の旧ハーネス
  （`cross-job-common.mjs`）は非回帰ハッシュの土台として維持しており、その数値（火:氷 2.72 等）は
  引き続き見かけ値として扱う（`docs/cross-job-balance.md` の documented note は歴史的記録）。
- **`great_cleave` の 58→59 分岐は M9-A で解消済み**（上記の記述は M8-F 時点の記録）。
- **M9-A.1 の性能数値も Node 純ロジックの計算時間**（300 秒相当の survival 3 ジョブで実測 6 秒前後・
  225 スイート全体で約 6分40秒）。実ブラウザ FPS は browser gate の実測（50〜60fps・20 秒サンプル）が正。

## Browser verification status

**M9-A.1 で初めて実ブラウザ（Chromium + 静的配信）での自動検証を実施した。**
ただし範囲は自動化できた項目だけで、**手入力の実プレイ体感は引き続き未確認**。
未実施の項目を「確認済み」と報告しない。実施 / 未実施の区別と再現手順は
`docs/browser-validation-gate.md`（external gate）・記録様式は
`docs/browser-validation-result-template.md`。

- **実ブラウザで確認済み（M9-A.1・自動化・console エラー合計 0）**:
  - Phaser **3.90.0** 起動・canvas 生成・8 シーン登録・Title 到達（CDN 固定 URL への要求を確認。
    網の方針で CDN へ届かないため同一版ファイルで応答・index.html 無変更）。
  - 3 ジョブの実プレイ各 20 秒（敵湧き / 撃破 / XP / 被弾 / level 進行・実 FPS 50〜60・heap 25〜29MB）。
  - 4 品質で gameplay 上限が同値（敵 200 / 弾 400 / hitStop 有・skillCap 3 種同値・
    品質差は damageNumbers / particleBudget のみ）。
  - 周回途中の品質切替（low→ultra→medium）で周回継続・gameplay 上限不変。
  - F8 分析パネル開閉と「横断バランス（M9-A.1）」節の表示（gameplay/safety cap 170 件の品質差 0 を実機表示で確認）。
  - セーブ往復（`autoSave()` → `loadActiveRun()`・save_version 6・jobId 保持）。
  - 相対パス（リソース 224 件すべて配信元・失敗 0・外部ホスト 0 ＝ GitHub Pages サブパス相当）。
- **実ブラウザで未確認（external gate に残る）**:
  - 人間の手入力による実プレイの体感・操作感（ダッシュ / エイム / 近接の当たり判定の体感）。
  - 10 分以上 / 2 倍速の長時間セッションの FPS・メモリ傾向（自動計測は 20 秒 × 9 周回まで）。
  - 敵 100 体 + 弾数百発の負荷ピーク時の実 FPS（自動プレイは序盤 20 秒のため密度が低い）。
  - EvolutionScene / ResultScene を跨ぐ一連の実プレイ・実機（スマートフォン）・GitHub Pages 本番 URL。
  - 以下の M8 系の体感項目（従来から継続）。

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

### M8-E（戦士 最終Wave）で未確認のもの

- 新 active 5 種の**実描画**（直線の突き / 決闘の指名表現 / 構えのオーラ / 進軍の土煙 / 弾き返しの火花）
- **決闘対象が視覚的に分かるか**（正式状態ではないので HUD / マーカーの見え方が要確認）
- **構えのリスクが体感できるか**（攻撃が伸びるのと引き換えに被弾が痛くなると分かるか）
- **弾き返しの体感**（弾ける弾と弾けない弾の区別が付くか・上限を超えた弾が当たると分かるか）
- **反射弾の見え方**（自分の弾になったことが分かるか・短命で消えることが分かるか）
- **F8 の 最終Wave カウンタ / F9 の 最終Wave 表示**の描画
- 戦士 active 8 枠 × 最終Wave の 5 種で **60FPS 維持**（low/medium/high/ultra × 敵100体 × 敵弾多数 × 2倍速）
- **保存 / 再開**（突き / 進軍 / 決闘 / 構え / 弾き返しの窓の途中で閉じても
  無料の再発動・二重がけ・弾ける残り回数のリセットが起きないこと）
- すべての品質で 1 周回して **JS エラー 0**

### M8-F（戦士 完成監査）で未確認のもの

M8-F は**新しい見た目・新しい操作を 1 つも追加していない**ので、確認すべきは
「修正が実プレイで悪影響を出していないこと」に絞られる。

- **進化済みの基礎 active が候補に出なくなったこと**（進化後のレベルアップで元の active が
  「新規」として並ばない・進化と基礎を同時所持できない）
- **決闘マーカーが正しく消えること**（時間切れ / 対象を変えた / 対象が死んだあと、
  生きている敵に古いマーカーが残って見えないか）
- **進化置換の瞬間に基礎スキルの攻撃が飛ばないこと**（破棄ガード。演出が二重に出ないか）
- **保存 / 再開で cooldown が正しいこと**（`restoreCd` のクランプで、
  再開直後に無料発動も逆に永久沈黙も起きないこと）
- **血断処刑（`crimson_execution`）が進化後に強くなったと体感できること**（cap 10 → 20 の影響）
- **陣 / 反撃窓 / 旋風が正常プレイでは従来どおりであること**（追加した上限に通常は達しない）
- すべての品質で 1 周回して **JS エラー 0**・**60FPS 維持**

### M9-A（3 ジョブ横断）で未確認のもの

- **同 seed・同 save・同敵配置で low / medium / high / ultra の実プレイ結果が一致する**こと
  （damage / kills / XP / Combo / Fury / status / poise / boss HP / cast 数 / リザルト）。
  Node では byte-identical を確認済みだが、**実ブラウザの実描画・実入力経路では未確認**。
- 低品質実機での FPS（gameplay 計算量が high 相当へ増えたため）。
- 周回中の品質切替（陣 / 構え / 凍結 / 炎上 / CD が消えない・増えないこと）。
- 魂炎ノードが low でも効くこと・hitStop が low でも入ること。
- F8 の「3 ジョブ比較（M9-A）」表示の描画。
- 手順は `docs/test-guide.md` の **Milestone 9-A** 節。

## Latest test results

- 実行日時点: Milestone 9-A.1 完了時（コミット `0f34e1c`）
- **テストスイート: 225 件 → 全 225 通過・失敗 0**（`tests/*.mjs` から共通土台
  `frost-audit-common` / `flame-audit-common` / `warrior-common` / `status-passive-common` /
  `warrior-draft-sim` / `cap-shape` / `cross-job-common` / `cross-job-harness` / `phaser-stub` と
  `validate-data.mjs` を除く。`validate.yml` のステップ数は `validate-data` を含め **226**）
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**（M9-A.1 ブロックを追加）
- M9-A.1 新規 15 スイート（すべて production 全経路駆動・Node 標準機能のみ）:
  `cross-job-full-harness`(81) / `cross-job-projectile-resolution`(29) /
  `cross-job-dot-persistent-resolution`(29) / `cross-job-reactive-stimulus`(36) /
  `cross-job-boss-profile`(15) / `cross-job-survival-profile`(15) / `cross-job-balance-final`(63) /
  `cross-job-balance-warning-classification`(27) / `cross-job-quality-full-invariance`(254) /
  `cross-job-quality-midrun-switch`(78) / `cross-job-balance-determinism`(55) /
  `cross-job-harness-save-isolation`(52) / `cross-job-harness-cleanup`(74) /
  `cross-job-browser-gate`(54) / `three-job-balance-harness-nonregression`(17)
- 共通土台の追加: `tests/cross-job-harness.mjs`（production 駆動ハーネス）・
  `tests/phaser-stub.mjs`（Phaser プリミティブの最小 stub・ゲームロジックなし）
- `HEAVY=1` で seed 数（3→5〜7）と profile 数（2→4）が拡張される。
- **projectile 解決を巻き戻す（弾を即着弾扱い・checkCollisions のモック化）と**
  `cross-job-projectile-resolution`（命中カバレッジ）と `cross-job-full-harness` §1
  （prototype 同一性）が必ず落ちる。

### 旧 Latest test results（M9-A）

- 実行日時点: Milestone 9-A 完了時（コミット `01d4e3e`）
- **テストスイート: 210 件（`tests/*.mjs` から共通土台 `frost-audit-common.mjs` / `flame-audit-common.mjs` /
  `warrior-common.mjs` / `status-passive-common.mjs` / `warrior-draft-sim.mjs` / `cap-shape.mjs` /
  `cross-job-common.mjs` と `validate-data.mjs` を除く）→ 全 210 通過・失敗 0**
  （`validate.yml` のステップ数は `validate-data` を含めて **211**）
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**（M9-A ブロックを追加）
- M9-A 新規 25 スイート:
  `cross-job-catalog` / `cross-job-pool-isolation` / `cross-job-quality-cap-classification` /
  `cross-job-quality-gameplay-invariance` / `cross-job-quality-rng-invariance` /
  `cross-job-quality-visual-reduction` / `cross-job-draft-audit` / `cross-job-evolution-audit` /
  `cross-job-balance-comparison` / `cross-job-combat-paths` / `cross-job-record-cast` /
  `cross-job-cooldown-save` / `cross-job-runtime-state` / `cross-job-status-resource` /
  `cross-job-defense` / `cross-job-save-switching` / `cross-job-folder-save` / `cross-job-telemetry` /
  `cross-job-debug-panels` / `cross-job-performance` / `cross-job-pool-spatial` /
  `cross-job-caps-fields` / `cross-job-warning-consistency` / `cross-job-determinism` /
  `three-job-system-nonregression`
- M9-A で更新した既存のもの: 品質 cap の形の変更に伴い、cap の単調性 / 正値検査を持つ既存 12 スイート
  （flame/frost-quality-cap-audit・warrior-*-quality-cap・warrior-completion-caps-fields /
  -performance・three-job-completion-nonregression・fire/frost-skills-wave*・new-fire-skills・
  cast-event-audit・warrior-final-cleanup）を `tests/cap-shape.mjs` の 4 段階展開ビュー経由へ。
  **検査の意味は不変**（単一値は 4 つ同値として同じ単調・正検査を通る）。
- **M9-A の品質修正を巻き戻すと**、validate-data（形の混在）・cap-classification・
  gameplay-invariance・visual-reduction が必ず落ちる。cdLeft 共通入口を巻き戻すと
  cross-job-cooldown-save の火 / 氷の改ざん節が落ちる。

### 旧 Latest test results（M8-F）

- 実行日時点: Milestone 8-F 完了時（コミット `dd39087`）
- **テストスイート: 185 件（`tests/*.mjs` から共通土台 `frost-audit-common.mjs` / `flame-audit-common.mjs` /
  `warrior-common.mjs` / `status-passive-common.mjs` / `warrior-draft-sim.mjs` と `validate-data.mjs` を除く）
  → 全 185 通過・失敗 0**（`validate.yml` のステップ数は `validate-data` を含めて **186**）
- `node tests/validate-data.mjs` → **0 エラー / 0 警告**
- M8-F 新規 23 スイート（括弧内はアサーション数）:
  `warrior-completion-catalog`（425）/ `warrior-completion-draft`（328）/
  `warrior-completion-evolutions`（404）/ `warrior-completion-low-rate`（110）/
  `warrior-completion-skill-audit`（1746）/ `warrior-completion-record-cast`（269）/
  `warrior-completion-cooldown-save`（2012）/ `warrior-completion-runtime-state`（1733）/
  `warrior-completion-fury-combo`（51）/ `warrior-completion-recovery`（33）/
  `warrior-completion-defense`（51）/ `warrior-completion-enemy-types`（198）/
  `warrior-completion-movement`（447）/ `warrior-completion-projectile-field`（198）/
  `warrior-completion-job-passive`（258）/ `warrior-completion-telemetry`（208）/
  `warrior-completion-debug-panels`（90）/ `warrior-completion-performance`（137）/
  `warrior-completion-caps-fields`（1513）/ `warrior-completion-save`（217）/
  `warrior-completion-determinism`（283）/ `warrior-completion-balance`（260）/
  `three-job-completion-nonregression`（354）
- M8-F で更新した既存のもの: `tests/warrior-draft-sim.mjs`（`saturatedNone` / `unsaturatedNone` の分解・
  飽和判定を進化込みの実上限へ・`evolvedBaseIds` を渡す `buildCtx`）/
  `tests/warrior-common.mjs`（`_duelMarkSeq` / `setDuelMark` / `clearDuelMark` / `cleanupWarrior` を
  production と同じ形で追加）/ `tests/validate-data.mjs`（M8-F ブロック 16 節）
- `.github/workflows/validate.yml` へ 23 ステップ追加（計 **186** ステップ・
  すべて実在するファイルを指し、テストファイルの取りこぼしも 0）。
- **いずれも regex だけでなく production の class / prototype / manager を直接駆動する実測**で、
  M8-F の修正を巻き戻すと落ちる（例: `restoreCd` を戻すと cooldown-save の改ざん節が落ち、
  `evolvedBaseIds` を戻すと completion-draft が落ち、`_dead` を戻すと completion-runtime-state が落ち、
  `crimson_execution` の cap を戻すと completion-balance が落ちる）。
- M8-E 新規 16 スイート（括弧内はアサーション数）:
  `warrior-final-catalog`（935）/ `warrior-final-pool`（229）/ `warrior-final-draft`（164）/
  `warrior-final-guidance`（124）/ `warrior-final-evolutions`（171）/
  `warrior-piercing-lunge`（47）/ `warrior-duel-challenge`（53）/ `warrior-battle-trance`（69）/
  `warrior-earthshaker-march`（54）/ `warrior-weapon-deflection`（116）/
  `warrior-final-runtime-save`（235）/ `warrior-final-determinism`（80）/
  `warrior-final-quality-cap`（216）/ `warrior-final-cleanup`（116）/ `warrior-final-telemetry`（432）/
  `three-job-final-catalog-nonregression`（1843）
- 更新した既存スイート: `warrior-common`（EXPECTED を 30/4/18 へ・最終Wave の combat API と敵 / 弾フィールドを追加）/
  `warrior-evolutions`（構え系の除外に天鏡返しを追加・進化の数値次元に M8-D/E のブロックを追加）/
  `warrior-active-skills`（直接ダメージを持たない刃返しを STANCE_ONLY へ）/
  `warrior-telemetry` `warrior-wave1-telemetry` `warrior-wave2-telemetry`（ライブ表示キーを追加）/
  `warrior-wave1-job80`（MOVERS へ震天踏破を追加）/
  `warrior-wave2-catalog` `warrior-wave2-pool` `status-passive-nonregression`
  `three-job-wave2-nonregression`（規模を EXPECTED 参照へ）/
  `warrior-evolution-guidance` `warrior-wave2-guidance`（高要求補助の倍率を単体上限へ織り込み）/
  `warrior-active-support-evolution`（`counter_stance` のトレードオフを検査する形へ）/
  `warrior-build-diversity` `warrior-draft-sim`（`formedButNotOffered` の誤検知を修正）/
  `warrior-draft-guidance-nonregression`（skillCaps 205 → 217）/ `validate-data`（M8-E ブロック）
- `.github/workflows/validate.yml` へ 16 ステップ追加（計 **163** ステップ・
  すべて実在するファイルを指し、テストファイルの取りこぼしも 0）。

### M8-E で見つけて直した既存の不備

| 不備 | 影響 | 修正 |
|------|------|------|
| `WARRIOR_DEFAULTS` に最終Wave のブロックが無い | balance を渡さないと `beginPiercingLunge` が例外 | 既定値（line / duel / trance / deflection / march）を追加 |
| `restoreTimedBuffs()` が決闘の復元で `duelStarts` を**二重に**戻していた | 復元後にテレメトリが **-1** になる | `restoreDuelState()` はもともと数えていないので減算を削除。弾き返しの窓カウンタも 0 未満へ下がらないようクランプ |
| `canDeflectProjectile()` が `deflectGeneration` を見ていない | `alreadyDeflected` の印が落ちた反射弾を**再び弾けてしまう** | 世代だけで止まるガードを追加（`maxReflectGeneration`） |
| 枠を使い切ると `deflectionActive` が false になり調停へ入らない | 「上限に達した窓へ弾が来た」を**1 度も計測できない** | 窓の開閉だけを見る `deflectionWindowOpen` を追加し、調停までは通して `capReached` を数える（弾は素通りするので挙動は不変） |
| `warrior-build-diversity` の `formedButNotOffered` が誤検知 | 進化 18 種では「同時成立が 3 枠に収まらない」だけで失敗する | 進化候補が**1 つも出なかった** draft だけを数える形へ。良性ケースは `formedPartiallyOffered` として分離 |

### M8-F で見つけて直した不備

| 不備 | 影響 | 修正 |
|------|------|------|
| 戦士 48 スキルの `restoreState({cdLeft})` が負数 / NaN / ±Infinity / 桁外れを採用 | 改ざん保存で `_cd = NaN` → 二度と撃てない / 常に撃てる | 共通 `restoreCd()` を 2 つの戦士基底へ。非有限値は採用せず ±120s へクランプ（火 / 氷は不変） |
| 陣（`placeRallyField`）の半径が無制限 | 半径 1e9 = 永久バフ | `rally.maxRadius`(280) を追加してクランプ |
| 反撃窓の回数と持続が無制限 | 「999 回・1e9ms」= 実質無限反撃 | `counter.maxCountersPerWindow`(6) / `counter.maxWindowMs`(6000) を追加（開始時と復元時の両方） |
| 旋風斬の回転残り時間が復元でクランプされない | 永久回転（継続ダメージが止まらない） | data の `duration` で頭打ち |
| 進化済みの基礎 active が空き枠へ再提示（200 seed 中 38 回） | 進化と基礎を同時所持できた | `evolvedBaseIds` を加算的に追加し `_eligible` が除外（火 / 氷の候補列は不変） |
| M8-B / M8-C の 21 スキルが `destroy()` 後も発動 | 進化置換 / Scene 終了後に攻撃が飛ぶ | 2 つの戦士基底へ破棄ガード（1 か所） |
| `Enemy._duelMark` が時間切れ / 再指定 / 解除で外れない | 生きた敵に古いマーカーが残る | `_setDuelMark` / `_clearDuelMark` で寿命を集約 |
| `crimson_execution` が base より弱い（69%） | 進化すると火力が下がる逆転 | `safetyCaps.maxTargetsPerStrike` 10 → 20（修正後 1.37） |
| 死にフィールド `charge_slash.config.hitOncePerTarget` | data にあるのに実装がハードコード | 実装から読むようにした（現 data は `true` なので挙動不変） |

## Next milestone

**未定（次の指示待ち）。** 3 ジョブの個別監査（M7-E / M8-A / M8-F）・横断監査（M9-A）・
横断 balance ハーネス完成と実ブラウザ検証ゲート（M9-A.1）が完了し、共通基盤
（品質分離・cap 分類・保存・telemetry・決定論・**production 全経路の絶対比較**）が
SHA-256 で固定された。候補は以下。

1. **火と氷の属性反応** — 炎上⇄冷気/凍結の相互作用（付与時の source element を活用）。
   横断監査で combat path が整理されたので、相互作用の挿入点は明確。
2. **転生レガシー / ジョブ間継承**（`futureInheritanceSettings` / `extraAllowedIds` が拡張口）。
3. **周回長の拡張**（10分 / 15分 / 無限モード）・**追加の敵 / ボス / 難易度**。
4. **4 人目のジョブ** — 3 ジョブぶんの基盤・監査観点・テスト雛形・横断非回帰がそろっている。
   新ジョブの cap は最初から分類つき（visual / gameplay / safety）で追加する。
5. **実ブラウザでの手動確認（外部ゲートの残項目）** — `docs/browser-validation-gate.md` §4 の
   未確認項目（手入力の体感・10 分 / 2 倍速の長時間・敵 100 体の負荷ピーク・実機）。
   自動化で確認できる範囲（起動 / 3 ジョブ / 4 品質 / 途中切替 / F8 / セーブ往復 / 相対パス）は
   M9-A.1 で console エラー 0 を確認済み。

いずれも**指示された範囲のみ**実装し、未指定の先行実装はしない（`CLAUDE.md` の作業手順）。

### 拡張のたびに必ず回すもの（M8-C.1 / M8-D / M8-E / M8-F で共通）

```
node tests/warrior-slot4-evolution-rate.mjs      # 枠4 の到達率（最も薄まりやすい）
node tests/warrior-completion-draft.mjs          # 完成カタログの網羅・集中度・飽和の分解
node tests/warrior-final-guidance.mjs            # guidance の追調整（過剰誘導なし）
node tests/warrior-build-diversity.mjs           # build 多様性
node tests/warrior-completion-caps-fields.mjs    # 未参照 cap / 死にフィールド 0
node tests/warrior-completion-balance.mjs        # 死にスキル 0・evo/base の逆転 0・永久状態 0
node tests/three-job-completion-nonregression.mjs      # 火 / 氷のハッシュ（最新）
node tests/three-job-final-catalog-nonregression.mjs   # 火 / 氷のハッシュ（M8-E 版も維持）
```

薄まりの吸収は**「しきい値を下げる」のではなく guidance を data で調整する**
（M8-C.1 / M8-D / M8-E / M8-F と同じ方針）。

戦士へ手を入れるときは、M8-F で固めた 4 つの経路を必ず確認する
（`restoreCd` / 破棄ガード / `evolvedBaseIds` / 決闘マーカーの寿命）。
どれも 1 か所へ集約してあるので、**新しいスキルは何もしなくても同じ保証を継承する**。
