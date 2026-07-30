// M9-A.1 14/15: 実ブラウザ検証ゲート（§14）。Node.js 標準機能のみ・**新規依存を追加しない**。
// このスイート自身はブラウザを起動しない。確認するのは「ゲートが再現可能な形で存在し、
// Node の結果をブラウザ確認済みと言い換えていないこと」と「実行結果が記録されていること」。
//   - docs/browser-validation-gate.md に手順・確認項目・合否基準がある
//   - docs/browser-validation-result-template.md に記録様式がある
//   - 実施済み / 未実施が **明示的に区別**されて記録されている
//   - リポジトリに npm / build / Playwright の必須依存が入っていない
//   - 静的配信の前提（相対パス・static.yml / validate.yml 維持・pages.yml 不在）が壊れていない
// 実行: node tests/cross-job-browser-gate.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from './cross-job-harness.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(REPO, p), 'utf8');
const T = runner('実ブラウザ検証ゲート（M9-A.1）');
const { ok, section, info } = T;

section('1. ゲート文書が存在し、手順が再現可能である');
{
  ok(existsSync(join(REPO, 'docs/browser-validation-gate.md')), 'docs/browser-validation-gate.md が存在する');
  const g = rd('docs/browser-validation-gate.md');
  // 再現に必要な要素（誰でも同じ手順を踏めること）。
  const need = [
    ['静的配信', /http-server|python3 -m http\.server|静的サーバ/],
    ['起動 URL', /index\.html/],
    ['3 ジョブ', /flame_witch[\s\S]*frost_mage[\s\S]*warrior|火の魔女[\s\S]*氷術師[\s\S]*戦士/],
    ['4 品質', /low[\s\S]*medium[\s\S]*high[\s\S]*ultra/],
    ['合否基準', /合否|判定基準|PASS|失格/],
    ['console エラー 0', /console|エラー *0|例外 *0/],
    ['FPS', /FPS|fps/],
    ['セーブ', /セーブ|save/],
    ['相対パス', /相対パス/],
    ['未確認の扱い', /未確認/],
  ];
  for (const [label, re] of need) ok(re.test(g), `ゲート文書に「${label}」の記述がある`);
  ok(g.length > 1500, `ゲート文書の分量が十分（${g.length} 文字）`);
  ok(/Playwright|playwright/.test(g), 'ブラウザ自動化の使い方（任意手段）が書かれている');
  ok(/必須依存|依存を追加しない|リポジトリへ追加しない|コミットしない/.test(g),
    '「必須依存にしない」ことが明記されている');
}

section('2. 記録様式（テンプレート）が存在する');
{
  ok(existsSync(join(REPO, 'docs/browser-validation-result-template.md')), 'docs/browser-validation-result-template.md が存在する');
  const t = rd('docs/browser-validation-result-template.md');
  for (const [label, re] of [
    ['実施日', /実施日|日付/],
    ['実施環境', /環境|ブラウザ|OS/],
    ['コミット', /コミット|commit/],
    ['結果欄', /結果|PASS|FAIL/],
    ['未確認欄', /未確認/],
  ]) ok(re.test(t), `テンプレートに「${label}」欄がある`);
}

section('3. 実施 / 未実施が明示的に区別されて記録されている');
{
  const g = rd('docs/browser-validation-gate.md');
  // 「実施した内容」と「実施していない内容」の両方が節として存在すること。
  ok(/##[^\n]*(実施した|実行した|実施結果)/.test(g), '「実施した内容」の節がある');
  ok(/##[^\n]*(未確認|実施していない)/.test(g), '「未確認の内容」の節がある');
  // Node の結果をブラウザ確認済みと言い換えていないこと（禁止表現の検査）。
  const banned = [
    /Node[^\n]*(で|の)[^\n]*実ブラウザ(で)?(確認|検証)済み/,
    /ヘッドレス[^\n]*実機[^\n]*同等と(みなす|する)/,
  ];
  for (const re of banned) ok(!re.test(g), `禁止表現を含まない: ${re.source.slice(0, 28)}…`);
  // 実プレイの体感 / 実機 FPS を「確認済み」と書いていないこと。
  ok(/体感[^\n]*未確認|実機[^\n]*未確認|人間[^\n]*未確認/.test(g),
    '実機・体感が未確認であることを明記している');
}

section('4. 必須依存を増やしていない（npm / build / Playwright をリポジトリへ入れない）');
{
  for (const f of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig.json',
    'playwright.config.js', 'playwright.config.mjs', 'playwright.config.ts', 'node_modules']) {
    ok(!existsSync(join(REPO, f)), `${f} が存在しない`);
  }
  // tests/ の全 mjs が Node 標準 + 相対 import だけで動くこと（外部パッケージ import 0）。
  const bad = [];
  for (const f of readdirSync(join(REPO, 'tests')).filter((f) => f.endsWith('.mjs'))) {
    const src = rd(join('tests', f));
    for (const m of src.matchAll(/^\s*import[^\n]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('node:')) continue;
      bad.push(`${f} → ${spec}`);
    }
  }
  ok(bad.length === 0, `tests/ に外部パッケージ import が無い（${bad.join(', ') || '0 件'}）`);
  // src/ も同様（CDN の Phaser はグローバル・import しない）。
  const walk = (d, out = []) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p, out); else if (e.endsWith('.js')) out.push(p);
    }
    return out;
  };
  const srcBad = [];
  for (const p of walk(join(REPO, 'src'))) {
    for (const m of readFileSync(p, 'utf8').matchAll(/^\s*import[^\n]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (!m[1].startsWith('.')) srcBad.push(`${p.replace(REPO + '/', '')} → ${m[1]}`);
    }
  }
  ok(srcBad.length === 0, `src/ に外部パッケージ import が無い（${srcBad.join(', ') || '0 件'}）`);
}

section('5. 静的配信の前提が壊れていない');
{
  const idx = rd('index.html');
  ok(/src="\.\/src\/main\.js"/.test(idx), 'エントリポイントが相対パス（./src/main.js）');
  ok(/href="\.\/styles\/main\.css"/.test(idx), 'CSS が相対パス（./styles/main.css）');
  ok(idx.includes('https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js'),
    'Phaser 3.90.0 の CDN URL が固定されている');
  ok(!/(src|href)="\/[^/]/.test(idx), 'index.html にルート絶対パスが無い');
  ok(existsSync(join(REPO, '.github/workflows/static.yml')), '.github/workflows/static.yml が存在する');
  ok(existsSync(join(REPO, '.github/workflows/validate.yml')), '.github/workflows/validate.yml が存在する');
  ok(!existsSync(join(REPO, '.github/workflows/pages.yml')), 'pages.yml が存在しない（再作成禁止）');
  // src / data の参照も相対パス。
  const walk = (d, out = []) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|html|css)$/.test(e)) out.push(p);
    }
    return out;
  };
  const absRefs = [];
  for (const p of [...walk(join(REPO, 'src')), ...walk(join(REPO, 'styles'))]) {
    const s = readFileSync(p, 'utf8');
    for (const m of s.matchAll(/(?:from|url\(|fetch\()\s*['"(]?(\/[a-zA-Z][^'")\s]*)/g)) absRefs.push(`${p.replace(REPO + '/', '')} → ${m[1]}`);
  }
  ok(absRefs.length === 0, `ルート絶対パス参照 0 件（${absRefs.join(', ') || 'なし'}）`);
}

section('6. ゲートが検査する項目が横断監査の測定軸と対応している');
{
  const g = rd('docs/browser-validation-gate.md');
  // Node ハーネスが測る軸のうち、実ブラウザでしか確認できないものが列挙されていること。
  for (const [label, re] of [
    ['描画', /描画|レンダ/],
    ['メモリ', /メモリ|heap/],
    ['入力', /入力|キー|タッチ/],
    ['品質切替', /品質[^\n]*切替|周回中[^\n]*品質/],
    ['gameplay 上限の品質非依存', /敵上限|maxEnemies|上限[^\n]*品質/],
    ['セーブ往復', /セーブ|localStorage/],
  ]) ok(re.test(g), `ゲートに「${label}」の確認項目がある`);
}

section('7. 実行結果が記録され、テストから参照できる');
{
  const g = rd('docs/browser-validation-gate.md');
  // 実施済みの記録には、少なくとも Phaser 版・ジョブ・品質・エラー数が含まれること。
  ok(/3\.90\.0/.test(g), '記録に Phaser 版が含まれる');
  ok(/エラー[^\n]*0|error[^\n]*0/.test(g), '記録に console エラー数が含まれる');
  ok(/maxEnemies|敵上限/.test(g), '記録に gameplay 上限の実測が含まれる');
  const m = g.match(/particleBudget[^\n]*/);
  if (m) info(`記録された品質差の例: ${m[0].slice(0, 90)}`);
  ok(/未確認/.test(g), '記録に未確認項目が併記されている');
}

T.finish();
