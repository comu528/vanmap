// M7-B: 氷術師 active15種・進化8種の castMode / mainCastEvent / echo・clonePolicy / lv80 / procCoefficient を全監査する。
// 主発動のみ recordCast する（各弾/tick/命中では記録しない）宣言と、防御/反応スキルの残響非対応を機械的に検証する。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveCastMeta, canCastTriggerEcho, defaultCastContext } from '../src/systems/CastPolicy.js';
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

section('1. 氷術師 active30種・進化18種が揃っている');
{
  ok(frostActives.length === 30, `氷 active30種 (${frostActives.length})`);
  ok(frostEvos.length === 18, `氷 進化18種 (${frostEvos.length})`);
}

section('2. active 全監査: castMode / mainCastEvent / echo・clonePolicy / lv80 / procCoefficient / 防御・反応の残響');
for (const s of frostActives) {
  ok(CAST_MODES.has(s.castMode), `${s.id}: castMode 有効 (${s.castMode})`);
  if (ATTACK_MODES.has(s.castMode)) ok(!!s.mainCastEvent, `${s.id}: 攻撃 castMode に mainCastEvent`);
  ok(['standard', 'custom', 'forbidden'].includes(s.echoPolicy), `${s.id}: echoPolicy 有効`);
  ok(['standard', 'custom', 'forbidden'].includes(s.clonePolicy), `${s.id}: clonePolicy 有効`);
  ok(typeof s.procCoefficient === 'number' && s.procCoefficient > 0 && s.procCoefficient <= 1.5, `${s.id}: procCoefficient 妥当 (${s.procCoefficient})`);
  const meta = resolveCastMeta(s);
  // 防御は残響 forbidden・反応/防御は normal 由来でも残響カウンタを進めない。
  if (s.castMode === 'defensive') ok(s.echoPolicy === 'forbidden', `${s.id}: defensive は echoPolicy forbidden`);
  if (s.isReactive || s.isDefensive || s.echoPolicy === 'forbidden') ok(canCastTriggerEcho(meta, defaultCastContext(s.id)) === false, `${s.id}: 反応/防御/forbidden は残響を起こさない`);
  // clonePolicy forbidden は複製されない（防御耐久を無料増殖しない）。
  if (s.clonePolicy === 'forbidden') ok(meta.canBeCopiedByClone === false, `${s.id}: forbidden は複製対象外`);
}

section('3. Lv80発射数対象は frost_shard / glacial_lance / icicle_volley / rime_boomerang / polar_star のみ（projectile タグだけで自動適用しない）');
{
  const lv80 = frostActives.filter((s) => appliesLv80ProjectileCount(s)).map((s) => s.id).sort();
  ok(JSON.stringify(lv80) === JSON.stringify(['frost_shard', 'glacial_lance', 'icicle_volley', 'polar_star', 'rime_boomerang', 'glacial_spear_rain'].sort()), `Lv80対象=${lv80.join(',')}`);
  // projectile タグを持つが Lv80非対象のもの（明示管理）。
  const projNonLv80 = frostActives.filter((s) => (s.tags || []).includes('projectile') && !appliesLv80ProjectileCount(s)).map((s) => s.id);
  ok(projNonLv80.length >= 1, `projectile タグでも Lv80非対象が明示管理される (${projNonLv80.join(',')})`);
}

section('4. 進化 全監査: castMode / mainCastEvent / echo・clonePolicy / lv80=false / procCoefficient');
for (const e of frostEvos) {
  ok(CAST_MODES.has(e.castMode), `${e.id}: castMode 有効 (${e.castMode})`);
  if (ATTACK_MODES.has(e.castMode)) ok(!!e.mainCastEvent, `${e.id}: 攻撃 castMode に mainCastEvent`);
  ok(['standard', 'custom', 'forbidden'].includes(e.echoPolicy), `${e.id}: echoPolicy 有効`);
  ok(['standard', 'custom', 'forbidden'].includes(e.clonePolicy), `${e.id}: clonePolicy 有効`);
  ok(e.lv80ProjectileTarget === false, `${e.id}: 進化は Lv80発射数対象外`);
  ok(typeof e.procCoefficient === 'number' && e.procCoefficient > 0 && e.procCoefficient <= 1.5, `${e.id}: procCoefficient 妥当 (${e.procCoefficient})`);
  // forbidden 系の基礎を進化した場合、進化も forbidden（mirror_ice に進化は無いが一般則を確認）。
  const base = skills.find((s) => s.id === e.baseSkillId);
  if (base && base.echoPolicy === 'forbidden') ok(e.echoPolicy === 'forbidden', `${e.id}: 基礎 forbidden なら進化も forbidden`);
}

console.log(fail ? `\n✗ 氷術師ポリシー監査(wave2)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師ポリシー監査(wave2)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
