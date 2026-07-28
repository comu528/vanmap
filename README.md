# Reincarnation Flame Survivor

ブラウザで動作する見下ろし型2Dサバイバーゲーム（仮タイトル）。
火属性の魔女を操作し、大量の敵を自動攻撃で倒しながら生き延びる。

**インストール不要** — Chrome 系ブラウザで GitHub Pages の URL を開くだけで遊べます。
npm・ビルド処理・バックエンド・データベースは一切使いません。Phaser 3.90.0 を CDN から読み込み、
すべての素材（プレイヤー・敵・弾・エフェクト等）は JavaScript 上で動的生成しています。

> ⚠️ **開発状況**: 現在 **Milestone 8-B.1**（passive 再計算バグ修正）まで実装済みです。
> M8-B.1 は**バグ修正のみ**の Milestone で、新しいスキル / passive / 進化 / ジョブ / 状態異常や、
> 火・氷・戦士のバランス変更は**一切ありません**。氷術師の passive **余寒残留 `lingering_cold`** を
> 通常のレベルアップで取得・強化しても、その周回中に効果が反映されないバグを直しました
> （`BattleScene._refreshStatusPassives()` が通常のレベルアップ経路から呼ばれていなかった）。
> `PassiveManager.version` を単一トリガーにして、変化したときだけ現在の passive 所持状態から
> 乗率を**完全再構築**します（毎フレームの再計算はしない・二重適用しない）。
> あわせて status passive の適用を**周回のジョブが氷術師のときだけ**に明示分離しました。
> **save_version は v6 のまま**・**data の変更なし**・**ドラフト候補列と RNG 消費は不変**。
> 実ブラウザでの確認は未実施。詳細は `docs/architecture.md`・`docs/status-effects.md`。
>
> （M8-B まで）**Milestone 8-B**（戦士 基盤実装）。
> M8-B では 3 人目のジョブ **戦士（warrior・physical）** を追加しました
> （**active5 / passive4 / 進化3 / Job Lv1〜100**）。戦士は**近接専用**で、
> 専用リソース **闘気（fury）** と **コンボ（combo）**、**強靱（被ダメージ軽減）**、**不屈（瀕死時の基礎能力）**、
> **通常敵へのノックバック**、**エリート/ボスへの体勢崩し**を持ちます。
> **火の魔女・氷術師の数値・挙動・候補列・状態異常・保存結果は 1 件も変更していません**
> （同 seed のドラフト候補列 300 seed と 48 スキルの実行トレースが SHA-256 で完全一致）。
> **新しい共通状態異常・属性反応・装備・敵/ボス/難易度は追加していません**。**save_version は v6 のまま**。
> 実ブラウザでの描画・体感は未検証。詳細は `docs/warrior-design.md`・`docs/jobs.md`・`docs/skill-catalog.md`。
>
> （M8-A まで）**Milestone 8-A**（火の魔女 完成監査）。
> M8-A は**監査 Milestone** で、新しい active / passive / 進化 / ジョブ / 状態異常 / 敵 / ボス / 難易度は**一切追加していません**。
> 火の魔女（**active30 / passive4 / 進化18 / Job Lv1〜100**）のカタログ整合性・プール分離・全18進化の到達可能性・
> production 抽選シミュレーション・死にコンテンツ・SkillAudit・保存/復元/決定論・炎上/DoT/爆発/共鳴・quality cap・
> cleanup・テレメトリを一括監査し、見つかった不具合を修正しました。**氷術師は数値・挙動・候補列・保存・カタログとも不変**。
> **save_version は v6 のまま**。実ブラウザでの描画・体感は未検証。詳細は
> `docs/flame-completion-audit.md`・`docs/flame-draft-analysis.md`・`docs/flame-balance-report.md`。
>
> （M7-D まで）**Milestone 7-D**（氷術師のスキル拡張・最終波＝**active30/passive4/進化18**）まで実装済みです。
> M7-D では氷術師へ新 active5種・新進化5種を追加し、**氷術師を active30種・進化18種・passive4種（追加なし）・Job Lv1〜100** へ拡張、
> **火の魔女（active30/進化18/passive4）と同規模のカタログに到達**しました（氷術師カタログ完成）。全て `data/skills.json`/`data/skill-evolutions.json` の
> Lv1〜8 データ駆動・冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路・独自凍結タイマーなし・**Math.random/Date.now 不使用（index ベース決定論・黄金角）**。
> 氷印/氷棺は **skill-local マーカー**（正式 status 非登録）。**火の魔女は不変**・**火氷の属性反応は未実装**・**新 passive/ジョブ/状態/限界突破なし**・**save_version は v6 のまま**。
> **次工程は氷術師カタログの完成監査**（抽選率/進化到達率/バランス分析）。実ブラウザでの描画・体感は未検証。詳細は `docs/jobs.md`・`docs/skills.md`・`docs/skill-catalog.md`。
>
> （M7-C まで）**Milestone 7-C**（氷術師のスキル拡張・第2波＝**active25/passive4/進化13**）を実装済みです。
> M7-C では氷術師へ新 active10種・新進化5種を追加し、**氷術師を active25種・進化13種・passive4種（追加なし）・Job Lv1〜100** へ拡張しました。
> 全て `data/skills.json`/`data/skill-evolutions.json` の Lv1〜8 データ駆動・冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路・
> 独自凍結タイマーなし・**Math.random/Date.now 不使用（index ベース決定論）**。**火の魔女（active30/進化18/passive4）は不変**・
> **火氷の属性反応は未実装**・**save_version は v6 のまま**。詳細は `docs/jobs.md`・`docs/skills.md`・`docs/skill-catalog.md`。
>
> ⚠️ （M7-B.1 まで）**Milestone 7-B.1**（氷術師のスキル拡張＋**状態異常の視認性・実動作検証**）を実装済みです。
> M7-A では 2人目のジョブ **氷術師（frost_mage・氷属性）** と、火の魔女の炎上を含む**汎用の状態異常フレームワーク**
> （`StatusEffectRegistry`/`StatusEffectManager`/`FreezeSystem`）・**冷気→凍結→粉砕**と**ボス氷砕（frostbreak）**を追加し、
> 拠点のジョブ育成タブを**ジョブ選択画面**へ拡張しました。火の魔女（active30/進化18/passive4）は不変で、火と氷の**属性反応は未実装**
> （炎上と冷気/凍結は独立共存）。**save_version は v6 のまま**（加算的追加）。詳細は `docs/jobs.md`・`docs/status-effects.md`。
>
> （M6-F まで: 通常プレイ整備・バランス検証基盤）火の魔女は M6-E で完成済み
> （active 30種・進化 18種・passive 4種・Job Lv1〜100）で、M6-F は**新スキルを追加せず通常プレイできる状態へ整える**整備・検証基盤です。
> スキルカタログの実データ検証（`SkillCatalog`）・抽選シミュレーター（`DraftBalanceAnalyzer`・本番の抽選ロジックを直接駆動）・
> 軽いシナジー補助（進化相手が候補へ出にくくならない・決定論不変・data で無効化可）・ローカル戦闘テレメトリ（外部送信なし・profile 加算・debugRun 分離）・
> 開発用バランス警告・通常プレイ検証モード（F8・profile 不変）を追加しました。**save_version は v6 のまま**（加算的追加）。
> 詳細は `docs/skill-catalog.md`・`docs/balance-testing.md`。
>
> （M6-E まで: 火の魔女ビルド完成・第3波: 新 active 5種・新進化5種＋全スキル監査）まで実装済みです。
> 火葬の墓標・炎脈走破・三角焔陣・灼熱共鳴・炉心暴走を追加し、**火の魔女を active 30種・進化 18種・passive 4種・Job Lv1〜100 に完成**させました。
> あわせて全 active30種・進化18種を監査し、主発動イベント（残響/分身の起点）・残響（echo）/分身（clone）ポリシー・
> ダメージタグ・Job Lv80発射数+1対象を各スキル定義へ明示し、`SkillAudit` で一元管理します。敵死亡イベント履歴（墓標）・
> 炎上中敵の索引（共鳴）を新設し、全敵走査を避けます。残響詠唱（M6-C）と分身複製の再帰は共通の castContext（origin/generation）で1世代に制限します。
> 保存は localStorage＋（対応ブラウザで）フォルダ保存（M5-B）。**save_version は v6 のまま**（加算的追加）。

---

## 実装状況

| Milestone | 内容 | 状態 |
|-----------|------|------|
| **M1** | 静的サイト / Pages / Phaser 起動 / タイトル / 仮ドット素材 / プレイヤー移動・ダッシュ / 敵出現 / 自動火球 / 敵撃破 / 経験値 / レベルアップ3択 | ✅ 実装済み |
| **M2** | 5種スキル＋強化（最大Lv8）/ ボス戦 / リザルト / EffectManager（判定と演出の分離）/ オート移動改善 / 一時停止メニュー / 途中再開（ブラウザ保存） | ✅ 実装済み |
| **M3** | 拠点（BaseScene）/ 残り火の正式実装 / 恒久強化10種 / 難易度選択・解放 / スキル熟練度（Lv1-20）/ profile拡張＋移行 | ✅ 実装済み |
| **M4** | スキル進化3種＋演出 / 熟練度と進化の連携 / 転生 / 転生通貨「魂炎」/ 魂炎強化10種 / 転生後のゲーム拡張 / 拠点タブ＋スクロール / profile v4 / 最小デバッグ機能 / 安全上限 | ✅ 実装済み |
| **M5-A** | 空間グリッド（Spatial Hash Grid）による近傍検索 / 総当たり O(敵×弾) の解消 / 性能計測パネル・グリッド可視化・グリッドON/OFF比較（`?debug=1`）/ オブジェクトプール整理 / 品質別エフェクト上限の集約 / 決定論的な非回帰テスト | ✅ 実装済み |
| **M5-B** | 保存アダプター分離 / フォルダ保存（File System Access API）＋ブラウザミラー / manifest＋安全書き込み / バックアップ（自動10・手動5世代）/ JSON エクスポート・インポート（検証・プロトタイプ汚染ガード）/ 競合検出・解決 / 複数タブ制御 / profile v5 移行 / データ管理画面 | ✅ 実装済み |
| **M6-A** | スキル抽選基盤: active/passive分類・所持枠(Active4→6→8/Passive4)・ジョブ別スキルプール(flame_witch)・レアリティ・重み付き**決定論**抽選・リロール/追放/スキップ・共通パッシブ4種(共通modifier集計)・既存5active移行・profile v6 | ✅ 実装済み |
| **M6-B** | 新 active 10種（炎槍/拡散火弾/追尾鬼火/連鎖炎/溶岩爆弾/火炎渦/火の精霊/不死鳥の羽/炎の障壁/起爆刻印）＋新進化5種。防御パイプライン・ダメージタグ・起爆刻印コンボ・召喚/設置・品質別性能上限・空間グリッド/プール対応・runtimeState 保存 | ✅ 実装済み |
| **M6-C** | ジョブ育成基盤: 戦闘レベルとジョブレベルの分離・火の魔女 Job Lv1-100（totalXp が正）・周回終了時 Job XP・レベル別 火火力/DoT/範囲 成長・到達報酬10種（Lv5〜100: 残響詠唱/爆炎/進化強化/抽選重み/発射数 等）・周回開始時レベル固定・拠点ジョブ育成タブ・リザルトXP表示・F5個別スキル検証・profile.jobProgress（save_version 6 維持・転生維持）・データ駆動（新ジョブ再利用可） | ✅ 実装済み |
| **M6-D** | 火の魔女ビルド拡張・第2波: 新 active 10種（灼熱光線/火種地雷/炎月斬/跳炎弾/灰燼分身/血炎契約/弾喰い炉/四方炎獄/熔火鎖/爆炎歩法）＋新進化5種。継続レーザー・罠・近接・反射・分身複製・HP消費・敵弾吸収・画面端波・拘束・ダッシュ強化。castContext による残響/複製の再帰1世代制限・HP消費API・敵弾吸収・ダッシュフック・品質別性能上限・F6検証。active25種/進化13種 | ✅ 実装済み |
| **M6-E** | 火の魔女ビルド完成・第3波: 新 active 5種（火葬の墓標/炎脈走破/三角焔陣/灼熱共鳴/炉心暴走）＋新進化5種（冥炎大霊廟/大地灼断/六芒煉獄陣/万象炎鳴/終末炉心）。**active 30種・進化 18種・passive 4種・Job Lv1〜100 に完成**。全 active30/進化18の監査（castMode・echo/clonePolicy・主発動イベント統一・ダメージタグ・Lv80発射数+1対象を明示、`SkillAudit` で一元管理）・敵死亡イベント履歴・炎上中敵の索引・共鳴段階/炉心熱量/オーバーヒート/終末状態・品質別 skillCaps 追加・F7検証。orbiting_flame/fire_spirit の主発動イベント監査修正（挙動不変） | ✅ 実装済み |
| **M6-F** | 通常プレイ整備・バランス検証基盤（**新スキルなし**）: スキルカタログの実データ検証（`SkillCatalog`・孤立/未登録/参照不整合0）・抽選シミュレーター（`DraftBalanceAnalyzer`・本番の SkillDraftManager+SeededRandom を直接駆動）・軽いシナジー補助（`skill-config.synergy`・レアリティ重みへ乗算・決定論不変・data で無効化可）・ローカル戦闘テレメトリ（`CombatTelemetry`/`RunBalanceSummary`・外部送信なし・profile 加算・debugRun 分離・低優先保存）・開発用バランス警告（`BalanceWarnings`/`data/balance-thresholds.json`）・通常プレイ検証モード（`BalancePlaytest`・**F8**・profile 不変・常に debugRun）・fallback 定数の JSON 移行。既存15＋新5＝**全20スイート通過**。**save_version v6 維持** | ✅ 実装済み |
| **M7-A** | 2人目のジョブ **氷術師（frost_mage）** ＋汎用状態異常/凍結基盤: 氷術師（active5/passive4/進化3・Job Lv1〜100）・拠点ジョブ育成タブを**ジョブ選択画面**へ拡張（`profile.selectedJobId`・進行中周回はジョブ変更不可）・**汎用状態異常フレームワーク**（`StatusEffectRegistry`/`StatusEffectManager`/`FreezeSystem`・`data/status-effects.json`）・**冷気(chill)→凍結(frozen)→粉砕(shatter)**・**ボス氷砕(frostbreak)**・凍結耐性/氷砕脆弱・炎上(burning)の汎用索引への移行（数値不変・`Enemy.ignite` 互換）・`JobModifierManager` を複数属性へ拡張（primaryElement 一致時のみ属性補正）・状態異常専用 SeededRandom（`active_run.statusRng`）・HUD 氷砕ゲージ・F9 状態デバッグ・氷統計テレメトリ。**火の魔女は不変**・**火氷の属性反応は未実装**・**save_version v6 維持**。詳細は `docs/jobs.md`・`docs/status-effects.md` | ✅ 実装済み |
| **M7-B.1** | **状態異常の視認性・実動作検証**（新スキル/データ数値なし）: 冷気の段階表示（0/低/中/高＋確定閾値90%の事前光り）・冷気減速の可視化・**frozen の氷殻＋開始/解除演出**・freeze_immunity 表示・**粉砕の氷片＋「SHATTER」文字**・炎上アイコン・頭上状態アイコン（優先度 frozen>burning>freeze_immunity>chill_high・最大数）を **`StatusVisualManager` のオーバーレイ層**で描画（`enemy.setTint` を状態ごとに奪わず被弾フラッシュ/ダッシャー予告を上書きしない）。**ボス氷砕ゲージ**を現在値/必要値・割合・break回数・cooldown・脆弱残秒まで明確化（`BossFrostbreakDisplay`）＋**FROST BREAK 演出**。状態ロジックと表示ロジックを分離し `StatusEffectManager` が状態イベント（chill/frozen/immunity/shatter/boss gauge/frostbreak/vuln）を通知（**判定・ダメージ・status RNG cursor は不変**）。`?debug=1` の **F10 状態デバッグパネル**（対象敵クリック選択・chill/slow/frozen/immunity 実数・freezeChance 内訳＋RNG roll＋hitGroup 上限・実動作カウンタ・ボス氷砕状態）。品質別の表示上限11種を追加（装飾を抑制しても状態ロジック・cleanup は不変）。**表示状態は保存しない・save_version v6 維持**。詳細は `docs/status-visuals.md`・`docs/status-debug.md` | ✅ 実装済み |
| **M7-B** | **氷術師のスキル拡張**: active を10種追加して**計15種**、進化を5種追加して**計8種**（passive は4種のまま）。新 active10種（氷柱斉射/氷晶環/凍結光線/雹嵐/氷結地雷/雪精霊/氷牢封印/雪崩奔流/氷鏡結界/氷河墜落）・新進化5種（天晶氷嵐/絶対零光/白魔大氷災/雪后氷霊陣/終末氷河奔流）。全て `data/skills.json` の Lv1〜8 データ駆動・冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路・独自凍結タイマーなし・**Math.random 不使用（決定論）**・castMode/mainCastEvent/echo/clonePolicy/lv80/runtimeState を宣言・品質別 skillCaps 追加。**Lv80発射数対象は新規で `icicle_volley` のみ・新進化5種は対象外**。全CD/周期/設置/防御/遅延型に必要な runtimeState を保存（`glacier_drop`=pendingImpact / `mirror_ice`=durability・再開の無料再発動/二重生成を防止）。**火の魔女30/18・氷術師既存5/3は非回帰・save_version v6 維持**。詳細は `docs/jobs.md`・`docs/skill-catalog.md` | ✅ 実装済み |
| **M7-C** | **氷術師のスキル拡張・第2波**: active を10種追加して**計25種**、進化を5種追加して**計13種**（passive は4種のまま）。新 active10種（霜輪飛刃/氷鎖連閃/氷晶開花/白霧氷界/極星氷弾/砕氷衝波/氷刻停止/氷晶屈折/冬冠結界/氷彗星群）・新進化5種（冥氷処刑輪/永劫氷鎖/世界氷晶樹/永久白霧/零刻世界）。全て Lv1〜8 データ駆動・冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路・独自タイマーなし・**Math.random/Date.now/performance.now 不使用（index ベース決定論・同点は _seq→x→y）**・castMode/echoPolicy/clonePolicy/lv80ProjectileTarget/procCoefficient/runtimeState を宣言・品質別 skillCaps 23種追加。**Lv80発射数対象は氷で計5種（frost_shard/glacial_lance/icicle_volley/rime_boomerang/polar_star）・新進化5種は対象外**。全CD/周期/設置/防御/遅延/barrage 型に必要な runtimeState を保存（再開時の無料再発動・二重生成を防止）。CombatTelemetry へスキル固有 extra を追加（外部送信なし）。F9 デバッグへ新 active10・新進化5 を追加。**火の魔女30/18・氷術師既存15/8は非回帰・save_version v6 維持**。実ブラウザ描画/体感は未検証。詳細は `docs/jobs.md`・`docs/skills.md`・`docs/skill-catalog.md` | ✅ 実装済み |
| **M7-D** | **氷術師のスキル拡張・最終波（カタログ完成）**: active を5種追加して**計30種**、進化を5種追加して**計18種**（passive は4種のまま）で、**火の魔女（active30/進化18/passive4）と同規模のカタログに到達**。新 active5種（氷槍豪雨 `glacial_spear_rain`/六花砲台 `snowflake_sentry`/氷山奔衝 `iceberg_ram`/絶対氷封 `absolute_ice_seal`/極光氷幕 `aurora_veil`）・新進化5種（天墜氷槍葬/六花氷衛軍/大陸氷河奔流/永劫封氷棺/極夜天光）。全て Lv1〜8 データ駆動・冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路・独自タイマーなし・**Math.random/Date.now/performance.now 不使用（index ベース決定論・黄金角 2.399963・同点は _seq→x→y）**。**Lv80発射数対象は氷で計6種**（既存5＋`glacial_spear_rain`・明示フラグ管理）。**氷印/氷棺は skill-local マーカー**（`StatusEffectRegistry` へ登録せず `Enemy._iceSeal`/`_iceHitCount` で pool 再利用クリア）。`bossGaugeMult`（absolute_ice_seal Lv別1.25→1.50/aurora_veil 1.15→1.35/eternal_sealed_coffin 2.0/polar_night_aurora 1.7/heavenfall 巨大槍1.4）は M7-C 修正済み共通経路でボス氷砕ゲージのみへ1回適用。品質別 skillCaps 19種追加・F9 デバッグへ新 active5・新進化5・自動テスト6種追加（**全51スイート通過**）。**火の魔女30/18・氷術師既存25/13は非回帰・新 passive/ジョブ/状態/属性反応/限界突破なし・save_version v6 維持**。**次工程は完成監査（抽選率/進化到達率/バランス分析）**。実ブラウザ描画/体感は未検証。詳細は `docs/jobs.md`・`docs/skills.md`・`docs/skill-catalog.md` | ✅ 実装済み |
| **M8-B** | **3 人目のジョブ「戦士（warrior・physical）」の基盤実装**: active5種（大薙ぎ `great_cleave`（初期）/ 盾撃 `shield_bash` / 旋風斬り `whirlwind_slash` / 突進斬り `charge_slash` / 地砕き `ground_slam`）・passive4種（剛力/重装/戦闘本能/血気）・進化3種（千刃乱舞/血戦旋風/不落の城壁）・Job Lv1〜100（到達報酬11段）。**すべて近接**（自分中心の円 or 前方 arc）で、画面を横断する斬撃波・弾を一切生成しない。戦士専用の **闘気（fury）**（近接命中/撃破/コンボ/軽減/被弾で獲得・1発動/1秒/解放中の3層上限・100 で自動的に**闘気解放**＝攻防バフ＋時間経過回復）と **コンボ**（ジョブ全体で1本・猶予後に減衰・閾値4段）、**強靱**（接敵/近接直後/突進/解放/不屈/スキル由来を合成し**上限70%でクランプ**＝永久無敵にならない）、**不屈**（瀕死で1回だけ発動する基礎能力・CD45秒・passive ではない）、**撃破回復**（passive「血気」取得時のみ・**毎秒上限つき**）、**体勢崩し**（通常敵＝ノックバック / エリート＝stagger＋免疫 / ボス＝**予告・突進も中断**して露出。氷砕とは別フィールド・別しきい値・崩すたびに ×1.25 で難化し ×3 で頭打ち）を実装。`WarriorCombatSystem`（Phaser 非依存・乱数なし）へ集約し、スキルは `scene.combat.meleeStrike()` 経由でのみ敵へ触る（全敵総当たり禁止・SpatialGrid 使用）。戦士 HUD（闘気/コンボ/不屈/ボス体勢）・戦士向けオート移動（密集へ接近）・F8 戦士分析・**F9 戦士検証パネル**（火/氷では従来どおり状態異常パネル）・スキル別＋周回テレメトリ（外部送信なし）・`active_run.warriorState` の保存/復元（**再読込で闘気/コンボ/不屈CD/ボス体勢を初期化して稼げない**）。品質別 skillCaps 13種追加（**未参照 cap 0**）・自動テスト17スイート追加（**全92スイート通過**）。**火の魔女・氷術師は数値/挙動/候補列/状態異常/保存とも完全に不変**（`tests/three-job-nonregression.mjs` がハッシュで保証）・**新 status/属性反応/装備/敵/ボス/難易度なし**・**save_version v6 維持**。実ブラウザ描画/体感は未検証。詳細は `docs/warrior-design.md`・`docs/jobs.md`・`docs/skill-catalog.md` | ✅ 実装済み |
| **M8-B.1** | **passive 再計算バグ修正**（新規コンテンツ・バランス変更なし）: 氷術師の passive **余寒残留 `lingering_cold`** を通常のレベルアップで取得・強化しても、その周回中に効果が反映されないバグを修正。原因は `BattleScene._refreshStatusPassives()` が**通常のレベルアップ経路（`applyCandidate`）から呼ばれていなかった**こと（呼ばれるのは周回開始時・途中再開時・F9 デバッグ操作の 3 か所だけだった）。`StatusEffectManager` へ **push 型**で渡す `chillDecayMult` / `iceStatusDurationMult` だけが取り残されており、pull 型で毎回読まれる `iceDamage`（氷晶増幅）/ `cooldown`（急速冷却）/ `area`（凍域拡張）は影響なし。修正は戦士（M8-B）の `_refreshWarriorMods()` と同じ形に揃え、**`PassiveManager.version` を単一トリガー**とする `_refreshStatusPassivesIfNeeded()` を追加。version が変わったときだけ**現在の passive 所持状態から乗率を完全再構築**する（現在値への加算をしないので何回呼んでも二重適用にならない・毎フレーム無条件の再計算もしない・`PassiveManager` インスタンス差し替え時も取りこぼさない）。発火経路は 周回開始/途中再開（force）/ レベルアップ確定（即時）/ メインループ（gate・`statusFx.update` の直前）/ F8 検証周回開始（force）/ F9（force）。あわせて **status passive の適用を「周回のジョブが氷術師のときだけ」へ明示分離**（火/戦士では常に恒等値。判定は周回開始時に固定した `jobId`＝`active_run.jobId` が正）。自動テスト6スイート追加（**全98スイート通過**）。**data 変更なし・火/氷/戦士のバランス変更なし・ドラフト候補列と status RNG 消費は完全に不変・save_version v6 維持**。実ブラウザ確認は未実施。詳細は `docs/architecture.md`・`docs/status-effects.md` | ✅ 実装済み |

### 遊びの流れ（M4）
タイトル →「はじめから / 拠点」→ **拠点**（恒久強化・難易度・熟練度・**転生**・**魂炎強化**）→「戦闘開始」→
5分サバイバル。周回中、条件を満たすとレベルアップ時に**スキル進化**候補（専用の金枠）が出現し、選ぶと専用演出とともに
上位スキルへ置き換わります。周回終了で残り火を獲得し拠点で再強化。**難易度3クリア** か **今周回で累計残り火5000** を
満たすと **転生** でき、**魂炎**を得てゲームルールを恒久拡張（候補4択・連鎖・敵密度・倍速・オートダッシュ 等）。
転生を重ねるほど規模が拡大していきます。

---

## 遊び方（操作方法）

### キーボード
| キー | 操作 |
|------|------|
| WASD / 矢印キー | 移動 |
| Space | ダッシュ（短時間無敵、2回まで、時間で回復） |
| Escape | 一時停止（メニューでエフェクト品質・ダメージ数字・画面揺れを変更 / 拠点へ戻る） |
| Q | オート移動 切り替え（危険回避・ジェム回収・端回避、手動入力優先） |
| 1〜3 | レベルアップ候補の選択（新規スキル取得 / 既存スキル強化） |
| Shift + F | 全画面表示切り替え |
| F1 | 最小デバッグ機能（`?debug=1` 時のみ。拠点/戦闘で開く） |
| F2 | 性能パネルの表示切替（`?debug=1` の戦闘のみ・M5-A） |
| F3 | 空間グリッド可視化の表示切替（`?debug=1` の戦闘のみ・M5-A） |
| 一時停止メニュー | エフェクト品質・ダメージ数字・画面揺れ・**倍速（魂炎で解放時）**・拠点へ |

### マウス
- タイトル / **拠点（恒久強化の購入・難易度選択・熟練度確認）** / 一時停止 / レベルアップ / リザルト の UI 操作
- レベルアップ候補・恒久強化の購入ボタンのクリック

> **操作に関する仮定**: 仕様では移動が「WASD」、オート移動切り替えが「A」でしたが、
> WASD の A（左移動）と衝突するため、**オート移動切り替えを Q キーと画面内ボタンに割り当てています**。
> 全画面は F11 がブラウザ標準機能のため、画面右上のボタンと Shift+F を用意しています。

---

## GitHub Pages で公開する（初回のみ・1回だけ）

このリポジトリには GitHub Actions によるデプロイ設定（`.github/workflows/static.yml`）が含まれています。
公開するには **リポジトリ管理者が一度だけ** 以下を行います。

1. GitHub リポジトリの **Settings** を開く
2. 左メニューの **Pages** を開く
3. **Source** を **GitHub Actions** に設定する
4. デプロイ対象ブランチへ push すると Actions（`static.yml`）が走る
5. Actions のデプロイ完了後、表示された公開 URL をブラウザで開く

> デプロイワークフローは `static.yml`（GitHub の Pages 画面から作成したもの）を使用します。対象ブランチを
> 変えたい場合は `static.yml` の `on.push.branches` を編集するか、`workflow_dispatch`（手動実行）を使ってください。
> ビルドは不要で、リポジトリのルート（`index.html` / `styles/` / `src/` / `data/` / `assets/`）を
> そのまま公開します。`.nojekyll` により Jekyll 処理を無効化しています。

### 相対パスについて
すべての参照は相対パス（`./src/...`, `./data/...`）です。`https://<user>.github.io/<repo>/` の
ようなリポジトリ名付き URL でも壊れません。ルート絶対パス（`/src/main.js` 等）は使用していません。

---

## Milestone 4 の要素（進化・転生・魂炎）

### スキル進化（周回中）
基礎スキルが最大Lv8 かつ 指定の補助スキルが必要レベル以上になると、レベルアップ時に**進化候補**（金枠・専用名）が出現します。
選ぶと専用演出（画面暗転→前後の名称→白フラッシュ→説明、クリック/Enterで再開）とともに上位スキルへ**枠を消費せず置換**されます。
一周で同じスキルは一度だけ進化。進化条件・効果・安全上限は `data/skill-evolutions.json` 管理（コードにハードコードしない）。
- **火球→業火弾幕**（要: 火球Lv8・周回する炎Lv4）: 扇状連射／撃破で追撃火球／連鎖爆発
- **火柱→煉獄噴火**（要: 火柱Lv8・隕石Lv4）: 密集地で連続噴火→大爆発／燃焼地帯／通常敵を引き寄せ（ボス除外）
- **燃える軌跡→永劫火界**（要: 燃える軌跡Lv8・周回する炎Lv4）: 常時炎領域／炎上感染／炎上敵の死亡で小爆発

### 熟練度と進化の連携（`data/skill-mastery.json`）
- Lv5: 進化候補の出現率アップ / Lv10: 対応基礎スキルをLv2から取得 / Lv15: 進化の補助スキル必要Lvを1軽減 / Lv20: 進化後スキルに小さな追加効果

### 転生（拠点「転生」タブ）
条件（いずれか、**今周回**の進捗で判定）: **難易度3クリア** または **今周回で累計残り火5000以上**（`data/reincarnation.json`）。
条件未達でもタブは表示（ロック＋進捗表示）。転生ボタン→**確認画面（キャンセル/最終確認の二段階）**。
- **リセット**: 所持残り火・恒久強化・選択難易度・解放難易度（開始難易度へ）・今周回のクリア進捗
- **維持**: 転生回数・魂炎・累計魂炎・魂炎強化・スキル熟練度累計・統計・過去最高難易度・設定
- 途中戦闘データは転生時に削除（`cycleNumber` により転生前の再開も不可）

### 魂炎（転生通貨）の計算
`floor( emberLogBase·log2(1+累計残り火/div) + 過去最高難易度·k + √ボス討伐·k + 転生回数·k + √熟練度合計·k )`。
平方根・対数で緩やかに増加。条件を満たした最初の転生は必ず1以上。同一転生の二重取得は `lastReincarnationId` で防止。

### 魂炎強化10種（拠点「魂炎強化」タブ・`data/reincarnation.json`）
選択肢拡張(4択) / 初期火力 / 初期スキルレベル / 連鎖拡張 / 敵密度拡張 / エフェクト限界突破 / 恒久強化上限 /
倍速モード(1.5x・2x) / オートダッシュ / 転生開始ボーナス。各: 現在Lv/最大Lv/現在→次効果/必要魂炎/前提/購入可否/最大表示。

### デバッグ確認（`?debug=1` のときだけ）
拠点・戦闘で F1（または画面内の小ボタン）を開くと最小限のテスト機能: 残り火/魂炎追加・難易度全解放・転生条件達成・
この周回を勝利・全スキル取得＆Lv8・火球の進化条件達成・レベルアップ候補表示・profile初期化・v3→v4移行テスト 等。
通常URL（`?debug=1` なし）では公開・表示されません。

---

## Milestone 5-A の要素（空間グリッド・性能）

進化スキル・敵密度拡張・倍速で敵/弾/AoE/感染処理が増えても処理落ちしにくくするため、
当たり判定の候補取得を**総当たり O(敵×弾)** から**空間グリッド（Spatial Hash Grid）**へ置き換えました。

- **仕組み**: `src/systems/SpatialGrid.js`（Phaser 非依存の純 JS）が敵と経験値ジェムをセル単位で管理します。
  セルサイズは `data/balance.json` の `spatialGrid.cellSize`（既定 **64px**）で調整できます。敵が別セルへ
  移動したときだけ所属を付け替える差分更新で、毎フレームの全消去はしません。
- **候補の絞り込みのみ**: グリッドは周辺セルの候補を返すだけで、最終的な当たり判定（円/距離）は従来どおり
  厳密に行います。「同じセルにいるだけ」で命中扱いにはしません。候補は出現順に整列するため、
  **旧総当たりと結果（命中・与ダメージ・貫通・連鎖・感染・撃破・統計・安全上限）が変わりません**。
- **移行した処理**: 火球の最寄り敵/弾の命中候補/爆発範囲/火柱/燃える軌跡/周回する炎/隕石の着弾と密集地点/
  業火弾幕の追撃・連鎖/煉獄噴火の引き寄せ/永劫火界の範囲・炎上感染先/敵死亡時の爆発/オート移動の危険敵/
  経験値ジェムの近傍。ボスは単一の大型対象のためグリッドに入れず個別に扱います（挙動同一）。
- **デバッグ（`?debug=1` のみ）**: F2 で性能パネル（FPS/フレーム時間/各オブジェクト数/プール使用状況/
  使用セル数/検索・候補・判定回数/**旧総当り比較 vs 空間比較と削減率**/安全上限で抑制した数）、F3 でグリッド可視化、
  F1 メニューで**空間グリッド ON/OFF**（旧方式との比較）を切り替えられます。初期状態は ON です。
- **オブジェクトプール**: 返却処理を共通化し、再利用時に skillId/hostile/tint/velocity/timer/炎上/グリッド登録などの
  残留を消してから使い回します。新規生成/再利用/返却の数を性能パネルに表示します。
- **既知の性能制約**: 極端負荷（最大敵数＋進化3種＋2倍速＋ultra）で 60FPS は保証しません。ただし JS エラーなし・
  停止しない・安全上限を超えない・一時停止/リザルト/拠点へ戻れる・セーブ破損なし、を満たす設計です。
  プレイヤー↔敵接触・ボス弾↔プレイヤーの判定は対象が少ないため従来方式のままです。

## Milestone 6-A の要素（スキル抽選基盤）

将来の大量スキル追加（約30種の魔法・進化分岐・複数ジョブ・転生継承・100種超でも破綻しない抽選）に耐える基盤です。
今回は**既存の攻撃スキル5種を新基盤へ移行**し、**動作確認用の共通パッシブ4種**のみ追加しました。

- **分類**: `active`（自動発動）/`passive`（補正）。進化後スキルは元の active と同じ枠。
- **所持枠**: 新規周回は Active4 / Passive4（初期火球も1枠）。魂炎強化「アクティブ枠拡張」で Active **4→6→8**。
  満枠時は未取得の新規を出さず、所持済みの強化・進化・（空きがあれば）passive は出す。進化は枠を消費しない。
- **ジョブ**: `data/jobs.json`（今回は `flame_witch` のみ）。共通パッシブは全ジョブで抽選対象。継承機能は拡張口のみ（未実装）。
- **レアリティ / 重み**: common/uncommon/rare/legendary。重みは `data/skill-config.json`（既定 100/55/20/5）。
- **決定論抽選**: `SkillDraftManager` + `SeededRandom`。Math.random を使わず、候補は `active_run.draftState` に保存。
  レベルアップ画面を開いた時点の候補を保存し、**リロードしても同じ候補**（引き直し不可）。リロール時のみ乱数を次へ進めます。
- **リロール/追放/スキップ**: 1周それぞれ初期1回。追放はその周回の通常候補から除外（所持スキルは消さない）、スキップは何も取らず戦闘へ。
- **パッシブ**: `PassiveManager` が modifier を共通集計（各スキルへハードコードしない）。魔力増幅(ダメージ)/高速詠唱(CD・下限あり)/
  焦熱拡張(範囲)/残火持続(持続)。適用順=基礎値→熟練度→パッシブ→恒久/魂炎。**パッシブ未取得なら M5-B 以前と同じ性能**。

### 次に魔法（active）を10種追加する手順
1. `data/skills.json` に新 active を追加（`levels` の戦闘数値＋メタ: `category:"active"`, `rarity`, `weight`, `jobs`,
   `isCommon`, `prerequisites`, `conflicts`, `unlockCondition`, `evolutionBranches`, `displayOrder`, `iconKey`, `enabled`）。
2. `data/jobs.json` の対象ジョブの `activeSkillPool` にIDを追加（全ジョブ共通にするなら `isCommon:true`）。
3. スキル挙動クラス `src/skills/<Name>Skill.js`（`SkillBase` 継承・`fire(ctx)` 実装）を追加し、`SkillManager` の `REGISTRY` に登録。
4. アイコンが必要なら `BootScene.makeSkillIcons()` に色を足す（正式画像は追加しない）。
5. `node tests/validate-data.mjs` と `node tests/skill-draft.mjs` を通す（抽選は自動で新スキルを扱う）。
   ※ 抽選・所持枠・レアリティ・決定論・リロール/追放/スキップは基盤側が処理するため、スキル追加時に抽選コードは触りません。
新パッシブは `data/passives.json` に modifier 付きで追加し、**そのパッシブを使うジョブの `jobs:["<jobId>"]` を明示して対象ジョブの `passiveSkillPool` にも登録**します
（`jobs` 未指定＝暗黙の全ジョブ共通にはしません。全ジョブ共通にする場合のみ `isCommon:true` または `jobs:["*"]` を明示）。新ジョブは `data/jobs.json` に追加するだけで抽選対象になります。
passive の抽選到達性は `passiveSkillPool`（正）で判定し、`SkillDraftManager`/`SkillCatalog`/シミュレーターは共通の `poolEligibility` を使います（M7-B 追加監査。`tests/passive-pool-audit.mjs` で検証）。

## Milestone 6-B の要素（火の魔女ビルド拡張）

M6-A の基盤（`SkillDraftManager`/`PassiveManager`/jobs.json/skills.json/skill-evolutions.json）を**現在の正**として使い、
抽選・所持枠・レアリティ・決定論を個別実装せずに新スキルを追加しました。新規周回の枠は 4 のまま（魂炎で 6→8）。

### 新 active 10種（すべて火の魔女専用・最大Lv8）
| スキル | 役割 | レアリティ | 進化 |
|---|---|---|---|
| 炎槍 flame_lance | 細く高速な貫通槍（1本1体1命中） | common | 千条炎槍 |
| 拡散火弾 scatter_flame | 扇状の複数弾（近接集中/遠距離拡散） | common | — |
| 追尾鬼火 homing_wisp | 漂ってから追尾・死亡時に再捕捉 | uncommon | 百鬼燎乱 |
| 連鎖炎 chain_flame | 命中後に近くの敵へ連鎖（visited共有） | rare | — |
| 溶岩爆弾 lava_bomb | 予告→遅延起爆＋短い燃焼地帯 | uncommon | 太陽核崩壊 |
| 火炎渦 flame_vortex | 設置DoT＋中心へ吸引（ボス弱め）＋終了時小爆発 | rare | 煉獄大火輪 |
| 火の精霊 fire_spirit | 追従召喚が自動射撃（精霊は無敵・攻撃対象外） | uncommon | — |
| 不死鳥の羽 phoenix_feather | 致死を一度防ぎ回復＋大爆発＋一時無敵（長CD） | legendary | — |
| 炎の障壁 flame_barrier | 一定間隔で障壁展開・軽減/無効化＋反撃（1被弾1回） | uncommon | — |
| 起爆刻印 detonation_mark | 刻印し火属性が規定回数命中で起爆（コンボ） | rare | 終焉連鎖 |

### 新進化5種（枠を消費せず基礎 active を置換・補助条件は消費しない）
- 千条炎槍（炎槍Lv8＋高速詠唱Lv4）: 多方向連射・連続命中で威力上昇・貫通後に分裂（世代上限）
- 百鬼燎乱（追尾鬼火Lv8＋火の精霊Lv4）: 大量鬼火＋防衛鬼火＋撃破分裂（上限）
- 太陽核崩壊（溶岩爆弾Lv8＋焦熱拡張Lv4）: 引き寄せ＋予告→巨大爆発＋大型溶岩地帯
- 煉獄大火輪（火炎渦Lv8＋燃える軌跡Lv4）: 移動する複数竜巻＋燃焼地帯＋感染＋終了時同時爆発
- 終焉連鎖（起爆刻印Lv8＋魔力増幅Lv4）: 連鎖起爆＋未刻印へ拡散＋一定連鎖で最終爆発（1連鎖1回）

進化の補助条件は**パッシブも指定可能**（`EvolutionManager.canEvolve` が active/passive 両方のレベルを解決）。

### 防御スキルのダメージ処理順（`Player.takeDamage`）
`1) 無敵確認 → 2) 炎の障壁で軽減/無効化（＋反撃1回） → 3) 通常HPダメージ → 4) 致死時のみ不死鳥判定`。
無敵中は多重被弾しない／反撃は1被弾1回／不死鳥は同じ被弾で複数回復活しない／リザルト確定後は復活しない。
不死鳥CD・障壁再使用は `active_run.skillRuntime` に保存し、再読み込みで不正回復しません。

### ダメージタグと起爆刻印
`dealDamage` に `element`/`isMarkDetonation` 等のタグを後方互換で付与。火属性攻撃（＝skillId 付きの非起爆ダメージ）が
刻印敵に命中すると刻印が進み、規定回数で起爆します。**起爆ダメージ自身は刻印を進めない**（`isMarkDetonation`）ため
無限再起爆しません。連鎖は `visited` 集合＋`maxChainDepth`／`maxSpread` で明示的に制限します。

### 性能上限（`data/balance.json` の `skillCaps`・品質別）
`maxHomingWisps/maxSplitWisps/maxFlameLances/maxSummons/maxSummonProjectiles/maxActiveVortices/maxMarks/
maxChainTargets/maxChainDepth/maxSimultaneousExplosions/maxEvolutionProjectiles/maxPhoenixEffects/maxBarrierEffects`
を品質別(low≤medium≤high≤ultra)で管理。上限到達時は見た目を減らし、攻撃判定・不死鳥復活・障壁・予告・刻印・ボス攻撃・
自機・敵は必ず維持します。分裂/連鎖/感染/起爆は再帰でも上限で必ず停止します。

### 空間グリッド・オブジェクトプール
新スキルの範囲/最寄り/密集検索は M5-A の空間グリッド経由（`combat.nearestEnemy(Except)/forEachEnemyInRadius/
densestPoint/enemiesInRadius`）。弾は既存 `projPool` を再利用（追尾/連鎖/分裂/タグを含め reset で全状態を初期化）。
召喚/設置/竜巻は各スキルが配列管理し、Scene終了・進化置換で `destroy` により確実に破棄します。

### 次にジョブレベルを追加する際の拡張点
`profile.jobProgress`（jobId→進捗）と `jobs.json` の `futureInheritanceSettings` が拡張口です。ジョブ経験値/レベルは
`completeRun` で jobProgress を更新し、`SkillDraftManager` の `extraAllowedIds`（継承枠）や `unlockCondition` を使って
解放スキルを制御できます（M6-B では未実装）。新スキル追加は「skills.json＋jobs.json＋挙動クラス＋REGISTRY登録」のみで、
抽選・枠・レアリティ・決定論コードは変更不要です。

## Milestone 6-C の要素（ジョブ育成）

各ジョブを長期育成する共通基盤を追加しました。今回は登録済みジョブ **火の魔女（flame_witch）** のみが対象で、
効果は **そのジョブを使用中の周回のみ** 有効です（他ジョブへ自動継承しない）。転生レガシーは複数ジョブ実装後に設計します。

### 戦闘レベル と ジョブレベル（明確に分離）
| | 戦闘レベル(battleLevel) | ジョブレベル(jobLevel) |
|---|---|---|
| 保存 | active_run（周回終了でリセット） | profile.jobProgress（恒久・転生でも維持） |
| 上昇 | 経験値ジェム(battleXp) | 周回終了時の Job XP(jobTotalXp) |
| 用途 | スキル候補の取得 | 火属性の恒久強化・到達報酬の解放 |
| 範囲 | 周回ごと Lv1〜 | 火の魔女は Lv1〜**100** |

`jobLevel` は保存せず **`jobTotalXp` を唯一の正** として算出します（現在Lv/次まで/進行度は表示時に計算）。

### ジョブ経験値と曲線（`data/job-progression.json`）
- 累計必要XP: `totalXpForLevel(L) = 25·(L-1)² + 75·(L-1)`（Lv1=0 / Lv2=100 / Lv10=2,700 / Lv50=63,700 / Lv100=252,450）。
- 周回終了時（勝敗両方・**戦闘中は付与せずリザルト確定時にまとめて付与**）:
  `base = 生存秒×1.2 + min(通常撃破,2000)×0.08 + エリート×4 + ボス×60 + 勝利ボーナス(勝200/敗0)`、その後 難易度倍率
  （1:1.00 / 2:1.25 / 3:1.55 / 4:1.90 / 5:2.30）を乗算して切り捨て。通常撃破は上限2000で頭打ち（撃破周回が無意味にならない緩やかさ）。
- **二重獲得防止**: `runId`（残り火と同じ resultId）と `awardedRunIds`（上限40件保持）で、再表示/戻る/保存失敗復帰でも二重獲得しません。
  付与と保存は M5-B の SaveCoordinator（`SaveManager.saveProfile`）経由。

### 火の魔女の基本成長（Lv1 は M6-B 以前と完全一致＝恒等）
- 炎属性ダメージ **+0.35%/Lv**（Lv100 で最大 +34.65%）… 火の全ダメージ（弾/召喚/DoT/爆発/刻印起爆/障壁反撃/不死鳥反撃）。
- 炎上・火属性DoT **+0.50%/Lv**（最大 +49.5%）… `tag:'dot'` の継続ダメージへ追加。
- 火属性範囲 **+0.10%/Lv**（最大 +9.9%）… 爆発/設置/渦/防御反撃/進化主要範囲（Projectile 当たり判定は巨大化しない）。
- 二重適用の意図: `final = base × 火 × (DoT) × (爆発) × (進化)` の**乗算合成**。fire+DoT は両方が掛かる意図的仕様。fire 以外の属性には一切適用しません。

### 到達レベル報酬（Lv に応じて自動有効化・claimed フラグを大量保存しない）
| Lv | 報酬 | 効果 |
|----|------|------|
| 5 | 火力基礎強化 | 火ダメージ +5% |
| 10 | 炎弾加速 | 火属性 projectile の投射速度 +10%（発射数/CD不変） |
| 20 | 高速詠唱の素養 | 火 active の CD −5%（既存パッシブ/恒久と共存・安全下限クランプ） |
| 30 | 選択の余地 | 周回開始時リロール +1（Lv30以上で基本2回） |
| 40 | 爆炎強化 | 火属性爆発ダメージ +15% / 爆発範囲 +10% |
| 50 | 残響詠唱 | 攻撃用火 active が **12回発動ごと**に直前の攻撃を1回追加発動（威力60%） |
| 60 | 進化魔法強化 | 進化スキルの全ダメージ +20% |
| 70 | 高位魔法適性 | 抽選で rare実効重み×1.15 / legendary×1.25（common/uncommon不変・**決定論維持**） |
| 80 | 炎弾増殖 | 火 active の発射数 +1（発射数を持つスキルのみ・召喚物数/分裂は不変・skillCaps内） |
| 90 | 炎帝の詠唱 | 火 active の CD を追加で −10%（Lv20と乗算合成 0.95×0.90・下限クランプ） |
| 100 | 完全残響 | 残響を **8回ごと・威力100%** へ強化 |

### 残響詠唱（共通発動イベント・各スキルに個別コードを足さない）
`SkillManager.recordCast`（主発動の共通シグナル）→ `BattleScene._onSkillCast` が起点。閾値到達で `skill.echoCast(ctx)`（既定は
`fire(ctx)` の再実行＝弾/設置/召喚などの**攻撃挙動を再発動**）を1回。対象は active・fire・攻撃目的・非防御・非反応。
対象外は passive／障壁展開／不死鳥致死／刻印二次起爆／DoT各tick／連鎖各対象／分裂弾／召喚物の通常射撃／残響発の攻撃。
追加発動はカウンターを進めず、残響から残響を発生させません（`_inEcho` ガード）。1フレーム上限 `balance.combatCaps.maxEchoPerFrame`（=4）、
一時停止中は `update` 停止によりカウンター/遅延も進みません。1/1.5/2倍でも発動回数ベースのため破綻しません。

### modifier 適用順（`docs/architecture.md`/`docs/game-design.md` に詳細）
1. JSON基礎値 → 2. 固定値/整数補正（発射数）→ 3. 同カテゴリ加算倍率（熟練度・パッシブ）→ 4. カテゴリ間の乗算倍率（ジョブレベル・到達報酬）
→ 5. 安全下限/上限（CD下限・skillCaps）→ 6. 品質別生成上限。**Lv1 かつ到達報酬なしで M6-B 以前と完全一致**。

### 周回開始時のジョブレベル固定（凍結）
`active_run` に `jobId/jobLevelAtStart/jobTotalXpAtStart/resolvedJobModifiers/jobProgressionVersion/jobRuntime(残響カウンター)`
を保存。周回中に profile 側レベルが変わっても進行中周回へ反映せず、途中再開でも凍結値を使います。Job XP はリザルト確定後に
profile へ加算し、**次の周回**から新レベルを適用します。

### 拠点「ジョブ育成」タブ / リザルト / デバッグ
- 拠点にタブ追加（ジョブ名・Lv・XPバー・累計XP・出撃/勝利・最高難易度・現在の基本補正・次の到達報酬・Lv5〜100一覧の解放/未解放）。
- リザルトに 今回獲得Job XP・難易度倍率・Lv変化・XPバー・**複数レベルアップ対応**・新規解放報酬・Lv100到達・二重獲得済みの安全表示。
- `?debug=1` の **F5** 個別スキル検証（単独化/Lv変更/単独進化/各補正の一時無効化/Job Lv 1〜100 一時適用/残響カウンター表示・強制/計算内訳）。
  一時設定はランタイムのみで profile を破壊・保存しません（F1〜F4 と競合しません）。

## Milestone 6-D の要素（火の魔女ビルド拡張・第2波）

既存の弾/爆発/召喚/設置（M6-B）と**戦い方が変わる**新 active 10種・新進化5種を追加しました。抽選/枠/レアリティ/決定論/
パッシブ/ジョブ補正（M6-A〜C）は共通経路をそのまま再利用し、スキルごとに再実装していません。**火の魔女は active 25種・進化 13種・passive 4種**。

### 新アクティブ10種
| スキル | レア | 役割（既存との差別化） |
|--------|------|------|
| 灼熱光線 scorching_ray | uncommon | 継続照射レーザー（追従・DoT・線分/矩形判定・Lv高で2本目） |
| 火種地雷 ember_minefield | common | 敵接近で起爆する罠（寿命自動起爆・同一地雷1回） |
| 炎月斬 flame_crescent | common | 扇状の近接薙ぎ払い（弾非使用・一振り同一敵1回・ボスKB無効） |
| 跳炎弾 ricochet_ember | common | 敵/画面端で反射する火弾（対象ごと再命中待機・反射上限） |
| 灰燼分身 ash_doppelganger | rare | 直近の複製可能な攻撃を低威力再現する分身 |
| 血炎契約 bloodfire_pact | rare | 現在HPを消費する大火力（最低HP1・安全HP以下不発） |
| 弾喰い炉 bullet_furnace | legendary | 敵弾を吸収→チャージ→炎弾幕放出（防御/反応） |
| 四方炎獄 four_sided_inferno | rare | 画面端1〜4方向から炎波（自機無傷・全方向は塞がない） |
| 熔火鎖 molten_chains | uncommon | 敵同士を鎖で接続しDoT＋緩い引き寄せ（ボス除く）・再接続 |
| 爆炎歩法 blazing_step | uncommon | ダッシュ強化（チャージ制・開始/終了爆発＋軌跡＋無敵延長） |

### 新進化5種（枠非消費・基礎active置換・補助条件は消費しない）
太陽滅却陣（灼熱光線Lv8＋高速詠唱Lv4）/ 地獄火連鎖陣（火種地雷Lv8＋起爆刻印Lv4）/ 炎帝剣域（炎月斬Lv8＋炎の障壁Lv4）/
灰燼軍勢（灰燼分身Lv8＋火の精霊Lv4）/ 星喰い炉（弾喰い炉Lv8＋不死鳥の羽Lv4）。跳炎弾/血炎契約/四方炎獄/熔火鎖/爆炎歩法は進化なし（evolutionBranches 空）。

### 残響・分身の再帰防止（`src/systems/CastPolicy.js`・純ロジック・`tests/cast-copy-safety.mjs`）
スキルメタ `echoPolicy`/`clonePolicy`（standard/custom/forbidden）＋`isDefensive`/`isReactive`/`usesResourceCost`/`canTriggerEcho`/`canBeCopiedByClone`。
`castContext`（origin=normal/echo/clone・generation・powerMultiplier・suppress）で **normal 由来のみ echo/clone を1世代**だけ発生させ、
echo→*・clone→* は一切発生しません（maxCopyGeneration=1）。custom は攻撃部分のみ複製（血炎契約=HP再消費なし・弾喰い炉=チャージ再消費なし）、
forbidden（灰燼分身・爆炎歩法）は複製・残響の対象外。**残響を分身がコピーしない/分身複製は残響を進めない/循環禁止**。

### HP消費・敵弾吸収・ダッシュ
- **血炎契約のHP消費**（`Player.spendHealthCost`）は通常被弾と分離。障壁/無敵/不死鳥で防がれず、敵ダメージ統計に含めず、最低HP1保証（死亡・不死鳥発動なし）。残響/分身ではHP再消費なし。
- **敵弾吸収**（`Projectile.absorbable/...` ＋ `BattleScene.absorbBossBullets`）。予告/ビーム/接触/吸収不能/消費済みは吸収しない・二重吸収防止・吸収は攻撃発動を記録しない・放出時のみ攻撃・完全無敵化しないよう吸収レート/チャージ上限。
- **爆炎歩法**は `Player` の `onDashStart/Move/End` 共通フックを使用。既存ダッシュ/autoDash/無敵を壊さず、未取得/チャージ0で挙動不変、1ダッシュ1チャージ、一時停止中はチャージせず、残響/分身でダッシュしません。

### 性能上限・プール・保存・デバッグ
`data/balance.json` の `skillCaps` に品質別上限を26種追加（ビーム/地雷/反射/分身/複製/吸収/炉/波/鎖/軌跡/鏡/剣/軍勢/核/世代 等）。
`combat.frameBudget(name, capName)` で毎フレーム予算を消費し、上限到達でも判定・主要挙動・ボス予告・敵弾・自機は維持します。大量生成物はプール/配列再利用し、Scene/進化置換/終了で残留させません。
runtimeState（各CD・チャージ・分身数・強化時間 等）は `active_run` に加算的保存（**save_version は v6 維持**）。再読込で CD 回復/チャージ複製/二重生成を悪用できません。
`?debug=1` の **F6** 新スキル検証（単独取得/Lv/単独進化/Job Lv一時適用/吸収可能・不能弾生成/複製強制/チャージ最大化/状態表示）。

## Milestone 6-E の要素（火の魔女ビルド完成・第3波）

M6-A〜M6-D の基盤（抽選/枠/パッシブ/進化・戦闘挙動・ジョブ育成・残響/分身の再帰防止）を**現在の正**として再利用し、火の魔女専用の
active を **さらに5種**・進化を **さらに5種** 追加しました。あわせて**全 active30種・進化18種を監査**し、残響（echo）/分身（clone）・
主発動イベント・ダメージタグ・Job Lv80発射数+1 の扱いを各スキル定義へ明示しました。結果として**火の魔女は active 30種・進化 18種・
passive 4種・Job Lv1〜100 に完成**します。**save_version は v6 のまま**（加算的追加）。

### 新アクティブ5種（すべて火の魔女専用・最大Lv8）
| スキル | 役割（既存との差別化） | レア | 進化 |
|--------|------|------|------|
| 火葬の墓標 funeral_pyres | 直近の敵死亡位置へ墓標→フューズ後に噴火（範囲＋燃焼地帯）。周囲の死亡で噴火が早まる（同一死亡は1墓標のみ消費） | uncommon | 冥炎大霊廟 |
| 炎脈走破 magma_vein | 蛇行しつつ敵群を横断する炎の亀裂（複数区間・区間が一定時間残り DoT・方向は決定論的） | common | 大地灼断 |
| 三角焔陣 tri_flame_array | 3支点で三角形を形成し内部の敵へ DoT・辺接触で追加ダメージ＋軽減速（ボスは減速無効）・高Lvで内部小爆発 | rare | 六芒煉獄陣 |
| 灼熱共鳴 scorching_resonance | 一定間隔で炎上中の敵数を数え共鳴段階（閾値 [0,5,15,30,60]）に応じたパルス攻撃。炎上が多いほど威力/範囲/追加爆発/炎上延長が強化 | rare | 万象炎鳴 |
| 炉心暴走 core_overdrive | 火炎弾を発射。発動ごとに熱量上昇→発動速度/発射数/威力/弾速が上昇、最大でオーバーヒート（短時間停止）→熱量リセットして再開。未発動時は冷却 | legendary | 終末炉心 |

### 新進化5種（枠を消費せず基礎 active を置換・補助条件スキルは消費しない）
- 冥炎大霊廟 necroflame_mausoleum（火葬の墓標Lv8＋不死鳥の羽Lv4）: 大型霊廟・周期小噴火・保存死亡数で追加火柱の大噴火。不死鳥の致死回避で大噴火待機を短縮（同一致死1回）。
- 大地灼断 world_scorching_rift（炎脈走破Lv8＋燃える軌跡Lv4）: 複数巨大亀裂が交差、交差点で追加噴火。移動経路へ短時間の小亀裂。
- 六芒煉獄陣 hexagram_inferno_array（三角焔陣Lv8＋火炎渦Lv4）: 二重三角形＝六芒星。外周/内部/中央核で異なる判定、中央核が敵吸引（ボス無効）、頂点→中央の炎波、終了時全体爆発。
- 万象炎鳴 universal_flame_resonance（灼熱共鳴Lv8＋連鎖炎Lv4）: 炎上敵を共鳴点として連鎖、一定数以上炎上で画面規模の共鳴爆発（1発動最大1回・visited集合で無限往復防止）。
- 終末炉心 doomsday_core（炉心暴走Lv8＋血炎契約Lv4）: 熱量で攻撃形態が段階変化（低/中/高/終末状態）、終末終了で強制オーバーヒート。低HPで終末威力がわずかに上昇（上限あり・HPは自動消費しない）。

### 全スキル監査（active30種・進化18種）
各スキル定義に `castMode`（periodic/cooldown/continuous/reactive/defensive/movement/resource）・`echoPolicy`/`clonePolicy`（standard/custom/forbidden）・
`canTriggerEcho`/`canBeCopiedByClone`・`echoDescription`/`cloneDescription`・`mainCastEvent`・`lv80ProjectileTarget` を明示しました。
- **主発動イベント（recordCast）は攻撃サイクル単位のみ**。DoTの各tick・連鎖の各対象・分裂弾・爆発の各対象・個別起爆・召喚の通常射撃・共鳴の各連鎖・オーバーヒート開始終了では recordCast しません。
- 監査で修正した既存挙動（**挙動そのものは不変**）: (a) 周回する炎 orbiting_flame は接触ごとの recordCast をやめ、主発動を一定間隔にスロットル（ダメージは接触ごとのまま）。echo/clone は炎輪パルスの再現（custom）。(b) 火の精霊 fire_spirit は召喚の一斉射撃サイクルを主発動として記録（個々の通常射撃では記録しない）。echo/clone は各精霊の追加一斉射撃（custom・精霊は増えない）。(c) 不死鳥の羽/炎の障壁は防御専用として echoPolicy/clonePolicy=forbidden を明示（従来も recordCast していないため挙動変更なし）。
- **Job Lv80「発射数+1」対象は独立弾を撃つ通常 active のみ**: fireball / flame_lance / scatter_flame / homing_wisp / ricochet_ember / core_overdrive。地雷/墓標/分身/光線/陣/亀裂/波/召喚/鎖/共鳴段階/熱量段階/進化は対象外。対象一覧は `src/systems/SkillAudit.js` の `appliesLv80ProjectileCount`（データ `lv80ProjectileTarget`）で一元管理します。

### 新規インフラ
- `src/systems/SkillAudit.js`（純ロジック・Node テスト可能）: castMode/echo/clone/Lv80/タグの対応状況を def から解決（castSummary/echoStatus/cloneStatus/appliesLv80ProjectileCount/primaryTags/castBadge）。
- **敵死亡イベント履歴**（BattleScene）: 墓標系所持時のみ記録（retain/releaseDeathEvents）。recentDeathEvents/consumeDeathEvent（同一死亡は1回だけ消費）。上限 maxDeathEventsTracked / maxDeathEventsPerFrame。既存の撃破統計/残り火/Job XP/経験値ジェムは不変。
- **炎上中敵の索引**（BattleScene._burningIndex）: Enemy.ignite で登録、消火/死亡/プール返却/Scene終了で解除。burningCount()/burningEnemies()（ボス炎上も1体）。combat.ignite(e,ms,gen) で付与＋登録。全敵走査を避ける軽量索引。Boss にも ignite/ignited を追加。
- combat API 追加: retainDeathEvents/releaseDeathEvents/recentDeathEvents/consumeDeathEvent/burningCount/burningEnemies/ignite/registerBurning/worldBounds。
- UI: LevelUpScene のスキルカードへ「残響○/◑/× 分身○/◑/× Lv80+ ·主要タグ」の短い記号行を追加（プレイヤーが残響/分身対応を判断できる）。
- デバッグ: `?debug=1` の **F7** パネル（既存 F1〜F6 と非競合）。新 active5種の単独取得/Lv切替・進化条件達成・死亡位置生成・炎上一括付与/解除・炉心熱量0/25/50/75/100%・オーバーヒート開始/解除・終末状態開始・echoPolicy/clonePolicy/Lv80対象の一覧・最後のダメージタグ・echo/clone origin/generation/倍率・性能上限到達数。デバッグ設定は profile へ保存しない。

### 品質別 skillCaps 追加（`data/balance.json`）
maxDeathEventsTracked / maxDeathEventsPerFrame / maxFuneralPyres / maxPyreEruptionsPerFrame / maxMagmaVeins / maxMagmaSegments / maxMagmaIntersections /
maxTriArrays / maxArrayTicksPerFrame / maxResonanceTargets / maxResonanceChains / maxResonanceExplosions / maxOverdriveProjectiles / maxOverdriveCastsPerFrame /
maxMausoleums / maxHexagramArrays / maxHexagramBeams / maxDoomsdayProjectiles / maxDoomsdayExplosions / maxBurningEnemyIndex / maxMainCastEventsPerFrame
（すべて low≤medium≤high≤ultra）。上限到達でも攻撃判定は消さず、装飾を先に削ります。

### 記録すべき設計判断
1. **Job Lv80発射数+1は独立弾の通常 active6種のみ・進化は対象外**（単一形態）。対象は `SkillAudit` で一元管理。
2. **orbiting_flame** は接触tick毎の recordCast を廃し主発動を一定間隔にスロットル（残響の一貫性のための監査修正・ダメージ量は不変）。**fire_spirit** は召喚一斉射撃サイクルを主発動として記録。
3. スキル説明の残響/分身対応は LevelUpScene のカード（短い記号）＋ F7 デバッグ一覧で確認できる（BaseScene 熟練度タブは従来どおり熟練度Lvのみ）。
4. 灼熱共鳴の段階は**炎上数のみで決まり area 補正で増えない**。墓標数/陣頂点数は projectileCount 補正で増えない。炉心熱量上昇率/最大熱量は damage/cooldown 補正で変動しない。
5. **save_version は v6 維持**（加算的 runtimeState）。

## Milestone 6-F の要素（通常プレイ整備・バランス検証基盤）

火の魔女は M6-E で完成済み（active30/進化18/passive4/Job Lv1〜100）です。M6-F は**新スキルを追加せず**、
「通常プレイできる状態へ整える」整備・検証基盤を追加しました。すべて Phaser 非依存の純ロジックで Node テスト可能、
**外部送信・自動調整は一切しません**（数値の最終判断は開発者）。詳細は `docs/skill-catalog.md`・`docs/balance-testing.md`。

### 新規モジュール（`src/systems/`）
- **`SkillCatalog.js`**: 実データから active30/passive4/進化18の正確なカタログを生成し、**孤立・未登録・参照不整合を検出**。
  会話や手書き一覧ではなく実データが唯一の正。SkillManager の `registeredSkillIds()`/`skillsWithRuntimeState()` を注入して
  「実装クラスの有無」「runtimeState 保存の有無」を判定。`SkillAudit`（M6-E）と同じソースを共有（UI 専用の別判定を作らない）。
- **`DraftBalanceAnalyzer.js`**: 決定論的な抽選シミュレーター。**本番の `SkillDraftManager` + `SeededRandom` を直接駆動**し
  （抽選ロジックを複製しない）、方針（random / evolution-first / build / diversity）・active枠4/6/8・候補3/4・Job Lv・シード多数で計測。
- **`CombatTelemetry.js`**: 1周回ぶんのローカル戦闘テレメトリ（外部送信なし）。スキル別 DPS/damageShare/echo/clone/上限到達/防御値、
  周回全体の FPS（平均/最低/p95）。**`RunBalanceSummary.js`** が `profile.balanceTelemetry` へ集計（通常周回は summaryBySkill＋recentRuns、
  debugRun は debugRuns へ**分離**・上限あり・**低優先保存**で失敗してもゲーム/保存を壊さない）。
- **`BalanceWarnings.js`**: 集計から**開発用の警告のみ**生成（自動調整しない）。しきい値は `data/balance-thresholds.json`。
  最低サンプル数未満は警告しない（1〜2周で断定しない）。
- **`BalancePlaytest.js`**: 「通常プレイ検証モード」の設定・オーバーライド解決（**profile を一切変更しない・常に debugRun**）。

### シナジー補助（`data/skill-config.json` の `synergy`）
active30種化で進化相手が候補へ極端に出にくくならないための**軽い抽選補助**。レアリティ重みへ**乗算**し（無視しない）、
**決定論は不変・data で無効化できる**。`synergy=null` は旧挙動と byte 一致。ON でも legendary を common 並みには増やさない。
進展のないドラフトが続くと pity（`draftsSinceProgress`）で少しずつ補助が増え、進化成立でリセットされる。

### F8 = Balance Playtest（`?debug=1` 限定・F1〜F7 と非競合）
seed/難易度/品質/速度/Job Lv/active枠4-6-8/候補3-4/リロール等/恒久強化(通常|全無効)/熟練度(通常|無効)/Job補正(通常|無効)/
戦闘時間(5分|1分|10分) を選び「検証開始」で**一時状態のみ初期化**（スキル自動付与なし・ゴッドモード無効）。
profile の通貨/進行/JobXP/クリアは不変。この周回は **debugRun** で通常統計へ記録しない。ResultScene に「Balance詳細」・
BaseScene に「カタログ」タブ（開発用）を追加。

### fallback 定数の JSON 移行
`doomsday_core`（heatAccelPct/doomFireMs/doomBlastMs）・`tri_flame_array`（edgeWidth）・`hexagram_inferno_array`（outerWidth/beamWidth）・
`orbiting_flame`（castPulseMs）・`fire_spirit`（summonPulseMs）を JSON へ移しました。コードに残る同名の `*_SAFE` 定数は
**バランス値ではなく**「JSON 欠落時の NaN/undefined 回避のための安全既定」で、通常は JSON 側が使われます（重複定義ではない）。

### カタログ結果（実データ由来）
進化あり active18 / 進化なし active12 / **複数進化分岐なし**（各 active 最大1進化）。レアリティ active: common8/uncommon10/rare9/legendary3、
passive: common2/uncommon2。役割: 攻撃25/防御3/移動1/資源1。Job Lv80発射数+1対象は6種（core_overdrive/fireball/flame_lance/
homing_wisp/ricochet_ember/scatter_flame・進化は対象外）。孤立/未登録/参照不整合 **0件**。一覧は `docs/skill-catalog.md`。

### 抽選シミュレーション結果（evolution-first・200 seed・levelUps=60）
active4枠: 進化平均1.27・≥1=86.0%・≥2=36.5% / active6枠: 2.165・98.0%・78.0% / active8枠: 2.215・97.5%・78.0%
（初期目標 4枠 ≥1:60%+/≥2:15%+、6枠 75%/35%、8枠 85%/50% をいずれも達成）。
**注記**: 短周回（levelUps≈24）では傾向が逆転（枠が少ないほど1基礎へ強化が集中し Lv8 到達が早い）。「枠が多いほど進化が増える」は
**長周回の上限効果**で、想定レベルアップ回数に依存する。最難関は `star_devouring_furnace`（全構成が伝説）。詳細は `docs/balance-testing.md`。

### 自動テスト（`validate.yml` に追加済み）
新規: `skill-catalog` / `draft-balance-simulation`（CI 軽量200seed・`HEAVY=1` で2500）/ `evolution-feasibility` /
`combat-telemetry` / `balance-playtest`。`validate-data` に synergy 設定・balance-thresholds・castMode 等の検証を追加。
既存15スイート＋新5＝**全20スイート通過**。

## Milestone 7-A の要素（2人目のジョブ・状態異常/凍結基盤）

2人目のジョブ **氷術師（frost_mage・氷属性）** と、火の魔女の炎上を含む**汎用の状態異常フレームワーク**を追加しました。
火の魔女（active30/進化18/passive4/Job Lv1〜100）は**不変**で、抽選/枠/パッシブ/進化/ジョブ育成（M6-A〜M6-F）の共通経路を
そのまま再利用しています。詳細は `docs/jobs.md`・`docs/status-effects.md`・`docs/data-format.md`。**save_version は v6 のまま**。

### 氷術師（frost_mage・active30/passive4/進化18・Job Lv1〜100）
> M7-D で氷術師カタログが完成し、**火の魔女（active30/進化18/passive4）と同規模**に到達しました（下記「Milestone 7-D の要素」）。
- active30（M7-A の5種＋M7-B の10種＋M7-C の10種＋M7-D の5種）:
  - M7-A: 氷晶弾 `frost_shard`（初期）/ 氷輪爆 `frost_nova` / 氷河槍 `glacial_lance` / 永久凍土 `permafrost_field` / 氷壁 `ice_wall`。
  - M7-B: 氷柱斉射 `icicle_volley`（連射 projectile・Lv80発射数対象）/ 氷晶環 `frost_orbit`（周回接触）/ 凍結光線 `freezing_ray`（ビーム・冷気ランプ）/ 雹嵐 `hailstorm`（周期範囲）/ 氷結地雷 `cryo_mine`（反応起爆・粉砕）/ 雪精霊 `frost_spirit`（召喚）/ 氷牢封印 `ice_prison`（制御・条件付き凍結）/ 雪崩奔流 `avalanche`（波・押し流し）/ 氷鏡結界 `mirror_ice`（防御・敵弾吸収＋反撃）/ 氷河墜落 `glacier_drop`（遅延大範囲・legendary）。
  - M7-C: 霜輪飛刃 `rime_boomerang`（往復 projectile・**Lv80発射数対象**・復路で凍結敵粉砕）/ 氷鎖連閃 `frost_chain`（瞬間連鎖・同一敵へ再連鎖しない）/ 氷晶開花 `crystal_bloom`（発芽→開花設置・開花時のみ粉砕）/ 白霧氷界 `snowblind_mist`（追従霧・粉砕なし）/ 極星氷弾 `polar_star`（大型星＋pulse＋爆発＋氷片・**Lv80発射数対象**・rare）/ 砕氷衝波 `icebreaker_wave`（扇状衝波・通常敵push/ボスpushなし・凍結敵粉砕）/ 氷刻停止 `frozen_clock`（全画面時計波・FreezeSystem 委譲・legendary）/ 氷晶屈折 `crystal_refraction`（屈折 projectile・最終屈折のみ粉砕・rare）/ 冬冠結界 `winter_halo`（氷冠吸収＋冷気反撃・defensive・uncommon）/ 氷彗星群 `comet_sleet`（予告＋barrage・大彗星のみ粉砕・rare）。
  - M7-D: 氷槍豪雨 `glacial_spear_rain`（予告付き氷槍を螺旋落下・大型槍のみ凍結敵粉砕・**Lv80発射数対象**・common・periodic）/ 六花砲台 `snowflake_sentry`（設置砲台が高chill敵優先射撃＋六花pulse・粉砕なし・uncommon・continuous）/ 氷山奔衝 `iceberg_ram`（滑走氷山が通常敵push・凍結敵粉砕・終端崩壊＋氷片・rare・cooldown）/ 絶対氷封 `absolute_ice_seal`（**氷印マーカー**を時間/氷命中数で起爆・凍結敵粉砕・`bossGaugeMult`・rare・reactive）/ 極光氷幕 `aurora_veil`（画面横断オーロラ帯＋burst のみ凍結敵粉砕・`bossGaugeMult`・legendary・continuous）。
- passive4（氷専用・**M7-B/M7-C/M7-D で追加なし**）: 氷晶増幅 `frost_amplification`（氷Dmg）/ 急速冷却 `rapid_freezing`（氷CD）/ 凍域拡張 `frozen_expansion`（範囲）/ 余寒残留 `lingering_cold`（氷状態持続＋冷気減衰緩和）。
- 進化18（M7-A の3種＋M7-B の5種＋M7-C の5種＋M7-D の5種）:
  - M7-A: ダイヤモンドブリザード（氷晶弾+急速冷却）/ 絶対零度領域（氷輪爆+凍域拡張）/ 天穿氷河槍（氷河槍+氷晶増幅）。
  - M7-B: 天晶氷嵐 `crystal_tempest`（氷柱斉射+氷晶増幅）/ 絶対零光 `absolute_zero_ray`（凍結光線+急速冷却）/ 白魔大氷災 `whiteout_cataclysm`（雹嵐+余寒残留）/ 雪后氷霊陣 `frost_queen_court`（雪精霊+凍域拡張）/ 終末氷河奔流 `world_end_avalanche`（雪崩奔流+氷壁）。
  - M7-C: 冥氷処刑輪 `rime_execution_wheel`（霜輪飛刃+氷晶増幅）/ 永劫氷鎖 `eternal_frost_chain`（氷鎖連閃+急速冷却）/ 世界氷晶樹 `crystal_world_tree`（氷晶開花+凍域拡張）/ 永久白霧 `everlasting_white_mist`（白霧氷界+余寒残留）/ 零刻世界 `zero_hour_world`（氷刻停止+氷牢封印）。
  - M7-D: 天墜氷槍葬 `heavenfall_glacier_lances`（氷槍豪雨+氷晶増幅）/ 六花氷衛軍 `crystal_sentinel_legion`（六花砲台+急速冷却）/ 大陸氷河奔流 `continental_glacier_rush`（氷山奔衝+凍域拡張）/ 永劫封氷棺 `eternal_sealed_coffin`（絶対氷封+氷牢封印・氷棺印を近傍未印へ**1世代だけ伝播**）/ 極夜天光 `polar_night_aurora`（極光氷幕+余寒残留）。**新規進化10種（M7-C/M7-D）は Job Lv80発射数増加の対象外**。
- 基本成長: 氷Dmg +0.35%/Lv・冷気 +0.30%/Lv・粉砕 +0.40%/Lv。到達報酬 Lv5〜100（凍結狩り/氷砕連鎖/氷弾増殖/絶対零度 等）。
- **Job Lv80「発射数+1」の対象は明示管理**（`lv80ProjectileTarget`）: 氷では `frost_shard`/`glacial_lance`/`icicle_volley`/`rime_boomerang`/`polar_star`/`glacial_spear_rain` の**計6種**のみ（projectile タグだけで自動適用しない）。

### ジョブ選択
拠点「ジョブ育成」タブが火の魔女／氷術師の**カード表示＋選択画面**へ拡張。`profile.selectedJobId`（既定 `flame_witch`）。
**進行中の周回があるときはジョブ変更不可**（次の新規周回から有効）。`active_run.jobId`/`jobElement` で周回ジョブを固定し、
ジョブごとにスキルプール／Job XP／Job Lv／統計を**完全分離**します。

### 汎用状態異常フレームワーク
`data/status-effects.json` に定義を集約し、`StatusEffectRegistry`（照会）/`StatusEffectManager`（適用・索引・更新・解除・専用RNG）/
`FreezeSystem`（凍結確率・冷気減速・ボス氷砕ゲージ・粉砕の純計算）で扱います。M7-A の正式状態: `burning`/`chill`/`frozen`/
`freeze_immunity`/`frostbreak_vulnerability`（将来 poison/bleed/shock 等を追加できる構造）。既存の炎上(burning)は**汎用索引へ移行**
（ダメージ/持続/灼熱共鳴/万象炎鳴/統計は不変・`Enemy.ignite` 互換経路を維持）。

- **冷気(chill)**: 氷攻撃で蓄積（通常 chillCap100/エリート130）。冷気量で減速（通常最大50%/エリート35%・ボスは減速なし）。自然減衰あり（余寒残留で緩和・下限あり）。
- **凍結(frozen)**: `freezeChance = baseFreezeChance×procCoefficient + (chill/chillCap)×chanceFromChill×procCoefficient`、対象別上限でクランプ、閾値で確定凍結。**状態異常専用 SeededRandom**（Math.random 不使用）。多段攻撃は低 procCoefficient＋判定回数上限で**永久凍結を防止**。凍結中は移動/攻撃/AI 停止・ダメージは受ける・粉砕対象。解除後に凍結耐性。
- **ボス氷砕(frostbreak)**: ボスは通常凍結せず、冷気をボス専用ゲージへ変換。閾値到達で硬直＋氷砕脆弱（氷被ダメージ×1.15）＋ゲージリセット（break 毎に次回閾値×1.30・上限×3.0）。HUD にボス氷砕ゲージ（氷術師のみ）。
- **粉砕(shatter)**: 凍結中の通常敵/エリートへ発生。frozen 解除＋追加氷ダメージ/範囲爆発（固定基礎+スキル威力+敵最大HP係数・上限つき）。**粉砕から粉砕を再帰しない・ボスは frostbreak で代替**。

### JobModifierManager（複数属性）
fire 専用から複数ジョブ・複数属性へ拡張。**primaryElement 一致時のみ属性ダメージ補正を適用**（火補正を氷へ／氷補正を火へ誤適用しない）。
火の魔女の補正は同値維持。氷ダメージには氷パッシブとボス氷砕脆弱（×1.15）を追加乗算し、火ダメージには適用しません。

### 保存・デバッグ・属性反応
`active_run` へ `jobId`/`jobElement`/`resolvedJobModifiers`/`statusRng`（状態RNGの cursor）/ボス frostbreak 状態（gauge/breaks/vulnRemain）を保存
（個々の敵の冷気/凍結/氷弾位置は保存せず再開時に安全再構築）。氷スキルは既存の `skillRuntime`（`serializeState`）へ**残りCD等だけ**を保存し、
**再読込での CD 全回復・即時再発動・凍土/氷壁/領域/地雷/召喚/落下の二重生成を防ぐ**（火の runtimeState には影響しない）。M7-B ではさらに
`glacier_drop` が落下待機（`pendingImpactLeft/X/Y`）を、`mirror_ice` が `cdLeft/activeLeft/durabilityLeft` を保存します。常設型（`frost_orbit`/`frost_spirit`/`frost_queen_court`）は
CDを持たず**再開時にレベル数へ一度だけ再構築**（二重生成しない）。`?debug=1` の **F9** で状態異常・氷術師検証パネル（M7-D で active30/進化18を切替・取得・進化条件達成・既存 F1〜F8 と非競合）。
**火と氷の属性反応は M7-A では未実装**（火で凍結解除/氷で消火/蒸発/融解なし・炎上と冷気/凍結は独立共存）。将来のため付与時に source element を保持します。

## Milestone 7-C の要素（氷術師のスキル拡張・第2波）

M7-A/M7-B の抽選/枠/パッシブ/進化・状態異常（`StatusEffectManager`/`FreezeSystem`）・`SkillAudit`・`skillCaps` を**現在の正**として再利用し、
氷術師専用の active を **10種**・進化を **5種** 追加しました。結果として**氷術師は active25種・進化13種・passive4種（追加なし）・Job Lv1〜100**。
火の魔女（active30/進化18）と氷術師の既存 active15・進化8 は非回帰です。**save_version は v6 のまま**。詳細は `docs/skills.md`・`docs/jobs.md`・`docs/skill-catalog.md`。

### 新アクティブ10種（すべて氷術師専用・`element:"ice"`・`isCommon:false`・maxLevel8・Lv1〜8 データ駆動）
| スキル | 役割（既存との差別化） | rarity | castMode | echo/clone | proc |
|--------|------|------|------|------|------|
| 霜輪飛刃 rime_boomerang | 敵密集方向へ氷輪を投げ、往路と復路で別 hit leg。復路は高威力で凍結敵を粉砕（**Lv80発射数対象**） | common | cooldown | standard | 往0.38/復0.50 |
| 氷鎖連閃 frost_chain | 高冷気を優先する瞬間連鎖・後半減衰・同一敵へ再連鎖しない | uncommon | cooldown | standard | 0.38 |
| 氷晶開花 crystal_bloom | 発芽→開花の設置。pulse は弱く、開花時のみ粉砕 | common | periodic | custom | pulse0.16/bloom0.75 |
| 白霧氷界 snowblind_mist | プレイヤー追従の霧・持続冷気・粉砕なし | uncommon | continuous | custom | 0.14 |
| 極星氷弾 polar_star | 大型星＋pulse＋着弾爆発＋氷片（**Lv80発射数対象**） | rare | cooldown | standard | pulse0.12/impact0.70/shard0.30 |
| 砕氷衝波 icebreaker_wave | 扇状衝波。通常敵 push・エリート軽減・ボス push なし・凍結敵粉砕 | common | cooldown | standard | 0.60 |
| 氷刻停止 frozen_clock | 全画面の時計波。直接凍結せず FreezeSystem へ委譲 | legendary | periodic | **forbidden** | 0.65 |
| 氷晶屈折 crystal_refraction | 屈折して跳ねる projectile・最終屈折のみ粉砕 | rare | cooldown | standard | 0.38 |
| 冬冠結界 winter_halo | 氷冠で被弾吸収＋近距離冷気反撃（複数耐久片・`mirror_ice` と差別化） | uncommon | defensive | **forbidden** | 反撃0.32 |
| 氷彗星群 comet_sleet | 予告→barrage。通常彗星と大彗星、大彗星のみ粉砕（黄金角 2.399963… で落下点決定） | rare | periodic | custom | 通常0.42/大0.80 |

### 新進化5種（`EvolvedSkillBase`・`element:"ice"`・単一形態・追加Lvなし・`lv80ProjectileTarget:false`）
- 冥氷処刑輪 rime_execution_wheel（霜輪飛刃Lv8＋氷晶増幅Lv4）: cooldown / standard。
- 永劫氷鎖 eternal_frost_chain（氷鎖連閃Lv8＋急速冷却Lv4）: cooldown / custom。
- 世界氷晶樹 crystal_world_tree（氷晶開花Lv8＋凍域拡張Lv4）: periodic / custom（樹の x/y/growLeft/pulseLeft/phase を保存）。
- 永久白霧 everlasting_white_mist（白霧氷界Lv8＋余寒残留Lv4）: continuous / custom。
- 零刻世界 zero_hour_world（氷刻停止Lv8＋氷牢封印Lv4）: periodic / **forbidden**。`ice_prison` は進化条件用の補助 active で置換しません。

### 決定論・状態表示との疎結合・保存
- 全新スキルは **index ベースの決定論**（`Math.random`/`Date.now`/`performance.now`/draft RNG 不使用）。扇角・連鎖順・bloom 地点・霧中心・星角・wave・屈折順・comet 落下（黄金角）・barrage 順まで決定論で、同点は entity `_seq` → x → y で安定決定します。
- 冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路（`dealDamage`/`damageArea` の `element:'ice'`＋`chillAmount`）を使い、M7-B.1 の `StatusVisualManager`/`BossFrostbreakDisplay`/`StatusDebugPanel`（F10）へ**自動反映**します。スキルクラスから状態表示を直接生成しません。ボスは通常 frozen にせず chill→氷砕ゲージへ自動変換し、`frozen_clock`/`zero_hour_world` の `bossGaugeMult` は**ボス氷砕ゲージ量のみへ1命中1回だけ適用**します（`applyIceHit` のボス分岐で chill→ゲージ変換に掛かるだけで、damage/chillAmount/procCoefficient や通常敵/エリート・炎には掛からず、二重加算もしません。ボス氷砕の cooldown/threshold/vulnerability 値は不変）。
- CD/設置/遅延/防御/barrage の runtimeState（`cdLeft`・芽/樹・霧中心・時計 wave・氷冠耐久・comet barrage 等）を `skillRuntime` へ保存し、再開時の無料再発動・二重生成・進化前後の同時稼働を防ぎます。飛行中 projectile・Graphics/Text/Tween・entity 参照・particle・overlay・F10 選択は保存しません。
- 品質別 `skillCaps` 23種を `data/balance.json` へ追加（装飾上限と damage event 上限を区別し、`winter_halo` の防御耐久は visual cap で減らさない）。CombatTelemetry へスキル固有 extra（`recordExtra`）を追加（共通 chill/freeze/shatter/frostbreak は二重カウントしない・外部送信なし）。`?debug=1` の **F9** で新 active10・新進化5 を付与/Lv切替/進化条件達成/即時進化でき、`debugRun` として通常 profile 統計/Job XP/残り火/魂炎へ影響しません。
- 自動テスト5種追加（`frost-skills-wave3`/`frost-evolutions-wave3`/`frost-policy-audit-wave3`/`frost-runtime-save-wave3`/`frost-determinism-wave3`）・`validate-data.mjs` へ M7-C ブロック・`validate.yml` へ5ステップ追加。**全44スイート通過・validate-data 0エラー0警告**。
- **実ブラウザ確認は未実施**（本環境は純ロジック＋graphics 対応の最小モックスモークのみ）。実描画・視認性・体感バランス・60FPS は未検証（「動作確認済み」とは記載しない）。

## Milestone 8-B の要素（3 人目のジョブ「戦士」）

3 人目のジョブ **戦士（`warrior`）** を追加しました。属性は **`physical`**（火 / 氷とは独立）。
**近接専用**で、画面を横断する斬撃波や弾は 1 つも撃ちません。

### 遊びの筋

1. 敵の密集へ**近づく**（オート移動も接近戦略に切り替わります）
2. 殴って**コンボ**を繋ぐ → 攻撃速度・範囲・火力が伸びる（閾値 10 / 25 / 50 / 100）
3. 殴られながら**闘気**を溜める（**軽減した分も、通った分も闘気になる**）
4. 闘気 100 で**闘気解放** — 攻撃・防御・回復が同時に立ち上がる（時間経過で HP が戻る）
5. エリートは**よろけさせ**、ボスは**体勢を崩して行動を中断**させ、露出中に叩く

### スキル

| 種別 | 内容 |
|------|------|
| active5 | 大薙ぎ `great_cleave`（初期・前方 arc の多段）/ 盾撃 `shield_bash`（押し返し＋軽減）/ 旋風斬り `whirlwind_slash`（全周・duration あり）/ 突進斬り `charge_slash`（接近＋軽減）/ 地砕き `ground_slam`（最大の体勢削り） |
| passive4 | 剛力 `brute_force` / 重装 `heavy_armor` / 戦闘本能 `combat_instinct` / 血気 `bloodlust` |
| 進化3 | 千刃乱舞（大薙ぎ+戦闘本能）/ 血戦旋風（旋風斬り+血気）/ 不落の城壁（盾撃+重装） |

### バランス上の歯止め

- 闘気は **1 発動あたり / 1 秒あたり / 解放中** の 3 層で上限（雑魚の数で無限に溜まらない）
- 被ダメージ軽減の合計は **70% でクランプ**（永久無敵にならない）
- 撃破回復は passive「血気」を取ったときだけ・**毎秒上限つき**（敵数比例の無限回復にならない）
- 不屈は **45 秒クールダウン**・周回開始直後は発動しない
- エリートの stagger 後には**免疫**（連続よろけでハメられない）
- ボスの体勢しきい値は**崩すたびに ×1.25 で上昇**（上限 ×3）

### 非回帰

**火の魔女・氷術師は数値・挙動・候補列・状態異常・保存結果とも 1 件も変更していません。**
`node tests/three-job-nonregression.mjs` が、同 seed のドラフト候補列（300 seed）・
48 スキルの実行トレース・保存キー一覧を **SHA-256 のハッシュ固定**で検証します。

設計意図と「避けた設計」は `docs/warrior-design.md`、
実ブラウザの確認手順は `docs/test-guide.md` の Milestone 8-B 節。

---

## Milestone 7-D の要素（氷術師のスキル拡張・最終波＝カタログ完成）

M7-A〜M7-C の抽選/枠/パッシブ/進化・状態異常（`StatusEffectManager`/`FreezeSystem`）・`SkillAudit`・`skillCaps`・M7-B.1 状態表示・M7-C 修正済み `bossGaugeMult` 共通経路を**現在の正**として再利用し、
氷術師専用の active を **5種**・進化を **5種** 追加しました。結果として**氷術師は active30種・進化18種・passive4種（追加なし）・Job Lv1〜100** となり、**火の魔女（active30/進化18/passive4）と同規模のカタログに到達**（氷術師カタログ完成）。
火の魔女（active30/進化18）と氷術師の既存 active25・進化13 は非回帰で、**新 passive/ジョブ/状態/属性反応/転生/限界突破なし・save_version は v6 のまま**。**次工程は氷術師カタログの完成監査**（抽選率/進化到達率/バランス分析）。詳細は `docs/skills.md`・`docs/jobs.md`・`docs/skill-catalog.md`。

### 新アクティブ5種（すべて氷術師専用・`element:"ice"`・`jobs:["frost_mage"]`・`isCommon:false`・maxLevel8・Lv1〜8 データ駆動）
| スキル | 役割（既存との差別化） | rarity | castMode | echo/clone | proc |
|--------|------|------|------|------|------|
| 氷槍豪雨 glacial_spear_rain | 予告付き氷槍を螺旋（黄金角）配置で連続落下。一定本数ごとの大型槍のみ凍結敵を粉砕（**Lv80発射数対象**） | common | periodic | echo=clone=custom | 通常0.42/大型0.80 |
| 六花砲台 snowflake_sentry | 設置砲台が非frozen 高chill 敵を優先射撃、一定射撃ごとに六花pulse。砲台弾は粉砕なし | uncommon | continuous | echo=clone=custom | 0.35/pulse0.18 |
| 氷山奔衝 iceberg_ram | 滑走氷山が通常敵を push（エリート軽減/ボス無効）、凍結中は最初の接触で粉砕、終端で崩壊＋氷片 | rare | cooldown | echo=standard・clone=custom | 接触0.55/崩壊0.75 |
| 絶対氷封 absolute_ice_seal | 高chill 対象へ**氷印（skill-local マーカー・正式 status ではない）**を刻み、markDuration 経過か氷属性命中数で起爆・凍結中を1回粉砕（`bossGaugeMult` Lv別1.25→1.50） | rare | reactive | echo=clone=**forbidden** | 起爆0.85 |
| 極光氷幕 aurora_veil | 画面横断オーロラ帯が tick でダメージ＋冷気、一定間隔の burst のみ凍結中を1回粉砕（`bossGaugeMult` Lv別1.15→1.35・帯は複数 query へ分割し毎frame 全敵走査しない） | legendary | continuous | echo=clone=**forbidden** | tick0.14/burst0.75 |

### 新進化5種（`EvolvedSkillBase`・`element:"ice"`・単一形態・追加Lvなし・`lv80ProjectileTarget:false`）
- 天墜氷槍葬 heavenfall_glacier_lances（氷槍豪雨Lv8＋氷晶増幅Lv4）: periodic / custom。複数 wave の大規模氷槍雨、巨大槍のみ強化粉砕＋`bossGaugeMult` 1.4。
- 六花氷衛軍 crystal_sentinel_legion（六花砲台Lv8＋急速冷却Lv4）: continuous / custom。陣形砲台＋砲台間の氷線（主命中で1回粉砕）。
- 大陸氷河奔流 continental_glacier_rush（氷山奔衝Lv8＋凍域拡張Lv4）: cooldown / custom。幅広氷河＋崩壊裂片（残留・粉砕なし）。
- 永劫封氷棺 eternal_sealed_coffin（絶対氷封Lv8＋氷牢封印Lv4）: reactive / **forbidden**。氷棺印＋起爆時に近傍の未印へ**副棺を最大1世代だけ伝播**（副棺は再伝播しない）・`bossGaugeMult` 2.0。`ice_prison` は補助 active で置換しません。
- 極夜天光 polar_night_aurora（極光氷幕Lv8＋余寒残留Lv4）: continuous / **forbidden**。帯＋burst＋一定回数ごとの極光柱・`bossGaugeMult` 1.7。

### 決定論・skill-local マーカー・状態表示との疎結合・保存
- 全新スキルは **index／黄金角（2.399963…）ベースの決定論**（`Math.random`/`Date.now`/`performance.now`/draft RNG 不使用）。同点は entity id/`_seq`→x→y／`instanceId`／wave index で安定決定します。status RNG は `FreezeSystem` のみが使用します。
- **氷印/氷棺は skill-local マーカー**です。`StatusEffectRegistry` へ登録せず、正式 status 表示へ重複追加しません（skill-local overlay のみ）。`Enemy` に `_iceSeal`（マーカー参照）と `_iceHitCount`（氷属性命中カウンタ）を追加し、`Enemy.reset` でクリアして pool 再利用の残留を防ぎます。命中数起爆は `dealDamage` の ice 分岐が `_iceHitCount` を1回加算し、マーカーが差分で判定します。マーカー復元方針: 通常敵は pool 再利用で再特定できないため**捨て**（無料起爆しない）、ボス（`scene.boss`）のみ再関連付け、CD（`markLeft`）は必ず復元します。
- 冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路を使い、M7-B.1 の `StatusVisualManager`/`BossFrostbreakDisplay`/`StatusDebugPanel`（F10）・状態カウンタへ**自動反映**します（重複実装しない）。氷印だけ最小限の skill-local overlay を描画します。`bossGaugeMult` は M7-C 修正済みの共通経路（`dealDamage`/`damageArea`→`opts.bossGaugeMult`（既定1）→`StatusEffectManager.applyIceHit` のボス分岐→`addBossGauge` 量へ1回だけ）を維持し、damage/chill/procCoefficient/通常敵/火には掛からず二重加算もしません（status RNG cursor・frostbreak の threshold/cooldown/vulnerability 値は不変）。氷印付与時は freeze roll しません。
- CD/barrage/砲台/氷山/marker/aurora の runtimeState を `skillRuntime` へ保存し、再開時の無料再発動・二重生成を防ぎます（飛行中 projectile・Graphics/Text/Tween・entity 参照・particle・overlay・F10 選択・表示状態は保存しません）。
- 品質別 `skillCaps` 19種を `data/balance.json` へ追加（装飾 cap と damage event cap を区別し、visual cap でマーカー/防御性能を減らさない）。CombatTelemetry へスキル固有 extra（`recordExtra`）を追加（共通 chill/freeze/shatter/frostbreak は二重カウントしない・外部送信なし）。`?debug=1` の **F9** で新 active5・新進化5 を付与/Lv切替/進化条件達成/即時進化でき、`debugRun` として通常 profile 統計/Job XP/残り火/魂炎へ影響しません。
- 自動テスト6種追加（`frost-skills-wave4`/`frost-evolutions-wave4`/`frost-policy-audit-wave4`/`frost-runtime-save-wave4`/`frost-determinism-wave4`/`frost-boss-gauge-wave4`）・`validate-data.mjs` へ M7-D ブロック・`validate.yml` へステップ追加。**全51スイート通過・validate-data 0エラー0警告**。
- **実ブラウザ確認は未実施**（本環境は純ロジック＋graphics 対応の最小モックスモークのみ）。実描画・視認性・体感バランス・60FPS は未検証（「動作確認済み」とは記載しない）。

## セーブについて（M5-B）

基本は **ブラウザの localStorage**（恒久データ profile / 設定 settings / 途中セーブ active_run）です。
戦闘中は 20秒ごと / レベルアップ・進化選択後 / 一時停止時 / タブ非表示時に active_run を自動保存し、
ページを閉じても「続きから」で再開できます（時間・HP・レベル・経験値・所持スキル・討伐数・シードを復元。
敵の個体位置は保存せず進行状況から再構築）。勝敗確定で active_run は削除されます。

**M5-B でフォルダ保存を追加**しました（タイトル/拠点の「データ管理」画面）。localStorage を同期のライブ
キャッシュとして維持したまま、対応ブラウザでは**ユーザーが選んだフォルダ**へ非同期でミラー保存します。
- **保存方式の優先順位**: フォルダ接続時は フォルダ保存 → ブラウザ内ミラー。未接続時は ブラウザ内保存 → 手動 JSON。
  フォルダ書き込みに失敗しても**ブラウザ内保存へフォールバック**し、ゲーム進行やリザルト確定は失敗しません。
- **フォルダ構成**: `ReincarnationFlameSurvivorData/`（`profile.json`/`active_run.json`/`settings.json`/`manifest.json`/`backups/`）。
  一時ファイル→検証→本ファイル→検証→manifest の順で**安全に書き込み**（原子的 rename が無い制約はバックアップ＋書込後検証で緩和）。
- **バックアップ**: 上書き前に退避（自動最大10・手動最大5世代、自動は最小5分間隔。設定は `data/balance.json` の `save`）。復元は確認付き・復元前に自動バックアップ。
- **JSON 入出力**: 一式/個別のエクスポート（Blob・外部送信なし）と、検証付きインポート（構文・版・型・負の通貨・
  不正レベル・存在しない難易度/スキル/進化・巨大ファイル・**`__proto__`等の危険キー**を拒否。移行処理を通して安全に取り込む）。適用前に現在/インポートを比較表示。
- **競合解決**: ブラウザ内とフォルダ内が食い違う場合に比較画面を出し、採用/両方エクスポート/読み取り専用開始をユーザーが選びます（自動決定なし）。
- **複数タブ**: `BroadcastChannel`＋書き込みロック＋writerId で上書き事故を軽減（後発タブは読み取り専用、引き継ぎ可能）。
- `window.showDirectoryPicker()` は**ユーザー操作からのみ**呼び、起動時に許可ダイアログは出しません。選択フォルダの専用サブフォルダ以外へは書き込みません。

> `save_version` を **5** に更新。旧版（v1〜v4）の profile は明示マッピングで移行し（残り火・強化・難易度解放・統計・
> 熟練度・転生系を引き継ぎ）、**移行前に旧データを別キー（`rfs_profile_backup_v4_*` 等）へ退避**します（即時削除しません）。
> active_run は v2 以降でスキーマ互換のため既存の途中セーブも再開でき、`cycleNumber` により転生をまたいだ再開だけを破棄します。

> **非対応ブラウザ**（File System Access API 非対応）や権限拒否時も、ブラウザ内保存と JSON 入出力でゲームは完全に動作します。

---

## デバッグモード

URL に `?debug=1` を付けると、検査用に各マネージャ（`window.RFS = { DataManager, SaveManager,
ProgressionManager, ... }`）と戦闘シーン（`window.RFS_BATTLE`）を公開します。戦闘中は
**F2 で性能パネル**・**F3 でグリッド可視化**・F1 メニューで**空間グリッド ON/OFF** を切り替えられ、
`window.RFS_BATTLE.spatialSelfCheck(300)` で空間グリッドと総当たりの一致・削減率をその場で確認できます（M5-A）。
保存系は `window.RFS.SaveService` を公開し、データ管理画面の ⚙debug から書込失敗の模擬・破損注入・競合生成・
v4生成→移行・バックアップ10世代生成などを試せます（M5-B）。通常利用時（`?debug=1` なし）は公開しません。

---

## ファイル構成

```
index.html            エントリ HTML（Phaser を CDN 固定で読み込み）
.nojekyll             GitHub Pages の Jekyll 無効化
styles/main.css       全体スタイル（ピクセル拡大時のぼやけ防止など）
src/
  main.js             起動・シーン登録・全画面ボタン（?debug=1 でマネージャを検査公開）
  config/             ゲーム設定・定数
  scenes/             Boot / Title / Base(拠点) / Battle / LevelUp / Evolution(進化演出) / Result /
                      DataManagement(データ管理・M5-B)
  entities/           Player / Enemy(炎上対応) / Boss / Projectile(貫通減衰) / ExperienceGem
  skills/             SkillBase / Fireball / FlamePillar / BurningTrail / OrbitingFlame / Meteor /
                      EvolvedSkillBase / InfernalBarrage / PurgatoryEruption / EternalPyre /
                      （M6-B）FlameLance / ScatterFlame / HomingWisp / ChainFlame / LavaBomb / FlameVortex /
                      FireSpirit / PhoenixFeather / FlameBarrier / DetonationMark ＋進化 ThousandFlameLances /
                      HundredWispParade / SolarCoreCollapse / InfernalVortexWheel / ApocalypseChain /
                      （M6-D）ScorchingRay / EmberMinefield / FlameCrescent / RicochetEmber / AshDoppelganger /
                      BloodfirePact / BulletFurnace / FourSidedInferno / MoltenChains / BlazingStep ＋進化
                      SolarAnnihilationArray / HellfireMineNetwork / InfernoBladeDomain / AshLegion / StarDevouringFurnace /
                      （M6-E）FuneralPyres / MagmaVein / TriFlameArray / ScorchingResonance / CoreOverdrive ＋進化
                      NecroflameMausoleum / WorldScorchingRift / HexagramInfernoArray / UniversalFlameResonance / DoomsdayCore
                      （M7-A・氷術師）FrostShard / FrostNova / GlacialLance / PermafrostField / IceWall ＋進化
                      DiamondBlizzard / AbsoluteZeroDomain / HeavenPiercingGlacier
                      （M7-B・氷術師）IcicleVolley / FrostOrbit / FreezingRay / Hailstorm / CryoMine / FrostSpirit /
                      IcePrison / Avalanche / MirrorIce / GlacierDrop ＋進化 CrystalTempest / AbsoluteZeroRay /
                      WhiteoutCataclysm / FrostQueenCourt / WorldEndAvalanche
                      （M7-C・氷術師）RimeBoomerang / FrostChain / CrystalBloom / SnowblindMist / PolarStar /
                      IcebreakerWave / FrozenClock / CrystalRefraction / WinterHalo / CometSleet ＋進化
                      RimeExecutionWheel / EternalFrostChain / CrystalWorldTree / EverlastingWhiteMist / ZeroHourWorld
  systems/            DataManager / SaveManager / profileSchema(v6移行) / ProgressionManager /
                      ReincarnationManager / EvolutionManager / SpawnManager / BattleManager /
                      PoolManager / SkillManager / EffectManager / SpatialGrid(空間グリッド・M5-A) /
                      SeededRandom・SkillDraftManager・PassiveManager（スキル抽選基盤・M6-A）/
                      JobProgressionManager・JobModifierManager（ジョブ育成・M6-C）/ CastPolicy（残響/複製の再帰防止・M6-D）/
                      SkillAudit（castMode/echo・clone/Lv80/タグの一元解決・M6-E）/
                      SkillCatalog・DraftBalanceAnalyzer・CombatTelemetry・RunBalanceSummary・BalanceWarnings・BalancePlaytest（バランス検証基盤・M6-F）/
                      StatusEffectRegistry・StatusEffectManager・FreezeSystem（汎用状態異常/冷気・凍結・粉砕・ボス氷砕・M7-A）/ JobModifierManager（複数属性へ拡張・M7-A）
  storage/            StorageAdapter / BrowserStorageAdapter / FolderStorageAdapter / MemoryStorageAdapter /
                      SaveCoordinator / SaveValidator / SaveConflictResolver / SaveService / idb（保存レイヤー・M5-B）
  ui/                 HUD / PauseMenu
  utils/              math / time / validation
data/                 skills / enemies / bosses / permanent-upgrades / skill-mastery /
                      skill-evolutions / reincarnation / balance / job-progression /
                      status-effects（汎用状態異常/冷気・凍結・ボス氷砕・粉砕・M7-A）（JSON）
docs/                 game-design / architecture / data-format / save-format / test-guide /
                      skill-catalog（火の魔女カタログ・M6-F）/ balance-testing（バランス検証基盤・M6-F）/
                      jobs（ジョブシステム・M7-A）/ status-effects（状態異常フレームワーク・M7-A）
tests/validate-data.mjs        Node標準のみのデータ検証
tests/spatial-nonregression.mjs 空間グリッドの決定論的非回帰＋負荷計測（Node標準のみ・M5-A）
tests/save-system.mjs          保存システムのテスト（移行/検証/キュー/バックアップ/競合・Node標準のみ・M5-B）
tests/skill-draft.mjs          スキル抽選のテスト（枠/決定論/リロール/追放/スキップ/進化/旧セーブ/パッシブ・Node標準のみ・M6-A）
tests/new-fire-skills.mjs      新 active 10種のデータ整合＋抽選＋上限（Node標準のみ・M6-B）
tests/new-evolutions.mjs       新進化5種のデータ整合＋進化条件（実ロジック）＋既存3進化の非回帰（Node標準のみ・M6-B）
tests/job-progression.mjs      ジョブXP曲線/レベル算出/周回報酬/二重獲得防止/保存移行（Node標準のみ・M6-C）
tests/job-modifiers.mjs        ジョブ補正の解決/ダメージタグ/到達報酬/残響詠唱/抽選重み決定論（Node標準のみ・M6-C）
tests/fire-skills-wave2.mjs    新 active 10種のデータ整合＋抽選＋cast メタ＋上限（Node標準のみ・M6-D）
tests/fire-evolutions-wave2.mjs 新進化5種のデータ整合＋進化条件＋既存8進化の非回帰（Node標準のみ・M6-D）
tests/cast-copy-safety.mjs     残響/分身複製の再帰防止（origin/generation 1世代停止）（Node標準のみ・M6-D）
tests/fire-skills-wave3.mjs    新 active 5種のデータ整合＋抽選＋cast メタ＋新skillCaps（Node標準のみ・M6-E）
tests/fire-evolutions-wave3.mjs 新進化5種のデータ整合＋進化条件＋既存13進化の非回帰（Node標準のみ・M6-E）
tests/skill-tag-audit.mjs      全 active30/進化18の castMode/echo・clone/Lv80/タグ監査（SkillAudit・Node標準のみ・M6-E）
tests/cast-event-audit.mjs     主発動イベントの統一（攻撃サイクル単位のみ recordCast）（Node標準のみ・M6-E）
tests/skill-catalog.mjs        カタログ整合（active30/passive4/進化18・孤立/未登録/参照不整合0）（Node標準のみ・M6-F）
tests/draft-balance-simulation.mjs 抽選シミュレーション（枠4/6/8の進化到達率・CI軽量200seed・HEAVY=1で2500）（Node標準のみ・M6-F）
tests/evolution-feasibility.mjs 全18レシピが4枠で成立可能・最小枠（Node標準のみ・M6-F）
tests/combat-telemetry.mjs     テレメトリ純ロジック（DPS/防御値/FPS集計/debugRun分離/上限）（Node標準のみ・M6-F）
tests/balance-playtest.mjs     検証モードのオーバーライド解決・profile 非変更・常に debugRun（Node標準のみ・M6-F）
tests/status-effects.mjs       状態異常定義の照会・索引・適用/更新/解除・炎上索引の互換（Node標準のみ・M7-A）
tests/freeze-system.mjs        冷気減速・凍結確率式・確定閾値・ボス氷砕ゲージ・粉砕ダメージ上限（Node標準のみ・M7-A）
tests/multi-job-selection.mjs  複数ジョブ選択・進行中周回でのジョブ固定・プール/XP/統計の分離（Node標準のみ・M7-A）
tests/frost-job-progression.mjs 氷術師のXP曲線/基本成長/到達報酬/複数属性補正（Node標準のみ・M7-A）
tests/frost-skills.mjs         氷 active5種のデータ整合・抽選出現・procCoefficient/chillAmount（Node標準のみ・M7-A）
tests/frost-evolutions.mjs     氷進化3種のデータ整合・進化条件・非回帰（Node標準のみ・M7-A）
tests/multi-job-draft.mjs      ジョブ別抽選プール（火スキルが氷術師候補に出ない等・決定論）（Node標準のみ・M7-A）
tests/status-save-nonregression.mjs 状態RNG/ボス氷砕/氷スキルの保存往復・v6 非回帰（Node標準のみ・M7-A）
tests/frost-skills-wave3.mjs   氷 新active10種のデータ整合＋抽選＋cast/proc メタ＋新skillCaps（Node標準のみ・M7-C）
tests/frost-evolutions-wave3.mjs 氷 新進化5種のデータ整合＋進化条件＋既存8進化の非回帰（Node標準のみ・M7-C）
tests/frost-policy-audit-wave3.mjs 新active/進化の echo/clone/lv80/castMode ポリシー監査（Node標準のみ・M7-C）
tests/frost-runtime-save-wave3.mjs 新スキルの runtimeState 保存往復・二重生成防止（Node標準のみ・M7-C）
tests/frost-determinism-wave3.mjs Math.random/Date.now 不使用＋同一状態で同一攻撃パターン（Node標準のみ・M7-C）
.github/workflows/    static.yml（公開） / validate.yml（データ検証＋各テスト・M7-A で状態異常/氷術師スイート追加）
data/                 ... / jobs.json・passives.json・skill-config.json（M6-A）／skills.json・skill-evolutions.json 拡張・balance.skillCaps（M6-B）／
                      job-progression.json・balance.combatCaps.maxEchoPerFrame（M6-C）／skills/evolutions 各10・5追加・cast メタ・skillCaps 26種追加（M6-D）／
                      skills/evolutions 各5追加・castMode/mainCastEvent/lv80ProjectileTarget メタ・balance.skillCaps 20種追加（M6-E）／
                      skill-config.synergy・balance-thresholds.json（新規）・fallback定数のJSON移行（M6-F）／
                      status-effects.json（新規・状態異常/冷気・凍結・ボス氷砕・粉砕）・jobs.json に frost_mage 追加・job-progression.json に frost_mage 追加・
                      skills/passives/skill-evolutions に氷 active5/passive4/進化3 追加・balance.skillCaps に状態異常/氷スキル上限追加（M7-A）
```

保存レイヤー（`src/storage/*`）とデータ管理画面（`DataManagementScene`）は M5-B で実装済みです。今後の候補は `TODO.md` を参照してください。

---

## ローカル確認について

このプロジェクトはインストール不要ですが、ローカルで開く場合は ES Modules のため
`file://` 直開きではなく簡易サーバー経由で開いてください（例: `python3 -m http.server`）。
公開後は GitHub Pages の URL をそのまま開けば OK です。

---

## 既知の問題・想定される不具合

- **当たり判定候補は空間グリッド化済み（M5-A）**: 近傍検索の候補取得を空間グリッドへ移行し、総当たり
  O(敵×弾) を解消しました。Node の非回帰テストで旧方式と結果一致・比較回数の大幅削減（局所検索で概ね 90%+）を
  確認しています。ただし極端負荷での 60FPS は保証しません（後述）。
- **フォルダ保存は対応ブラウザ限定**: File System Access API（Chromium 系・**HTTPS** 必須）が前提です。非対応ブラウザや
  権限拒否時は localStorage + JSON 入出力にフォールバックします（ゲームは完全に動作）。ブラウザ内保存のみだと
  ブラウザのデータ削除で消えるため、フォルダ保存または JSON エクスポートでの控えを推奨します。
- **原子的な差し替え不可**: ブラウザ API に原子的 rename が無いため、フォルダ保存はバックアップ＋書込後検証で
  破損リスクを下げますが、書き込み中の電源断等に対する完全な保証はありません（`docs/save-format.md`）。
- **複数タブは事故軽減のみ**: 厳密な排他制御はブラウザ API の制約で不可能です。後発タブは読み取り専用にして上書きを避けます。
- **新スキルの実挙動は未計測（M6-B）**: 追尾/連鎖/召喚/設置/刻印/防御などの戦闘ランタイムはヘッドレスで未検証です
  （純ロジック=データ/抽選/進化条件は Node で検証済み）。極端負荷（大量敵＋進化＋2倍速＋ultra）で 60FPS は保証しませんが、
  `skillCaps` と毎フレーム予算で分裂/連鎖/感染/起爆が上限で必ず停止し、攻撃判定・不死鳥・障壁・予告は維持される設計です。
- **設定は簡易版**: エフェクト品質・ダメージ数字・画面揺れの切替は一時停止メニューにあります。
  パーティクル数の個別スライダーや専用設定画面は M5 予定。
- **戦闘バランス**: M4 でも戦闘バランスの全面調整は行っていません（転生由来の倍率・上限のみ追加）。
  5分生存は難しめですが、恒久強化・転生・魂炎を重ねて徐々に到達しやすくなる設計です。
- **極端負荷の性能**: 進化スキルで弾・爆発・感染が増えるため、per-frame の安全上限（AoE数・追撃火球・
  死亡爆発連鎖・感染世代・パーティクル/ダメージ数字）と空間グリッドで暴走・処理落ちを抑えています。
  最大敵数＋進化3種＋2倍速＋ultra では 60FPS を保証しませんが、停止・破綻はしません。
- **倍速モード**: 物理/タイマー/Tween/ロジックを一括スケールしています。極端な高密度＋倍速では体感負荷が上がる場合があります。
- WebGL 非対応環境では Canvas にフォールバックします（描画は動作、負荷は上がる可能性）。

---

## 動作確認について

開発は GitHub 上で行われており、開発者のローカル PC やゲームエディタでの実プレイ確認はできません。
本リポジトリは **ヘッドレス Chromium（Playwright）による自動スモークテスト** で以下を確認しています:
タイトル→拠点→戦闘の遷移・仮素材生成・敵出現・自動攻撃・敵撃破・経験値・レベルアップ3択・
5種スキルの与ダメージ・ボス出現と各挙動・勝敗リザルト・リロード後の途中再開に加え、M3では
残り火の一度きり加算・恒久強化の購入と反映・難易度解放・熟練度の周回またぎ保持 に加え、M4では
3種の進化条件判定・進化での一度きり置換・進化後ダメージの基礎スキル熟練度への加算と evolutions 記録・
進化演出中の戦闘停止と演出後の再開（レベルアップ→進化選択→演出→再開の一連）・転生条件（未達/達成）・
転生でのリセット/維持項目・魂炎の一度きり加算と無限転生farmingの防止・魂炎強化の購入と次戦闘への反映
（4択化・初期スキルLv・倍速上限・オートダッシュ・基礎ダメージ倍率・恒久強化上限）・倍速の timeScale 整合・
永劫火界の炎上死亡爆発・業火弾幕の撃破追撃・転生をまたいだ active_run の破棄・v3→v4 移行・JSエラーなし・JSON検証成功
を確認しました（拠点の転生/魂炎タブは描画も確認）。

**Milestone 5-A の検証**: 空間グリッドは Phaser 非依存の純 JS のため、Node で決定論的に検証しています
（`node tests/spatial-nonregression.mjs`）。同一シード・同一配置で**空間グリッドと旧総当たりの候補集合＋走査順が
完全一致**すること（円/矩形/最寄り/密集カウント/死亡・削除・移動後）、フィルタ（エリート）・重複なし、
比較回数の削減率（局所検索で概ね 90%+）を確認しました。下流の判定（与ダメージ・貫通・連鎖・感染・撃破・
統計・安全上限）は両方式で同一コードを共有し変更していないため、候補一致により結果は不変です。
`node tests/validate-data.mjs` も成功します。**戦闘の実挙動・FPS・倍速時のすり抜け有無・性能パネル表示は
ヘッドレスでは未計測**のため、GitHub Pages の公開 URL を実ブラウザで開き（`?debug=1` で F2 性能パネル・
`window.RFS_BATTLE.spatialSelfCheck(300)`）体感を含めて最終確認してください。

**Milestone 5-B の検証**: 保存レイヤーはブラウザ非依存の部分（スキーマ移行 v1〜v5・checksum・エンベロープ検証・
インポート検証/プロトタイプ汚染ガード・保存キューの順序と最新のみ保存・バックアップ世代管理・復元・
フォールバック・競合検出/推奨・複数タブ判定・設定の安全取り込み）を `node tests/save-system.mjs`（42項目・
`MemoryStorageAdapter` 使用）で検証済みです。**File System Access API の実挙動（フォルダ接続・許可の永続化・
安全書き込み・実ファイル生成・複数タブ・容量不足時の挙動）はヘッドレスでは未検証**のため、GitHub Pages の
公開 URL を対応ブラウザ（Chrome/Edge 等・HTTPS）で開き、「データ管理」画面で接続→保存→再読込→
エクスポート/インポート→バックアップ→競合解決 を実機で確認してください。

**Milestone 6-A の検証**: スキル抽選基盤（`SkillDraftManager`/`SeededRandom`/`PassiveManager`）は Phaser 非依存の
純 JS のため、`node tests/skill-draft.mjs`（39項目・実データのカタログ使用）で検証済みです。所持枠(4/満杯時の挙動)・
決定論(同seed同状態で同一・serialize/restore で不変)・リロール/追放/スキップ・進化候補の最低1枠・最大Lv除外・
ジョブ外/前提未達/conflict/重複なし・4→6→8枠・旧セーブ超過時の新規禁止・パッシブ modifier(未取得=恒等/取得で反映)を確認。
`profile v5→v6 移行`は `node tests/save-system.mjs` で確認。**レベルアップUIの実描画・進化演出・実プレイでの体感・
パッシブ適用後の実数値はヘッドレスでは未計測**のため、GitHub Pages を実ブラウザで開いて最終確認してください（`docs/test-guide.md` の M6-A 項目）。

**Milestone 6-B の検証**: 新スキルのデータ整合・抽選出現・性能上限の品質順・進化条件（`EvolutionManager.canEvolve` の実ロジック・
パッシブ補助対応・既存3進化の非回帰）を `node tests/new-fire-skills.mjs`（142項目）・`node tests/new-evolutions.mjs`（70項目）で
検証済みです。**戦闘ランタイム（追尾/連鎖/召喚/設置/刻印起爆/防御パイプライン/分裂・感染・連鎖の上限/追尾のすり抜け有無/
不死鳥の致死回避/障壁と不死鳥の処理順/倍速時のタイマー/再読込での不正回復防止/Scene終了後の残留なし/仮アイコン表示）は
Phaser 依存のためヘッドレスでは未検証**です。GitHub Pages を実ブラウザ（`?debug=1` の F4 新スキルパネル）で開き、
`docs/test-guide.md` の M6-B 項目を手動確認してください（実行していない項目は「確認済み」と報告していません）。

**Milestone 6-C の検証**: ジョブ育成の純ロジック（`JobProgressionManager`/`JobModifierManager`）は Phaser 非依存のため
`node tests/job-progression.mjs`（52項目）・`node tests/job-modifiers.mjs`（44項目）で検証済みです。XP曲線（Lv1=0/Lv2=100/
Lv10=2700/Lv50=63700/Lv100=252450・単調増加・Lv100頭打ち・超過分保持・負数/NaN/Infinity拒否）・周回XP（難易度倍率・勝利ボーナス・
敗北でも獲得・通常撃破上限）・**同一 runId の二重獲得防止**・複数レベルアップと途中報酬解放・保存移行（旧profileへ空初期化・
totalXpから算出・プロトタイプ汚染除外）・**Lv1 恒等/Lv100 最大補正**・fire以外へ非適用・DoT/爆発/進化タグの正しい適用・
到達報酬の解放境界・残響カウンター（11回で不発/12回目発動・Lv100は8回目・カウンターリセット）・Lv70抽選重みの決定論を確認。
`profile v6 維持`・比較サマリのジョブ項目は `node tests/save-system.mjs`・`validate-data.mjs` で確認。**戦闘中の実挙動（ダメージ倍率の
実数・残響の攻撃再発動・弾速/発射数の見た目・リザルト演出・拠点ジョブタブ描画・F5パネル・倍速での残響・周回開始時レベル固定・
途中再開/転生後の維持）は Phaser 依存のためヘッドレスでは未検証**です。GitHub Pages を実ブラウザ（`?debug=1` の F5）で開き、
`docs/test-guide.md` の M6-C 項目を手動確認してください（実行していない項目は「確認済み」と報告していません）。

**Milestone 6-D の検証**: 新 active 10種・新進化5種のデータ整合・抽選出現・cast メタ（echoPolicy/clonePolicy）・性能上限の品質順、
進化条件（既存8進化の非回帰含む）、そして**残響/分身複製の再帰防止**（`CastPolicy` の origin/generation 1世代停止・
echo→*・clone→* が発生しない・maxCopyGeneration=1）を `node tests/fire-skills-wave2.mjs`（187項目）・
`node tests/fire-evolutions-wave2.mjs`（98項目）・`node tests/cast-copy-safety.mjs`（62項目）で検証済みです。**戦闘ランタイム
（光線の追従・地雷の感知/寿命起爆・近接判定・反射・分身の実複製・血炎のHP消費と不死鳥非発動・弾喰い炉の吸収と吸収不能弾の残存・
四方炎獄の画面端表示・鎖の接続/再接続・爆炎歩法の実ダッシュ・残響/分身の無限増殖しないこと・大量敵＋2倍速・品質別の視認性・
途中再開/戦闘後の残留なし・F6）は Phaser 依存のためヘッドレスでは未検証**です。GitHub Pages を実ブラウザ（`?debug=1` の F6）で開き、
`docs/test-guide.md` の M6-D 項目を手動確認してください（実行していない項目は「確認済み」と報告していません）。

**Milestone 6-E の検証**: 新 active 5種・新進化5種のデータ整合・抽選出現・cast メタ・新 skillCaps の品質順、進化条件（既存13進化の非回帰含む）、
**全 active30種・進化18種の監査**（`SkillAudit` による castMode/echoPolicy/clonePolicy/canTriggerEcho/canBeCopiedByClone/mainCastEvent/lv80ProjectileTarget の解決と整合）、
**主発動イベントの統一**（recordCast が攻撃サイクル単位のみ・DoTtick/連鎖/分裂/召喚通常射撃/共鳴連鎖/オーバーヒート開始終了では記録しない）、
共鳴閾値の昇順・炉心熱量段階・未知タグ検証を `node tests/fire-skills-wave3.mjs`・`node tests/fire-evolutions-wave3.mjs`・
`node tests/skill-tag-audit.mjs`・`node tests/cast-event-audit.mjs` で検証済みです（既存11スイートも維持し**全15スイートが通過**）。
**戦闘ランタイム（墓標の死亡位置生成と一度きり噴火・炎脈の蛇行・三角焔陣の内部判定・六芒煉獄陣の表示・炎上数に応じた共鳴変化・万象炎鳴の連鎖・
炉心暴走の加速/過熱/停止/再開・終末炉心の状態変化・echo/cloneで熱量が変わらないこと・Job Lv80が対象弾だけ増やすこと・敵死亡履歴/炎上索引の実挙動・
途中再開/戦闘後の残留なし・F7）は Phaser 依存のためヘッドレスでは未検証**です。GitHub Pages を実ブラウザ（`?debug=1` の F7）で開き、
`docs/test-guide.md` の M6-E 項目を手動確認してください（実行していない項目は「確認済み」と報告していません）。

**Milestone 6-F の検証**: バランス検証基盤（`SkillCatalog`/`DraftBalanceAnalyzer`/`CombatTelemetry`/`RunBalanceSummary`/
`BalanceWarnings`/`BalancePlaytest`）は Phaser 非依存の純ロジックのため、`node tests/skill-catalog.mjs`（カタログ整合・
孤立/未登録/参照不整合0）・`node tests/draft-balance-simulation.mjs`（本番の SkillDraftManager を直接駆動した抽選シミュレーション・
枠4/6/8の進化到達率・`HEAVY=1` で2500seed）・`node tests/evolution-feasibility.mjs`（全18レシピが4枠で成立可能）・
`node tests/combat-telemetry.mjs`（DPS/防御値/FPS集計/debugRun分離/上限）・`node tests/balance-playtest.mjs`
（検証モードの **profile 非変更**・常に debugRun）で検証済みです。`validate-data.mjs` に synergy 設定・`balance-thresholds.json`・
castMode 等の検証を追加し、**既存15スイート＋新5＝全20スイートが通過**します。**シナジー補助 `synergy=null` は旧挙動と byte 一致・
決定論を維持**することもテストで確認しています。**テレメトリの実収集値・FPS ヒストグラム・ResultScene の Balance詳細描画・
F8 パネル・BaseScene カタログタブの実挙動は Phaser 依存のためヘッドレスでは未計測**です。GitHub Pages を実ブラウザ
（`?debug=1` の F8）で開き、`docs/test-guide.md` の M6-F 項目を手動確認してください（実行していない項目は「確認済み」と報告していません）。

**Milestone 7-A の検証**: 状態異常/凍結基盤（`StatusEffectRegistry`/`StatusEffectManager`/`FreezeSystem`）と複数ジョブの
純ロジックは Phaser 非依存のため、`node tests/status-effects.mjs`（状態照会・索引・適用/更新/解除・炎上索引の互換）・
`node tests/freeze-system.mjs`（冷気減速・凍結確率式・確定閾値・ボス氷砕ゲージ成長/上限・粉砕ダメージ上限）・
`node tests/multi-job-selection.mjs`・`node tests/frost-job-progression.mjs`・`node tests/frost-skills.mjs`・
`node tests/frost-evolutions.mjs`・`node tests/multi-job-draft.mjs`・`node tests/status-save-nonregression.mjs` で検証済みです。
**凍結演出・氷弾/凍土/氷壁の実挙動・HUD 氷砕ゲージ・粉砕エフェクト・F9 パネル・ジョブ選択画面の描画・実プレイでの体感は
Phaser 依存のためヘッドレスでは未計測**です。GitHub Pages を実ブラウザ（`?debug=1` の F9）で開き、`docs/test-guide.md` の
M7-A 項目を手動確認してください（実行していない項目を「確認済み」と報告しません）。

> ヘッドレス環境の制約: `requestAnimationFrame` が断続的に間引かれ、また headless では
> ページが非フォーカス扱いになり自動一時停止が働くため、「リザルト→再挑戦後の実時間ループ継続」や
> 「時間依存のボス攻撃間隔」は自動計測が不安定でした。これらは判定ロジックを決定論的に別途検証済みですが、
> **体感を含む最終確認は GitHub Pages 公開 URL を実ブラウザで開いて行ってください。**

**Milestone 7-E の検証**: 氷術師の**完成監査**（新スキル追加なし）。カタログ整合性・プール分離・全18進化の到達可能性・
production の `SkillDraftManager`＋`SeededRandom` による抽選シミュレーション（**200 seed / 60 level-up / active枠4・6・8 /
5 戦略**）・死にコンテンツ・SkillAudit 完全監査・保存/復元/決定論・状態異常バランス・quality cap・cleanup・テレメトリを
`node tests/frost-completion-catalog.mjs` ほか**新規12スイート**で検証しました（`HEAVY=1` で 500 seed）。
他ジョブ混入・不正候補・重複候補・slot違反・不正進化・進化後の元active再提示は**すべて 0 件**、
提示0/取得0の active・passive・進化も **0 件**、到達不能な進化も **0 件**です。
監査で見つかった**死にパラメータ6件・状態異常経路の誤接続2件・`custom` echo/clone の未実装3件・未参照 quality cap 11件**を修正し、
`FrostBalanceWarnings`（FROST_* 30コード・ローカルのみ）を追加しました。**全63スイート通過・`validate-data` 0エラー0警告**、
`save_version` は v6 のままです。火の魔女の data・実装は 1 件も変更していません（同 seed 候補列も不変）。
**F8 のジョブ別分析パネル・F10 の直近イベント履歴の描画、実際の体感バランス・60FPS 維持は Phaser 依存のため
ヘッドレスでは未計測**です。GitHub Pages を実ブラウザ（`?debug=1` の F8/F9/F10）で開き、`docs/test-guide.md` の
M7-E 項目を手動確認してください（実行していない項目を「確認済み」と報告しません）。
詳細は `docs/frost-completion-audit.md` / `docs/frost-draft-analysis.md` / `docs/frost-balance-report.md`。


**Milestone 8-A の検証**: 火の魔女の**完成監査**（新スキル追加なし）。カタログ整合性・プール分離・全18進化の到達可能性・
production の `SkillDraftManager`＋`SeededRandom` による抽選シミュレーション（**200 seed / 60 level-up / active枠4・6・8 /
5 戦略**）・死にコンテンツ・SkillAudit 完全監査・保存/復元/決定論・炎上/DoT/爆発/共鳴・quality cap・cleanup・テレメトリを
`node tests/flame-completion-catalog.mjs` ほか**新規12スイート**で検証しました（`HEAVY=1` で 500 seed）。
他ジョブ混入・不正候補・重複候補・slot違反・不正進化・進化後の元active再提示は**すべて 0 件**、
提示0/取得0の active・passive・進化も **0 件**、到達不能な進化も **0 件**、`FLAME_*` 警告も **0 件**です。
進化到達率は M7-E と同じ 9 つの警告基準を**すべて満たします**（slot4 ≥1=90.0% / slot6 ≥1=96.0%・≥2=78.5% /
slot8 ≥1=97.0%・≥2=78.5%）。

監査で見つかった重大な不具合を修正しました。
**(1) 火の魔女スキル21種のクールダウンが保存されず、リロードで全回復して無料発動できていた**（氷術師で M7-A 後に
修正した不具合と同じクラス）→ 48 件すべてが runtimeState を保存するようにしました。
**(2) `eternal_pyre` / `solar_annihilation_array` が `recordCast` を一度も呼ばず、data で宣言した残響・分身が
一度も発生しなかった**（進化元では発生する＝進化で機能を失っていた）→ 主発動をスロットル記録し、
`echoPolicy`/`clonePolicy` を実装に合わせて `custom` へ修正しました。
**(3) 死にパラメータ21件・未参照 quality cap 5件**（M7-E から残っていた火由来分）→ 実装へ接続 13 件・削除 13 件で **0 件**に。
**(4) `eternal_pyre` の炎上感染が毎 tick 全敵を総当たりしていた** → 炎上索引経由へ修正（性能改善）。

`FlameBalanceWarnings`（FLAME_* 30コード・ローカルのみ）を追加しました。**全75スイート通過・`validate-data` 0エラー0警告**、
`save_version` は v6 のままです。氷術師の data・実装は 1 件も変更しておらず、
**同 seed のドラフト候補列（300 seed）と 48 スキルの実行トレースは変更前後で SHA-256 完全一致**です。
**実際の描画・当たり判定・体感バランス・60FPS 維持は Phaser 依存のためヘッドレスでは未計測**です。
GitHub Pages を実ブラウザ（`?debug=1` の F8/F9/F10）で開き、`docs/test-guide.md` の
**Milestone 8-A** 項目を手動確認してください（実行していない項目を「確認済み」と報告しません）。
詳細は `docs/flame-completion-audit.md` / `docs/flame-draft-analysis.md` / `docs/flame-balance-report.md`。
