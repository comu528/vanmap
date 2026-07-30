// M9-A 横断監査 25/25: 3 ジョブ システム非回帰（SHA-256 固定）。Node.js 標準機能のみ。
// M9-A 完了時点の以下を固定する。以後の変更でここが落ちたら「意図した変更か」を必ず確認すること。
//   - 3 ジョブの候補列（100 seed × 40 level-up・production SkillDraftManager）
//   - 3 ジョブの runtime trace（active 30 / evolution 18・canonical gameplay cap・quality=high）
//   - cap 分類の件数（visual 47 / gameplay 150 / safety 20）と gameplayLimits
//   - カタログ規模と save_version
// 実行: node tests/three-job-system-nonregression.mjs
import { DATA, JOB_IDS, poolsOf, runJob, runner, simDraft, sha } from './cross-job-common.mjs';

const T = runner('3 ジョブ システム非回帰（M9-A）');
const { ok, section, info } = T;

// M9-A 完了時点（コミット時）の固定ハッシュ。
const FROZEN = {
  flame_witch: {
    draft: '63315bd4691585981d0e764f30ed0c0a9e3dbe6c2e78b3b19490c11e1f7918fb',
    runtime: '9c8b371f85ba77289d53c0f7ecca6c87355dc850da5a1dee65ccf350a7c5755b',
    evoRuntime: '51391bbff0ff04f5c0e22c65c924a21c74ee27f12aeace5ca38c1145a37740db',
  },
  frost_mage: {
    draft: '26583f3f4e7795b8447606ebef1d0ea4cb9d81a3545ced1219fabd830494d3f3',
    runtime: '761d6d314a63ef9f4e28c92120a9b30d4a82aa26614a7a65a3bf02c5ea357758',
    evoRuntime: '00932444e27096ab7b6b7a142991d35d152d36a654913469d9461c6cbb3deaa0',
  },
  warrior: {
    draft: '44665af767f80b1dc120ad82133e7a77e7e9719b5bffa8457abb5dc435fc15a1',
    runtime: 'c315c73f35a37d849de375b7a7698dc0575dce129cb36d46fbfe993d23d7a335',
    evoRuntime: 'a6fe85040417c6f1e2b83b02b265b416a1d8d753bd23f6a7a74a3581627b39f9',
  },
};

section('1. 候補列ハッシュ（100 seed × 40 level-up）');
for (const j of JOB_IDS) {
  const seqs = [];
  for (let seed = 1; seed <= 100; seed++) seqs.push(simDraft(j, { seed, slotActive: 6, levelUps: 40 }).candidateSeq.join('|'));
  const h = sha(seqs);
  ok(h === FROZEN[j].draft, `${j}: 候補列 SHA-256 一致（${h.slice(0, 12)}…）`);
}

section('2. runtime trace ハッシュ（canonical gameplay cap・quality=high）');
for (const j of JOB_IDS) {
  const a = await runJob(j, { quality: 'high', ids: poolsOf(j).active, steps: 600 });
  ok(a.hash === FROZEN[j].runtime, `${j}: active 30 の trace 一致（${a.hash.slice(0, 12)}…）`);
  const e = await runJob(j, { quality: 'high', ids: poolsOf(j).evolution, steps: 600 });
  ok(e.hash === FROZEN[j].evoRuntime, `${j}: evolution 18 の trace 一致（${e.hash.slice(0, 12)}…）`);
}

section('3. cap 分類・gameplayLimits・カタログ・save_version の固定');
{
  const cnt = { visual: 0, gameplay: 0, safety: 0 };
  for (const c of Object.values(DATA.balance.skillCapClasses)) if (cnt[c] != null) cnt[c]++;
  ok(cnt.visual === 47 && cnt.gameplay === 150 && cnt.safety === 20, `cap 分類 47/150/20（${cnt.visual}/${cnt.gameplay}/${cnt.safety}）`);
  ok(DATA.balance.gameplayLimits.maxEnemies === 200 && DATA.balance.gameplayLimits.maxProjectiles === 400, 'gameplayLimits 200/400');
  ok(DATA.balance.saveVersion === 6, 'save_version = 6');
  for (const j of JOB_IDS) {
    const p = poolsOf(j);
    ok(p.active.length === 30 && p.passive.length === 4 && p.evolution.length === 18, `${j}: 30/4/18`);
  }
  ok(DATA.skills.length === 90 && DATA.passives.length === 12 && DATA.evolutions.length === 54, '全体 90/12/54');
}

T.finish();
