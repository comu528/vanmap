// M6-E タグ監査: active30種・進化18種の castMode / echoPolicy / clonePolicy / Job Lv80 発射数対象 / 主要タグ を
// SkillAudit（純ロジック）と data から機械的に検証する。Node.js 標準機能のみ（Phaser 非依存）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CAST_MODES, ATTACK_CAST_MODES, echoStatus, cloneStatus, appliesLv80ProjectileCount, primaryTags, castSummary } from '../src/systems/SkillAudit.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
const skills = load('skills.json').skills;
const evolutions = load('skill-evolutions.json').evolutions;
const actives = skills.filter((s) => (s.category || 'active') === 'active');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const MODES = new Set(CAST_MODES);
const ATTACK = new Set(ATTACK_CAST_MODES);

// ===== 1. active30種すべてに castMode / echoPolicy / clonePolicy がある =====
section('1. active30種の castMode/echoPolicy/clonePolicy');
ok(actives.length === 30, `active は30種 (${actives.length})`);
for (const s of actives) {
  ok(MODES.has(s.castMode), `${s.id} の castMode が有効 (${s.castMode})`);
  ok(['standard', 'custom', 'forbidden'].includes(s.echoPolicy), `${s.id} の echoPolicy が有効`);
  ok(['standard', 'custom', 'forbidden'].includes(s.clonePolicy), `${s.id} の clonePolicy が有効`);
  ok(!!s.echoDescription && !!s.cloneDescription, `${s.id} に echo/cloneDescription がある`);
}

// ===== 2. 攻撃 active は主発動イベント(mainCastEvent)を持つ =====
section('2. 攻撃 active は mainCastEvent を持つ / 非対応スキルは castMode に理由がある');
for (const s of actives) {
  if (ATTACK.has(s.castMode)) ok(!!s.mainCastEvent, `${s.id}（攻撃）に mainCastEvent がある`);
  // 残響非対応（forbidden/防御/反応/移動）は攻撃 castMode ではないこと（理由が castMode に表れる）。
  if (s.echoPolicy === 'forbidden') ok(['defensive', 'reactive', 'movement', 'cooldown'].includes(s.castMode), `${s.id} の残響非対応理由が castMode に表れる (${s.castMode})`);
}

// ===== 3. Job Lv80 発射数+1 の対象 =====
section('3. Job Lv80 発射数対象');
const lv80 = actives.filter((s) => appliesLv80ProjectileCount(s)).map((s) => s.id);
// 独立弾を撃つ通常 active のみ（光線/地雷/墓標/分身/召喚/鎖/陣/亀裂/波/共鳴/熱量は対象外）。
const EXPECT_LV80 = new Set(['fireball', 'flame_lance', 'scatter_flame', 'homing_wisp', 'ricochet_ember', 'core_overdrive']);
ok(lv80.length === EXPECT_LV80.size && lv80.every((id) => EXPECT_LV80.has(id)), `Lv80対象が想定どおり (${lv80.join(',')})`);
// 非対象の代表: 地雷/墓標/分身/光線/陣/鎖/共鳴 は false
for (const id of ['ember_minefield', 'funeral_pyres', 'ash_doppelganger', 'scorching_ray', 'tri_flame_array', 'molten_chains', 'scorching_resonance', 'four_sided_inferno']) {
  const s = actives.find((x) => x.id === id);
  ok(s && !appliesLv80ProjectileCount(s), `${id} は Lv80対象外`);
}
// 進化18種はすべて Lv80対象外（単一形態）。
for (const ev of evolutions) ok(!appliesLv80ProjectileCount(ev), `進化 ${ev.id} は Lv80対象外`);

// ===== 4. 主要ダメージにタグ（element/DoT/explosion/summon/beam/melee 等）が読み取れる =====
section('4. 主要タグの解決');
for (const s of actives) {
  ok(Array.isArray(s.tags) && s.tags.includes('fire'), `${s.id} は fire タグを持つ（火属性補正対象）`);
}
// DoT/爆発/召喚/ビーム/近接の代表がタグに表れる。
const hasTag = (id, t) => primaryTags(skills.find((s) => s.id === id) || evolutions.find((e) => e.id === id)).includes(t);
ok(hasTag('magma_vein', 'DoT'), 'magma_vein に DoT タグ');
ok(hasTag('funeral_pyres', 'explosion'), 'funeral_pyres に explosion タグ');
ok(hasTag('scorching_ray', 'beam'), 'scorching_ray に beam タグ');
ok(hasTag('flame_crescent', 'melee'), 'flame_crescent に melee タグ');
ok(hasTag('fire_spirit', 'summon'), 'fire_spirit に summon タグ');

// ===== 5. 同種の攻撃スキルで理由なく残響対応が分かれない =====
section('5. 残響/複製の対応状況の一貫性');
// 防御/反応/移動は残響・複製の起点にならない（非対応 or 攻撃部分のみ）。
for (const id of ['phoenix_feather', 'flame_barrier', 'blazing_step']) {
  const s = actives.find((x) => x.id === id);
  ok(echoStatus(s) === '非対応', `${id} は残響非対応`);
  ok(cloneStatus(s) === '複製不可', `${id} は複製不可`);
}
// 資源/チャージ/熱量スキルは「攻撃部分のみ」。
for (const id of ['bloodfire_pact', 'bullet_furnace', 'core_overdrive']) {
  const s = actives.find((x) => x.id === id);
  ok(s.echoPolicy === 'custom' && s.clonePolicy === 'custom', `${id} は custom（攻撃部分のみ）`);
}
// 分身系は forbidden（複製から複製を作らない）。
for (const id of ['ash_doppelganger']) {
  const s = actives.find((x) => x.id === id);
  ok(s.echoPolicy === 'forbidden' && s.clonePolicy === 'forbidden', `${id} は forbidden`);
}
// 標準攻撃 active（弾系）は残響対応。
for (const id of ['fireball', 'flame_lance', 'scatter_flame', 'ricochet_ember', 'core_overdrive']) {
  const s = actives.find((x) => x.id === id);
  ok(echoStatus(s) !== '非対応', `${id} は残響に参加（${echoStatus(s)}）`);
}

// ===== 6. castSummary が UI 表示に必要な情報を返す =====
section('6. castSummary の妥当性');
for (const s of actives.slice(0, 5)) {
  const sum = castSummary(s);
  ok(sum.castMode && sum.echo && sum.clone && sum.lv80, `${s.id} の castSummary が完全`);
}

console.log('');
if (fail) { console.error(`✗ タグ監査テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ タグ監査テスト成功: ${pass} 件すべて通過`); process.exit(0); }
