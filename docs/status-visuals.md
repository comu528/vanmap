# 状態異常の表示層（Milestone 7-B.1）

M7-B.1 で、氷術師の制圧サイクル（冷気→凍結→粉砕 / ボス氷砕）と炎上を**通常プレイ中に見て確かめられる**表示層を追加した。
**表示はロジックと完全に分離**しており、状態の判定・ダメージ・凍結確率・状態RNG cursor・ボス氷砕値は**一切変更しない**（`StatusEffectManager`/`FreezeSystem` の計算は M7-A/M7-B のまま）。
**新スキル/パッシブ/進化/ジョブは追加せず・データ数値やバランスは変更しない・表示状態はセーブしない・`save_version` は v6 のまま**。

- 純ロジック＋Phaser クラス: `./src/systems/StatusVisualManager.js`（状態 overlay）/ `./src/ui/BossFrostbreakDisplay.js`（ボス氷砕 HUD）/ `./src/ui/StatusDebugPanel.js`（F10・`docs/status-debug.md`）
- データ: `./data/balance.json` の `skillCaps`（表示上限11種）＋`statusVisuals`（表示メタ。`docs/data-format.md`）
- 変更: `StatusEffectManager`（イベント/カウンタ・`docs/status-effects.md`）/ `Enemy`（tint を overlay へ移動）/ `HUD.updateBossFrost` / `DataManager.statusVisualsConfig` / `BattleScene`（配線）
- 検証: `node tests/status-visual-state.mjs` / `node tests/frostbreak-ui-state.mjs`（Node 標準のみ）

## 冷気(chill)の段階表示
冷気量の割合（`chill / chillCap`）で見た目が段階化する。`StatusVisualManager.chillTierOf(ratio)` が段階を返す（0=none / <0.40=low / <0.75=mid / else high）。
| 段階 | 割合 | 見た目 |
|------|------|--------|
| low | 1〜39% | ごく薄い水色 |
| mid | 40〜74% | 水色縁＋足元の氷輪 |
| high | 75%+ | 青白縁＋氷結晶マーク |

- **確定閾値の直前**（`isNearThreshold(chill, guaranteedThreshold)` が >=90% で真）に**一度光る事前通知**を出す（`chillThresholdNear` イベント・`chillNearThresholdEffectCooldown`=1500ms で再発火を抑制）。
- **冷気0で完全解除**（overlay を消す）。冷気は権威フィールド `_chill` を読むだけで、量そのものは表示層で変えない。

## 減速(slow)
冷気で敵が実際に遅くなる（`Enemy.effectiveSpeed` が `_chillSlow` を読む）。減速の**見た目（トレイル等）と実挙動は一致**し、F10 デバッグの表示減速率とも一致する。
通常最大50%・エリート35%・**ボスは減速なし**。減速トレイルは `maxSlowTrails` で上限化。

## 凍結(frozen)
`frozenStarted`/`frozenEnded` イベントで、開始/解除に氷片を出し、凍結中は氷殻で覆う。
- **厚い氷で本体を隠さない・画面全体の白フラッシュは出さない**（被弾や他状態が読めなくなるのを避ける）。
- 氷殻 overlay は `maxFrozenVisuals` で上限化。凍結の停止（移動/攻撃/AI 停止）はロジック側の権威で、表示は追従するだけ。

## 凍結耐性(freeze_immunity)
凍結解除直後の「凍らない状態」をアイコンで示し、終了（`freezeImmunityEnded`）も分かる。耐性中は凍結演出を出さない。overlay は `maxImmunityVisuals` で上限化。

## 粉砕(shatter)
`shatterTriggered` イベントで、氷片放射＋衝撃輪＋「**SHATTER**」の文字を出す。
- **通常のダメージ数値と区別**できる見た目にする。
- 同時数/フレーム上限（`maxShatterEffectsPerFrame`・浮遊テキストは `maxStatusFloatingTextsPerFrame`）で抑制する。ロジック側の粉砕（ダメージ・再帰禁止・ボス除外）は不変。

## 炎上(burning)
火の魔女の炎上もアイコンで示し、氷術師の凍結と**同一敵で共存表示**できる（属性反応は未実装のまま）。`burningStarted` は `registerBurning` から通知され、炎上の索引・ダメージ・持続は不変。

## 状態アイコンの優先度と最大数
1エンティティに複数状態があるとき、`selectIcons(state, maxIcons)` が **`ICON_PRIORITY=['frozen','burning','freeze_immunity','chill_high']`** の順に `maxStatusIcons` 個（品質別 1/2/2/3）までを選ぶ。
アイコン対象・優先度は `data/balance.json` の `statusVisuals.iconStatuses`/`iconPriority`（frozen > burning > freeze_immunity > chill_high）に集約する。

## ボス氷砕ゲージ・FROST BREAK・脆弱点滅
`BossFrostbreakDisplay` の純関数 `bossFrostDisplayState(boss, sfx, jobElement, now)` が
`{ visible, gauge, threshold, ratio, breaks, cooldownRemain, vulnRemain, vulnActive, iceMultiplier }` を返す。
- **`visible` は `jobElement==='ice'` かつボス生存時のみ**（火の魔女・ボス不在では**空ゲージを出さない**）。
- HUD 氷砕バー（`HUD.updateBossFrost`）が 現在値/必要値/割合/break 回数/cooldown/氷砕脆弱の残秒 を表示し、脆弱中は点滅（`statusVisuals.vulnerability` の `blink`/`blinkPeriodMs`）。
- `frostbreakTriggered` で **FROST BREAK** のワールド文字＋ゲージ亀裂＋氷片（`statusVisuals.frostbreak` の `showText`/`textDurationMs`/`shardCount`・同時数は `maxFrostbreakEffects`）。
- ゲージ/break/脆弱の**値そのものは `StatusEffectManager` の権威**で、表示層は読むだけ。

## overlay 層が enemy.setTint を奪わない設計
`Enemy` の毎フレーム冷気/凍結 `setTint` を廃し、冷気段階色・氷殻を `StatusVisualManager` の overlay 層で描く。これにより状態演出が
**被弾フラッシュ/ダッシャー予告/エリート色の `setTint` を奪い合わない**。overlay は権威フィールド（`_chill`/`_chillSlow`/`_frozenUntil`/`_freezeImmuneUntil`・`ignited`・ボス氷砕）を
毎フレーム照合（`statusVisualUpdateInterval`=60ms でスロットル）して追従し、瞬間演出だけをイベント購読で1回出す。`entityVisualState(e, sfx)` が1体分の表示状態を純粋計算する。

## 品質別上限一覧と low 優先順位
`data/balance.json` の `skillCaps` に表示上限11種を品質別（`low ≤ medium ≤ high ≤ ultra`・正）で持つ。
| キー | 意味 |
|------|------|
| `maxStatusIcons`(1/2/2/3) | 1エンティティの状態アイコン最大数 |
| `maxChillVisuals` | 冷気オーバーレイ同時数 |
| `maxFrozenVisuals` | 氷殻オーバーレイ同時数 |
| `maxImmunityVisuals` | 凍結耐性オーバーレイ同時数 |
| `maxSlowTrails` | 減速トレイル同時数 |
| `maxShatterEffectsPerFrame` | 粉砕演出の毎フレーム上限 |
| `maxStatusFloatingTextsPerFrame` | 浮遊テキスト（SHATTER 等）の毎フレーム上限 |
| `maxFrostbreakEffects` | FROST BREAK 演出同時数 |
| `maxStatusDebugHistory` | F10 デバッグの履歴保持数 |
| `chillNearThresholdEffectCooldown`(1500・全品質) | 閾値直前の光の再発火間隔(ms) |
| `statusVisualUpdateInterval`(60・全品質) | overlay 照合更新の間隔(ms) |

- **低品質のドロップ優先度（残す順）**: frozen > ボス氷砕 > shatter > burning > immunity > chill > slow。`VisualBudget` が上限内で割り当てる。
- **装飾を削っても状態ロジック（凍結解除/免疫/索引 cleanup）は不変**。上限は生成数・演出のみを抑える。

## cleanup（残留させない）
overlay は見えなくなったエンティティの表示を掃除する: **死亡 / プール返却 / 状態クリア / Scene 終了 / pool 再利用 / 品質変更**。
これにより、倒した敵・再利用された敵に古いアイコンや氷殻が残らない。

## 保存しない表示状態
状態アイコン / 冷気・凍結・氷片 overlay / Tween / floating text / FROST BREAK 演出 / F10 選択対象 / visual history / カウンタ / イベント は**すべて保存しない**。
再開時は権威フィールド（冷気量/凍結残/耐性/氷砕ゲージ）から overlay を作り直す。状態RNG・ボス frostbreak 状態・氷スキル CD は M7-A/M7-B のまま保存され、`save_version` は v6 のまま（詳細は `docs/save-format.md`）。

## 状態イベント一覧（表示層が購読）
`StatusEffectManager.on(fn)` で購読する（判定・RNG は不変・イベントは非シリアライズ）:
`chillChanged` / `chillThresholdNear` / `frozenStarted` / `frozenEnded` / `freezeImmunityStarted` / `freezeImmunityEnded` /
`shatterTriggered` / `bossFrostGaugeChanged` / `frostbreakTriggered` / `frostbreakVulnerabilityStarted` / `frostbreakVulnerabilityEnded` / `burningStarted`。

## 既知の制約（実ブラウザ未確認）
Node で検証したのは**純ロジックのみ**（`chillTierOf`/`isNearThreshold`/`selectIcons`/優先度/`entityVisualState`/`VisualBudget`/`bossFrostDisplayState`/表示追加の非回帰）。
**実際の見た目（アイコン/氷殻/氷片/SHATTER/FROST BREAK）・当たり判定・100敵+2倍速 での HUD/敵弾/ボス予告 視認性・60FPS は本環境では未検証**。
実ブラウザ（GitHub Pages・`?debug=1` の F10）で確認する（`docs/test-guide.md` の M7-B.1 項目）。実行していない項目を「確認済み」と報告しない。
