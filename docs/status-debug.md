# F10 状態デバッグパネル（Milestone 7-B.1）

M7-B.1 で、状態異常（冷気/凍結/耐性/粉砕/ボス氷砕）の**実際のロジック値**を通常プレイ中に突き合わせるための開発用パネルを追加した。
`?debug=1` **限定**で **F10** で開閉する（F1〜F9 と非競合）。演出を疑ったときに凍結確率の内訳・RNG roll・カウンタを数値で確認するためのもので、
**profile・バランス・状態ロジックには一切影響しない**（表示状態は保存しない・`save_version` は v6 のまま）。

- 純ロジック＋Phaser パネル: `./src/ui/StatusDebugPanel.js`（`activeStatusesOf`/`enemyDebugLines`/`freezeBreakdownLines`/`bossDebugLines`/`counterLines`）
- 読む権威: `StatusEffectManager`（`counters()`/`statusIndexSize()`/エンティティ別 `_statusDebug`）・`FreezeSystem`・Enemy/Boss の状態フィールド
- 検証: `node tests/status-debug-panel.mjs`（Node 標準のみ）

## 対象選択
- **クリックで最寄りの敵/ボスを選択**する（`?debug=1` で BattleScene にポインタ選択を配線）。
- 選択対象が**死亡すると自動で解除**される（古い対象を掴み続けない）。
- 表示はランタイムのみ。選択対象・履歴は保存しない。

## 敵行（`enemyDebugLines`）
選択した通常敵/エリートについて次を表示する:
- HP / 敵種別（elite 含む）
- `chill` / `chillCap` / ratio（chill/chillCap） / `guaranteedThreshold`（確定凍結閾値）
- `slow`（減速率） / `frozen`（±残り時間） / immunity（`freeze_immunity` 残り時間）
- `freezeChanceCap` / 各倍率（氷ダメージ/状態/粉砕 等の適用倍率）
- active 状態（付与中の状態異常一覧・`activeStatusesOf`）
- 最後に冷気を付与した skillId（`_lastChillSkillId`）

## freezeChance 内訳（`freezeBreakdownLines`）
直近の凍結判定を、エンティティ別 `_statusDebug` から式の各項に分解して表示する:
- base×proc（`baseFreezeChance × procCoefficient`）
- 冷気寄与（`chillRatio × chanceFromChill × procCoefficient`）
- proc（`procCoefficient`）
- 最終 freezeChance（cap クランプ後）
- RNG roll（状態異常専用 `SeededRandom` の値）
- 結果（凍結した/しなかった・確定凍結か）
- hitGroupId / 同 group の判定回数
- skip 理由（`immunity`〈凍結耐性中〉 / `hitGroup上限`〈`sameHitGroupMaxFreezeChecks` 到達〉）

これにより、演出上「凍りそうで凍らない」ときに**確定閾値・cap・免疫・hitGroup 上限のどれで止まったか**を数値で確認できる。表示は観測であり、判定・RNG cursor には影響しない。

## ボス行（`bossDebugLines`）
ボス在戦時に氷砕状態を表示する:
- gauge / threshold（現在必要値） / 各倍率
- break 回数 / cooldown（break 後） / vuln（氷砕脆弱の残り時間・active 有無）
- ice 倍率（脆弱中 ×1.15） / active 状態
- 最後にゲージへ寄与した skillId（`_lastGaugeSkillId`）

## 実動作カウンタ（`counterLines`・#11）
`StatusEffectManager.counters()`＋`statusIndexSize()` から周回全体の状態カウンタを表示する:
`chillApplications` / `chillAmountTotal` / `freezeAttempts` / `freezeSuccesses` / `immunitySkips` / `hitGroupSkips` / `bossGaugeApplications` / 状態索引サイズ ほか（計 #11 相当）。
凍結の起こりやすさ・永久凍結防止（hitGroup 上限）・免疫 skip の頻度をバランス確認に使える。

## CombatTelemetry と重複しない設計
F10 デバッグは**その場の観測（ライブ値・freeze 内訳）**を出すもので、`CombatTelemetry`（M6-F/M7-A/M7-B・周回集計・ResultScene「Balance詳細」）とは**役割が別**である。
両者を二重に集計・保存しない（F10 はカウンタ/権威値を読むだけ・テレメトリ集計経路には割り込まない）。

## debugRun 分離・profile を変更しない
- F10 を使った周回は `markDebugRun()` で **debugRun** としてマークし、通常統計（`summaryBySkill`/`recentRuns`）へ混ぜない（M6-F の debugRun 分離を踏襲）。
- パネルは**表示と観測のみ**で、profile の通貨/進行/JobXP/クリア/熟練度を変更・保存しない。
- **`?debug=1` 限定**（通常 URL では出ない）。表示状態は保存しない・`save_version` は v6 のまま。

## 既知の制約（実ブラウザ未確認）
Node で検証したのは**純ロジックのみ**（対象選択・敵/ボス行・freezeChance 内訳・カウンタ行の整形）。**パネルの実描画・F10 の実挙動は本環境では未検証**。
実ブラウザ（GitHub Pages・`?debug=1` の F10）で確認する（`docs/test-guide.md` の M7-B.1 項目）。実行していない項目を「確認済み」と報告しない。

## Milestone 7-C の追記（新スキルの状態も自動反映）
M7-C で氷術師へ追加した新 active10種・進化5種は、冷気/凍結/粉砕/ボス氷砕を既存の `StatusEffectManager` / `FreezeSystem` 経路で起こすため、
F10 の chill / freeze 内訳 / hitGroup 上限 / 実動作カウンタ（`chillApplications`/`freezeAttempts`/`freezeSuccesses`/`immunitySkips`/`hitGroupSkips`/`bossGaugeApplications` ほか）へ
**自動反映**される（新スキルのために F10 側の集計を追加実装しない）。多段/往復/連鎖/barrage の新スキルは低い `procCoefficient`＋二次 proc（`config`）で凍結を起こすため、
freeze 内訳（base×proc / 冷気寄与 / proc / 最終 freezeChance / RNG roll / 結果 / hitGroupId / 同 group 判定回数 / skip理由）で**永久凍結にならないこと**を確認できる。
新スキル固有のテレメトリ extra は `CombatTelemetry`（ResultScene「Balance詳細」）側で扱い、F10 とは役割を分ける（二重集計しない）。表示状態は保存しない・`save_version` は v6 のまま。
実際の描画・F10 の実挙動は本環境では未検証（`docs/test-guide.md` の M7-C 項目）。

## Milestone 7-D の追記（新スキルの状態も自動反映）
M7-D で氷術師へ追加した新 active5種・進化5種は、冷気/凍結/粉砕/ボス氷砕を既存の `StatusEffectManager` / `FreezeSystem` 経路で起こすため、
F10 の chill / freeze 内訳 / hitGroup 上限 / 実動作カウンタ（`chillApplications`/`freezeAttempts`/`freezeSuccesses`/`immunitySkips`/`hitGroupSkips`/`bossGaugeApplications` ほか）へ
**自動反映**される（新スキルのために F10 側の集計を追加実装しない）。豪雨 barrage/砲台/氷山/burst/氷印起爆の新スキルは低い `procCoefficient`＋二次 proc（`config`）で凍結を起こすため、
freeze 内訳（base×proc / 冷気寄与 / proc / 最終 freezeChance / RNG roll / 結果 / hitGroupId / 同 group 判定回数 / skip理由）で**永久凍結にならないこと**を確認できる。
- **氷印/氷棺は skill-local マーカー**で正式 status ではないため、F10 の状態異常一覧（burning/chill/frozen/immunity/frostbreak）には現れない（`Enemy._iceSeal`/`_iceHitCount` はスキル側の値）。氷属性命中数による起爆は氷ヒットの chill/freeze カウンタとして間接的に反映される。
新スキル固有のテレメトリ extra は `CombatTelemetry`（ResultScene「Balance詳細」）側で扱い、F10 とは役割を分ける（二重集計しない）。表示状態は保存しない・`save_version` は v6 のまま。
実際の描画・F10 の実挙動は本環境では未検証（`docs/test-guide.md` の M7-D 項目）。

## Milestone 7-E: 直近イベント履歴（F10）
`StatusDebugPanel` が `StatusEffectManager` のイベントを購読し、**直近の状態イベント履歴**を表示する
（`chillChanged` / `frozenStarted` / `frozenEnded` / `freezeImmunityStarted` / `bossFrostGaugeChanged` /
`frostbreakTriggered` / `shatterTriggered` など）。上限は品質別 `skillCaps.maxStatusDebugHistory`（低品質ほど短い）。

- 履歴は**表示専用**で `active_run` へ保存しない。判定・ダメージ・状態 RNG cursor には一切影響しない。
- `destroy()` で購読を解除し履歴を破棄する（リスナー・参照の残留なし）。
- 確定凍結の事前通知（`chillThresholdNear`）は `skillCaps.chillNearThresholdEffectCooldown` で間引かれる（表示のみ）。
