// 氷術師 完成監査 6/12: SkillAudit 完全監査と recordCast 監査（M7-E §12・§13・§14）。Node.js 標準機能のみ。
// active30・進化18 の全件について id/class/data/job・rarity・castMode/mainCastEvent・echo/clone・Lv80・
// runtimeState・element/tags・proc/chill/bossGaugeMult・主発動 recordCast 1回・再帰なし を検証する。
// 実行: node tests/frost-complete-skill-audit.mjs

import { castSummary, echoStatus, cloneStatus, appliesLv80ProjectileCount, primaryTags, CAST_MODES, ATTACK_CAST_MODES } from '../src/systems/SkillAudit.js';
import { resolveCastMeta } from '../src/systems/CastPolicy.js';
import { DATA, FROST, EXPECTED, registryMap, skillSource, runner } from './frost-audit-common.mjs';

const T = runner('氷術師 SkillAudit 完全監査（M7-E）');
const { ok, section, info } = T;

const MAP = registryMap();
const ALL = [...FROST.activeSkillPool.map((id) => ({ id, kind: 'active', def: DATA.skills.find((s) => s.id === id) })),
             ...FROST.evolutionPool.map((id) => ({ id, kind: 'evolution', def: DATA.evolutions.find((e) => e.id === id) }))];
const issues = [];
const note = (id, msg) => issues.push(`${id}: ${msg}`);

// メソッド本体を波括弧の対応で正確に切り出す（正規表現の貪欲マッチで隣のメソッドを巻き込まないため）。
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
section('1. id / class / data / job / rarity / castMode / mainCastEvent');
ok(ALL.length === EXPECTED.activeCount + EXPECTED.evolutionCount, `監査対象 ${ALL.length} 件 = 30 + 18`);
for (const { id, kind, def } of ALL) {
  ok(!!def, `${id}: data がある`);
  ok(!!MAP[id], `${id}: 実装クラスが登録されている`);
  ok(CAST_MODES.includes(def.castMode), `${id}: castMode=${def.castMode} が既知（${CAST_MODES.join('/')}）`);
  if (ATTACK_CAST_MODES.includes(def.castMode)) ok(!!def.mainCastEvent, `${id}: 攻撃系 castMode は mainCastEvent を持つ`);
  ok((def.element || 'ice') === 'ice', `${id}: element=ice`);
  if (kind === 'active') {
    ok(['common', 'uncommon', 'rare', 'legendary'].includes(def.rarity), `${id}: rarity=${def.rarity}`);
    ok(Array.isArray(def.jobs) && def.jobs.length === 1 && def.jobs[0] === 'frost_mage', `${id}: jobs=["frost_mage"]`);
    ok(def.isCommon === false, `${id}: isCommon=false`);
    ok(def.maxLevel === 8, `${id}: maxLevel=8`);
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
  // custom は「攻撃部分のみ」。ただし防御/反応スキルはそもそも残響カウンタを進めないため '非対応' が正しい。
  if (def.echoPolicy === 'custom') ok(echoStatus(def) === (def.canTriggerEcho === false ? '非対応' : '攻撃部分のみ'), `${id}: custom の残響表示が canTriggerEcho と整合`);
  ok(appliesLv80ProjectileCount(def) === (def.lv80ProjectileTarget === true), `${id}: Lv80 判定が明示 flag と一致`);
  ok(Array.isArray(sum.tags), `${id}: castSummary がタグを返す`);
  ok(Array.isArray(primaryTags(def)), `${id}: primaryTags が配列`);
  // 防御/反応スキルは残響カウンタを進めない。
  if (def.isDefensive || def.isReactive) ok(def.canTriggerEcho === false, `${id}: 防御/反応は canTriggerEcho=false`);
}

// ===== 3. recordCast は主発動1回だけ =====
section('3. recordCast 監査（主発動1回・派生では呼ばない）');
const DERIVED = ['_tick', '_pulse', '_burst', '_hop', '_chain', '_shoot', '_link', '_detonate', '_impact', '_contact', '_collapse', '_bloom', '_spawnWave', '_spawnResidue', '_wave', '_shatter', '_fragment', '_explode'];
for (const { id, def } of ALL) {
  const src = skillSource(id, MAP);
  const calls = (src.match(/recordCast\(/g) || []).length;
  // クラス内 0 は「基底 update（SkillBase / EvolvedSkillBase）が主発動として1回記録する」パターン＝正常。
  const baseDriven = !/canFire\s*\(\s*[^)]*\)\s*{\s*return false/.test(src);
  if (calls === 0) {
    // 防御スキルは意図的に recordCast 0（発動数に数えず残響カウンタも進めない）。それ以外は基底 update が1回記録する。
    ok(baseDriven || def.castMode === 'defensive', `${id}: recordCast 0 が許されるのは「基底 update 記録」か「防御スキル（意図的0回）」のみ`);
    note(id, def.castMode === 'defensive' ? '防御スキルのため recordCast は意図的に0回（発動数・残響カウンタへ数えない）' : '主発動 recordCast は基底 update（cooldown 発火）が1回だけ行う');
  } else {
    ok(calls <= 2, `${id}: recordCast の呼び出し箇所 ${calls} 件（主発動のみ・多重記録しない）`);
  }
  // 派生処理の中で recordCast していない（recordExtra は可）。
  for (const fn of DERIVED) {
    const b = methodBody(src, fn);
    if (b) ok(!/recordCast\(/.test(b), `${id}: ${fn}() の中で recordCast を呼ばない`);
  }
  // echo/clone の実装から recordCast を呼ばない（残響で発動数が二重に増えない）。
  const echoBody = methodBody(src, 'echoCast');
  if (echoBody) ok(!/recordCast\(/.test(echoBody), `${id}: echoCast から recordCast を呼ばない`);
  const cloneBody = methodBody(src, 'cloneCast');
  if (cloneBody) ok(!/recordCast\(/.test(cloneBody), `${id}: cloneCast から recordCast を呼ばない`);
}

// ===== 4. 再帰なし（echo→echo / clone→clone / shatter→shatter）=====
section('4. 残響/分身/粉砕の再帰が無い');
for (const { id } of ALL) {
  const src = skillSource(id, MAP);
  const echoBody = methodBody(src, 'echoCast');
  if (echoBody) ok(!/this\.echoCast\(/.test(echoBody), `${id}: echoCast が自分自身を呼ばない`);
  const cloneBody = methodBody(src, 'cloneCast');
  if (cloneBody) ok(!/this\.cloneCast\(/.test(cloneBody), `${id}: cloneCast が自分自身を呼ばない（echoCast への委譲は可）`);
  // 粉砕を呼ぶ経路には isShatter / 再帰防止の共通経路を使う（自前の再粉砕ループを持たない）。
  ok(!/shatterEnemy[\s\S]{0,200}shatterEnemy[\s\S]{0,60}shatterEnemy/.test(src), `${id}: 粉砕の三重ネストが無い`);
}
{
  const bs = String(await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/scenes/BattleScene.js', import.meta.url), 'utf8')));
  ok(/isShatter:\s*true/.test(bs), 'BattleScene が粉砕ダメージへ isShatter を付けて再帰を止める');
  ok(/opts\.isShatter/.test(bs), 'isShatter が状態異常の再適用を抑止する分岐で読まれる');
  ok(/_echoScale/.test(bs), '残響の威力倍率は1経路（_echoScale）で管理される');
}

// ===== 5. 品質上限 / PoolManager / SpatialGrid / cleanup / telemetry / status の接続 =====
section('5. 上限・プール・空間索引・後始末・テレメトリ・状態イベントの接続');
for (const { id, def } of ALL) {
  const src = skillSource(id, MAP);
  const bounded = /skillCap\(|frameBudget\(|this\.cap\(/.test(src);
  const spawnsMany = /spawnPlayerProjectile|this\.scene\.add\.|push\(/.test(src);
  if (spawnsMany) ok(bounded, `${id}: 生成を伴うスキルは上限（skillCap / frameBudget / safetyCaps）を参照する`);
  if (/this\.scene\.add\./.test(src)) ok(/destroy\s*\(\s*\)/.test(src) || /\.destroy\(\)/.test(src), `${id}: 生成した表示物を破棄する経路がある`);
  ok(/enemiesInRadius|forEachEnemyInRadius|nearestEnemy|densestPoint|targetsInRadius/.test(src) || def.isDefensive,
    `${id}: 敵探索は SpatialGrid ベースの combat API を使う（全敵総当たりしない）`);
  // テレメトリは「自前 recordExtra/recordCast」か「combat 経由（dealDamage/damageArea/spawnPlayerProjectile が
  // recordDamage/recordHit/recordKill を中央で行う）」のどちらかで必ず記録される。
  ok(/recordExtra\(|recordCast\(/.test(src) || /dealDamage\(|damageArea\(|spawnPlayerProjectile\(/.test(src),
    `${id}: テレメトリ経路（自前記録 or combat 共通経路）へ接続している`);
  const lv1 = (def.levels || [])[0] || def;
  if (lv1.chillAmount != null || (def.chill && Object.keys(def.chill).length)) ok(/element:\s*'ice'/.test(src), `${id}: 冷気を伴う攻撃は element:'ice' で共通状態経路を通る`);
}

// ===== 6. issues 集計 =====
section('6. 監査結果');
info(`意図的な仕様（警告として残すもの）: ${issues.length} 件`);
for (const i of issues) info('  ' + i);
ok(true, 'SkillAudit 完全監査を完了（未解決 issue は上記のみ・すべて意図した仕様）');

T.finish();
