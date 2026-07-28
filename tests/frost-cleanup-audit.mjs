// 氷術師 完成監査 11/12: 後始末（cleanup）の監査（M7-E §23）。Node.js 標準機能のみ。
// 敵の死亡/プール返却・ボス死亡・進化置換・Scene 終了・周回終了・reload で、表示物/参照/状態/マーカーが残らないことを確認する。
// 実行: node tests/frost-cleanup-audit.mjs

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
const { StatusEffectRegistry } = await import('../src/systems/StatusEffectRegistry.js');
const { FreezeSystem } = await import('../src/systems/FreezeSystem.js');
const { StatusEffectManager } = await import('../src/systems/StatusEffectManager.js');

const T = runner('氷術師 cleanup 監査（M7-E）');
const { ok, section, info } = T;
const MAP = registryMap();
const EVO_BASE = {};
for (const e of DATA.evolutions) if (FROST.evolutionPool.includes(e.id)) EVO_BASE[e.id] = e.baseSkillId;

// ===== 1. destroy() が全スキルで表示物を片付ける =====
section('1. 全 48 スキルの destroy() が保持コレクションを空にする');
const COLLECTIONS = ['fields', 'walls', 'mines', 'spirits', 'prisons', 'blooms', 'sentries', 'marks', 'stars', 'waves', 'residues', 'trees', 'wheels', 'mirrors', 'spears', 'crystals', 'chains'];
for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
  const isActive = FROST.activeSkillPool.includes(id);
  const scene = makeScene({ enemies: makeEnemies(14) });
  const sm = new SkillManager(scene); scene.skills = sm;
  if (isActive) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  else { sm.acquireOrLevel(EVO_BASE[id]); sm.setLevel(EVO_BASE[id], 8); sm.evolve(EVO_BASE[id]); }
  for (let i = 0; i < 100; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  const sk = sm.skills.get(id);
  ok(!!sk, `${id}: インスタンスがある`);
  let threw = false;
  try { sk.destroy(); } catch (e) { threw = true; info(`${id}: destroy 例外 ${e.message}`); }
  ok(!threw, `${id}: destroy() が例外を投げない`);
  for (const c of COLLECTIONS) {
    if (Array.isArray(sk[c])) ok(sk[c].length === 0, `${id}: destroy 後に ${c} が空`);
  }
  // 単体保持（_mist/_session/_barrage/berg/rush）も破棄される。
  for (const f of ['_mist', '_session', '_barrage', 'berg', 'rush', '_beam']) {
    if (f in sk) ok(sk[f] == null || sk[f] === false, `${id}: destroy 後に ${f} が解放されている`);
  }
  // SkillManager.destroy() が全スキルへ伝播する。
  const scene2 = makeScene({ enemies: makeEnemies(6) });
  const sm2 = new SkillManager(scene2); scene2.skills = sm2;
  if (isActive) sm2.acquireOrLevel(id); else { sm2.acquireOrLevel(EVO_BASE[id]); sm2.evolve(EVO_BASE[id]); }
  for (let i = 0; i < 30; i++) { scene2.advance(50); sm2.update(50, { hasEnemies: true }); }
  let threw2 = false;
  try { sm2.destroy(); } catch (e) { threw2 = true; }
  ok(!threw2, `${id}: SkillManager.destroy() 経由でも例外なし`);
}

// ===== 2. 進化置換で元 active の表示物が残らない =====
section('2. 進化置換で元 active のインスタンスと表示物が解放される');
for (const eid of FROST.evolutionPool) {
  const base = EVO_BASE[eid];
  const scene = makeScene({ enemies: makeEnemies(10) });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel(base); sm.setLevel(base, 8);
  for (let i = 0; i < 60; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  sm.evolve(base);
  ok(!sm.skills.has(base), `${eid}: 進化後に元 ${base} のインスタンスが消える`);
  ok(sm.skills.has(eid), `${eid}: 進化スキルが入る`);
  ok(sm.hasEvolved(base), `${eid}: hasEvolved(${base}) が真`);
}

// ===== 3. Enemy の再利用で氷の状態・マーカーが残らない =====
section('3. Enemy.reset() で chill / frozen / immunity / burning / iceSeal / iceHitCount が消える');
{
  const enemySrc = readSrc('src/entities/Enemy.js');
  for (const f of ['_chill', '_chillSlow', '_frozenUntil', '_freezeImmuneUntil', '_iceSeal', '_iceHitCount']) {
    ok(new RegExp('this\\.' + f + '\\s*=').test(enemySrc), `Enemy が ${f} を初期化する`);
  }
  // reset() の本体に主要フィールドのクリアが入っている。
  const resetBody = enemySrc.slice(enemySrc.indexOf('reset('));
  for (const f of ['_chill', '_frozenUntil', '_freezeImmuneUntil', '_iceSeal', '_iceHitCount']) {
    ok(new RegExp('this\\.' + f + '\\s*=').test(resetBody), `reset() で ${f} をクリアする`);
  }
  ok(/this\._igniteUntil\s*=\s*0/.test(resetBody), 'reset() で炎上（_igniteUntil）もクリアされる');
}

// ===== 4. StatusEffectManager の索引が死亡/返却で掃除される =====
section('4. 状態索引が死亡・プール返却・clearAll で掃除される');
{
  const reg = new StatusEffectRegistry(DATA.statusEffects);
  const fs = new FreezeSystem(reg, null);
  let now = 0;
  const sfx = new StatusEffectManager({ registry: reg, freezeSystem: fs, now: () => now });
  const es = makeEnemies(8);
  for (let i = 0; i < 20; i++) { now += 50; for (const e of es) sfx.applyIceHit(e, { chillAmount: 20, baseFreezeChance: 0.3, procCoefficient: 1, hitGroupId: i }); sfx.update(50); }
  ok(sfx.statusIndexSize() > 0, '状態索引にエンティティが載る');
  // 死亡 → onDeath で索引から外れる。
  const dead = es[0]; dead.alive = false; sfx.onDeath(dead);
  ok(dead._chill === 0 && dead._frozenUntil === 0 && dead._freezeImmuneUntil === 0, '死亡時に状態フィールドがクリアされる');
  // プール返却 → onRelease。
  const rel = es[1]; sfx.onRelease(rel);
  ok(rel._chill === 0 && rel._frozenUntil === 0, 'プール返却時に状態フィールドがクリアされる');
  // 全クリア。
  sfx.clearAll();
  ok(sfx.statusIndexSize() === 0, 'clearAll で索引が空になる');
  ok(Object.keys(sfx.capReached()).length === 0, 'clearAll で上限到達カウンタもリセットされる');
}

// ===== 5. 氷印/氷棺マーカーの解放（死亡・上書き・destroy）=====
section('5. 氷印/氷棺は死亡・上書き・destroy でエンティティ側から外れる');
for (const id of ['absolute_ice_seal', 'eternal_sealed_coffin']) {
  const src = skillSource(id, MAP);
  ok(/_iceSeal\s*=\s*null/.test(src), `${id}: マーカー解除時に enemy._iceSeal を null へ戻す`);
  ok(/_iceSeal\s*!==\s*m/.test(src), `${id}: 別スキルに上書きされたマーカーを捨てる`);
  ok(/destroy\s*\([\s\S]{0,400}_iceSeal/.test(src), `${id}: destroy() でマーカーを外す`);
  ok(/_markedSet\.(delete|clear)/.test(src), `${id}: 内部の対象集合も掃除する`);
}
// マーカーは正式 status として登録しない（M7-D の設計）。
{
  const ids = (DATA.statusEffects.statusEffects || []).map((s) => s.id);
  for (const forbidden of ['ice_seal', 'iceSeal', 'ice_coffin', 'sealed_coffin']) {
    ok(!ids.includes(forbidden), `status-effects.json に ${forbidden} を登録していない（skill-local マーカーのまま）`);
  }
  ok(ids.length === 5, `正式状態は 5 種のまま（${ids.join('/')}）`);
}

// ===== 6. BattleScene の終了処理が表示系を解放する =====
section('6. BattleScene の終了処理が状態表示/デバッグ/ボスUI を解放する');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  for (const f of ['statusVisuals', 'statusDebug', 'frostbreakUI', 'skills']) {
    if (new RegExp('this\\.' + f + '\\s*=').test(bs)) {
      ok(new RegExp('this\\.' + f + '[\\s\\S]{0,120}destroy\\(\\)').test(bs), `${f} を destroy する経路がある`);
    }
  }
  ok(/onDeath\(|onRelease\(/.test(bs), '敵の死亡/返却で状態マネージャへ通知する');
  const sdp = readSrc('src/ui/StatusDebugPanel.js');
  ok(/_unsub/.test(sdp), 'StatusDebugPanel はイベント購読を解除できる');
  ok(/destroy\(\)\s*{[\s\S]{0,200}_unsub/.test(sdp), 'destroy() で購読解除する（リスナー残留なし）');
  const svm = readSrc('src/systems/StatusVisualManager.js');
  ok(/destroy\(\)\s*{[\s\S]{0,200}_unsub/.test(svm), 'StatusVisualManager も destroy() で購読解除する');
}

T.finish();
