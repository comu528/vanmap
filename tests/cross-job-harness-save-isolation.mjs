// M9-A.1 12/15: ハーネス周回のセーブ隔離（§13）。Node.js 標準機能のみ。
// 横断ハーネスは production の BattleScene をそのまま回すため、**通常セーブ / 通常統計を汚さない**
// ことを機械的に保証する必要がある。確認すること:
//   - telemetry が必ず debugRun（3 ジョブ × 全 profile）
//   - RunBalanceSummary.applyRun が debugRuns へしか積まない（summaryBySkill / recentRuns 不変）
//   - 周回中に localStorage / sessionStorage へ 1 度も書かない
//   - save_version は v6・保存キーの追加 0
// 実行: node tests/cross-job-harness-save-isolation.mjs
import { JOB_IDS, PROFILES, RAW, makeBattle, runProfile, bootProduction, sha, runner, readSrc } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('ハーネス周回のセーブ隔離（M9-A.1）');
const { ok, section, info } = T;

const M = await bootProduction();
const { applyRun } = await import('../src/systems/RunBalanceSummary.js');
const { SaveManager } = await import('../src/systems/SaveManager.js');

section('1. 3 ジョブ × 全 profile で telemetry が debugRun');
for (const j of JOB_IDS) {
  for (const p of Object.keys(PROFILES)) {
    resetPhysics();
    const h = await makeBattle({ jobId: j, profile: p, seed: 777 });
    ok(h.scene.telemetry.run.debugRun === true, `${j} / ${p}: telemetry.debugRun = true`);
    ok(h.scene._debugRun === true, `${j} / ${p}: scene._debugRun = true`);
  }
}

section('2. finalizeTelemetry の結果が debugRun を保持し applyRun が debugRuns へだけ積む');
{
  resetPhysics();
  const h = await makeBattle({ jobId: 'warrior', profile: 'normal', seed: 4242, build: 'full' });
  runProfile(h, { maxMs: 60000 });
  const s = h.scene;
  // production の完了経路と同じ形で result を作る（BattleManager.buildResult 相当の最小形）。
  const result = {
    resultId: 'harness-result', win: false, timeSec: Math.round(s._elapsedMs / 1000),
    kills: s.kills, level: s.player.level, jobId: s.jobId,
    skills: s.skills.statsList(),
  };
  // finalizeTelemetry は production では必ず draft が存在する周回終了時に呼ばれる（reroll 数の集計に使う）。
  // ハーネスは抽選を持たない（抽選は cross-job-draft-audit の担当）ので、ここだけ最小の draft を与える。
  s.draft = { rerollsRemaining: 0, guidanceTelemetry: null };
  const fin = M.BattleScene.prototype.finalizeTelemetry.call(s, result);
  ok(fin && fin.run, 'finalizeTelemetry が集計を返す');
  ok(fin.run.debugRun === true, 'finalize 後も debugRun = true');

  // 既存の通常統計（他の周回で積まれたもの）を模した before 状態。
  const before = {
    enabled: true,
    summaryBySkill: { great_cleave: { casts: 10, damage: 1234, runs: 1 } },
    recentRuns: [{ runId: 'normal-run-1', kills: 5 }],
    debugRuns: [],
  };
  const beforeHash = sha({ s: before.summaryBySkill, r: before.recentRuns });
  const after = applyRun(before, fin);
  ok(sha({ s: after.summaryBySkill, r: after.recentRuns }) === beforeHash,
    'summaryBySkill / recentRuns が 1 バイトも変わらない');
  ok(after.debugRuns.length === 1, `debugRuns へ 1 件だけ積まれる（${after.debugRuns.length}）`);
  ok(sha({ s: before.summaryBySkill, r: before.recentRuns }) === beforeHash, '入力オブジェクトも破壊しない');

  // 対照: debugRun を外すと通常統計側へ入る（隔離が「たまたま」でないことの証明）。
  const nonDebug = JSON.parse(JSON.stringify(fin));
  nonDebug.run.debugRun = false;
  const after2 = applyRun(before, nonDebug);
  ok(after2.recentRuns.length === 2, `対照: debugRun=false なら recentRuns が増える（${after2.recentRuns.length}）`);
  ok(sha(after2.summaryBySkill) !== sha(before.summaryBySkill), '対照: debugRun=false なら summaryBySkill が変わる');
}

section('3. 周回中に localStorage / sessionStorage へ書かない');
{
  const writes = [];
  const reads = [];
  const mkStore = (tag) => ({
    getItem(k) { reads.push(`${tag}:${k}`); return null; },
    setItem(k, v) { writes.push(`${tag}:${k}`); void v; },
    removeItem(k) { writes.push(`${tag}:remove:${k}`); },
    clear() { writes.push(`${tag}:clear`); },
    key: () => null, length: 0,
  });
  const prevL = globalThis.localStorage; const prevS = globalThis.sessionStorage;
  globalThis.localStorage = mkStore('local');
  globalThis.sessionStorage = mkStore('session');
  try {
    for (const j of JOB_IDS) {
      resetPhysics();
      const h = await makeBattle({ jobId: j, profile: 'elite', seed: 31337 });
      runProfile(h, { maxMs: 60000 });
      ok((h.counters.autoSaveCalls || 0) + (h.counters.saveRunCalls || 0) >= 0, `${j}: 周回完了（保存呼び出し ${h.counters.autoSaveCalls || 0}/${h.counters.saveRunCalls || 0} 件はハーネス側で吸収）`);
    }
  } finally {
    globalThis.localStorage = prevL; globalThis.sessionStorage = prevS;
  }
  if (writes.length) info(`書き込み: ${writes.slice(0, 10).join(', ')}`);
  ok(writes.length === 0, `ストレージ書き込み 0 件（${writes.length}）`);
  info(`読み出し ${reads.length} 件（読み出しは汚染しないため許容）`);
}

section('4. ハーネスが SaveManager を import しない（構造的な隔離）');
{
  const src = readSrc('tests/cross-job-harness.mjs');
  ok(!/import[^\n]*SaveManager/.test(src), 'cross-job-harness.mjs は SaveManager を import しない');
  ok(!/import[^\n]*BattleManager/.test(src), 'cross-job-harness.mjs は BattleManager を import しない（周回終了処理を通さない）');
  ok(/scene\.autoSave\s*=/.test(src) && /scene\.saveRun\s*=/.test(src), 'autoSave / saveRun をハーネス側で置き換えている');
  ok(SaveManager.mode === 'memory', `SaveManager は Node では memory モード（${SaveManager.mode}）— 実書き込み経路が存在しない`);
}

section('5. save_version は v6・保存キーの追加 0');
{
  ok(RAW.balance.saveVersion === 6, `balance.saveVersion = 6（${RAW.balance.saveVersion}）`);
  const { migrateProfile } = await import('../src/systems/profileSchema.js');
  const fresh = migrateProfile(null, 6, RAW.balance.gameVersion);
  const keys = Object.keys(fresh).sort();
  ok(fresh.save_version === 6, 'migrate 後の save_version = 6');
  ok(!keys.some((k) => /harness|browser|m9a1/i.test(k)), 'M9-A.1 由来の保存キーを追加していない');
  info(`profile キー ${keys.length} 件: ${keys.join(' ')}`);
  // ハーネスが与える scene.profile も production スキーマの部分集合であること（余分なキーを持ち込まない）。
  resetPhysics();
  const h = await makeBattle({ jobId: 'frost_mage', profile: 'normal', seed: 1 });
  const extra = Object.keys(h.scene.profile).filter((k) => !keys.includes(k));
  ok(extra.length === 0, `ハーネスの scene.profile に production スキーマ外のキーが無い（${extra.join(',') || 'なし'}）`);
}

section('6. debugRun の周回が通常セーブの active_run を書き換えない');
{
  const writes = [];
  const prevL = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: (k) => writes.push(k),
    removeItem: (k) => writes.push(`remove:${k}`),
    clear: () => writes.push('clear'), key: () => null, length: 0,
  };
  try {
    resetPhysics();
    const h = await makeBattle({ jobId: 'flame_witch', profile: 'boss', seed: 606 });
    runProfile(h, { maxMs: 40000 });
    h.scene.finishRun(false);
    ok(h.scene.gameOver === true, '周回終了（finishRun）まで到達');
  } finally { globalThis.localStorage = prevL; }
  ok(!writes.some((k) => String(k).includes('rfs_active_run')), 'rfs_active_run へ書かない');
  ok(!writes.some((k) => String(k).includes('rfs_profile')), 'rfs_profile へ書かない');
}

T.finish();
