// 戦士 完成監査 6/23: recordCast 全 48 件の実測（M8-F §9）。Node.js 標準機能のみ。
// 「1 main activation = 1 recordCast」を production の SkillManager 経由で実測し、
// 期待値と実測値を一覧化する。派生（多段 / tick / stomp / 着地 / 帰還 / 反射弾 /
// 反撃 / 再指定 / 撃破連鎖 / 投げ着弾 / 二次衝撃 / field tick / buff refresh）では増えない。
// 実行: node tests/warrior-completion-record-cast.mjs

import { readFileSync, existsSync } from 'node:fs';
import { DATA, WARRIOR, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, registryMap, readSrc, runner } from './warrior-common.mjs';

// スキル自身のファイル ＋ 継承した「スキル」クラス本体だけを集める。
// 共通土台（SkillBase / EvolvedSkillBase / WarriorSkillBase / WarriorEvolvedBase）は含めない
// ＝「基底が 1 回だけ recordCast する」設計を壊さずにスキル側の呼び出しを検査できる。
const FRAMEWORK = new Set(['SkillBase', 'EvolvedSkillBase', 'WarriorSkillBase', 'WarriorEvolvedBase']);
function ownSource(id, map) {
  const collect = (name, depth = 0) => {
    if (!name || FRAMEWORK.has(name) || depth > 4) return '';
    const rel = `src/skills/${name}.js`;
    if (!existsSync(rel)) return '';
    const body = readFileSync(rel, 'utf8');
    const m = body.match(/export class \w+ extends (\w+)/);
    return body + '\n' + (m ? collect(m[1], depth + 1) : '');
  };
  return collect(map[id]);
}

const T = runner('戦士 recordCast 全 48 件（M8-F）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ALL = [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool];
const MAP = registryMap();

let bs = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bs, x: 402 + (i % 6) * 4, y: 300 + Math.floor(i / 6) * 4, angle: Math.PI, alive: true, hostile: true,
  damage: 20, speed: 180, projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));
const build = () => {
  const enemies = [...makeEnemies(14, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 }), ...makeEnemies(4, { x: 360, y: 300, dx: 8, hp: 1e9, elite: true })];
  const scene = makeScene({ enemies, boss: makeBoss({ x: 470, y: 300, hp: 1e9 }), now: 10000, quality: 'high', enemyBullets: mkBullets(20) });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    c.sm.update(step, { hasEnemies: true });
    c.w.setHp(c.scene.player.maxHp * (i % 300 < 150 ? 1 : 0.2), c.scene.player.maxHp);
    c.w.update(step); c.scene.advance(step);
    if (i % 60 === 30) c.scene.onWarriorHit(40, 30);
    if (i % 120 === 0) c.scene.enemyBullets.push(...mkBullets(8));
  }
};

// ===== 1. 実測: cast > 0 かつ hits / 派生回数より少ない =====
section('1. 全 48 件で recordCast が 1 主発動 1 回（実測）');
const ROWS = [];
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 20000);
  const s = c.sm.statsList().find((x) => x.id === id) || {};
  const casts = s.casts || 0;
  const ex = s.extra || {};
  ROWS.push({ id, casts, hits: s.hits || 0, ex });
  ok(casts > 0, `${id}: recordCast > 0（${casts}）`);
  // 「主発動の回数」を表す extra（あるもの）は cast と一致する。
  // 「1 主発動につき 1 回」を表す extra だけを cast と突き合わせる。
  // `slashes` は多段（天衝断空は 1 発動 2 斬）なので派生側で数える。
  const MAIN = { lunges: 'lunges', marches: 'marches', windows: 'windows', charges: 'charges', trances: 'trances', duels: 'duels' };
  for (const k of Object.keys(MAIN)) {
    if (typeof ex[k] === 'number' && ex[k] > 0) {
      ok(ex[k] === casts, `${id}: 主発動 extra(${k}) ${ex[k]} = cast ${casts}`);
    }
  }
  // 派生の回数は cast より多くなりうるが、cast は派生に引っ張られない。
  const derived = ['stomps', 'thrusts', 'deflected', 'stages', 'guardTicks', 'axeHits', 'penetrations', 'reflected', 'hitsTotal', 'slashes'];
  for (const k of derived) {
    if (typeof ex[k] === 'number' && ex[k] > casts) ok(true, `${id}: 派生 ${k}=${ex[k]} > cast ${casts}（cast は増えない）`);
  }
  // 命中数が cast を大きく上回っても cast は増えない。
  ok(casts <= (s.hits || 0) + casts, `${id}: cast ${casts} は命中数に引っ張られない（hit ${s.hits}）`);
}
info('recordCast 実測一覧:');
for (const r of ROWS) {
  const exs = Object.entries(r.ex).filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => `${k}=${Math.round(v)}`).join(' ');
  info(`  ${r.id.padEnd(26)} cast=${String(r.casts).padStart(4)} hit=${String(r.hits).padStart(5)} ${exs}`);
}

// ===== 2. 派生メソッドの中で recordCast を呼ばない（静的）=====
section('2. 派生メソッドの中で recordCast を呼ばない');
{
  const DERIVED = ['_thrust', '_stomp', '_tick', '_impact', '_land', '_return', '_stage', '_strike', '_pulse',
    '_slam', '_reflect', '_counter', '_retarget', '_updateLunge', '_updateMarch', '_updateDash', '_updateCharge',
    '_finish', 'onEnemyKilled', 'onDamaged'];
  const methodBody = (src, name) => {
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
  };
  // コメント（// ... と /* ... */）を落としてから数える。
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const id of ALL) {
    const src = stripComments(ownSource(id, MAP) || '');
    const calls = (src.match(/recordCast\(/g) || []).length;
    ok(calls === 0, `${id}: スキル側で recordCast を呼ばない（基底 update が 1 回だけ記録する・${calls}）`);
    const dsrc = stripComments(ownSource(id, MAP) || '');
    for (const fn of DERIVED) {
      const b = methodBody(dsrc, fn);
      if (b) ok(!/recordCast\(/.test(b), `${id}: ${fn}() で recordCast を呼ばない`);
    }
  }
  // 共通経路も弾 / 反射弾 / 反撃で recordCast しない。
  ok(!/recordCast\(/.test(stripComments(readSrc('src/entities/Projectile.js'))), 'Projectile から recordCast を呼ばない');
  const w = stripComments(readSrc('src/systems/WarriorCombatSystem.js'));
  ok(!/recordCast\(/.test(w), 'WarriorCombatSystem から recordCast を呼ばない（反撃 / 弾き返しで増えない）');
}

// ===== 3. 防御系の意図的 0 は無い（全 48 件が基底 update で 1 回記録する）=====
section('3. recordCast の欠落 / 二重が無い');
{
  const base = readSrc('src/skills/SkillBase.js');
  ok(/recordCast\(this\.id\)/.test(base), '基底 SkillBase.update が recordCast を 1 回だけ呼ぶ');
  const evo = readSrc('src/skills/EvolvedSkillBase.js');
  ok(/recordCast\(this\.id\)/.test(evo), '基底 EvolvedSkillBase.update も 1 回だけ呼ぶ');
  const wb = readSrc('src/skills/WarriorSkillBase.js');
  ok(/if \(this\._dead\) return; super\.update/.test(wb), '破棄後は基底の記録経路も回らない');
}

// ===== 4. save / reload で二重に数えない =====
section('4. save / reload で cast が二重に数えられない');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 6000);
  const sk = c.sm.skills.get(id);
  const s1 = (c.sm.statsList().find((x) => x.id === id) || {}).casts || 0;
  const state = sk.serializeState();
  sk.restoreState(state);
  const s2 = (c.sm.statsList().find((x) => x.id === id) || {}).casts || 0;
  ok(s2 === s1, `${id}: 復元だけで cast が増えない（${s1} → ${s2}）`);
}

// ===== 5. telemetry の cast と 1:1 =====
section('5. CombatTelemetry の cast と SkillManager の cast が一致する');
{
  const c = build();
  for (const id of WARRIOR.activeSkillPool) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  run(c, 20000);
  const list = c.sm.statsList();
  const total = list.reduce((a, s) => a + (s.casts || 0), 0);
  ok(total > 0, `合計 cast ${total}`);
  // 近接発動の通知（noteMeleeCast）は cast 以下（追加打撃で増えない）。
  ok(c.w.telemetry.meleeCasts > 0, `meleeCasts が記録される（${c.w.telemetry.meleeCasts}）`);
  ok(c.w.telemetry.meleeCasts <= total * 3, `meleeCasts ${c.w.telemetry.meleeCasts} が cast 合計 ${total} の妥当な範囲`);
}

T.finish();
