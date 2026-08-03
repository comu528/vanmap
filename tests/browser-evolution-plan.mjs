// M9-A.2 3/12: 進化の実ブラウザ確認。Node.js 標準機能のみ。
// 各ジョブ 3 種以上の進化を実取得し、base 再提示 0 / 同時所持 0 / reload 二重 0 であることを検証する。
// 通常 draft 到達と debug 取得は区別して記録されていること。
// 実行: node tests/browser-evolution-plan.mjs
import { results, readDoc, runner, JOB_IDS } from './browser-results-common.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(REPO, 'data/skill-evolutions.json'), 'utf8'));
const JOBS = JSON.parse(readFileSync(join(REPO, 'data/jobs.json'), 'utf8'));

const T = runner('進化の実ブラウザ確認（M9-A.2）');
const { ok, section, info } = T;
const R = results();

section('1. 各ジョブ 3 種類以上の進化を実取得している');
for (const j of JOB_IDS) {
  const e = R.evolution.find((x) => x.job === j);
  ok(!!e, `${j}: 進化記録がある`);
  if (!e) continue;
  const all = [...new Set([...(e.viaNormalDraft || []), ...(e.viaDebugGrant || [])])];
  ok(all.length >= 3, `${j}: 実取得した進化 ${all.length} 種 ≥ 3（${all.join(' ')}）`);
  // 記録された進化 id が data に実在し、そのジョブのプールに属すること。
  const pool = (JOBS.jobs.find((x) => x.id === j) || {}).evolutionPool || [];
  ok(all.every((id) => pool.includes(id)), `${j}: すべて自ジョブの evolutionPool 由来`);
  ok(all.every((id) => DATA.evolutions.some((x) => x.id === id)), `${j}: すべて data に実在する`);
}

section('2. 通常 draft 到達と debug 取得を区別して記録している');
for (const e of R.evolution) {
  ok(Array.isArray(e.viaNormalDraft), `${e.job}: viaNormalDraft が配列`);
  ok(Array.isArray(e.viaDebugGrant), `${e.job}: viaDebugGrant が配列`);
  const overlap = (e.viaNormalDraft || []).filter((x) => (e.viaDebugGrant || []).includes(x));
  ok(overlap.length === 0, `${e.job}: 同じ進化を両方に数えていない`);
  info(`${e.job}: 通常 draft ${(e.viaNormalDraft || []).length} 件 / debug 取得 ${(e.viaDebugGrant || []).length} 件`);
}

section('3. active 補助を要求する進化を最低 1 件ずつ確認している');
{
  // data から「active プールのスキルを補助に要求する進化」を求める（低率進化の実体）。
  for (const j of JOB_IDS) {
    const job = JOBS.jobs.find((x) => x.id === j) || {};
    const activePool = job.activeSkillPool || [];
    const withActiveSupport = (job.evolutionPool || []).filter((id) => {
      const ev = DATA.evolutions.find((x) => x.id === id) || {};
      return (ev.requiredSkills || []).some((r) => activePool.includes(r.skill));
    });
    const e = R.evolution.find((x) => x.job === j) || {};
    const got = [...(e.viaNormalDraft || []), ...(e.viaDebugGrant || [])];
    const covered = withActiveSupport.filter((id) => got.includes(id));
    if (withActiveSupport.length === 0) { ok(true, `${j}: active 補助の進化なし（対象外）`); continue; }
    ok(covered.length >= 1, `${j}: active 補助の進化を ${covered.length} 件確認（対象 ${withActiveSupport.length} 件・${covered.join(' ') || 'なし'}）`);
  }
  // 名指しの低率進化（戦士）
  const warrior = R.evolution.find((x) => x.job === 'warrior') || {};
  const got = [...(warrior.viaNormalDraft || []), ...(warrior.viaDebugGrant || [])];
  const named = ['mountain_hurl', 'heaven_crushing_descent', 'heaven_mirror_reversal'].filter((id) =>
    (JOBS.jobs.find((x) => x.id === 'warrior') || {}).evolutionPool.includes(id));
  const namedCovered = named.filter((id) => got.includes(id));
  info(`戦士の低率進化 ${named.join(' ')} のうち確認 ${namedCovered.join(' ') || 'なし'}`);
  ok(named.length === 0 || namedCovered.length >= 1, '名指しの低率進化を最低 1 件ブラウザ確認');
}

section('4. base 再提示 0 / base と evolution の同時所持 0');
for (const e of R.evolution) {
  ok(e.baseReoffered === 0, `${e.job}: 進化後の base 再提示 0（${e.baseReoffered} / 候補 ${e.reofferSampled} 件をサンプル）`);
  ok(e.reofferSampled >= 50, `${e.job}: 再提示の検査で ${e.reofferSampled} 候補をサンプルした`);
  ok(e.baseCoexist === 0, `${e.job}: base と evolution の同時所持 0（${e.baseCoexist}）`);
  ok(e.supportKept === true, `${e.job}: 補助スキルが保持される`);
  ok(e.extraLevelsAfterEvolve === 0, `${e.job}: 進化で余分な Lv が付かない`);
}

section('5. save / reload で進化が二重にならない・runtime を引き継ぐ');
for (const e of R.evolution) {
  ok(e.reloadEvolvedSame === true, `${e.job}: reload 後も進化の集合が同一`);
  ok(e.reloadLevelsSame === true, `${e.job}: reload 後も Lv が同一`);
  ok(e.reloadRuntimeKept === true, `${e.job}: reload 後も runtime / cooldown を引き継ぐ`);
  ok(e.reloadDuplicated === false, `${e.job}: 進化の二重適用なし`);
}

section('6. F8 の進化到達表示が実測と一致する');
for (const e of R.evolution) {
  ok(typeof e.f8EvolutionLine === 'string' && e.f8EvolutionLine.includes('進化到達'), `${e.job}: F8 に進化到達の行がある`);
  const m = e.f8EvolutionLine.match(/進化到達:?\s*(\d+)\s*\/\s*(\d+)/);
  ok(!!m, `${e.job}: F8 の表記が「進化到達 n/18」形式（${e.f8EvolutionLine}）`);
  if (m) {
    ok(Number(m[2]) === 18, `${e.job}: 進化プールが 18（${m[2]}）`);
    ok(Number(m[1]) === e.evolvedAtCheck, `${e.job}: F8 の到達数 ${m[1]} = 実測 ${e.evolvedAtCheck}`);
  }
}

section('7. 通常 draft の 9 run で進化に到達しなかった事実が記録されている');
{
  const evoInDraft = R.draftRuns.reduce((a, r) => a + r.evolutions, 0);
  info(`通常 draft 9 run の進化取得合計 ${evoInDraft} 件`);
  if (evoInDraft === 0) {
    const doc = readDoc('docs/browser-longrun-results.md') + readDoc('docs/final-balance-verdict.md');
    ok(/進化[\s\S]{0,80}0 件|進化に到達しな|進化 0/.test(doc), '進化 0 件の事実が docs に記録されている');
    ok(R.evolution.every((e) => (e.viaDebugGrant || []).length >= 3), '代わりに条件を組んだ取得で 3 種以上を確認している');
  } else {
    ok(true, `通常 draft で ${evoInDraft} 件の進化に到達`);
  }
}

T.finish();
