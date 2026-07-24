// M7-D: 氷術師 新 active5種のデータ・カタログ・登録・上限・Lv80・marker・状態経路の検証。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';
import { appliesLv80ProjectileCount } from '../src/systems/SkillAudit.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const skills = L('skills.json').skills, jobs = L('jobs.json').jobs, balance = L('balance.json'), status = L('status-effects.json');
const registered = new Set(registeredSkillIds());
const runtime = new Set(skillsWithRuntimeState());
const statusIds = new Set((status.statusEffects || []).map((s) => s.id));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const NEW = {
  glacial_spear_rain: { rarity: 'common', castMode: 'periodic', lv80: true, echo: 'custom', clone: 'custom', bgm: false },
  snowflake_sentry: { rarity: 'uncommon', castMode: 'continuous', lv80: false, echo: 'custom', clone: 'custom', bgm: false },
  iceberg_ram: { rarity: 'rare', castMode: 'cooldown', lv80: false, echo: 'standard', clone: 'custom', bgm: false },
  absolute_ice_seal: { rarity: 'rare', castMode: 'reactive', lv80: false, echo: 'forbidden', clone: 'forbidden', bgm: true },
  aurora_veil: { rarity: 'legendary', castMode: 'continuous', lv80: false, echo: 'forbidden', clone: 'forbidden', bgm: true },
};

section('1. 新 active5種: 存在・専用・isCommon:false・element ice・maxLevel8・Lv1..8・成長・rarity・procCoefficient・chillAmount');
{
  const fm = jobs.find((j) => j.id === 'frost_mage');
  ok(Object.keys(NEW).length === 5, '新 active は5種');
  for (const [id, meta] of Object.entries(NEW)) {
    const s = skills.find((x) => x.id === id);
    if (!s) { ok(false, `${id} が存在`); continue; }
    ok((s.jobs || []).includes('frost_mage') && (s.jobs || []).length === 1, `${id} は frost_mage 専用`);
    ok(s.isCommon === false, `${id} は isCommon:false`);
    ok(s.element === 'ice', `${id} の element が ice`);
    ok(s.rarity === meta.rarity, `${id} の rarity が ${meta.rarity} (${s.rarity})`);
    ok(s.maxLevel === 8, `${id} の maxLevel が8`);
    ok(Array.isArray(s.levels) && s.levels.length === 8 && s.levels.every((lv, i) => lv.level === i + 1), `${id} の levels が Lv1..8 連番`);
    for (let i = 1; i < (s.levels || []).length; i++) ok(JSON.stringify(s.levels[i]) !== JSON.stringify(s.levels[i - 1]), `${id} Lv${i + 1} が Lv${i} と変化`);
    ok(typeof s.procCoefficient === 'number' && s.procCoefficient > 0 && s.procCoefficient <= 1.5, `${id} の procCoefficient が妥当 (${s.procCoefficient})`);
    ok((s.levels || []).every((lv) => lv.chillAmount != null), `${id} は各Lvに chillAmount`);
    for (const lv of s.levels || []) for (const [k, v] of Object.entries(lv)) if (typeof v === 'number') ok(Number.isFinite(v) && v >= 0, `${id} Lv${lv.level}.${k} が非負有限`);
    ok(fm.activeSkillPool.includes(id), `${id} が frost_mage activeSkillPool にある`);
  }
}

section('2. メタ宣言: castMode / mainCastEvent / echo / clone / lv80 / runtimeState / 実装クラス / damageTags / bossGaugeMult(Lv)');
{
  for (const [id, meta] of Object.entries(NEW)) {
    const s = skills.find((x) => x.id === id);
    ok(s.castMode === meta.castMode, `${id} の castMode が ${meta.castMode} (${s.castMode})`);
    ok(!!s.mainCastEvent, `${id} に mainCastEvent`);
    ok(s.echoPolicy === meta.echo, `${id} の echoPolicy が ${meta.echo} (${s.echoPolicy})`);
    ok(s.clonePolicy === meta.clone, `${id} の clonePolicy が ${meta.clone} (${s.clonePolicy})`);
    ok(s.lv80ProjectileTarget === meta.lv80, `${id} の lv80ProjectileTarget が ${meta.lv80}`);
    ok(registered.has(id), `${id} に実装クラスが登録`);
    ok(runtime.has(id), `${id} は runtimeState を保存する`);
    ok(Array.isArray(s.tags) && s.tags.includes('ice'), `${id} の damageTags に ice`);
    if (meta.bgm) { const vals = s.levels.map((lv) => lv.bossGaugeMult); ok(vals.every((v) => typeof v === 'number' && v > 0), `${id} は各Lvに bossGaugeMult`); }
  }
}

section('3. 火の魔女に氷スキルが出ない / Lv80対象は glacial_spear_rain のみ（新規内）・氷 active総数30・氷 Lv80対象は計6種');
{
  const fw = jobs.find((j) => j.id === 'flame_witch');
  for (const id of Object.keys(NEW)) ok(!fw.activeSkillPool.includes(id), `flame_witch プールに ${id} が無い`);
  const lv80New = Object.entries(NEW).filter(([, m]) => m.lv80).map(([id]) => id);
  ok(lv80New.length === 1 && lv80New[0] === 'glacial_spear_rain', `新規 active の Lv80対象は glacial_spear_rain のみ (${lv80New.join(',')})`);
  for (const id of Object.keys(NEW)) { const s = skills.find((x) => x.id === id); ok(appliesLv80ProjectileCount(s) === NEW[id].lv80, `${id} の Lv80判定は明示フラグと一致`); }
  const fm = jobs.find((j) => j.id === 'frost_mage');
  ok(fm.activeSkillPool.length === 30, `氷術師 active総数30 (${fm.activeSkillPool.length})`);
  ok(fm.passiveSkillPool.length === 4, `氷術師 passive総数4のまま (${fm.passiveSkillPool.length})`);
  const frostLv80 = skills.filter((s) => (s.jobs || []).includes('frost_mage') && appliesLv80ProjectileCount(s)).map((s) => s.id).sort();
  ok(frostLv80.length === 6, `氷 Lv80対象は計6種 (${frostLv80.join(',')})`);
}

section('4. 新 skillCaps（品質順・非負）');
{
  const CAPS = ['maxGlacialSpearTelegraphs', 'maxGlacialSpearImpactsPerFrame', 'maxGlacialSpearProjectiles', 'maxSnowflakeSentries', 'maxSentryProjectiles', 'maxSentryLinksPerFrame', 'maxIcebergRams', 'maxIcebergContactChecks', 'maxIcebergShards', 'maxIceSealMarks', 'maxIceSealExplosionsPerFrame', 'maxAuroraBands', 'maxAuroraQueriesPerTick', 'maxAuroraBurstsPerFrame'];
  for (const n of CAPS) {
    const c = balance.skillCaps[n];
    if (!c) { ok(false, `skillCaps.${n} がある`); continue; }
    ok(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `skillCaps.${n} が品質順`);
    for (const q of ['low', 'medium', 'high', 'ultra']) ok(typeof c[q] === 'number' && c[q] > 0 && Number.isFinite(c[q]), `skillCaps.${n}.${q} が正の有限数`);
  }
}

section('5. marker（氷印）を正式 status へ登録しない / 状態経路は既存 status id を使う');
{
  for (const bad of ['ice_seal', 'iceSeal', 'ice_coffin', 'sealed_coffin', 'ice_mark']) ok(!statusIds.has(bad), `marker "${bad}" が正式 status に無い（skill-local）`);
  for (const req of ['chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability']) ok(statusIds.has(req), `既存 status id "${req}" が定義済み`);
  // absolute_ice_seal / aurora_veil の tag に正式 status id が混ざらない。
  for (const id of ['absolute_ice_seal', 'aurora_veil']) { const s = skills.find((x) => x.id === id); ok((s.tags || []).every((t) => !statusIds.has(t)), `${id} の tag に正式 status id が無い`); }
}

console.log(fail ? `\n✗ 氷術師 新active(wave4)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 新active(wave4)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
