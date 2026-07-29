// 戦士 Wave2 12/21: 狂戦猛進（M8-D §berserker_rush）。Node.js 標準機能のみ。
//   - 近くの敵の間を短く踏み込みながら連続攻撃
//   - 体力が減っているほど 1 撃が重い。**自傷せず・処刑もせず・倍率に上限がある**
//   - テレポートしない（数フレームに分けて移動）。近距離だけを見て向き直る
//   - 1 発動 = 1 recordCast
// 実行: node tests/warrior-berserker-rush.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 狂戦猛進（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'berserker_rush';
const SKILL = DATA.skills.find((x) => x.id === ID);
const LOWHP = DATA.balance.warrior.lowHp;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 340, y: 300, dy: 6, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 16000, step = 16, hpFrac) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    if (hpFrac != null) ctx.w.setHp(ctx.scene.player.maxHp * hpFrac, ctx.scene.player.maxHp);
    else ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 連続で踏み込みながら斬る =====
section('1. 近くの敵の間を踏み込みながら連続で斬る');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const s = st(ctx, ID);
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok((s.extra?.steps || 0) > (s.casts || 0), `連撃数 ${s.extra?.steps} > cast ${s.casts}`);
  ok((s.extra?.rushDistance || 0) > 0, `踏み込み距離が記録される（${Math.round(s.extra?.rushDistance || 0)}px）`);
  ok((s.hits || 0) > 0, `命中する（${s.hits}）`);
  info(`狂戦猛進: cast${s.casts} 連撃${s.extra?.steps} 距離${Math.round(s.extra?.rushDistance || 0)}px`);
}

// ===== 2. 低 HP で重くなるが上限がある =====
section('2. 低 HP ほど重くなるが、倍率には必ず上限がある');
{
  const ctx = build();
  const w = ctx.w;
  w.setHp(100, 100);
  const full = w.lowHpDamageMultiplier(SKILL.levels[7].missingHpBonus);
  w.setHp(1, 100);
  const low = w.lowHpDamageMultiplier(SKILL.levels[7].missingHpBonus);
  ok(Math.abs(full - 1) < 1e-9, `満タンでは倍率 1（${full.toFixed(3)}）`);
  ok(low > full, `瀕死では倍率が上がる（${full.toFixed(3)} → ${low.toFixed(3)}）`);
  ok(low <= LOWHP.maxMissingHpMultiplier + 1e-9, `倍率 ${low.toFixed(3)} ≤ 上限 ${LOWHP.maxMissingHpMultiplier}`);
  // 極端な宣言値でも balance の上限を超えない。
  ok(w.lowHpDamageMultiplier(99) <= LOWHP.maxMissingHpMultiplier + 1e-9, '極端な宣言値でも上限を超えない');
  ok(SKILL.config.maxMissingHpMultiplier <= LOWHP.maxMissingHpMultiplier,
    `data の上限 ${SKILL.config.maxMissingHpMultiplier} ≤ balance ${LOWHP.maxMissingHpMultiplier}`);
  // 実プレイでも上限内。
  const lo = build(); lo.sm.acquireOrLevel(ID); lo.sm.setLevel(ID, 8); run(lo, 20000, 16, 1.0);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 20000, 16, 0.05);
  const rl = (st(lo, ID).damage || 0) / Math.max(1, st(lo, ID).hits || 1);
  const rh = (st(hi, ID).damage || 0) / Math.max(1, st(hi, ID).hits || 1);
  ok(rh > rl, `瀕死のほうが 1 撃が重い（${rl.toFixed(1)} → ${rh.toFixed(1)}）`);
  ok(rh <= rl * LOWHP.maxMissingHpMultiplier + 1e-6, `1 撃の伸びが上限内（×${(rh / rl).toFixed(3)}）`);
  info(`1 撃あたり: 満タン ${rl.toFixed(1)} / 瀕死 ${rh.toFixed(1)}（×${(rh / rl).toFixed(2)}）`);
}

// ===== 3. 自傷しない・処刑しない =====
section('3. 自傷せず、処刑もしない');
{
  const src = skillSourceDeep(ID, registryMap()) || '';
  ok(!/execute/i.test(src), '処刑（execute）を呼ばない');
  ok(!/takeDamage|selfDamage|player\.hp\s*-=/.test(src), '自分へダメージを与えない');
  const ctx = build({ hp: 1e9 });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const hp0 = ctx.scene.player.hp;
  run(ctx, 20000);
  ok(ctx.scene.player.hp >= hp0, `プレイヤーの HP が減らない（${hp0} → ${ctx.scene.player.hp}）`);
  ok((ctx.w.telemetry.executes || 0) === 0, '処刑が 0 件');
}

// ===== 4. テレポートしない・壁内に収まる =====
section('4. テレポートせず、壁内に収まる');
{
  const ctx = build({ enemies: makeEnemies(10, { x: 1400, y: 1000, dy: 8, hp: 1e9 }) });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const p = ctx.scene.player;
  let maxJump = 0, prev = { x: p.x, y: p.y };
  for (let i = 0; i < 1500; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = { x: p.x, y: p.y };
  }
  ok(maxJump <= SKILL.levels[7].stepDistance + 1e-6, `1 フレームの移動 ${maxJump.toFixed(1)}px ≤ stepDistance ${SKILL.levels[7].stepDistance}`);
  const m = SKILL.config.worldMargin;
  ok(p.x >= m - 1e-6 && p.x <= 1600 - m + 1e-6, `x が壁内（${p.x.toFixed(1)}）`);
  ok(p.y >= m - 1e-6 && p.y <= 1200 - m + 1e-6, `y が壁内（${p.y.toFixed(1)}）`);
  ok(Number.isFinite(p.x) && Number.isFinite(p.y), '座標が NaN にならない');
}

// ===== 5. 遠距離へは飛ばない =====
section('5. 遠距離の敵へは飛ばない（近距離だけを見て向き直る）');
{
  const near = makeEnemies(2, { x: 350, y: 300, dy: 4, hp: 1e9 });
  const far = makeEnemies(4, { x: 1200, y: 300, dy: 4, hp: 1e9 });
  far.forEach((e, i) => { e._seq = 80 + i; });
  const ctx = build({ enemies: [...near, ...far] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const farHits = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID && far.includes(c[2])).length;
  ok(farHits === 0, `遠くの敵へは 1 度も当たらない（${farHits}）`);
  ok(ctx.scene.player.x < 700, `遠くの敵まで移動しない（x=${ctx.scene.player.x.toFixed(0)}）`);
}

// ===== 6. 連撃数と時間の上限 =====
section('6. 連撃数と継続時間が data の上限内');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const s = st(ctx, ID);
  const cap = Math.min(SKILL.levels[7].rushCount, capFor('maxRushSteps', 'high', 8));
  ok((s.extra?.steps || 0) <= (s.casts || 0) * cap, `連撃 ${s.extra?.steps} ≤ cast × ${cap}`);
  ok((s.extra?.plannedSteps || 0) <= (s.casts || 0) * cap, `計画連撃数も上限内`);
  ok(ctx.sm.skills.get(ID)._rush === null || ctx.sm.skills.get(ID)._rush.totalMs <= SKILL.config.maxRushMs,
    `連撃は maxRushMs（${SKILL.config.maxRushMs}ms）で必ず終わる`);
}

// ===== 7. 成長 =====
section('7. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'rushCount', 'stepDistance', 'retargetRange', 'missingHpBonus', 'poiseDamage']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  ok(b.interval < a.interval, `interval: ${a.interval} → ${b.interval}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 24000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 24000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 8. 保存 / 破棄 =====
section('8. 保存 / 破棄で二重踏み込みが起きない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 5000);
  const sk = ctx.sm.skills.get(ID);
  const state = sk.serializeState();
  ok(typeof state.cdLeft === 'number', 'cdLeft を保存する');
  sk.restoreState(state);
  ok(sk._rush === null, '復元で連撃の途中状態を持ち越さない');
  sk.fire();
  const x = ctx.scene.player.x, y = ctx.scene.player.y;
  sk.destroy();
  for (let i = 0; i < 120; i++) sk.update(16, { hasEnemies: true });
  ok(sk._rush === null, '破棄で連撃が消える');
  ok(ctx.scene.player.x === x && ctx.scene.player.y === y, '破棄後にプレイヤーが動かない');
}

T.finish();
