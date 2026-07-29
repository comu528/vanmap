// 戦士 最終Wave 11/16: ランタイム状態の保存 / 復元（M8-E §保存）。Node.js 標準機能のみ。
//   - M8-E の 10 スキルすべてが serializeState / restoreState を持ち、CD を保存する
//   - 敵 / 弾のオブジェクト参照を 1 つも保存しない
//   - 決闘 / 構え / 弾き窓は WarriorCombatSystem 側が上限つきで復元する
//   - 復元でテレメトリが水増しされない・無料の効果が出ない
//   - save_version は v6 のまま（追加は加算的）
// 実行: node tests/warrior-final-runtime-save.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 最終Wave ランタイム保存 / 復元（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const FINAL = [...EXPECTED.finalActives, ...EXPECTED.finalEvolutions];

let bulletSeq = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bulletSeq, x: 402 + i * 3, y: 300, angle: Math.PI, alive: true, hostile: true,
  damage: 20, speed: 180, projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 340, y: 300, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: 'high', enemyBullets: opts.bullets || mkBullets(8) });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 8000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};

// ===== 1. CD の保存 / 復元 =====
section('1. M8-E の 10 スキルすべてが CD を保存 / 復元する');
for (const id of FINAL) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  const sk = ctx.sm.skills.get(id);
  ok(typeof sk.serializeState === 'function', `${id}: serializeState がある`);
  ok(typeof sk.restoreState === 'function', `${id}: restoreState がある`);
  const s = sk.serializeState();
  ok(typeof s.cdLeft === 'number', `${id}: cdLeft を保存する`);
  sk.restoreState({ cdLeft: 1234 });
  ok(sk._cd === 1234, `${id}: cdLeft を復元する`);
}

// ===== 2. オブジェクト参照を保存しない =====
section('2. 敵 / 弾のオブジェクト参照を 1 つも保存しない');
{
  const FORBIDDEN = ['x', 'y', 'angle', 'moved', 'target', 'enemy', 'seq', 'bullets', 'projectiles', 'deflectedIds', 'plan', 'castKey'];
  for (const id of FINAL) {
    const ctx = build();
    ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
    run(ctx, 6000);
    const s = ctx.sm.skills.get(id).serializeState() || {};
    for (const k of FORBIDDEN) ok(!(k in s), `${id}: ${k} を保存しない`);
    for (const v of Object.values(s)) {
      ok(v === null || (typeof v !== 'object' && typeof v !== 'function'), `${id}: 保存値が単純な値`);
    }
  }
}

// ===== 3. 復元で二重再生しない =====
section('3. 復元で進行中の効果が二重に再生されない');
for (const id of FINAL) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  run(ctx, 5000);
  const sk = ctx.sm.skills.get(id);
  const s = sk.serializeState();
  const before = ctx.scene.calls.length;
  sk.restoreState({ ...s, cdLeft: 99999 });
  for (let i = 0; i < 150; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  // 弾き返しだけは「残った window の継続」で弾を弾き続ける（継続であって二重化ではない）。
  const allowResume = id === 'weapon_deflection' || id === 'heaven_mirror_reversal';
  const grew = ctx.scene.calls.length - before;
  ok(allowResume || grew === 0, `${id}: 復元後に無料の効果が出ない（増分 ${grew}）`);
}

// ===== 4. timedBuffs へ加算的に足しているだけ =====
section('4. timedBuffs へ加算的に足しているだけ（既存キーの意味を変えない）');
{
  const ctx = build();
  const w = ctx.w;
  const p = ctx.scene.player;
  // M8-B/C/D の既存 buff。
  w.applyWarCryBuff({ durationMs: 3000, meleeDamageBonus: 0.15, furyGainBonus: 0.1, comboGraceBonus: 0.2 });
  w.beginCounterWindow('counter_stance', { durationMs: 2000, maxCounters: 2, priority: 2, mitigation: 0.2 });
  w.beginFrontGuard('shield_charge', { durationMs: 600, mitigation: 0.4, frontArc: 1.5, facing: 0.3 });
  w.placeRallyField('rallying_banner', { x: p.x, y: p.y, durationMs: 5000, radius: 150, meleeArea: 0.1 });
  // M8-E の新 buff。
  w.beginDuelChallenge('duel_challenge', ctx.enemies[0], { durationMs: 6000, meleeDamageBonus: 0.2 });
  w.beginBattleTrance('battle_trance', { durationMs: 5000, meleeDamageBonus: 0.2, mitigationPenalty: 0.05 });
  w.beginDeflectionWindow('weapon_deflection', { windowMs: 2000, maxDeflections: 4, radius: 120, reflect: true, reflectedDamage: 30, reflectedSpeed: 300, reflectLifeMs: 500 });

  const buffs = w.serializeTimedBuffs();
  for (const k of ['warCry', 'counterWindows', 'frontGuard', 'rallyField']) ok(k in buffs, `既存キー ${k} が残っている`);
  for (const k of ['duel', 'trance', 'deflection']) ok(k in buffs, `M8-E で ${k} を加算的に足している`);
  ok(buffs.warCry && buffs.warCry.leftMs > 0, '戦吼の意味が変わっていない');
  ok(Array.isArray(buffs.counterWindows) || buffs.counterWindows, '反撃窓の形が変わっていない');
  // 弾オブジェクト / 弾いた id 集合は保存しない。
  const json = JSON.stringify(buffs);
  ok(!/"_id"|"projectileKind"|"deflectedIds"/.test(json), '弾のオブジェクト / 弾いた id 集合を保存しない');
  ok(!/"hp"|"maxHp"|"def":/.test(json), '敵のオブジェクトを保存しない');
  info(`timedBuffs のキー: ${Object.keys(buffs).join(',')}`);
}

// ===== 5. 上限つき復元（改ざん耐性） =====
section('5. 改ざんされた保存値でも balance の上限を超えない');
{
  const W = DATA.balance.warrior;
  const ctx = build();
  ctx.w.restoreTimedBuffs({
    duel: { seq: 7, kind: 'boss', leftMs: 1e9, extendedMs: 0, retargets: 0, maxRetargets: 99,
      meleeDamageBonus: 9, poiseDamageBonus: 9, furyGainBonus: 9,
      extendPerBreakMs: 1e9, maxExtensionMs: 1e9, source: 'x' },
    trance: { leftMs: 1e9, meleeDamageBonus: 9, attackSpeedBonus: 9, comboGraceBonus: 9,
      furyGainBonus: 9, mitigationPenalty: 9, killHealBonus: 9, perSecondCapBonus: 9, source: 'x' },
    deflection: { leftMs: 1e9, used: -5, max: 999, radius: 1e9, source: 'x',
      reflect: true, reflectedDamage: 1e9, reflectedSpeed: 1e9, reflectLifeMs: 1e9, poiseDamage: 1e9 },
  });
  const w = ctx.w;
  ok(w.duelLeftMs <= W.duel.maxDurationMs + 1e-9, `決闘の持続 ≤ ${W.duel.maxDurationMs}ms（${w.duelLeftMs}）`);
  ok(w.duelBonus('meleeDamage') <= W.duel.maxMeleeDamageBonus + 1e-9, '決闘の Dmg 補正が上限内');
  ok(w.duelBonus('poiseDamage') <= W.duel.maxPoiseDamageBonus + 1e-9, '決闘の体勢補正が上限内');
  ok(w.tranceLeftMs <= W.trance.maxDurationMs + 1e-9, `構えの持続 ≤ ${W.trance.maxDurationMs}ms（${w.tranceLeftMs}）`);
  const tm = w.getBattleTranceModifiers();
  ok(tm.meleeDamage <= W.trance.maxMeleeDamageBonus + 1e-9, '構えの Dmg 補正が上限内');
  ok(tm.mitigationPenalty <= W.trance.maxMitigationPenalty + 1e-9, '構えの軽減低下が上限内');
  ok(w.damageReduction({ engaged: true }) >= 0, '復元後も軽減が負にならない');
  ok(w.deflectLeftMs <= W.deflection.maxWindowMs + 1e-9, `弾き窓 ≤ ${W.deflection.maxWindowMs}ms（${w.deflectLeftMs}）`);
  ok(w.deflectMax <= W.deflection.maxDeflectionsPerWindow, `弾ける数 ≤ ${W.deflection.maxDeflectionsPerWindow}（${w.deflectMax}）`);
  ok(w.deflectUsed >= 0, '使用回数が負にならない');
  const ds = w.deflectionState('x');
  ok(ds.radius <= W.deflection.maxDeflectRadius + 1e-9, '弾き半径が上限内');
  ok(ds.reflectedDamage <= W.deflection.maxReflectedDamage + 1e-9, '反射ダメージが上限内');
  ok(ds.reflectedSpeed <= W.deflection.maxReflectedSpeed + 1e-9, '反射速度が上限内');
  ok(ds.reflectLifeMs <= W.deflection.maxReflectLifeMs + 1e-9, '反射弾の寿命が上限内');
}

// ===== 6. 復元でテレメトリが水増しされない =====
section('6. 復元でテレメトリが水増しされない');
{
  const src = build();
  src.w.beginDuelChallenge('a', src.enemies[0], { durationMs: 5000, meleeDamageBonus: 0.2 });
  src.w.beginBattleTrance('b', { durationMs: 5000, meleeDamageBonus: 0.2 });
  src.w.beginDeflectionWindow('c', { windowMs: 2000, maxDeflections: 4, radius: 120, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  const buffs = src.w.serializeTimedBuffs();

  const dst = build();
  const before = { d: dst.w.telemetry.duelStarts, t: dst.w.telemetry.tranceStarts, f: dst.w.telemetry.deflectWindows };
  dst.w.restoreTimedBuffs(buffs);
  ok(dst.w.duelActive && dst.w.tranceActive && dst.w.deflectionActive, '3 つとも復元される');
  ok(dst.w.telemetry.duelStarts === before.d, `決闘の開始回数が増えない（${dst.w.telemetry.duelStarts}）`);
  ok(dst.w.telemetry.tranceStarts === before.t, `構えの発動回数が増えない（${dst.w.telemetry.tranceStarts}）`);
  ok(dst.w.telemetry.deflectWindows === before.f, `弾き窓の回数が増えない（${dst.w.telemetry.deflectWindows}）`);
  // 二重復元でも増えない。
  dst.w.restoreTimedBuffs(buffs);
  ok(dst.w.telemetry.duelStarts === before.d && dst.w.telemetry.tranceStarts === before.t, '二重復元でも増えない');
}

// ===== 7. destroy / reset =====
section('7. destroy / reset で M8-E の状態が全部消える');
{
  const ctx = build();
  const w = ctx.w;
  w.beginDuelChallenge('a', ctx.enemies[0], { durationMs: 5000, meleeDamageBonus: 0.2 });
  w.beginBattleTrance('b', { durationMs: 5000, meleeDamageBonus: 0.2 });
  w.beginDeflectionWindow('c', { windowMs: 2000, maxDeflections: 4, radius: 120, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  w.destroy();
  ok(!w.duelActive && !w.tranceActive && !w.deflectionActive, 'destroy で 3 つとも消える');

  const w2 = makeWarrior(WarriorCombatSystem, ctx.scene, {});
  w2.beginDuelChallenge('a', ctx.enemies[1], { durationMs: 5000, meleeDamageBonus: 0.2 });
  w2.beginBattleTrance('b', { durationMs: 5000, meleeDamageBonus: 0.2 });
  w2.beginDeflectionWindow('c', { windowMs: 2000, maxDeflections: 4, radius: 120, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  w2.reset();
  ok(!w2.duelActive && !w2.tranceActive && !w2.deflectionActive, 'reset で 3 つとも消える');
  ok(w2.telemetry.duelStarts === 0 && w2.telemetry.tranceStarts === 0 && w2.telemetry.deflectWindows === 0,
    'reset でテレメトリも初期化される');
}

// ===== 8. save_version は v6 のまま =====
section('8. save_version は v6 のまま（追加は加算的）');
{
  ok(DATA.balance.saveVersion === 6, `balance.json の saveVersion が 6 のまま（${DATA.balance.saveVersion}）`);
  const boot = readSrc('src/scenes/BootScene.js');
  ok(boot.includes('DataManager.balance.saveVersion'), 'BootScene が data の saveVersion を使う');
  const wsrc = readSrc('src/systems/WarriorCombatSystem.js');
  for (const k of ['duel:', 'trance:', 'deflection:']) ok(wsrc.includes(k), `serializeTimedBuffs に ${k} を加算的に足している`);
  // 保存キーの追加は warriorState 配下だけ（トップレベルの保存形は変えない）。
  const save = readSrc('src/systems/SaveManager.js');
  ok(!/duel|trance|deflect/i.test(save), 'SaveManager 本体には M8-E 固有キーを足していない（warriorState 配下で完結）');
}

// ===== 9. 遅延処理の破棄ガード =====
section('9. 遅延処理に破棄ガードがある');
{
  const map = registryMap();
  for (const id of FINAL) {
    const src = skillSourceDeep(id, map) || '';
    if (!/delayedCall/.test(src)) { ok(true, `${id}: 遅延処理を使わない`); continue; }
    ok(/this\._dead\s*\|\|/.test(src), `${id}: 遅延処理に破棄ガードがある`);
  }
}

// ===== 10. ボス周りの解除 =====
section('10. ボスが消えても保存 / 復元が壊れない');
{
  const ctx = build({ enemies: [], boss: makeBoss({ x: 460, y: 300, hp: 1e9 }) });
  ctx.w.beginDuelChallenge('a', ctx.scene.boss, { durationMs: 6000, meleeDamageBonus: 0.2 });
  const buffs = ctx.w.serializeTimedBuffs();
  ctx.w.onBossRemoved();
  ok(!ctx.w.duelActive, 'ボス除去で決闘が解ける');
  // ボスがいない Scene へ復元しても、対象を見失った時点で安全に解ける。
  const empty = build({ enemies: [], boss: null });
  empty.w.restoreTimedBuffs(buffs);
  empty.sm.acquireOrLevel('duel_challenge'); empty.sm.setLevel('duel_challenge', 8);
  run(empty, 2000);
  ok(!empty.w.duelActive || empty.scene.duelTarget() !== null, '対象がいない復元は安全に解ける（幽霊対象を残さない）');
}

T.finish();
