// M8-A（火の魔女 完成監査）の共通ヘルパ。Node.js 標準機能のみ・外部ライブラリなし。
// 12 本の監査テストが同じ「実データ読み込み・カタログ構築・production 抽選コンテキスト・Phaser モック」を共有し、
// 判定ロジックを各テストで作り直さないための土台（抽選/監査ロジック自体は src/ の production 実装をそのまま使う）。
//
// M7-E の tests/frost-audit-common.mjs と同じ設計。差分は
//   - 対象ジョブが flame_witch（element=fire）であること
//   - 火の魔女スキルが使う combat / scene API（rng・projPool・死亡イベント・炎上索引・HP消費・弾吸収・分身）を
//     ヘッドレスで再現していること
// の 2 点だけで、抽選・監査の「正」は氷側と同じ production モジュールを共有する。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const loadData = (n) => JSON.parse(readFileSync(join(REPO, 'data', n), 'utf8'));
export const readSrc = (rel) => readFileSync(join(REPO, rel), 'utf8');
export const srcExists = (rel) => existsSync(join(REPO, rel));

export const DATA = {
  skills: loadData('skills.json').skills,
  passives: loadData('passives.json').passives,
  evolutions: loadData('skill-evolutions.json').evolutions,
  jobs: loadData('jobs.json').jobs,
  balance: loadData('balance.json'),
  skillConfig: loadData('skill-config.json'),
  statusEffects: loadData('status-effects.json'),
  jobProgression: loadData('job-progression.json'),
  skillMastery: loadData('skill-mastery.json'),
};

export const FLAME = DATA.jobs.find((j) => j.id === 'flame_witch');
export const FROST = DATA.jobs.find((j) => j.id === 'frost_mage');

// 期待値（M6-E 完了時点のカタログ規模。M8-A は新規追加をしない）。
// Job Lv80「発射数+1」対象は明示 flag（lv80ProjectileTarget:true）の 6 種のみ。
export const EXPECTED = {
  activeCount: 30, passiveCount: 4, evolutionCount: 18,
  lv80Targets: ['fireball', 'flame_lance', 'scatter_flame', 'homing_wisp', 'ricochet_ember', 'core_overdrive'],
};

// SkillManager の REGISTRY から id → クラス名を取り出す（実装クラスの実在確認・ソース走査に使う）。
export function registryMap() {
  const src = readSrc('src/systems/SkillManager.js');
  const map = {};
  for (const m of src.matchAll(/([a-z0-9_]+):\s*([A-Za-z0-9_]+Skill),/g)) map[m[1]] = m[2];
  return map;
}
export function registeredIds() { return Object.keys(registryMap()); }

// スキル実装クラスのソース（存在しなければ null）。
export function skillSource(id, map = registryMap()) {
  const cls = map[id];
  if (!cls) return null;
  const rel = 'src/skills/' + cls + '.js';
  return srcExists(rel) ? readSrc(rel) : null;
}

// DataManager.draftCatalog() 相当（production の SkillDraftManager がそのまま食える形）。
export function draftCatalog() {
  const pick = (s, category) => ({
    id: s.id, category: category || s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel,
    enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites,
    conflicts: s.conflicts, unlockCondition: s.unlockCondition,
  });
  return [...DATA.skills.map((s) => pick(s)), ...DATA.passives.map((p) => pick(p, 'passive'))];
}

export function jobPools(jobId) {
  const j = DATA.jobs.find((x) => x.id === jobId);
  return { activeSkillPool: j.activeSkillPool, passiveSkillPool: j.passiveSkillPool || [] };
}

// 連番 seed（範囲固定＝決定論）。
export function seedRange(n, from = 1) { const a = []; for (let i = from; i < from + n; i++) a.push(i); return a; }

// ---- 小さなテストランナー（既存テストと同じ体裁）----
export function runner(title) {
  let pass = 0, fail = 0;
  return {
    ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg); } },
    section(t) { console.log(t); },
    info(t) { console.log('  ' + t); },
    finish() {
      console.log('');
      if (fail) { console.error(`✗ ${title} 失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
      console.log(`✓ ${title} 成功: ${pass} 件すべて通過`);
      process.exit(0);
    },
  };
}

// ---- Phaser 非依存の軽量モック（ヘッドレスでスキルクラスを駆動する）----
export function stubObj() {
  const t = { x: 0, y: 0, width: 0, height: 0, radius: 0, alpha: 1, active: true, visible: true, body: { velocity: { x: 0, y: 0 } } };
  const p = new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; if (k === 'then') return undefined; return () => p; },
    set(o, k, v) { o[k] = v; return true; },
  });
  return p;
}

// 決定論的な戦闘 RNG（scene.rng）。mulberry32 と同型の軽量実装で、seed が同じなら列も同じ。
export function makeRng(seed = 0x1f1a3e77) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// combat API・skills API をひととおり備えたヘッドレス scene。calls に呼び出しを記録する。
// opts: { enemies, boss, quality, now, absorb, deathEvents, seed }
export function makeScene(opts = {}) {
  const calls = [];
  let nowMs = opts.now || 1000;
  const enemies = opts.enemies || [];
  const rng = makeRng(opts.seed != null ? opts.seed : 0x1f1a3e77);
  const timers = [];
  const scene = {
    calls,
    time: {
      get now() { return nowMs; },
      delayedCall: (d, fn) => { timers.push({ left: d, fn }); return stubObj(); },
    },
    advance(ms) {
      nowMs += ms;
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].left -= ms;
        if (timers[i].left <= 0) { const t = timers.splice(i, 1)[0]; try { t.fn(); } catch (e) { void e; } }
      }
    },
    pendingTimers() { return timers.length; },
    rng,
    _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'fire',
    gameOver: false,
    add: {
      image: () => stubObj(), rectangle: () => stubObj(), circle: () => stubObj(), ellipse: () => stubObj(),
      graphics: () => stubObj(), text: () => stubObj(), container: () => stubObj(), sprite: () => stubObj(),
      particles: () => stubObj(), line: () => stubObj(), triangle: () => stubObj(), star: () => stubObj(),
    },
    cameras: { main: { worldView: { x: 0, y: 0, width: 640, height: 360, centerX: 320, centerY: 180, right: 640, bottom: 360 }, shake: () => {}, flash: () => {} } },
    effects: new Proxy({}, { get: () => () => {} }),
    tweens: { add: (cfg) => { if (cfg && cfg.onComplete) cfg.onComplete(); return stubObj(); }, killTweensOf: () => {} },
    player: { x: 300, y: 300, alive: true, hp: 100, maxHp: 100, cfg: { attackRange: 260 }, spendHealthCost: (n) => { scene.player.hp = Math.max(1, scene.player.hp - n); return true; } },
    boss: opts.boss || null,
    _hg: 0, nextHitGroupId() { return ++this._hg; },
    countProjBySkill: () => 0,
    projPool: { activeCount: 0, maxSize: 400, forEachActive: () => {} },
    enemyPool: { forEachActive: (fn) => { for (const e of enemies) fn(e); } },
    ignitedCount: () => enemies.filter((e) => e.alive && e.ignited).length,
    aoe: (x, y, r, amt, id, o) => calls.push(['aoe', x, y, r, amt, id, o]),
    _explosionBudget: 999,
    _evolvedBonuses: {},
    chainBonus: 0,
    passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getIceDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
    jobMods: { fireAreaMult: () => 1, explosionAreaMult: () => 1, cooldownMult: () => 1, projectileCountBonus: () => 0, statusPowerMult: () => 1, damageMultiplier: () => 1, burningDamageMult: () => 1, burningDurationMult: () => 1 },
    telemetry: null,
  };
  const deathEvents = (opts.deathEvents || []).slice();
  scene.combat = {
    // 半径を実際に見る（SpatialGrid 相当）。範囲スキルの寄与を過大評価しないため、
    // production の combat API と同じ「円内の生存個体だけ」を返す。
    nearestEnemy: (x, y, r) => {
      let best = null, bd = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d <= (r || 0) * (r || 0) && d < bd) { bd = d; best = e; }
      }
      return best;
    },
    nearestEnemyExcept: (x, y, r, ex) => {
      const skip = ex instanceof Set ? ex : new Set(ex ? [ex] : []);
      let best = null, bd = Infinity;
      for (const e of enemies) {
        if (!e.alive || skip.has(e)) continue;
        const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d <= (r || 0) * (r || 0) && d < bd) { bd = d; best = e; }
      }
      return best;
    },
    enemiesInRadius: (x, y, r) => enemies.filter((e) => e.alive && (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= (r || 0) * (r || 0)),
    forEachEnemyInRadius: (x, y, r, fn) => {
      for (const e of enemies) {
        if (!e.alive) continue;
        if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) > (r || 0) * (r || 0)) continue;
        fn(e);
      }
    },
    randomEnemies: (n) => enemies.filter((e) => e.alive).slice(0, n),
    densestPoint: () => ({ x: 320, y: 300 }),
    spawnPlayerProjectile: (x, y, a, sp, o) => { calls.push(['proj', x, y, a, sp, o]); return stubObj(); },
    // BattleScene.dealDamage と同じく、命中と与ダメージを SkillManager の統計へ中央で記録する
    // （スキル側は recordDamage を呼ばない＝二重計上しない、という production の構造を再現する）。
    dealDamage: (t, amt, id, o) => {
      calls.push(['dmg', t && t.x, amt, id, o]);
      if (id && scene.skills) { scene.skills.recordDamage(id, amt); scene.skills.recordHit(id); }
      return false;
    },
    damageArea: (x, y, r, amt, id, o) => {
      calls.push(['area', x, y, r, amt, id, o]);
      if (id && scene.skills) { scene.skills.recordDamage(id, amt); scene.skills.recordHit(id); }
    },
    skillCap: (n, f) => capFor(n, opts.quality || 'high', f),
    frameBudget: () => true,
    worldBounds: () => ({ w: 1600, h: 1200 }),
    // 炎上（burning）: 火の魔女の主状態。索引つきで登録し、消火/死亡でほどける。
    ignite: (e, ms, dmg, o) => { calls.push(['ignite', e && e.x, ms, dmg, o]); if (e) { e.ignited = true; e._igniteUntil = nowMs + (ms || 0); } return true; },
    registerBurning: (e) => { if (e) e.ignited = true; },
    burningCount: () => enemies.filter((e) => e.alive && e.ignited).length,
    burningEnemies: () => enemies.filter((e) => e.alive && e.ignited),
    // 敵死亡イベント（墓標系）。
    retainDeathEvents: () => { calls.push(['retainDeath']); },
    releaseDeathEvents: () => { calls.push(['releaseDeath']); },
    recentDeathEvents: () => deathEvents,
    consumeDeathEvent: () => deathEvents.shift() || null,
    // 敵弾吸収（弾喰い炉）。
    absorbBossBullets: () => ({ absorbed: opts.absorb || 0, value: (opts.absorb || 0) * 25 }),
    // 分身（灰燼分身）。
    performClone: (id) => { calls.push(['clone', id]); },
    spendHealthCost: (n) => scene.player.spendHealthCost(n),
    markEnemy: (e) => { if (e) e._marked = true; }, markedCount: () => enemies.filter((e) => e._marked).length,
    // 氷側 API（火では未使用だが共通経路のため実装しておく）。
    isFrozen: (e) => !!(e && e._frozen), isChilled: () => false,
    chillOf: (e) => (e && e._chill) || 0, chillRatio: (e) => Math.min(1, ((e && e._chill) || 0) / 100),
    shatterEnemy: () => false, freezeEnemy: () => false, applyChill: () => 0,
    addBossGauge: () => null, addBossGaugeTo: () => {},
    entitiesWithStatus: () => [], countStatus: () => 0, jobElement: () => 'fire',
    nextHitGroupId: () => scene.nextHitGroupId(),
  };
  return scene;
}

// M9-A: skillCaps は 2 つの形を持つ（{ value } = gameplay/safety・品質非依存 /
// { low..ultra } = visual）。解決規則は production の DataManager.skillCap と同一。
export function capFor(name, quality, fallback) {
  const c = DATA.balance.skillCaps && DATA.balance.skillCaps[name];
  if (!c) return fallback == null ? Infinity : fallback;
  if (typeof c.value === 'number') return c.value;
  const v = c[quality];
  return typeof v === 'number' ? v : (fallback == null ? Infinity : fallback);
}

// ヘッドレス敵（Enemy 相当の最小インターフェース）。
export function makeEnemies(n = 12, o = {}) {
  return Array.from({ length: n }, (_, i) => ({
    x: (o.x != null ? o.x : 300) + (i % 4) * 6,
    y: (o.y != null ? o.y : 180) + i * (o.dy != null ? o.dy : 20),
    alive: true, isBoss: false, isElite: false, hp: 60, maxHp: 60, _seq: i,
    ignited: !!o.ignited, _igniteUntil: 0, _igniteGen: 0,
    _chill: 0, _frozen: false, _iceSeal: null, _iceHitCount: 0,
    applySlow() {}, takeDamage() { return false; },
    ignite() { this.ignited = true; return true; },
  }));
}

// すべての .js ソースを連結（キー参照の有無を横断的に調べる用途）。
export function allSrc() {
  let out = '';
  const walk = (dir) => {
    for (const f of readdirSync(join(REPO, dir), { withFileTypes: true })) {
      if (f.isDirectory()) walk(join(dir, f.name));
      else if (f.name.endsWith('.js')) out += readFileSync(join(REPO, dir, f.name), 'utf8');
    }
  };
  walk('src');
  return out;
}

// DataManager を実データで初期化し、SkillManager を import できる状態にする（ランタイム系テスト共通）。
export async function bootRuntime() {
  globalThis.Phaser = globalThis.Phaser || { BlendModes: { ADD: 1, NORMAL: 0 }, Math: { Between: (a) => a } };
  globalThis.window = globalThis.window || {};
  const { DataManager } = await import('../src/systems/DataManager.js');
  for (const [k, v] of Object.entries({
    skills: { skills: DATA.skills }, skillEvolutions: { evolutions: DATA.evolutions }, balance: DATA.balance,
    skillMastery: DATA.skillMastery, passives: { passives: DATA.passives }, jobs: { jobs: DATA.jobs },
    skillConfig: DATA.skillConfig, jobProgression: DATA.jobProgression, statusEffects: DATA.statusEffects,
  })) DataManager.data[k] = v;
  for (const s of DATA.skills) DataManager._skillMap.set(s.id, s);
  DataManager.loaded = true;
  const mod = await import('../src/systems/SkillManager.js');
  return { DataManager, SkillManager: mod.SkillManager };
}

// 進化 id → 基礎 active id。
export function evolutionBaseMap() {
  const m = {};
  for (const e of DATA.evolutions) if (FLAME.evolutionPool.includes(e.id)) m[e.id] = e.baseSkillId;
  return m;
}
