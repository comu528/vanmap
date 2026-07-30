# 3 ジョブ横断 完成マトリクス（Milestone 9-A）

3 ジョブの完成状態を 1 枚で突き合わせる表。個別の 48 スキル表は
`./warrior-completion-matrix.md`（戦士）・`./skill-catalog.md`（火 / 氷の節）を参照。

## 1. カタログ規模（M9-A で全数再確認）

| 項目 | 火の魔女 | 氷術師 | 戦士 | 全体 |
|------|----------|--------|------|------|
| active | 30 | 30 | 30 | **90** |
| passive | 4 | 4 | 4 | **12** |
| evolution | 18 | 18 | 18 | **54** |
| 合計 | 52 | 52 | 52 | **156**（skill+evolution 144） |
| 完成監査 | M8-A | M7-E | M8-F | **横断 M9-A** |

- id 重複 0・displayName 衝突 0・unknown class 0・orphan 0・JSON-only 0・class-only 0。
- 3 プール互いに素・暗黙 common 0（isCommon / jobs:["*"] とも 0 件）・`memberAllowedForJob` 全数一致。
- Job Lv80「打撃数 +1」対象: **各ジョブちょうど 6**・進化 54 件はすべて対象外。
- `SkillCatalog.buildCatalog()` issues: 3 ジョブとも 0。

## 2. rarity / 役割の設計差（意図した差・エラーではない）

| 項目 | 火 | 氷 | 戦士 |
|------|-----|-----|------|
| rarity（C/U/R/L） | 8/10/9/**3** | 9/10/8/**3** | 7/13/10/**0** |
| legendary の担い手 | active 3 種 | active 3 種 | **進化 18 種** |
| active 補助の進化 | **14** | 3 | 3 |
| 進化を持たない active | 12 | 12 | 12 |
| element | fire（skill 未宣言・ジョブ既定で解決） | ice（skill 宣言） | physical（skill 宣言） |
| 資源 | 熱量（核 2 種） | なし | 闘気・コンボ |
| 状態異常 | burning（マーカー） | chill / frozen / immunity / frostbreak | なし（体勢は専用ゲージ） |
| 対ボス | 爆発縮小 | 氷砕ゲージ | 体勢崩し（しきい値上昇） |
| castMode | cooldown + continuous/periodic/resource/reactive | 同左 | **全 30 件 cooldown** |

## 3. runtime / 保存の横断確認（M9-A・144 skill）

| 検査 | 結果 |
|------|------|
| recordCast 1:1 | 基底が 1 発動 = 1 記録。custom-cast（mainCastEvent 宣言つき）だけが自前記録。戦士はスキル側呼び出し 0 |
| cooldown 保存 | cooldown 型は cdLeft を全件保存・往復一致。**改ざん（NaN / ±Infinity / 桁外れ / 文字列）は共通入口で全ジョブ無害化** |
| runtimeState | JSON 安全・オブジェクト参照 0・壊れた入力 / 旧セーブ / 二重 restore / 未知 id に耐える |
| destroy | 3 ジョブとも SkillManager.destroy() 後の残留 0 |
| 決定論 | 候補列 / runtime trace が run 間・品質間で一致（SHA-256 固定は `three-job-system-nonregression.mjs`） |

## 4. 品質不変性（M9-A の中核）

| 検査 | 結果 |
|------|------|
| gameplay trace（cast / hit / damage / kill / 対象 / runtime / 戦士資源） | **4 品質で byte-identical**（3 ジョブ × active30 / evolution18） |
| RNG cursor（status / draft） | 4 品質で一致 |
| visual | 47 cap 中 45 件が low < ultra（削減は演出だけに実在） |
| great_cleave 58→59 分岐 | 解消（4 品質で一致） |

## 5. 横断テスト（25 スイート）と非回帰ハッシュ

`tests/cross-job-*.mjs` × 24 ＋ `tests/three-job-system-nonregression.mjs`。
非回帰ハッシュ（候補列 100 seed / runtime trace / cap 分類 47-150-20 / gameplayLimits 200-400 /
カタログ 30-4-18×3 / save v6）は `three-job-system-nonregression.mjs` に固定。

## 6. 横断バランス（M9-A.1 で追記）

| 検査 | 結果 |
|------|------|
| 未解決 damage 経路 / 弾種 / 無反応 reactive | **0 / 0 / 0**（production 全経路駆動・144 skill 全件に utility） |
| boss kill time（中央値） | 火 7.6s / 戦士 12.5s / 氷 22.2s（3 ジョブとも有限時間で撃破） |
| warning 分類 | すべて role / profile（**bug / balance = 0 件**・`./cross-job-final-balance.md`） |
| 品質不変（完全ハーネス + 周回途中切替） | byte-identical 維持 |
| 実ブラウザ | 自動検証（起動 / 3 ジョブ / 4 品質 / 切替 / F8 / セーブ / 相対パス）console エラー 0。体感は未確認 |
| 非回帰 | trace / 経路集合 / 測定条件を SHA-256 固定（`three-job-balance-harness-nonregression.mjs`） |

## 7. 横断完成判定

3 ジョブは**カタログ・抽選・runtime・保存・telemetry・性能・品質分離のすべてで同一の共通規則に乗り、
かつ個性（rarity 構成・資源・状態異常・対ボス手段）は data と記録で明示的に differ する**。
コードとデータとしては横断完成。**M9-A.1 で production 全経路の絶対比較も完成**
（`./cross-job-final-balance.md`）。実プレイの体感は未確認（`./browser-validation-gate.md` §4）。
