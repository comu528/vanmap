// 戦士 Wave1 10/19: 戦吼 / 軍神咆哮（M8-C §5-7, §15）。Node.js 標準機能のみ。
// 「短時間の自己バフ」を新しい formal status を作らずに実装したので、次を機械的に固定する。
//   - status-effects.json は 5 種のまま（新しい状態異常を追加していない）
//   - バフは重ねがけしない（refresh / 上書き）。連打で無限に強くならない
//   - 強度・持続は balance.json の上限で必ずクランプされる
//   - 効果対象は自分だけ（戦士以外のジョブには存在しない）
//   - 保存 / 復元でバフが消えるか、正しく短くなって復元される（無限バフを作らない）
//   - コンボ値そのものを無料で配らない（回復するのは猶予だけ）
// 実行: node tests/warrior-war-cry.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, allSrc } from './warrior-common.mjs';

const T = runner('戦士 戦吼 / 軍神咆哮（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const EVO = (id) => DATA.evolutions.find((x) => x.id === id);
const CFG = DATA.balance.warrior.warCry;

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

// ===== 1. 新しい formal status を作っていない =====
section('1. 新しい状態異常を追加していない（共通 status は 5 種のまま）');
{
  const ids = (DATA.statusEffects.statusEffects || []).map((s) => s.id);
  const known = ['burning', 'chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability'];
  ok(ids.length === known.length, `共通状態異常は ${ids.length} 種（${ids.join(',')}）`);
  ok(known.every((k) => ids.includes(k)), '既存 5 種がそのまま');
  ok(!ids.some((i) => /cry|roar|buff|rage/i.test(i)), '戦吼用の formal status を追加していない');
  // 実装も StatusEffectManager を触っていない。
  const src = allSrc();
  ok(!/applyStatus\(\s*['"]war/.test(src), 'StatusEffectManager へ戦吼バフを登録していない');
}

// ===== 2. balance に上限が宣言され、実装がそれを使う =====
section('2. balance.json の warCry 上限が実装で必ず適用される');
{
  ok(CFG.maxDurationMs > 0, `maxDurationMs ${CFG.maxDurationMs}`);
  ok(CFG.maxMeleeDamageBonus > 0 && CFG.maxMeleeDamageBonus <= 1, `maxMeleeDamageBonus ${CFG.maxMeleeDamageBonus}`);
  ok(CFG.maxFuryGainBonus > 0, `maxFuryGainBonus ${CFG.maxFuryGainBonus}`);
  ok(CFG.maxComboGraceBonus > 0, `maxComboGraceBonus ${CFG.maxComboGraceBonus}`);
  ok(CFG.stack === 'refresh', `既定の重ねがけ規則は refresh（${CFG.stack}）`);
  // 上限を超える値を渡しても必ずクランプされる。
  const ctx = build();
  const got = ctx.w.applyWarCryBuff({
    durationMs: 1e9, meleeDamageBonus: 99, furyGainBonus: 99, comboGraceBonus: 99,
  });
  ok(got.leftMs === CFG.maxDurationMs, `持続が ${CFG.maxDurationMs}ms でクランプされる`);
  ok(got.meleeDamageBonus === CFG.maxMeleeDamageBonus, `近接ダメージが ${CFG.maxMeleeDamageBonus} でクランプされる`);
  ok(got.furyGainBonus === CFG.maxFuryGainBonus, `闘気獲得が ${CFG.maxFuryGainBonus} でクランプされる`);
  ok(got.comboGraceBonus === CFG.maxComboGraceBonus, `コンボ猶予が ${CFG.maxComboGraceBonus} でクランプされる`);
  // 負値・NaN も安全に扱う。
  const bad = ctx.w.applyWarCryBuff({ durationMs: 3000, meleeDamageBonus: -5, furyGainBonus: NaN, comboGraceBonus: undefined });
  ok(bad.meleeDamageBonus === 0 && bad.furyGainBonus === 0 && bad.comboGraceBonus === 0, '負値 / NaN は 0 に落ちる');
  ok(ctx.w.applyWarCryBuff({ durationMs: 0 }) === null, '持続 0 ではバフが付かない');
}

// ===== 3. 重ねがけしない =====
section('3. 連打してもバフが積み上がらない（refresh / 上書き）');
for (const id of ['war_cry', 'war_god_roar']) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (id === 'war_cry') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  const want = sk.cryParams().buff;
  sk.fire();
  const first = { ...ctx.w.warCry };
  for (let i = 0; i < 50; i++) sk.fire();
  ok(ctx.w.warCry.meleeDamageBonus === first.meleeDamageBonus, `${id}: 50 連打で近接ダメージが変わらない（${ctx.w.warCry.meleeDamageBonus}）`);
  ok(ctx.w.warCry.furyGainBonus === first.furyGainBonus, `${id}: 闘気獲得も変わらない`);
  ok(ctx.w.warCry.comboGraceBonus === first.comboGraceBonus, `${id}: コンボ猶予も変わらない`);
  ok(ctx.w.warCry.leftMs <= Math.min(want.durationMs, CFG.maxDurationMs) + 1e-6,
    `${id}: 持続も積み上がらない（${Math.round(ctx.w.warCry.leftMs)}ms）`);
  ok(ctx.w.telemetry.warCryApplications === 51, `${id}: 適用回数だけは記録される（${ctx.w.telemetry.warCryApplications}）`);
}

// ===== 4. 'refresh' 以外の規則は「既にバフ中なら何もしない」 =====
section('4. 重ねがけ規則が refresh 以外なら、バフ中の再適用は無視される');
{
  const ctx = build();
  ctx.w.applyWarCryBuff({ durationMs: 5000, meleeDamageBonus: 0.2, stack: 'once' });
  const before = { ...ctx.w.warCry };
  const again = ctx.w.applyWarCryBuff({ durationMs: 5000, meleeDamageBonus: 0.5, stack: 'once' });
  ok(again === null, 'バフ中の再適用は無視される');
  ok(ctx.w.warCry.meleeDamageBonus === before.meleeDamageBonus, `強度が上書きされない（${ctx.w.warCry.meleeDamageBonus}）`);
  // refresh なら上書きされる（どちらの規則でも stack はしない）。
  const ctx2 = build();
  ctx2.w.applyWarCryBuff({ durationMs: 5000, meleeDamageBonus: 0.2, stack: 'refresh' });
  ctx2.w.applyWarCryBuff({ durationMs: 3000, meleeDamageBonus: 0.1, stack: 'refresh' });
  ok(ctx2.w.warCry.meleeDamageBonus === 0.1, `refresh は新しい値で上書きする（${ctx2.w.warCry.meleeDamageBonus}）`);
  ok(Math.round(ctx2.w.warCry.leftMs) === 3000, `持続も新しい値で上書きされる（${Math.round(ctx2.w.warCry.leftMs)}ms・加算しない）`);
}

// ===== 5. バフが実際に効く =====
section('5. バフが近接ダメージ・闘気獲得・コンボ猶予へ実際に効く');
{
  const ctx = build();
  const target = { alive: true, isBoss: false, isElite: false, hp: 100, maxHp: 100 };
  const base = ctx.w.meleeDamageMultiplier(target);
  ctx.w.applyWarCryBuff({ durationMs: 5000, meleeDamageBonus: 0.2, furyGainBonus: 0.3, comboGraceBonus: 0.5 });
  ok(ctx.w.meleeDamageMultiplier(target) > base, `近接ダメージ倍率が上がる（${base.toFixed(3)} → ${ctx.w.meleeDamageMultiplier(target).toFixed(3)}）`);
  ok(Math.abs(ctx.w.meleeDamageMultiplier(target) / base - 1.2) < 1e-6, `倍率はちょうど +20%`);
  // 闘気獲得。
  // 1 発動あたりの闘気上限に当たらない小さな値で比べる。
  const plain = build();
  plain.w.addFury(2, 'meleeHit', null);
  const withBuff = build();
  withBuff.w.applyWarCryBuff({ durationMs: 5000, furyGainBonus: 0.3 });
  withBuff.w.addFury(2, 'meleeHit', null);
  ok(withBuff.w.fury > plain.w.fury, `闘気獲得が増える（${plain.w.fury.toFixed(2)} → ${withBuff.w.fury.toFixed(2)}）`);
  // コンボ猶予。
  const g1 = build(); g1.w.addCombo(1, 'x', null);
  const g2 = build(); g2.w.applyWarCryBuff({ durationMs: 5000, comboGraceBonus: 0.5 }); g2.w.addCombo(1, 'x', null);
  ok(g2.w.comboGraceLeftMs > g1.w.comboGraceLeftMs,
    `コンボ猶予が伸びる（${Math.round(g1.w.comboGraceLeftMs)}ms → ${Math.round(g2.w.comboGraceLeftMs)}ms）`);
  info(`バフ効果: 近接×1.2 / 闘気 ${plain.w.fury.toFixed(2)}→${withBuff.w.fury.toFixed(2)} / 猶予 ${Math.round(g1.w.comboGraceLeftMs)}→${Math.round(g2.w.comboGraceLeftMs)}ms`);
}

// ===== 6. コンボ値そのものは配らない =====
section('6. コンボ値そのものは無料で配らない（回復するのは猶予だけ）');
{
  const ctx = build({ enemies: [] });
  ctx.w.addCombo(12, 'seed', null);
  const combo = ctx.w.combo;
  ctx.w.comboGraceLeftMs = 1;
  ctx.w.applyWarCryBuff({ durationMs: 5000, comboGraceBonus: 0.5, graceRefill: 1 });
  ok(ctx.w.combo === combo, `コンボ値は変わらない（${combo}）`);
  ok(ctx.w.comboGraceLeftMs > 1, `猶予だけが回復する（${Math.round(ctx.w.comboGraceLeftMs)}ms）`);
  // コンボが 0 のときは猶予も回復しない（0 からの立ち上がりを無料にしない）。
  const zero = build({ enemies: [] });
  zero.w.comboGraceLeftMs = 0;
  zero.w.applyWarCryBuff({ durationMs: 5000, comboGraceBonus: 0.5, graceRefill: 1 });
  ok(zero.w.combo === 0, 'コンボ 0 のままである');
  ok(zero.w.comboGraceLeftMs === 0, 'コンボ 0 では猶予も回復しない');
}

// ===== 7. 時間で確実に切れる =====
section('7. バフは時間で確実に切れる（永続化しない）');
for (const id of ['war_cry', 'war_god_roar']) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (id === 'war_cry') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  sk.fire();
  const dur = ctx.w.warCry.leftMs;
  // CD を止めて再発動させず、持続ぶんだけ進める。
  sk._cd = 1e9;
  for (let i = 0; i < Math.ceil((dur + 200) / 16); i++) { ctx.w.update(16); ctx.scene.advance(16); }
  ok(ctx.w.warCry.leftMs === 0, `${id}: 持続 ${Math.round(dur)}ms で切れる`);
  ok(ctx.w.warCryActive === false, `${id}: バフ状態が解除される`);
  ok(ctx.w.warCry.meleeDamageBonus === 0, `${id}: 効果値も 0 に戻る`);
  ok(ctx.w.telemetry.warCryUptimeMs > 0, `${id}: 稼働時間が記録される（${Math.round(ctx.w.telemetry.warCryUptimeMs)}ms）`);
}

// ===== 8. 保存 / 復元 =====
section('8. 保存 / 復元でバフが無限化しない');
{
  const ctx = build();
  ctx.w.applyWarCryBuff({ durationMs: 6000, meleeDamageBonus: 0.2, furyGainBonus: 0.3, comboGraceBonus: 0.4 });
  for (let i = 0; i < 100; i++) { ctx.w.update(16); ctx.scene.advance(16); }
  const saved = ctx.w.serializeTimedBuffs();
  ok(saved.warCry.leftMs > 0 && saved.warCry.leftMs < 6000, `残り時間だけを保存する（${Math.round(saved.warCry.leftMs)}ms）`);
  const ctx2 = build();
  ctx2.w.restoreTimedBuffs(saved);
  ok(Math.abs(ctx2.w.warCry.leftMs - saved.warCry.leftMs) < 1e-6, `残り時間が正しく戻る（${Math.round(ctx2.w.warCry.leftMs)}ms）`);
  ok(ctx2.w.warCry.meleeDamageBonus === 0.2, '効果値も戻る');
  // 壊れた保存でも安全（無限バフを作らない）。
  for (const bad of [null, {}, { warCry: null }, { warCry: { leftMs: 1e12, meleeDamageBonus: 99 } }, { warCry: { leftMs: NaN } }]) {
    const c = build();
    let threw = null;
    try { c.w.restoreTimedBuffs(bad); } catch (e) { threw = e; }
    ok(!threw, `壊れた保存 ${JSON.stringify(bad)} で例外を出さない`);
    ok(c.w.warCry.leftMs <= CFG.maxDurationMs, `壊れた保存でも持続が上限内（${Math.round(c.w.warCry.leftMs)}ms）`);
    ok(c.w.warCry.meleeDamageBonus <= CFG.maxMeleeDamageBonus, '壊れた保存でも強度が上限内');
  }
  // reset で必ず消える。
  ctx2.w.reset();
  ok(ctx2.w.warCry.leftMs === 0, '周回リセットでバフが消える');
}

// ===== 9. 戦士以外へは効かない =====
section('9. バフは戦士だけのもの（他ジョブへ漏れない）');
{
  // WarriorCombatSystem 自体が enabled=false のとき何もしない。
  const scene = makeScene({ enemies: [], now: 10000 });
  const off = makeWarrior(WarriorCombatSystem, scene, { enabled: false });
  ok(off.applyWarCryBuff({ durationMs: 5000, meleeDamageBonus: 0.5 }) === null, '無効時はバフが付かない');
  ok(off.warCry.leftMs === 0, '無効時は残り時間も 0');
  // 戦吼 / 軍神咆哮は warrior 専用プールに属する。
  const wj = DATA.jobs.find((j) => j.id === 'warrior');
  ok(wj.activeSkillPool.includes('war_cry'), '戦吼は戦士のプールにある');
  ok(wj.evolutionPool.includes('war_god_roar'), '軍神咆哮は戦士のプールにある');
  ok(SKILL('war_cry').jobs.length === 1 && SKILL('war_cry').jobs[0] === 'warrior', '戦吼は jobs:["warrior"]');
  ok(EVO('war_god_roar').element === 'physical', '軍神咆哮は physical');
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    ok(!j.activeSkillPool.includes('war_cry'), `${jid} のプールに戦吼がない`);
    ok(!(j.evolutionPool || []).includes('war_god_roar'), `${jid} のプールに軍神咆哮がない`);
  }
}

// ===== 10. 押し返し / 体勢削り =====
section('10. 戦吼は通常敵を押し返し、エリート / ボスへは少量の体勢削りを与える');
{
  const lv8 = SKILL('war_cry').levels[7];
  const ctx = build({ enemies: makeEnemies(8, { x: 320, y: 300, dy: 4, hp: 1e9 }) });
  ctx.sm.acquireOrLevel('war_cry'); ctx.sm.setLevel('war_cry', 8);
  run(ctx, 20000);
  const ws = ctx.scene._warriorSkillStats.war_cry || {};
  ok((ws.knockbacks || 0) > 0, `通常敵を押し返す（${ws.knockbacks} 回）`);
  ok((ws.poiseDamage || 0) > 0, `体勢削りがある（${Math.round(ws.poiseDamage)}）`);
  ok(lv8.poiseDamage < SKILL('armor_breaker').levels[7].poiseDamage,
    `体勢削りは少量（${lv8.poiseDamage} < 兜割り ${SKILL('armor_breaker').levels[7].poiseDamage}）`);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, '弾を出さない');
  // 敵ゼロでも吼えられる（自己バフなので）。
  const empty = build({ enemies: [] });
  empty.sm.acquireOrLevel('war_cry'); empty.sm.setLevel('war_cry', 8);
  run(empty, 10000);
  ok(empty.w.telemetry.warCryApplications > 0, `敵ゼロでもバフは付く（${empty.w.telemetry.warCryApplications} 回）`);
  info(`戦吼: 押し返し${ws.knockbacks} 体勢${Math.round(ws.poiseDamage)} 適用${ctx.w.telemetry.warCryApplications}`);
}

T.finish();
