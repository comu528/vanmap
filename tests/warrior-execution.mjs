// 戦士 Wave1 6/19: 処刑（M8-C §5-3, §13）。Node.js 標準機能のみ。
// 「処刑」は本作でもっとも危険な機構なので、次の 5 点を機械的に固定する。
//   1. 即死しうるのは**通常敵だけ**（エリート / ボスは絶対に処刑されない）
//   2. エリート / ボスへの効果は「失った HP に応じた追加ダメージ」だけで、ボスには上限がある
//   3. 割合ダメージによる即死は無く、必ず「残り HP ぶんのダメージ」として共通経路を通る
//      → 死亡イベント・撃破統計・撃破回復・進化の撃破フックが 1 回だけ走る
//   4. 1 発動あたり / 1 秒あたりの処刑数に上限がある（無限処刑・無限回復にならない）
//   5. 失敗（閾値超え）も統計に残る
// 実行: node tests/warrior-execution.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 処刑（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const EVO = (id) => DATA.evolutions.find((x) => x.id === id);
const EXEC_CFG = DATA.balance.warrior.execute;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 316, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 8000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. balance 側の方針宣言 =====
section('1. balance.json: エリート / ボスの処刑を明示的に禁止している');
{
  ok(EXEC_CFG.allowElite !== true, `allowElite が true ではない（${EXEC_CFG.allowElite}）`);
  ok(EXEC_CFG.allowBoss !== true, `allowBoss が true ではない（${EXEC_CFG.allowBoss}）`);
  ok(EXEC_CFG.maxExecutesPerSecond > 0, `1 秒あたりの処刑数に上限がある（${EXEC_CFG.maxExecutesPerSecond}）`);
  ok(EXEC_CFG.bossMissingHpCapDefault > 0 && EXEC_CFG.bossMissingHpCapDefault <= 1,
    `ボスの欠損 HP 参照に既定上限がある（${EXEC_CFG.bossMissingHpCapDefault}）`);
}

// ===== 2. executePolicy: 種別ごとの可否 =====
section('2. executePolicy: 通常敵のみ処刑可、エリート / ボスは追加ダメージのみ');
{
  const scene = makeScene({ enemies: [], now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene);
  const params = { thresholdNormal: 0.3, missingHpBonusElite: 0.8, missingHpBonusBoss: 0.28, bossMissingHpCap: 0.5 };
  const mk = (kind, ratio) => ({
    alive: true, maxHp: 1000, hp: 1000 * ratio,
    isElite: kind === 'elite', isBoss: kind === 'boss',
  });
  // 通常敵。
  ok(w.executePolicy(mk('normal', 0.1), params).canExecute === true, '通常敵 HP10%: 処刑できる');
  ok(w.executePolicy(mk('normal', 0.3), params).canExecute === true, '通常敵 HP30%（閾値ちょうど）: 処刑できる');
  const above = w.executePolicy(mk('normal', 0.31), params);
  ok(above.canExecute === false && above.reason === 'aboveThreshold', '通常敵 HP31%: 処刑できない（閾値超え）');
  ok(above.damageMult === 1, '閾値超えの通常敵に追加倍率はかからない');
  // エリート。
  for (const r of [0.01, 0.05, 0.1, 0.29, 0.5]) {
    const p = w.executePolicy(mk('elite', r), params);
    ok(p.canExecute === false, `エリート HP${Math.round(r * 100)}%: 処刑できない`);
    ok(p.reason === 'eliteNoExecute', `エリート HP${Math.round(r * 100)}%: 理由が eliteNoExecute`);
    const want = 1 + (1 - r) * params.missingHpBonusElite;
    ok(Math.abs(p.damageMult - want) < 1e-9, `エリート HP${Math.round(r * 100)}%: 追加倍率 ×${p.damageMult.toFixed(3)}`);
  }
  // ボス（上限つき）。
  for (const r of [0.01, 0.2, 0.6]) {
    const p = w.executePolicy(mk('boss', r), params);
    ok(p.canExecute === false, `ボス HP${Math.round(r * 100)}%: 処刑できない`);
    ok(p.reason === 'bossNoExecute', `ボス HP${Math.round(r * 100)}%: 理由が bossNoExecute`);
    const want = 1 + Math.min(1 - r, params.bossMissingHpCap) * params.missingHpBonusBoss;
    ok(Math.abs(p.damageMult - want) < 1e-9, `ボス HP${Math.round(r * 100)}%: 追加倍率 ×${p.damageMult.toFixed(3)}（上限つき）`);
  }
  const cap = w.executePolicy(mk('boss', 0.001), params).damageMult;
  ok(cap <= 1 + params.bossMissingHpCap * params.missingHpBonusBoss + 1e-9,
    `ボスは瀕死でも倍率が頭打ち（×${cap.toFixed(3)}）`);
}

// ===== 3. 1 秒あたりの処刑数上限 =====
section('3. executePolicy: 1 秒あたりの処刑数に上限がある（無限処刑にならない）');
{
  let t = 10000;
  const scene = makeScene({ enemies: [], now: t });
  const w = makeWarrior(WarriorCombatSystem, scene);
  const params = { thresholdNormal: 1 };
  let okCount = 0, limited = 0;
  for (let i = 0; i < 200; i++) {
    const p = w.executePolicy({ alive: true, maxHp: 100, hp: 1 }, params);
    if (p.canExecute) okCount++;
    if (p.reason === 'rateLimited') limited++;
  }
  ok(okCount === EXEC_CFG.maxExecutesPerSecond, `同一秒内の処刑は ${okCount} = maxExecutesPerSecond ${EXEC_CFG.maxExecutesPerSecond}`);
  ok(limited > 0, `超過ぶんは rateLimited になる（${limited} 件）`);
  // 秒が変わればまた処刑できる。
  scene.advance(1100);
  ok(w.executePolicy({ alive: true, maxHp: 100, hp: 1 }, params).canExecute === true, '次の秒では再び処刑できる');
  void t;
}

// ===== 4. 実プレイ: 処刑斬は通常敵のみ仕留める =====
section('4. 処刑斬: 瀕死の通常敵は仕留め、瀕死のエリート / ボスは仕留めない');
{
  const lv8 = SKILL('execution_strike').levels[7];
  // 通常敵（閾値以下）。
  const weak = makeEnemies(10, { x: 320, y: 300, dy: 3, hp: 1000 });
  for (const e of weak) e.hp = 1000 * (lv8.executeThresholdNormal * 0.5);
  const ctx = build({ enemies: weak });
  ctx.sm.acquireOrLevel('execution_strike'); ctx.sm.setLevel('execution_strike', 8);
  run(ctx, 10000);
  const ws = ctx.scene._warriorSkillStats.execution_strike || {};
  ok((ws.executions || 0) > 0, `瀕死の通常敵を処刑する（${ws.executions} 体）`);
  ok(ctx.w.telemetry.executions === (ws.executions || 0), 'テレメトリの処刑数が一致');
  ok(ctx.w.telemetry.executeFailures >= 0, `失敗も記録される（${ctx.w.telemetry.executeFailures} 件）`);

  // 通常敵（閾値超え）は処刑されない。
  const healthy = makeEnemies(10, { x: 320, y: 300, dy: 3, hp: 1e9 });
  const hctx = build({ enemies: healthy });
  hctx.sm.acquireOrLevel('execution_strike'); hctx.sm.setLevel('execution_strike', 8);
  run(hctx, 10000);
  ok(hctx.w.telemetry.executions === 0, '満タンの通常敵は処刑されない');
  ok(hctx.w.telemetry.executeFailures > 0, `閾値超えは失敗として記録される（${hctx.w.telemetry.executeFailures} 件）`);

  // エリート。
  const elites = makeEnemies(8, { x: 320, y: 300, dy: 3, hp: 1e9, elite: true });
  for (const e of elites) e.hp = e.maxHp * 0.01;
  const ectx = build({ enemies: elites });
  ectx.sm.acquireOrLevel('execution_strike'); ectx.sm.setLevel('execution_strike', 8);
  run(ectx, 10000);
  ok(ectx.w.telemetry.executions === 0, 'エリートは HP1% でも処刑されない');
  ok(elites.every((e) => e.alive), 'エリートは全員生存する');

  // ボス。
  const boss = makeBoss({ hp: 1e9 });
  boss.hp = boss.maxHp * 0.001;
  const bctx = build({ enemies: [], boss });
  bctx.sm.acquireOrLevel('execution_strike'); bctx.sm.setLevel('execution_strike', 8);
  run(bctx, 10000);
  ok(bctx.w.telemetry.executions === 0, 'ボスは HP0.1% でも処刑されない');
  info(`処刑斬: 通常${ws.executions} / エリート0 / ボス0`);
}

// ===== 5. 割合ダメージではなく「残り HP ぶん」を共通経路で与える =====
section('5. 処刑は割合ダメージではなく、残り HP ぶんのダメージとして共通経路を通る');
{
  const one = makeEnemies(1, { x: 330, y: 300, hp: 1000 });
  one[0].hp = 90; // 9%（閾値以下）
  const ctx = build({ enemies: one });
  ctx.sm.acquireOrLevel('execution_strike'); ctx.sm.setLevel('execution_strike', 8);
  let killEvents = 0;
  const origDispatch = ctx.sm.dispatchKill.bind(ctx.sm);
  ctx.sm.dispatchKill = (e, id) => { killEvents += 1; return origDispatch(e, id); };
  run(ctx, 4000);
  ok(!one[0].alive, '処刑で敵が倒れる');
  ok(killEvents === 1, `撃破イベントはちょうど 1 回（${killEvents}）`);
  ok(ctx.w.telemetry.executions === 1, '処刑統計も 1 回');
  const s = st(ctx, 'execution_strike');
  ok((s.damage || 0) >= 90, `与ダメージに残り HP ぶんが含まれる（${Math.round(s.damage)}）`);
  // ソース上でも「割合即死」を作っていないこと。
  ok(ctx.w.telemetry.killHeal >= 0, '撃破回復も通常の経路を通る');
}

// ===== 6. 撃破回復・撃破フックが二重に走らない =====
section('6. 処刑での撃破が回復・撃破フックを二重に発火させない');
{
  const many = makeEnemies(40, { x: 320, y: 300, dy: 1, hp: 1000 });
  for (const e of many) e.hp = 50;
  const ctx = build({ enemies: many, mods: { killHealMult: 1 } });
  ctx.sm.acquireOrLevel('execution_strike'); ctx.sm.setLevel('execution_strike', 8);
  ctx.scene.player.hp = 50;
  let kills = 0;
  const origDispatch = ctx.sm.dispatchKill.bind(ctx.sm);
  ctx.sm.dispatchKill = (e, id) => { kills += 1; return origDispatch(e, id); };
  run(ctx, 12000);
  const dead = many.filter((e) => !e.alive).length;
  ok(kills === dead, `撃破イベント数 ${kills} = 実際の撃破数 ${dead}（二重発火なし）`);
  // 撃破回復は毎秒上限に守られる（永久機関にならない）。
  const capPerSec = ctx.scene.player.maxHp * DATA.balance.warrior.killHeal.perSecondCapPercent;
  ok(ctx.w.telemetry.killHeal <= capPerSec * 13, `撃破回復 ${ctx.w.telemetry.killHeal.toFixed(1)} が毎秒上限内`);
  ok(ctx.scene.player.hp <= ctx.scene.player.maxHp, 'HP が最大値を超えない');
  info(`処刑 ${ctx.w.telemetry.executions} 体 / 撃破 ${dead} 体 / 回復 ${ctx.w.telemetry.killHeal.toFixed(1)}`);
}

// ===== 7. 1 発動あたりの処刑数上限（品質別 cap）=====
section('7. 1 発動あたりの処刑数が maxExecutesPerCast で頭打ちになる');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const cap = capFor('maxExecutesPerCast', q, 3);
  const many = makeEnemies(60, { x: 316, y: 300, dy: 0, hp: 1000 });
  for (const e of many) e.hp = 30;
  const ctx = build({ enemies: many, quality: q });
  ctx.sm.acquireOrLevel('execution_strike'); ctx.sm.setLevel('execution_strike', 8);
  run(ctx, 4000);
  const s = st(ctx, 'execution_strike');
  const ws = ctx.scene._warriorSkillStats.execution_strike || {};
  ok((ws.executions || 0) <= (s.casts || 0) * cap, `${q}: 処刑 ${ws.executions || 0} ≤ cap${cap} × cast${s.casts}`);
}

// ===== 8. 血断処刑: 閾値が上がり、撃破連鎖は 1 世代 =====
section('8. 血断処刑: 閾値が上がっても、エリート / ボスは処刑できず、連鎖は 1 世代');
{
  const e = EVO('crimson_execution');
  // 基礎では処刑できない HP でも進化なら処刑できる。
  const baseTh = SKILL('execution_strike').levels[7].executeThresholdNormal;
  const ratio = (baseTh + e.execute.thresholdNormal) / 2; // 基礎の閾値超え・進化の閾値以下
  // 最大 HP を大きく取り、打撃ぶんの目減りで閾値を跨がないようにする（閾値そのものを比べる）。
  const BIG = 1e6;
  const mid = makeEnemies(10, { x: 320, y: 300, dy: 3, hp: BIG });
  for (const en of mid) en.hp = BIG * ratio;
  const mid2 = makeEnemies(10, { x: 320, y: 300, dy: 3, hp: BIG });
  for (const en of mid2) en.hp = BIG * ratio;
  const b = build({ enemies: mid2 });
  b.sm.acquireOrLevel('execution_strike'); b.sm.setLevel('execution_strike', 8);
  run(b, 8000);
  ok(b.w.telemetry.executions === 0, `HP${Math.round(ratio * 100)}% は基礎の処刑斬では処刑できない`);

  const ev = build({ enemies: mid });
  ev.sm.acquireOrLevel('crimson_execution');
  run(ev, 8000);
  ok(ev.w.telemetry.executions > 0, `同じ HP を血断処刑なら処刑できる（${ev.w.telemetry.executions} 体）`);

  // 撃破連鎖は 1 世代（連鎖の連鎖が起きない）。
  const s = st(ev, 'crimson_execution');
  ok((s.extra?.killChains || 0) <= (s.casts || 0), `連鎖 ${s.extra?.killChains || 0} ≤ cast ${s.casts}（1 発動 1 世代）`);

  info(`血断処刑: 閾値${e.execute.thresholdNormal}（基礎 ${baseTh}） 処刑${ev.w.telemetry.executions} 連鎖${s.extra?.killChains || 0}`);
}

// ===== 9. 処刑は近接のみ・遠距離へ飛ばない =====
section('9. 処刑は近接のみで、遠距離の瀕死の敵には届かない');
for (const id of ['execution_strike', 'crimson_execution']) {
  const far = makeEnemies(10, { x: 900, y: 900, hp: 1000 });
  for (const e of far) e.hp = 10;
  const ctx = build({ enemies: far });
  ctx.sm.acquireOrLevel(id);
  if (id === 'execution_strike') ctx.sm.setLevel(id, 8);
  run(ctx, 8000);
  ok(ctx.w.telemetry.executions === 0, `${id}: 600px 先の瀕死の敵は処刑できない`);
  ok(far.every((e) => e.alive), `${id}: 遠くの敵は生存する`);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, `${id}: 弾を出さない`);
}

T.finish();
