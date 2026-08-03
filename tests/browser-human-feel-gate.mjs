// M9-A.2 10/12: 人間評価ゲート（external manual gate）。Node.js 標準機能のみ。
// AI の自動操作では判定できない項目が「未確認」として明示的に残り、
// 実施手順と記録様式があることを検証する。**ここで「面白い」と判定してはいけない。**
// 実行: node tests/browser-human-feel-gate.mjs
import { results, readDoc, hasDoc, runner, JOB_IDS } from './browser-results-common.mjs';

const T = runner('人間評価ゲート（M9-A.2）');
const { ok, section, info } = T;
const R = results();

section('1. human gate の docs が存在し、判定不能項目が列挙されている');
{
  ok(hasDoc('docs/human-playtest-gate.md'), 'docs/human-playtest-gate.md が存在する');
  const g = readDoc('docs/human-playtest-gate.md');
  const NEED = [
    ['楽しいか', /楽し/], ['爽快か', /爽快/], ['難易度', /難し|難易度/],
    ['氷のボス戦', /氷[\s\S]{0,60}ボス/], ['戦士の安全度', /戦士[\s\S]{0,60}安全/],
    ['火の強さの体感', /火[\s\S]{0,60}(強|火力)/],
    ['視認性', /視認/], ['操作感', /操作/], ['damage number 過密', /数字|damage number/],
    ['telegraph', /telegraph|予告/],
  ];
  for (const [label, re] of NEED) ok(re.test(g), `human gate に「${label}」の項目がある`);
  ok(/未確認/.test(g), '未確認であることが明記されている');
  ok(/手順|実施方法/.test(g), '実施手順がある');
  ok(/記録|様式|テンプレート/.test(g), '記録様式がある');
  ok(g.length > 1200, `分量が十分（${g.length} 文字）`);
}

section('2. AI が判定したことにしていない');
{
  const docs = ['docs/human-playtest-gate.md', 'docs/browser-longrun-results.md',
    'docs/final-balance-verdict.md', 'docs/browser-longrun-playtest.md'].map(readDoc).join('\n');
  for (const [re, msg] of [
    [/(自動|AI)[^\n]*(楽しさ|面白さ|爽快)[^\n]*(判定|確認)済み/, 'AI が面白さを判定済みとしていない'],
    [/体感[^\n]*確認済み/, '体感を確認済みとしていない'],
    [/難易度[^\n]*(妥当|適切)であることを確認/, '難易度の妥当性を確認済みとしていない'],
  ]) ok(!re.test(docs), msg);
}

section('3. 未確認リストが実測記録側にもある');
{
  ok(Array.isArray(R.unverified) && R.unverified.length >= 4, `未確認項目 ${R.unverified.length} 件`);
  const joined = R.unverified.join(' ');
  for (const [label, re] of [
    ['人間の体感', /体感|人間|手入力/],
    ['GitHub Pages 本番', /Pages|本番/],
    ['実機', /実機|スマート|モバイル/],
  ]) ok(re.test(joined), `未確認に「${label}」が含まれる`);
  ok(R.humanFeelGate && R.humanFeelGate.status === 'open', 'human-feel gate が open（未実施）として記録されている');
  ok(Array.isArray(R.humanFeelGate.items) && R.humanFeelGate.items.length >= 6,
    `human-feel gate に ${R.humanFeelGate?.items?.length} 項目`);
}

section('4. verdict に human-feel 分類が存在し、balance 変更の根拠にしていない');
{
  const hf = (R.verdict.classified || []).filter((c) => c.class === 'human-feel');
  ok(hf.length >= 1, `human-feel 分類 ${hf.length} 件`);
  for (const c of hf) {
    ok(!c.fix, `${c.key}: human-feel を根拠に修正していない`);
    ok(/未確認|人間|manual/.test(c.reason), `${c.key}: 人間確認待ちであることが理由に書かれている`);
  }
}

section('5. 自動で確認できた構造項目は human gate と重複していない');
{
  const ui = R.uiInput;
  for (const j of JOB_IDS) {
    const u = ui.find((x) => x.job === j);
    ok(!!u, `${j}: UI / 入力の構造確認がある`);
    if (!u) continue;
    for (const k of ['movedByKeyboard', 'dashWorked', 'autoToggled', 'pauseWorked', 'resumeWorked',
      'hudTextsPresent', 'f8OpenClose', 'f10OpenClose', 'levelUpUiRendered']) {
      ok(u[k] === true, `${j}: ${k}（構造として確認済み）`);
    }
    ok(u.levelUpChoices >= 2, `${j}: level-up 選択肢が ${u.levelUpChoices} 件描画される`);
  }
}

T.finish();
