// 戦士 Wave1 14/19: 保存 / 復元（M8-C §16）。Node.js 標準機能のみ。
// Wave1 で増えた 15 スキル（active10 + evolution5）の保存だけを見る。
//   - save_version は 6 のまま（追加フィールドのみ）
//   - 新スキルすべてがクールダウンを保存し、再読込直後の無料発動が起きない
//   - 進行中の効果（跳躍・進軍・鎖鉤・連撃・構え・戦吼バフ）を無限化しない
//   - 敵オブジェクト参照を 1 件も保存しない（安定 runtime id のみ）
//   - 旧セーブ（Wave1 フィールドなし）・壊れたセーブで落ちない
// 実行: node tests/warrior-wave1-runtime-save.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 Wave1 保存 / 復元（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const WAVE1 = [...EXPECTED.wave1Actives, ...EXPECTED.wave1Evolutions];
const SKILL = (id) => DATA.skills.find((x) => x.id === id);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 400, y: 300, dy: 4, hp: 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: opts.now || 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};

// ===== 1. save_version 据え置き =====
section('1. save_version は 6 のまま（Wave1 は追加のみ）');
{
  ok(DATA.balance.saveVersion === 6, `balance.json の saveVersion が 6（${DATA.balance.saveVersion}）`);
  const bm = readSrc('src/systems/BattleManager.js');
  ok(/warriorState/.test(bm), 'warriorState の保存が引き続きある');
  ok(!/saveVersion\s*[:=]\s*7/.test(bm), 'save_version を 7 へ上げていない');
  const wcs = readSrc('src/systems/WarriorCombatSystem.js');
  ok(/timedBuffs/.test(wcs), 'Wave1 の一時バフ / 構えは timedBuffs として追加保存する');
  ok(/serializeTimedBuffs\(\)/.test(wcs) && /restoreTimedBuffs\(/.test(wcs), '専用の serialize / restore がある');
}

// ===== 2. 新スキルすべてが CD を保存する =====
section('2. Wave1 の 15 スキルすべてがクールダウンを保存 / 復元する');
{
  const map = registryMap();
  for (const id of WAVE1) {
    const src = skillSourceDeep(id, map) || '';
    ok(/serializeState\s*\(\s*\)/.test(src), `${id}: serializeState を実装する`);
    ok(/restoreState\s*\(/.test(src), `${id}: restoreState を実装する`);
    ok(/cdLeft/.test(src), `${id}: cdLeft を保存する`);
  }
}

// ===== 3. 再読込直後に無料発動が起きない =====
section('3. 再読込直後に無料発動（CD ゼロでの即発動）が起きない');
for (const id of WAVE1) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (SKILL(id)) ctx.sm.setLevel(id, 8);
  // 1 度発動させて CD が残っている状態を作る。
  run(ctx, 300);
  const sk = ctx.sm.skills.get(id);
  sk._cd = 1234;
  const saved = sk.serializeState();
  ok(saved.cdLeft === 1234, `${id}: 残 CD を保存する（${saved.cdLeft}ms）`);

  const ctx2 = build();
  ctx2.sm.acquireOrLevel(id);
  if (SKILL(id)) ctx2.sm.setLevel(id, 8);
  const sk2 = ctx2.sm.skills.get(id);
  sk2.restoreState(saved);
  ok(sk2._cd === 1234, `${id}: 残 CD が復元される`);
  // 復元直後の 1 フレームで発動しない。
  let fired = 0;
  const origFire = sk2.fire.bind(sk2);
  sk2.fire = () => { fired += 1; return origFire(); };
  sk2.update(16, { hasEnemies: true });
  ok(fired === 0, `${id}: 復元直後の 1 フレームで発動しない`);
}

// ===== 4. 進行中の効果を無限化しない =====
section('4. 進行中の効果（跳躍 / 進軍 / 鎖鉤 / 連撃）を復元で二重化しない');
{
  const ONGOING = {
    leap_smash: (sk) => !!sk._leap,
    heaven_crushing_descent: (sk) => !!sk._leap,
    sweeping_advance: (sk) => !!sk._sweep,
    chain_hook: (sk) => !!sk._hook,
    relentless_combo: (sk) => !!sk._combo,
  };
  for (const [id, active] of Object.entries(ONGOING)) {
    // 怒涛連撃は近接密着でしか始まらないので、進行中状態を作るために敵を近くへ置く。
    const near = makeEnemies(10, { x: 330, y: 300, dy: 3, hp: 1e9 });
    const ctx = build({ enemies: near });
    ctx.sm.acquireOrLevel(id);
    if (SKILL(id)) ctx.sm.setLevel(id, 8);
    const sk = ctx.sm.skills.get(id);
    sk.fire();
    sk.update(16, { hasEnemies: true });
    ok(active(sk), `${id}: 進行中の状態がある`);
    const saved = JSON.parse(JSON.stringify(sk.serializeState()));
    // 保存に敵オブジェクトが混ざらない。
    ok(!Object.values(saved).some((v) => v && typeof v === 'object' && !Array.isArray(v)),
      `${id}: 保存にオブジェクト参照が含まれない`);
    ok(JSON.stringify(saved).length < 300, `${id}: 保存が小さい（${JSON.stringify(saved).length} bytes）`);

    const ctx2 = build({ enemies: makeEnemies(10, { x: 330, y: 300, dy: 3, hp: 1e9 }) });
    ctx2.sm.acquireOrLevel(id);
    if (SKILL(id)) ctx2.sm.setLevel(id, 8);
    const sk2 = ctx2.sm.skills.get(id);
    // 打撃の総量が復元で増えないことを見る。
    let strikes = 0;
    const origMelee = ctx2.scene.combat.meleeStrike;
    ctx2.scene.combat.meleeStrike = (o) => { if (o.skillId === id) strikes += 1; return origMelee(o); };
    sk2.restoreState(saved);
    sk2._cd = 1e9; // 再発動させない
    for (let i = 0; i < 200; i++) { sk2.update(16, { hasEnemies: true }); ctx2.scene.advance(16); }
    // 薙ぎ進軍だけは「再開」する（残り時間と消化済み数を引き継ぐ）。他は再開しない。
    if (id === 'sweeping_advance') {
      const lv8 = SKILL(id).levels[7];
      ok(strikes + (saved.sweepStrikes || 0) <= lv8.maxStrikes,
        `${id}: 再開後の合計打撃 ${strikes + (saved.sweepStrikes || 0)} ≤ maxStrikes ${lv8.maxStrikes}`);
    } else {
      ok(strikes === 0, `${id}: 復元で進行中の効果が再開しない（打撃 ${strikes}）`);
    }
    ok(Number.isFinite(ctx2.scene.player.x) && Number.isFinite(ctx2.scene.player.y), `${id}: 座標が壊れない`);
  }
}

// ===== 5. 戦吼バフ / 構えの往復一致 =====
section('5. 戦吼バフ・反撃の構えが往復で一致し、上限を超えない');
{
  const ctx = build();
  ctx.w.applyWarCryBuff({ durationMs: 5000, meleeDamageBonus: 0.2, furyGainBonus: 0.3, comboGraceBonus: 0.4 });
  ctx.w.beginCounterWindow('counter_stance', { durationMs: 2000, maxCounters: 2, priority: 1, mitigation: 0.3, counterCooldownMs: 200 });
  ctx.w.beginCounterWindow('adamant_counter', { durationMs: 2600, maxCounters: 3, priority: 3, mitigation: 0.42 });
  ctx.w.consumeCounterEvent();
  const snap = JSON.parse(JSON.stringify(ctx.w.serialize()));
  ok(!!snap.timedBuffs, 'serialize が timedBuffs を含む');
  ok(!!snap.timedBuffs.warCry, '戦吼バフを保存する');
  ok(Object.keys(snap.timedBuffs.counterWindows).length === 2, `構えを 2 件保存する（${Object.keys(snap.timedBuffs.counterWindows).join(',')}）`);

  const ctx2 = build();
  ctx2.w.restore(snap);
  ok(Math.abs(ctx2.w.warCry.leftMs - ctx.w.warCry.leftMs) < 1e-6, 'バフの残り時間が一致');
  ok(ctx2.w.warCry.meleeDamageBonus === ctx.w.warCry.meleeDamageBonus, 'バフの強度が一致');
  for (const src of ['counter_stance', 'adamant_counter']) {
    const a = ctx.w.counterWindowOf(src), b = ctx2.w.counterWindowOf(src);
    ok(!!b, `${src}: 構えが復元される`);
    ok(b.used === a.used, `${src}: 使用回数が一致（${b.used}）— 再読込で使い直せない`);
    ok(Math.abs(b.leftMs - a.leftMs) < 1e-6, `${src}: 残り時間が一致`);
    ok(b.max === a.max, `${src}: 上限回数が一致`);
  }
  // 2 回目の serialize が 1 回目と一致する（往復で壊れない）。
  const snap2 = JSON.parse(JSON.stringify(ctx2.w.serialize()));
  ok(JSON.stringify(snap2.timedBuffs) === JSON.stringify(snap.timedBuffs), 'timedBuffs の往復が完全一致');
}

// ===== 6. 旧セーブ / 壊れたセーブ =====
section('6. 旧セーブ（Wave1 フィールドなし）・壊れたセーブで落ちない');
{
  const legacy = [
    {}, { fury: 10, combo: 3 }, { fury: 10, combo: 3, timedBuffs: undefined },
    { timedBuffs: null }, { timedBuffs: {} }, { timedBuffs: { warCry: null, counterWindows: null } },
    { timedBuffs: { warCry: { leftMs: 1e12, meleeDamageBonus: 99 }, counterWindows: { evil: { leftMs: 1e12, used: -5, max: 1e9 } } } },
    { timedBuffs: { counterWindows: 'not-an-object' } },
    { timedBuffs: { warCry: { leftMs: NaN } } },
  ];
  for (const s of legacy) {
    const ctx = build();
    let threw = null;
    try { ctx.w.restore(s); } catch (e) { threw = e; }
    ok(!threw, `旧/壊れセーブ ${JSON.stringify(s).slice(0, 60)} で例外を出さない`);
    ok(ctx.w.warCry.leftMs <= DATA.balance.warrior.warCry.maxDurationMs, 'バフ持続が上限内');
    ok(ctx.w.warCry.meleeDamageBonus <= DATA.balance.warrior.warCry.maxMeleeDamageBonus, 'バフ強度が上限内');
    for (const w of ctx.w.counterWindows.values()) {
      ok(w.leftMs >= 0 && w.used >= 0 && w.max >= 1, `構えの値が正常化される（left ${Math.round(w.leftMs)} used ${w.used} max ${w.max}）`);
    }
  }
  // 壊れた skill 保存でも落ちない。
  for (const id of WAVE1) {
    const ctx = build();
    ctx.sm.acquireOrLevel(id);
    if (SKILL(id)) ctx.sm.setLevel(id, 8);
    const sk = ctx.sm.skills.get(id);
    let threw = null;
    try {
      for (const bad of [null, undefined, {}, { cdLeft: 'x' }, { cdLeft: NaN }, { sweepLeftMs: -1e9 }, { hookSeq: 'a' }, { remainStrikes: 1e9 }]) sk.restoreState(bad);
      for (let i = 0; i < 60; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
    } catch (e) { threw = e; }
    ok(!threw, `${id}: 壊れた skill 保存で例外を出さない（${threw ? threw.message : 'ok'}）`);
  }
}

// ===== 7. 再読込で稼げない =====
section('7. 再読込を繰り返しても闘気 / コンボ / 反撃回数を稼げない');
{
  const ctx = build();
  for (const id of EXPECTED.wave1Actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 8000);
  let snap = JSON.parse(JSON.stringify(ctx.w.serialize()));
  const fury0 = snap.fury, combo0 = snap.combo;
  for (let i = 0; i < 20; i++) {
    const c = build();
    c.w.restore(snap);
    snap = JSON.parse(JSON.stringify(c.w.serialize()));
  }
  ok(Math.abs(snap.fury - fury0) < 1e-6, `20 回の再読込で闘気が増えない（${fury0.toFixed(2)} → ${snap.fury.toFixed(2)}）`);
  ok(snap.combo === combo0, `コンボも増えない（${combo0} → ${snap.combo}）`);
  ok(snap.telemetry.counters === (ctx.w.telemetry.counters || 0), '反撃回数も増えない');
  info(`再読込 20 回: 闘気 ${snap.fury.toFixed(2)} / コンボ ${snap.combo}`);
}

// ===== 8. 保存に敵オブジェクトが 1 件も無い =====
section('8. 保存全体に敵オブジェクト参照が 1 件も含まれない');
{
  const boss = makeBoss();
  const ctx = build({ boss });
  for (const id of WAVE1) {
    ctx.sm.acquireOrLevel(id);
    if (SKILL(id)) ctx.sm.setLevel(id, 8);
  }
  run(ctx, 8000);
  const snap = ctx.w.serialize();
  const skillSnap = {};
  for (const [id, sk] of ctx.sm.skills) if (typeof sk.serializeState === 'function') skillSnap[id] = sk.serializeState();
  const all = JSON.stringify({ snap, skillSnap });
  ok(!/"alive"/.test(all) && !/"maxHp"/.test(all) && !/"isBoss"/.test(all), '保存に敵の内部フィールドが現れない');
  ok(!/"applyKnockback"/.test(all), '関数参照も含まれない');
  // 循環参照が無い（JSON 化できる）。
  let threw = null;
  try { JSON.parse(all); } catch (e) { threw = e; }
  ok(!threw, '保存が JSON として往復できる');
  info(`保存サイズ: warrior ${JSON.stringify(snap).length} bytes / skills ${JSON.stringify(skillSnap).length} bytes`);
}

T.finish();
