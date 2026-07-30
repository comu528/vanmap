// 戦士 完成監査 12/23: 敵種別ごとの挙動（M8-F §14）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-enemy-types.mjs
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, readSrc, runner } from './warrior-common.mjs';
const T = runner('戦士 敵種別 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
const mk = (o = {}) => {
  const enemies = o.enemies || makeEnemies(10, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: o.boss || null, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    c.sm.update(step, { hasEnemies: true });
    c.w.setHp(c.scene.player.maxHp * (i % 300 < 150 ? 1 : 0.2), c.scene.player.maxHp);
    c.w.update(step); c.scene.advance(step);
  }
};

// ===== 1. 通常敵 =====
section('1. 通常敵: ノックバック / 打ち上げ / 掴み / 投げ / 処刑 / 引き寄せが効く');
{
  const c = mk();
  const n = c.enemies[0];
  ok(c.w.launchPolicy(n).launched !== false, '打ち上げが許される');
  ok(c.w.grabPolicy(n).canGrab === true, '掴める');
  n.hp = 1; n.maxHp = 1000;
  ok(c.w.executePolicy(n, { thresholdNormal: 0.5 }).canExecute === true, '処刑できる');
  ok(c.w.applyPoiseDamage(n, 1e6) === null, '通常敵は体勢ゲージを持たない（ノックバックで処理）');
  // 打ち上げの残留が reset で必ず落ちる。
  const c2 = mk();
  c2.sm.acquireOrLevel('rising_slash'); c2.sm.setLevel('rising_slash', 8);
  run(c2, 6000);
  ok(c2.w.telemetry.launches > 0, `実プレイで打ち上げが起きる（${c2.w.telemetry.launches}）`);
  const airborne = c2.enemies.find((e) => e._airborneUntil > 0) || c2.enemies[0];
  airborne._airborneUntil = 9e9; airborne._launchImmuneUntil = 9e9; airborne._launchHeight = 40; airborne._grabbed = true; airborne._duelMark = true;
  c2.w.onEnemyRemoved(airborne);
  for (const k of ['_airborneUntil', '_launchImmuneUntil', '_launchHeight']) ok(airborne[k] === 0, `onEnemyRemoved で ${k} が 0`);
  ok(airborne._grabbed === false && airborne._duelMark === false, 'onEnemyRemoved でマーカーが落ちる');
  const en = readSrc('src/entities/Enemy.js');
  const reset = en.slice(en.indexOf('reset('));
  for (const k of ['_airborneUntil', '_launchImmuneUntil', '_launchHeight', '_grabbed', '_duelMark', '_poise', '_staggerUntil']) {
    ok(reset.includes(k), `Enemy.reset() が ${k} を戻す（プール再利用で持ち越さない）`);
  }
}

// ===== 2. エリート =====
section('2. エリート: stagger / 免疫 / 体勢・打ち上げ不可・掴み不可・処刑不可');
{
  const c = mk({ enemies: makeEnemies(6, { x: 340, y: 300, dx: 10, hp: 1e9, elite: true }) });
  const e = c.enemies[0];
  ok(c.w.launchPolicy(e).launched === false, '浮かない');
  ok(c.w.grabPolicy(e).canGrab === false, '掴めない');
  e.hp = 1; e.maxHp = 1000;
  ok(c.w.executePolicy(e, { thresholdNormal: 0.9 }).canExecute === false, '処刑されない');
  const r = c.w.applyPoiseDamage(e, W.poise.elite.threshold + 1);
  ok(r && r.type === 'eliteStagger', `しきい値で stagger（${JSON.stringify(r)}）`);
  ok(e._staggerUntil > c.scene.time.now, 'stagger が付く');
  ok(e._poiseImmuneUntil > c.scene.time.now, '免疫が付く');
  // 免疫中は再度 stagger しない。
  const r2 = c.w.applyPoiseDamage(e, 1e6);
  ok(!r2 || r2.type !== 'eliteStagger', '免疫中は連続 stagger しない');
  // 免疫が切れれば再度崩せる。
  c.scene.advance(W.poise.elite.immuneMs + 200);
  c.w.update(W.poise.elite.immuneMs + 200);
  const r3 = c.w.applyPoiseDamage(e, 1e6);
  ok(r3 && r3.type === 'eliteStagger', '免疫が切れれば再度崩せる');
  // 打ち上げの代わりに体勢へ変換される。
  const c2 = mk({ enemies: makeEnemies(6, { x: 340, y: 300, dx: 10, hp: 1e9, elite: true }) });
  c2.sm.acquireOrLevel('rising_slash'); c2.sm.setLevel('rising_slash', 8);
  run(c2, 6000);
  ok(c2.w.telemetry.launches === 0, 'エリートは 1 度も浮かない');
  ok(c2.w.telemetry.launchPoiseConverted > 0, `体勢へ変換される（${c2.w.telemetry.launchPoiseConverted.toFixed(1)}）`);
  // 決闘の優先度は通常敵より高い。
  ok(c2.w.duelPriority(c2.enemies[0]) > c2.w.duelPriority(makeEnemies(1, { hp: 1e9 })[0]), '決闘優先度が通常敵より高い');
}

// ===== 3. ボス =====
section('3. ボス: stance break / exposed / しきい値 ×1.25 上限 ×3 / 拘束禁止');
{
  const c = mk({ enemies: [], boss: makeBoss({ x: 440, y: 300, hp: 1e9 }) });
  const b = c.scene.boss;
  ok(c.w.launchPolicy(b).launched === false, '浮かない');
  ok(c.w.grabPolicy(b).canGrab === false, '掴めない');
  b.hp = 1; b.maxHp = 1e6;
  ok(c.w.executePolicy(b, { thresholdNormal: 0.99 }).canExecute === false, '処刑されない');
  const t0 = c.w.bossPoiseThreshold();
  const r = c.w.applyPoiseDamage(b, t0 + 1);
  ok(r && r.type === 'bossStanceBreak', `しきい値で stance break（${JSON.stringify(r)}）`);
  ok(c.w.exposedActive, 'exposed になる');
  ok(c.w.meleeDamageMultiplier(b) > 1, 'exposed 中は Dmg が伸びる');
  const t1 = c.w.bossPoiseThreshold();
  ok(Math.abs(t1 / t0 - W.poise.boss.thresholdGrowth) < 1e-6, `しきい値が ×${W.poise.boss.thresholdGrowth} になる（${(t1 / t0).toFixed(3)}）`);
  for (let i = 0; i < 30; i++) { c.w.applyPoiseDamage(b, 1e9); c.scene.advance(20000); c.w.update(20000); }
  const tn = c.w.bossPoiseThreshold();
  ok(tn <= t0 * W.poise.boss.thresholdMaxMult + 1e-6, `上限 ×${W.poise.boss.thresholdMaxMult} で頭打ち（×${(tn / t0).toFixed(2)}）`);
  ok(c.w.bossPoise.breaks > 1, `複数回崩せる（${c.w.bossPoise.breaks}）`);
  // exposed は時間で終わる（永久拘束しない）。
  for (let i = 0; i < 2000; i++) { c.w.update(16); c.scene.advance(16); }
  ok(!c.w.exposedActive, 'exposed が時間で終わる（永久拘束しない）');
  // 決闘の優先度が最上位。
  ok(c.w.duelPriority(b) > c.w.duelPriority(makeEnemies(1, { hp: 1e9, elite: true })[0]), '決闘優先度が最上位');
  // ボス除去で決闘が解ける。
  c.w.beginDuelChallenge('x', b, { durationMs: 8000, meleeDamageBonus: 0.2 });
  c.w.onBossRemoved();
  ok(!c.w.duelActive, 'ボス除去で決闘が解ける');
}

// ===== 4. 実プレイ: 全 30 active でも拘束・二重処理が起きない =====
section('4. 全 30 active を同時に持っても敵の状態が壊れない（実プレイ）');
{
  const enemies = [...makeEnemies(30, { x: 340, y: 300, dx: 8, dy: 3, hp: 1e9 }), ...makeEnemies(8, { x: 360, y: 300, dx: 8, hp: 1e9, elite: true })];
  const c = mk({ enemies, boss: makeBoss({ x: 470, y: 300, hp: 1e9 }) });
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  run(c, 40000);
  for (const e of c.enemies) {
    ok(Number.isFinite(e.x) && Number.isFinite(e.y), `敵の座標が有限（${e._seq}）`);
    ok(e.x >= 0 && e.x <= c.scene.worldW && e.y >= 0 && e.y <= c.scene.worldH, `敵が画面外へ飛ばない（${e._seq}）`);
    ok(!(e._airborneUntil > c.scene.time.now + W.launch.maxAirborneMs), '無限に浮かない');
    ok(Number.isFinite(e._poise || 0) && (e._poise || 0) >= 0, '体勢が有限で非負');
  }
  const elites = c.enemies.filter((e) => e.isElite);
  ok(elites.every((e) => !(e._airborneUntil > 0)), 'エリートは 1 度も浮いていない');
  ok(elites.every((e) => e._grabbed !== true), 'エリートは掴まれていない');
  ok(!(c.scene.boss._airborneUntil > 0) && c.scene.boss._grabbed !== true, 'ボスは浮かず掴まれない');
  const grabbed = c.enemies.filter((e) => e._grabbed);
  ok(grabbed.length <= W.grab.maxGrabPerCast, `同時に掴んでいるのは ${W.grab.maxGrabPerCast} 体以下（${grabbed.length}）`);
  const marked = c.enemies.filter((e) => e._duelMark);
  ok(marked.length <= 1, `決闘マーカーが溜まらない（${marked.length}）`);
  info(`40s: 打ち上げ${c.w.telemetry.launches} 拒否${c.w.telemetry.launchBlocked} 掴み${c.w.telemetry.grabs} 拒否${c.w.telemetry.grabRefused} 処刑${c.w.telemetry.executions} 崩し${c.w.bossPoise.breaks}`);
}

// ===== 5. 凍結 / 氷砕との独立 =====
section('5. 体勢は氷砕とは別フィールド・別しきい値（火 / 氷へ影響しない）');
{
  const c = mk({ enemies: [], boss: makeBoss({ x: 440, y: 300, hp: 1e9 }) });
  const b = c.scene.boss;
  b._frostbreakGauge = 123;
  c.w.applyPoiseDamage(b, 1e9);
  ok(b._frostbreakGauge === 123, '体勢削りが氷砕ゲージへ触らない');
  // コメントでの言及（「氷の frostbreak とは独立」）は許し、実コードでの参照が無いことを見る。
  const en = readSrc('src/systems/WarriorCombatSystem.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/frostbreak|chill|frozen/i.test(en), 'WarriorCombatSystem の実コードが氷の状態へ触らない');
}

T.finish();
