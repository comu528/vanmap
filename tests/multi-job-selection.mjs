// M7-A: ジョブ選択・profile 保存・ジョブごとの育成分離のテスト。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrateProfile, defaultProfile } from '../src/systems/profileSchema.js';
import { JobProgressionManager } from '../src/systems/JobProgressionManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(dir, 'data', n), 'utf8'));
const jobs = load('jobs.json').jobs;
const jobProg = load('job-progression.json');
JobProgressionManager.setConfig(jobProg);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

section('1. 旧 profile は火の魔女が選択される・両ジョブが選択可能');
{
  const old = migrateProfile({ embers: 5 }, 6, '0.7.0'); // selectedJobId なし
  ok(old.selectedJobId === 'flame_witch', '旧 profile の既定ジョブは flame_witch');
  ok(Array.isArray(old.unlockedJobs) && old.unlockedJobs.includes('flame_witch') && old.unlockedJobs.includes('frost_mage'), 'unlockedJobs に両ジョブ（氷術師を既定で解放）');
}

section('2. frost_mage 選択の保存・保持');
{
  const p = migrateProfile({ selectedJobId: 'frost_mage' }, 6, '0.7.0');
  ok(p.selectedJobId === 'frost_mage', 'frost_mage 選択が保持される');
  const d = defaultProfile(6, '0.7.0');
  ok(d.selectedJobId === 'flame_witch', '新規 profile の既定は flame_witch');
}

section('3. ジョブ切り替えで他ジョブの育成が消えない（分離）');
{
  const p = migrateProfile({}, 6, '0.7.0');
  // 火の魔女へ XP 付与。
  JobProgressionManager.awardRun(p, 'flame_witch', { win: true, timeSec: 300, normalKills: 100, eliteKills: 2, bossKills: 1, difficultyId: 1, runId: 'r-fw-1' }, {});
  const fwXp = JobProgressionManager.entry(p, 'flame_witch').totalXp;
  // 氷術師へ XP 付与。
  JobProgressionManager.awardRun(p, 'frost_mage', { win: true, timeSec: 200, normalKills: 50, eliteKills: 1, bossKills: 0, difficultyId: 2, runId: 'r-fm-1' }, {});
  const fmXp = JobProgressionManager.entry(p, 'frost_mage').totalXp;
  ok(fwXp > 0 && fmXp > 0, '両ジョブに Job XP が入る');
  ok(JobProgressionManager.entry(p, 'flame_witch').totalXp === fwXp, '氷術師への付与で火の魔女の XP は変わらない');
  // ジョブ切り替え（selectedJobId 変更）は育成データを消さない。
  p.selectedJobId = 'frost_mage';
  ok(JobProgressionManager.entry(p, 'flame_witch').totalXp === fwXp && JobProgressionManager.entry(p, 'frost_mage').totalXp === fmXp, 'ジョブ切替で両ジョブの育成が維持される');
}

section('4. Job XP がジョブごとに分離（二重取得防止も個別）');
{
  const p = migrateProfile({}, 6, '0.7.0');
  const r1 = JobProgressionManager.awardRun(p, 'frost_mage', { win: true, timeSec: 100, normalKills: 10, difficultyId: 1, runId: 'dup' }, {});
  const r2 = JobProgressionManager.awardRun(p, 'frost_mage', { win: true, timeSec: 100, normalKills: 10, difficultyId: 1, runId: 'dup' }, {});
  ok(r1.awarded && !r2.awarded, '同一 runId の二重取得を防ぐ（ジョブ単位）');
  // 火の魔女の同 runId は別ジョブとして付与される。
  const r3 = JobProgressionManager.awardRun(p, 'flame_witch', { win: true, timeSec: 100, normalKills: 10, difficultyId: 1, runId: 'dup' }, {});
  ok(r3.awarded, '別ジョブでは同 runId でも付与される（分離）');
}

section('5. 初期スキルがジョブごとに正しい');
{
  ok(jobs.find((j) => j.id === 'flame_witch').initialActiveSkills[0] === 'fireball', '火の魔女の初期スキルは火球');
  ok(jobs.find((j) => j.id === 'frost_mage').initialActiveSkills[0] === 'frost_shard', '氷術師の初期スキルは氷晶弾');
}

section('6. 転生をまたいでも両ジョブの進捗は維持（migrate 経路で欠落しない）');
{
  const p = migrateProfile({}, 6, '0.7.0');
  JobProgressionManager.awardRun(p, 'frost_mage', { win: true, timeSec: 300, difficultyId: 3, runId: 'x' }, {});
  const before = JobProgressionManager.entry(p, 'frost_mage').totalXp;
  const p2 = migrateProfile(p, 6, '0.7.0'); // 保存→再読込を模す
  ok(JobProgressionManager.entry(p2, 'frost_mage').totalXp === before, '再読込で氷術師の totalXp が維持');
  ok(JobProgressionManager.entry(p2, 'flame_witch').totalXp === 0, '未プレイの火の魔女は 0 で維持（破損しない）');
}

console.log(fail ? `\n✗ 複数ジョブ選択テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 複数ジョブ選択テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
