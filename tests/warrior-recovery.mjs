// 戦士 6/17: 回復（闘気解放の時間回復・撃破回復）と強靱（被ダメージ軽減）（M8-B §5・§7・§9）。
// - 回復は一括全快ではなく時間経過で分割されること
// - overheal しない（最大HPを超えて回復しない）こと
// - 撃破回復は「血気」を取得しているときだけ発生し、毎秒上限を超えないこと
// - 軽減は上限（maxTotalReduction）でクランプされ、無敵にならないこと
// 実行: node tests/warrior-recovery.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';

const T = runner('戦士 回復・強靱（M8-B）');
const { ok, section, info } = T;

const { WarriorCombatSystem } = await bootRuntime();
const REC = DATA.balance.warrior.furyRelease.recovery;
const MIT = DATA.balance.warrior.mitigation;
const KH = DATA.balance.warrior.killHeal;
const FURY = DATA.balance.warrior.fury;

const setup = (opts = {}) => {
  const scene = makeScene({ enemies: makeEnemies(4, { hp: 1e9 }), now: 20000 });
  if (opts.hp != null) scene.player.hp = opts.hp;
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  w.setHp(scene.player.hp, scene.player.maxHp);
  return { scene, w };
};

// ===== 1. 設定値 =====
section('1. balance.json の回復・軽減設定が健全');
ok(REC.durationMs > 0, `recovery.durationMs ${REC.durationMs} > 0（一括全快ではない）`);
ok(REC.maxHpPercent >= 0 && REC.maxHpPercent < 0.2, `maxHpPercent ${REC.maxHpPercent} が控えめ`);
ok(REC.missingHpPercent >= 0 && REC.missingHpPercent < 0.5, `missingHpPercent ${REC.missingHpPercent} が控えめ`);
ok(MIT.maxTotalReduction > 0 && MIT.maxTotalReduction < 1, `maxTotalReduction ${MIT.maxTotalReduction} が (0,1)＝無敵にならない`);
ok(KH.maxHpPercent > 0 && KH.maxHpPercent < 0.01, `killHeal.maxHpPercent ${KH.maxHpPercent} が微小`);
ok(KH.perSecondCapPercent > 0 && KH.perSecondCapPercent < 0.1, `killHeal.perSecondCapPercent ${KH.perSecondCapPercent} が上限として機能する範囲`);

// ===== 2. 闘気解放の回復が時間分割される =====
section('2. 闘気解放の回復は一括ではなく時間経過で入る');
{
  const { scene, w } = setup({ hp: 40 });
  w.fury = FURY.max;
  w.startRelease();
  ok(w.recovery.leftMs > 0 && w.recovery.remainAmount > 0, '回復が予約される');
  const planned = w.recovery.remainAmount;
  const hp0 = scene.player.hp;
  w.update(16); scene.advance(16);
  const afterOneFrame = scene.player.hp - hp0;
  ok(afterOneFrame > 0, '1 フレームで少し回復する');
  ok(afterOneFrame < planned * 0.5, `1 フレームで全量は入らない（${afterOneFrame.toFixed(3)} < ${(planned * 0.5).toFixed(3)}）`);
  let guard = 0;
  while (w.recovery.leftMs > 0 && guard++ < 2000) { w.update(16); w.setHp(scene.player.hp, scene.player.maxHp); scene.advance(16); }
  ok(w.recovery.leftMs === 0, '回復期間が終了する');
  ok(Math.abs((scene.player.hp - hp0) - planned) < 0.5, `合計回復 ${(scene.player.hp - hp0).toFixed(2)} ≒ 予約量 ${planned.toFixed(2)}`);
  info(`最大HP ${scene.player.maxHp} / 開始HP ${hp0} → 回復 ${(scene.player.hp - hp0).toFixed(2)}`);
}

// ===== 3. overheal しない =====
section('3. 満タンでは回復せず、overheal も起きない');
{
  const { scene, w } = setup({ hp: 100 });
  w.fury = FURY.max;
  w.startRelease();
  let guard = 0;
  while (w.recovery.leftMs > 0 && guard++ < 2000) { w.update(16); w.setHp(scene.player.hp, scene.player.maxHp); scene.advance(16); }
  ok(scene.player.hp === scene.player.maxHp, `HP が最大のまま（${scene.player.hp}）`);
  ok(w.telemetry.overhealPrevented > 0, `overheal 分が記録される（${w.telemetry.overhealPrevented.toFixed(2)}）`);
  ok(w.telemetry.recoveryAmount < 1e-6, '実回復量は ~0');
}

// ===== 4. 撃破回復は「血気」取得時のみ =====
section('4. 撃破回復は血気（killHealMult>0）を取得しているときだけ');
{
  const a = setup({ hp: 50 });
  const healedA = a.w.noteKill({ alive: false, isElite: false, isBoss: false });
  ok(healedA === 0, '血気なしでは撃破回復 0');
  ok(a.scene.player.hp === 50, 'HP が変わらない');

  const b = setup({ hp: 50, mods: { killHealMult: 1 } });
  const healedB = b.w.noteKill({ alive: false, isElite: false, isBoss: false });
  ok(healedB > 0, `血気ありなら撃破回復 ${healedB.toFixed(3)} > 0`);
  ok(b.scene.player.hp > 50, 'HP が増える');
  ok(healedB <= b.scene.player.maxHp * KH.maxHpPercent + 1e-6, '1 体あたりの回復量は maxHpPercent 以内');
}

// ===== 5. 撃破回復の毎秒上限（無限回復の防止）=====
section('5. 撃破回復は毎秒上限を超えない（敵数に比例した無限回復にならない）');
{
  const { scene, w } = setup({ hp: 1, mods: { killHealMult: 1 } });
  let healed = 0;
  for (let i = 0; i < 500; i++) { healed += w.noteKill({ alive: false, isElite: false, isBoss: false }); w.setHp(scene.player.hp, scene.player.maxHp); }
  const cap = scene.player.maxHp * KH.perSecondCapPercent;
  ok(healed <= cap + 1e-6, `500 体撃破でも 1 秒間の回復 ${healed.toFixed(3)} ≤ ${cap.toFixed(3)}`);
  ok(w.telemetry.killHealCapped > 0, '上限で切られた分が記録される');
  scene.advance(1000);
  ok(w.noteKill({ alive: false }) > 0, '1 秒経過で窓がリセットされる');
}

// ===== 6. エリート/ボスの倍率 =====
section('6. エリート / ボス撃破は回復量が大きい');
{
  const norm = setup({ hp: 1, mods: { killHealMult: 1 } });
  const elite = setup({ hp: 1, mods: { killHealMult: 1 } });
  const boss = setup({ hp: 1, mods: { killHealMult: 1 } });
  const n = norm.w.noteKill({ alive: false });
  const e = elite.w.noteKill({ alive: false, isElite: true });
  const b = boss.w.noteKill({ alive: false, isBoss: true });
  ok(e > n, `エリート ${e.toFixed(3)} > 通常 ${n.toFixed(3)}`);
  ok(b > e, `ボス ${b.toFixed(3)} > エリート ${e.toFixed(3)}`);
}

// ===== 7. 軽減の合成と上限 =====
section('7. 強靱の軽減は合成され、maxTotalReduction でクランプされる');
{
  const { w } = setup();
  ok(w.damageReduction({}) === 0 || w.damageReduction({}) >= 0, '素の軽減は 0 以上');
  const engaged = w.damageReduction({ engaged: true });
  ok(Math.abs(engaged - MIT.engagedReduction) < 1e-9, `接敵で ${MIT.engagedReduction}`);
  const charging = w.damageReduction({ engaged: true, charging: true });
  ok(charging > engaged, `突進中はさらに増える（${engaged} → ${charging}）`);
  const extra = w.damageReduction({ engaged: true, charging: true, extra: 0.5 });
  ok(extra > charging, 'スキル由来の一時軽減（盾撃/城塞）が合成される');
  const insane = w.damageReduction({ engaged: true, charging: true, extra: 5 });
  ok(Math.abs(insane - MIT.maxTotalReduction) < 1e-9, `合計は ${MIT.maxTotalReduction} でクランプ（実際 ${insane}）`);
  ok(insane < 1, '軽減 100%（永久無敵）にはならない');
}

// ===== 8. 近接発動直後の軽減ウィンドウ =====
section('8. 近接発動直後の短い軽減ウィンドウ');
{
  const { scene, w } = setup();
  const before = w.damageReduction({});
  w.noteMeleeCast('great_cleave');
  const during = w.damageReduction({});
  ok(during > before, `近接発動直後は軽減が増える（${before} → ${during}）`);
  scene.advance(MIT.meleeCastWindowMs + 50);
  ok(Math.abs(w.damageReduction({}) - before) < 1e-9, 'ウィンドウが閉じると元へ戻る');
  ok(w.telemetry.meleeCasts === 1, 'meleeCasts が数えられる');
}

// ===== 9. applyIncomingDamage の一貫性 =====
section('9. applyIncomingDamage は軽減後の値を返し、HP を直接触らない');
{
  const { scene, w } = setup({ hp: 100 });
  const out = w.applyIncomingDamage(100, { engaged: true });
  ok(out < 100 && out > 0, `100 → ${out.toFixed(2)}（0 にはならない）`);
  ok(scene.player.hp === 100, 'WarriorCombatSystem は HP を直接減らさない（Player 側の責務）');
  ok(Math.abs(w.telemetry.mitigationAmount - (100 - out)) < 1e-6, '軽減量が正しく記録される');
  ok(w.applyIncomingDamage(0, {}) === 0, '0 ダメージは 0 のまま');
  ok(w.applyIncomingDamage(-5, {}) === 0, '負のダメージは 0 へ丸める');
}

// ===== 10. 突進ウィンドウ =====
section('10. 突進の軽減ウィンドウは時間で必ず閉じる');
{
  const { scene, w } = setup();
  w.setChargeWindow(300);
  ok(w.damageReduction({}) >= MIT.chargeReduction - 1e-9, '突進中は chargeReduction が乗る');
  scene.advance(400);
  ok(w.damageReduction({}) < MIT.chargeReduction, '時間経過で閉じる');
  w.setChargeWindow(-100);
  ok(w.damageReduction({}) < MIT.chargeReduction, '負の値でも窓が開きっぱなしにならない');
}

T.finish();
