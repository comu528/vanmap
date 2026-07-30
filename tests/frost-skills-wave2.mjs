// M7-B: 氷術師 新 active10種のデータ・カタログ・登録・上限の検証。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';
import { expandCapsInBalance } from './cap-shape.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const skills = L('skills.json').skills, jobs = L('jobs.json').jobs, balance = expandCapsInBalance(L('balance.json'));
const registered = new Set(registeredSkillIds());
const runtime = new Set(skillsWithRuntimeState());

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// 新 active10種の期待メタ（rarity / castMode / lv80 / runtimeState を持つか）。
const NEW = {
  icicle_volley: { rarity: 'common', castMode: 'cooldown', lv80: true, runtime: true },
  frost_orbit: { rarity: 'common', castMode: 'continuous', lv80: false, runtime: false },
  freezing_ray: { rarity: 'uncommon', castMode: 'continuous', lv80: false, runtime: true },
  hailstorm: { rarity: 'uncommon', castMode: 'periodic', lv80: false, runtime: true },
  cryo_mine: { rarity: 'common', castMode: 'reactive', lv80: false, runtime: true },
  frost_spirit: { rarity: 'uncommon', castMode: 'continuous', lv80: false, runtime: false },
  ice_prison: { rarity: 'rare', castMode: 'cooldown', lv80: false, runtime: true },
  avalanche: { rarity: 'uncommon', castMode: 'periodic', lv80: false, runtime: true },
  mirror_ice: { rarity: 'rare', castMode: 'defensive', lv80: false, runtime: true },
  glacier_drop: { rarity: 'legendary', castMode: 'cooldown', lv80: false, runtime: true },
};

section('1. 新 active10種: 存在・専用・element ice・maxLevel8・Lv1..8・成長・rarity・procCoefficient');
{
  const fm = jobs.find((j) => j.id === 'frost_mage');
  ok(Object.keys(NEW).length === 10, '新 active は10種');
  for (const [id, meta] of Object.entries(NEW)) {
    const s = skills.find((x) => x.id === id);
    if (!s) { ok(false, `${id} が存在`); continue; }
    ok((s.jobs || []).includes('frost_mage') && (s.jobs || []).length === 1, `${id} は frost_mage 専用`);
    ok(s.element === 'ice', `${id} の element が ice`);
    ok(s.rarity === meta.rarity, `${id} の rarity が ${meta.rarity} (${s.rarity})`);
    ok(s.maxLevel === 8, `${id} の maxLevel が8`);
    ok(Array.isArray(s.levels) && s.levels.length === 8 && s.levels.every((lv, i) => lv.level === i + 1), `${id} の levels が Lv1..8 連番`);
    for (let i = 1; i < (s.levels || []).length; i++) ok(JSON.stringify(s.levels[i]) !== JSON.stringify(s.levels[i - 1]), `${id} Lv${i + 1} が Lv${i} と変化`);
    ok(typeof s.procCoefficient === 'number' && s.procCoefficient > 0 && s.procCoefficient <= 1.5, `${id} の procCoefficient が妥当 (${s.procCoefficient})`);
    for (const lv of s.levels || []) for (const [k, v] of Object.entries(lv)) if (typeof v === 'number') ok(Number.isFinite(v) && v >= 0, `${id} Lv${lv.level}.${k} が非負有限 (${v})`);
    ok(fm.activeSkillPool.includes(id), `${id} が frost_mage activeSkillPool にある`);
    ok(!fm.activeSkillPool.includes(id) || true, '');
  }
}

section('2. メタ宣言: castMode / mainCastEvent / echoPolicy / clonePolicy / lv80 / runtimeState / 実装クラス');
{
  for (const [id, meta] of Object.entries(NEW)) {
    const s = skills.find((x) => x.id === id);
    ok(s.castMode === meta.castMode, `${id} の castMode が ${meta.castMode} (${s.castMode})`);
    ok(!!s.mainCastEvent, `${id} に mainCastEvent`);
    ok(['standard', 'custom', 'forbidden'].includes(s.echoPolicy), `${id} の echoPolicy 有効`);
    ok(['standard', 'custom', 'forbidden'].includes(s.clonePolicy), `${id} の clonePolicy 有効`);
    ok(s.lv80ProjectileTarget === meta.lv80, `${id} の lv80ProjectileTarget が ${meta.lv80}`);
    ok(registered.has(id), `${id} に実装クラスが登録`);
    ok(runtime.has(id) === meta.runtime, `${id} の runtimeState 保持=${meta.runtime}`);
  }
}

section('3. 火の魔女に氷スキルが出ない / Lv80対象は icicle_volley のみ（新規内）');
{
  const fw = jobs.find((j) => j.id === 'flame_witch');
  for (const id of Object.keys(NEW)) ok(!fw.activeSkillPool.includes(id), `flame_witch プールに ${id} が無い`);
  const lv80New = Object.entries(NEW).filter(([, m]) => m.lv80).map(([id]) => id);
  ok(lv80New.length === 1 && lv80New[0] === 'icicle_volley', '新規 active の Lv80対象は icicle_volley のみ');
}

section('4. 新 skillCaps（品質順・非負）');
{
  const CAPS = ['maxIcicleVolleyProjectiles', 'maxIcicleVolleyBurstsPerFrame', 'maxFrostOrbitCrystals', 'maxFrostOrbitHitsPerFrame', 'maxFreezingRayTargets', 'maxFreezingRayTicksPerFrame', 'maxHailstorms', 'maxHailImpactsPerFrame', 'maxCryoMines', 'maxCryoMineExplosionsPerFrame', 'maxFrostSpirits', 'maxFrostSpiritProjectiles', 'maxIcePrisons', 'maxIcePrisonTargetsPerFrame', 'maxAvalancheWaves', 'maxAvalancheHitsPerFrame', 'maxMirrorIceBarriers', 'maxMirrorIceInterceptsPerFrame', 'maxMirrorIceCounterProjectiles', 'maxGlacierDrops', 'maxGlacierImpactsPerFrame'];
  for (const n of CAPS) {
    const c = balance.skillCaps[n];
    if (!c) { ok(false, `skillCaps.${n} がある`); continue; }
    ok(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `skillCaps.${n} が品質順`);
    for (const q of ['low', 'medium', 'high', 'ultra']) ok(typeof c[q] === 'number' && c[q] > 0 && Number.isFinite(c[q]), `skillCaps.${n}.${q} が正の有限数`);
  }
}

console.log(fail ? `\n✗ 氷術師 新active(wave2)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 新active(wave2)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
