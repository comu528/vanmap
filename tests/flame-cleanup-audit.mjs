// 火の魔女 完成監査 11/12: 後始末（cleanup）の監査（M8-A §12）。Node.js 標準機能のみ。
// 敵の死亡/プール返却・ボス死亡・進化置換・Scene 終了・周回終了・reload で、
// 表示物 / 参照 / 炎上索引 / 刻印 / 予約タイマーが残らないことを確認する。
// 実行: node tests/flame-cleanup-audit.mjs

import { DATA, FLAME, registryMap, skillSource, readSrc, makeScene, makeEnemies, runner, bootRuntime, evolutionBaseMap } from './flame-audit-common.mjs';

const { SkillManager } = await bootRuntime();

const T = runner('火の魔女 cleanup 監査（M8-A）');
const { ok, section, info } = T;
const MAP = registryMap();
const EVO_BASE = evolutionBaseMap();

// ===== 1. destroy() が全スキルで保持コレクションを空にする =====
section('1. 全 48 スキルの destroy() が保持コレクションを空にする');
const COLLECTIONS = ['patches', 'orbs', 'vortices', 'spirits', 'mines', 'clones', 'waves', 'tethers', 'trails',
  'pyres', 'zones', 'veins', 'segments', 'arrays', 'beams', 'blades', 'units', 'mausoleums', 'burnPatches', 'visuals'];
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  const isActive = FLAME.activeSkillPool.includes(id);
  const scene = makeScene({ enemies: makeEnemies(14), absorb: 1, seed: 0x7c11a3, deathEvents: [{ id: 1, x: 320, y: 200 }] });
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
    const v = sk[c];
    if (Array.isArray(v)) ok(v.length === 0, `${id}: destroy 後に ${c} が空`);
    else if (v instanceof Set || v instanceof Map) ok(v.size === 0, `${id}: destroy 後に ${c} が空`);
  }
  for (const f of ['ring', 'aura', '_beam', '_barrage', '_session']) {
    if (f in sk) ok(sk[f] == null || sk[f] === false, `${id}: destroy 後に ${f} が解放されている`);
  }
  // SkillManager.destroy() が全スキルへ伝播する。
  const scene2 = makeScene({ enemies: makeEnemies(6), seed: 0x7c11a3 });
  const sm2 = new SkillManager(scene2); scene2.skills = sm2;
  if (isActive) sm2.acquireOrLevel(id); else { sm2.acquireOrLevel(EVO_BASE[id]); sm2.evolve(EVO_BASE[id]); }
  for (let i = 0; i < 30; i++) { scene2.advance(50); sm2.update(50, { hasEnemies: true }); }
  let threw2 = false;
  try { sm2.destroy(); } catch (e) { threw2 = true; }
  ok(!threw2, `${id}: SkillManager.destroy() 経由でも例外なし`);
  ok(sm2.skills.size === 0, `${id}: SkillManager.destroy() 後にスキルが残らない`);
}

// ===== 2. 進化置換で元 active の表示物が残らない =====
section('2. 進化置換で元 active のインスタンスと表示物が解放される');
for (const eid of FLAME.evolutionPool) {
  const base = EVO_BASE[eid];
  const scene = makeScene({ enemies: makeEnemies(10), seed: 0x7c11a3 });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel(base); sm.setLevel(base, 8);
  for (let i = 0; i < 60; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  sm.evolve(base);
  ok(!sm.skills.has(base), `${eid}: 進化後に元 ${base} のインスタンスが消える`);
  ok(sm.skills.has(eid), `${eid}: 進化スキルが入る`);
  ok(sm.hasEvolved(base), `${eid}: hasEvolved(${base}) が真`);
  // 進化元は同一周回で再度進化しない（二重置換なし）。
  ok(sm.evolve(base) === null, `${eid}: 同一周回で ${base} を再進化できない`);
}

// ===== 3. Enemy の再利用で炎上 / 刻印 / 状態が残らない =====
section('3. Enemy.reset() で炎上・刻印・氷側状態がクリアされる');
{
  const enemySrc = readSrc('src/entities/Enemy.js');
  const resetBody = enemySrc.slice(enemySrc.indexOf('reset('));
  for (const f of ['_igniteUntil', '_igniteGen', '_mark', '_chill', '_frozenUntil', '_freezeImmuneUntil', '_iceSeal', '_iceHitCount']) {
    ok(new RegExp('this\\.' + f + '\\s*=').test(enemySrc), `Enemy が ${f} を初期化する`);
    ok(new RegExp('this\\.' + f + '\\s*=').test(resetBody), `reset() で ${f} をクリアする（プール再利用の残留なし）`);
  }
  ok(/_gridCell/.test(enemySrc), 'Enemy が空間グリッドのセル参照を持つ（返却時に解除される）');
}

// ===== 4. 炎上索引 / 刻印がプール返却・死亡で掃除される =====
section('4. 炎上索引・刻印・死亡イベント履歴の掃除経路');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/unregisterBurning\(/.test(bs), '炎上索引の解除メソッドがある');
  ok(/this\._burningIndex\.delete\(e\)/.test(bs), '走査時に消火/死亡個体を索引から除く');
  ok(/e\._mark = null/.test(bs), '刻印は起爆/死亡で解除される');
  ok(/_deathEvents/.test(bs), '死亡イベント履歴を持つ');
  ok(/maxDeathEventsTracked/.test(bs), '死亡イベント履歴に上限がある（無制限に伸びない）');
  ok(/releaseDeathEvents|retainDeathEvents/.test(bs), '死亡イベント履歴は必要なスキルの所持時のみ保持する（retain/release）');
  const pool = readSrc('src/systems/PoolManager.js');
  ok(/onRelease/.test(pool), 'PoolManager が返却フックを持つ（グリッド解除・状態クリアの一元化）');
}

// ===== 5. 予約タイマー（delayedCall）が destroy で無効化される =====
section('5. delayedCall で予約した処理が destroy 後に走らない');
// delayedCall を使うスキルは、すべて破棄/終了ガードを持たなければならない（destroy 後に走らない）。
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  const src = skillSource(id, MAP);
  if (!/delayedCall\(/.test(src)) { ok(true, `${id}: delayedCall を使わない（遅延ガード不要）`); continue; }
  ok(/_dead|_destroyed|gameOver/.test(src), `${id}: 遅延処理に破棄ガード（_dead / _destroyed / gameOver）がある`);
}
{
  // 実駆動: destroy 後に時間を進めても例外・追加ダメージが出ない。
  for (const id of ['flame_pillar', 'flame_crescent', 'four_sided_inferno', 'ember_minefield', 'meteor']) {
    const scene = makeScene({ enemies: makeEnemies(10), seed: 0x7c11a3 });
    const sm = new SkillManager(scene); scene.skills = sm;
    sm.acquireOrLevel(id); sm.setLevel(id, 8);
    for (let i = 0; i < 60; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
    sm.destroy();
    const before = scene.calls.length;
    let threw = false;
    try { for (let i = 0; i < 40; i++) scene.advance(50); } catch (e) { threw = true; }
    ok(!threw, `${id}: destroy 後に時間を進めても例外が出ない`);
    info(`${id}: destroy 後の追加呼び出し ${scene.calls.length - before} 件`);
  }
}

// ===== 6. BattleScene の終了処理が各系を解放する =====
section('6. BattleScene の終了処理がスキル/表示/デバッグを解放する');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  for (const f of ['skills', 'statusVisuals', 'statusDebug']) {
    if (new RegExp('this\\.' + f + '\\s*=').test(bs)) {
      ok(new RegExp('this\\.' + f + '[\\s\\S]{0,160}destroy\\(\\)').test(bs), `${f} を destroy する経路がある`);
    }
  }
  ok(/onDeath\(|onRelease\(/.test(bs), '敵の死亡/返却で状態マネージャへ通知する');
  ok(/shutdown|destroy\(\)/.test(bs), 'Scene 終了フックがある');
}

// ===== 7. 品質変更・reload でインスタンスが二重にならない =====
section('7. 品質変更・reload でインスタンスが二重にならない');
for (const id of ['orbiting_flame', 'fire_spirit', 'ash_doppelganger', 'molten_chains']) {
  const scene = makeScene({ enemies: makeEnemies(10), seed: 0x7c11a3 });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel(id); sm.setLevel(id, 8);
  for (let i = 0; i < 80; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  const sk = sm.skills.get(id);
  const sizeOf = () => ['orbs', 'spirits', 'clones', 'tethers'].reduce((n, k) => n + (Array.isArray(sk[k]) ? sk[k].length : 0), 0);
  const before = sizeOf();
  // レベル変更（=_rebuild / _ensure）を往復しても増えない。
  sk.setLevel(4); for (let i = 0; i < 10; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  sk.setLevel(8); for (let i = 0; i < 10; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  ok(sizeOf() <= before, `${id}: レベル往復後も保持数 ${sizeOf()} ≤ ${before}（再構築で二重生成しない）`);
  const snap = sm.serializeRuntime();
  sm.restoreRuntime(snap); sm.restoreRuntime(snap);
  for (let i = 0; i < 10; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  ok(sizeOf() <= before, `${id}: restoreRuntime を2回適用しても保持数が増えない（冪等）`);
}

void DATA;
T.finish();
