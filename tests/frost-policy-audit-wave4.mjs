// M7-D: 氷術師 active30種・進化18種の全ポリシー監査 + 新 active5・進化5 の方針（standard/custom/forbidden）・Lv80対象6・marker非登録の検証。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveCastMeta, canCastTriggerEcho, canCloneCopy, defaultCastContext } from '../src/systems/CastPolicy.js';
import { appliesLv80ProjectileCount } from '../src/systems/SkillAudit.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const skills = L('skills.json').skills, evolutions = L('skill-evolutions.json').evolutions, status = L('status-effects.json');
const statusIds = new Set((status.statusEffects || []).map((s) => s.id));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const CAST_MODES = new Set(['periodic', 'cooldown', 'continuous', 'reactive', 'defensive', 'movement', 'resource']);
const ATTACK_MODES = new Set(['periodic', 'cooldown', 'continuous', 'resource']);

const frostActives = skills.filter((s) => (s.jobs || []).includes('frost_mage') && (s.category || 'active') === 'active');
const frostActiveIds = new Set(frostActives.map((s) => s.id));
const frostEvos = evolutions.filter((e) => frostActiveIds.has(e.baseSkillId));

section('1. 氷術師 active30種・進化18種が揃っている（カタログ完成）');
{
  ok(frostActives.length === 30, `氷 active30種 (${frostActives.length})`);
  ok(frostEvos.length === 18, `氷 進化18種 (${frostEvos.length})`);
}

section('2. active 全30種 監査: castMode / mainCastEvent / echo・clonePolicy / procCoefficient / element / 反応・防御・forbidden の残響非対応');
for (const s of frostActives) {
  ok(CAST_MODES.has(s.castMode), `${s.id}: castMode 有効 (${s.castMode})`);
  if (ATTACK_MODES.has(s.castMode)) ok(!!s.mainCastEvent, `${s.id}: 攻撃 castMode に mainCastEvent`);
  ok(['standard', 'custom', 'forbidden'].includes(s.echoPolicy), `${s.id}: echoPolicy 有効`);
  ok(['standard', 'custom', 'forbidden'].includes(s.clonePolicy), `${s.id}: clonePolicy 有効`);
  ok(typeof s.procCoefficient === 'number' && s.procCoefficient > 0 && s.procCoefficient <= 1.5, `${s.id}: procCoefficient 妥当 (${s.procCoefficient})`);
  ok(s.element === 'ice', `${s.id}: element ice`);
  ok((s.tags || []).every((t) => !statusIds.has(t)), `${s.id}: tag に正式 status id が混ざらない`);
  const meta = resolveCastMeta(s);
  if (s.castMode === 'defensive') ok(s.echoPolicy === 'forbidden', `${s.id}: defensive は echoPolicy forbidden`);
  if (s.isReactive || s.isDefensive || s.echoPolicy === 'forbidden') ok(canCastTriggerEcho(meta, defaultCastContext(s.id)) === false, `${s.id}: 反応/防御/forbidden は残響を起こさない`);
  if (s.clonePolicy === 'forbidden') ok(canCloneCopy(meta) === false, `${s.id}: forbidden は複製対象外`);
}

section('3. Lv80発射数対象は計6種のみ（明示フラグ）');
{
  const lv80 = frostActives.filter((s) => appliesLv80ProjectileCount(s)).map((s) => s.id).sort();
  ok(JSON.stringify(lv80) === JSON.stringify(['frost_shard', 'glacial_lance', 'glacial_spear_rain', 'icicle_volley', 'polar_star', 'rime_boomerang'].sort()), `Lv80対象6種=${lv80.join(',')}`);
}

section('4. 進化 全18種 監査: castMode / mainCastEvent / echo・clonePolicy / lv80=false / procCoefficient / 基礎 forbidden は進化も forbidden');
for (const e of frostEvos) {
  ok(CAST_MODES.has(e.castMode), `${e.id}: castMode 有効 (${e.castMode})`);
  if (ATTACK_MODES.has(e.castMode)) ok(!!e.mainCastEvent, `${e.id}: 攻撃 castMode に mainCastEvent`);
  ok(['standard', 'custom', 'forbidden'].includes(e.echoPolicy), `${e.id}: echoPolicy 有効`);
  ok(['standard', 'custom', 'forbidden'].includes(e.clonePolicy), `${e.id}: clonePolicy 有効`);
  ok(e.lv80ProjectileTarget === false, `${e.id}: 進化は Lv80発射数対象外`);
  ok(typeof e.procCoefficient === 'number' && e.procCoefficient > 0 && e.procCoefficient <= 1.5, `${e.id}: procCoefficient 妥当`);
  const base = skills.find((s) => s.id === e.baseSkillId);
  if (base && base.echoPolicy === 'forbidden') ok(e.echoPolicy === 'forbidden', `${e.id}: 基礎 forbidden なら進化も forbidden`);
}

section('5. 新 active5・新進化5 の echo/clone 方針が仕様どおり');
{
  const A = { glacial_spear_rain: ['custom', 'custom'], snowflake_sentry: ['custom', 'custom'], iceberg_ram: ['standard', 'custom'], absolute_ice_seal: ['forbidden', 'forbidden'], aurora_veil: ['forbidden', 'forbidden'] };
  for (const [id, [ec, cl]] of Object.entries(A)) { const s = skills.find((x) => x.id === id); ok(s && s.echoPolicy === ec && s.clonePolicy === cl, `${id}: echo=${ec}/clone=${cl}`); }
  const E = { heavenfall_glacier_lances: ['custom', 'custom'], crystal_sentinel_legion: ['custom', 'custom'], continental_glacier_rush: ['custom', 'custom'], eternal_sealed_coffin: ['forbidden', 'forbidden'], polar_night_aurora: ['forbidden', 'forbidden'] };
  for (const [id, [ec, cl]] of Object.entries(E)) { const e = evolutions.find((x) => x.id === id); ok(e && e.echoPolicy === ec && e.clonePolicy === cl, `${id}: echo=${ec}/clone=${cl}`); }
  // marker 伝播世代上限（eternal_sealed_coffin=1）。
  const esc = evolutions.find((e) => e.id === 'eternal_sealed_coffin');
  ok(esc && (esc.propagation || {}).generations === 1, 'eternal_sealed_coffin の伝播世代上限=1');
}

console.log(fail ? `\n✗ 氷術師ポリシー監査(wave4)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師ポリシー監査(wave4)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
