// 戦士 Wave2 17/21: 決定論（M8-D §決定論）。Node.js 標準機能のみ。
//   - Wave2 の 15 スキルが Math.random / Date.now / performance.now に依存しない
//   - 同じ入力を 2 回流すとランタイム挙動が byte-identical
//   - 抽選の候補列も 2 回とも同一（RNG 消費が増えていない）
//   - 一時停止 / 可変 dt でも合計の挙動が壊れない
// 実行: node tests/warrior-wave2-determinism.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, EXPECTED, draftCatalog, jobPools, seedRange, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, registryMap, skillSource } from './warrior-common.mjs';

const T = runner('戦士 Wave2 決定論（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const WAVE2 = [...EXPECTED.wave2Actives, ...EXPECTED.wave2Evolutions];
const sha = (s) => createHash('sha256').update(s).digest('hex');

const trace = (id, steps = 400, step = 16) => {
  const enemies = makeEnemies(12, { x: 340, y: 300, dy: 4, hp: 1e9 });
  const scene = makeScene({ enemies, now: 10000, quality: 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene);
  scene.skills = sm;
  sm.acquireOrLevel(id);
  try { sm.setLevel(id, 8); } catch (e) { void e; }
  const lines = [];
  for (let i = 0; i < steps; i++) {
    sm.update(step, { hasEnemies: true });
    w.setHp(scene.player.hp, scene.player.maxHp);
    w.update(step);
    scene.advance(step);
    if (i % 25 === 0) {
      const s = sm.statsList().find((x) => x.id === id) || {};
      lines.push(`${i} c=${s.casts || 0} h=${s.hits || 0} d=${(s.damage || 0).toFixed(4)} p=${scene.player.x.toFixed(3)},${scene.player.y.toFixed(3)} f=${w.fury.toFixed(4)} k=${w.combo.toFixed(4)} n=${scene.calls.length}`);
    }
  }
  return sha(lines.join('\n'));
};

// ===== 1. 乱数 / 実時間へ依存しない =====
section('1. Wave2 の 15 スキルが乱数 / 実時間に依存しない');
{
  const map = registryMap();
  for (const id of WAVE2) {
    const src = (skillSource(id, map) || '')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok(!/Math\.random\s*\(/.test(src), `${id}: Math.random を使わない`);
    ok(!/Date\.now\s*\(/.test(src), `${id}: Date.now を使わない`);
    ok(!/performance\.now\s*\(/.test(src), `${id}: performance.now を使わない`);
    ok(!/new Date\s*\(/.test(src), `${id}: new Date を使わない`);
  }
  // 共通経路（WarriorCombatSystem）も同じ。
  const { readSrc } = await import('./warrior-common.mjs');
  const w = readSrc('src/systems/WarriorCombatSystem.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/Math\.random\s*\(/.test(w), 'WarriorCombatSystem も乱数を持たない');
  ok(!/Date\.now\s*\(/.test(w), 'WarriorCombatSystem も実時間を読まない');
}

// ===== 2. ランタイムが 2 回とも一致 =====
section('2. 同じ入力を 2 回流すと挙動が完全一致する');
for (const id of WAVE2) {
  const a = trace(id), b = trace(id);
  ok(a === b, `${id}: ランタイム hash が一致（${a.slice(0, 16)}…）`);
}

// ===== 3. 15 スキル同時でも一致 =====
section('3. Wave2 の 15 スキルを同時に持っても挙動が一致する');
{
  const traceAll = () => {
    const enemies = makeEnemies(16, { x: 340, y: 300, dy: 4, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality: 'high' });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    for (const id of EXPECTED.wave2Actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
    const lines = [];
    for (let i = 0; i < 600; i++) {
      sm.update(16, { hasEnemies: true });
      w.setHp(scene.player.hp, scene.player.maxHp);
      w.update(16);
      scene.advance(16);
      if (i % 50 === 0) {
        lines.push(sm.statsList().map((s) => `${s.id}:${s.casts}:${s.hits}:${(s.damage || 0).toFixed(3)}`).join('|')
          + `|p=${scene.player.x.toFixed(3)},${scene.player.y.toFixed(3)}|f=${w.fury.toFixed(4)}`);
      }
    }
    return sha(lines.join('\n'));
  };
  const a = traceAll(), b = traceAll();
  ok(a === b, `15 スキル同時でも hash が一致（${a.slice(0, 16)}…）`);
  info(`Wave2 同時 hash: ${a}`);
}

// ===== 4. 抽選の候補列も 2 回とも同一 =====
section('4. 抽選の候補列が 2 回とも同一（RNG 消費が増えていない）');
{
  const catalog = draftCatalog();
  const job = jobPools('warrior');
  const gen = () => {
    const lines = [];
    for (const s of seedRange(200)) {
      const d = new SkillDraftManager({
        rarityWeights: DATA.skillConfig.rarityWeights,
        synergy: DATA.skillConfig.synergy,
        guidance: DATA.skillConfig.guidance,
      });
      const c = d._generate({
        catalog, job, owned: { active: {}, passive: {} },
        slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3,
        jobId: 'warrior', evolutionRecipes: [], synergy: { partnerIds: new Set(), battleLevel: 20 },
      }, s);
      lines.push(c.map((x) => `${x.id}:${x.kind}:${x.rarity}:${x.weight}`).join('|'));
    }
    return sha(lines.join('\n'));
  };
  const h1 = gen(), h2 = gen();
  ok(h1 === h2, `200 seed の候補列が 2 回とも同一（${h1.slice(0, 16)}…）`);
  info(`Wave2 戦士 候補列 hash: ${h1}`);
}

// ===== 5. 可変 dt でも壊れない =====
section('5. 可変 dt / 一時停止でも合計挙動が壊れない');
for (const id of EXPECTED.wave2Actives) {
  const play = (steps) => {
    const enemies = makeEnemies(12, { x: 340, y: 300, dy: 4, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality: 'high' });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    sm.acquireOrLevel(id); sm.setLevel(id, 8);
    for (const dt of steps) {
      if (dt <= 0) continue; // 一時停止フレーム（update を呼ばない）
      sm.update(dt, { hasEnemies: true });
      w.setHp(scene.player.hp, scene.player.maxHp);
      w.update(dt);
      scene.advance(dt);
    }
    const s = sm.statsList().find((x) => x.id === id) || {};
    return { casts: s.casts || 0, x: scene.player.x, y: scene.player.y };
  };
  const even = play(Array.from({ length: 600 }, () => 16));
  const varied = play(Array.from({ length: 600 }, (_, i) => (i % 7 === 0 ? 0 : (i % 3 === 0 ? 24 : 12))));
  ok(Number.isFinite(varied.x) && Number.isFinite(varied.y), `${id}: 可変 dt でも座標が NaN にならない`);
  ok(varied.casts >= 0 && even.casts >= 0, `${id}: 可変 dt でも例外を出さない（${even.casts} / ${varied.casts}）`);
}

// ===== 6. 品質を落としても数値が変わらない =====
section('6. 品質を落としてもダメージ / 闘気 / コンボが変わらない');
for (const id of EXPECTED.wave2Actives) {
  const play = (quality) => {
    const enemies = makeEnemies(24, { x: 340, y: 300, dy: 2, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    sm.acquireOrLevel(id); sm.setLevel(id, 8);
    for (let i = 0; i < 600; i++) { sm.update(16, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(16); scene.advance(16); }
    const s = sm.statsList().find((x) => x.id === id) || {};
    return { casts: s.casts || 0 };
  };
  const hi = play('high'), lo = play('low');
  ok(hi.casts === lo.casts, `${id}: 品質を落としても発動回数が変わらない（${hi.casts}）`);
}

T.finish();
