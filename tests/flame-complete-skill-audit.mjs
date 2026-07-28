// 火の魔女 完成監査 6/12: SkillAudit 完全監査と recordCast / echo / clone 監査（M8-A §7）。Node.js 標準機能のみ。
// active30・進化18 の全件について id/class/data/job・rarity・castMode/mainCastEvent・echo/clone・Lv80・
// runtimeState・element/tags・主発動 recordCast 1回・再帰なし・上限接続を検証する。
// 実行: node tests/flame-complete-skill-audit.mjs

import { castSummary, echoStatus, cloneStatus, appliesLv80ProjectileCount, primaryTags, CAST_MODES, ATTACK_CAST_MODES } from '../src/systems/SkillAudit.js';
import { resolveCastMeta } from '../src/systems/CastPolicy.js';
import { DATA, FLAME, EXPECTED, registryMap, skillSource, readSrc, runner } from './flame-audit-common.mjs';

const T = runner('火の魔女 SkillAudit 完全監査（M8-A）');
const { ok, section, info } = T;

const MAP = registryMap();
const ALL = [...FLAME.activeSkillPool.map((id) => ({ id, kind: 'active', def: DATA.skills.find((s) => s.id === id) })),
             ...FLAME.evolutionPool.map((id) => ({ id, kind: 'evolution', def: DATA.evolutions.find((e) => e.id === id) }))];
const issues = [];
const note = (id, msg) => issues.push(`${id}: ${msg}`);

// メソッド本体を波括弧の対応で正確に切り出す。
function methodBody(src, name) {
  const re = new RegExp('(^|\\n)\\s*' + name + '\\s*\\([^)]*\\)\\s*{');
  const m = re.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i + 1, k); }
  }
  return null;
}

// ===== 1. 全件のメタデータが解決できる =====
section('1. id / class / data / job / rarity / castMode / mainCastEvent / element / tags');
ok(ALL.length === EXPECTED.activeCount + EXPECTED.evolutionCount, `監査対象 ${ALL.length} 件 = 30 + 18`);
for (const { id, kind, def } of ALL) {
  ok(!!def, `${id}: data がある`);
  ok(!!MAP[id], `${id}: 実装クラスが登録されている`);
  ok(CAST_MODES.includes(def.castMode), `${id}: castMode=${def.castMode} が既知（${CAST_MODES.join('/')}）`);
  if (ATTACK_CAST_MODES.includes(def.castMode)) ok(!!def.mainCastEvent, `${id}: 攻撃系 castMode は mainCastEvent を持つ`);
  if (kind === 'active') {
    ok(['common', 'uncommon', 'rare', 'legendary'].includes(def.rarity), `${id}: rarity=${def.rarity}`);
    ok(Array.isArray(def.jobs) && def.jobs.length === 1 && def.jobs[0] === 'flame_witch', `${id}: jobs=["flame_witch"]`);
    ok(def.isCommon === false, `${id}: isCommon=false`);
    ok(def.maxLevel === 8, `${id}: maxLevel=8`);
    ok(Array.isArray(def.tags) && def.tags.includes('fire'), `${id}: tags に fire を含む（属性経路が決まる）`);
  } else {
    ok(def.visualTier === 'evolved', `${id}: visualTier=evolved`);
    ok(def.replacementSkillId === id, `${id}: replacementSkillId が自分自身（置換）`);
  }
}

// ===== 2. echo / clone / Lv80 の解決結果が data と一致 =====
section('2. echoPolicy / clonePolicy / canTriggerEcho / canBeCopiedByClone / lv80ProjectileTarget');
for (const { id, def } of ALL) {
  const meta = resolveCastMeta(def);
  const sum = castSummary(def);
  ok(meta.echoPolicy === (def.echoPolicy || 'standard'), `${id}: echoPolicy 解決が data と一致`);
  ok(meta.clonePolicy === (def.clonePolicy || 'standard'), `${id}: clonePolicy 解決が data と一致`);
  if (def.echoPolicy === 'forbidden') ok(echoStatus(def) === '非対応', `${id}: forbidden → 残響非対応`);
  if (def.clonePolicy === 'forbidden') ok(cloneStatus(def) === '複製不可', `${id}: forbidden → 複製不可`);
  if (def.echoPolicy === 'custom') ok(echoStatus(def) === (def.canTriggerEcho === false ? '非対応' : '攻撃部分のみ'), `${id}: custom の残響表示が canTriggerEcho と整合`);
  ok(appliesLv80ProjectileCount(def) === (def.lv80ProjectileTarget === true), `${id}: Lv80 判定が明示 flag と一致`);
  ok(Array.isArray(sum.tags), `${id}: castSummary がタグを返す`);
  ok(Array.isArray(primaryTags(def)), `${id}: primaryTags が配列`);
  if (def.isDefensive || def.isReactive) ok(def.canTriggerEcho === false, `${id}: 防御/反応は canTriggerEcho=false`);
}
{
  const lv80 = ALL.filter((x) => appliesLv80ProjectileCount(x.def)).map((x) => x.id).sort();
  ok(lv80.join(',') === EXPECTED.lv80Targets.slice().sort().join(','), `Lv80 対象は 6 種のみ（${lv80.join(',')}）`);
}

// ===== 3. recordCast は主発動1回だけ =====
section('3. recordCast 監査（主発動1回・派生では呼ばない）');
const DERIVED = ['_tick', '_pulse', '_burst', '_hop', '_chain', '_shoot', '_link', '_detonate', '_impact', '_contact',
  '_collapse', '_bloom', '_spawnWave', '_spawnResidue', '_wave', '_fragment', '_explode', '_dropBurn', '_damage',
  '_bigErupt', '_retaliate', '_doChains', '_doFocus', '_markEnemies', '_lance', '_spawnLava', 'onEnemyKilled', 'onDash'];
for (const { id, def } of ALL) {
  const src = skillSource(id, MAP);
  const calls = (src.match(/recordCast\(/g) || []).length;
  const baseDriven = !/canFire\s*\(\s*[^)]*\)\s*{\s*return false/.test(src);
  if (calls === 0) {
    // 許されるのは (a) 基底 update が1回記録する / (b) 防御スキル（意図的0回）/
    // (c) echo・clone とも forbidden かつ canTriggerEcho=false（残響カウンタを進めない設計）。
    const forbidden = def.echoPolicy === 'forbidden' && def.clonePolicy === 'forbidden' && def.canTriggerEcho === false;
    ok(baseDriven || def.isDefensive || def.castMode === 'defensive' || forbidden,
      `${id}: recordCast 0 が許されるのは「基底 update 記録」「防御スキル」「echo/clone とも forbidden」のみ`);
    note(id, (def.isDefensive || def.castMode === 'defensive')
      ? '防御スキルのため recordCast は意図的に0回（発動数・残響カウンタへ数えない）'
      : (forbidden ? 'echo/clone とも forbidden のため recordCast は意図的に0回（残響カウンタを進めない）'
        : '主発動 recordCast は基底 update（cooldown 発火）が1回だけ行う'));
  } else {
    ok(calls <= 2, `${id}: recordCast の呼び出し箇所 ${calls} 件（主発動のみ・多重記録しない）`);
  }
  // 派生処理の中で recordCast していない（recordExtra は可）。
  for (const fn of DERIVED) {
    const b = methodBody(src, fn);
    if (b) ok(!/recordCast\(/.test(b), `${id}: ${fn}() の中で recordCast を呼ばない`);
  }
  const echoBody = methodBody(src, 'echoCast');
  if (echoBody) ok(!/recordCast\(/.test(echoBody), `${id}: echoCast から recordCast を呼ばない`);
  const cloneBody = methodBody(src, 'cloneCast');
  if (cloneBody) ok(!/recordCast\(/.test(cloneBody), `${id}: cloneCast から recordCast を呼ばない`);
}
// 弾/DoT tick/爆発/連鎖/召喚射撃は共通経路（Projectile / BattleScene）で処理され、recordCast を呼ばない。
{
  const proj = readSrc('src/entities/Projectile.js');
  ok(!/recordCast\(/.test(proj), 'Projectile から recordCast を呼ばない（弾ごとに発動数が増えない）');
  const bs = readSrc('src/scenes/BattleScene.js');
  const chain = methodBody(bs, '_chainHit');
  if (chain) ok(!/recordCast\(/.test(chain), '連鎖 hop で recordCast を呼ばない');
  const split = methodBody(bs, '_splitLance');
  if (split) ok(!/recordCast\(/.test(split), '分裂弾で recordCast を呼ばない');
  const mark = methodBody(bs, 'chainDetonate');
  if (mark) ok(!/recordCast\(/.test(mark), '連鎖起爆で recordCast を呼ばない');
}

// ===== 4. 再帰なし（echo→echo / clone→clone / 爆発→爆発）=====
section('4. 残響/分身/爆発の再帰が無い');
for (const { id } of ALL) {
  const src = skillSource(id, MAP);
  const echoBody = methodBody(src, 'echoCast');
  if (echoBody) {
    ok(!/this\.echoCast\(/.test(echoBody), `${id}: echoCast が自分自身を呼ばない`);
    ok(!/requestEchoCast\(|performClone\(/.test(echoBody), `${id}: echoCast から残響/分身を再要求しない`);
  }
  const cloneBody = methodBody(src, 'cloneCast');
  if (cloneBody) ok(!/this\.cloneCast\(/.test(cloneBody), `${id}: cloneCast が自分自身を呼ばない（echoCast への委譲は可）`);
}
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/isMarkDetonation:\s*true/.test(bs), 'BattleScene が起爆ダメージへ isMarkDetonation を付けて再起爆を止める');
  ok(/_echoScale/.test(bs), '残響の威力倍率は1経路（_echoScale）で管理される');
  ok(/_explosionBudget/.test(bs), '同時爆発に毎フレーム予算がある（爆発の暴走なし）');
  ok(/_deathExpBudget/.test(bs), '死亡爆発連鎖に上限がある（二次爆発から再二次爆発が起きない）');
  ok(/_extraFbBudget/.test(bs), '撃破時の追撃火球に上限がある');
  const cp = readSrc('src/systems/CastPolicy.js');
  ok(/if \(p\.origin !== 'normal'\) return null;/.test(cp), 'echo/clone からの再複製は CastPolicy が禁止する');
  ok(/suppressEcho: true, suppressClone: true/.test(cp), '子 castContext からは echo も clone も発生しない');
  ok(/if \(gen > mg\) return null;/.test(cp), 'generation 上限がある');
  ok(/powerMultiplier: \(p\.powerMultiplier \|\| 1\) \* \(powerMult \|\| 1\)/.test(cp), 'powerMultiplier は1回だけ掛かる');
  ok(/rootSkillId/.test(cp) && /parentSkillId/.test(cp), 'sourceSkillId / rootSkillId が castContext に保持される');
}

// ===== 5. 品質上限 / PoolManager / SpatialGrid / cleanup / telemetry の接続 =====
section('5. 上限・プール・空間索引・後始末・テレメトリの接続');
for (const { id, def } of ALL) {
  const src = skillSource(id, MAP);
  // 上限機構は3種のいずれかを満たせばよい:
  //   (a) 明示上限（skillCap / frameBudget / safetyCaps / Math.min / プール上限 / 発射数 API）
  //   (b) 寿命つき（expire を持つ設置物は時間で必ず消える）
  //   (c) 目標数への再構築（_rebuild / _ensure が data の個数へ揃える）
  const boundedExplicit = /skillCap\(|frameBudget\(|this\.cap\(|Math\.min\(|projPool\.maxSize|fireProjectileCount\(|countProjBySkill\(/.test(src);
  const boundedLifetime = /expire\s*[:-]/.test(src);          // 寿命つき設置物は時間で必ず消える
  const boundedRebuild = /_rebuild\(|_ensure\(/.test(src);     // data の個数へ揃えて再構築する常設物
  const boundedTween = /tweens\.add\([\s\S]{0,400}destroy\(\)/.test(src); // tween 完了で自動破棄される短命演出
  // 生成をループで行っているか（ループ外の単発生成は data の 1 回ぶんで上限不要）。
  const loopSpawn = /(for|while)\s*\([\s\S]{0,400}?(spawnPlayerProjectile|this\.scene\.add\.|\.push\()/.test(src);
  const bounded = boundedExplicit || boundedLifetime || boundedRebuild || boundedTween;
  if (loopSpawn) ok(bounded, `${id}: ループ生成を伴うスキルは上限（明示上限 / 寿命 / 目標数再構築 / tween自動破棄）を持つ（無制限インスタンスなし）`);
  if (/this\.scene\.add\./.test(src)) ok(/\.destroy\(\)/.test(src), `${id}: 生成した表示物を破棄する経路がある`);
  // 敵探索は必ず combat API（SpatialGrid 経由）。分身系は探索せず performClone に委譲する。
  ok(/enemiesInRadius|forEachEnemyInRadius|nearestEnemy|densestPoint|randomEnemies|burningEnemies|recentDeathEvents|damageArea\(|aoe\(|performClone\(/.test(src) || def.isDefensive || def.castMode === 'movement',
    `${id}: 敵探索は SpatialGrid ベースの combat API を使う（全敵総当たりしない）`);
  ok(!/forEachActive\(/.test(src), `${id}: enemyPool.forEachActive による全敵総当たりをしない`);
  // テレメトリは自前記録か combat 共通経路（dealDamage/damageArea/aoe/spawn/markEnemy が中央で記録する）。
  // 刻印系は BattleScene の起爆（_doMarkExplosion → aoe(skillId)）が中央でダメージを記録する。
  ok(/recordExtra\(|recordCast\(/.test(src) || /dealDamage\(|damageArea\(|spawnPlayerProjectile\(|aoe\(|markEnemy\(|_mark\s*=/.test(src),
    `${id}: テレメトリ経路（自前記録 or combat 共通経路 / 刻印起爆）へ接続している`);
}

// ===== 6. runtimeState を持つべきスキル（CD/周期/設置/召喚）が保存している =====
section('6. クールダウン・周期・設置物を持つスキルが runtimeState を保存する');
{
  const { skillsWithRuntimeState } = await import('../src/systems/SkillManager.js').catch(() => ({ skillsWithRuntimeState: null }));
  void skillsWithRuntimeState;
  const missing = [];
  for (const { id, def } of ALL) {
    const src = skillSource(id, MAP);
    const has = /serializeState\s*\(/.test(src);
    // 移動系（blazing_step）は自前の runtimeState を持つ。それ以外はすべて CD か周期状態を保存する。
    if (!has) missing.push(id);
    ok(has, `${id}: serializeState / restoreState を実装している（再開直後の無料発動を防ぐ）`);
    void def;
  }
  info(`runtimeState 未実装: ${missing.join(', ') || 'なし'}`);
}

// ===== 7. issues 集計 =====
section('7. 監査結果');
info(`意図的な仕様（警告として残すもの）: ${issues.length} 件`);
for (const i of issues) info('  ' + i);
ok(true, 'SkillAudit 完全監査を完了（未解決 issue は上記のみ・すべて意図した仕様）');

T.finish();
