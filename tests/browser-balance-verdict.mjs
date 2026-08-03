// M9-A.2 9/12: 3 ジョブ最終バランス判定。Node.js 標準機能のみ。
// 実ブラウザ実測と M9-A.1 の Node 実測を突き合わせ、warning が 6 分類へ落とされ、
// 明確な bug 以外は自動調整していないことを検証する。
// 実行: node tests/browser-balance-verdict.mjs
import { results, readDoc, runner, JOB_IDS, VERDICT_CLASSES } from './browser-results-common.mjs';

const T = runner('最終バランス判定（M9-A.2）');
const { ok, section, info } = T;
const R = results();
const V = R.verdict;

section('1. verdict の形（分類・balance 変更・bug 修正）');
{
  ok(Array.isArray(V.classified) && V.classified.length > 0, `分類済み warning ${V.classified.length} 件`);
  for (const c of V.classified) {
    ok(VERDICT_CLASSES.includes(c.class), `${c.key} → ${c.class}（既知の 6 分類）`);
    ok(typeof c.observed === 'string' && c.observed.length > 0, `${c.key}: 実測値が記録されている（${c.observed}）`);
    ok(typeof c.reason === 'string' && c.reason.length > 10, `${c.key}: 分類の根拠が書かれている`);
  }
  const keys = new Set(V.classified.map((c) => c.key));
  ok(keys.size === V.classified.length, 'キーの重複なし');
}

section('2. bug 分類は修正済み・balance 分類は 0 件または最小修正の記録がある');
{
  const bugs = V.classified.filter((c) => c.class === 'bug');
  const bal = V.classified.filter((c) => c.class === 'balance');
  info(`bug ${bugs.length} 件 / balance ${bal.length} 件`);
  for (const b of bugs) ok(typeof b.fix === 'string' && b.fix.length > 0, `bug ${b.key}: 修正内容が記録されている（${b.fix}）`);
  for (const b of bal) {
    ok(typeof b.fix === 'string' && b.fix.length > 0, `balance ${b.key}: 変更内容が記録されている`);
    ok(typeof b.beforeAfter === 'string', `balance ${b.key}: 同 seed の前後比較が記録されている`);
  }
  ok(typeof V.balanceChanges === 'number', 'balance 変更件数が記録されている');
  ok(V.balanceChanges === bal.length, `balance 変更件数 ${V.balanceChanges} = balance 分類 ${bal.length}`);
  // 修正不可カテゴリを balance として扱っていないこと。
  const forbidden = ['火normal強', '氷CC強', '戦士防御強', 'DPS差だけ', 'survival差だけ', 'active support低率', 'rarity差'];
  for (const b of bal) ok(!forbidden.some((f) => (b.reason || '').includes(f)), `balance ${b.key}: 修正不可カテゴリを理由にしていない`);
}

section('3. §8 の warning 目安をすべて実測から評価している');
{
  const NEED = ['DPS_RATIO', 'BOSS_KILL_TIME_RATIO', 'SURVIVAL_DIFF', 'DAMAGE_TAKEN_RATIO', 'HEALING_RATIO',
    'TOP_SHARE', 'DEAD_SKILL', 'ACQUIRED_ZERO_UTILITY', 'BOSS_INEFFECTIVE', 'ALL_LAST',
    'TRIPLE_MONOPOLY', 'DRAFT_EVOLUTION_SKEW', 'BROWSER_NODE_DIVERGENCE'];
  const evaluated = new Set((V.evaluated || []).map((e) => e.key));
  for (const k of NEED) ok(evaluated.has(k), `warning 目安 ${k} を評価している`);
  for (const e of (V.evaluated || [])) {
    ok(typeof e.value === 'string' || typeof e.value === 'number', `${e.key}: 実測値がある（${e.value}）`);
    ok(typeof e.exceeded === 'boolean', `${e.key}: 目安超過の判定がある（${e.exceeded}）`);
    if (e.exceeded) ok(V.classified.some((c) => c.key === e.key), `${e.key}: 超過したので分類されている`);
  }
}

section('4. 構造異常が 0 件（死にスキル / zero utility / ボス実質無効）');
{
  const g = V.structural || {};
  ok(g.deadSkills === 0, `死にスキル ${g.deadSkills} 件`);
  ok(g.acquiredZeroUtility === 0, `acquired but zero utility ${g.acquiredZeroUtility} 件`);
  ok(g.zeroHitCasts === 0, `cast > 0 かつ hit 0 の恒常化 ${g.zeroHitCasts} 件`);
  ok(g.bossIneffectiveJobs === 0, `ボスへ実質無効なジョブ ${g.bossIneffectiveJobs} 件`);
  ok(g.allLastJobs === 0, `normal / elite / boss すべて最下位のジョブ ${g.allLastJobs} 件`);
  ok(g.tripleMonopolyJobs === 0, `offense / defense / CC を同時独占するジョブ ${g.tripleMonopolyJobs} 件`);
}

section('5. 3 ジョブの個性が数値として残っている（均一化していない）');
{
  const p = V.personality || {};
  for (const j of JOB_IDS) ok(p[j] && typeof p[j].signature === 'string' && p[j].signature.length > 0,
    `${j}: 個性が記録されている（${p[j] && p[j].signature}）`);
  const sigs = new Set(JOB_IDS.map((j) => p[j].signature));
  ok(sigs.size === 3, '3 ジョブの個性が互いに異なる');
  ok(p.uniformized === false, '数値の均一化を行っていない');
}

section('6. 判定 docs に実測・分類・変更が書かれている');
{
  const doc = readDoc('docs/final-balance-verdict.md');
  for (const [label, re] of [
    ['browser 実測', /実ブラウザ|browser/],
    ['Node 実測との照合', /Node|M9-A\.1/],
    ['6 分類', /harness[\s\S]*profile[\s\S]*role[\s\S]*bug[\s\S]*balance[\s\S]*human-feel/],
    ['balance 変更件数', /balance 変更/],
    ['人間評価の残件', /human-feel|人間/],
    ['boss', /ボス|boss/],
    ['survival', /生存|survival/],
    ['top share', /share|シェア/],
  ]) ok(re.test(doc), `判定 docs に「${label}」の記載`);
  for (const c of V.classified) ok(doc.includes(c.key), `判定 docs に ${c.key} の記載`);
  ok(doc.length > 2500, `判定 docs の分量が十分（${doc.length} 文字）`);
}

section('7. 3 ジョブの実測サマリが揃っている');
for (const j of JOB_IDS) {
  const s = (V.perJob || {})[j];
  ok(!!s, `${j}: サマリがある`);
  if (!s) continue;
  for (const k of ['dps', 'kills', 'survivalSec', 'damageTaken', 'healing', 'topShare', 'bossReached']) {
    ok(k in s, `${j}: ${k} が記録されている（${JSON.stringify(s[k])}）`);
  }
  ok(s.dps > 0 && s.kills > 0, `${j}: DPS ${s.dps} / 撃破 ${s.kills}`);
}

T.finish();
