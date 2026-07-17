# Reincarnation Flame Survivor

ブラウザで動作する見下ろし型2Dサバイバーゲーム（仮タイトル）。
火属性の魔女を操作し、大量の敵を自動攻撃で倒しながら生き延びる。

**インストール不要** — Chrome 系ブラウザで GitHub Pages の URL を開くだけで遊べます。
npm・ビルド処理・バックエンド・データベースは一切使いません。Phaser 3.90.0 を CDN から読み込み、
すべての素材（プレイヤー・敵・弾・エフェクト等）は JavaScript 上で動的生成しています。

> ⚠️ **開発状況**: 現在 **Milestone 6-D**（火の魔女ビルド拡張・第2波: 新 active 10種・新進化5種）まで実装済みです。
> 継続レーザー（灼熱光線）・地雷（火種地雷）・近接斬撃（炎月斬）・反射弾（跳炎弾）・分身（灰燼分身）・HP消費高火力（血炎契約）・
> 敵弾吸収（弾喰い炉）・画面端攻撃（四方炎獄）・拘束（熔火鎖）・ダッシュ強化（爆炎歩法）を追加し、既存の弾/爆発/召喚/設置と
> 戦い方を差別化しました。残響詠唱（M6-C）と分身複製の再帰は共通の castContext（origin/generation）で1世代に制限します。
> 火の魔女は active **25種**・進化 **13種**・passive 4種に。保存は localStorage＋（対応ブラウザで）フォルダ保存（M5-B）。

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
新パッシブは `data/passives.json` に modifier 付きで追加、新ジョブは `data/jobs.json` に追加するだけで抽選対象になります。

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
                      SolarAnnihilationArray / HellfireMineNetwork / InfernoBladeDomain / AshLegion / StarDevouringFurnace
  systems/            DataManager / SaveManager / profileSchema(v6移行) / ProgressionManager /
                      ReincarnationManager / EvolutionManager / SpawnManager / BattleManager /
                      PoolManager / SkillManager / EffectManager / SpatialGrid(空間グリッド・M5-A) /
                      SeededRandom・SkillDraftManager・PassiveManager（スキル抽選基盤・M6-A）/
                      JobProgressionManager・JobModifierManager（ジョブ育成・M6-C）/ CastPolicy（残響/複製の再帰防止・M6-D）
  storage/            StorageAdapter / BrowserStorageAdapter / FolderStorageAdapter / MemoryStorageAdapter /
                      SaveCoordinator / SaveValidator / SaveConflictResolver / SaveService / idb（保存レイヤー・M5-B）
  ui/                 HUD / PauseMenu
  utils/              math / time / validation
data/                 skills / enemies / bosses / permanent-upgrades / skill-mastery /
                      skill-evolutions / reincarnation / balance / job-progression（JSON）
docs/                 game-design / architecture / data-format / save-format / test-guide
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
.github/workflows/    static.yml（公開） / validate.yml（データ検証＋各テスト）
data/                 ... / jobs.json・passives.json・skill-config.json（M6-A）／skills.json・skill-evolutions.json 拡張・balance.skillCaps（M6-B）／
                      job-progression.json・balance.combatCaps.maxEchoPerFrame（M6-C）／skills/evolutions 各10・5追加・cast メタ・skillCaps 26種追加（M6-D）
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

> ヘッドレス環境の制約: `requestAnimationFrame` が断続的に間引かれ、また headless では
> ページが非フォーカス扱いになり自動一時停止が働くため、「リザルト→再挑戦後の実時間ループ継続」や
> 「時間依存のボス攻撃間隔」は自動計測が不安定でした。これらは判定ロジックを決定論的に別途検証済みですが、
> **体感を含む最終確認は GitHub Pages 公開 URL を実ブラウザで開いて行ってください。**
