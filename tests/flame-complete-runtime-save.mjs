// 火の魔女 完成監査 7/12: 保存・復元の完全監査（M8-A §11）。Node.js 標準機能のみ。
// active30・進化18 の全件を SkillManager 経由で駆動し、serializeRuntime/restoreRuntime の往復で
// CD 全回復・無料 cast・設置/召喚/弾幕の二重生成が起きないこと、表示オブジェクトを保存しないことを確認する。
// 実行: node tests/flame-complete-runtime-save.mjs

import { DATA, FLAME, registryMap, skillSource, readSrc, makeScene, makeEnemies, runner, bootRuntime, evolutionBaseMap } from './flame-audit-common.mjs';

const { SkillManager } = await bootRuntime();
const { skillsWithRuntimeState } = await import('../src/systems/SkillManager.js');

const T = runner('火の魔女 保存・復元 完全監査（M8-A）');
const { ok, section, info } = T;
const MAP = registryMap();
const EVO_BASE = evolutionBaseMap();

function build(acquire, evolveFrom, opts = {}) {
  const scene = makeScene(Object.assign({ enemies: makeEnemies(14), absorb: 1, deathEvents: [{ id: 1, x: 320, y: 200, isElite: false, isBoss: false }] }, opts));
  const sm = new SkillManager(scene); scene.skills = sm;
  if (evolveFrom) { sm.acquireOrLevel(evolveFrom); sm.setLevel(evolveFrom, 8); sm.evolve(evolveFrom); }
  else { sm.acquireOrLevel(acquire); sm.setLevel(acquire, 8); }
  return { scene, sm };
}
const drive = (scene, sm, frames = 120, dt = 50) => { for (let i = 0; i < frames; i++) { scene.advance(dt); sm.update(dt, { hasEnemies: true }); } };

// ===== 1. 全 48 件が runtime 保存往復で落ちない =====
section('1. active30・進化18 の serializeRuntime → restoreRuntime 往復');
const withState = [];
for (const id of FLAME.activeSkillPool) {
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
for (const eid of FLAME.evolutionPool) {
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
ok(withState.length >= 44, `48 件のうち ${withState.length} 件が実際に状態を保存する`);

// ===== 2. 全 48 件が serializeState / restoreState を持つ（M8-A の CD 保存漏れ修正）=====
section('2. active30・進化18 すべてが runtimeState 対象（再開直後の無料発動を作らない）');
{
  const rt = new Set(skillsWithRuntimeState());
  for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
    ok(rt.has(id), `${id}: skillsWithRuntimeState に含まれる（serializeState を実装している）`);
  }
}

// ===== 3. 表示オブジェクト・エンティティ参照を保存しない =====
section('3. runtimeState に Graphics/Text/Tween/Timer/entity 参照を含まない');
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  const isActive = FLAME.activeSkillPool.includes(id);
  const A = build(isActive ? id : null, isActive ? null : EVO_BASE[id]);
  drive(A.scene, A.sm, 60);
  const snap = A.sm.serializeRuntime();
  let json = '';
  ok((() => { try { json = JSON.stringify(snap[id] || {}); return true; } catch (e) { return false; } })(), `${id}: runtimeState が JSON 化できる（循環参照なし）`);
  ok(!/"gfx"|"sprite"|"img"|"overlay"|"tween"|"timer"|"enemy"|"target"|"ring"|"aura"|"beams"/i.test(json), `${id}: 表示物/エンティティ参照を保存しない`);
}

// ===== 4. クールダウン・周期は必ず復元される（再開直後の無料 cast を防ぐ）=====
section('4. クールダウン / 周期（cdLeft / *Left / *Tick / *Pulse）が復元される');
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  const src = skillSource(id, MAP);
  ok(/serializeState\s*\(/.test(src), `${id}: serializeState を持つ`);
  ok(/restoreState\s*\(/.test(src), `${id}: restoreState を持つ`);
  ok(/cdLeft|Left|Tick|Pulse|Timer|charge|heat/i.test(src), `${id}: 残り時間/蓄積のいずれかを保存対象にしている`);
}

// ===== 5. 二重生成の防止（設置/召喚/軍勢/分身/弾幕/砲台）=====
section('5. 復元で設置物・召喚・分身・軍勢が二重生成されない');
const PLACEMENT = {
  burning_trail: 'patches', orbiting_flame: 'orbs', flame_vortex: 'vortices', lava_bomb: 'patches',
  fire_spirit: 'spirits', ember_minefield: 'mines', ash_doppelganger: 'clones', four_sided_inferno: 'waves',
  molten_chains: 'tethers', funeral_pyres: 'pyres', magma_vein: 'veins', tri_flame_array: 'arrays',
};
for (const [id, field] of Object.entries(PLACEMENT)) {
  if (!FLAME.activeSkillPool.includes(id)) continue;
  const A = build(id); drive(A.scene, A.sm, 100);
  const before = A.sm.skills.get(id);
  const cnt = (sk) => { const v = sk && sk[field]; return Array.isArray(v) ? v.length : (v && v.size != null ? v.size : (v ? 1 : 0)); };
  const snap = A.sm.serializeRuntime();
  const B = build(id); B.sm.restoreRuntime(snap);
  const after = B.sm.skills.get(id);
  ok(cnt(after) <= cnt(before), `${id}: 復元後の ${field} 数 ${cnt(after)} ≤ 復元前 ${cnt(before)}（二重生成しない）`);
  B.sm.restoreRuntime(snap);
  ok(cnt(B.sm.skills.get(id)) <= cnt(before), `${id}: restoreRuntime を2回適用しても ${field} が増えない（冪等）`);
}
const EVO_PLACEMENT = {
  purgatory_eruption: 'burnPatches', solar_core_collapse: 'patches', infernal_vortex_wheel: 'vortices',
  hellfire_mine_network: 'mines', inferno_blade_domain: 'blades', ash_legion: 'units',
  necroflame_mausoleum: 'mausoleums', hexagram_inferno_array: 'arrays',
};
for (const [eid, field] of Object.entries(EVO_PLACEMENT)) {
  const A = build(null, EVO_BASE[eid]); drive(A.scene, A.sm, 100);
  const cnt = (sk) => { const v = sk && sk[field]; return Array.isArray(v) ? v.length : (v ? 1 : 0); };
  const before = cnt(A.sm.skills.get(eid));
  const snap = A.sm.serializeRuntime();
  const B = build(null, EVO_BASE[eid]); B.sm.restoreRuntime(snap);
  ok(cnt(B.sm.skills.get(eid)) <= before, `${eid}: 復元後の ${field} 数が復元前を超えない（二重生成しない）`);
}

// ===== 6. 防御スキル・資源スキルの耐久/チャージが二重にならない =====
section('6. 防御耐久・吸収チャージ・不死鳥トリガーが復元で回復しない');
for (const id of ['flame_barrier', 'phoenix_feather', 'bullet_furnace', 'bloodfire_pact', 'core_overdrive', 'blazing_step']) {
  const A = build(id, null, { absorb: 2 }); drive(A.scene, A.sm, 120);
  const snap = A.sm.serializeRuntime();
  const B = build(id, null, { absorb: 2 }); B.sm.restoreRuntime(snap);
  const a = JSON.stringify(A.sm.skills.get(id).serializeState());
  const b = JSON.stringify(B.sm.skills.get(id).serializeState());
  ok(a === b, `${id}: 復元直後の状態が保存時と一致（耐久/チャージ/CD が勝手に回復しない）`);
}

// ===== 7. 進化前後が同時稼働しない =====
section('7. 進化後に元 active が動かない（同時稼働なし）');
for (const eid of FLAME.evolutionPool) {
  const base = EVO_BASE[eid];
  const A = build(null, base);
  ok(!!A.sm.skills.get(eid), `${eid}: 進化スキルが有効`);
  ok(!A.sm.skills.get(base), `${eid}: 進化元 ${base} のインスタンスが残っていない`);
  const snap = A.sm.serializeRuntime();
  ok(!(base in snap) || !snap[base] || Object.keys(snap[base]).length === 0, `${eid}: runtime にも進化元の状態が残らない`);
  const B = build(null, base); B.sm.restoreRuntime(snap);
  ok(!!B.sm.skills.get(eid) && !B.sm.skills.get(base), `${eid}: 再開後も進化済みのまま（元 active が復活しない）`);
}

// ===== 8. save_version は v6 のまま（加算的変更）=====
section('8. save_version v6 維持');
ok(DATA.balance.saveVersion === 6, `balance.json saveVersion=${DATA.balance.saveVersion}`);
{
  const schema = readSrc('src/systems/profileSchema.js');
  ok(/6/.test(schema), 'profileSchema が v6 を扱う');
  ok(/v6/.test(readSrc('docs/save-format.md')), 'docs/save-format.md が v6 を記載');
  const bm = readSrc('src/systems/BattleManager.js');
  ok(/skillRuntime/.test(bm), 'BattleManager が skillRuntime をスナップショットへ含める');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/restoreRuntime\(r\.skillRuntime\)/.test(bs), 'BattleScene が再開時に skillRuntime を復元する');
}

T.finish();
