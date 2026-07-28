// 戦士 Wave1 9/19: 反撃の調停（M8-C §5-6, §14）。Node.js 標準機能のみ。
// M8-C 最大の設計上の約束は「1 被弾イベントで反撃するのは最大 1 系統」。
// 迎撃の構え / 金剛迎撃 / 不落の城壁を同時に持てても、同じ被弾で複数が反撃してはならない。
//   - 優先度は adamant_counter > unyielding_fortress > counter_stance
//   - 不屈（unyielding）は生存能力であって反撃系統ではない（反撃枠を占有しない）
//   - counter → counter の再帰が起きない
//   - 完全無効化はしない（軽減は必ず上限でクランプされる）
//   - 構えは refresh で、重ねがけしない
// 実行: node tests/warrior-counter-arbitration.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, readSrc } from './warrior-common.mjs';

const T = runner('戦士 反撃の調停（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const CFG = DATA.balance.warrior.counter;
const COUNTER_SKILLS = ['counter_stance', 'adamant_counter', 'unyielding_fortress'];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 316, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
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

// ===== 1. balance に優先度が一元化されている =====
section('1. balance.json に反撃の優先度と全体クールダウンが一元化されている');
{
  ok(!!CFG && !!CFG.priority, 'warrior.counter.priority がある');
  const p = CFG.priority;
  ok(p.adamant_counter > p.unyielding_fortress, `adamant_counter(${p.adamant_counter}) > unyielding_fortress(${p.unyielding_fortress})`);
  ok(p.unyielding_fortress > p.counter_stance, `unyielding_fortress(${p.unyielding_fortress}) > counter_stance(${p.counter_stance})`);
  ok(CFG.globalCooldownMs >= 0, `全体クールダウンがある（${CFG.globalCooldownMs}ms）`);
  ok(Object.keys(p).length === COUNTER_SKILLS.length, `反撃系統は ${COUNTER_SKILLS.length} 種（${Object.keys(p).join(',')}）`);
}

// ===== 2. 調停は 1 被弾 = 最大 1 系統 =====
section('2. consumeCounterEvent: 1 被弾で選ばれる系統は必ず 1 つだけ');
{
  const ctx = build();
  ctx.w.beginCounterWindow('counter_stance', { durationMs: 5000, maxCounters: 5, priority: 1 });
  ctx.w.beginCounterWindow('unyielding_fortress', { durationMs: 5000, maxCounters: 5, priority: 2 });
  ctx.w.beginCounterWindow('adamant_counter', { durationMs: 5000, maxCounters: 5, priority: 3 });
  const pick = ctx.w.consumeCounterEvent();
  ok(!!pick, '1 系統が選ばれる');
  ok(pick.source === 'adamant_counter', `最優先の系統が選ばれる（${pick.source}）`);
  // 使用回数が進むのは選ばれた 1 系統だけ。
  ok(ctx.w.counterWindowOf('adamant_counter').used === 1, 'adamant_counter の使用回数だけ進む');
  ok(ctx.w.counterWindowOf('counter_stance').used === 0, 'counter_stance は使われない');
  ok(ctx.w.counterWindowOf('unyielding_fortress').used === 0, 'unyielding_fortress も使われない');
}

// ===== 3. 優先度どおりの順序 =====
section('3. 優先度どおりに選ばれる（最上位が尽きたら次点へ）');
{
  const ctx = build();
  ctx.w.beginCounterWindow('counter_stance', { durationMs: 60000, maxCounters: 1, priority: CFG.priority.counter_stance, counterCooldownMs: 0 });
  ctx.w.beginCounterWindow('unyielding_fortress', { durationMs: 60000, maxCounters: 1, priority: CFG.priority.unyielding_fortress, counterCooldownMs: 0 });
  ctx.w.beginCounterWindow('adamant_counter', { durationMs: 60000, maxCounters: 1, priority: CFG.priority.adamant_counter, counterCooldownMs: 0 });
  const order = [];
  for (let i = 0; i < 5; i++) {
    ctx.scene.advance(CFG.globalCooldownMs + 50);
    ctx.w.update(CFG.globalCooldownMs + 50);
    const p = ctx.w.consumeCounterEvent();
    order.push(p ? p.source : null);
  }
  ok(order[0] === 'adamant_counter', `1 発目は adamant_counter（${order[0]}）`);
  ok(order[1] === 'unyielding_fortress', `2 発目は unyielding_fortress（${order[1]}）`);
  ok(order[2] === 'counter_stance', `3 発目は counter_stance（${order[2]}）`);
  ok(order[3] === null && order[4] === null, `すべて使い切ったら反撃しない（${order.slice(3).join(',')}）`);
  info(`調停順: ${order.join(' → ')}`);
}

// ===== 4. 全体クールダウン =====
section('4. 全体クールダウン中は、どの系統も反撃しない（連続被弾で無限反撃しない）');
{
  const ctx = build();
  ctx.w.beginCounterWindow('adamant_counter', { durationMs: 60000, maxCounters: 99, priority: 3, counterCooldownMs: 0 });
  const first = ctx.w.consumeCounterEvent();
  ok(!!first, '1 発目は反撃する');
  let blocked = 0;
  for (let i = 0; i < 20; i++) if (!ctx.w.consumeCounterEvent()) blocked += 1;
  ok(blocked === 20, `直後の 20 連続被弾では反撃しない（${blocked}/20 が抑止）`);
  ctx.scene.advance(CFG.globalCooldownMs + 20);
  ctx.w.update(CFG.globalCooldownMs + 20);
  ok(!!ctx.w.consumeCounterEvent(), '全体クールダウンが明けたら再び反撃できる');
}

// ===== 5. 実スキルでの調停（同時所持）=====
section('5. 3 系統を同時に持っても、1 被弾で反撃するのは 1 つだけ');
{
  const ctx = build();
  for (const id of COUNTER_SKILLS) ctx.sm.acquireOrLevel(id);
  ctx.sm.setLevel('counter_stance', 8);
  // すべての構えを開かせる。
  for (const id of COUNTER_SKILLS) {
    const sk = ctx.sm.skills.get(id);
    if (sk && typeof sk.fire === 'function') sk.fire();
  }
  const open = COUNTER_SKILLS.filter((id) => !!ctx.w.counterWindowOf(id));
  ok(open.length >= 2, `複数の構えが同時に開いている（${open.join(',')}）`);

  // 反撃した回数を skillId ごとに数える。
  const before = ctx.scene.calls.length;
  const done = ctx.scene.onWarriorHit(80, 60);
  ok(!!done, `1 被弾で 1 系統が反撃する（${done}）`);
  const after = ctx.scene.calls.slice(before).filter((c) => c[0] === 'melee');
  const sources = new Set(after.map((c) => c[1]));
  ok(sources.size <= 1, `反撃したのは 1 系統だけ（${[...sources].join(',') || 'なし'}）`);
  ok(ctx.w.telemetry.counters === 1, `テレメトリの反撃数が 1（${ctx.w.telemetry.counters}）`);
  ok(Object.keys(ctx.w.telemetry.counterBySource).length === 1, '系統別テレメトリも 1 系統のみ');
  info(`同時所持の調停: ${done} が反撃（開いていた構え ${open.join(',')}）`);
}

// ===== 6. counter → counter の再帰が起きない =====
section('6. 反撃の中から新しい反撃が生まれない（再帰しない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('adamant_counter');
  ctx.sm.skills.get('adamant_counter').fire();
  // 反撃の meleeStrike の中で再び被弾フックを呼んでも、新しい反撃は起きない。
  let reentries = 0;
  const origMelee = ctx.scene.combat.meleeStrike;
  ctx.scene.combat.meleeStrike = (o) => {
    const r = origMelee(o);
    if (o.skillId === 'adamant_counter') { if (ctx.scene.onWarriorHit(50, 50)) reentries += 1; }
    return r;
  };
  const done = ctx.scene.onWarriorHit(80, 60);
  ok(done === 'adamant_counter', '被弾で反撃する');
  ok(reentries === 0, `反撃中の被弾から新しい反撃が生まれない（${reentries} 件）`);
  ctx.scene.combat.meleeStrike = origMelee;
  // 実装側にも再入ガードがある。
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/_inWarriorCounter/.test(src), 'BattleScene に反撃の再入ガードがある');
}

// ===== 7. 完全無効化しない =====
section('7. 反撃系の軽減を重ねても完全無効化にならない');
{
  const ctx = build();
  ctx.w.beginCounterWindow('counter_stance', { durationMs: 60000, maxCounters: 1, priority: 1, mitigation: 0.9 });
  ctx.w.beginCounterWindow('adamant_counter', { durationMs: 60000, maxCounters: 1, priority: 3, mitigation: 0.9 });
  ctx.w.beginCounterWindow('unyielding_fortress', { durationMs: 60000, maxCounters: 1, priority: 2, mitigation: 0.9 });
  const m = ctx.w.counterMitigation();
  ok(m <= 0.9 + 1e-9, `軽減は合算されず最大値のみ（${m}）`);
  const applied = ctx.w.applyIncomingDamage(1000, { extra: m, engaged: true, charging: true });
  ok(applied > 0, `1000 ダメージのうち ${applied.toFixed(1)} は必ず通る（無敵にならない）`);
  const total = 1 - applied / 1000;
  ok(total <= DATA.balance.warrior.mitigation.maxTotalReduction + 1e-9,
    `合計軽減 ${(total * 100).toFixed(1)}% ≤ 上限 ${(DATA.balance.warrior.mitigation.maxTotalReduction * 100).toFixed(0)}%`);
  info(`3 系統同時の軽減: ${(m * 100).toFixed(0)}% → 実効 ${(total * 100).toFixed(1)}%`);
}

// ===== 8. 構えは refresh（重ねがけしない）=====
section('8. 同じ構えを重ねて取っても、回数と持続は上書きされるだけ');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('counter_stance'); ctx.sm.setLevel('counter_stance', 8);
  const sk = ctx.sm.skills.get('counter_stance');
  const lv8 = DATA.skills.find((s) => s.id === 'counter_stance').levels[7];
  for (let i = 0; i < 10; i++) sk.fire();
  const w = ctx.w.counterWindowOf('counter_stance');
  ok(w.max === lv8.maxCounters, `受け流し回数が積み上がらない（${w.max} = ${lv8.maxCounters}）`);
  ok(w.leftMs <= lv8.windowDuration + 1e-6, `持続が積み上がらない（${Math.round(w.leftMs)}ms ≤ ${lv8.windowDuration}ms）`);
  ok(ctx.w.counterWindows.size === 1, `構えの登録は 1 件のまま（${ctx.w.counterWindows.size}）`);
  // 1 構えあたりの反撃回数上限（構えが閉じる前に何度被弾しても maxCounters を超えない）。
  // 再発動で 2 つ目の構えが開くと計測がぶれるので、この計測中は CD を戻さない。
  let counters = 0;
  const step = CFG.globalCooldownMs + Math.max(lv8.windowDuration / 8, 260);
  for (let elapsed = 0; elapsed < lv8.windowDuration - step; elapsed += step) {
    ctx.scene.advance(step);
    ctx.w.update(step);
    sk._cd = 1e9;
    sk.update(step, { hasEnemies: true });
    if (ctx.scene.onWarriorHit(50, 50)) counters += 1;
  }
  ok(counters > 0, `構えの中では反撃する（${counters} 回）`);
  ok(counters <= lv8.maxCounters, `1 構えの反撃は ${counters} ≤ maxCounters ${lv8.maxCounters}`);
}

// ===== 9. 不屈は「生存能力」であって反撃系統ではない =====
section('9. 不屈（基礎能力）は反撃枠を占有しない');
{
  const ctx = build();
  // 基礎の不屈（passive 相当の生存能力）を発動させても構えは開かない。
  ctx.w.setHp(5, 100);
  ctx.w._runStartMs = -1e9;
  const fired = ctx.w.checkUnyielding();
  ok(fired === true, '不屈が発動する');
  ok(ctx.w.unyieldingActive === true, '不屈が稼働中');
  ok(ctx.w.counterWindows.size === 0, '不屈の発動では反撃の構えが開かない（反撃枠を占有しない）');
  ok(ctx.w.consumeCounterEvent() === null, '不屈だけでは反撃しない');
  // 進化「不落の城壁」だけが反撃系統として登録する。
  const ctx2 = build();
  ctx2.sm.acquireOrLevel('unyielding_fortress');
  ctx2.sm.skills.get('unyielding_fortress').fire();
  ok(!!ctx2.w.counterWindowOf('unyielding_fortress'), '不落の城壁は反撃系統として登録される');
  ok(ctx2.sm.skills.get('unyielding_fortress').counterSource === 'unyielding_fortress', 'counterSource を公開している');
}

// ===== 10. 構えが閉じたら反撃しない =====
section('10. 構えが時間切れになったら反撃せず、登録も残らない');
for (const id of ['counter_stance', 'adamant_counter']) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (id === 'counter_stance') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  sk.fire();
  const dur = sk.stanceParams().durationMs;
  run(ctx, dur + 500);
  ok(!ctx.w.counterWindowOf(id), `${id}: 時間切れで登録が消える`);
  ok(ctx.scene.onWarriorHit(50, 50) === null, `${id}: 構えの外では反撃しない`);
  ok(sk.activeMitigation() === 0, `${id}: 構えの外では軽減もない`);
}

// ===== 11. 破棄で構えが確実に閉じる =====
section('11. スキル破棄で構えの登録が必ず解除される');
for (const id of ['counter_stance', 'adamant_counter', 'unyielding_fortress']) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (id === 'counter_stance') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  sk.fire();
  ok(!!ctx.w.counterWindowOf(id), `${id}: 構えが開いている`);
  sk.destroy();
  ok(!ctx.w.counterWindowOf(id), `${id}: destroy で構えが閉じる`);
  ok(ctx.scene.onWarriorHit(50, 50) === null, `${id}: 破棄後は反撃しない`);
}

T.finish();
