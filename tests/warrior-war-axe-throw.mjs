// 戦士 Wave2 13/21: 戦斧投擲（M8-D §war_axe_throw）。Node.js 標準機能のみ。
//   - 短距離の物理投擲。斧は必ず折り返して手元へ戻る（画面端まで飛ばない）
//   - 同一敵へは行き / 帰りで最大 2 回まで
//   - 近接ではないので近接ダメージ倍率が乗らない（physical / thrown / slash を明示）
//   - 飛行中の斧は保存しない（reload で無料の往復を作らない）
// 実行: node tests/warrior-war-axe-throw.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, capFor, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 戦斧投擲（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'war_axe_throw';
const SKILL = DATA.skills.find((x) => x.id === ID);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(8, { x: 400, y: 300, dy: 4, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 16000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 投げて戻ってくる =====
section('1. 斧を投げ、必ず折り返して戻ってくる');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const s = st(ctx, ID);
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok((s.extra?.returns || 0) > 0, `折り返しが発生する（${s.extra?.returns}）`);
  ok((s.extra?.returns || 0) <= (s.casts || 0), `折り返しは 1 発動 1 回（${s.extra?.returns} ≤ ${s.casts}）`);
  ok(ctx.w.telemetry.axeOutboundHits > 0, `行きの命中が記録される（${ctx.w.telemetry.axeOutboundHits}）`);
  ok(ctx.w.telemetry.axeReturnHits > 0, `帰りの命中が記録される（${ctx.w.telemetry.axeReturnHits}）`);
  ok(ctx.sm.skills.get(ID)._axe === null || ctx.sm.skills.get(ID)._axe.leftMs > 0, '斧はいずれ必ず消える');
  info(`戦斧投擲: cast${s.casts} 行き${ctx.w.telemetry.axeOutboundHits} 帰り${ctx.w.telemetry.axeReturnHits}`);
}

// ===== 2. 画面端まで飛ばない =====
section('2. 射程で必ず折り返す（画面端まで飛ばない）');
{
  const ctx = build({ enemies: makeEnemies(6, { x: 1200, y: 300, dy: 4, hp: 1e9 }) });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  let maxDist = 0;
  for (let i = 0; i < 1500; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    if (sk._axe) maxDist = Math.max(maxDist, Math.hypot(sk._axe.x - ctx.scene.player.x, sk._axe.y - ctx.scene.player.y));
  }
  const range = SKILL.levels[7].range;
  ok(maxDist > 0, '斧が飛ぶ');
  ok(maxDist <= range * 1.35, `最大到達 ${maxDist.toFixed(0)}px ≤ 射程 ${range}px の 1.35 倍`);
  ok((st(ctx, ID).hits || 0) === 0, '射程外の敵には当たらない');
}

// ===== 3. 同一敵へは最大 2 回 =====
section('3. 同一敵へは行き / 帰りで最大 2 回まで');
{
  const cap = capFor('maxAxeHitsPerTarget', 'high', 2);
  ok(cap === 2, `data の上限は 2（${cap}）`);
  // 敵 1 体を射線上に置き、1 発動で何回当たるかを数える。
  const e = makeEnemies(1, { x: 400, y: 300, hp: 1e9 })[0];
  const ctx = build({ enemies: [e] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 200 && sk._axe; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const hits = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID && c[2] === e).length;
  ok(hits > 0, `当たる（${hits}）`);
  ok(hits <= cap, `1 発動で同一敵へ最大 ${cap} 回（実際 ${hits}）`);
}

// ===== 4. 近接倍率が乗らない =====
section('4. 投擲なので近接ダメージ倍率が乗らない');
{
  ok(SKILL.config.meleeBonusApplies === false, 'data で近接倍率は乗らないと宣言している');
  const src = skillSourceDeep(ID, registryMap()) || '';
  ok(/thrownStrike/.test(src), '共通経路 thrownStrike（isThrown）を使う');
  ok((SKILL.damageTags || []).includes('thrown'), `damageTags に thrown（${(SKILL.damageTags || []).join(',')}）`);
  ok(!(SKILL.damageTags || []).includes('melee'), 'damageTags に melee を入れていない');
  for (const t of ['physical', 'thrown', 'slash']) ok((SKILL.tags || []).includes(t), `tags に ${t}`);
  // コンボ倍率が乗っているときでも、投擲の 1 撃は伸びない。
  const mk = (combo) => {
    const e = makeEnemies(1, { x: 400, y: 300, hp: 1e9 })[0];
    const ctx = build({ enemies: [e] });
    ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
    ctx.w.combo = combo;
    const sk = ctx.sm.skills.get(ID);
    sk.fire();
    for (let i = 0; i < 200 && sk._axe; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
    const calls = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID);
    return calls.length ? calls[0][3] : 0;
  };
  const lo = mk(0), hi = mk(200);
  ok(Math.abs(hi - lo) < 1e-6, `コンボ 200 でも 1 撃が変わらない（${lo.toFixed(1)} → ${hi.toFixed(1)}）`);
}

// ===== 5. 対象数の上限 =====
section('5. 1 打撃あたりの対象数が data の上限内');
{
  const ctx = build({ enemies: makeEnemies(30, { x: 400, y: 300, dy: 1, hp: 1e9 }) });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  let worst = 0;
  for (let i = 0; i < 200 && sk._axe; i++) {
    const before = ctx.scene.calls.length;
    sk.update(16, { hasEnemies: true }); ctx.scene.advance(16);
    worst = Math.max(worst, ctx.scene.calls.length - before);
  }
  ok(worst <= SKILL.levels[7].maxTargets, `1 フレームの命中 ${worst} ≤ maxTargets ${SKILL.levels[7].maxTargets}`);
}

// ===== 6. 帰りは威力が下がる =====
section('6. 帰りの威力は returnMultiplier ぶんだけ下がる');
{
  const rm = SKILL.levels[7].returnMultiplier;
  ok(rm > 0 && rm < 1, `returnMultiplier が 0 < ${rm} < 1`);
  const e = makeEnemies(1, { x: 400, y: 300, hp: 1e9 })[0];
  const ctx = build({ enemies: [e] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 200 && sk._axe; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const calls = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID);
  if (calls.length >= 2) ok(calls[1][3] < calls[0][3], `帰りのほうが弱い（${calls[0][3].toFixed(1)} → ${calls[1][3].toFixed(1)}）`);
  else ok(calls.length >= 1, '少なくとも 1 回は当たる');
}

// ===== 7. 成長 =====
section('7. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'range', 'speed', 'width', 'returnMultiplier', 'maxTargets', 'poiseDamage']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 24000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 24000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 8. 保存 / 破棄 =====
section('8. 飛行中の斧は保存されない・破棄で消える');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 5; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  ok(sk.flying, '斧が飛んでいる');
  const state = sk.serializeState();
  ok(!('x' in state) && !('traveled' in state), '斧の座標・進行距離は保存しない');
  sk.restoreState(state);
  ok(sk._axe === null, '復元で斧が復活しない（無料の往復を作らない）');
  sk.fire();
  const before = ctx.scene.calls.length;
  sk.destroy();
  for (let i = 0; i < 200; i++) sk.update(16, { hasEnemies: true });
  ok(sk._axe === null, '破棄で斧が消える');
  ok(ctx.scene.calls.length === before, `破棄後に命中が増えない（${before}）`);
}

T.finish();
