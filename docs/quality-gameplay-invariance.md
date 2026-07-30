# 品質と gameplay の不変性（Milestone 9-A）

M9-A の最優先課題「**演出品質が戦闘結果へ影響する**」の再現・修正・検証の記録。

## 1. 問題の再現（修正前）

M8-F が記録した `great_cleave` の分岐を production 経路（`SkillManager` ＋ 全スキル class ＋
`WarriorCombatSystem`・同 seed・同入力・同 dt・同敵配置で品質だけ変更）で再現した。

```
（修正前の tree・warrior-completion-performance.mjs）
品質で発動回数が前後したスキル: great_cleave(58→59)   ← low 58 / ultra 59
```

原因の連鎖:
`maxMeleeTargetsPerHit` が品質別（12/18/24/32）
→ 低品質は 1 撃の対象数が少ない
→ コンボの伸びがわずかに遅い
→ 攻撃速度しきい値へ到達する時刻がずれる
→ 主発動回数が 1 回分岐する。

さらに調査で判明した**より大きな品質依存**:

| 経路 | 旧挙動 |
|------|--------|
| 敵プール上限 | low 60 体 / medium 120 / high 200 / ultra 320 —— **敵の数そのもの**（＝XP / kill / 密度）が品質依存 |
| 弾プール上限 | 120〜700 —— 弾の実体数が品質依存 |
| skillCaps 161 件 | gameplay / safety に分類されるべき cap が品質別（例: `maxFlameLances` 24〜120・`maxFrozenEnemies` 30〜160・`maxReflectedProjectiles` 4〜8） |
| hitStop | high / ultra のみ —— ロジックの経過時間が品質依存 |
| 魂炎ノード | 敵密度は low 無効・弾上限は low / medium 無効 —— **恒久強化が品質で消えた** |

対象は特定スキルではなく **3 ジョブ全 144 スキル**に及ぶ構造問題だった。

## 2. 修正

`./quality-cap-classification.md` のとおり、gameplay / safety cap 170 件を単一値
（canonical = 旧 high）へ、敵 / 弾プール上限を `gameplayLimits` へ、hitStop と魂炎ノードを
品質非依存へ変更した。**visual cap 47 件だけが品質で変わる。**

## 3. gameplay trace の定義と検証

`tests/cross-job-common.mjs` の `runJob()` が生成する trace:

- **含む**: cast / hit / kill / damage / 補助統計（extra）/ runtimeState（cooldown・再開状態）/
  ダメージ・付与・ノックバック等の**呼び出し列全体のハッシュ**（対象順を含む）/
  戦士の闘気・コンボ・体勢・telemetry / status RNG cursor（別テスト）
- **含まない**: 演出（このハーネスの Scene モックは演出を生成しないため、visual は
  cap 値と production の `visualCap` 経路で別途検証）

## 4. 実測（修正後・4 品質で byte-identical）

`tests/cross-job-quality-gameplay-invariance.mjs`（各ジョブ × {active 30, evolution 18} × 4 品質）:

| run | trace hash（先頭 12 桁・4 品質同一） | 呼び出し数 |
|-----|--------------------------------------|-----------|
| flame_witch / active 30 | 全品質一致 | 一致 |
| flame_witch / evolution 18 | 全品質一致 | 一致 |
| frost_mage / active 30 | 全品質一致 | 一致 |
| frost_mage / evolution 18 | 全品質一致 | 一致 |
| warrior / active 30 | 全品質一致 | 一致 |
| warrior / evolution 18 | 全品質一致 | 一致 |

- per-skill でも low / ultra の cast / hit / damage / kill / extra が **144 skill 全件一致**。
- `great_cleave` 再検証: 4 品質で主発動・命中とも一致（修正前の 58/59 分岐が解消）。
  `warrior-completion-performance.mjs` の実測も「品質で発動回数が前後したスキル: **なし**」。
- RNG: status RNG の cursor・消費数・付与列・凍結数が 4 品質で一致
  （`cross-job-quality-rng-invariance.mjs`）。draft RNG は品質を入力に持たない（source + 実駆動で確認）。
- 決定論との連結: 「low の run」と「ultra の run」のハッシュが等しい
  （`cross-job-determinism.mjs` §3）。

## 5. 巻き戻し検知

以下のどれを巻き戻しても対応するテストが**必ず落ちる**:

| 巻き戻し | 落ちるテスト |
|----------|--------------|
| gameplay cap を 4 段階へ戻す | `validate-data`（形の混在エラー）＋ `cross-job-quality-cap-classification` ＋ `cross-job-quality-gameplay-invariance` |
| `effectQuality` へ maxEnemies を戻す | `validate-data`（残留エラー）＋ `cross-job-pool-spatial` |
| hitStop を品質ゲートへ戻す | `cross-job-quality-visual-reduction` §4 |
| 魂炎ノードの品質ゲート復活 | `cross-job-quality-visual-reduction` §4 |
| `DataManager.skillCap` の単一値解決を外す | `cross-job-quality-cap-classification` §7 ほか多数 |

## 6. 品質変更の安全性

- 品質は `settings`（プロファイルとは別枠）にのみ保存され、**save へ新キーを追加していない**。
  周回中に品質を変えても gameplay cap は単一値なので pending event / active_run は影響を受けない。
- `CombatTelemetry.run.quality` は表示用ヘッダとして残る（集計値へは影響しない —
  `cross-job-telemetry.mjs` §2 で quality 以外の全キー一致を確認）。

## 7. 実ブラウザ未確認

上記はすべて Node 純ロジック＋最小モックの実測。**実描画・実 FPS・実プレイの体感は未確認**。
手順は `./test-guide.md` の Milestone 9-A 節（同 seed・同 save で 4 品質を実プレイ比較）。
