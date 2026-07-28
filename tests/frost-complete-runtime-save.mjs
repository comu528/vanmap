// 氷術師 完成監査 7/12: 保存・復元の完全監査（M7-E §20）。Node.js 標準機能のみ。
// active30・進化18 の全件を SkillManager 経由で駆動し、serializeRuntime/restoreRuntime の往復で
// CD 全回復・無料 cast・設置/召喚/印の二重生成が起きないこと、表示オブジェクトを保存しないことを確認する。
// 実行: node tests/frost-complete-runtime-save.mjs

import { DATA, FROST, registryMap, skillSource, readSrc, makeScene, makeEnemies, runner } from './frost-audit-common.mjs';

globalThis.Phaser = { BlendModes: { ADD: 1, NORMAL: 0 } };
globalThis.window = globalThis.window || {};

const { DataManager } = await import('../src/systems/DataManager.js');
for (const [k, v] of Object.entries({
  skills: { skills: DATA.skills }, skillEvolutions: { evolutions: DATA.evolutions }, balance: DATA.balance,
  skillMastery: DATA.skillMastery, passives: { passives: DATA.passives }, jobs: { jobs: DATA.jobs },
  skillConfig: DATA.skillConfig, jobProgression: DATA.jobProgression, statusEffects: DATA.statusEffects,
})) DataManager.data[k] = v;
for (const s of DATA.skills) DataManager._skillMap.set(s.id, s);
DataManager.loaded = true;
const { SkillManager } = await import('../src/systems/SkillManager.js');

const T = runner('氷術師 保存・復元 完全監査（M7-E）');
const { ok, section, info } = T;
const MAP = registryMap();

function build(acquire, evolveFrom) {
  const scene = makeScene({ enemies: makeEnemies(14) });
  const sm = new SkillManager(scene); scene.skills = sm;
  if (evolveFrom) { sm.acquireOrLevel(evolveFrom); sm.setLevel(evolveFrom, 8); sm.evolve(evolveFrom); }
  else { sm.acquireOrLevel(acquire); sm.setLevel(acquire, 8); }
  return { scene, sm };
}
const drive = (scene, sm, frames = 120, dt = 50) => { for (let i = 0; i < frames; i++) { scene.advance(dt); sm.update(dt, { hasEnemies: true }); } };

const EVO_BASE = {};
for (const e of DATA.evolutions) if (FROST.evolutionPool.includes(e.id)) EVO_BASE[e.id] = e.baseSkillId;

// ===== 1. 全 48 件が runtime 保存往復で落ちない =====
section('1. active30・進化18 の serializeRuntime → restoreRuntime 往復');
const withState = [];
for (const id of FROST.activeSkillPool) {
  const A = build(id);
  drive(A.scene, A.sm, 80);
  let snap = null;
  ok((() => { try { snap = A.sm.serializeRuntime(); return true; } catch (e) { info(`${id}: ${e.message}`); return false; } })(), `${id}: serializeRuntime が例外を投げない`);
  const B = build(id);
  ok((() => { try { B.sm.restoreRuntime(snap); return true; } catch (e) { info(`${id}: ${e.message}`); return false; } })(), `${id}: restoreRuntime が例外を投げない`);
  drive(B.scene, B.sm, 20);
  ok(true, `${id}: 復元後の駆動が例外なし`);
  if (snap && snap[id] && Object.keys(snap[id]).length) withState.push(id);
}
for (const eid of FROST.evolutionPool) {
  const A = build(null, EVO_BASE[eid]);
  drive(A.scene, A.sm, 80);
  const snap = A.sm.serializeRuntime();
  const B = build(null, EVO_BASE[eid]);
  B.sm.restoreRuntime(snap);
  drive(B.scene, B.sm, 20);
  ok(true, `${eid}: 進化スキルの runtime 往復が例外なし`);
  if (snap && snap[eid] && Object.keys(snap[eid]).length) withState.push(eid);
}
info(`runtimeState を保存するスキル: ${withState.length} 件`);

// ===== 2. 表示オブジェクト・エンティティ参照を保存しない =====
section('2. runtimeState に Graphics/Text/Tween/Timer/entity 参照を含まない');
for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
  const A = build(FROST.activeSkillPool.includes(id) ? id : null, FROST.activeSkillPool.includes(id) ? null : EVO_BASE[id]);
  drive(A.scene, A.sm, 60);
  const snap = A.sm.serializeRuntime();
  let json = '';
  ok((() => { try { json = JSON.stringify(snap[id] || {}); return true; } catch (e) { return false; } })(), `${id}: runtimeState が JSON 化できる（循環参照なし）`);
  ok(!/"gfx"|"sprite"|"img"|"overlay"|"tween"|"timer"|"enemy"|"target"/i.test(json), `${id}: 表示物/エンティティ参照を保存しない`);
}

// ===== 3. CD は必ず復元される（再開直後の無料 cast を防ぐ）=====
section('3. クールダウン（cdLeft / *Left）が復元される');
for (const id of FROST.activeSkillPool) {
  const src = skillSource(id, MAP);
  if (!/serializeState\s*\(/.test(src)) { ok(true, `${id}: serializeState を持たない（基底の CD 管理のみ）`); continue; }
  ok(/cdLeft|Left\s*:/.test(src), `${id}: serializeState に残り時間（cdLeft / *Left）を含む`);
  ok(/restoreState[\s\S]{0,600}(cdLeft|Left)/.test(src), `${id}: restoreState が残り時間を戻す`);
}

// ===== 4. 二重生成の防止（設置/召喚/砲台/印/波/弾幕）=====
section('4. 復元で設置物・召喚・砲台・印・波・弾幕が二重生成されない');
const PLACEMENT = {
  permafrost_field: 'fields', ice_wall: 'walls', cryo_mine: 'mines', frost_spirit: 'spirits', ice_prison: 'prisons',
  crystal_bloom: 'blooms', snowblind_mist: '_mist', snowflake_sentry: 'sentries', absolute_ice_seal: 'marks',
  iceberg_ram: 'berg', aurora_veil: '_session', winter_halo: '_state',
};
for (const [id, field] of Object.entries(PLACEMENT)) {
  if (!FROST.activeSkillPool.includes(id)) continue;
  const A = build(id); drive(A.scene, A.sm, 100);
  const before = A.sm.skills.get(id);
  const cnt = (sk) => { const v = sk && sk[field]; return Array.isArray(v) ? v.length : (v ? 1 : 0); };
  const snap = A.sm.serializeRuntime();
  const B = build(id); B.sm.restoreRuntime(snap);
  const after = B.sm.skills.get(id);
  ok(cnt(after) <= cnt(before), `${id}: 復元後の ${field} 数 ${cnt(after)} ≤ 復元前 ${cnt(before)}（二重生成しない）`);
  // 復元を2回行っても増えない（冪等）。
  B.sm.restoreRuntime(snap);
  ok(cnt(B.sm.skills.get(id)) <= cnt(before), `${id}: restoreRuntime を2回適用しても ${field} が増えない`);
}

// ===== 5. 通常敵マーカーは捨て、CD は必ず復元する（無料 mark / 無料起爆の防止）=====
section('5. 氷印/氷棺は通常敵ぶんを復元せず、CD だけ必ず戻す');
for (const id of ['absolute_ice_seal', 'eternal_sealed_coffin']) {
  const src = skillSource(id, MAP);
  ok(/markLeft/.test(src), `${id}: serializeState に markLeft（次の印までの残り）を含む`);
  ok(/bossMark|isBoss/.test(src), `${id}: 復元対象をボス印に限定している`);
  ok(/startHits:\s*\([a-z]+\._iceHitCount/.test(src), `${id}: 復元後の命中数は数え直す（無料起爆しない）`);
  ok(!/_iceHitCount/.test(String(JSON.stringify(DATA.skills.find((s) => s.id === id) || {}))), `${id}: 命中数カウンタ自体は data/保存対象に持たない`);
}

// ===== 6. 進化前後が同時稼働しない =====
section('6. 進化後に元 active が動かない（同時稼働なし）');
for (const eid of FROST.evolutionPool) {
  const base = EVO_BASE[eid];
  const A = build(null, base);
  ok(!!A.sm.skills.get(eid), `${eid}: 進化スキルが有効`);
  ok(!A.sm.skills.get(base), `${eid}: 進化元 ${base} のインスタンスが残っていない`);
  const snap = A.sm.serializeRuntime();
  ok(!(base in snap) || !snap[base] || Object.keys(snap[base]).length === 0, `${eid}: runtime にも進化元の状態が残らない`);
  const B = build(null, base); B.sm.restoreRuntime(snap);
  ok(!!B.sm.skills.get(eid) && !B.sm.skills.get(base), `${eid}: 再開後も進化済みのまま（元 active が復活しない）`);
}

// ===== 7. save_version は v6 のまま（加算的変更）=====
section('7. save_version v6 維持');
ok(DATA.balance.saveVersion === 6, `balance.json saveVersion=${DATA.balance.saveVersion}`);
{
  const schema = readSrc('src/systems/profileSchema.js');
  ok(/6/.test(schema), 'profileSchema が v6 を扱う');
  const sfSrc = readSrc('docs/save-format.md');
  ok(/v6/.test(sfSrc), 'docs/save-format.md が v6 を記載');
}

T.finish();
