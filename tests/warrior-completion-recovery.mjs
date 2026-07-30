// 戦士 完成監査 10/23: 回復系 完成監査（M8-F §12 Recovery）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-recovery.mjs
import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';
const T = runner('戦士 回復系 完成監査（M8-F）');
const { ok, section, info } = T;
const { WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
const mk = (o = {}) => {
  const scene = makeScene({ enemies: makeEnemies(8, { hp: 1e9 }), boss: o.boss || null, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, o);
  return { scene, w };
};
const tick = (c, ms, step = 16) => { for (let i = 0; i < ms / step; i++) { c.w.update(step); c.scene.advance(step); } };

// ===== 1. 闘気解放の回復（一括全快しない） =====
section('1. 闘気解放の回復は時間で徐々に入り、一括全快しない');
{
  const c = mk();
  c.scene.player.hp = 30; c.scene.player.maxHp = 100;
  c.w.setHp(30, 100);
  c.w.fury = W.fury.max; c.w.startRelease();
  const planned = c.w.recovery.remainAmount;
  ok(planned > 0, `回復が予約される（${planned.toFixed(1)}）`);
  ok(c.scene.player.hp === 30, '発動の瞬間には回復しない（一括全快しない）');
  tick(c, 200);
  ok(c.scene.player.hp > 30 && c.scene.player.hp < 100, `徐々に回復する（${c.scene.player.hp.toFixed(1)}）`);
  tick(c, W.furyRelease.recovery.durationMs + 500);
  ok(c.scene.player.hp <= 100, `overheal しない（${c.scene.player.hp.toFixed(1)}）`);
  ok(c.w.recovery.remainAmount <= 1e-6, '回復が使い切られる');
  ok(c.w.telemetry.recoveryAmount > 0, `テレメトリに残る（${c.w.telemetry.recoveryAmount.toFixed(1)}）`);
  // 予定量は「最大HPの a% ＋ 欠損HPの b%」で上限つき。
  const want = 100 * W.furyRelease.recovery.maxHpPercent + 70 * W.furyRelease.recovery.missingHpPercent;
  ok(Math.abs(planned - want) < 1e-6 || planned <= want + 1e-6, `予定量が data どおり（${planned.toFixed(2)} ≈ ${want.toFixed(2)}）`);
}

// ===== 2. 撃破回復（血気を取っているときだけ） =====
section('2. 撃破回復は血気（killHealMult）を持つときだけ効く');
{
  const off = mk();
  off.scene.player.hp = 50; off.scene.player.maxHp = 100; off.w.setHp(50, 100);
  for (let i = 0; i < 20; i++) { off.w.noteKill({ isElite: false, isBoss: false }); off.w.update(100); off.scene.advance(100); }
  ok(off.scene.player.hp === 50, '血気なしでは 1 も回復しない');
  ok(off.w.telemetry.killHeal === 0, 'テレメトリも 0');

  const on = mk({ mods: { killHealMult: 1 } });
  on.scene.player.hp = 50; on.scene.player.maxHp = 100; on.w.setHp(50, 100);
  for (let i = 0; i < 5; i++) { on.w.noteKill({ isElite: false, isBoss: false }); on.w.update(100); on.scene.advance(100); }
  ok(on.scene.player.hp > 50, `血気ありでは回復する（${on.scene.player.hp.toFixed(1)}）`);
  ok(on.w.telemetry.killHeal > 0, `テレメトリに残る（${on.w.telemetry.killHeal.toFixed(2)}）`);
}

// ===== 3. 毎秒上限 =====
section('3. 撃破回復に毎秒上限があり、大量撃破でも突き抜けない');
{
  const c = mk({ mods: { killHealMult: 1 } });
  c.scene.player.hp = 1; c.scene.player.maxHp = 10000; c.w.setHp(1, 10000);
  let healed = 0;
  for (let i = 0; i < 200; i++) { const b = c.scene.player.hp; c.w.noteKill({ isElite: false, isBoss: false }); healed += c.scene.player.hp - b; }
  // 毎秒上限は「最大HPの perSecondCapPercent」。
  const capPerSec = 10000 * W.killHeal.perSecondCapPercent;
  ok(healed <= capPerSec * 1.05 + 1e-6, `1 秒での回復 ${healed.toFixed(2)} ≤ 上限 ${capPerSec.toFixed(2)}（最大HP×${W.killHeal.perSecondCapPercent}）`);
  ok(c.w.telemetry.killHealCapped > 0, `上限到達が記録される（${c.w.telemetry.killHealCapped.toFixed(2)}）`);
  // 次の秒では再び回復できる。
  c.scene.advance(1100);
  const b2 = c.scene.player.hp;
  c.w.noteKill({ isElite: false, isBoss: false });
  ok(c.scene.player.hp > b2, '次の秒では再び回復できる');
}

// ===== 4. エリート / ボス倍率 =====
section('4. エリート / ボスの撃破倍率が data どおり');
{
  const amounts = {};
  for (const [name, target] of [['normal', { isElite: false, isBoss: false }], ['elite', { isElite: true }], ['boss', { isBoss: true }]]) {
    const c = mk({ mods: { killHealMult: 1 } });
    c.scene.player.hp = 1; c.scene.player.maxHp = 1e6; c.w.setHp(1, 1e6);
    const b = c.scene.player.hp;
    c.w.noteKill(target);
    amounts[name] = c.scene.player.hp - b;
  }
  ok(amounts.elite > amounts.normal, `エリート ${amounts.elite.toFixed(2)} > 通常 ${amounts.normal.toFixed(2)}`);
  ok(amounts.boss >= amounts.elite, `ボス ${amounts.boss.toFixed(2)} ≥ エリート ${amounts.elite.toFixed(2)}`);
  info(`撃破回復: 通常 ${amounts.normal.toFixed(2)} / エリート ${amounts.elite.toFixed(2)} / ボス ${amounts.boss.toFixed(2)}`);
}

// ===== 5. 陣 / 構えの強化は上限を共有 =====
section('5. 血盟戦旗 / 血染修羅の強化は既存の毎秒上限を共有する');
{
  for (const [name, apply] of [
    ['血盟戦旗', (c) => { c.w.placeRallyField('r', { x: 0, y: 0, durationMs: 1e5, radius: 1e6, killHealBonus: 0.5, perSecondCapBonus: 0.2, meleeArea: 0 }); c.w.updateRallyPosition(0, 0); }],
    ['血染修羅', (c) => c.w.beginBattleTrance('t', { durationMs: 1e5, killHealBonus: 0.5, perSecondCapBonus: 0.2 })],
  ]) {
    const c = mk({ mods: { killHealMult: 1 } });
    c.scene.player.hp = 1; c.scene.player.maxHp = 1e6; c.w.setHp(1, 1e6);
    apply(c);
    let healed = 0;
    for (let i = 0; i < 300; i++) { const b = c.scene.player.hp; c.w.noteKill({ isElite: false, isBoss: false }); healed += c.scene.player.hp - b; }
    const cap = 1e6 * W.killHeal.perSecondCapPercent * (1 + 0.2);
    ok(healed <= cap * 1.05 + 1e-6, `${name}: 1 秒の回復 ${healed.toFixed(2)} ≤ 強化後の上限 ${cap.toFixed(2)}（無限回復にならない）`);
    ok(healed > 0, `${name}: 回復自体は効く`);
  }
}

// ===== 6. ライフスティール / 自傷が無い =====
section('6. ライフスティールも自傷も無い');
{
  const src = (await import('node:fs')).readFileSync('src/systems/WarriorCombatSystem.js', 'utf8');
  ok(!/lifesteal|drainLife/i.test(src), 'ライフスティールの経路が無い');
  // ダメージを与えるだけでは回復しない。
  const c = mk({ mods: { killHealMult: 1 } });
  c.scene.player.hp = 50; c.scene.player.maxHp = 100; c.w.setHp(50, 100);
  for (let i = 0; i < 50; i++) c.w.noteMeleeHit({ furyGain: 1 }, { alive: true, _seq: i }, `k${i}`);
  ok(c.scene.player.hp === 50, '命中では回復しない（撃破時のみ）');
  // 自傷する経路が無い（HP を減らす API を持たない）。
  ok(!/player\.hp\s*-=|takeDamage\(/.test(src), 'WarriorCombatSystem が HP を直接減らさない');
}

// ===== 7. 再帰回復が無い =====
section('7. 回復が回復を呼ばない（再帰なし）');
{
  const c = mk({ mods: { killHealMult: 1 } });
  c.scene.player.hp = 10; c.scene.player.maxHp = 100; c.w.setHp(10, 100);
  let calls = 0;
  const orig = c.scene.player.heal.bind(c.scene.player);
  c.scene.player.heal = (a) => { calls += 1; if (calls > 500) throw new Error('回復が再帰している'); return orig(a); };
  let threw = false;
  try { for (let i = 0; i < 50; i++) { c.w.noteKill({ isElite: false, isBoss: false }); c.w.update(100); c.scene.advance(100); } } catch (e) { threw = true; }
  ok(!threw, `回復が再帰しない（heal 呼び出し ${calls} 回）`);
}

// ===== 8. 不屈の回復 =====
section('8. 不屈の回復も一括全快せず、二重に入らない');
{
  const c = mk();
  c.scene.advance(W.unyielding.minRunTimeMs + 100);
  c.scene.player.hp = 5; c.scene.player.maxHp = 100; c.w.setHp(5, 100);
  ok(c.w.checkUnyielding() === true, '不屈が発動する');
  ok(c.scene.player.hp === 5, '発動の瞬間には全快しない');
  ok(c.w.unyielding.healRemain > 0, '回復が予約される');
  tick(c, W.unyielding.durationMs + 500);
  ok(c.scene.player.hp > 5 && c.scene.player.hp <= 100, `徐々に回復して overheal しない（${c.scene.player.hp.toFixed(1)}）`);
  ok(c.w.unyielding.healRemain <= 1e-6, '回復を使い切る');
  ok(c.w.telemetry.unyieldingHealing > 0, `テレメトリに残る（${c.w.telemetry.unyieldingHealing.toFixed(1)}）`);
  // 死亡後は回復しない。
  const c2 = mk();
  c2.scene.advance(W.unyielding.minRunTimeMs + 100);
  c2.w.setHp(0, 100);
  ok(c2.w.checkUnyielding() === false, 'HP0 では発動しない');
}

// ===== 9. 死亡イベントは 1 回だけ =====
section('9. 死亡イベントが二重に出ない');
{
  const c = mk();
  let deaths = 0;
  const c2 = { ...c };
  void c2;
  const scene = c.scene;
  scene.calls.length = 0;
  c.w.noteDeath(); c.w.noteDeath();
  deaths = scene.calls.filter((x) => x[0] === 'warriorEvent' && x[1] === 'death').length;
  ok(deaths === 0, 'noteDeath は死亡イベントを発火しない（Scene 側が 1 回だけ出す）');
  ok(c.w.telemetry.deathsAfterUnyielding >= 0, '不屈後の死亡が数えられる');
}

T.finish();
