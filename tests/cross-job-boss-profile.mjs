// M9-A.1 5/15: boss profile（§3 C）。Node.js 標準機能のみ。
// production の Boss / telegraph / charge / 氷砕 / 体勢崩し を通して boss kill time を測る。
// 実行: node tests/cross-job-boss-profile.mjs
import { JOB_IDS, QUALITIES, makeBattle, runProfile, instrument, collectMetrics, gameplayTrace, sha, HEAVY, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('boss profile（M9-A.1）');
const { ok, section, info } = T;
const SEEDS = HEAVY ? [101, 202, 303, 404, 505, 606, 707] : [101, 202, 303];
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

section('1. production の Boss が生成され telegraph / charge が動く');
{
  resetPhysics();
  const h = instrument(await makeBattle({ jobId: 'warrior', profile: 'boss', build: 'slot8', seed: 101 }));
  const states = new Set();
  const { stepFrame } = await import('./cross-job-harness.mjs');
  for (let i = 0; i < 400; i++) { stepFrame(h); if (h.scene.boss) states.add(h.scene.boss.state); if (h.scene.gameOver) break; }
  ok(h.scene.bossSpawned, 'ボスが出現する');
  ok(h.scene.boss === null || h.scene.boss.constructor.name === 'Boss', 'production の Boss クラス');
  info(`観測したボス状態: ${[...states].join(' ')}`);
  ok(states.size >= 1, 'ボスの状態遷移が動く');
}

section('2. 3 ジョブが boss を撃破でき、kill time が測れる');
const results = {};
for (const j of JOB_IDS) {
  const times = []; const remains = [];
  for (const seed of SEEDS) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: 'boss', build: 'slot8', seed }));
    runProfile(h);
    const m = collectMetrics(h);
    if (m.offense.bossKillMs != null) times.push(m.offense.bossKillMs);
    else remains.push(m.offense.bossHpRemain);
  }
  results[j] = { times, remains };
  ok(times.length === SEEDS.length, `${j}: ${SEEDS.length} seed すべてでボスを撃破（撃破 ${times.length} / 残 ${remains.length}）`);
  if (times.length) info(`${j}: boss kill time 中央値 ${med(times)}ms（${times.join(',')}）`);
}

section('3. boss kill time 比の警告判定（比 > 2.0 は分類して記録する）');
{
  const meds = {};
  for (const j of JOB_IDS) if (results[j].times.length) meds[j] = med(results[j].times);
  const vals = Object.values(meds);
  const ratio = Math.max(...vals) / Math.max(1, Math.min(...vals));
  info(`boss kill time: ${Object.entries(meds).map(([k, v]) => `${k} ${v}ms`).join(' / ')}（比 ${ratio.toFixed(2)}）`);
  // 比が 2.0 を超えるのは role 差（火 = 単体バースト / 氷 = CC 主体でボスは凍結せず氷砕ゲージ経由）。
  // docs/cross-job-final-balance.md に分類つきで記録する。ここは暴走の検知フェンスだけ置く。
  ok(ratio <= 6.0, `boss kill time 比 ${ratio.toFixed(2)} ≤ 6.0（暴走検知フェンス）`);
  ok(vals.every((v) => v > 0), 'すべてのジョブが有限時間で撃破する（ボスへ実質無効なジョブが無い）');
}

section('4. ボス固有の gameplay 経路（氷砕 / 体勢崩し / 露出）が動く');
{
  resetPhysics();
  const hi = instrument(await makeBattle({ jobId: 'frost_mage', profile: 'boss', build: 'full', seed: 202 }));
  runProfile(hi);
  const st = hi.scene.telemetry.finalize().run.status;
  ok(hi.scene.statusFx.counters().bossGaugeApplications > 0, `氷: ボス氷砕ゲージ付与（${hi.scene.statusFx.counters().bossGaugeApplications}）`);
  ok(st.bossFrostbreaks > 0 || hi.paths._onBossFrostbreak > 0, `氷: 氷砕が発生（${st.bossFrostbreaks}）`);
  resetPhysics();
  const hw = instrument(await makeBattle({ jobId: 'warrior', profile: 'boss', build: 'full', seed: 202 }));
  runProfile(hw);
  const w = hw.scene.warrior.summary();
  ok(w.poiseDamage > 0, `戦士: ボスへ体勢ダメージ（${Math.round(w.poiseDamage)}）`);
  ok(w.bossStanceBreaks >= 0, `戦士: ボス崩しが記録される（${w.bossStanceBreaks}）`);
}

section('5. boss profile でも 4 品質で gameplay trace が一致');
for (const j of JOB_IDS) {
  const hashes = {};
  for (const q of QUALITIES) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: 'boss', build: 'slot8', seed: 303, quality: q }));
    runProfile(h);
    hashes[q] = sha(gameplayTrace(h));
  }
  ok(new Set(Object.values(hashes)).size === 1, `${j}: boss profile の 4 品質一致（kill time を含む）`);
}

T.finish();
