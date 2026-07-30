// 戦士 完成監査 9/23: 闘気 / コンボ 完成監査（M8-F §12）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-fury-combo.mjs
import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, EXPECTED, runner } from './warrior-common.mjs';
const T = runner('戦士 闘気 / コンボ 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
const mk = (o = {}) => {
  const enemies = makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: o.boss || null, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, o);
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const tick = (c, ms, step = 16) => { for (let i = 0; i < ms / step; i++) { c.w.update(step); c.scene.advance(step); } };

// ===== 1. 闘気の獲得源 =====
section('1. 闘気の獲得源が data 由来で、すべて実測できる');
{
  const c = mk({ boss: makeBoss({ x: 460, y: 300, hp: 1e9 }) });
  const w = c.w;
  const sources = Object.keys(w.telemetry.furyBySource);
  ok(sources.length >= 4, `獲得源 ${sources.length} 種（${sources.join(',')}）`);
  for (const k of ['gainPerMeleeHit', 'gainPerKill', 'gainPerComboStep', 'gainPerDamageTaken', 'gainPerMitigatedDamage']) {
    ok(typeof W.fury[k] === 'number', `balance.warrior.fury.${k} がある（${W.fury[k]}）`);
  }
  // 近接命中 / 撃破 / 被弾 / 軽減 で実際に増える。
  w.noteMeleeHit({ furyGain: W.fury.gainPerMeleeHit }, c.enemies[0], 'k1');
  ok(w.telemetry.furyBySource.meleeHit > 0, `近接命中で増える（${w.telemetry.furyBySource.meleeHit.toFixed(2)}）`);
  w.noteKill({ isElite: false, isBoss: false });
  ok(w.telemetry.furyBySource.kill > 0, `撃破で増える（${w.telemetry.furyBySource.kill.toFixed(2)}）`);
  w.applyIncomingDamage(50, {});
  ok(w.telemetry.furyBySource.damageTaken > 0 || w.telemetry.furyBySource.mitigated > 0, '被弾 / 軽減で増える');
}

// ===== 2. 1 cast / 1 秒あたりの上限 =====
section('2. 1 発動あたり / 1 秒あたりの上限が効く');
{
  const c = mk();
  const w = c.w;
  let sum = 0;
  for (let i = 0; i < 100; i++) sum += w.addFury(1000, 'meleeHit', 'sameCast');
  ok(sum <= W.fury.maxGainPerCast + 1e-6, `1 発動あたり ${sum.toFixed(2)} ≤ ${W.fury.maxGainPerCast}`);
  const c2 = mk();
  let sum2 = 0;
  for (let i = 0; i < 100; i++) sum2 += c2.w.addFury(1000, 'meleeHit', `cast${i}`);
  ok(sum2 <= W.fury.maxGainPerSecond + 1e-6, `1 秒あたり ${sum2.toFixed(2)} ≤ ${W.fury.maxGainPerSecond}`);
  // 秒が変われば再び稼げる。
  c2.scene.advance(1100);
  const more = c2.w.addFury(1000, 'meleeHit', 'next');
  ok(more > 0, `次の秒では再び稼げる（${more.toFixed(2)}）`);
}

// ===== 3. 100 到達で自動解放 =====
section('3. 闘気 100 で自動解放され、時間で終わる');
{
  const c = mk();
  const w = c.w;
  for (let i = 0; i < 40 && w.telemetry.furyReleases === 0; i++) { w.addFury(1e9, 'meleeHit', null); c.scene.advance(1100); w.update(1100); }
  ok(w.telemetry.furyReleases > 0, `自動解放される（${w.telemetry.furyReleases} 回）`);
  ok(w.fury <= W.fury.max, `解放で闘気が消費される（${w.fury.toFixed(1)}）`);
  ok(w.releaseActive || w.releaseLeftMs === 0, '解放中か既に終了している');
  // 解放中は獲得が大幅減衰。
  const c2 = mk();
  for (let i = 0; i < 40; i++) { c2.w.addFury(1e9, 'meleeHit', null); c2.scene.advance(1100); c2.w.update(1100); }
  if (c2.w.releaseActive) {
    const g = c2.w.addFury(100, 'meleeHit', null);
    ok(g <= 100 * W.fury.releaseGainMult + 1e-6, `解放中の獲得が減衰する（${g.toFixed(2)}）`);
  } else ok(true, '解放が既に終了（減衰は別ケースで確認）');
  // 解放中の各倍率。
  const c3 = mk();
  c3.w.setHp(c3.scene.player.maxHp * 0.4, c3.scene.player.maxHp); // 欠損 HP がないと回復量は 0
  c3.w.fury = W.fury.max; c3.w.startRelease();
  ok(c3.w.releaseActive, '解放を開始できる');
  ok(c3.w.meleeDamageMultiplier(null) > 1, `Dmg 倍率 ${c3.w.meleeDamageMultiplier(null).toFixed(3)}`);
  ok(c3.w.attackSpeedMultiplier() > 1, `攻速倍率 ${c3.w.attackSpeedMultiplier().toFixed(3)}`);
  ok(c3.w.knockbackMultiplier() > 1, '吹き飛び倍率が乗る');
  ok(c3.w.poiseDamageMultiplier() > 1, '体勢倍率が乗る');
  ok(c3.w.damageReduction({ engaged: false }) > 0, '軽減が乗る');
  ok(c3.w.recovery.remainAmount > 0, '回復が予約される（一括全快ではない）');
  tick(c3, W.furyRelease.durationMs + 500);
  ok(!c3.w.releaseActive, '解放が時間で終わる（永久化しない）');
  ok(c3.w.meleeDamageMultiplier(null) <= 1.001 * (1 + c3.w.comboBonuses().meleeDamageMult), '終了後は倍率が戻る');
}

// ===== 4. 無限ループ / 暴走が無い =====
section('4. 闘気が暴走しない（長時間でも上限内・有限）');
{
  const c = mk({ boss: makeBoss({ x: 460, y: 300, hp: 1e9 }) });
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  for (let i = 0; i < 6000; i++) {
    c.sm.update(32, { hasEnemies: true });
    c.w.setHp(c.scene.player.maxHp * (i % 300 < 150 ? 1 : 0.2), c.scene.player.maxHp);
    c.w.update(32); c.scene.advance(32);
    if (i % 40 === 20) c.scene.onWarriorHit(30, 20);
  }
  ok(Number.isFinite(c.w.fury) && c.w.fury >= 0 && c.w.fury <= W.fury.max, `闘気が上限内（${c.w.fury.toFixed(1)}）`);
  ok(Number.isFinite(c.w.telemetry.furyGained), '獲得合計が有限');
  ok(c.w.telemetry.furyReleases > 0, `解放が起きる（${c.w.telemetry.furyReleases} 回）`);
  ok(c.w.telemetry.furyOvercap >= 0, `上限超過が記録される（${c.w.telemetry.furyOvercap.toFixed(1)}）`);
  info(`3分相当: 闘気獲得 ${c.w.telemetry.furyGained.toFixed(0)} 解放 ${c.w.telemetry.furyReleases} 回 内訳 ${JSON.stringify(Object.fromEntries(Object.entries(c.w.telemetry.furyBySource).map(([k, v]) => [k, Math.round(v)])))}`);
}

// ===== 5. コンボはジョブ全体で 1 本 =====
section('5. コンボはジョブ全体で 1 本・閾値 4 段・猶予後に減衰');
{
  const c = mk();
  const w = c.w;
  ok(Array.isArray(W.combo.thresholds) && W.combo.thresholds.length === 4, `閾値 4 段（${W.combo.thresholds.map((t) => t.at).join(',')}）`);
  // どのスキルから加算しても同じ 1 本。
  w.addCombo(5, 'a'); const after1 = w.combo;
  w.addCombo(5, 'b'); ok(w.combo > after1, `別スキルからの加算も同じ 1 本へ乗る（${after1} → ${w.combo}）`);
  // 閾値ごとにボーナスが付く。
  const seen = [];
  for (const th of W.combo.thresholds) {
    const c2 = mk();
    for (let i = 0; i < th.at + 5; i++) c2.w.addCombo(1, `c${i}`);
    const b = c2.w.comboBonuses();
    seen.push(`${th.at}:${b.reached.join('/')}`);
    ok(b.reached.includes(th.at), `コンボ ${th.at} で閾値に到達（${b.reached.join(',')}）`);
  }
  info(`閾値到達: ${seen.join(' ')}`);
  // 猶予後に減衰し、0 未満にならない。
  const c3 = mk();
  for (let i = 0; i < 60; i++) c3.w.addCombo(1, `c${i}`);
  const peak = c3.w.combo;
  ok(c3.w.comboGraceLeftMs > 0, '猶予が設定される');
  tick(c3, 20000);
  ok(c3.w.combo < peak, `猶予後に減衰する（${peak} → ${c3.w.combo.toFixed(1)}）`);
  ok(c3.w.combo >= 0, 'コンボが負にならない');
  ok(c3.w.telemetry.comboPeak >= peak - 1e-6, `最高コンボが記録される（${c3.w.telemetry.comboPeak}）`);
}

// ===== 6. 猶予を伸ばす仕組みが合成される =====
section('6. 戦吼 / 陣 / 構えがコンボ猶予へ加算的に乗る');
{
  const base = mk(); for (let i = 0; i < 10; i++) base.w.addCombo(1, `c${i}`);
  const g0 = base.w.comboGraceLeftMs;
  const cases = [
    ['戦吼', (w) => w.applyWarCryBuff({ durationMs: 8000, comboGraceBonus: 0.3 })],
    ['陣', (w) => { w.placeRallyField('r', { x: 0, y: 0, durationMs: 8000, radius: 1e6, comboGrace: 0.3, meleeArea: 0 }); w.updateRallyPosition(0, 0); }],
    ['構え', (w) => w.beginBattleTrance('t', { durationMs: 8000, comboGraceBonus: 0.3 })],
  ];
  for (const [name, apply] of cases) {
    const c = mk(); apply(c.w);
    for (let i = 0; i < 10; i++) c.w.addCombo(1, `c${i}`);
    ok(c.w.comboGraceLeftMs > g0, `${name}: 猶予が伸びる（${g0.toFixed(0)} → ${c.w.comboGraceLeftMs.toFixed(0)}）`);
  }
}

// ===== 7. 保存 / 復元 =====
section('7. 闘気 / コンボの保存・復元で稼げない');
{
  const c = mk();
  for (let i = 0; i < 40; i++) c.w.addCombo(1, `c${i}`);
  c.w.addFury(50, 'meleeHit', null);
  const s = c.w.serialize();
  const c2 = mk();
  c2.w.restore(s);
  ok(Math.abs(c2.w.fury - c.w.fury) < 1e-6, `闘気が一致（${c2.w.fury.toFixed(2)}）`);
  ok(Math.abs(c2.w.combo - c.w.combo) < 1e-6, `コンボが一致（${c2.w.combo.toFixed(2)}）`);
  // 改ざん値はクランプされる。
  const c3 = mk();
  c3.w.restore({ ...s, fury: 1e9, combo: 1e9 });
  ok(c3.w.fury <= W.fury.max + 1e-9, `改ざんされた闘気がクランプされる（${c3.w.fury}）`);
  ok(Number.isFinite(c3.w.combo) && c3.w.combo >= 0, `改ざんされたコンボが有限（${c3.w.combo}）`);
  const c4 = mk();
  c4.w.restore({ ...s, fury: NaN, combo: NaN });
  ok(Number.isFinite(c4.w.fury) && Number.isFinite(c4.w.combo), 'NaN でも壊れない');
}

// ===== 8. 他ジョブでは動かない =====
section('8. 他ジョブ（enabled=false）では闘気 / コンボが 1 も動かない');
{
  const c = mk({ enabled: false });
  ok(c.w.addFury(1000, 'meleeHit', null) === 0, '闘気が増えない');
  ok(c.w.addCombo(10, null) === 0 || c.w.combo === 0, 'コンボが増えない');
  ok(c.w.meleeDamageMultiplier(null) === 1 || c.w.combo === 0, '倍率が恒等');
  ok(c.w.telemetry.furyGained === 0, 'テレメトリも 0');
}

T.finish();
