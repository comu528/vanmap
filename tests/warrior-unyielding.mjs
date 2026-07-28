// 戦士 7/17: 不屈（M8-B §10）。Node.js 標準機能のみ。
// - 瀕死（HP しきい値未満）で 1 回だけ発動し、クールダウンが明確にあること
// - 発動中は軽減が上がり、回復が時間経過で入ること（無敵にも即全快にもならない）
// - 周回開始直後・HP0・発動中の再発動が起きないこと
// - 重装（unyieldingPowerMult）で軽減量・回復量が強化されること
// 実行: node tests/warrior-unyielding.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';

const T = runner('戦士 不屈（M8-B）');
const { ok, section, info } = T;

const { WarriorCombatSystem } = await bootRuntime();
const U = DATA.balance.warrior.unyielding;

// now を run 開始から十分に進めた状態で作る（minRunTimeMs ガードを越える）。
const setup = (opts = {}) => {
  const scene = makeScene({ enemies: makeEnemies(4, { hp: 1e9 }), now: 1000 });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  if (opts.warm !== false) scene.advance(U.minRunTimeMs + 100);
  if (opts.hp != null) scene.player.hp = opts.hp;
  w.setHp(scene.player.hp, scene.player.maxHp);
  return { scene, w };
};

// ===== 1. 設定値 =====
section('1. balance.json の warrior.unyielding が健全');
ok(U.hpThreshold > 0 && U.hpThreshold < 1, `hpThreshold ${U.hpThreshold} が (0,1)`);
ok(U.cooldownMs > 0, `cooldownMs ${U.cooldownMs} > 0（1 周回に何度も撃てない）`);
ok(U.durationMs > 0 && U.durationMs < U.cooldownMs, `durationMs ${U.durationMs} < cooldownMs`);
ok(U.damageReduction > 0 && U.damageReduction < 1, `damageReduction ${U.damageReduction} が (0,1)＝無敵にならない`);
ok(U.healMaxHpPercent > 0 && U.healMaxHpPercent < 0.5, `healMaxHpPercent ${U.healMaxHpPercent} が控えめ`);
ok(U.minRunTimeMs >= 0, `minRunTimeMs ${U.minRunTimeMs}`);

// ===== 2. 瀕死で発動 =====
section('2. HP がしきい値を割ると発動する');
{
  const { w } = setup({ hp: Math.floor(100 * U.hpThreshold) - 1 });
  ok(w.checkUnyielding() === true, '発動する');
  ok(w.unyieldingActive, '発動中フラグが立つ');
  ok(w.unyielding.triggers === 1, '発動回数 1');
  ok(w.telemetry.unyieldingTriggers === 1, 'telemetry へ記録される');
  ok(w.unyielding.cooldownLeftMs === U.cooldownMs, 'クールダウンが設定される');
  ok(w.unyielding.healRemain > 0 && w.unyielding.healLeftMs > 0, '回復が予約される（即時全快ではない）');
}

// ===== 3. しきい値以上では発動しない =====
section('3. HP がしきい値以上では発動しない');
{
  const { w } = setup({ hp: Math.ceil(100 * U.hpThreshold) + 5 });
  ok(w.checkUnyielding() === false, '発動しない');
  ok(!w.unyieldingActive, '発動中でない');
  ok(w.unyieldingReady, '待機状態のまま');
}

// ===== 4. 周回開始直後は発動しない =====
section('4. 周回開始直後（minRunTimeMs 未満）は発動しない');
{
  const { w } = setup({ hp: 1, warm: false });
  ok(w.checkUnyielding() === false, `開始 ${U.minRunTimeMs}ms 未満では発動しない`);
}

// ===== 5. HP 0（死亡後）では発動しない =====
section('5. HP 0 では発動しない（死亡後の復活装置ではない）');
{
  const { w } = setup({ hp: 0 });
  ok(w.checkUnyielding() === false, 'HP0 では発動しない');
}

// ===== 6. 発動中・CD 中は再発動しない =====
section('6. 発動中 / クールダウン中は再発動しない');
{
  const { scene, w } = setup({ hp: 1 });
  ok(w.checkUnyielding() === true, '1 回目は発動');
  ok(w.checkUnyielding() === false, '発動中は再発動しない');
  // 発動時間だけ進める（クールダウンはまだ残る）。
  for (let i = 0; i < Math.ceil(U.durationMs / 50) + 2; i++) { w.update(50); w.setHp(1, 100); scene.advance(50); }
  ok(!w.unyieldingActive, '発動時間が終了する');
  ok(!w.unyieldingReady, 'クールダウン中');
  ok(w.checkUnyielding() === false, 'クールダウン中は再発動しない');
  ok(w.unyielding.triggers === 1, `発動回数は 1 のまま（実際 ${w.unyielding.triggers}）`);
  // クールダウンを消化。
  let guard = 0;
  while (!w.unyieldingReady && guard++ < 5000) { w.update(50); w.setHp(60, 100); scene.advance(50); }
  ok(w.unyieldingReady, `クールダウン ${U.cooldownMs}ms 経過で再び待機状態`);
  w.setHp(1, 100);
  ok(w.checkUnyielding() === true, '再び瀕死になれば発動する');
  info(`1 周回での発動回数: ${w.unyielding.triggers}`);
}

// ===== 7. 発動中の軽減 =====
section('7. 発動中は軽減が上がる（ただし無敵ではない）');
{
  const { w } = setup({ hp: 1 });
  const before = w.damageReduction({});
  w.checkUnyielding();
  const during = w.damageReduction({});
  ok(during > before, `軽減が上がる（${before} → ${during}）`);
  ok(during < 1, '軽減 100% にはならない');
  const out = w.applyIncomingDamage(100, {});
  ok(out > 0, `発動中でもダメージは通る（${out.toFixed(2)}）`);
  ok(w.telemetry.unyieldingMitigated > 0, '不屈による軽減量が記録される');
}

// ===== 8. 回復が時間経過で入る =====
section('8. 発動時の回復は時間経過で入る（即時全快しない）');
{
  const { scene, w } = setup({ hp: 10 });
  w.checkUnyielding();
  const planned = w.unyielding.healRemain;
  ok(Math.abs(planned - scene.player.maxHp * U.healMaxHpPercent) < 1e-6, `回復予約量 ${planned.toFixed(2)}`);
  w.update(16); scene.advance(16);
  ok(scene.player.hp > 10, '少しずつ回復する');
  ok(scene.player.hp < 10 + planned, '1 フレームで全量は入らない');
  let guard = 0;
  while (w.unyielding.healLeftMs > 0 && guard++ < 2000) { w.update(16); w.setHp(scene.player.hp, scene.player.maxHp); scene.advance(16); }
  ok(Math.abs(scene.player.hp - (10 + planned)) < 0.5, `合計 ${(scene.player.hp - 10).toFixed(2)} ≒ ${planned.toFixed(2)}`);
  ok(scene.player.hp < scene.player.maxHp, '全快はしない');
  ok(w.telemetry.unyieldingHealing > 0, '回復量が記録される');
}

// ===== 9. 重装による強化 =====
section('9. 重装（unyieldingPowerMult）で軽減・回復が強化される');
{
  const a = setup({ hp: 1 });
  const b = setup({ hp: 1, mods: { unyieldingPowerMult: 2 } });
  a.w.checkUnyielding(); b.w.checkUnyielding();
  ok(b.w.unyielding.healRemain > a.w.unyielding.healRemain, `回復量が増える（${a.w.unyielding.healRemain.toFixed(2)} → ${b.w.unyielding.healRemain.toFixed(2)}）`);
  ok(b.w.damageReduction({}) > a.w.damageReduction({}), '軽減も増える');
  ok(b.w.damageReduction({}) < 1, '強化しても無敵にはならない（上限クランプ）');
}

// ===== 10. 死亡の記録 =====
section('10. 不屈中の死亡が統計へ残る（強すぎ / 弱すぎの判断材料）');
{
  const { w } = setup({ hp: 1 });
  w.noteDeath();
  ok(w.telemetry.deathsAfterUnyielding === 0, '未発動での死亡は数えない');
  w.checkUnyielding();
  w.noteDeath();
  ok(w.telemetry.deathsAfterUnyielding === 1, '発動中の死亡は数える');
}

// ===== 11. 不屈は passive ではなく基礎能力 =====
section('11. 不屈は passive ではなく戦士の基礎能力（passive 一覧に無い）');
{
  const ids = new Set(DATA.passives.map((p) => p.id));
  ok(!ids.has('unyielding'), 'passives.json に unyielding という passive は存在しない');
  ok(!!DATA.balance.warrior.unyielding, '不屈の数値は balance.json の warrior ブロックにある');
  const evo = DATA.evolutions.find((e) => e.id === 'unyielding_fortress');
  ok(!!evo && evo.baseSkillId === 'shield_bash', '不落の城壁（進化）は別物で、盾撃の進化である');
}

T.finish();
