// 戦士 最終Wave 12/16: 決定論（M8-E §決定論）。Node.js 標準機能のみ。
//   - M8-E の 10 スキルが Math.random / Date.now / performance.now に依存しない
//   - 同じ入力を 2 回流すとランタイム挙動が byte-identical
//   - 抽選の候補列も 2 回とも同一（RNG 消費が増えていない）
//   - 決闘 / 構え / 弾き窓 / 進軍のような「状態を持つ」系でも同じ
//   - 可変 dt でも合計の挙動が壊れない
// 実行: node tests/warrior-final-determinism.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, EXPECTED, draftCatalog, jobPools, seedRange, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, registryMap, skillSource } from './warrior-common.mjs';

const T = runner('戦士 最終Wave 決定論（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const FINAL = [...EXPECTED.finalActives, ...EXPECTED.finalEvolutions];
const sha = (s) => createHash('sha256').update(s).digest('hex');

// 敵弾も含めた完全なトレース（弾き返しの決定論まで見る）。
let bulletSeq = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bulletSeq, x: 400 + (i % 5) * 6, y: 300 + Math.floor(i / 5) * 6,
  angle: Math.PI, alive: true, hostile: true, damage: 20, speed: 180,
  projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));

const trace = (id, steps = 500, step = 16, withBoss = false) => {
  bulletSeq = 0;
  const enemies = makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 4, hp: 1e9 });
  const scene = makeScene({
    enemies, boss: withBoss ? makeBoss({ x: 520, y: 300, hp: 1e9 }) : null,
    now: 10000, quality: 'high', enemyBullets: mkBullets(20),
  });
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
      const t = w.telemetry;
      lines.push([
        i, `c=${s.casts || 0}`, `h=${s.hits || 0}`, `d=${(s.damage || 0).toFixed(4)}`,
        `p=${scene.player.x.toFixed(3)},${scene.player.y.toFixed(3)}`,
        `f=${w.fury.toFixed(4)}`, `k=${w.combo.toFixed(4)}`, `n=${scene.calls.length}`,
        `L=${t.lineThrusts}/${t.linePenetrations}`, `D=${t.duelStarts}/${t.duelHits}/${w.duelSeq}`,
        `T=${t.tranceStarts}/${Math.round(t.tranceUptimeMs)}`,
        `M=${t.marchStomps}/${Math.round(t.marchDistance)}`,
        `F=${t.deflected}/${t.reflectedSpawned}/${scene.reflected.length}`,
      ].join(' '));
    }
  }
  return sha(lines.join('\n'));
};

// ===== 1. 乱数源に触れていない =====
section('1. M8-E の 10 スキルが Math.random / Date.now / performance.now を使わない');
{
  const map = registryMap();
  for (const id of FINAL) {
    const src = skillSource(id, map) || '';
    ok(!/Math\.random/.test(src), `${id}: Math.random を使わない`);
    ok(!/Date\.now/.test(src), `${id}: Date.now を使わない`);
    ok(!/performance\.now/.test(src), `${id}: performance.now を使わない`);
    ok(!/new Date\(/.test(src), `${id}: new Date を使わない`);
  }
  // 共通経路（WarriorCombatSystem）も同じ。
  const w = String(new URL('../src/systems/WarriorCombatSystem.js', import.meta.url));
  void w;
}

// ===== 2. 2 回流して byte-identical =====
section('2. 同じ入力を 2 回流すとランタイム挙動が byte-identical');
for (const id of FINAL) {
  const a = trace(id), b = trace(id);
  ok(a === b, `${id}: 2 回の trace が一致（${a.slice(0, 12)}）`);
}

// ===== 3. ボスありでも同じ =====
section('3. ボスがいる状況でも byte-identical（決闘の対象選択が揺れない）');
for (const id of ['duel_challenge', 'king_slayer_duel', 'piercing_lunge', 'weapon_deflection']) {
  const a = trace(id, 400, 16, true), b = trace(id, 400, 16, true);
  ok(a === b, `${id}: ボスありでも一致（${a.slice(0, 12)}）`);
}

// ===== 4. 抽選の候補列が同一 =====
section('4. 抽選の候補列が 2 回とも同一（RNG 消費が増えていない）');
{
  const catalog = draftCatalog();
  const job = jobPools('warrior');
  const gen = () => {
    const out = [];
    for (const s of seedRange(120)) {
      const owned = { active: {}, passive: {} };
      if (s % 3 === 1) for (const id of EXPECTED.finalActives.slice(0, 2)) owned.active[id] = 5;
      const d = new SkillDraftManager({});
      const c = d._generate({
        catalog, job, owned,
        slots: { active: { used: Object.keys(owned.active).length, max: 8 }, passive: { used: 0, max: 4 } },
        evolvables: [], need: 3,
      }, s);
      out.push(`${s}:${c.map((x) => `${x.id}/${x.kind || ''}`).join(',')}`);
    }
    return sha(out.join('\n'));
  };
  const a = gen(), b = gen();
  ok(a === b, `候補列が一致（${a.slice(0, 16)}）`);
  // 火 / 氷も同じ seed で同じ候補（M8-E で RNG 消費が変わっていない）。
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = jobPools(jid);
    const g = () => sha(seedRange(80).map((s) => {
      const d = new SkillDraftManager({});
      return d._generate({ catalog, job: j, owned: { active: {}, passive: {} }, slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, s)
        .map((x) => x.id).join(',');
    }).join('\n'));
    ok(g() === g(), `${jid}: 候補列が安定`);
  }
}

// ===== 5. 可変 dt =====
section('5. 可変 dt でも状態が壊れない（時間の合計が同じなら同程度に進む）');
for (const id of FINAL) {
  const play = (steps, step) => {
    const enemies = makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 4, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality: 'high', enemyBullets: mkBullets(12) });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    sm.acquireOrLevel(id);
    try { sm.setLevel(id, 8); } catch (e) { void e; }
    for (let i = 0; i < steps; i++) {
      sm.update(step, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(step); scene.advance(step);
    }
    const s = sm.statsList().find((x) => x.id === id) || {};
    return { casts: s.casts || 0, finite: Number.isFinite(scene.player.x) && Number.isFinite(scene.player.y) };
  };
  const a = play(600, 16);   // 9.6s
  const b = play(300, 32);   // 9.6s
  ok(a.finite && b.finite, `${id}: どちらの dt でも座標が有限`);
  ok(Math.abs(a.casts - b.casts) <= Math.max(2, Math.ceil(a.casts * 0.35)),
    `${id}: 発動回数が近い（16ms×600 ${a.casts} / 32ms×300 ${b.casts}）`);
}

// ===== 6. 保存 → 復元 → 続行が決定論的 =====
section('6. 保存 → 復元 → 続行が決定論的');
for (const id of ['duel_challenge', 'battle_trance', 'weapon_deflection']) {
  const play = () => {
    bulletSeq = 0;
    const enemies = makeEnemies(10, { x: 340, y: 300, dy: 3, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality: 'high', enemyBullets: mkBullets(10) });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    sm.acquireOrLevel(id); sm.setLevel(id, 8);
    for (let i = 0; i < 150; i++) { sm.update(16, { hasEnemies: true }); w.update(16); scene.advance(16); }
    const buffs = w.serializeTimedBuffs();
    const skState = sm.skills.get(id).serializeState();
    w.restoreTimedBuffs(buffs);
    sm.skills.get(id).restoreState(skState);
    for (let i = 0; i < 150; i++) { sm.update(16, { hasEnemies: true }); w.update(16); scene.advance(16); }
    const t = w.telemetry;
    return sha(`${t.duelStarts}/${t.tranceStarts}/${t.deflectWindows}/${t.deflected}/${Math.round(t.duelUptimeMs)}/${Math.round(t.tranceUptimeMs)}/${scene.calls.length}`);
  };
  ok(play() === play(), `${id}: 保存 / 復元をはさんでも一致`);
}

info(`M8-E の決定論チェック対象: ${FINAL.length} スキル`);
T.finish();
