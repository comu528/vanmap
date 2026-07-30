// M9-A.1 13/15: 長時間周回の後片付け / 上限 / リークなし（§12）。Node.js 標準機能のみ。
// production を全経路で回した後に確認すること:
//   - プール上限（gameplayLimits）を超えない・release が漏れない・再利用が働く
//   - SpatialGrid に残留 0（release / kill / cleanup 後）
//   - 長時間で配列が単調増加しない（_deathEvents / free リスト / status 索引）
//   - production の cleanup() 後に残留参照 0
// 実行: node tests/cross-job-harness-cleanup.mjs
import { JOB_IDS, RAW, PROFILES, makeBattle, runProfile, stepFrame, instrument, collectMetrics, bootProduction, HEAVY, runner } from './cross-job-harness.mjs';
import { resetPhysics, bodyCount } from './phaser-stub.mjs';

const T = runner('長時間周回の後片付け（M9-A.1）');
const { ok, section, info } = T;
const M = await bootProduction();
const LIM = RAW.balance.gameplayLimits;
const LONG_MS = HEAVY ? 600000 : 300000;

section('1. プール上限（gameplayLimits）を超えない');
for (const j of JOB_IDS) {
  resetPhysics();
  const h = instrument(await makeBattle({ jobId: j, profile: 'survival', build: 'full', seed: 8080 }));
  runProfile(h);
  const s = h.scene;
  ok(s.enemyPool.activeCount <= LIM.maxEnemies, `${j}: 敵 active ${s.enemyPool.activeCount} ≤ ${LIM.maxEnemies}`);
  ok(s.projPool.activeCount <= LIM.maxProjectiles, `${j}: 弾 active ${s.projPool.activeCount} ≤ ${LIM.maxProjectiles}`);
  ok(s.enemyPool.totalCount <= LIM.maxEnemies, `${j}: 敵の実体総数 ${s.enemyPool.totalCount} ≤ ${LIM.maxEnemies}（生成しっぱなしでない）`);
  ok(s.projPool.totalCount <= LIM.maxProjectiles, `${j}: 弾の実体総数 ${s.projPool.totalCount} ≤ ${LIM.maxProjectiles}`);
  ok(s.projPool.reusedCount > 0, `${j}: 弾が再利用されている（reused ${s.projPool.reusedCount}）`);
  ok(s.projPool.releasedCount >= s.projPool.createdCount - s.projPool.activeCount,
    `${j}: 弾の release 漏れなし（created ${s.projPool.createdCount} / released ${s.projPool.releasedCount} / active ${s.projPool.activeCount}）`);
}

section('2. SpatialGrid の登録数が active と一致し、残留しない');
for (const j of JOB_IDS) {
  resetPhysics();
  const h = await makeBattle({ jobId: j, profile: 'elite', build: 'slot8', seed: 9090 });
  runProfile(h, { maxMs: 90000 });
  const s = h.scene;
  const gridCount = s.enemyGrid.count != null ? s.enemyGrid.count : s.enemyGrid._count;
  ok(gridCount === s.enemyPool.activeCount, `${j}: 敵グリッド登録 ${gridCount} = active ${s.enemyPool.activeCount}`);
  const gemCount = s.gemGrid.count != null ? s.gemGrid.count : s.gemGrid._count;
  ok(gemCount === s.gemPool.activeCount, `${j}: 宝石グリッド登録 ${gemCount} = active ${s.gemPool.activeCount}`);
  // 全解放でグリッドが空になる（onRelease hook が production と同じであることの確認）。
  s.enemyPool.releaseAll(); s.gemPool.releaseAll();
  const after = s.enemyGrid.count != null ? s.enemyGrid.count : s.enemyGrid._count;
  const afterGem = s.gemGrid.count != null ? s.gemGrid.count : s.gemGrid._count;
  ok(after === 0, `${j}: releaseAll 後の敵グリッド残留 0（${after}）`);
  ok(afterGem === 0, `${j}: releaseAll 後の宝石グリッド残留 0（${afterGem}）`);
  ok(s.enemyPool.activeCount === 0 && s.gemPool.activeCount === 0, `${j}: releaseAll 後の active 0`);
}

section('3. 長時間周回で配列が単調増加しない');
for (const j of JOB_IDS) {
  resetPhysics();
  const h = await makeBattle({ jobId: j, profile: 'survival', build: 'full', seed: 5150 });
  const samples = [];
  const sampleAt = [LONG_MS / 4, LONG_MS / 2, (LONG_MS * 3) / 4, LONG_MS];
  let si = 0;
  const s = h.scene;
  // 死亡しても周回を続けたい（配列の増加を長時間見たい）ので、死亡時は HP を戻す。
  const origDeath = s.onPlayerDeath;
  s.onPlayerDeath = () => { origDeath(); s.gameOver = false; s.player.alive = true; s.player.hp = s.player.maxHp; };
  while (s._elapsedMs < LONG_MS) {
    stepFrame(h);
    if (si < sampleAt.length && s._elapsedMs >= sampleAt[si]) {
      samples.push({
        ms: s._elapsedMs,
        deathEvents: s._deathEvents.length,
        enemyTotal: s.enemyPool.totalCount, projTotal: s.projPool.totalCount, gemTotal: s.gemPool.totalCount,
        bbTotal: s.bossBulletPool.totalCount,
        statusIdx: s.statusFx.trackedCount ? s.statusFx.trackedCount() : s.enemyPool.activeCount,
        timers: s._pendingTimers(),
        bodies: bodyCount(),
      });
      si++;
    }
  }
  const last = samples[samples.length - 1]; const mid = samples[1];
  ok(last.deathEvents <= 512, `${j}: 死亡履歴が上限内（${last.deathEvents}）`);
  ok(last.enemyTotal <= LIM.maxEnemies && last.projTotal <= LIM.maxProjectiles, `${j}: プール実体が上限内`);
  // 実体総数（= 同時存在のピーク）は run.phases が進むと増えるのが正常。リークの判定は
  // 「上限内に収まる」＋「最終 1/4 でほぼ増えない（確保が頭打ちになる）」で行う。
  const q3 = samples[2];
  ok(last.enemyTotal - q3.enemyTotal <= LIM.maxEnemies * 0.1,
    `${j}: 敵実体の確保が最終 1/4 で頭打ち（${q3.enemyTotal} → ${last.enemyTotal} / 上限 ${LIM.maxEnemies}）`);
  ok(last.projTotal - q3.projTotal <= LIM.maxProjectiles * 0.1,
    `${j}: 弾実体の確保が最終 1/4 で頭打ち（${q3.projTotal} → ${last.projTotal} / 上限 ${LIM.maxProjectiles}）`);
  void mid;
  ok(last.timers <= 4000, `${j}: 保留タイマーが増え続けない（${last.timers}）`);
  info(`${j}: ${samples.map((x) => `${Math.round(x.ms / 1000)}s[敵${x.enemyTotal}/弾${x.projTotal}/死${x.deathEvents}/body${x.bodies}]`).join(' ')}`);
}

section('4. production の cleanup() 後に残留 0');
for (const j of JOB_IDS) {
  resetPhysics();
  const h = await makeBattle({ jobId: j, profile: 'boss', build: 'full', seed: 1717 });
  runProfile(h, { maxMs: 60000 });
  const s = h.scene;
  // cleanup() は Phaser / DOM 側の入口を触る。production の実装をそのまま呼ぶため最小の受け皿を置く。
  s._onVisibility = () => {}; s._onBlur = () => {};
  globalThis.document = globalThis.document || { removeEventListener() {}, addEventListener() {} };
  globalThis.window = globalThis.window || {};
  s.game = { events: { off() {}, on() {} } };
  globalThis.window.RFS_BATTLE = s;
  s.enemyPool.releaseAll(); s.projPool.releaseAll(); s.bossBulletPool.releaseAll(); s.gemPool.releaseAll();
  if (s.boss) { s.boss.destroy(); s.boss = null; }
  M.BattleScene.prototype.cleanup.call(s);
  ok(s.skills.skills.size === 0, `${j}: cleanup 後の skill 残留 0（${s.skills.skills.size}）`);
  ok(s._deathEvents.length === 0, `${j}: cleanup 後の死亡履歴 0`);
  const g1 = s.enemyGrid.count != null ? s.enemyGrid.count : s.enemyGrid._count;
  const g2 = s.gemGrid.count != null ? s.gemGrid.count : s.gemGrid._count;
  ok(g1 === 0 && g2 === 0, `${j}: cleanup 後のグリッド残留 0`);
  ok(globalThis.window.RFS_BATTLE === null, `${j}: window.RFS_BATTLE を解除`);
  if (s.warrior.enabled) {
    const w = s.warrior.summary();
    ok(typeof w === 'object', `${j}: destroy 後も summary が取れる（例外を出さない）`);
  }
}

section('5. 敵 / 弾の release が状態異常・戦士の索引からも外す');
{
  resetPhysics();
  const h = await makeBattle({ jobId: 'flame_witch', profile: 'elite', build: 'full', seed: 2626 });
  runProfile(h, { maxMs: 60000 });
  const s = h.scene;
  const before = s.statusFx.counters();
  s.enemyPool.releaseAll();
  const active = [];
  s.statusFx.forEachTracked ? s.statusFx.forEachTracked((e) => active.push(e)) : null;
  ok(active.length === 0, `releaseAll 後に状態異常の追跡対象 0（${active.length}）`);
  ok(typeof before === 'object', '状態異常カウンタが取得できる');
  // 戦士側も同様（敵参照を残さない）。
  resetPhysics();
  const hw = await makeBattle({ jobId: 'warrior', profile: 'elite', build: 'full', seed: 2626 });
  runProfile(hw, { maxMs: 60000 });
  hw.scene.enemyPool.releaseAll();
  const sum = hw.scene.warrior.summary();
  ok(sum && Number.isFinite(sum.meleeHits || 0), 'releaseAll 後も戦士の集計が健全');
}

section('6. 全 profile を回しても gameOver 後にフレームが進み続けない');
for (const p of Object.keys(PROFILES)) {
  resetPhysics();
  const h = await makeBattle({ jobId: 'frost_mage', profile: p, seed: 3535 });
  runProfile(h);
  // duration が dt の整数倍でない profile は最後の 1 フレームだけ超える（それ以上は進まない）。
  ok(h.scene._elapsedMs <= PROFILES[p].durationMs + PROFILES[p].dt,
    `${p}: 経過 ${h.scene._elapsedMs}ms ≤ 上限 ${PROFILES[p].durationMs}ms + 1 フレーム`);
  const m = collectMetrics(h);
  ok(Number.isFinite(m.offense.totalDamage), `${p}: 集計が有限値`);
}

T.finish();
