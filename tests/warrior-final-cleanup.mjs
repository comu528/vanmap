// 戦士 最終Wave 14/16: 後始末・リーク防止（M8-E §cleanup）。Node.js 標準機能のみ。
//   - M8-E の 10 スキルすべてが destroy を実装し、破棄後に何も動かない
//   - 敵 / 弾のプール返却で参照が残らない（決闘対象・弾いた弾の id を持ち越さない）
//   - Enemy.reset() / Projectile.reset() が M8-E で増えたフィールドを全部戻す
//   - 長時間プレイでも内部 Map / Set が伸び続けない
//   - 決闘 / 構え / 弾き窓 / 進軍が必ず時間で終わる
// 実行: node tests/warrior-final-cleanup.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, registryMap, skillSource, skillSourceDeep, capFor } from './warrior-common.mjs';

const T = runner('戦士 最終Wave 後始末・リーク防止（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const FINAL = [...EXPECTED.finalActives, ...EXPECTED.finalEvolutions];

let bulletSeq = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bulletSeq, x: 402 + i * 3, y: 300, angle: Math.PI, alive: true, hostile: true,
  damage: 20, speed: 180, projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 340, y: 300, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, enemyBullets: opts.bullets || mkBullets(10) });
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

// ===== 1. destroy と破棄ガード =====
section('1. M8-E の 10 スキルすべてが destroy と破棄ガードを持つ');
{
  const map = registryMap();
  for (const id of FINAL) {
    const src = skillSourceDeep(id, map) || '';
    ok(/destroy\s*\(/.test(src), `${id}: destroy を実装している`);
    ok(/_dead/.test(src), `${id}: 破棄フラグを持つ`);
  }
}

section('2. 破棄後は発動も進行中処理も動かない');
for (const id of FINAL) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  run(ctx, 4000);
  const sk = ctx.sm.skills.get(id);
  sk.destroy();
  const before = ctx.scene.calls.length;
  for (let i = 0; i < 400; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  ok(ctx.scene.calls.length === before, `${id}: 破棄後に 1 件も追加処理が出ない（増分 ${ctx.scene.calls.length - before}）`);
}

// ===== 3. 敵の参照を残さない =====
section('3. 敵 / 弾のプール返却で参照が残らない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('duel_challenge'); ctx.sm.setLevel('duel_challenge', 8);
  run(ctx, 4000);
  ok(ctx.w.duelActive, '決闘中の状態を作れる');
  // WarriorCombatSystem は敵オブジェクトを 1 つも保持しない。
  const json = JSON.stringify(ctx.w.duelState(null));
  ok(!/"hp"|"maxHp"|"alive"|"def"/.test(json), `決闘状態に敵オブジェクトを含まない（${json.slice(0, 100)}）`);
  for (const v of Object.values(ctx.w.duelState(null) || {})) {
    ok(v === null || typeof v !== 'object', '決闘状態の値はすべて単純な値');
  }
  // 対象を返却しても幽霊参照が残らない。
  const t = ctx.scene.duelTarget();
  ctx.w.onEnemyRemoved(t);
  ok(!ctx.w.duelActive && t._duelMark === false, '返却でマーカーごと落ちる');

  // 弾いた弾の id 集合も window を閉じれば消える。
  const dctx = build();
  dctx.sm.acquireOrLevel('weapon_deflection'); dctx.sm.setLevel('weapon_deflection', 8);
  run(dctx, 3000);
  ok(dctx.w.telemetry.deflected > 0, '弾き返しが成立している');
  dctx.w.endDeflectionWindow(null);
  ok(dctx.w._deflectedIds.size === 0, `window を閉じると弾いた id 集合が空になる（${dctx.w._deflectedIds.size}）`);
}

// ===== 4. Enemy / Projectile の reset =====
section('4. Enemy.reset() / Projectile.reset() が M8-E のフィールドを全部戻す');
{
  const esrc = readSrc('src/entities/Enemy.js');
  const ereset = esrc.slice(esrc.indexOf('reset('));
  for (const f of ['_duelMark', '_lineAlong']) {
    ok(esrc.includes(f), `Enemy.js が ${f} を持つ`);
    ok(ereset.includes(f), `Enemy.reset() が ${f} を戻す`);
  }
  const psrc = readSrc('src/entities/Projectile.js');
  for (const f of ['_deflectId', 'alreadyDeflected', 'deflectGeneration', 'suppressSpecialEffects']) {
    ok(psrc.includes(f), `Projectile.js が ${f} を持つ`);
  }
  // reset() は _clearState() を通るので、_clearState に全部あれば戻る。
  const clear = psrc.slice(psrc.indexOf('_clearState()'), psrc.indexOf('reset(x, y, angle'));
  for (const f of ['_deflectId', 'alreadyDeflected', 'deflectGeneration', 'suppressSpecialEffects']) {
    ok(clear.includes(f), `Projectile._clearState() が ${f} を戻す`);
  }
  ok(/reset\s*\([^)]*\)\s*\{\s*[^}]*this\._clearState\(\)/.test(psrc), 'Projectile.reset() が _clearState() を呼ぶ');
}

// ===== 5. 内部 Map / Set が伸び続けない =====
section('5. 長時間プレイでも内部 Map / Set が伸び続けない');
{
  const ctx = build({ enemies: makeEnemies(20, { x: 340, y: 300, dy: 2, hp: 1e9 }), bullets: mkBullets(30) });
  for (const id of EXPECTED.finalActives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 20000);
  const mid = { d: ctx.w._deflectedIds.size, c: ctx.w.counterWindows.size };
  run(ctx, 40000);
  const end = { d: ctx.w._deflectedIds.size, c: ctx.w.counterWindows.size };
  const DF = DATA.balance.warrior.deflection;
  ok(end.d <= DF.maxDeflectionsPerWindow, `弾いた id 集合が 1 window 分に収まる（${end.d} ≤ ${DF.maxDeflectionsPerWindow}）`);
  ok(end.c <= 4, `反撃窓の数が有界（${end.c}）`);
  ok(end.d <= mid.d + DF.maxDeflectionsPerWindow, `3 倍の時間でも伸び続けない（${mid.d} → ${end.d}）`);
  info(`60s 経過後: 弾いた id ${end.d} / 反撃窓 ${end.c}`);
}

// ===== 6. すべての時限状態が必ず終わる =====
section('6. 決闘 / 構え / 弾き窓 / 進軍が必ず時間で終わる');
{
  const W = DATA.balance.warrior;
  const ctx = build();
  const w = ctx.w;
  w.beginDuelChallenge('a', ctx.enemies[0], { durationMs: W.duel.maxDurationMs, meleeDamageBonus: 0.2 });
  w.beginBattleTrance('b', { durationMs: W.trance.maxDurationMs, meleeDamageBonus: 0.2 });
  w.beginDeflectionWindow('c', { windowMs: W.deflection.maxWindowMs, maxDeflections: 8, radius: 120, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  const limit = Math.max(W.duel.maxDurationMs, W.trance.maxDurationMs, W.deflection.maxWindowMs) + W.duel.maxExtensionMs + 2000;
  for (let i = 0; i < limit / 16; i++) { w.update(16); ctx.scene.advance(16); }
  ok(!w.duelActive, `決闘が ${limit}ms 以内に終わる`);
  ok(!w.tranceActive, `構えが ${limit}ms 以内に終わる`);
  ok(!w.deflectionActive, `弾き窓が ${limit}ms 以内に終わる`);

  // 進軍も必ず終わる（敵が消えても）。
  const mctx = build();
  mctx.sm.acquireOrLevel('earthshaker_march'); mctx.sm.setLevel('earthshaker_march', 8);
  run(mctx, 2000);
  for (const e of mctx.enemies) e.alive = false;
  run(mctx, 6000);
  ok(mctx.sm.skills.get('earthshaker_march').marching === false, '進軍は敵が消えても必ず終わる');
}

// ===== 7. 反射弾が溜まり続けない =====
section('7. 反射弾が溜まり続けない（世代 1・短命・同時数上限）');
{
  const ctx = build({ bullets: mkBullets(40) });
  ctx.sm.acquireOrLevel('heaven_mirror_reversal'); ctx.sm.setLevel('heaven_mirror_reversal', 8);
  run(ctx, 30000);
  const cap = capFor('maxReflectedProjectiles', 'high', 8);
  ok(ctx.scene.reflected.length <= cap, `同時反射弾が上限内（${ctx.scene.reflected.length} ≤ ${cap}）`);
  ok(ctx.scene.reflected.every((p) => p.deflectGeneration === 1), 'すべて世代 1（再反射しない）');
  ok(ctx.scene.reflected.every((p) => p.lifeMs <= DATA.balance.warrior.deflection.maxReflectLifeMs), 'すべて短命');
}

// ===== 8. Scene 終了で全部消える =====
section('8. Scene 終了（destroy）で M8-E の状態が 1 つも残らない');
{
  const ctx = build();
  for (const id of EXPECTED.finalActives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 6000);
  for (const id of EXPECTED.finalActives) ctx.sm.skills.get(id).destroy();
  ctx.w.destroy();
  ok(!ctx.w.duelActive && !ctx.w.tranceActive && !ctx.w.deflectionActive, '3 つの時限状態が消える');
  ok(ctx.w._deflectedIds.size === 0, '弾いた id 集合も空');
  ok(ctx.scene._deflectOpts === null, '被弾フックも外れている');
  // 敵側のマーカーも残らない。
  ok(ctx.enemies.every((e) => e._duelMark !== true) || ctx.enemies.filter((e) => e._duelMark).length <= 1,
    '敵側に決闘マーカーが溜まらない');
}

// ===== 9. 実装が Scene / 敵の内部状態を直接いじらない =====
section('9. スキルが Scene / 敵の内部状態を直接いじらない（共通経路を通る）');
{
  const map = registryMap();
  for (const id of FINAL) {
    const src = skillSource(id, map) || '';
    ok(!/enemyPool|projPool|bossBulletPool/.test(src), `${id}: プールを直接触らない`);
    ok(!/\._poise\s*=/.test(src), `${id}: 敵の体勢を直接書き換えない`);
    ok(!/\._duelMark\s*=/.test(src), `${id}: 決闘マーカーを直接立てない（共通経路が立てる）`);
    ok(!/\.alive\s*=\s*false/.test(src), `${id}: 敵 / 弾を直接消さない`);
  }
}

T.finish();
