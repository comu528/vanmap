// 戦士 Wave2 6/21: 昇竜斬（M8-D §rising_slash）。Node.js 標準機能のみ。
//   - 前方の狭い縦斬り。通常敵だけを短く打ち上げる
//   - エリート / ボスは浮かず、その分が体勢削りへ変換される
//   - 同一敵は 1 発動 1 回だけ打ち上げ、打ち上げ免疫があるので無限に浮かない
//   - 打ち上げの残留は敵のプール返却 / reset で必ず落ちる
//   - Lv1 → Lv8 で damage / range / width / launchDuration / poise / knockback / targets が伸びる
// 実行: node tests/warrior-rising-slash.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor, readSrc } from './warrior-common.mjs';

const T = runner('戦士 昇竜斬（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'rising_slash';
const SKILL = DATA.skills.find((x) => x.id === ID);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 330, y: 300, dy: 3, hp: opts.hp || 1e9 });
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

// ===== 1. 通常敵は打ち上がる =====
section('1. 通常敵を打ち上げる（浮いている間は動けない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 8000);
  ok(ctx.w.telemetry.launches > 0, `打ち上げが発生する（${ctx.w.telemetry.launches}）`);
  ok(ctx.enemies.some((e) => e._airborneUntil > 0), '敵に打ち上げ状態が付く');
  ok((st(ctx, ID).hits || 0) > 0, `命中する（${st(ctx, ID).hits}）`);
  info(`昇竜斬: cast${st(ctx, ID).casts} hit${st(ctx, ID).hits} 打ち上げ${ctx.w.telemetry.launches}`);
}

// ===== 2. エリート / ボスは浮かず体勢へ変換 =====
section('2. エリート / ボスは浮かず、体勢削りへ変換される');
{
  const cfg = DATA.balance.warrior.launch;
  ok(cfg.allowElite === false && cfg.allowBoss === false, 'balance でエリート / ボスの打ち上げは禁止');
  const ctx = build({ enemies: makeEnemies(6, { x: 330, y: 300, dy: 3, hp: 1e9, elite: true }) });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 8000);
  ok(ctx.w.telemetry.launches === 0, `エリートは 1 度も浮かない（${ctx.w.telemetry.launches}）`);
  ok(ctx.w.telemetry.launchBlocked > 0, `打ち上げ拒否が記録される（${ctx.w.telemetry.launchBlocked}）`);
  ok(ctx.w.telemetry.launchPoiseConverted > 0, `体勢削りへ変換される（${ctx.w.telemetry.launchPoiseConverted.toFixed(1)}）`);
  ok(ctx.enemies.every((e) => !(e._airborneUntil > 0)), 'エリートに打ち上げ状態が付かない');

  const bctx = build({ enemies: [], boss: makeBoss({ x: 340, y: 300, hp: 1e9 }) });
  bctx.sm.acquireOrLevel(ID); bctx.sm.setLevel(ID, 8);
  run(bctx, 8000);
  ok(bctx.w.telemetry.launches === 0, 'ボスも 1 度も浮かない');
  ok(!(bctx.scene.boss._airborneUntil > 0), 'ボスに打ち上げ状態が付かない');
}

// ===== 3. 同一敵は 1 発動 1 回・免疫で無限に浮かない =====
section('3. 同一敵は 1 発動 1 回だけ・免疫中は再度浮かない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const casts = st(ctx, ID).casts || 0;
  ok(ctx.w.telemetry.launches <= casts * ctx.enemies.length, `打ち上げ ≤ cast × 敵数（${ctx.w.telemetry.launches} ≤ ${casts * ctx.enemies.length}）`);
  // 免疫: 打ち上げ直後に再度浮かせようとしても拒否される。
  const e = ctx.enemies[0];
  e._launchImmuneUntil = ctx.scene.time.now + 500;
  const r = ctx.scene.launchTarget(e, { durationMs: 400, height: 20, skillId: ID });
  ok(r.launched === false && r.reason === 'immune', '免疫中は打ち上げ拒否（reason=immune）');
  // data の免疫時間は balance の上限を超えない。
  ok(SKILL.config.launchImmuneMs <= DATA.balance.warrior.launch.immuneMs,
    `data の免疫 ${SKILL.config.launchImmuneMs}ms ≤ balance ${DATA.balance.warrior.launch.immuneMs}ms`);
}

// ===== 4. 滞空時間の上限 =====
section('4. 滞空時間が balance の上限を超えない');
{
  const ctx = build();
  const maxMs = DATA.balance.warrior.launch.maxAirborneMs;
  ok(ctx.w.launchDurationMs(99999) === maxMs, `過大な要求は ${maxMs}ms へクランプ`);
  ok(ctx.w.launchDurationMs(200) === 200, '短い要求はそのまま');
  ok(SKILL.levels[7].launchDuration <= maxMs, `Lv8 の launchDuration ${SKILL.levels[7].launchDuration} ≤ ${maxMs}`);
}

// ===== 5. 残留が必ず落ちる =====
section('5. 打ち上げの残留は敵の除去 / reset で必ず落ちる');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 6000);
  const e = ctx.enemies.find((x) => x._airborneUntil > 0) || ctx.enemies[0];
  e._airborneUntil = 99999; e._launchImmuneUntil = 99999; e._launchHeight = 30;
  ctx.w.onEnemyRemoved(e);
  ok(e._airborneUntil === 0, 'onEnemyRemoved で _airborneUntil が 0 に戻る');
  ok(e._launchImmuneUntil === 0, 'onEnemyRemoved で _launchImmuneUntil が 0 に戻る');
  ok(e._launchHeight === 0, 'onEnemyRemoved で _launchHeight が 0 に戻る');
  // production の Enemy.reset() も同じフィールドを戻す。
  const src = readSrc('src/entities/Enemy.js');
  for (const f of ['_airborneUntil', '_launchImmuneUntil', '_launchHeight', '_grabbed']) {
    ok(src.includes(f), `Enemy.js が ${f} を持つ`);
  }
  const reset = src.slice(src.indexOf('reset('));
  for (const f of ['_airborneUntil', '_launchImmuneUntil', '_launchHeight', '_grabbed']) {
    ok(reset.includes(f), `Enemy.reset() が ${f} を戻す`);
  }
}

// ===== 6. 対象数の上限 =====
section('6. 1 発動あたりの対象数が data の上限内');
{
  const ctx = build({ enemies: makeEnemies(30, { x: 330, y: 300, dy: 1, hp: 1e9 }) });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 6000);
  const cap = Math.min(SKILL.levels[7].maxTargets, capFor('maxLaunchTargets', 'high', 6));
  const casts = st(ctx, ID).casts || 1;
  ok((st(ctx, ID).hits || 0) <= casts * cap, `hits ${st(ctx, ID).hits} ≤ cast${casts} × 上限${cap}`);
}

// ===== 7. 成長 =====
section('7. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'range', 'width', 'launchDuration', 'poiseDamage', 'knockback', 'maxTargets']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 16000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 16000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 8. 弾を飛ばさない・cast 水増しなし =====
section('8. 弾を飛ばさず、cast も水増しされない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 12000);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, '弾を 1 つも出さない');
  const s = st(ctx, ID);
  ok((s.extra?.slashes || 0) === (s.casts || 0), `斬撃回数 ${s.extra?.slashes} = cast ${s.casts}`);
}

T.finish();
