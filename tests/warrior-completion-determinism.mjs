// 戦士 完成監査 21/23: 決定論（M8-F §23）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-determinism.mjs
import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, EXPECTED, WARRIOR, draftCatalog, jobPools, seedRange, makeScene, makeEnemies, makeBoss,
  makeWarrior, bootRuntime, registryMap, skillSourceDeep, readSrc, runner } from './warrior-common.mjs';
import { simulateRun, STRATEGIES } from './warrior-draft-sim.mjs';
const T = runner('戦士 決定論 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ALL = [...EXPECTED.actives, ...EXPECTED.evolutions];
let bs = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bs, x: 400 + (i % 5) * 6, y: 300 + Math.floor(i / 5) * 6, angle: Math.PI, alive: true, hostile: true,
  damage: 20, speed: 180, projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));

// ===== 1. 乱数源に触れていない =====
section('1. 戦闘判定で Math.random / Date.now / performance.now / new Date を使わない');
{
  const MAP = registryMap();
  for (const id of ALL) {
    const src = skillSourceDeep(id, MAP) || '';
    for (const bad of [/Math\.random/, /Date\.now/, /performance\.now/, /new Date\(/]) {
      ok(!bad.test(src), `${id}: ${String(bad)} を使わない`);
    }
  }
  for (const rel of ['src/systems/WarriorCombatSystem.js', 'src/systems/SkillDraftManager.js',
    'src/systems/SeededRandom.js', 'src/systems/poolEligibility.js', 'src/systems/SkillCatalog.js']) {
    const src = readSrc(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok(!/Math\.random/.test(src), `${rel}: Math.random を使わない`);
  }
}

// ===== 2. ランタイムが byte-identical =====
section('2. 48 スキルのランタイムが同入力で byte-identical');
const trace = (id, withBoss = false, steps = 500) => {
  bs = 0;
  const enemies = [...makeEnemies(14, { x: 340, y: 300, dx: 10, dy: 4, hp: 1e9 }), ...makeEnemies(4, { x: 360, y: 300, dx: 8, hp: 1e9, elite: true })];
  const scene = makeScene({ enemies, boss: withBoss ? makeBoss({ x: 500, y: 300, hp: 1e9 }) : null,
    now: 10000, quality: 'high', enemyBullets: mkBullets(20) });
  const w = makeWarrior(WarriorCombatSystem, scene, { mods: { killHealMult: 1 } });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel(id); try { sm.setLevel(id, 8); } catch (e) { void e; }
  const lines = [];
  for (let i = 0; i < steps; i++) {
    sm.update(16, { hasEnemies: true });
    w.setHp(scene.player.maxHp * (i % 200 < 100 ? 1 : 0.2), scene.player.maxHp);
    w.update(16); scene.advance(16);
    if (i % 40 === 20) scene.onWarriorHit(35, 25);
    if (i % 100 === 0) scene.enemyBullets.push(...mkBullets(6));
    if (i % 25 === 0) {
      const s = sm.statsList().find((x) => x.id === id) || {};
      const t = w.telemetry;
      lines.push([i, `c=${s.casts || 0}`, `h=${s.hits || 0}`, `d=${(s.damage || 0).toFixed(4)}`,
        `p=${scene.player.x.toFixed(4)},${scene.player.y.toFixed(4)}`,
        `f=${w.fury.toFixed(4)}`, `k=${w.combo.toFixed(4)}`, `n=${scene.calls.length}`,
        `poise=${t.poiseDamage.toFixed(3)}/${t.bossStanceBreaks}`, `ex=${t.executions}`,
        `L=${t.lineThrusts}/${t.linePenetrations}`, `D=${t.duelStarts}/${t.duelHits}/${w.duelSeq}`,
        `T=${t.tranceStarts}/${Math.round(t.tranceUptimeMs)}`, `M=${t.marchStomps}/${Math.round(t.marchDistance)}`,
        `F=${t.deflected}/${t.reflectedSpawned}/${scene.reflected.length}`,
        `G=${t.grabs}/${t.throwImpacts}`, `C=${t.counters}`, `U=${t.unyieldingTriggers}`,
        `enemy=${enemies.map((e) => `${e.x.toFixed(2)}:${e.y.toFixed(2)}:${(e._poise || 0).toFixed(1)}`).join('|')}`].join(' '));
    }
  }
  return sha(lines.join('\n'));
};
for (const id of ALL) {
  const a = trace(id); const b = trace(id);
  ok(a === b, `${id}: 2 回の trace が一致（${a.slice(0, 12)}）`);
}
section('2b. ボスがいる状況でも byte-identical（対象選択・優先度が揺れない）');
for (const id of ['duel_challenge', 'king_slayer_duel', 'chain_hook', 'relentless_combo', 'execution_strike',
  'battlefield_throw', 'piercing_lunge', 'weapon_deflection', 'earthshaker_march']) {
  const a = trace(id, true, 400); const b = trace(id, true, 400);
  ok(a === b, `${id}: ボスありでも一致（${a.slice(0, 12)}）`);
}

// ===== 3. 抽選が byte-identical =====
section('3. 抽選（候補列 / guidance / pity / synergy）が byte-identical');
{
  const catalog = draftCatalog();
  const job = jobPools('warrior');
  const gen = () => sha(seedRange(150).map((s) => {
    const owned = { active: {}, passive: {} };
    if (s % 3 === 1) for (const id of EXPECTED.actives.slice(0, 3)) owned.active[id] = 6;
    if (s % 5 === 2) for (const id of EXPECTED.passives.slice(0, 2)) owned.passive[id] = 3;
    const d = new SkillDraftManager({ rarityWeights: DATA.skillConfig.rarityWeights,
      synergy: DATA.skillConfig.synergy, guidance: DATA.skillConfig.guidance });
    const c = d._generate({ catalog, job, owned, jobId: 'warrior',
      slots: { active: { used: Object.keys(owned.active).length, max: 8 }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
      evolvables: [], need: 3 }, s);
    return `${s}:${c.map((x) => `${x.id}/${x.kind}/${x.rarity}/${(x.guidanceMult || 1).toFixed(4)}`).join(',')}`;
  }).join('\n'));
  const a = gen(); const b = gen();
  ok(a === b, `候補列 + guidance 倍率が一致（${a.slice(0, 16)}）`);
}

// ===== 4. 周回結果が byte-identical =====
section('4. 周回全体（simulateRun）の結果が byte-identical');
for (const strategy of STRATEGIES) {
  const runOnce = () => sha(seedRange(40).map((seed) => {
    const r = simulateRun({ seed, slotActive: 6, slotPassive: 4, levelUps: 90, strategy });
    return [seed, [...r.evolutionTakenAt.keys()].sort().join('+'),
      [...r.acquired.entries()].sort().map(([k, v]) => `${k}=${v}`).join(','),
      r.candidateNone, r.saturatedNone, r.unsaturatedNone, r.pityTriggered, r.synergyAssisted].join('|');
  }).join('\n'));
  const a = runOnce(); const b = runOnce();
  ok(a === b, `${strategy}: 周回結果が一致（${a.slice(0, 12)}）`);
}

// ===== 5. 保存 → 復元 → 続行 =====
section('5. 保存 → 復元 → 続行が byte-identical');
for (const id of ['duel_challenge', 'battle_trance', 'weapon_deflection', 'earthshaker_march', 'chain_hook', 'blade_guard']) {
  const play = () => {
    bs = 0;
    const enemies = makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality: 'high', enemyBullets: mkBullets(12) });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene); scene.skills = sm;
    sm.acquireOrLevel(id); sm.setLevel(id, 8);
    for (let i = 0; i < 200; i++) { sm.update(16, { hasEnemies: true }); w.update(16); scene.advance(16); }
    const buffs = w.serializeTimedBuffs(); const st = sm.skills.get(id).serializeState();
    w.restoreTimedBuffs(buffs); sm.skills.get(id).restoreState(st);
    for (let i = 0; i < 200; i++) { sm.update(16, { hasEnemies: true }); w.update(16); scene.advance(16); }
    const t = w.telemetry;
    return sha(`${t.duelStarts}/${t.tranceStarts}/${t.deflectWindows}/${t.deflected}/${t.marchStomps}/${t.chainPulls}/${t.guardTicks}/${Math.round(t.duelUptimeMs)}/${Math.round(t.tranceUptimeMs)}/${scene.calls.length}/${scene.player.x.toFixed(4)}`);
  };
  ok(play() === play(), `${id}: 保存 / 復元をはさんでも一致`);
}

// ===== 6. 火 / 氷の非回帰ハッシュ =====
section('6. 火 / 氷の候補列 300 seed / 48 スキルのランタイムが M8-A 時点と完全一致');
{
  const BASE = {
    draft: { flame_witch: '15a8585c4f60681ba2b58da959771c0ae404a5dbad527b51cfb618156e709b3f',
      frost_mage: 'bd38bcf580523b7a26d21faee0734b0595539e996c1b33a747fafc816a9e9abb' },
    runtime: { flame_witch: '1f0f2c1805bf06fa6b0f98ae00870376af1a8155aed9f9de608b8345b3c2ad75',
      frost_mage: '029a44bd73b485aee5aad74c37de7cc41645fbbe3b913cc30e6a4ea896597dd9' },
  };
  const catalog = draftCatalog();
  for (const jid of ['flame_witch', 'frost_mage']) {
    const job = jobPools(jid);
    const lines = seedRange(300).map((s) => {
      const d = new SkillDraftManager({});
      return d._generate({ catalog, job, owned: { active: {}, passive: {} },
        slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, s)
        .map((x) => `${x.id}:${x.kind}:${x.rarity}`).join('|');
    });
    const h = sha(lines.join('\n'));
    ok(h === BASE.draft[jid], `${jid}: 候補列 hash が一致（${h.slice(0, 16)}）`);
  }
  const common = await import('./flame-audit-common.mjs');
  const boot = await common.bootRuntime();
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    const lines = [];
    for (const id of [...j.activeSkillPool, ...j.evolutionPool]) {
      const enemies = common.makeEnemies(12, { x: 320, y: 300, dy: 8 });
      const scene = common.makeScene({ enemies, seed: 12345, now: 1000 });
      const sm = new boot.SkillManager(scene); scene.skills = sm;
      sm.acquireOrLevel(id);
      if (DATA.skills.some((s) => s.id === id)) { try { sm.setLevel(id, 8); } catch (e) { void e; } }
      for (let i = 0; i < 120; i++) { sm.update(16, { hasEnemies: true }); scene.advance(16); }
      const st = sm.statsList().find((s) => s.id === id) || {};
      lines.push(`${id} casts=${st.casts} hits=${st.hits} dmg=${(st.damage || 0).toFixed(4)} calls=${scene.calls.length}`);
    }
    const h = sha(lines.join('\n'));
    ok(h === BASE.runtime[jid], `${jid}: ランタイム hash が一致（${h.slice(0, 16)}）`);
  }
}

// ===== 7. 状態異常 RNG カーソルが変わらない =====
section('7. 状態異常 RNG / passive プール / 保存の非回帰');
{
  const se = readSrc('src/systems/StatusEffectManager.js');
  ok(!/warrior|duel|trance|deflect/i.test(se), 'StatusEffectManager に戦士固有の記述が無い');
  const fs = readSrc('src/systems/FreezeSystem.js');
  ok(!/warrior|duel|trance|deflect/i.test(fs), 'FreezeSystem に戦士固有の記述が無い');
  ok((DATA.statusEffects.statusEffects || []).length === 5, `共通状態異常は 5 種のまま（${(DATA.statusEffects.statusEffects || []).length}）`);
  // 火 / 氷の passive プールは 4 種のまま。
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    ok((j.passiveSkillPool || []).length === 4, `${jid}: passive 4 種のまま`);
    for (const id of WARRIOR.passiveSkillPool || []) ok(!(j.passiveSkillPool || []).includes(id), `${jid}: ${id} が混ざらない`);
  }
}

T.finish();
