// M9-A 横断監査 12/25: runtimeState の 144 スキル横断監査。Node.js 標準機能のみ。
// - serializeState の出力が JSON 安全（関数 / 循環 / Phaser 実体 / オブジェクト参照が無い）
// - restoreState({}) / restoreState(壊れた値) / 二重 restore で例外を投げない
// - 旧セーブ（キー欠落）で起動不能にならない
// 実行: node tests/cross-job-runtime-state.mjs
import { JOB_IDS, poolsOf, runJob, runner } from './cross-job-common.mjs';

const T = runner('runtimeState 横断監査（M9-A）');
const { ok, section, info } = T;

// 値が「素の JSON 値」だけで構成されているか（オブジェクト参照 / 関数 / Phaser 実体の混入検知）。
function plainJson(v, depth = 0) {
  if (v === null) return true;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v);
  if (t === 'string' || t === 'boolean') return true;
  if (t !== 'object' || depth > 4) return false;
  if (Array.isArray(v)) return v.every((x) => plainJson(x, depth + 1));
  if (Object.getPrototypeOf(v) !== Object.prototype) return false; // class インスタンス＝実体参照
  return Object.values(v).every((x) => plainJson(x, depth + 1));
}

for (const jobId of JOB_IDS) {
  const p = poolsOf(jobId);
  const ALL = [...p.active, ...p.evolution];
  section(`${jobId}: 48 件の serialize が JSON 安全・restore が壊れた入力に耐える`);
  const r = await runJob(jobId, { quality: 'high', ids: ALL, steps: 400 });
  const runtime = r.sm.serializeRuntime();
  for (const [id, st] of Object.entries(runtime)) {
    ok(plainJson(st), `${id}: serializeState が素の JSON 値のみ（オブジェクト参照 0）`);
    const round = JSON.parse(JSON.stringify(st));
    ok(JSON.stringify(round) === JSON.stringify(st), `${id}: JSON 往復で不変`);
  }
  // 壊れた入力・旧セーブ耐性（production の restoreRuntime 経由）。
  const garbage = [
    {}, null, undefined, { cdLeft: null }, { cdLeft: {} }, { unknownKey: 1e18 },
    { cdLeft: 'x', spinLeftMs: NaN, leftMs: Infinity, timers: 'broken' },
  ];
  for (const g of garbage) {
    let threw = null;
    try { r.sm.restoreRuntime(Object.fromEntries(ALL.map((id) => [id, g]))); } catch (e) { threw = e; }
    ok(!threw, `${jobId}: restore(${JSON.stringify(g)}) が例外を投げない${threw ? `（${threw.message}）` : ''}`);
  }
  // 二重 restore（同じ状態を 2 回）でも例外なし・結果が安定。
  let threw = null;
  try { r.sm.restoreRuntime(runtime); r.sm.restoreRuntime(runtime); } catch (e) { threw = e; }
  ok(!threw, `${jobId}: 二重 restore が安全`);
  // 未知 id（旧セーブに残った消えたスキル）を無視する。
  try { r.sm.restoreRuntime({ ghost_skill_from_old_save: { cdLeft: 100 } }); } catch (e) { threw = e; }
  ok(!threw, `${jobId}: 未知 id の runtimeState を無視する`);
  info(`${jobId}: runtimeState を保存するスキル ${Object.keys(runtime).length}/${ALL.length}`);
}

section('Scene 終了（destroy）後にスキルが状態を残さない');
for (const jobId of JOB_IDS) {
  const r = await runJob(jobId, { quality: 'high', ids: poolsOf(jobId).active.slice(0, 10), steps: 200 });
  let threw = null;
  try { r.sm.destroy(); } catch (e) { threw = e; }
  ok(!threw, `${jobId}: SkillManager.destroy() が例外なく完了`);
  ok(r.sm.skills.size === 0, `${jobId}: destroy 後にスキルが残らない`);
}

T.finish();
