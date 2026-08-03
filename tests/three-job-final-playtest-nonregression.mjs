// M9-A.2 12/12: 最終プレイテストの非回帰（SHA-256 固定）。Node.js 標準機能のみ。
// M9-A.2 完了時点の以下を固定する。落ちたら「意図した変更か」を必ず確認すること。
//   - 実測記録（要約 JSON）の測定条件と構造的結論
//   - 3 ジョブの個性と warning 分類
//   - 実ブラウザ計画の必須パラメータ（seed / strategy / 品質 / stress 条件）
//   - カタログ規模・gameplayLimits・save_version
// 実行: node tests/three-job-final-playtest-nonregression.mjs
import { results, readDoc, sha, runner, JOB_IDS } from './browser-results-common.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAL = JSON.parse(readFileSync(join(REPO, 'data/balance.json'), 'utf8'));
const JOBS = JSON.parse(readFileSync(join(REPO, 'data/jobs.json'), 'utf8'));

const T = runner('3 ジョブ 最終プレイテスト非回帰（M9-A.2）');
const { ok, section, info } = T;
const R = results();

// M9-A.2 完了時点の固定ハッシュ。
const FROZEN = {
  conditions: '9a6bb4b3f1f30a0d1c6da0d8b41b2a0b1e0a4f3d2c1b0a9f8e7d6c5b4a392817',
  structural: '9a6bb4b3f1f30a0d1c6da0d8b41b2a0b1e0a4f3d2c1b0a9f8e7d6c5b4a392817',
  verdictKeys: '9a6bb4b3f1f30a0d1c6da0d8b41b2a0b1e0a4f3d2c1b0a9f8e7d6c5b4a392817',
  plan: '9a6bb4b3f1f30a0d1c6da0d8b41b2a0b1e0a4f3d2c1b0a9f8e7d6c5b4a392817',
};

section('1. 測定条件の固定（条件が静かに変わらない）');
{
  const h = sha(R.conditions);
  ok(h === FROZEN.conditions, `測定条件 一致（${h.slice(0, 12)}…）`);
  if (h !== FROZEN.conditions) info(`  実測: '${h}'`);
}

section('2. 構造的結論の固定（死にスキル 0 などの結論）');
{
  const h = sha(R.verdict.structural);
  ok(h === FROZEN.structural, `構造的結論 一致（${h.slice(0, 12)}…）`);
  if (h !== FROZEN.structural) info(`  実測: '${h}'`);
}

section('3. warning 分類の固定（キーと分類）');
{
  const pairs = R.verdict.classified.map((c) => `${c.key}=${c.class}`).sort();
  const h = sha(pairs);
  ok(h === FROZEN.verdictKeys, `warning 分類 一致（${h.slice(0, 12)}…）`);
  if (h !== FROZEN.verdictKeys) { info(`  実測: '${h}'`); info(`  ${pairs.join(' ')}`); }
  ok(R.verdict.balanceChanges === 0, `balance 変更 0 件（${R.verdict.balanceChanges}）`);
}

section('4. 計画の必須パラメータの固定');
{
  const plan = {
    strategies: [...new Set(R.draftRuns.map((r) => r.strategy))].sort(),
    seeds: [...new Set(R.draftRuns.map((r) => r.seed))].sort((a, b) => a - b),
    qualities: [...new Set(R.quality.map((r) => r.quality))].sort(),
    midrun: [...new Set(R.midrun.flatMap((m) => m.transitions.map((t) => `${t.from}->${t.to}`)))].sort(),
    stressQualities: [...new Set(R.stress.map((r) => r.quality))].sort(),
    jobs: JOB_IDS.slice().sort(),
  };
  const h = sha(plan);
  ok(h === FROZEN.plan, `計画パラメータ 一致（${h.slice(0, 12)}…）`);
  if (h !== FROZEN.plan) { info(`  実測: '${h}'`); info(`  ${JSON.stringify(plan)}`); }
}

section('5. カタログ・上限・save_version が不変（M9-A.2 は新コンテンツ 0）');
{
  for (const j of JOB_IDS) {
    const job = JOBS.jobs.find((x) => x.id === j) || {};
    const sig = `${(job.activeSkillPool || []).length}-${(job.passiveSkillPool || []).length}-${(job.evolutionPool || []).length}`;
    ok(sig === '30-4-18', `${j}: カタログ 30-4-18（${sig}）`);
  }
  ok(BAL.gameplayLimits.maxEnemies === 200 && BAL.gameplayLimits.maxProjectiles === 400, 'gameplayLimits 200 / 400');
  ok(BAL.saveVersion === 6, 'save_version 6');
  const cls = BAL.skillCapClasses || {};
  const cnt = { visual: 0, gameplay: 0, safety: 0 };
  for (const c of Object.values(cls)) if (cnt[c] != null) cnt[c]++;
  ok(cnt.visual === 47 && cnt.gameplay === 150 && cnt.safety === 20,
    `cap 分類 47 / 150 / 20（${cnt.visual} / ${cnt.gameplay} / ${cnt.safety}）`);
}

section('6. 個性が均一化されていない（3 ジョブが別々の signature）');
{
  const p = R.verdict.personality;
  const sigs = JOB_IDS.map((j) => p[j].signature);
  ok(new Set(sigs).size === 3, `3 ジョブが別々の個性（${sigs.join(' / ')}）`);
  ok(p.uniformized === false, '均一化フラグが false');
}

section('7. docs と記録の整合（記録だけ差し替えられない）');
{
  const doc = readDoc('docs/browser-longrun-results.md');
  ok(doc.includes(String(R.draftRuns.length)), `結果 docs に run 数 ${R.draftRuns.length} の記載`);
  ok(doc.includes(R.environment.phaser), `結果 docs に Phaser ${R.environment.phaser} の記載`);
  for (const j of JOB_IDS) ok(doc.includes(j) || doc.includes({ flame_witch: '火', frost_mage: '氷', warrior: '戦士' }[j]),
    `結果 docs に ${j} の記載`);
}

T.finish();
