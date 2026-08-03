// M9-A.1 10/15: 周回途中の品質切替（§9）。Node.js 標準機能のみ。
// low→ultra / ultra→low / medium→high を周回中に行っても、
// gameplay trace が「切替なし」と一致し、pending gameplay event が消えないことを確認する。
// 実行: node tests/cross-job-quality-midrun-switch.mjs
import { JOB_IDS, RAW, bootProduction, makeBattle, instrument, stepFrame, gameplayTrace, sha, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('品質の周回途中切替（M9-A.1）');
const { ok, section, info } = T;

// 品質を切り替える production の経路と同じ形にする:
//   settings.effectQuality を書き換え、cap 解決に使う値が変わる（gameplay cap は単一値なので不変）。
const setQuality = (h, q) => {
  h.scene.settings.effectQuality = q;
  h.scene.effSettings.quality = q;
  if (h.scene.effects.settings) h.scene.effects.settings.quality = q;
};

const RUN_MS = 40000;

const runSwitch = async (jobId, profile, plan, seed) => {
  resetPhysics();
  const h = instrument(await makeBattle({ jobId, profile, build: 'full', quality: plan[0][1], seed }));
  let pi = 1;
  const switches = [];
  while (h.scene._elapsedMs < RUN_MS) {
    if (pi < plan.length && h.scene._elapsedMs >= plan[pi][0]) {
      // 切替直前の pending gameplay event を記録する。
      const before = { proj: h.scene.projPool.activeCount, enemies: h.scene.enemyPool.activeCount, timers: h.scene._pendingTimers() };
      setQuality(h, plan[pi][1]);
      const after = { proj: h.scene.projPool.activeCount, enemies: h.scene.enemyPool.activeCount, timers: h.scene._pendingTimers() };
      switches.push({ at: h.scene._elapsedMs, q: plan[pi][1], before, after });
      pi++;
    }
    stepFrame(h);
    if (h.scene.gameOver) break;
  }
  return { h, switches };
};

// 切替時刻はどのジョブでも周回中に必ず訪れる早い時刻へ置く（死亡で切替前に終わらないため）。
const PLANS = {
  'low→ultra': [[0, 'low'], [6000, 'ultra']],
  'ultra→low': [[0, 'ultra'], [6000, 'low']],
  'medium→high': [[0, 'medium'], [6000, 'high']],
  'low→ultra→low': [[0, 'low'], [5000, 'ultra'], [12000, 'low']],
};

section('1. 切替の瞬間に pending gameplay event が消えない');
for (const j of JOB_IDS) {
  for (const [name, plan] of Object.entries(PLANS)) {
    const { switches } = await runSwitch(j, 'elite', plan, 7070);
    ok(switches.length === plan.length - 1, `${j}/${name}: 予定どおり切替が起きた（${switches.length}）`);
    for (const s of switches) {
      ok(s.before.proj === s.after.proj, `${j}/${name}@${s.at}: 進行中の gameplay 弾が消えない（${s.before.proj}）`);
      ok(s.before.enemies === s.after.enemies, `${j}/${name}@${s.at}: 敵が消えない（${s.before.enemies}）`);
      ok(s.before.timers === s.after.timers, `${j}/${name}@${s.at}: 予約イベント（delayedCall）が消えない（${s.before.timers}）`);
    }
  }
}

section('2. 途中切替あり / なしで gameplay trace が一致');
for (const j of JOB_IDS) {
  // 基準: 切替しない 4 品質（すべて同じ trace になることは別スイートで確認済み）。
  const base = await runSwitch(j, 'elite', [[0, 'high']], 7171);
  const baseHash = sha(gameplayTrace(base.h));
  for (const [name, plan] of Object.entries(PLANS)) {
    const { h } = await runSwitch(j, 'elite', plan, 7171);
    ok(sha(gameplayTrace(h)) === baseHash, `${j}/${name}: 切替しても gameplay trace が基準と一致`);
  }
  info(`${j}: 基準 hash ${baseHash.slice(0, 16)}…`);
}

section('3. 切替後に visual だけが変わる');
for (const j of JOB_IDS) {
  const a = await runSwitch(j, 'elite', [[0, 'low']], 7272);
  const b = await runSwitch(j, 'elite', [[0, 'low'], [6000, 'ultra']], 7272);
  ok(sha(gameplayTrace(a.h)) === sha(gameplayTrace(b.h)), `${j}: gameplay は同一`);
  ok(b.switches.length === 1, `${j}: 切替が実際に起きた（周回長 ${b.h.scene._elapsedMs}ms）`);
  ok(b.h.counters.visualTotal > a.h.counters.visualTotal,
    `${j}: 切替後に演出が増える（${a.h.counters.visualTotal} → ${b.h.counters.visualTotal}）`);
}

section('4. 品質切替が gameplay 上限と恒久強化ぶんを壊さない（M9-A.2 で発見・修正）');
{
  // ★ M9-A.2 の実ブラウザ検証で発見: `applyEffectSettings()` は effSettings を作り直すのに
  //   魂炎の恒久強化ぶん（enemyCapAdd / effectCapAdd）を再加算していなかった。
  //   その結果、**周回中に品質を変えると敵 / 弾のプール上限から恒久強化が消えていた**
  //   （= 品質変更が gameplay 上限を変える）。あわせて particleBudget も create() の値のまま固定だった。
  const M = await bootProduction();
  const { BattleScene } = M;
  const gl = RAW.balance.gameplayLimits;
  for (const [from, to] of [['low', 'ultra'], ['ultra', 'low'], ['medium', 'high']]) {
    const fake = {
      settings: { effectQuality: from, damageNumbers: true, screenShake: true, whiteFlash: true },
      enemyCapAdd: 40, effectCapAdd: 60,
      effects: { setSettings() {} },
      _applyParticleBudget: BattleScene.prototype._applyParticleBudget,
    };
    BattleScene.prototype.applyEffectSettings.call(fake);
    const beforeBudget = fake.particleBudget;
    ok(fake.effSettings.maxEnemies === gl.maxEnemies + 40,
      `${from}: 敵上限に恒久強化が乗る（${fake.effSettings.maxEnemies} = ${gl.maxEnemies} + 40）`);
    ok(fake.effSettings.maxProjectiles === gl.maxProjectiles + 60,
      `${from}: 弾上限に恒久強化が乗る（${fake.effSettings.maxProjectiles} = ${gl.maxProjectiles} + 60）`);

    fake.settings.effectQuality = to;
    BattleScene.prototype.applyEffectSettings.call(fake);
    ok(fake.effSettings.maxEnemies === gl.maxEnemies + 40,
      `${from}→${to}: 切替後も敵上限が不変（${fake.effSettings.maxEnemies}）`);
    ok(fake.effSettings.maxProjectiles === gl.maxProjectiles + 60,
      `${from}→${to}: 切替後も弾上限が不変（${fake.effSettings.maxProjectiles}）`);
    ok(fake.effSettings.hitStop === true, `${from}→${to}: hitStop は常に有効`);
    // 演出（粒子予算）は品質に追従して変わること。
    const expect = (RAW.balance.combatCaps.particleBudget?.[to] || 200) + 60;
    ok(fake.particleBudget === expect, `${from}→${to}: 粒子予算が品質へ追従（${beforeBudget} → ${fake.particleBudget} / 期待 ${expect}）`);
    ok(fake.particleBudget !== beforeBudget, `${from}→${to}: 粒子予算が実際に変化する`);
  }
  // 何度切り替えても二重加算にならない（冪等）。
  const f2 = { settings: { effectQuality: 'high' }, enemyCapAdd: 10, effectCapAdd: 20,
    effects: { setSettings() {} }, _applyParticleBudget: BattleScene.prototype._applyParticleBudget };
  for (let i = 0; i < 5; i++) BattleScene.prototype.applyEffectSettings.call(f2);
  ok(f2.effSettings.maxEnemies === gl.maxEnemies + 10, `5 回切り替えても二重加算しない（${f2.effSettings.maxEnemies}）`);
}

T.finish();
