// M9-A.2 1/12: 長時間プレイテストのゲート（計画・環境・記録の存在と誠実さ）。Node.js 標準機能のみ。
// CI はブラウザを起動しない。ここで検証するのは:
//   - 計画 docs が再現可能な形で存在する
//   - 実測記録（要約 JSON）が存在し、環境と条件が明示されている
//   - 「未確認」が誇張されずに残っている（20 秒確認を長時間確認と言い換えていない）
//   - 必須依存（npm / build / Playwright）をリポジトリへ入れていない
// 実行: node tests/browser-longrun-gate.mjs
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, RESULTS_PATH, readDoc, hasDoc, results, runner, JOB_IDS } from './browser-results-common.mjs';

const T = runner('実ブラウザ長時間プレイテスト ゲート（M9-A.2）');
const { ok, section, info } = T;

section('1. 計画・結果・判定・人間評価の docs が存在する');
for (const f of ['docs/browser-longrun-playtest.md', 'docs/browser-longrun-results.md',
  'docs/final-balance-verdict.md', 'docs/human-playtest-gate.md',
  'docs/browser-validation-gate.md', 'docs/browser-validation-result-template.md']) {
  ok(hasDoc(f), `${f} が存在する`);
}
ok(existsSync(RESULTS_PATH), 'tests/browser-results/m9a2-results.json が存在する');

section('2. 計画 docs が再現可能（環境・条件・合否が書かれている）');
{
  const p = readDoc('docs/browser-longrun-playtest.md');
  for (const [label, re] of [
    ['静的配信', /http-server|http\.server/],
    ['URL', /index\.html\?debug=1/],
    ['viewport', /1024×768|1024x768/],
    ['Phaser 版', /3\.90\.0/],
    ['difficulty 固定', /difficulty\s*\|?\s*1|difficulty 1/],
    ['倍速', /2 倍|2倍|speedModes/],
    ['9 run', /最低 9 run|9 run/],
    ['3 strategy', /evolution-first[\s\S]*balanced[\s\S]*random-valid/],
    ['seed', /20260803|771103|4242424/],
    ['合否', /合否|最低合格/],
    ['未確認の扱い', /未確認/],
    ['直列実行の理由', /直列|並列/],
    ['必須依存なし', /必須依存|リポジトリへは入れない|コミットしない/],
    ['Pages 本番未確認', /本番 URL/],
  ]) ok(re.test(p), `計画に「${label}」の記載がある`);
  ok(p.length > 3000, `計画の分量が十分（${p.length} 文字）`);
}

section('3. 記録に環境と共通条件が入っている');
{
  const r = results();
  ok(r.milestone === 'M9-A.2', `milestone = M9-A.2（${r.milestone}）`);
  ok(typeof r.recordedAt === 'string' && /\d{4}-\d{2}-\d{2}/.test(r.recordedAt), `recordedAt が日付（${r.recordedAt}）`);
  const e = r.environment || {};
  for (const k of ['browser', 'phaser', 'viewport', 'url', 'server', 'commit']) {
    ok(typeof e[k] === 'string' && e[k].length > 0, `environment.${k} が記録されている（${e[k]}）`);
  }
  ok(e.phaser === '3.90.0', 'Phaser 3.90.0');
  ok('pagesProductionUrl' in e, 'GitHub Pages 本番 URL の可否が明示されている');
  const c = r.conditions || {};
  for (const k of ['difficulty', 'speed', 'autoMove', 'permanentUpgrades', 'jobLevel', 'mastery', 'debugRun', 'serial']) {
    ok(k in c, `conditions.${k} が記録されている（${JSON.stringify(c[k])}）`);
  }
  ok(c.serial === true, '計測 run は直列で実行された');
  ok(c.debugRun === true, 'run は debugRun として通常統計から分離されている');
}

section('4. 記録されたセクションが計画と対応している');
{
  const r = results();
  for (const k of ['draftRuns', 'defeatRuns', 'evolution', 'resultCycle', 'resume', 'quality',
    'midrun', 'stress', 'uiInput', 'progressionTiers']) {
    ok(Array.isArray(r[k]) && r[k].length > 0, `${k} に記録がある（${Array.isArray(r[k]) ? r[k].length : 'なし'} 件）`);
  }
  ok(r.errorTotals && typeof r.errorTotals.console === 'number', 'errorTotals が記録されている');
  ok(Array.isArray(r.unverified) && r.unverified.length > 0, `未確認項目が残っている（${(r.unverified || []).length} 件）`);
}

section('5. console / pageerror / requestfailed が 0');
{
  const r = results();
  const t = r.errorTotals || {};
  ok(t.console === 0, `console エラー ${t.console}`);
  ok(t.pageerror === 0, `pageerror ${t.pageerror}`);
  ok(t.requestfailed === 0, `requestfailed ${t.requestfailed}`);
  // 個別 run にもエラー 0 が記録されていること（合計だけの詐称を防ぐ）。
  const all = [...r.draftRuns, ...r.quality, ...r.stress, ...r.resume, ...r.evolution, ...r.uiInput];
  const withErrs = all.filter((x) => (x.errors || 0) > 0);
  ok(withErrs.length === 0, `エラーを持つ run 0 件（${withErrs.length}）`);
  ok(all.every((x) => typeof x.errors === 'number'), '全 run が errors 件数を記録している');
}

section('6. 誇張していない（未確認を確認済みと書いていない）');
{
  const docs = ['docs/browser-longrun-playtest.md', 'docs/browser-longrun-results.md',
    'docs/final-balance-verdict.md', 'docs/human-playtest-gate.md'].map(readDoc).join('\n');
  // ★ 禁止表現の検知。**禁止を宣言している文（…と書かない / …しない）は除外**する
  //   （「20 秒の確認を『長時間確認済み』と書かない」のような自己言及で誤検知しないため）。
  const NEG = '(?![^\\n]*(ない|禁止|しません|してはいけない))';
  const banned = [
    [new RegExp(`人間[^\\n]*(体感|評価)[^\\n]*確認済み${NEG}`), '人間の体感を確認済みとしていない'],
    [new RegExp(`自動操作[^\\n]*(楽しさ|面白さ)[^\\n]*(確認|検証)済み${NEG}`), '自動操作で面白さを確認済みとしていない'],
    [new RegExp(`20 ?秒[^\\n]*長時間[^\\n]*確認済み${NEG}`), '20 秒確認を長時間確認と言い換えていない'],
  ];
  for (const [re, msg] of banned) ok(!re.test(docs), msg);
  ok(/人間[^\n]*未確認|体感[^\n]*未確認|manual gate|人間評価/.test(docs), '人間評価が未確認として明記されている');
  const hg = readDoc('docs/human-playtest-gate.md');
  for (const [label, re] of [['楽しいか', /楽し/], ['爽快', /爽快/], ['難しすぎ', /難し/],
    ['氷ボス', /氷[\s\S]{0,30}(ボス|退屈)/], ['戦士が安全', /戦士[\s\S]{0,30}安全/], ['火が強い', /火[\s\S]{0,30}強/]]) {
    ok(re.test(hg), `human gate に「${label}」の項目がある`);
  }
}

section('7. 必須依存を増やしていない');
{
  for (const f of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    'playwright.config.js', 'playwright.config.mjs', 'playwright.config.ts', 'node_modules']) {
    ok(!existsSync(join(REPO, f)), `${f} が存在しない`);
  }
  const bad = [];
  for (const f of readdirSync(join(REPO, 'tests')).filter((x) => x.endsWith('.mjs'))) {
    for (const m of readDoc(join('tests', f)).matchAll(/^\s*import[^\n]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (!m[1].startsWith('.') && !m[1].startsWith('node:')) bad.push(`${f} → ${m[1]}`);
    }
  }
  ok(bad.length === 0, `tests/ に外部パッケージ import が無い（${bad.join(', ') || '0 件'}）`);
  // 記録は「要約」であること（生ログ / スクリーンショットをコミットしない）。
  const dir = join(REPO, 'tests/browser-results');
  const files = readdirSync(dir);
  ok(files.every((f) => f.endsWith('.json')), `browser-results は JSON のみ（${files.join(', ')}）`);
  const bytes = files.reduce((a, f) => a + statSync(join(dir, f)).size, 0);
  ok(bytes < 512 * 1024, `記録の総サイズが小さい（${Math.round(bytes / 1024)} KB < 512 KB）`);
  info(`記録ファイル: ${files.join(', ')}`);
}

section('8. 3 ジョブすべてが全フェーズに登場する');
{
  const r = results();
  for (const phase of ['draftRuns', 'evolution', 'resume', 'quality', 'stress', 'uiInput']) {
    const jobs = new Set(r[phase].map((x) => x.job));
    ok(JOB_IDS.every((j) => jobs.has(j)), `${phase}: 3 ジョブすべてが含まれる（${[...jobs].join(',')}）`);
  }
}

T.finish();
