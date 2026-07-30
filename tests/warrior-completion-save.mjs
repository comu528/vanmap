// 戦士 完成監査 20/23: save / old save / folder save（M8-F §22）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-save.mjs
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, readSrc, runner } from './warrior-common.mjs';
const T = runner('戦士 save / old save 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
let bs = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bs, x: 402 + i * 3, y: 300, angle: Math.PI, alive: true, hostile: true, damage: 20, speed: 180,
  projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));
const mk = (o = {}) => {
  const enemies = o.enemies || makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: o.boss || null, now: 10000, quality: 'high', enemyBullets: mkBullets(12) });
  const w = makeWarrior(WarriorCombatSystem, scene, o);
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    c.sm.update(step, { hasEnemies: true }); c.w.setHp(c.scene.player.hp, c.scene.player.maxHp);
    c.w.update(step); c.scene.advance(step);
    if (i % 60 === 30) c.scene.onWarriorHit(40, 30);
  }
};

// ===== 1. save_version =====
section('1. save_version は v6 のまま（加算のみ）');
{
  ok(DATA.balance.saveVersion === 6, `saveVersion ${DATA.balance.saveVersion} = 6`);
  const boot = readSrc('src/scenes/BootScene.js');
  ok(boot.includes('DataManager.balance.saveVersion'), 'BootScene が data の saveVersion を使う');
  const sm = readSrc('src/systems/SaveManager.js');
  ok(/migrat|version/i.test(sm), 'SaveManager が版管理 / 移行の経路を持つ');
  // M8-F では保存キーを 1 つも増やしていない。
  const w = readSrc('src/systems/WarriorCombatSystem.js');
  const buffKeys = (w.match(/serializeTimedBuffs\(\)\s*\{[\s\S]*?\n  \}/) || [''])[0];
  for (const k of ['warCry', 'counterWindows', 'frontGuard', 'rallyField', 'duel', 'trance', 'deflection']) {
    ok(buffKeys.includes(k), `timedBuffs に ${k} がある（M8-E から増減なし）`);
  }
}

// ===== 2. warriorState の往復 =====
section('2. warriorState が完全に往復する');
{
  const c = mk({ boss: makeBoss({ x: 470, y: 300, hp: 1e9 }), mods: { killHealMult: 1 } });
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  run(c, 12000);
  const s = c.w.serialize();
  ok(!!s && typeof s === 'object', 'serialize がオブジェクトを返す');
  const c2 = mk();
  c2.w.restore(s);
  for (const k of ['fury', 'combo', 'comboGraceLeftMs', 'releaseLeftMs']) {
    if (typeof c.w[k] === 'number') ok(Math.abs(c2.w[k] - c.w[k]) < 1e-6, `${k}: 一致（${c.w[k].toFixed(2)}）`);
  }
  ok(c2.w.unyielding.cooldownLeftMs === c.w.unyielding.cooldownLeftMs, '不屈 CD が一致');
  ok(c2.w.unyielding.triggers === c.w.unyielding.triggers, '不屈の発動回数が一致');
  ok(Math.abs(c2.w.bossPoise.gauge - c.w.bossPoise.gauge) < 1e-6, 'ボス体勢ゲージが一致');
  ok(c2.w.bossPoise.breaks === c.w.bossPoise.breaks, 'ボス崩し回数が一致');
  // 保存に敵 / 弾のオブジェクトが入らない。
  const json = JSON.stringify(s);
  for (const bad of ['"maxHp"', '"alive"', '"def":', '"projectileKind"', '"body"', '"texture"']) {
    ok(!json.includes(bad), `${bad} を保存しない`);
  }
}

// ===== 3. 復元で稼げない =====
section('3. 復元で闘気 / コンボ / CD / 窓を稼げない');
{
  const c = mk();
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  run(c, 8000);
  const s = c.w.serialize();
  const skStates = {};
  for (const id of EXPECTED.actives) skStates[id] = c.sm.skills.get(id).serializeState();
  // 10 回復元しても増えない。
  const c2 = mk();
  for (const id of EXPECTED.actives) { c2.sm.acquireOrLevel(id); c2.sm.setLevel(id, 8); }
  for (let i = 0; i < 10; i++) {
    c2.w.restore(s);
    for (const id of EXPECTED.actives) c2.sm.skills.get(id).restoreState(skStates[id]);
  }
  ok(Math.abs(c2.w.fury - c.w.fury) < 1e-6, `闘気が積み上がらない（${c2.w.fury.toFixed(2)}）`);
  ok(Math.abs(c2.w.combo - c.w.combo) < 1e-6, `コンボが積み上がらない（${c2.w.combo.toFixed(2)}）`);
  for (const k of ['furyReleases', 'duelStarts', 'tranceStarts', 'deflectWindows', 'rallyPlacements', 'unyieldingTriggers']) {
    ok(Math.abs((c2.w.telemetry[k] || 0) - (c.w.telemetry[k] || 0)) < 1e-6, `${k}: 10 回復元でも増えない`);
  }
  // CD もリセットされない。
  for (const id of EXPECTED.actives) {
    const want = skStates[id].cdLeft;
    ok(Math.abs(c2.sm.skills.get(id)._cd - want) < 1e-6, `${id}: CD が保存値のまま`);
  }
}

// ===== 4. 旧セーブ / 欠落 / 不明キー =====
section('4. 旧セーブ・欠落・不明キー・破損値で落ちない');
{
  const BADS = [null, undefined, {}, 0, '', [], { fury: undefined }, { unknown: 1 },
    { fury: 'x', combo: 'y' }, { fury: NaN, combo: Infinity }, { fury: -1e9, combo: -1e9 },
    { timedBuffs: null }, { timedBuffs: 'x' }, { timedBuffs: { duel: 'x', trance: 1, deflection: [] } },
    { unyielding: null }, { unyielding: { cooldownLeftMs: NaN, triggers: -5 } },
    { bossPoise: { gauge: NaN, breaks: -1, thresholdMult: 0 } },
    { telemetry: null }, { telemetry: 'x' }, { telemetry: { meleeCasts: NaN } }];
  for (const bad of BADS) {
    const c = mk();
    let threw = false;
    try { c.w.restore(bad); } catch (e) { threw = true; info(`restore(${JSON.stringify(bad)}) で例外: ${e.message}`); }
    ok(!threw, `restore(${JSON.stringify(bad)}) が例外にならない`);
    ok(Number.isFinite(c.w.fury) && c.w.fury >= 0 && c.w.fury <= W.fury.max, `闘気が健全（${c.w.fury}）`);
    ok(Number.isFinite(c.w.combo) && c.w.combo >= 0, `コンボが健全（${c.w.combo}）`);
    ok(Number.isFinite(c.w.unyielding.cooldownLeftMs) && c.w.unyielding.cooldownLeftMs >= 0, '不屈 CD が健全');
    ok(Number.isFinite(c.w.bossPoise.gauge) && c.w.bossPoise.gauge >= 0, 'ボス体勢が健全');
    // 復元後も 1 フレーム回せる。
    let threw2 = false;
    try { run(c, 200); } catch (e) { threw2 = true; info(`復元後の update で例外: ${e.message}`); }
    ok(!threw2, '復元後に update しても落ちない');
  }
}

// ===== 5. timedBuffs の上限クランプ =====
section('5. 改ざんされた timedBuffs が balance の上限を超えない');
{
  const c = mk();
  c.w.restoreTimedBuffs({
    warCry: { leftMs: 1e9, meleeDamageBonus: 9, furyGainBonus: 9, comboGraceBonus: 9 },
    counterWindows: [{ source: 'x', leftMs: 1e9, used: -5, max: 999, priority: 99, mitigation: 9 }],
    frontGuard: { leftMs: 1e9, mitigation: 9, arc: 9, facing: 0, source: 'x' },
    rallyField: { leftMs: 1e9, x: 0, y: 0, radius: 1e9, comboGrace: 9, furyGain: 9, mitigation: 9, meleeArea: 9, killHealBonus: 9, perSecondCapBonus: 9, source: 'x' },
    duel: { seq: 7, kind: 'boss', leftMs: 1e9, meleeDamageBonus: 9, poiseDamageBonus: 9, furyGainBonus: 9, maxRetargets: 99, maxExtensionMs: 1e9, source: 'x' },
    trance: { leftMs: 1e9, meleeDamageBonus: 9, attackSpeedBonus: 9, comboGraceBonus: 9, furyGainBonus: 9, mitigationPenalty: 9, killHealBonus: 9, perSecondCapBonus: 9, source: 'x' },
    deflection: { leftMs: 1e9, used: -5, max: 999, radius: 1e9, reflect: true, reflectedDamage: 1e9, reflectedSpeed: 1e9, reflectLifeMs: 1e9, poiseDamage: 1e9, source: 'x' },
  });
  const w = c.w;
  ok(w.duelLeftMs <= W.duel.maxDurationMs + 1e-9, `決闘の持続が上限内（${w.duelLeftMs}）`);
  ok(w.duelBonus('meleeDamage') <= W.duel.maxMeleeDamageBonus + 1e-9, '決闘の補正が上限内');
  ok(w.tranceLeftMs <= W.trance.maxDurationMs + 1e-9, `構えの持続が上限内（${w.tranceLeftMs}）`);
  const tm = w.getBattleTranceModifiers();
  ok(tm.meleeDamage <= W.trance.maxMeleeDamageBonus + 1e-9, '構えの補正が上限内');
  ok(tm.mitigationPenalty <= W.trance.maxMitigationPenalty + 1e-9, '構えの軽減低下が上限内');
  ok(w.deflectLeftMs <= W.deflection.maxWindowMs + 1e-9, `弾き窓が上限内（${w.deflectLeftMs}）`);
  ok(w.deflectMax <= W.deflection.maxDeflectionsPerWindow, `弾ける数が上限内（${w.deflectMax}）`);
  ok(w.deflectUsed >= 0, '使用済み回数が負にならない');
  ok(w.frontGuard.mitigation <= W.frontalGuard.maxFrontalMitigation + 1e-9, '前面軽減が上限内');
  ok(w.rallyField.leftMs <= W.rally.maxDurationMs + 1e-9, '陣の持続が上限内');
  ok(w.rallyField.radius <= W.rally.maxRadius + 1e-9, `陣の半径が上限内（${w.rallyField.radius} ≤ ${W.rally.maxRadius}）`);
  ok(w.damageReduction({ engaged: true, fromX: 1, fromY: 0, x: 0, y: 0 }) <= W.mitigation.maxTotalReduction + 1e-9,
    '復元後も合計軽減が上限を超えない');
  ok(w.damageReduction({ engaged: true }) >= 0, '復元後も軽減が負にならない');
  // 反撃窓も上限内。
  for (const [, cw] of w.counterWindows) {
    ok(cw.max <= W.counter.maxCountersPerWindow && cw.used >= 0, `反撃窓の回数が上限内（max ${cw.max} ≤ ${W.counter.maxCountersPerWindow} / used ${cw.used}）`);
    ok(cw.leftMs <= W.counter.maxWindowMs + 1e-9, `反撃窓の持続が上限内（${cw.leftMs} ≤ ${W.counter.maxWindowMs}）`);
  }
}

// ===== 6. 火 / 氷の保存が非回帰 =====
section('6. 火 / 氷の保存経路を変えていない');
{
  const sm = readSrc('src/systems/SaveManager.js');
  for (const k of ['duel', 'trance', 'deflect', 'march', 'lineThrust']) {
    ok(!new RegExp(k, 'i').test(sm), `SaveManager に ${k} 固有のキーを足していない（warriorState 配下で完結）`);
  }
  const sc = readSrc('src/storage/SaveCoordinator.js');
  ok(!/warrior/i.test(sc), 'SaveCoordinator に戦士固有の記述が無い');
  // active_run の形は 3 ジョブ共通。
  const bsSrc = readSrc('src/scenes/BattleScene.js');
  ok(/warriorState/.test(bsSrc), 'warriorState は active_run の 1 キーにまとまっている');
  ok(/jobId/.test(bsSrc) && /skillRuntime/.test(bsSrc), 'active_run の既存キーが残っている');
}

// ===== 7. folder save / import / export / backup / multitab =====
section('7. folder save / import / export / backup / 競合 / multi-tab が戦士でも同じ経路');
{
  const sm = readSrc('src/systems/SaveManager.js');
  for (const k of ['export', 'import', 'backup']) ok(new RegExp(k, 'i').test(sm), `SaveManager が ${k} を持つ`);
  const sc = readSrc('src/storage/SaveCoordinator.js');
  ok(/conflict|resolve|tab/i.test(sc), 'SaveCoordinator が競合 / multi-tab を扱う');
  // 戦士固有の分岐が無い（3 ジョブ共通経路）。
  ok(!/warrior/i.test(sm), 'SaveManager に戦士固有の分岐が無い');
}

// ===== 8. 進化前後を同時に持たない =====
section('8. 復元で進化前後を同時に持たない');
{
  const c = mk();
  c.sm.acquireOrLevel('great_cleave'); c.sm.setLevel('great_cleave', 8);
  const evoId = c.sm.evolve('great_cleave');
  ok(evoId === 'thousand_blade_dance', '進化する');
  ok(!c.sm.skills.has('great_cleave'), 'base が消える');
  ok(c.sm.evolvedBaseIds.includes('great_cleave'), '進化済み base が記録される');
  // 復元でも base が戻らない。
  const c2 = mk();
  c2.sm.restoreEvolved(c.sm.evolvedBaseIds);
  c2.sm.acquireOrLevel(evoId);
  ok(!c2.sm.skills.has('great_cleave'), '復元後も base を持たない');
  ok(c2.sm.hasEvolved('great_cleave'), '復元後も進化済みと分かる');
  // 進化済み base は抽選へも戻らない。
  const { SkillDraftManager } = await import('../src/systems/SkillDraftManager.js');
  const { draftCatalog, jobPools, seedRange } = await import('./warrior-common.mjs');
  let reoffered = 0;
  for (const seed of seedRange(60)) {
    const d = new SkillDraftManager({});
    const cands = d._generate({ catalog: draftCatalog(), job: jobPools('warrior'),
      owned: { active: { [evoId]: 1 }, passive: {} }, evolvedBaseIds: c.sm.evolvedBaseIds,
      slots: { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, seed);
    reoffered += cands.filter((x) => x.id === 'great_cleave').length;
  }
  ok(reoffered === 0, `進化済み base が抽選へ戻らない（${reoffered}）`);
}

T.finish();
