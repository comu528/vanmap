// 戦士 Wave2 8/21: 燕返し（M8-D §backstep_riposte）。Node.js 標準機能のみ。
//   - 短く後退してから踏み込んで斬り返す（自分から仕掛ける。反撃の調停とは別系統）
//   - 後退中は軽減が乗るが**無敵にはならない**
//   - 対象が消えても安全に終わる。壁外・NaN・テレポートを作らない
//   - 相手を追い越さない（間合いのぶんだけ踏み込む）
// 実行: node tests/warrior-backstep-riposte.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 燕返し（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'backstep_riposte';
const SKILL = DATA.skills.find((x) => x.id === ID);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 350, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 12000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 後退 → 踏み込み → 斬撃 =====
section('1. 後退してから踏み込み、斬り返す');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  const p = ctx.scene.player;
  const x0 = p.x;
  let sawBack = false, sawLunge = false, minX = x0;
  for (let i = 0; i < 700; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    if (sk._move && sk._move.phase === 'back') { sawBack = true; minX = Math.min(minX, p.x); }
    if (sk._move && sk._move.phase === 'lunge') sawLunge = true;
  }
  ok(sawBack, '後退フェーズがある');
  ok(sawLunge, '踏み込みフェーズがある');
  ok(minX < x0, `後退で敵から離れる（${x0} → ${minX.toFixed(1)}）`);
  const s = st(ctx, ID);
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok((s.hits || 0) > 0, `命中する（${s.hits}）`);
  info(`燕返し: cast${s.casts} hit${s.hits} 斬撃${s.extra?.strikes}`);
}

// ===== 2. 後退中の軽減は無敵ではない =====
section('2. 後退中は軽減が乗るが、無敵にはならない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  let mitigatedWhileBack = null;
  for (let i = 0; i < 400 && mitigatedWhileBack === null; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    if (sk.retreating) mitigatedWhileBack = sk.activeMitigation();
  }
  ok(mitigatedWhileBack !== null, '後退中の軽減値を取得できる');
  ok(mitigatedWhileBack > 0, `後退中は軽減が乗る（${(mitigatedWhileBack || 0).toFixed(3)}）`);
  ok(mitigatedWhileBack < 1, `無敵ではない（${(mitigatedWhileBack || 0).toFixed(3)} < 1）`);
  ok(SKILL.levels[7].mitigationValue < 1, `Lv8 の宣言値も 1 未満（${SKILL.levels[7].mitigationValue}）`);
  ok(!sk.retreating || sk.activeMitigation() > 0, '踏み込み中は軽減が切れる（構え continuation ではない）');
}

// ===== 3. 反撃の調停とは別系統 =====
section('3. 反撃（counter）の調停とは別系統である');
{
  const map = registryMap();
  const src = skillSourceDeep(ID, map) || '';
  ok(!/counterSource/.test(src), 'counterSource を名乗らない');
  ok(!/performCounter/.test(src), 'performCounter を実装しない');
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 8000);
  const before = ctx.w.telemetry.counters || 0;
  ctx.scene.onWarriorHit(100, 80);
  ok((ctx.w.telemetry.counters || 0) === before, '被弾しても反撃としては数えない');
}

// ===== 4. 対象が消えても安全に終わる =====
section('4. 対象が消えても安全に終わる（壁外・NaN・テレポートなし）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  const p = ctx.scene.player;
  let maxJump = 0, prev = { x: p.x, y: p.y };
  for (let i = 0; i < 900; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    // 踏み込み中に敵を全部消す。
    if (i === 200) for (const e of ctx.enemies) e.alive = false;
    if (i === 400) for (const e of ctx.enemies) { e.alive = true; e.hp = 1e9; }
    maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = { x: p.x, y: p.y };
  }
  ok(Number.isFinite(p.x) && Number.isFinite(p.y), '座標が NaN にならない');
  const m = SKILL.config.worldMargin;
  ok(p.x >= m - 1e-6 && p.x <= 1600 - m + 1e-6, `x が壁内（${p.x.toFixed(1)}）`);
  ok(p.y >= m - 1e-6 && p.y <= 1200 - m + 1e-6, `y が壁内（${p.y.toFixed(1)}）`);
  ok(maxJump < 40, `1 フレームの移動が ${maxJump.toFixed(1)}px（テレポートしない）`);
  ok(sk._move === null || sk._move.totalMs <= SKILL.config.maxRiposteMs * 3, '踏み込みは必ず終わる');
}

// ===== 5. 相手を追い越さない =====
section('5. 踏み込みで相手を追い越さない（間合いのぶんだけ進む）');
{
  // 至近の敵 1 体に対して、踏み込み後も敵の手前で止まる。
  const e = makeEnemies(1, { x: 340, y: 300, hp: 1e9 })[0];
  const ctx = build({ enemies: [e] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const p = ctx.scene.player;
  let overshoot = 0;
  for (let i = 0; i < 700; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    overshoot = Math.max(overshoot, p.x - e.x);
  }
  ok(overshoot < 40, `敵を大きく追い越さない（最大 ${overshoot.toFixed(1)}px）`);
  ok((st(ctx, ID).hits || 0) > 0, `至近の敵にもちゃんと当たる（${st(ctx, ID).hits}）`);
}

// ===== 6. 保存で二重踏み込みしない =====
section('6. 保存 / 復元で二重踏み込み・座標の飛びが起きない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 4000);
  const sk = ctx.sm.skills.get(ID);
  const stt = sk.serializeState();
  ok(typeof stt.cdLeft === 'number', 'cdLeft を保存する');
  ok(!('moved' in stt) && !('angle' in stt), '踏み込みの途中座標は保存しない');
  const x = ctx.scene.player.x;
  sk.restoreState({ cdLeft: 0, ripostePhase: 'lunge' });
  ok(sk._move === null, '復元で踏み込み状態を持ち越さない');
  ok(ctx.scene.player.x === x, '復元で座標が動かない');
}

// ===== 7. 成長 =====
section('7. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'backstep', 'lunge', 'mitigationValue', 'arc', 'poiseDamage']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 20000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 20000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 8. 破棄 =====
section('8. 破棄後に踏み込みが継続しない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 3000);
  const sk = ctx.sm.skills.get(ID);
  sk.destroy();
  const x = ctx.scene.player.x, y = ctx.scene.player.y;
  for (let i = 0; i < 60; i++) sk.update(16, { hasEnemies: true });
  ok(sk._move === null, '破棄後は踏み込み状態を持たない');
  ok(ctx.scene.player.x === x && ctx.scene.player.y === y, '破棄後にプレイヤーが動かない');
}

T.finish();
