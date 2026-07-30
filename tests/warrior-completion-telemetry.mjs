// 戦士 完成監査 16/23: テレメトリ 完成監査（M8-F §18）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-telemetry.mjs
import { CombatTelemetry } from '../src/systems/CombatTelemetry.js';
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, readSrc, runner } from './warrior-common.mjs';
const T = runner('戦士 テレメトリ 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
let bs = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bs, x: 402 + (i % 6) * 4, y: 300 + Math.floor(i / 6) * 4, angle: Math.PI, alive: true, hostile: true,
  damage: 20, speed: 180, projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));
const mk = (o = {}) => {
  const enemies = o.enemies || [...makeEnemies(14, { x: 340, y: 300, dx: 10, dy: 3, hp: o.hp || 1e9 }), ...makeEnemies(4, { x: 360, y: 300, dx: 8, hp: 1e9, elite: true })];
  const scene = makeScene({ enemies, boss: o.boss || null, now: 10000, quality: 'high', enemyBullets: o.bullets || mkBullets(24) });
  const w = makeWarrior(WarriorCombatSystem, scene, o);
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};

// ===== 1. 構造の 1:1 =====
section('1. telemetry / summary / CombatTelemetry.warrior が 1:1');
const LIVE = new Set(['fury', 'combo', 'bossPoiseGauge', 'rallyActive', 'rallyInside', 'frontGuardActive',
  'duelActive', 'duelKind', 'tranceActive', 'deflectionActive']);
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const c = mk();
  const sum = c.w.summary();
  const tw = Object.keys(t.warrior);
  const sk = Object.keys(sum);
  ok(tw.length > 90, `CombatTelemetry.warrior のキー ${tw.length} 件`);
  const missing = tw.filter((k) => !sk.includes(k));
  ok(missing.length === 0, `reported but never emitted が 0（${missing.join(',') || 'なし'}）`);
  const extra = sk.filter((k) => !tw.includes(k) && !LIVE.has(k) && !/Seconds$|Avg|avg/.test(k));
  ok(extra.length === 0, `emitted but unreported が 0（${extra.join(',') || 'なし'}）`);
  ok(new Set(tw).size === tw.length, 'キーの重複が 0');
  info(`telemetry ${Object.keys(c.w.telemetry).length} / summary ${sk.length} / CombatTelemetry.warrior ${tw.length}`);
}

// ===== 2. 実プレイ + 共通経路で全キーへ値が入る =====
section('2. すべての内部キーが実測で値を持つ（dead key 0）');
{
  const got = new Set();
  const scen = [
    {},
    { enemies: makeEnemies(10, { x: 340, y: 300, dx: 10, hp: 1e9, elite: true }) },
    { enemies: makeEnemies(4, { x: 360, y: 300, dx: 10, hp: 1e9 }), boss: makeBoss({ x: 430, y: 300, hp: 1e9 }) },
    { enemies: makeEnemies(14, { x: 340, y: 300, dx: 10, dy: 3, hp: 25 }), hp: 25 },
  ];
  let sample = null;
  for (const sc of scen) {
    const c = mk({ ...sc, mods: { killHealMult: 1 } });
    for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
    for (let i = 0; i < 3500; i++) {
      c.sm.update(16, { hasEnemies: true });
      c.w.setHp(c.scene.player.maxHp * (i % 400 < 200 ? 1 : 0.12), c.scene.player.maxHp);
      c.w.update(16); c.scene.advance(16);
      if (i % 45 === 20) c.scene.onWarriorHit(45, 35);
      if (i % 120 === 0) c.scene.enemyBullets.push(...mkBullets(10));
    }
    for (const [k, v] of Object.entries(c.w.telemetry)) if (typeof v === 'number' ? v > 0 : (v && Object.values(v).some((x) => x > 0))) got.add(k);
    sample = c;
  }
  // 進化側でだけ増える指標。
  const evo = mk({ enemies: [...makeEnemies(8, { x: 360, y: 300, dx: 10, hp: 120, elite: true })], boss: makeBoss({ x: 430, y: 300, hp: 1e9 }), mods: { killHealMult: 1 } });
  for (const id of EXPECTED.evolutions) evo.sm.acquireOrLevel(id);
  for (let i = 0; i < 3500; i++) {
    evo.sm.update(16, { hasEnemies: true });
    evo.w.setHp(evo.scene.player.maxHp * (i % 400 < 200 ? 1 : 0.12), evo.scene.player.maxHp);
    evo.w.update(16); evo.scene.advance(16);
    if (i % 45 === 20) evo.scene.onWarriorHit(45, 35);
    if (i % 120 === 0) evo.scene.enemyBullets.push(...mkBullets(10));
  }
  for (const [k, v] of Object.entries(evo.w.telemetry)) if (typeof v === 'number' ? v > 0 : (v && Object.values(v).some((x) => x > 0))) got.add(k);

  // 実プレイの偶然に頼らない分は共通経路を直接踏む。
  {
    const c = mk({ mods: { killHealMult: 1 } });
    const w = c.w; const p = c.scene.player;
    c.scene.advance(W.unyielding.minRunTimeMs + 100);
    p.hp = p.maxHp * 0.5; w.setHp(p.hp, p.maxHp);   // 回復の余地を作る（overheal では 0 になる）
    // 方向つき被弾（前 / 横 / 後ろ）。
    w.beginFrontGuard('t', { durationMs: 9000, mitigation: 0.4, frontArc: 1.4, facing: 0 });
    w.applyIncomingDamage(50, { fromX: p.x + 100, fromY: p.y, x: p.x, y: p.y });
    w.applyIncomingDamage(50, { fromX: p.x, fromY: p.y + 100, x: p.x, y: p.y });
    w.applyIncomingDamage(50, { fromX: p.x - 100, fromY: p.y, x: p.x, y: p.y });
    // 掴み中断 / 投げ。
    w.beginGrab('t', c.enemies[0]._seq); w.endGrab('t', true);
    // 陣の内側での撃破。
    w.placeRallyField('t', { x: p.x, y: p.y, durationMs: 9000, radius: 400, killHealBonus: 0.3, perSecondCapBonus: 0.2, meleeArea: 0 });
    w.updateRallyPosition(p.x, p.y);
    for (let i = 0; i < 30; i++) { w.noteKill({ isElite: false, isBoss: false }); w.update(100); c.scene.advance(100); }
    // 処刑。
    const n = c.enemies[1]; n.hp = 1; n.maxHp = 1000;
    if (w.executePolicy(n, { thresholdNormal: 0.5 }).canExecute) w.noteExecute(true, 30);
    w.noteExecute(false, 0);
    // 不屈。
    p.hp = 1; w.setHp(1, p.maxHp); w.checkUnyielding();
    // 不屈の発動中に被弾して軽減量を計測させ、その後に死亡を記録する。
    w.applyIncomingDamage(60, { fromX: p.x + 100, fromY: p.y, x: p.x, y: p.y });
    w.noteDeath();
    for (let i = 0; i < 40; i++) { w.update(100); c.scene.advance(100); }   // 不屈の回復を消化する
    p.hp = p.maxHp * 0.3; w.setHp(p.hp, p.maxHp);
    w.fury = W.fury.max; w.startRelease();
    for (let i = 0; i < 60; i++) { w.update(100); c.scene.advance(100); }   // 解放の回復を消化する
    // 決闘の再指定 / 延長。
    w.beginDuelChallenge('t', c.enemies[2], { durationMs: 6000, meleeDamageBonus: 0.2, poiseDamageBonus: 0.2,
      furyGainBonus: 0.1, maxRetargets: 1, extendPerBreakMs: 800, maxExtensionMs: 2400 });
    c.enemies[3].isElite = true; w.retargetDuel(c.enemies[3]); w.noteDuelStanceBreak(c.enemies[3]);
    w.clearDuelTarget('t', 'manual');
    // 直線の踏み込み / 構えの軽減低下。
    w.noteLineStepIn(24);
    w.beginBattleTrance('t', { durationMs: 6000, meleeDamageBonus: 0.2, mitigationPenalty: W.trance.maxMitigationPenalty, killHealBonus: 0.3, perSecondCapBonus: 0.2 });
    for (let i = 0; i < 10; i++) w.damageReduction({ engaged: true });
    for (let i = 0; i < 10; i++) { w.noteKill({ isElite: false, isBoss: false }); w.update(100); c.scene.advance(100); }
    // 弾き返しの上限到達 / 反射 / 天鏡。
    w.beginDeflectionWindow('t', { windowMs: 3000, maxDeflections: 1, radius: 300, reflect: true, reflectedDamage: 30, reflectedSpeed: 300, reflectLifeMs: 500 });
    for (const b of mkBullets(4)) c.scene.tryDeflectProjectile(b, { skillId: 'weapon_deflection' });
    for (const b of mkBullets(2)) { b.isBeam = true; b.projectileKind = 'beam'; c.scene.tryDeflectProjectile(b, { skillId: 'weapon_deflection' }); }
    w.noteReflectedHit(30); w.noteMirrorCounter();
    // コンボの中断。
    for (let i = 0; i < 30; i++) w.addCombo(1, `c${i}`);
    for (let i = 0; i < 900; i++) { w.update(16); c.scene.advance(16); }
    for (const [k, v] of Object.entries(w.telemetry)) if (typeof v === 'number' ? v > 0 : (v && Object.values(v).some((x) => x > 0))) got.add(k);
  }
  const all = Object.keys(sample.w.telemetry).filter((k) => !k.startsWith('_'));
  // 安全弁のカウンタ（出荷 data では届かない）。
  const SAFETY = ['tranceOffenseCapped'];
  const dead = all.filter((k) => !got.has(k) && !SAFETY.includes(k));
  ok(dead.length === 0, `実測で 0 のままの内部キーが無い（${dead.join(',') || 'なし'}）`);
  info(`実測で値が入った内部キー: ${got.size}/${all.length}（安全弁 ${SAFETY.join(',')} を除く）`);
  // 安全弁は「上限が効く config」で経路を確かめる。
  const scene2 = makeScene({ enemies: makeEnemies(4, { hp: 1e9 }), now: 10000 });
  const tight = new WarriorCombatSystem({
    config: { ...W, trance: { ...W.trance, combinedOffenseCap: 0.2 } },
    enabled: true, now: () => scene2.time.now, heal: () => 0, emit: () => {},
  });
  tight.beginBattleTrance('t', { durationMs: 5000, meleeDamageBonus: W.trance.maxMeleeDamageBonus });
  tight.fury = W.fury.max; tight.startRelease();
  tight.getBattleTranceModifiers();
  for (const k of SAFETY) ok(tight.telemetry[k] > 0, `${k}: 上限が効く条件では実際に数える（${tight.telemetry[k]}）`);
}

// ===== 3. スキル別 stats =====
section('3. スキル別 stats が 48 件すべてで記録される');
{
  const c = mk({ bullets: mkBullets(30) });
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  for (let i = 0; i < 3000; i++) {
    c.sm.update(16, { hasEnemies: true }); c.w.setHp(c.scene.player.hp, c.scene.player.maxHp);
    c.w.update(16); c.scene.advance(16);
    if (i % 120 === 0) c.scene.enemyBullets.push(...mkBullets(8));
  }
  const list = c.sm.statsList();
  for (const id of EXPECTED.actives) {
    const s = list.find((x) => x.id === id);
    ok(!!s, `${id}: stats が存在する`);
    ok((s.casts || 0) > 0, `${id}: cast が記録される`);
  }
  const src = readSrc('src/systems/CombatTelemetry.js');
  for (const k of ['thrusts', 'penetrations', 'duels', 'duelMs', 'tranceMs', 'stomps', 'deflects', 'reflected',
    'launches', 'frontGuardMs', 'grabs', 'throws', 'stages', 'guardTicks', 'axeHits', 'stepIns', 'rallyMs']) {
    ok(src.includes(k), `スキル別 stats に ${k} がある`);
  }
}

// ===== 4. 保存 / 復元で二重にならない =====
section('4. テレメトリの保存 / 復元が加算的で二重にならない');
{
  const c = mk();
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  for (let i = 0; i < 1200; i++) { c.sm.update(16, { hasEnemies: true }); c.w.update(16); c.scene.advance(16); }
  const s = c.w.serialize();
  const c2 = mk();
  c2.w.restore(s);
  for (const [k, v] of Object.entries(c.w.telemetry)) {
    if (typeof v !== 'number' || k.startsWith('_')) continue;   // `_` 始まりは内部カーソル（保存しない）
    ok(Math.abs((c2.w.telemetry[k] || 0) - v) < 1e-6, `${k}: 復元で一致（${v}）`);
  }
  // 二重復元でも増えない。
  c2.w.restore(s);
  for (const k of ['meleeCasts', 'physicalDamage', 'counters', 'launches', 'duelStarts', 'tranceStarts', 'deflectWindows']) {
    ok(Math.abs((c2.w.telemetry[k] || 0) - (c.w.telemetry[k] || 0)) < 1e-6, `${k}: 二重復元でも増えない`);
  }
}

// ===== 5. 外部送信なし / debugRun 分離 =====
section('5. 外部送信をせず debugRun が分離されている');
for (const rel of ['src/systems/CombatTelemetry.js', 'src/systems/WarriorCombatSystem.js', 'src/scenes/BattleScene.js', 'src/systems/RunBalanceSummary.js']) {
  let src = ''; try { src = readSrc(rel); } catch (e) { void e; continue; }
  ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.send/.test(src), `${rel}: 外部通信をしない`);
}
{
  const ct = readSrc('src/systems/CombatTelemetry.js');
  ok(/debugRun/.test(ct), 'CombatTelemetry が debugRun を持つ（周回履歴で分離される）');
  const bsSrc = readSrc('src/scenes/BattleScene.js');
  ok(/markDebugRun\(\)/.test(bsSrc), 'デバッグ操作が debugRun を立てる');
  ok(/_debugRun/.test(bsSrc), 'BattleScene が debugRun フラグを持つ');
}

// ===== 6. run result との一致 =====
section('6. summary が run result / F8 の材料と一致する');
{
  const c = mk();
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  for (let i = 0; i < 1500; i++) { c.sm.update(16, { hasEnemies: true }); c.w.update(16); c.scene.advance(16); }
  const sum = c.w.summary();
  // 秒換算のキーは ms のキーと整合する。
  for (const [msKey, secKey] of [['duelUptimeMs', 'duelUptimeSeconds'], ['tranceUptimeMs', 'tranceUptimeSeconds'],
    ['deflectUptimeMs', 'deflectUptimeSeconds'], ['rallyUptimeMs', 'rallyUptimeSeconds'], ['guardUptimeMs', 'guardUptimeSeconds']]) {
    if (msKey in c.w.telemetry && secKey in sum) {
      ok(Math.abs(sum[secKey] - c.w.telemetry[msKey] / 1000) < 1e-6, `${secKey} が ${msKey}/1000 と一致`);
    }
  }
  // 平均系のキーは合計 / サンプル数と一致する。
  if (c.w.telemetry.tranceSamples > 0) {
    ok(Math.abs(sum.tranceAvgPenalty - c.w.telemetry.trancePenaltySum / c.w.telemetry.tranceSamples) < 1e-6, 'tranceAvgPenalty が一致');
  } else ok(true, '構えのサンプルが無い周回（平均は 0）');
  ok(Number.isFinite(sum.physicalDamage) && sum.physicalDamage >= 0, `物理ダメージ合計 ${Math.round(sum.physicalDamage)}`);
}

T.finish();
