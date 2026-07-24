// M7-C: 氷術師 active25種・進化13種の全ポリシー監査（castMode/mainCastEvent/echo・clonePolicy/lv80/procCoefficient/防御・反応の残響非対応・再帰なし）。
// 主発動のみ recordCast する宣言と、forbidden/defensive/reactive が残響カウンタを進めない/複製されないことを機械的に検証する。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveCastMeta, canCastTriggerEcho, canCloneCopy, defaultCastContext } from '../src/systems/CastPolicy.js';
import { appliesLv80ProjectileCount } from '../src/systems/SkillAudit.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const skills = L('skills.json').skills, evolutions = L('skill-evolutions.json').evolutions;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const CAST_MODES = new Set(['periodic', 'cooldown', 'continuous', 'reactive', 'defensive', 'movement', 'resource']);
const ATTACK_MODES = new Set(['periodic', 'cooldown', 'continuous', 'resource']);

const frostActives = skills.filter((s) => (s.jobs || []).includes('frost_mage') && (s.category || 'active') === 'active');
const frostActiveIds = new Set(frostActives.map((s) => s.id));
const frostEvos = evolutions.filter((e) => frostActiveIds.has(e.baseSkillId));

section('1. 氷術師 active25種・進化13種が揃っている');
{
  ok(frostActives.length === 25, `氷 active25種 (${frostActives.length})`);
  ok(frostEvos.length === 13, `氷 進化13種 (${frostEvos.length})`);
}

section('2. active 全25種 監査: castMode / mainCastEvent / echo・clonePolicy / procCoefficient / 防御・反応・forbidden の残響非対応');
for (const s of frostActives) {
  ok(CAST_MODES.has(s.castMode), `${s.id}: castMode 有効 (${s.castMode})`);
  if (ATTACK_MODES.has(s.castMode)) ok(!!s.mainCastEvent, `${s.id}: 攻撃 castMode に mainCastEvent`);
  ok(['standard', 'custom', 'forbidden'].includes(s.echoPolicy), `${s.id}: echoPolicy 有効`);
  ok(['standard', 'custom', 'forbidden'].includes(s.clonePolicy), `${s.id}: clonePolicy 有効`);
  ok(typeof s.procCoefficient === 'number' && s.procCoefficient > 0 && s.procCoefficient <= 1.5, `${s.id}: procCoefficient 妥当 (${s.procCoefficient})`);
  ok(s.element === 'ice', `${s.id}: element ice`);
  const meta = resolveCastMeta(s);
  if (s.castMode === 'defensive') ok(s.echoPolicy === 'forbidden', `${s.id}: defensive は echoPolicy forbidden`);
  if (s.isReactive || s.isDefensive || s.echoPolicy === 'forbidden') ok(canCastTriggerEcho(meta, defaultCastContext(s.id)) === false, `${s.id}: 反応/防御/forbidden は残響を起こさない`);
  if (s.clonePolicy === 'forbidden') ok(canCloneCopy(meta) === false, `${s.id}: forbidden は複製対象外`);
}

section('3. Lv80発射数対象は frost_shard / glacial_lance / icicle_volley / rime_boomerang / polar_star の5種のみ（projectile タグだけで自動適用しない）');
{
  const lv80 = frostActives.filter((s) => appliesLv80ProjectileCount(s)).map((s) => s.id).sort();
  ok(JSON.stringify(lv80) === JSON.stringify(['frost_shard', 'glacial_lance', 'icicle_volley', 'polar_star', 'rime_boomerang'].sort()), `Lv80対象=${lv80.join(',')}`);
  const projNonLv80 = frostActives.filter((s) => (s.tags || []).includes('projectile') && !appliesLv80ProjectileCount(s)).map((s) => s.id);
  ok(projNonLv80.length >= 1, `projectile タグでも Lv80非対象が明示管理される (${projNonLv80.join(',')})`);
}

section('4. 進化 全13種 監査: castMode / mainCastEvent / echo・clonePolicy / lv80=false / procCoefficient / 基礎 forbidden は進化も forbidden');
for (const e of frostEvos) {
  ok(CAST_MODES.has(e.castMode), `${e.id}: castMode 有効 (${e.castMode})`);
  if (ATTACK_MODES.has(e.castMode)) ok(!!e.mainCastEvent, `${e.id}: 攻撃 castMode に mainCastEvent`);
  ok(['standard', 'custom', 'forbidden'].includes(e.echoPolicy), `${e.id}: echoPolicy 有効`);
  ok(['standard', 'custom', 'forbidden'].includes(e.clonePolicy), `${e.id}: clonePolicy 有効`);
  ok(e.lv80ProjectileTarget === false, `${e.id}: 進化は Lv80発射数対象外`);
  ok(typeof e.procCoefficient === 'number' && e.procCoefficient > 0 && e.procCoefficient <= 1.5, `${e.id}: procCoefficient 妥当 (${e.procCoefficient})`);
  const base = skills.find((s) => s.id === e.baseSkillId);
  if (base && base.echoPolicy === 'forbidden') ok(e.echoPolicy === 'forbidden', `${e.id}: 基礎 forbidden なら進化も forbidden`);
}

section('5. 新 active10・新進化5 の echo/clone 方針が仕様どおり（standard/custom/forbidden）');
{
  const A_ECHO = { rime_boomerang: 'standard', frost_chain: 'standard', polar_star: 'standard', icebreaker_wave: 'standard', crystal_refraction: 'standard', crystal_bloom: 'custom', snowblind_mist: 'custom', comet_sleet: 'custom', frozen_clock: 'forbidden', winter_halo: 'forbidden' };
  for (const [id, pol] of Object.entries(A_ECHO)) { const s = skills.find((x) => x.id === id); ok(s && s.echoPolicy === pol && s.clonePolicy === pol, `${id}: echo/clone = ${pol}`); }
  const E_ECHO = { rime_execution_wheel: 'standard', eternal_frost_chain: 'custom', crystal_world_tree: 'custom', everlasting_white_mist: 'custom', zero_hour_world: 'forbidden' };
  for (const [id, pol] of Object.entries(E_ECHO)) { const e = evolutions.find((x) => x.id === id); ok(e && e.echoPolicy === pol && e.clonePolicy === pol, `${id}: echo/clone = ${pol}`); }
}

console.log(fail ? `\n✗ 氷術師ポリシー監査(wave3)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師ポリシー監査(wave3)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
