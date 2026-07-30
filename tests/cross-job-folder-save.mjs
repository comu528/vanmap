// M9-A 横断監査 17/25: folder save / browser save の 3 ジョブ往復。Node.js 標準機能のみ。
// production の SaveValidator（エンベロープ / checksum / sanitize）と SaveConflictResolver /
// SaveCoordinator（MemoryStorageAdapter）を 3 ジョブぶんの payload で駆動する。
// 実行: node tests/cross-job-folder-save.mjs
import { runner, JOB_IDS } from './cross-job-common.mjs';
import { makeEnvelope, verifyEnvelope, checksum, stableStringify, validateImportBundle, sanitize } from '../src/storage/SaveValidator.js';
import { extractMeta, detectConflict, recommend } from '../src/storage/SaveConflictResolver.js';
import { MemoryStorageAdapter } from '../src/storage/MemoryStorageAdapter.js';
import { SaveCoordinator } from '../src/storage/SaveCoordinator.js';
import { defaultProfile, migrateProfile } from '../src/systems/profileSchema.js';

const T = runner('folder save 横断監査（M9-A）');
const { ok, section, info } = T;
let t = 1700000000000;
const nowMs = () => (t += 1000);
const nowIso = () => new Date(1700000000000).toISOString();

const mkProfile = (jobId) => {
  const p = defaultProfile(6, '0.6.0');
  p.selectedJobId = jobId;
  p.active_run = {
    jobId, difficulty: 1, timeSec: 60,
    skillRuntime: { some_skill: { cdLeft: 500 } },
    warriorState: jobId === 'warrior' ? { fury: 20, combo: 3 } : null,
  };
  return p;
};

section('1. 3 ジョブの payload がエンベロープ往復で不変（checksum つき）');
for (const j of JOB_IDS) {
  const p = mkProfile(j);
  const env = makeEnvelope({ type: 'profile', payload: p, saveVersion: 6, gameVersion: '0.6.0', writerId: 'w1', nowIso: nowIso() });
  const v = verifyEnvelope(env);
  ok(v.ok, `${j}: エンベロープ検証 ok`);
  ok(checksum(stableStringify(env.payload)) === env.checksum, `${j}: checksum 一致`);
  ok(JSON.stringify(env.payload.active_run) === JSON.stringify(p.active_run), `${j}: active_run が往復で不変`);
}

section('2. 改ざん / 危険キーの拒否');
{
  const p = mkProfile('warrior');
  const env = makeEnvelope({ type: 'profile', payload: p, saveVersion: 6, gameVersion: '0.6.0', writerId: 'w1', nowIso: nowIso() });
  env.payload.embers = 99999;
  ok(!verifyEnvelope(env).ok, 'payload 改ざんは checksum で検出される');
  const dirty = sanitize(JSON.parse('{"selectedJobId":"warrior","__proto__":{"evil":1}}'));
  ok(!Object.prototype.hasOwnProperty.call(dirty, '__proto__') && ({}).evil === undefined, '危険キーが除去される（プロトタイプ非汚染）');
}

section('3. browser ⇄ folder の競合検出（ジョブが違う 2 つの保存）');
{
  const pa = mkProfile('flame_witch'); pa.statistics.totalRuns = 10;
  const pb = mkProfile('warrior'); pb.statistics.totalRuns = 3;
  const browser = { present: true, meta: extractMeta(pa, null, { saveId: 'A', writerId: 'wA', updatedAt: '2026-07-30T01:00:00Z' }) };
  const folder = { present: true, meta: extractMeta(pb, null, { saveId: 'B', writerId: 'wB', updatedAt: '2026-07-30T02:00:00Z' }) };
  const det = detectConflict(browser, folder);
  ok(!!det, '競合検出が動く');
  const rec = recommend(browser, folder);
  ok(!!rec, '推奨（recommend）が返る');
  info(`recommend: ${JSON.stringify(rec).slice(0, 120)}`);
}

section('4. SaveCoordinator: ジョブ切替を挟んだ保存が最新だけ残る');
{
  const primary = new MemoryStorageAdapter({ nowIso: nowIso() });
  const coord = new SaveCoordinator({
    primary, config: { autosaveDebounceMs: 100, autoBackupMinIntervalSec: 999999 },
    meta: { saveVersion: 6, gameVersion: '0.6.0', writerId: 'wX' }, nowMs, nowIso, schedule: () => null,
  });
  for (const j of ['flame_witch', 'frost_mage', 'warrior']) coord.notify('profile', mkProfile(j));
  await coord.flushNow();
  const stored = await primary.read('profile');
  ok(stored.payload.selectedJobId === 'warrior', '最後のジョブの保存だけが残る（coalesce）');
  ok(primary.writeLog.filter((w) => w.type === 'profile').length === 1, '書き込みは 1 回（古い保存が新しい保存を潰さない）');
}

section('5. import bundle の検証が 3 ジョブの active_run を受け入れ、壊れたものを拒否');
{
  for (const j of JOB_IDS) {
    const p = migrateProfile(mkProfile(j), 6, '0.6.0');
    ok(p.selectedJobId === j, `${j}: migrate 後もジョブ保持`);
  }
  const badBundle = { not_a_bundle: true };
  ok(!validateImportBundle(badBundle, {}).ok, '壊れた import bundle を拒否');
}

T.finish();
