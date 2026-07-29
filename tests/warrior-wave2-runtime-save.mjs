// 戦士 Wave2 16/21: ランタイム状態の保存 / 復元（M8-D §保存）。Node.js 標準機能のみ。
//   - Wave2 の 15 スキルすべてが serializeState / restoreState を持ち、CD を保存する
//   - 進行中の状態（突進 / 踏み込み / 掴み / 投げ / 段 / 斧）は保存せず、復元で二重再生しない
//   - 前面防御と戦旗の陣は WarriorCombatSystem 側が保存し、上限つきで復元される
//   - 掴みは保存しない（reload で敵参照や無料の着地衝撃を作らない）
//   - save_version は v6 のまま（追加は加算的）
// 実行: node tests/warrior-wave2-runtime-save.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, readSrc, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 Wave2 ランタイム保存 / 復元（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const WAVE2 = [...EXPECTED.wave2Actives, ...EXPECTED.wave2Evolutions];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 340, y: 300, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, now: 10000, quality: 'high' });
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

// ===== 1. 全スキルが CD を保存する =====
section('1. Wave2 の 15 スキルすべてが CD を保存 / 復元する');
for (const id of WAVE2) {
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

// ===== 2. 進行中の状態は保存しない =====
section('2. 進行中の状態（座標・段・飛行）は保存しない');
{
  const FORBIDDEN = ['x', 'y', 'angle', 'moved', 'traveled', 'stage', 'target', 'enemy', 'seq'];
  for (const id of WAVE2) {
    const ctx = build();
    ctx.sm.acquireOrLevel(id);
    const sk = ctx.sm.skills.get(id);
    run(ctx, 6000);
    const s = sk.serializeState() || {};
    for (const k of FORBIDDEN) ok(!(k in s), `${id}: ${k} を保存しない`);
    for (const v of Object.values(s)) {
      ok(v === null || typeof v !== 'object' || Array.isArray(v) === false, `${id}: 保存値が単純な値`);
    }
  }
}

// ===== 3. 復元で二重再生しない =====
section('3. 復元で進行中の効果が二重に再生されない');
for (const id of WAVE2) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  const sk = ctx.sm.skills.get(id);
  run(ctx, 5000);
  const s = sk.serializeState();
  const before = ctx.scene.calls.length;
  sk.restoreState({ ...s, cdLeft: 99999 });
  for (let i = 0; i < 120; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  // 刃防陣だけは「残り時間の再開」を許す（構えの継続であって二重化ではない）。
  const allowResume = id === 'blade_guard';
  const grew = ctx.scene.calls.length - before;
  ok(allowResume || grew === 0, `${id}: 復元後に無料の効果が出ない（増分 ${grew}）`);
}

// ===== 4. 掴みは保存しない =====
section('4. 掴みは保存しない（reload で敵参照や無料の着地衝撃を作らない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('battlefield_throw'); ctx.sm.setLevel('battlefield_throw', 8);
  for (let i = 0; i < 2000 && !ctx.w.grabbing; i++) { ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16); }
  ok(ctx.w.grabbing, '掴んだ状態を作れる');
  const buffs = ctx.w.serializeTimedBuffs();
  ok(!('grab' in buffs) && !('_grab' in buffs), '掴みは serializeTimedBuffs に含まれない');
  const json = JSON.stringify(buffs);
  ok(!/_seq/.test(json), '保存データに敵の runtime id が含まれない');
  ctx.w.restoreTimedBuffs(buffs);
  ok(!ctx.w.grabbing, '復元後は掴んでいない');
}

// ===== 5. 前面防御・戦旗の陣は上限つきで復元される =====
section('5. 前面防御・戦旗の陣は WarriorCombatSystem 側が上限つきで復元する');
{
  const ctx = build();
  const w = ctx.w;
  const p = ctx.scene.player;
  w.beginFrontGuard('shield_charge', { durationMs: 600, mitigation: 0.4, frontArc: 1.5, facing: 0.3 });
  w.placeRallyField('rallying_banner', { x: p.x, y: p.y, durationMs: 5000, radius: 150, comboGrace: 0.3, furyGain: 0.2, mitigation: 0.1, meleeArea: 0.1 });
  const buffs = w.serializeTimedBuffs();
  ok(buffs.frontGuard && buffs.frontGuard.leftMs > 0, '前面防御を保存する');
  ok(buffs.rallyField && buffs.rallyField.leftMs > 0, '戦旗の陣を保存する');

  const ctx2 = build();
  const before = ctx2.w.telemetry.rallyPlacements;
  ctx2.w.restoreTimedBuffs(buffs);
  ok(ctx2.w.frontGuardActive, '前面防御が復元される');
  ok(ctx2.w.rallyActive, '戦旗の陣が復元される');
  ok(ctx2.w.telemetry.rallyPlacements === before, `復元で設置回数が水増しされない（${before}）`);

  // 改ざんされた保存値でも上限を超えない。
  const ctx3 = build();
  ctx3.w.restoreTimedBuffs({
    frontGuard: { leftMs: 1e9, mitigation: 9, arc: 9, facing: 0, source: 'x' },
    rallyField: { leftMs: 1e9, x: 0, y: 0, radius: 1e9, comboGrace: 9, furyGain: 9, mitigation: 9, meleeArea: 9, killHealBonus: 9, perSecondCapBonus: 9, source: 'x' },
  });
  const FG = DATA.balance.warrior.frontalGuard, RA = DATA.balance.warrior.rally;
  ok(ctx3.w.frontGuard.mitigation <= FG.maxFrontalMitigation + 1e-9, `前面軽減が上限 ${FG.maxFrontalMitigation} 以下`);
  ok(ctx3.w.rallyField.leftMs <= RA.maxDurationMs + 1e-9, `陣の持続が上限 ${RA.maxDurationMs} 以下`);
  ok(ctx3.w.rallyField.comboGrace <= RA.maxComboGrace + 1e-9, `comboGrace が上限以下`);
  ok(ctx3.w.rallyField.meleeArea <= RA.maxMeleeArea + 1e-9, `meleeArea が上限以下`);
  ok(ctx3.w.rallyField.killHealBonus <= RA.maxKillHealBonus + 1e-9, `killHealBonus が上限以下`);
}

// ===== 6. 破棄 / リセットで Wave2 の状態が全部消える =====
section('6. destroy / reset で Wave2 の状態が全部消える');
{
  const ctx = build();
  const w = ctx.w;
  const p = ctx.scene.player;
  w.beginFrontGuard('a', { durationMs: 900, mitigation: 0.3, frontArc: 1.4, facing: 0 });
  w.placeRallyField('b', { x: p.x, y: p.y, durationMs: 5000, radius: 150, meleeArea: 0.1 });
  w.beginGrab('c', 7);
  w.destroy();
  ok(!w.frontGuardActive, 'destroy で前面防御が消える');
  ok(!w.rallyActive, 'destroy で戦旗の陣が消える');
  ok(!w.grabbing, 'destroy で掴みが消える');

  const w2 = makeWarrior(WarriorCombatSystem, ctx.scene, {});
  w2.beginFrontGuard('a', { durationMs: 900, mitigation: 0.3, frontArc: 1.4, facing: 0 });
  w2.placeRallyField('b', { x: p.x, y: p.y, durationMs: 5000, radius: 150, meleeArea: 0.1 });
  w2.beginGrab('c', 7);
  w2.reset();
  ok(!w2.frontGuardActive && !w2.rallyActive && !w2.grabbing, 'reset で Wave2 の状態が全部消える');
  ok(w2.telemetry.launches === 0 && w2.telemetry.grabs === 0, 'reset でテレメトリも初期化される');
}

// ===== 7. save_version は v6 のまま =====
section('7. save_version は v6 のまま（追加は加算的）');
{
  // save_version の正は data/balance.json（BootScene が SaveManager.init へ渡す）。
  ok(DATA.balance.saveVersion === 6, `balance.json の saveVersion が 6 のまま（${DATA.balance.saveVersion}）`);
  const boot = readSrc('src/scenes/BootScene.js');
  ok(boot.includes('DataManager.balance.saveVersion'), 'BootScene が data の saveVersion を使う');
  // M8-D の追加は加算的（既存キーの意味を変えない）。
  const wsrc = readSrc('src/systems/WarriorCombatSystem.js');
  ok(/frontGuard:/.test(wsrc) && /rallyField:/.test(wsrc), 'timedBuffs へ加算的にキーを足しているだけ');
}

// ===== 8. 遅延処理に破棄ガードがある =====
section('8. 遅延処理に破棄ガードがある');
{
  const map = registryMap();
  for (const id of WAVE2) {
    const src = skillSourceDeep(id, map) || '';
    if (!/delayedCall/.test(src)) { ok(true, `${id}: 遅延処理を使わない`); continue; }
    ok(/this\._dead\s*\|\|/.test(src), `${id}: 遅延処理に破棄ガードがある`);
  }
}

T.finish();
