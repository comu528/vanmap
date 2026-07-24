# ゲームデザイン

## コンセプト
仮タイトル **Reincarnation Flame Survivor**。見下ろし型2Dサバイバー。
主人公は火属性の魔女。通常攻撃は自動で、プレイヤーは移動とダッシュ（およびオート移動）を操作する。
大量の敵を倒して経験値を集め、レベルアップで3択からスキルを取得・強化。周回終了後に恒久強化を行い、
条件を満たすと転生する。転生を重ねるほど敵数・攻撃範囲・連鎖・エフェクト量が増え、
最終的に画面を埋め尽くすほど派手になる。仕事が入った瞬間に中断でき、閉じても途中から再開できる。

## ゲームループ
```
タイトル → 拠点（恒久強化/難易度選択/転生） → 戦闘（1周）
      戦闘: 移動/ダッシュ + 自動攻撃 → 経験値 → レベルアップ3択 → …
      5分でボス出現 → 撃破=勝利 / 死亡=敗北
戦闘終了 → リザルト（残り火獲得） → 拠点へ（恒久強化） → …
条件成立 → 転生（魂炎獲得・一部リセット）→ ルールが徐々に強化/破壊される
```

## 1周の構成（最初の難易度: 5分）
- 0〜1分: 少数の敵
- 1〜3分: 敵数増加
- 3〜5分: 高密度
- 5分: ボス出現 / 撃破で勝利
- 後から 10分 / 15分 / 無限モードへ拡張可能な構成

（M2 でボス出現〜勝利〜リザルトまで、M3 で難易度選択・解放と拠点での恒久強化まで実装済み。）

## プレイヤー
火の魔女。最大HP100、移動速度は調整可能、ダッシュ2回（短時間無敵・時間回復）、被弾後の短い無敵。
自動で最寄りの敵を攻撃し、経験値でレベルアップする。オート移動に切り替え可能（手動入力を優先）。

## 敵（M2 実装済み。エリート/骸骨突進含む）
- スライム: 低速・高HP・直進・ノックバックされやすい
- コウモリ: 高速・低HP・直進・小さい
- 骸骨: 中速・中HP・接近後に短い予告→突進
- 火炎耐性ゴーレム: 低速・非常に高HP・一定割合軽減・エリート

## ボス（M2 実装済み）
大型・高HP・専用の見た目・突進・円形弾・雑魚召喚。HP50%以下で激昂（攻撃頻度上昇）。

## スキル（M2 実装済み）と進化（M4 実装済み）
5種: 火球 / 火柱 / 燃える軌跡 / 周回する炎 / 隕石。各最大8レベル、変化内容は `data/skills.json`。
進化3種:
- 火球 → 業火弾幕（火球Lv8 かつ 周回する炎Lv4+）
- 火柱 → 煉獄噴火（火柱Lv8 かつ 隕石Lv4+）
- 燃える軌跡 → 永劫火界（燃える軌跡Lv8 かつ 周回する炎Lv4+）

## 周回（恒久強化・M3 実装済み）
周回終了時に「残り火（ember）」を獲得（生存時間/討伐/ボス/難易度/勝敗補正で算出、敗北時も少量）。
拠点で最大HP/基礎ダメージ/移動速度/経験値獲得/吸収範囲/ダッシュ回復/被弾無敵/残り火獲得/
オート性能/初期スキルLv を段階強化（費用は逓増）。効果は戦闘開始時にプレイヤーへ適用。

## 難易度（M3 実装済み）
5段階。難易度上昇で敵HP/攻撃力/速度/出現数/エリート率/ボスHP/残り火獲得倍率が変化。
前難易度をクリア（勝利）すると次が解放。未解放はロック表示で選択・開始不可。

## 転生（M4 実装済み）
条件（**今周回の進捗**で判定、farming防止）: 難易度3クリア または 今周回で累計残り火5000。
リセット: 所持残り火/恒久強化/選択難易度/解放難易度（開始へ）/今周回のクリア進捗。
維持: 転生回数/魂炎/累計魂炎/魂炎強化/熟練度累計/統計/過去最高難易度/設定。
転生通貨「魂炎（soulflame）」を log/√で緩やかに獲得（初回≥1、二重取得防止）。魂炎でルールを恒久拡張・破壊
（候補4択化、初期火力、初期スキルLv、連鎖拡張、敵密度、エフェクト上限、恒久上限、倍速、オートダッシュ、開始ボーナス）。
転生を重ねるほど規模が拡大する（数値だけでなくルールが緩やかに壊れていく成長）。

## スキル熟練度（M3 実装済み・M4 で進化連携）
各スキルの発動/命中/討伐/累計ダメージ/最高到達Lv/使用周回数/進化回数 を profile へ記録。
熟練度は Lv1-20（`data/skill-mastery.json` の曲線）。報酬は小さな基礎補正（ダメージ/CD/範囲/初期Lv）で、Lv1 は恒等。
進化連携: Lv5 進化候補率↑ / Lv10 初期Lv2 / Lv15 進化条件緩和 / Lv20 進化後追加効果。分岐スキルは将来拡張余地。

## 負荷対策の方針
エフェクト品質（低/中/高/極）とパーティクル/敵/弾の上限を設定で調整。
エフェクトを無効化してもダメージ結果は不変（ロジックと演出を分離）。

## 将来の拡張予定
周回長の拡張、追加コンテンツ（敵/ボス/スキル/進化）、実績、スキル分岐、モバイル操作対応。

## スキル抽選基盤（Milestone 6-A 実装済み）
将来の大量スキル追加（火の魔女へ約30種、進化分岐、複数ジョブ、転生継承、100種超でも破綻しない抽選）に耐える基盤を構築。
今回は既存 active5種を新基盤へ移行し、動作確認用の共通パッシブ4種のみ追加（新攻撃魔法・新ジョブ・新進化は未実装）。

- **分類**: すべての取得可能スキルは `active`（自動発動）/`passive`（補正）に分類。進化後スキルは対応する基礎 active と同じ枠を使う。
- **所持枠**: 新規周回は Active4 / Passive4（初期火球も1枠）。魂炎強化「アクティブ枠拡張」で Active **4→6→8**。
  満枠時は未取得の新規を候補に出さず、所持済みの強化・進化・（空きがあれば）passive は出す。進化は枠を消費しない。
- **ジョブ**: `data/jobs.json`。今回は `flame_witch` のみ。初期スキル=火球、active プール=既存5種、共通パッシブは全ジョブで抽選対象。
  将来のジョブ専用/条件付き共通/継承枠/育成特典を追加できる構造（継承機能自体は未実装＝拡張口のみ）。
- **レアリティ**: common/uncommon/rare/legendary。抽選重みは `data/skill-config.json`（既定 100/55/20/5）。
- **候補抽選**: `SkillDraftManager` が現在ジョブ・プール・所持枠・所持スキル・前提/排他/解放/レアリティ/重み/進化/追放を考慮し、
  重み付きで**決定論的**に抽選（`SeededRandom`・Math.random 不使用）。最大Lvの通常候補は除外し、進化可能なら最低1枠に進化候補。
  候補が不足すれば水増しせず、0件ならスキップ相当の救済で戦闘へ戻れる。
- **リロール/追放/スキップ**: 1周それぞれ初期1回。リロールは候補を引き直し、追放はその周回の通常候補から除外（所持スキルは消さない）、
  スキップは何も取らず戦闘へ戻る（XP は巻き戻さない）。状態は `active_run` に即保存し、再読込で表示中の候補が変わらない。
- **パッシブ効果**: `PassiveManager` が modifier を共通集計し、active スキルが最終値を取得（各スキルへハードコードしない）。
  適用順=基礎値→熟練度→パッシブ(area/duration は stats、damage は dealDamage、cooldown は update)→恒久/魂炎。
  4種: 魔力増幅(ダメージ)/高速詠唱(クールダウン・下限あり)/焦熱拡張(範囲)/残火持続(持続)。パッシブ未取得なら M5-B 以前と同じ性能。

## 火の魔女ビルド拡張（Milestone 6-B 実装済み）
M6-A の抽選基盤の上に、火の魔女専用のアクティブ10種と進化5種を追加（プールは 5→15種）。抽選/枠/レアリティ/決定論/
パッシブ適用は M6-A の共通経路をそのまま再利用し、スキルごとに再実装しない。データは `data/skills.json`・
`data/jobs.json`・`data/skill-evolutions.json`・`data/balance.json(skillCaps)` に集約する。

### 新アクティブ10種（すべて火の魔女専用・最大Lv8・毎レベル成長）
| スキル | レアリティ | 役割 |
|--------|-----------|------|
| 炎槍 flame_lance | common | 直線貫通の火の槍。発射数/貫通/速度が伸びる |
| 拡散火弾 scatter_flame | common | 扇状に複数弾。弾数/拡散角が伸びる |
| 追尾鬼火 homing_wisp | uncommon | 敵を追尾し撃破後に再ターゲット。追尾速度/再標的数が伸びる |
| 連鎖炎 chain_flame | rare | 命中から近隣へ連鎖（減衰）。連鎖数/範囲が伸びる |
| 溶岩爆弾 lava_bomb | uncommon | 予告後に着弾爆発＋燃焼(DoT)。爆発範囲/燃焼が伸びる |
| 火炎渦 flame_vortex | rare | 設置型の渦。持続ダメージ＋引き寄せ（ボスは弱く引く）。持続/範囲が伸びる |
| 火の精霊 fire_spirit | uncommon | 追従する精霊が自動で撃つ。精霊数/弾性能が伸びる（精霊は被弾せず重ならない） |
| 不死鳥の羽 phoenix_feather | legendary | 致死を1回だけ肩代わり（回復＋爆発＋一時無敵、長いCD） |
| 炎の障壁 flame_barrier | uncommon | 一定回数被弾を軽減し、被弾ごとに反撃（1被弾1反撃） |
| 起爆刻印 detonation_mark | rare | 敵に刻印。規定回数の火攻撃で起爆（範囲）。刻印自身の起爆では再刻印しない |

### 新進化5種（枠を消費せず基礎 active を置換・補助条件スキルは消費しない）
| 進化 | 条件 |
|------|------|
| 千条炎槍 thousand_flame_lances | 炎槍Lv8 ＋ 高速詠唱Lv4（パッシブ補助） |
| 百鬼燎乱 hundred_wisp_parade | 追尾鬼火Lv8 ＋ 火の精霊Lv4 |
| 太陽核崩壊 solar_core_collapse | 溶岩爆弾Lv8 ＋ 焦熱拡張Lv4（パッシブ補助） |
| 煉獄大火輪 infernal_vortex_wheel | 火炎渦Lv8 ＋ 燃える軌跡Lv4 |
| 終焉連鎖 apocalypse_chain | 起爆刻印Lv8 ＋ 魔力増幅Lv4（パッシブ補助） |

進化条件の補助スキルは active／passive のどちらも指定でき、判定は `EvolutionManager.canEvolve` に `levelOf`
（active→passive の順に所持Lvを解決）を渡して行う。進化しない新スキルの `evolutionBranches` は空（未実装進化を参照しない）。

### 防御処理の順序
被弾は **無敵判定 → 障壁（軽減＋反撃・被弾1回につき反撃1回）→ HP減算 → 致死なら不死鳥（1致死につき1回・回復＋一時無敵）** の順で処理する。
不死鳥はリザルト確定後には発動しない。CD は一時停止中に進まず、再読込で CD を巻き戻せない（`active_run.skillRuntime` に保存）。

### ダメージタグと安全上限
`dealDamage` はダメージにタグ（発生源スキルID/属性/爆発/起爆/連鎖世代 等）を付与し、後方互換を保つ。刻印は「火攻撃で殴られた」ことを検出でき、
起爆自身のダメージは刻印を再進行させない。連鎖/分裂/感染/起爆は visited 集合＋世代/拡散上限＋毎フレーム予算で無限再帰を防ぐ。
性能上限は `balance.json` の `skillCaps`（品質low/medium/high/ultra 別）に集約する。低品質でも命中判定・刻印・不死鳥・障壁・ボス予告・
プレイヤー/敵/敵弾は必ず視認できる（演出だけを削る）。

## 火の魔女ジョブ育成（Milestone 6-C 実装済み）
周回をまたいで維持される「ジョブレベル」を追加し、火の魔女を使い込むほど火属性ビルドが恒久的に強化される。効果は**火の魔女を使用中の周回のみ**有効で、
他ジョブ・未定義ジョブでは全て恒等（M6-B 以前と完全一致）。数値は `data/job-progression.json` に集約し、コードへ散在させない。

### 戦闘レベル と ジョブレベル（別体系）
| 体系 | 上昇源 | リセット | 用途 |
|------|--------|----------|------|
| 戦闘レベル `battleLevel` | 周回中の経験値ジェム（`battleXp`） | 周回終了でLv1へ | その周回のスキル候補取得（レベルアップ3択） |
| ジョブレベル `jobLevel` | 周回終了時に付与される `jobXp`（累計 `jobTotalXp`） | しない（周回・**転生をまたいで維持**） | ジョブ固有の恒久強化（火の魔女は最大 **Lv100**） |

- ジョブレベルは保存せず `profile.jobProgress[jobId].totalXp` を**唯一の正**として都度算出（現在レベル/次まで/進行度は表示時に計算）。単調増加・Lv100頭打ち・
  Lv100超過分の totalXp も保持。負数/NaN/Infinity は 0 扱いで拒否し、巨大 XP でもループは `levelCap` で停止してフリーズしない。

### XP曲線と周回XP
- **累計必要XP**: `totalXpForLevel(L) = quad*(L-1)^2 + lin*(L-1)`（`quad=25 / lin=75`）。係数は `job-progression.json` の `xpCurve` に分離。
  例: Lv1=0, Lv2=100, Lv10=2700, Lv50=63700, Lv100=252450。
- **周回終了時のジョブXP**（リザルト確定時にまとめて付与・戦闘中は付与しない・勝敗両方で獲得）:
  `baseJobXp = survivalSec*1.2 + min(normalKills,2000)*0.08 + eliteKills*4 + bossKills*60 + victoryBonus(勝利200/敗北0)`。
  その後 難易度倍率（1:1.0 / 2:1.25 / 3:1.55 / 4:1.90 / 5:2.30）を乗じて `floor`。通常敵撃破は上限2000で頭打ち（撃破周回が無意味にならないよう緩やか）。係数は `xpReward` に分離。
- **二重獲得防止**: `runId`（=残り火と同じ `resultId`）を鍵に、`JobProgressionManager` が `lastAwardedRunId` + `awardedRunIds`（上限40件で保持）でガード。
  リザルト再表示/戻る/保存失敗復帰でも二重獲得しない。付与と profile 保存は M5-B の `SaveCoordinator` 経由（`SaveManager.saveProfile`）。

### 周回開始時のジョブレベル固定（凍結）
- 周回開始時にジョブレベルから補正を解決（`resolve`）して `active_run`（`jobId` / `jobLevelAtStart` / `jobTotalXpAtStart` / `resolvedJobModifiers` /
  `jobProgressionVersion` / `jobRuntime`=残響カウンター）へ**凍結**する。周回中に別タブ/インポート/デバッグで profile 側レベルが変わっても進行中周回へは反映しない。
  途中再開時は `active_run` の `resolvedJobModifiers` を使う。ジョブXPはリザルト確定後に profile へ加算し、**次の周回から**新レベルが適用される。

### 火の魔女の基本成長（Lv1 は完全に M6-B 以前と同一＝恒等）
| 成長 | 係数 | Lv100での上限 | 対象 |
|------|------|---------------|------|
| 炎属性ダメージ | +0.35%/Lv | +34.65% | element:fire のダメージ/召喚攻撃/継続ダメージ/爆発/刻印起爆/障壁反撃/不死鳥反撃（`dealDamage`） |
| 炎上・火属性DoT | +0.50%/Lv | +49.5% | 炎上/DoT/燃焼地帯/溶岩地帯/火炎渦/煉獄大火輪の継続ダメージ（`tag:'dot'` に追加乗算） |
| 火属性範囲 | +0.10%/Lv | +9.9% | 爆発/設置/渦/防御反撃/進化主要範囲（`SkillBase.stats` の radius/explosionRadius ＋ `passiveAreaMult`。Projectile 当たり判定は巨大化しない） |

- **DoTと火ダメージの適用順**（乗算合成・二重適用は意図）: `final = base × fireDamageMult × (isDoT?dotDamageMult) × (isExplosion?explosionDamageMult) × (isEvolved?evolvedDamageMult)`。
  fire+DoT の攻撃は `fireDamageMult × dotDamageMult` の両方が掛かる（＝意図した乗算）。**fire 以外の属性には一切適用しない**。

### 到達レベル報酬（火の魔女使用中のみ・`jobLevel` から自動有効化・claimed フラグを大量保存しない）
| Lv | 報酬 | 効果 |
|----|------|------|
| 5 | 火力基礎強化 | 火ダメージ +5%（基本成長へ加算） |
| 10 | 炎弾加速 | projectile タグの火属性スキルの投射速度 +10%（`Projectile.reset` で非 hostile 火弾へ）。召喚数/発射数/CD は不変 |
| 20 | 高速詠唱の素養 | 火属性 active の CD −5%。既存パッシブ「高速詠唱」/恒久強化と共存。CD 安全下限(0.5)でクランプ |
| 30 | 選択の余地 | 周回開始時のリロール +1（M6-A の `draftState` に反映。追放/スキップ不変） |
| 40 | 爆炎強化 | `isExplosion`/`isMarkDetonation` タグの火属性ダメージ +15% ＆ 火属性爆発範囲 +10%（`aoe()` の判定半径へ）。通常弾/炎上/召喚射撃へ誤適用しない |
| 50 | 残響詠唱 | 攻撃用火属性 active が **12回発動ごと**に直前の攻撃を1回追加発動（威力60%） |
| 60 | 進化魔法強化 | 進化スキルの全ダメージ +20%（skillId が進化IDのとき。進化前/パッシブ補助には非適用） |
| 70 | 高位魔法適性 | 火の魔女の抽選でのみ rare 実効重み ×1.15 / legendary ×1.25（common/uncommon 不変・決定論維持） |
| 80 | 炎弾増殖 | projectile タグの火属性 active の発射数 +1（fireball/scatter_flame/flame_lance/homing_wisp の count 系。防御/召喚物数/分裂世代へは非適用・`skillCaps` を超えない） |
| 90 | 炎帝の詠唱 | 火属性 active の CD を追加で −10%（Lv20 と共存・乗算合成 0.95×0.90=0.855・安全下限クランプ） |
| 100 | 完全残響 | 残響を **8回発動ごと・威力100%** へ強化 |

### 残響詠唱の設計（共通発動イベント・各スキルへ個別コードを足さない）
- 共通シグナル `SkillManager.recordCast` → `BattleScene._onSkillCast(id)` を起点に、`JobModifierManager.registerCast()` がカウントし、閾値到達で `BattleScene._triggerEcho`。
  追加発動は `SkillManager.requestEchoCast` → `skill.echoCast(ctx)`（既定は `fire(ctx)` 再実行＝弾/設置/召喚などの攻撃挙動を再発動）。威力は `scene._echoScale` で弾 spawn と同期ダメージへ反映（60%/100%）。
- **対象**: active・fire・攻撃目的・`isEcho=false`・`isDefensive=false`・`isReactive=false`。**対象外**: passive/障壁自動展開/不死鳥致死発動/刻印二次起爆/DoT各tick/連鎖各対象/分裂弾/召喚物の各通常射撃/残響から発生した攻撃。
- 追加発動はカウンターを進めない（`echoCast` は `recordCast` を呼ばない）・残響から残響を発生させない（`_inEcho` ガード）。1フレーム上限 `balance.combatCaps.maxEchoPerFrame`(=4)。
  一時停止中は update が止まるためカウンター/遅延処理も進まない。1/1.5/2倍でも発動回数ベースのため破綻しない。
- **既知の制限**: 主発動が cooldown 由来の `recordCast` を行うスキルのみ残響対象。純粋に update ループのみで攻撃する常時型/遅延ダメージ型は威力倍率が完全反映されない場合があるが、
  その場合は攻撃挙動の再発動＝実質フル威力になりうる（防御/`runtimeState` 依存スキルの二重展開を避けるため安全な対象除外を優先）。

### modifier 適用順（`docs/architecture.md` と一致）
1. JSON基礎値（`skills.json` の levels）→ 2. 固定値加算/整数補正（発射数など）→ 3. 同カテゴリ内の加算倍率（熟練度・パッシブ）→
4. カテゴリ間の乗算倍率（ジョブレベル基本成長・到達報酬）→ 5. 安全下限/上限（CD下限・`skillCaps`）→ 6. 品質別生成上限。
- 具体経路: 基礎値/熟練度/パッシブ area・duration → `SkillBase.stats`。ジョブ火範囲 → stats(radius/explosionRadius)＋`passiveAreaMult`。
  ダメージ（恒久/魂炎 → パッシブ魔力増幅 → ジョブ火ダメージ → 残響）→ `dealDamage`。CD（基礎×熟練度 → パッシブ高速詠唱×ジョブLv20/90、下限クランプ）→ `SkillBase.update`/`passiveCooldownMult`。
  発射数（パッシブ＋ジョブLv80）→ `fireProjectileCount`。投射速度（ジョブLv10）→ `Projectile.reset`。抽選重み（ジョブLv70）→ `SkillDraftManager`。
  **Lv1 かつ到達報酬なしで M6-B 以前と完全一致（恒等）**。

### 画面（拠点「ジョブ育成」タブ / リザルト）・デバッグ・将来拡張
- **拠点ジョブ育成タブ**（640×360維持・火の魔女1ジョブのみ）: ジョブ名/仮アイコン（既存生成テクスチャ `icon_fireball`）/Job Lv/上限/現在XP/次まで/XP進行バー/累計totalXp/
  出撃/勝利/最高難易度/現在の基本補正/次の到達報酬/Lv5〜Lv100報酬一覧（解放済み・未解放の区別）。多い場合スクロール。他ジョブ選択画面は未実装。
- **リザルト画面**: 今回獲得 Job XP/難易度倍率/Job Lv 変化(before→after)/XPバー増加/複数レベルアップ対応/新しく解放された到達報酬/Lv100到達表示/二重獲得済みの安全表示。
  報酬付与は `BattleManager` で確定済み（演出待ちで失わない・UIアニメ完了を待たず即付与）。
- **デバッグ（`?debug=1` のみ）**: F5 個別スキル検証パネル（F1〜F4 と競合しない）。指定 active の単独化/Lv1〜8変更/単独進化/他 active 削除/パッシブ・残り火魂炎火力・熟練度・ジョブ補正の一時無効化/
  Job Lv 1・10・20・30・40・50・60・70・80・90・100 の一時適用/敵HP弱体化/敵密集/残響カウンター表示/残響を次発動で強制/最終 modifier と damage・cooldown・area 計算内訳の表示/通常状態へ戻す。
  一時無効化はランタイムのみ（profile の購入強化や熟練度を削除・保存しない）。
- **将来拡張 / 未実装**: 転生レガシー未実装（複数ジョブ実装後に設計・他ジョブへ効果を持ち越さない）。ジョブ間継承/新ジョブ/ジョブ選択画面/他ジョブスキル/新 active/passive/進化 は今回対象外。
  新ジョブ追加は `jobs.json` にジョブ定義＋`job-progression.json` に `jobs.<id>` を追加し、必要なら `JobModifierManager.resolve` に新 milestone type を足す（火の魔女以外・未定義ジョブは全て恒等）。

## 火の魔女ビルド拡張・第2波（Milestone 6-D 実装済み）
M6-A の抽選/枠/パッシブ/進化基盤・M6-B の戦闘挙動・M6-C のジョブ育成を再利用し、火の魔女専用の active を **さらに10種**・進化を **さらに5種** 追加する。
既存15 active・8進化・4 passive のコードと性能は変更しない。結果として火の魔女は **active 25種（既存15＋新10）・進化13種（既存8＋新5）・passive 4種** となる（`jobs.json` の `activeSkillPool` は25種）。

### 新アクティブ10種（すべて火の魔女専用・最大Lv8・毎レベル成長）
| スキル | id | レアリティ | 役割 |
|--------|----|-----------|------|
| 灼熱光線 | `scorching_ray` | uncommon | 継続する炎の光線（自機追従・DoT・線分/矩形判定・同tick同一敵1回・高Lvで2本目） |
| 火種地雷 | `ember_minefield` | common | 敵接近で起爆する罠。寿命で自動起爆・同じ地雷は1回のみ |
| 炎月斬 | `flame_crescent` | common | 扇状の近接薙ぎ払い（Projectile 非使用・一振り同一敵1回・ボスはノックバック無効） |
| 跳炎弾 | `ricochet_ember` | common | 敵/画面端で反射する火弾（対象ごと再命中待機・反射回数上限） |
| 灰燼分身 | `ash_doppelganger` | rare | 灰の分身が直近の複製可能な攻撃を低威力で再現する（clone） |
| 血炎契約 | `bloodfire_pact` | rare | 現在HPの一定割合をコストに大火力（最低HP1保証・安全HP以下では不発） |
| 弾喰い炉 | `bullet_furnace` | legendary | 敵弾を吸収してチャージ→炎弾幕を放出（防御/反応型） |
| 四方炎獄 | `four_sided_inferno` | rare | 画面端1〜4方向から炎波（プレイヤーは無傷・全方向を同時に塞がない） |
| 熔火鎖 | `molten_chains` | uncommon | 敵同士を炎の鎖で接続し DoT＋緩い引き寄せ（ボス除く）・再接続あり |
| 爆炎歩法 | `blazing_step` | uncommon | ダッシュ強化（チャージ制・開始/終了爆発＋軌跡＋無敵延長） |

### 新進化5種（枠を消費せず基礎 active を置換・補助条件スキルは消費しない）
補助条件には passive も指定できる（M6-B と同じく `EvolutionManager.canEvolve(...,levelOf)` が active∪passive を解決）。
| 進化 | 基礎スキル(Lv8) | 補助条件(Lv4) |
|------|-----------------|---------------|
| 太陽滅却陣 `solar_annihilation_array` | 灼熱光線 `scorching_ray` | 高速詠唱 `swift_cast`（passive） |
| 地獄火連鎖陣 `hellfire_mine_network` | 火種地雷 `ember_minefield` | 起爆刻印 `detonation_mark` |
| 炎帝剣域 `inferno_blade_domain` | 炎月斬 `flame_crescent` | 炎の障壁 `flame_barrier` |
| 灰燼軍勢 `ash_legion` | 灰燼分身 `ash_doppelganger` | 火の精霊 `fire_spirit` |
| 星喰い炉 `star_devouring_furnace` | 弾喰い炉 `bullet_furnace` | 不死鳥の羽 `phoenix_feather` |

- **進化を追加しない5種**（跳炎弾/血炎契約/四方炎獄/熔火鎖/爆炎歩法）は `evolutionBranches` を空にする。進化演出→置換・枠非消費・補助条件スキルを消さない点は M6-B と同一。

### 残響（echo）・分身複製（clone）の設計と再帰防止
- スキルメタに `echoPolicy`/`clonePolicy`（standard/custom/forbidden）と `isDefensive`/`isReactive`/`usesResourceCost`/`canTriggerEcho`/`canBeCopiedByClone` を持たせ、発動文脈 `castContext`（origin=normal/echo/clone・generation・親/根スキルID・威力倍率）で追跡する（純ロジック `CastPolicy.js`）。
- **再帰は「normal 由来のみ echo/clone を1世代」で必ず停止**する。normal→echo / normal→clone は各1世代だけ発生し、echo→* / clone→* は一切発生しない（`maxCopyGeneration=maxEchoCloneGeneration=1`・品質で不変）。
- `standard` は通常の追加発動（`fire` 再実行）、`custom` は攻撃部分だけ複製（血炎契約は **HP を再消費しない**・弾喰い炉は **チャージを再消費しない**）、`forbidden` は複製禁止（灰燼分身・爆炎歩法＝移動/分身増殖/危険な runtimeState 再展開を防ぐ）。
- 残響発動を灰燼分身がコピーしない・分身複製を残響カウンターへ加算しない・残響→分身→残響 / 分身→残響→分身 の循環を origin ガードで禁止する。M6-C の残響（Lv50/100）は `canTriggerEcho` のみカウントする。

### 血炎契約のHP消費（防御を貫通しないコスト）
- 現在HP割合を消費して大火力を出す。通常の被ダメージ（`takeDamage`）とは完全に分離し、障壁/無敵/不死鳥では防がれず、敵ダメージ統計にも含めない。
- **最低HP1を保証**（このコストでは死亡せず・不死鳥も発動しない）。安全HP（`safeHpPercent=0.25`）以下では不発。リザルト後/一時停止中（update 停止）は発動しない。残響・分身の複製では HP を再消費しない。

### 敵弾吸収（弾喰い炉・星喰い炉）
- 通常の敵弾（hostile）は既定で「通常弾＝吸収可・低価値」、予告/ビームは吸収不能。範囲内の吸収可能なボス弾を最大数まで吸収してチャージし、炎弾幕として放出する。
- 予告/ビーム/接触/吸収不能/消費済みの弾は吸収しない。二重吸収を防止し、吸収は発動回数・残響カウンターを進めない（**放出時のみ攻撃記録**）。吸収レート/同時数/最大チャージに上限を設け、無制限吸収で完全無敵にならないようにする。

### 爆炎歩法とダッシュ
- 既存ダッシュ/autoDash/無敵を壊さず、共通フック（`onDashStart/Move/End` → `scene.onPlayerDash` → `skills.dispatchDash`）で通知する。専用分岐を入力処理へ散在させない。
- 未取得/チャージ0なら挙動不変。1ダッシュ1チャージ消費・開始/終了爆発各1回（autoDash でも同様）・一時停止中はチャージしない・リザルト後は発動しない・残響/分身ではダッシュしない。

### Job Lv補正・パッシブ（M6-C/M6-A の共通経路を再利用）
- 全新スキルへ 火ダメージ/DoT/範囲/Lv5・10 投射速度/Lv20・90 CD/Lv40 爆発/Lv50・100 残響/Lv60 進化/Lv70 抽選重み/Lv80 発射数 が共通経路で反映される。ダメージはスキル側で pre-multiply せず `dealDamage` が適用する。
- **Lv80 の発射数+1 の対象**: 跳炎弾/弾喰い炉の放出弾/星喰い炉の放出弾/明確な projectile。**対象外**: 地雷数/分身数/鎖接続数/光線数/ダッシュチャージ数/敵弾吸収数/灰燼軍勢ユニット数。
- パッシブ（魔力増幅=damage/高速詠唱=cooldown/焦熱拡張=area/残火持続=duration）を共通集計する。**血炎契約のHP消費量は damage 補正で増えない**・**弾喰い炉の吸収数/チャージ上限は area/damage 補正で増えない**。

## 火の魔女ビルド完成・第3波（Milestone 6-E 実装済み）
M6-A（抽選/枠/パッシブ/進化）・M6-B（戦闘挙動）・M6-C（ジョブ育成・残響）・M6-D（残響/分身の再帰防止）を再利用し、火の魔女専用の active を **さらに5種**・進化を **さらに5種** 追加する。
あわせて**全 active30種・進化18種を監査**して残響（echo）/分身（clone）・主発動イベント・ダメージタグ・Job Lv80発射数+1 の扱いを各定義へ明示する。既存25 active・13進化・4 passive の性能は変更しない。
結果として火の魔女は **active 30種（既存25＋新5）・進化18種（既存13＋新5）・passive 4種・Job Lv1〜100** に完成する（`jobs.json` の `activeSkillPool` は30種）。

### 新アクティブ5種（すべて火の魔女専用・最大Lv8・毎レベル成長）
| スキル | id | レア | 役割（既存との差別化） |
|--------|----|------|------|
| 火葬の墓標 | `funeral_pyres` | uncommon | 直近の敵**死亡位置**へ墓標を生成→フューズ後に噴火（範囲＋燃焼地帯）。周囲の敵死亡で噴火が早まる。同じ死亡イベントを複数の墓標へ使わない（`consumeDeathEvent`） |
| 炎脈走破 | `magma_vein` | common | 蛇行しながら敵群を横断する炎の亀裂（複数の短い区間）。区間が一定時間残り DoT。方向決定は決定論的 |
| 三角焔陣 | `tri_flame_array` | rare | 3支点で三角形を形成、**内部の敵**へ DoT、辺接触で追加ダメージ＋軽減速（ボスは減速無効）。高Lvで内部小爆発。点in三角形判定は厳密 |
| 灼熱共鳴 | `scorching_resonance` | rare | 一定間隔で**炎上中の敵数**を数え、共鳴段階（`tierThresholds [0,5,15,30,60]`）に応じたパルス攻撃。炎上が多いほど威力/範囲/追加爆発/炎上延長が強化。段階は上限化 |
| 炉心暴走 | `core_overdrive` | legendary | 火炎弾を発射。発動ごと**熱量**上昇→発動速度/発射数/威力/弾速が上昇、最大で**オーバーヒート**（短時間停止）→熱量リセットして再開。未発動時は冷却 |

### 新進化5種（枠を消費せず基礎 active を置換・補助条件スキルは消費しない）
補助条件には passive も指定できる（M6-B/M6-D と同じく `EvolutionManager.canEvolve(...,levelOf)` が active∪passive を解決）。
| 進化 | 基礎スキル(Lv8) | 補助条件(Lv4) | 特徴 |
|------|-----------------|---------------|------|
| 冥炎大霊廟 `necroflame_mausoleum` | 火葬の墓標 | 不死鳥の羽 | 大型霊廟・周期小噴火・保存死亡数で追加火柱の大噴火。不死鳥の致死回避で大噴火待機を短縮（同一致死1回） |
| 大地灼断 `world_scorching_rift` | 炎脈走破 | 燃える軌跡 | 複数巨大亀裂が交差、交差点で追加噴火。移動経路へ短時間の小亀裂 |
| 六芒煉獄陣 `hexagram_inferno_array` | 三角焔陣 | 火炎渦 | 二重三角形＝六芒星。外周/内部/中央核で異なる判定、中央核が敵吸引（ボス無効）、頂点→中央の炎波、終了時全体爆発 |
| 万象炎鳴 `universal_flame_resonance` | 灼熱共鳴 | 連鎖炎 | 炎上敵を共鳴点として連鎖、一定数以上炎上で画面規模の共鳴爆発（1発動最大1回・`visited` 集合で無限往復防止） |
| 終末炉心 `doomsday_core` | 炉心暴走 | 血炎契約 | 熱量で攻撃形態が段階変化（低/中/高/終末状態）、終末終了で強制オーバーヒート。低HPで終末威力がわずかに上昇（上限あり・HPは自動消費しない） |

- 進化は基礎 active を置換し、枠を追加消費しない。補助条件スキルは消費しない。進化は Job Lv80発射数+1 の対象外（単一形態）。

### 共鳴段階・炉心熱量・墓標の死亡履歴利用
- **共鳴段階（灼熱共鳴/万象炎鳴）**: 一定間隔で炎上中の敵数を数え、`tierThresholds [0,5,15,30,60]` の段階に応じてパルスの威力/範囲/追加爆発/炎上延長が強化される。**段階は炎上数のみで決まり、area 補正では上がらない**（上限化）。
- **炉心熱量・オーバーヒート（炉心暴走/終末炉心）**: 発動ごとに熱量が上昇し、発動速度/発射数/威力/弾速が上がる。最大でオーバーヒート（短時間の発動停止）→熱量をリセットして再開。未発動時は冷却する。終末炉心は熱量で攻撃形態（低/中/高/終末）が変わり、終末終了で強制オーバーヒートする。**熱量上昇率/最大熱量は damage/cooldown 補正で変動しない**。低HPで終末威力がわずかに上がるが HP は自動消費しない。
- **墓標の死亡履歴利用（火葬の墓標/冥炎大霊廟）**: BattleScene が保持する**敵死亡イベント履歴**（墓標系所持時のみ記録）から直近の死亡位置を取り、墓標を生成する。同じ死亡イベントは1墓標だけが消費する（`consumeDeathEvent`）。周囲の敵死亡で噴火が早まる。

### 全スキル監査（残響/分身/タグ/Lv80 を各定義へ明示）
- **cast メタ**: 各 active/進化に `castMode`（periodic/cooldown/continuous/reactive/defensive/movement/resource）・`echoPolicy`/`clonePolicy`（standard/custom/forbidden）・`canTriggerEcho`/`canBeCopiedByClone`・`echoDescription`/`cloneDescription`・`mainCastEvent`・`lv80ProjectileTarget` を持たせる。`SkillAudit` が def から一元解決する。
- **主発動イベント（recordCast）は攻撃サイクル単位のみ**。DoTの各tick・連鎖の各対象・分裂弾・爆発の各対象・個別起爆・召喚の通常射撃・共鳴の各連鎖・オーバーヒート開始終了では recordCast しない（残響/分身の起点を「1回の攻撃サイクル」に統一）。
- **監査で修正した既存挙動（挙動そのものは不変）**: (a) 周回する炎 `orbiting_flame` は接触ごとの recordCast をやめ、主発動を一定間隔にスロットル（ダメージは接触ごとのまま）。echo/clone は炎輪パルスの再現（custom）。(b) 火の精霊 `fire_spirit` は召喚の一斉射撃サイクルを主発動として記録（個々の通常射撃では記録しない）。echo/clone は各精霊の追加一斉射撃（custom・精霊は増えない）。(c) 不死鳥の羽/炎の障壁は防御専用として echoPolicy/clonePolicy=forbidden を明示（従来も recordCast していないため挙動変更なし）。
- **ダメージタグ**: 火属性補正は全 fire へ、DoT補正は DoT のみ、爆発補正は爆発のみ、進化補正は進化のみ、弾速/数補正は対象スキルのみに適用する。echo/clone 倍率は `dealDamage` で1回だけ適用する（二重適用しない）。

### Job Lv80「発射数+1」の対象（`SkillAudit` で一元管理）
- **対象は独立弾を撃つ通常 active のみ**: `fireball` / `flame_lance` / `scatter_flame` / `homing_wisp` / `ricochet_ember` / `core_overdrive`。
- **対象外**: 地雷/墓標/分身/光線/陣/亀裂/波/召喚/鎖/共鳴段階/熱量段階/**進化**（単一形態）。対象一覧は `src/systems/SkillAudit.js` の `appliesLv80ProjectileCount`（データ `lv80ProjectileTarget`）で管理し、コードへ散在させない。

### 新規インフラ（敵死亡履歴・炎上索引・combat API）
- **敵死亡イベント履歴**（BattleScene）: `retainDeathEvents`/`releaseDeathEvents` で墓標系所持時のみ記録。`recentDeathEvents`/`consumeDeathEvent`（同一死亡は1回だけ消費）。上限 `maxDeathEventsTracked`/`maxDeathEventsPerFrame`。死亡情報 `{id,x,y,enemyType,isElite,isBoss,killedBySkillId,timestamp,frameId,consumed}`。既存の撃破統計/残り火/Job XP/経験値ジェムは不変。
- **炎上中敵の索引**（`BattleScene._burningIndex`）: `Enemy.ignite` で登録、消火/死亡/プール返却/Scene終了で解除。`burningCount()`/`burningEnemies()`（ボス炎上も1体）。`combat.ignite(e,ms,gen)` で付与＋登録。全敵走査を避ける軽量索引。Boss にも `ignite/ignited` を追加。
- **combat API 追加**: `retainDeathEvents`/`releaseDeathEvents`/`recentDeathEvents`/`consumeDeathEvent`/`burningCount`/`burningEnemies`/`ignite`/`registerBurning`/`worldBounds`。

### UI・性能上限・デバッグ・保存
- **UI**: LevelUpScene のスキルカードへ「残響○/◑/× 分身○/◑/× Lv80+ ·主要タグ」の短い記号行を追加（プレイヤーが残響/分身対応を判断できる）。BaseScene 熟練度タブは従来どおり熟練度Lvのみ。
- **性能上限**: `balance.skillCaps` へ品質別20種を追加（墓標/噴火/亀裂区間/交差/陣/共鳴対象/共鳴連鎖/共鳴爆発/炉心弾/放出/霊廟/六芒陣/炎波/終末弾/終末爆発/炎上索引/主発動 の毎フレーム上限 ほか）。**上限到達でも攻撃判定は消さず、装飾を先に削る**。
- **デバッグ**: `?debug=1` の **F7** パネル（既存 F1〜F6 と非競合）。新 active5種の単独取得/Lv切替・進化条件達成・死亡位置生成・炎上一括付与/解除・炉心熱量0/25/50/75/100%・オーバーヒート開始/解除・終末状態開始・echoPolicy/clonePolicy/Lv80対象の一覧・最後のダメージタグ・echo/clone origin/generation/倍率・性能上限到達数。デバッグ設定は profile へ保存しない。
- **保存**: 各スキルの runtimeState を `active_run.skillRuntime` へ加算保存（墓標=CD、炎脈=CD、三角=CD、共鳴=CD〈段階は再開時に再計算〉、炉心=heat/overheatLeft/cdLeft、終末=heat/overheatLeft/doomLeft/cdLeft）。個々の墓標/亀裂/陣/弾の位置は保存しない。**`save_version` は v6 のまま**（加算的追加）。再読込で熱量初期化/オーバーヒート解除/終末再開始/CD全回復/墓標二重生成 などの悪用ができないよう heat/overheat/doom/CD を保存・復元する。

### 記録すべき設計判断（M6-E）
1. **Job Lv80発射数+1は独立弾の通常 active6種のみ・進化は対象外**（単一形態）。対象は `SkillAudit` で一元管理。
2. **orbiting_flame** は接触tick毎の recordCast を廃し主発動を一定間隔にスロットル（残響の一貫性のための監査修正・ダメージ量は不変）。**fire_spirit** は召喚一斉射撃サイクルを主発動として記録。
3. スキル説明の残響/分身対応は LevelUpScene のカード（短い記号）＋ F7 デバッグ一覧で確認できる。
4. 灼熱共鳴の段階は**炎上数のみ**で決まり area 補正で増えない。墓標数/陣頂点数は projectileCount 補正で増えない。炉心熱量上昇率/最大熱量は damage/cooldown 補正で変動しない。
5. **save_version は v6 維持**（加算的 runtimeState）。

## 通常プレイ整備・バランス検証基盤（Milestone 6-F 実装済み）
火の魔女は M6-E で完成済み（active30/進化18/passive4/Job Lv1〜100）。M6-F は**新スキルを追加せず**、通常プレイできる状態へ整えるための
バランス検証基盤を追加する。プレイヤー体験としては「進化を狙って組み立てられる」抽選と「あとから見返せる」検証情報が中心で、
数値バランスは指示なく変更しない（検証は開発者の判断材料）。詳細は `docs/skill-catalog.md`・`docs/balance-testing.md`・`docs/architecture.md`。

### シナジー補助の意図（`data/skill-config.json` の `synergy`）
active が30種に増えたため、進化に必要な**補助スキル（進化相手）が候補へ極端に出にくくなる**問題を、軽い抽選補助で緩和する。
- 所持している基礎スキルの、まだ達成していない進化相手の**レアリティ重みを乗算で少し上げる**（無視しない・上限 ×2.0）。
- 進化に近づかないドラフトが続くと pity（`draftsSinceProgress`）で補助が少しずつ増え、進化成立でリセットする。
- **決定論は不変**（`synergy=null` は旧挙動と byte 一致）。**legendary を common 並みには増やさず**、特定レシピを確定させない。
  data（`synergyAssistEnabled:false`）で無効化できる。プレイ感としては「狙ったビルドがやや通りやすい」程度に留める。

### 抽選バランスの目標と達成状況
「1周でいくつ進化に到達できるか」を本番の抽選ロジックでシミュレートし（`DraftBalanceAnalyzer`）、次を満たすことを確認した。
| active枠 | ≥1進化 | ≥2進化 | 目標 | 達成 |
|---------|--------|--------|------|------|
| 4 | 86.0% | 36.5% | ≥1:60%+ / ≥2:15%+ | ✅ |
| 6 | 98.0% | 78.0% | ≥1:75% / ≥2:35% | ✅ |
| 8 | 97.5% | 78.0% | ≥1:85% / ≥2:50% | ✅ |
- **どのレシピも active 4枠で成立可能**（全レシピ minActiveSlots≤2・minPassiveSlots≤1）。最難関は `star_devouring_furnace`（全構成が伝説）。
- **注記**: 短い周回（levelUps≈24）では**傾向が逆転**する（枠が少ないほど1つの基礎へ強化が集中し Lv8 到達が早い）。
  「枠が多いほど進化が増える」は**長周回でのみ成り立つ上限効果**で、想定レベルアップ回数に依存する。

### Balance Playtest（通常プレイ検証モード・F8・`?debug=1` 限定）
プレイ体験を壊さずに条件を変えて素の手触りを確かめるためのモード。seed/難易度/品質/速度/Job Lv/active枠4-6-8/候補3-4/リロール/
恒久強化(通常|全無効)/熟練度(通常|無効)/Job補正(通常|無効)/戦闘時間(5分|1分|10分) を選んで「検証開始」すると、
**一時状態のみ初期化**（スキル自動付与なし・ゴッドモード無効）して素のプレイができる。**profile の通貨/進行/JobXP/クリアは不変**で、
この周回は debugRun として通常統計へ混ぜない。「素の状態でどのくらい進化に届くか・どのスキルが強い/弱いか」を安全に確かめられる。

### テレメトリで見る指標（ResultScene「Balance詳細」）
1周回ぶんのローカル戦闘テレメトリ（**外部送信なし**）から、次を確認できる。
- スキル別: DPS / damageShare（火力の偏り）・casts/hits/kills・echo(残響)/clone(分身)の発生・上限到達・防御スキルの防御値。
- 周回全体: FPS（平均/最低/p95）・性能上限（cap）到達数・seed。
- **debugRun（F4〜F8 のデバッグ補正を使った周回）は通常統計へ混ざらない**（「通常統計へ記録していません」と明示）。
- しきい値（`data/balance-thresholds.json`）を下回る/上回るスキルは**開発用の警告**として示すが、**自動調整はしない**・
  最低サンプル数未満は警告しない（1〜2周で断定しない）。バランス値は指示なく変更しない。

## Milestone 7-A: 2人目のジョブ「氷術師」と汎用状態異常基盤

火の魔女（fire）に加え、2人目のジョブ **氷術師（frost_mage・ice）** を追加し、複数ジョブを選んで遊べる共通基盤と、
将来ほかの属性/状態異常を足せる**汎用状態異常基盤**を実装した。火の魔女の既存挙動・数値・抽選結果は維持している。

### ジョブ選択
拠点の「ジョブ育成」タブが**ジョブ選択＋育成状況**を兼ねる画面へ拡張。火の魔女／氷術師のカード（属性・Job Lv・XP・
active/passive/進化数・状態異常・説明・選択ボタン）を表示し、選択中を強調する。`profile.selectedJobId`（既定 `flame_witch`）へ保存。
**進行中周回がある間はジョブ変更を無効化**し、変更は次の新規周回から有効。周回のジョブは `active_run.jobId` に固定され、途中で
profile 側のジョブを変えても進行中周回のジョブ・スキル・補正は変わらない。ジョブごとにスキルプール／Job XP／Job Lv／統計を完全分離する。

### 汎用状態異常基盤（`data/status-effects.json` ＋ StatusEffectRegistry / StatusEffectManager / FreezeSystem）
スキルごとに独自の炎上/冷気/凍結タイマーを持たず、Enemy/Boss/エリートが共通経路を使う。将来 poison/bleed/shock/curse/stun/slow 等を
足せる構造。M7-A の正式状態は **burning / chill / frozen / freeze_immunity / frostbreak_vulnerability**。既存の火の魔女の炎上は
汎用索引へ移行したが、ダメージ/持続/灼熱共鳴/万象炎鳴/統計は不変（`Enemy.ignite` 互換経路を維持）。詳細は docs/status-effects.md。

### 氷術師の制圧サイクル（冷気→凍結→粉砕 / ボスは氷砕）
- **冷気(chill)**: 氷攻撃でダメージとは別に蓄積。量に応じて通常敵/エリートを減速（通常最大50%・エリート35%・ボスは減速なし）。自然減衰あり。
- **凍結**: `freezeChance = baseFreezeChance×procCoefficient + (chill/chillCap)×chanceFromChill×procCoefficient` を対象別 cap でクランプ、
  `chill≥guaranteedThreshold` で確定凍結。**Math.random は使わず状態異常専用 SeededRandom**（cursor を active_run に保存）。多段攻撃は
  低 procCoefficient ＋ hitGroup ごとの判定回数上限で**永久凍結を防ぐ**。frozen 中は移動/攻撃/AI 停止・ダメージは受ける・粉砕対象。解除後に freeze_immunity。
- **粉砕**: 凍結中の通常敵/エリートへ特定氷スキル・Job Lv報酬が発生。frozen 解除＋追加氷ダメージ/範囲爆発。ダメージは固定基礎＋スキル威力係数＋
  敵最大HP係数（**上限つき**・最大HP割合だけで無制限に増えない）。**粉砕から粉砕を再帰しない**。ボスには通常粉砕を適用しない。
- **ボス氷砕(frostbreak)**: ボスは通常凍結せず、冷気をボス専用ゲージへ変換。閾値到達で短い硬直（chase 中のみ）＋氷砕脆弱（氷被ダメージ×1.15）＋
  ゲージリセット。break ごとに次回閾値×1.30（上限×3.0）。ボスHPバー付近に氷砕ゲージを表示（氷術師のみ・ボス不在時は非表示）。

### 氷術師の構成（active5 / passive4 / 進化3 ・ Job Lv1〜100）
- active5: 氷晶弾(frost_shard・初期)／氷輪爆(frost_nova)／氷槍貫通(glacial_lance)／永久凍土(permafrost_field)／氷壁結界(ice_wall)。
- passive4: 氷晶増幅／急速冷却／凍域拡張／余寒残留。
- 進化3: ダイヤモンドブリザード(frost_shard)／絶対零度領域(frost_nova)／天穿氷河槍(glacial_lance)。進化は基礎を置換し active/passive 枠を消費しない。
- Job Lv基本成長: 氷ダメージ+0.35%/Lv・冷気付与+0.30%/Lv・粉砕+0.40%/Lv。到達報酬 Lv5〜100（詳細は docs/jobs.md）。

### 火と氷の関係（M7-A では未実装）
火と氷の属性反応（火で凍結解除／氷で消火／蒸発・融解）は実装しない。炎上と冷気/凍結は独立して共存する（将来のため状態付与に source element を保持）。

## Milestone 7-B: 氷術師ビルド拡張（active15 / 進化8）
氷術師を **active15種 / passive4種（M7-B で追加なし）/ 進化8種 / Job Lv1〜100** に拡張した。火の魔女（active30/進化18）は不変で同 seed の抽選結果も不変。
冷気→凍結→粉砕／ボス氷砕の制圧サイクルはそのままに、制御・範囲・防御・遅延大技のバリエーションを増やす。数値バランスは `data/skills.json` が正（指示なく変更しない）。

### 新アクティブ10種（すべて氷術師専用・最大Lv8・毎レベル成長）
| スキル | id | レア | 役割 |
|--------|----|------|------|
| 氷柱斉射 | `icicle_volley` | common | 時間差で複数弾を連射（**Job Lv80 発射数+1 の唯一の対象**） |
| 氷晶環 | `frost_orbit` | common | 周囲を回る氷晶が接触ダメージ（常設・再構築） |
| 凍結光線 | `freezing_ray` | uncommon | 冷気を溜めるビーム。指定間隔でのみ粉砕を起こす（冷気ランプ） |
| 雹嵐 | `hailstorm` | uncommon | 範囲へ雹を降らせる周期攻撃 |
| 氷結地雷 | `cryo_mine` | common | 敵接近で起爆する罠。frozen 敵を粉砕（反応型） |
| 雪精霊 | `frost_spirit` | uncommon | 追従する雪精霊が自動で撃つ（常設・再構築） |
| 氷牢封印 | `ice_prison` | rare | 冷気が十分なら短時間凍結、不足なら大幅減速。ボスは氷砕ゲージ |
| 雪崩奔流 | `avalanche` | uncommon | 波状範囲。通常敵を押し流し・エリート軽減・ボスは移動なし・frozen 粉砕 |
| 氷鏡結界 | `mirror_ice` | rare | 敵弾を吸収し氷の反撃弾を撃つ防御技（複製なし） |
| 氷河墜落 | `glacier_drop` | legendary | 予告後に落下する遅延大範囲爆発。frozen 粉砕・ボス氷砕・凍結床が残留 |

### 新進化5種（枠を消費せず基礎 active を置換・補助条件スキルは消費しない・進化は Lv80発射数対象外）
| 進化 | 基礎スキル(Lv8) | 補助条件(Lv4) |
|------|-----------------|---------------|
| 天晶氷嵐 `crystal_tempest` | 氷柱斉射 `icicle_volley` | 氷晶増幅 `frost_amplification`（passive） |
| 絶対零光 `absolute_zero_ray` | 凍結光線 `freezing_ray` | 急速冷却 `rapid_freezing`（passive） |
| 白魔大氷災 `whiteout_cataclysm` | 雹嵐 `hailstorm` | 余寒残留 `lingering_cold`（passive） |
| 雪后氷霊陣 `frost_queen_court` | 雪精霊 `frost_spirit` | 凍域拡張 `frozen_expansion`（passive） |
| 終末氷河奔流 `world_end_avalanche` | 雪崩奔流 `avalanche` | 氷壁結界 `ice_wall`（active） |

- 冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路（独自凍結タイマーなし）。Math.random 不使用で決定論・draft RNG cursor 不変。
  echo/clone は1世代・再帰なし（`mirror_ice` は複製なし・`cryo_mine` は反応型で残響カウント対象外）。詳細は `docs/jobs.md`・`docs/skill-catalog.md`。

## Milestone 7-B.1: 状態異常の視認性・実動作検証
氷術師の制圧サイクル（冷気→凍結→粉砕 / ボス氷砕）と炎上を、**通常プレイ中に見て確かめられる**ようにするための整備。
**新スキル/パッシブ/進化/ジョブは追加しない・データ数値やバランスは変更しない**。状態ロジック（`StatusEffectManager`/`FreezeSystem`）の
判定・ダメージ・凍結確率・状態RNG cursor・ボス氷砕値は**すべて不変**。表示状態はセーブしない（`save_version` は v6 のまま）。詳細は `docs/status-visuals.md`・`docs/status-debug.md`。

### 状態を「見える」ようにする（演出のみ・結果は不変）
- **冷気(chill)の段階表示**: 冷気量の割合で見た目が段階化する。1〜39%=ごく薄い水色 / 40〜74%=水色縁＋足元の氷輪 / 75%+=青白縁＋氷結晶マーク。
  確定凍結閾値の90%で一度光る**事前通知**が出る。冷気0で完全解除。
- **減速(slow)**: 冷気で実際に敵が遅くなる（通常最大50%・エリート35%・ボスは減速なし）。デバッグの表示減速率と実挙動が一致する。
- **凍結(frozen)**: 氷殻で覆われ、開始/解除で氷片が飛ぶ。**厚い氷で本体を隠さない・画面全体の白フラッシュは出さない**（被弾や他状態が読めなくならない）。
- **凍結耐性(freeze_immunity)**: 解除直後の凍らない状態がアイコンで分かり、終了も分かる。耐性中は凍結演出が出ない。
- **粉砕(shatter)**: 氷片放射＋衝撃輪＋「SHATTER」の文字で、通常のダメージ数値と区別できる（同時数/フレーム上限あり）。
- **炎上(burning)**: 火の魔女の炎上もアイコンで分かり、氷術師の凍結と**共存表示**できる（属性反応は未実装のまま）。
- **状態アイコンの優先度と最大数**: 1エンティティに出すアイコンは frozen > burning > freeze_immunity > chill_high の優先度で、品質別の最大数（低品質は1個）に絞る。

### ボス氷砕ゲージの明確化
ボス HP バー付近の氷砕ゲージに、現在値/必要値/割合/break 回数/cooldown/氷砕脆弱の残り秒を表示し、脆弱中は点滅で分かるようにした。
氷術師でボスが在戦しているときのみ表示（火の魔女や、ボス不在では空ゲージを出さない）。ゲージが満ちると **FROST BREAK** のワールド文字＋ゲージ亀裂＋氷片が出る。

### F10 状態デバッグ（`?debug=1` 限定）
`?debug=1` で **F10** を押すと状態デバッグパネルが開き、クリックで対象を選んで、冷気/確定閾値/減速/凍結残/耐性残/freezeChance 内訳（式の各項・RNG roll・結果）・
hitGroup 上限・状態カウンタ・ボス氷砕状態を数値で確認できる。演出を疑ったときに**実際のロジック値**を突き合わせるための開発用表示で、profile やバランスには一切影響しない。

### 負荷と視認性
装飾（アイコン/氷片/Tween/floating text）は品質別上限に達すると先に削るが、**凍結解除・免疫・状態索引の cleanup といった状態ロジックは削らない**。
敵100体＋2倍速でも HUD/敵弾/ボス予告の視認性を保つことを目標とする（実ブラウザでの60FPS・見た目は本環境では未確認）。バランス数値は指示なく変更しない。

## Milestone 7-C: 氷術師ビルド拡張・第2波（active25 / 進化13）
氷術師を **active25種 / passive4種（M7-C で追加なし）/ 進化13種 / Job Lv1〜100** に拡張した。火の魔女（active30/進化18）と氷術師の既存 active15/進化8 は不変で、
同 seed の抽選結果も不変。冷気→凍結→粉砕／ボス氷砕の制圧サイクルはそのままに、往復弾・連鎖・設置開花・追従霧・大技・防御・全画面制御など**戦い方の幅**を増やす。数値バランスは `data/skills.json` が正（指示なく変更しない）。

### スキル拡張の思想
- **スキル数を増やして氷ビルドの選択肢を広げる**が、序盤から画面を氷で埋め尽くさない。common は素直な基礎（霜輪飛刃/氷晶開花/砕氷衝波）、uncommon は特徴づけ（氷鎖連閃/白霧氷界/冬冠結界）、rare は軸になる派手さ（極星氷弾/氷晶屈折/氷彗星群）、legendary は強力だが**発生を絞った制御技**（氷刻停止）という役割分担を守る。
- **決定論的なランダム性で「毎回同じ結果・でも配置は多彩」**を両立する。扇角・連鎖順・開花地点・霧中心・星角・時計 wave・屈折順・彗星落下（黄金角）・barrage 順はすべて index ベースで決まり、`Math.random`/`Date.now`/`performance.now` を使わない。乱数に頼らないため、リロードや途中再開でも挙動が揺れない。
- **派手さ優先だが、legendary/defensive は制御して過剰にならないようにする**。氷刻停止（legendary）は直接凍結せず既存の `FreezeSystem` へ委譲し、全画面制御をボス氷砕ゲージの標準経路へ流す（`bossGaugeMult` はボス氷砕ゲージ量のみへ1命中1回だけ適用し、damage/chill/proc には掛からず二重加算しない）。冬冠結界（defensive）は `mirror_ice` と差別化しつつ、耐久片を装飾上限（visual cap）で減らさない設計で「防御が見た目の都合で弱くならない」ことを保証する。
- **進化は基礎 Lv8 より明確に強い到達点**にする。進化は枠を消費せず基礎 active を置換し、補助条件スキル（passive3種＋補助 active の `ice_prison`）は消費しない。零刻世界の条件に使う `ice_prison` は置換対象にしない（進化条件用の補助として残す）。
- **状態表示・保存・テレメトリは既存基盤に寄せる**。新スキルは冷気/凍結/粉砕/ボス氷砕を既存 `StatusEffectManager` 経路で起こし、M7-B.1 の視認性表示（`StatusVisualManager`/ボス氷砕/F10）へ自動反映する。スキルクラスから独自の状態演出やタイマーを持たない。

### 新アクティブ10種（すべて氷術師専用・最大Lv8・毎レベル成長）
| スキル | id | レア | 役割 |
|--------|----|------|------|
| 霜輪飛刃 | `rime_boomerang` | common | 往復する氷輪。往路と復路で別命中、復路は高威力で凍結敵を粉砕（**Lv80発射数対象**） |
| 氷鎖連閃 | `frost_chain` | uncommon | 高冷気を優先する瞬間連鎖。後半減衰・同一敵へ再連鎖しない |
| 氷晶開花 | `crystal_bloom` | common | 発芽→開花の設置。開花時のみ粉砕（pulse は弱い） |
| 白霧氷界 | `snowblind_mist` | uncommon | プレイヤー追従の霧。持続冷気・粉砕なし |
| 極星氷弾 | `polar_star` | rare | 大型星＋pulse＋着弾爆発＋氷片の複合弾（**Lv80発射数対象**） |
| 砕氷衝波 | `icebreaker_wave` | common | 扇状衝波。通常敵 push・エリート軽減・ボス push なし・凍結敵粉砕 |
| 氷刻停止 | `frozen_clock` | legendary | 全画面の時計波。直接凍結せず FreezeSystem へ委譲する制御技 |
| 氷晶屈折 | `crystal_refraction` | rare | 屈折して跳ねる projectile。最終屈折のみ粉砕 |
| 冬冠結界 | `winter_halo` | uncommon | 氷冠で被弾吸収＋近距離冷気反撃（`mirror_ice` と差別化） |
| 氷彗星群 | `comet_sleet` | rare | 予告→barrage。通常彗星と大彗星、大彗星のみ粉砕 |

### 新進化5種（枠を消費せず基礎 active を置換・補助条件スキルは消費しない・進化は Lv80発射数対象外）
| 進化 | 基礎スキル(Lv8) | 補助条件(Lv4) |
|------|-----------------|---------------|
| 冥氷処刑輪 `rime_execution_wheel` | 霜輪飛刃 `rime_boomerang` | 氷晶増幅 `frost_amplification`（passive） |
| 永劫氷鎖 `eternal_frost_chain` | 氷鎖連閃 `frost_chain` | 急速冷却 `rapid_freezing`（passive） |
| 世界氷晶樹 `crystal_world_tree` | 氷晶開花 `crystal_bloom` | 凍域拡張 `frozen_expansion`（passive） |
| 永久白霧 `everlasting_white_mist` | 白霧氷界 `snowblind_mist` | 余寒残留 `lingering_cold`（passive） |
| 零刻世界 `zero_hour_world` | 氷刻停止 `frozen_clock` | 氷牢封印 `ice_prison`（補助 active・置換しない） |

冷気/凍結/粉砕/ボス氷砕は既存 `StatusEffectManager` 経路（独自タイマーなし）。index ベース決定論で draft RNG cursor 不変。echo/clone は1世代・再帰なし（`frozen_clock`/`winter_halo` は forbidden・`crystal_bloom`/`snowblind_mist`/`comet_sleet` は custom で攻撃部分のみ複製）。実ブラウザでの見た目・体感は本環境では未確認。詳細は `docs/skills.md`・`docs/jobs.md`・`docs/skill-catalog.md`。
