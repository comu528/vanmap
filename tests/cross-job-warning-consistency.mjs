// M9-A 横断監査 23/25: warning 体系（FLAME_* / FROST_*）の整合。Node.js 標準機能のみ。
// 実行: node tests/cross-job-warning-consistency.mjs
import { runner, readSrc } from './cross-job-common.mjs';
import { spawnSync } from 'node:child_process';
import { FLAME_WARNING_CODES } from '../src/systems/FlameBalanceWarnings.js';
import { FROST_WARNING_CODES } from '../src/systems/FrostBalanceWarnings.js';

const T = runner('warning 体系 横断監査（M9-A）');
const { ok, section, info } = T;

section('1. コードの重複 0・prefix が正しい');
{
  ok(new Set(FLAME_WARNING_CODES).size === FLAME_WARNING_CODES.length, 'FLAME_* に重複なし');
  ok(new Set(FROST_WARNING_CODES).size === FROST_WARNING_CODES.length, 'FROST_* に重複なし');
  ok(FLAME_WARNING_CODES.every((c) => c.startsWith('FLAME_')), 'FLAME prefix 一貫');
  ok(FROST_WARNING_CODES.every((c) => c.startsWith('FROST_')), 'FROST prefix 一貫');
  info(`FLAME ${FLAME_WARNING_CODES.length} 件 / FROST ${FROST_WARNING_CODES.length} 件`);
}

section('2. ジョブ名だけ違う同義コードの threshold 整合');
{
  const flameSrc = readSrc('src/systems/FlameBalanceWarnings.js');
  const frostSrc = readSrc('src/systems/FrostBalanceWarnings.js');
  // 両者に共通する意味のコード（UNUSED_CAP / DEAD_FIELD 等）は severity が一致する。
  const sevOf = (src, code) => (src.match(new RegExp(`'${code}'[^\\]]*'(low|medium|high)'`)) || [])[1] || null;
  for (const pair of [['FLAME_UNUSED_CAP', 'FROST_UNUSED_CAP'], ['FLAME_DEAD_FIELD', 'FROST_DEAD_FIELD']]) {
    const a = sevOf(flameSrc, pair[0]), b = sevOf(frostSrc, pair[1]);
    if (a && b) ok(a === b, `${pair[0]} と ${pair[1]} の severity が一致（${a}）`);
    else ok(true, `${pair.join(' / ')}: 片方に無い（ジョブ固有）`);
  }
}

section('3. 戦士に warning システムが無いのは意図（documented note）');
{
  let missing = true;
  try { readSrc('src/systems/WarriorBalanceWarnings.js'); missing = false; } catch { missing = true; }
  ok(missing, 'WarriorBalanceWarnings.js は存在しない（戦士は M8-C から警告 0 の実測が続き、warning 群は completion テストが担う設計）');
}

section('4. validate-data が 0 error / 0 warning');
{
  const r = spawnSync(process.execPath, ['tests/validate-data.mjs'], { encoding: 'utf8' });
  ok(r.status === 0, `validate-data 終了コード 0（${r.status}）`);
  ok(/0 エラー, 0 警告/.test(r.stdout), `validate-data が 0 エラー / 0 警告（${(r.stdout.trim().split('\n').pop() || '').trim()}）`);
}

section('5. 意図的な低率 / 設計差が warning ではなく documented note');
{
  // M7-E / M8-A / M8-F の残留 warning は docs に理由つきで記録され、エラー化されていない。
  const ps = readSrc('docs/project-state.md');
  ok(/FROST_EVOLUTION_LOW_RATE/.test(ps), 'FROST の既知低率が docs に記録されている');
  ok(/理由を記録して\*\*意図的に残している\*\*|理由を記録して残している/.test(ps), 'Open warnings の方針が明記されている');
}

T.finish();
