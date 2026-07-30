// M7-E（氷術師完成監査）の共通ヘルパ。Node.js 標準機能のみ・外部ライブラリなし。
// 12 本の監査テストが同じ「実データ読み込み・カタログ構築・production 抽選コンテキスト・Phaser モック」を共有し、
// 判定ロジックを各テストで作り直さないための土台（抽選/監査ロジック自体は src/ の production 実装をそのまま使う）。

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

export const FROST = DATA.jobs.find((j) => j.id === 'frost_mage');
export const FLAME = DATA.jobs.find((j) => j.id === 'flame_witch');

// 期待値（M7-D 完了時点のカタログ規模。M7-E は新規追加をしない）。
export const EXPECTED = {
  activeCount: 30, passiveCount: 4, evolutionCount: 18,
  lv80Targets: ['frost_shard', 'glacial_lance', 'icicle_volley', 'rime_boomerang', 'polar_star', 'glacial_spear_rain'],
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
  const t = { x: 0, y: 0, width: 0, height: 0, radius: 0, alpha: 1, body: { velocity: { x: 0, y: 0 } } };
  const p = new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (k === 'then') return undefined; return () => p; } });
  return p;
}

// combat API・skills API をひととおり備えたヘッドレス scene。calls に呼び出しを記録する。
// opts: { enemies, boss, quality, now }
export function makeScene(opts = {}) {
  const calls = [];
  let nowMs = opts.now || 1000;
  const enemies = opts.enemies || [];
  const scene = {
    calls,
    time: { get now() { return nowMs; }, delayedCall: (_d, fn) => { if (typeof fn === 'function') fn(); return stubObj(); } },
    advance(ms) { nowMs += ms; },
    _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'ice',
    add: { image: () => stubObj(), rectangle: () => stubObj(), circle: () => stubObj(), ellipse: () => stubObj(), graphics: () => stubObj(), text: () => stubObj(), container: () => stubObj() },
    effects: new Proxy({}, { get: () => () => {} }),
    tweens: { add: (cfg) => { if (cfg && cfg.onComplete) cfg.onComplete(); return stubObj(); } },
    player: { x: 300, y: 300, alive: true, cfg: { attackRange: 260 } },
    boss: opts.boss || null,
    _hg: 0, nextHitGroupId() { return ++this._hg; },
    countProjBySkill: () => 0,
    passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getIceDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
    jobMods: { fireAreaMult: () => 1, explosionAreaMult: () => 1, cooldownMult: () => 1, projectileCountBonus: () => 0, statusPowerMult: () => 1, damageMultiplier: () => 1 },
    telemetry: null,
  };
  scene.combat = {
    nearestEnemy: () => enemies.find((e) => e.alive) || null,
    nearestEnemyExcept: () => enemies.find((e) => e.alive) || null,
    enemiesInRadius: () => enemies.filter((e) => e.alive),
    forEachEnemyInRadius: (x, y, r, fn) => { for (const e of enemies) if (e.alive) fn(e); },
    densestPoint: () => ({ x: 320, y: 300 }),
    spawnPlayerProjectile: (x, y, a, sp, o) => calls.push(['proj', x, y, a, sp, o]),
    dealDamage: (t, amt, id, o) => { calls.push(['dmg', t && t.x, amt, id, o]); return false; },
    damageArea: (x, y, r, amt, id, o) => { calls.push(['area', x, y, r, amt, id, o]); },
    skillCap: (n, f) => capFor(n, opts.quality || 'high', f),
    frameBudget: () => true,
    isFrozen: (e) => !!(e && e._frozen), isChilled: () => true,
    chillOf: (e) => (e && e._chill) || 0, chillRatio: (e) => Math.min(1, ((e && e._chill) || 0) / 100),
    shatterEnemy: (e, o) => { calls.push(['shatter', e && e.x, o && o.skillId]); return true; },
    freezeEnemy: () => false, applyChill: () => 0, addBossGauge: () => null, addBossGaugeTo: (t, v) => calls.push(['bossGauge', v]),
    // 防御スキル（氷鏡結界/冬の光輪）を駆動するため、opts.absorb で吸収を発生させられる（既定は 0＝従来どおり）。
    absorbBossBullets: () => ({ absorbed: opts.absorb || 0, value: (opts.absorb || 0) * 25 }),
    nextHitGroupId: () => scene.nextHitGroupId(),
    entitiesWithStatus: () => [], countStatus: () => 0, jobElement: () => 'ice', randomEnemies: () => [],
    markEnemy: () => {}, markedCount: () => 0, worldBounds: () => ({ w: 1600, h: 1200 }),
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
    y: (o.y != null ? o.y : 180) + i * (o.dy != null ? o.dy : 60),
    alive: true, isBoss: false, isElite: false, hp: 60, maxHp: 60, _seq: i,
    _chill: 10 + i * 3, _frozen: !!o.frozen, _iceSeal: null, _iceHitCount: 0,
    applySlow() {}, takeDamage() { return false; },
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
