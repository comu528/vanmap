// M9-A.1 11/15: 横断ハーネスの決定論（§10）。Node.js 標準機能のみ。
// production の全経路（弾 / DoT / 場 / reactive / spawn / boss）を通したうえで
//   - 同 seed・同 profile・同 job → gameplay trace が完全一致
//   - seed を変えると trace が変わる（seed が実際に効いている）
//   - Math.random を使っていない（RNG は seed 由来だけ）
// を確認する。品質差の検査は cross-job-quality-full-invariance が担当。
// 実行: node tests/cross-job-balance-determinism.mjs
import { JOB_IDS, PROFILES, makeBattle, runProfile, gameplayTrace, collectMetrics, sha, HEAVY, runner, readSrc } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('横断ハーネスの決定論（M9-A.1）');
const { ok, section, info } = T;

const PROFS = HEAVY ? ['normal', 'elite', 'boss', 'survival'] : ['normal', 'boss'];
const SEEDS = HEAVY ? [1234, 4321, 999] : [1234, 4321];

const traceOf = async (jobId, profile, seed, build = 'slot8') => {
  resetPhysics();
  const h = await makeBattle({ jobId, profile, seed, build });
  runProfile(h);
  return { trace: gameplayTrace(h), metrics: collectMetrics(h), h };
};

section('1. 同 seed・同 profile の 2 回実行が gameplay trace まで完全一致');
for (const j of JOB_IDS) {
  for (const p of PROFS) {
    const a = await traceOf(j, p, SEEDS[0]);
    const b = await traceOf(j, p, SEEDS[0]);
    const ha = sha(a.trace); const hb = sha(b.trace);
    ok(ha === hb, `${j} / ${p}: trace 一致（${ha.slice(0, 12)}…）`);
    if (ha !== hb) {
      for (const k of Object.keys(a.trace)) {
        if (sha(a.trace[k]) !== sha(b.trace[k])) info(`  差分キー: ${k}`);
      }
    }
    ok(a.metrics.offense.totalDamage === b.metrics.offense.totalDamage,
      `${j} / ${p}: 総ダメージ一致（${a.metrics.offense.totalDamage}）`);
    ok(a.metrics.offense.kills === b.metrics.offense.kills, `${j} / ${p}: kill 一致（${a.metrics.offense.kills}）`);
    ok(sha(a.metrics.paths) === sha(b.metrics.paths), `${j} / ${p}: 経路カウント一致`);
  }
}

section('2. seed を変えると trace が変わる（seed が実際に gameplay を動かしている）');
for (const j of JOB_IDS) {
  const hashes = [];
  for (const s of SEEDS) hashes.push(sha((await traceOf(j, 'normal', s)).trace));
  const uniq = new Set(hashes);
  ok(uniq.size === hashes.length, `${j}: ${SEEDS.length} seed が ${uniq.size} 通りの trace（seed 無視ではない）`);
}

section('3. ジョブを変えると trace が変わる（job 差が潰れていない）');
{
  const hashes = {};
  for (const j of JOB_IDS) hashes[j] = sha((await traceOf(j, 'normal', SEEDS[0])).trace);
  const uniq = new Set(Object.values(hashes));
  ok(uniq.size === JOB_IDS.length, `3 ジョブが ${uniq.size} 通りの trace（均一化されていない）`);
}

section('4. profile を変えると trace が変わる（profile が効いている）');
{
  const hs = [];
  for (const p of PROFS) hs.push(sha((await traceOf('warrior', p, SEEDS[0])).trace));
  ok(new Set(hs).size === PROFS.length, `${PROFS.length} profile が別々の trace`);
}

section('5. RNG が seed 由来だけである（Math.random 不使用・cursor 再現）');
{
  const stripped = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const files = [
    'tests/cross-job-harness.mjs', 'tests/phaser-stub.mjs',
    'src/scenes/BattleScene.js', 'src/systems/SpawnManager.js', 'src/systems/StatusEffectManager.js',
    'src/systems/SkillManager.js', 'src/entities/Boss.js',
  ];
  for (const f of files) {
    ok(!stripped(readSrc(f)).includes('Math.random'), `${f}: Math.random 不使用`);
  }
  const a = await traceOf('frost_mage', 'normal', SEEDS[0]);
  const b = await traceOf('frost_mage', 'normal', SEEDS[0]);
  ok(a.trace.statusRngCursor === b.trace.statusRngCursor && a.trace.statusRngCursor > 0,
    `status RNG cursor 再現（${a.trace.statusRngCursor}）`);
  ok(a.h.scene.rngSeed === (SEEDS[0] >>> 0), 'scene.rngSeed が渡した seed そのもの');
}

section('6. profile 定義は決定論的（乱数を含まない固定値）');
{
  for (const [id, p] of Object.entries(PROFILES)) {
    // profile に関数 / 乱数を仕込めない（JSON 往復で同一 = 純粋な固定値）ことを確認する。
    ok(JSON.stringify(JSON.parse(JSON.stringify(p))) === JSON.stringify(p), `${id}: profile は JSON 往復で不変な固定値`);
    ok(!Object.values(p).some((v) => typeof v === 'function'), `${id}: profile に関数を含まない`);
    ok(typeof p.dt === 'number' && p.dt > 0, `${id}: dt が固定（${p.dt}ms）`);
    ok(typeof p.durationMs === 'number' && p.durationMs > 0, `${id}: duration が固定（${p.durationMs}ms）`);
  }
}

section('7. 経過時間 / frame 数が run 間で一致（dt 固定・hitStop で frame を止めない）');
{
  const a = await traceOf('flame_witch', 'boss', SEEDS[0]);
  const b = await traceOf('flame_witch', 'boss', SEEDS[0]);
  ok(a.trace.elapsedMs === b.trace.elapsedMs, `elapsedMs 一致（${a.trace.elapsedMs}ms）`);
  ok(a.trace.elapsedMs % PROFILES.boss.dt === 0, 'elapsedMs が dt の整数倍（frame 落ちなし）');
}

T.finish();
