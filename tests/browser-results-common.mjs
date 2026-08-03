// M9-A.2 共通土台（suite には数えない）。Node.js 標準機能のみ。
// 実ブラウザ実測の**要約**（tests/browser-results/m9a2-results.json）と計画 docs を読むヘルパ。
// CI はブラウザを起動しない。ここで検証するのは「計画が再現可能か」「記録が schema と合格条件を満たすか」。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RESULTS_PATH = join(REPO, 'tests/browser-results/m9a2-results.json');

export function readDoc(rel) { return readFileSync(join(REPO, rel), 'utf8'); }
export function hasDoc(rel) { return existsSync(join(REPO, rel)); }
export function results() { return JSON.parse(readFileSync(RESULTS_PATH, 'utf8')); }
export function sha(v) { return createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex'); }

export const JOB_IDS = ['flame_witch', 'frost_mage', 'warrior'];
export const QUALITIES = ['low', 'medium', 'high', 'ultra'];
// M9-A.2 の warning 分類（6 種）。
export const VERDICT_CLASSES = ['harness', 'profile', 'role', 'bug', 'balance', 'human-feel'];

// 記録された数値が「実際に測られたもの」であることの最低条件（プレースホルダ検出）。
export function isMeasured(v) { return typeof v === 'number' && Number.isFinite(v); }

export function runner(title) {
  let pass = 0; const fails = [];
  return {
    ok(cond, msg) { if (cond) pass++; else { fails.push(msg); console.log(`  ✗ ${msg}`); } },
    section(t) { console.log(t); },
    info(t) { console.log(`  ${t}`); },
    finish() {
      if (fails.length) { console.log(`\n✗ ${title} 失敗: ${fails.length} 件（成功 ${pass}）`); process.exit(1); }
      console.log(`\n✓ ${title} 成功: ${pass} 件すべて通過`);
    },
  };
}
