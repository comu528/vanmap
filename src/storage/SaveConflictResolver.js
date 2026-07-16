// SaveConflictResolver（Milestone 5-B）: ブラウザ内データとフォルダ内データが両方存在する場合の
// 競合検出と推奨の算出。最終決定はユーザーに委ね、更新日時だけで自動決定しない。
// DOM 非依存の純粋な JS（Node からテスト可能）。

import { num, obj } from '../systems/profileSchema.js';

const UPDATED_AT_THRESHOLD_MS = 2000; // これ以上離れていれば「大きく異なる」とみなす

// profile / active_run のペイロードから競合判定に使うメタ情報を抽出する。
export function extractMeta(profilePayload, activeRunPayload, envelope) {
  const p = obj(profilePayload);
  const st = obj(p.statistics);
  const cc = obj(p.currentCycle);
  const ar = obj(activeRunPayload);
  const env = obj(envelope);
  return {
    saveId: env.saveId || null,
    writerId: env.writerId || null,
    updatedAt: env.updatedAt || p.updated_at || null,
    saveVersion: num(p.save_version, num(env.saveVersion, 0)),
    reincarnationCount: num(p.reincarnationCount, 0),
    lifetimeSoulflame: num(p.lifetimeSoulflame, 0),
    lifetimeEmbers: num(p.lifetimeEmbers, 0),
    totalPlayTime: num(st.totalPlayTime, 0),
    highestEverDifficulty: num(p.highestEverDifficulty, 0),
    cycleNumber: num(cc.cycleNumber, 0),
    hasActiveRun: !!ar.inProgress,
    activeElapsed: num(ar.elapsedSec, 0),
    activeCycleNumber: ar.inProgress ? num(ar.cycleNumber, 0) : null,
  };
}

const time = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };

// 進行度スコア（比較補助）。単純加重で、どちらが「進んでいるか」の目安に使う。
export function progressScore(m) {
  return num(m.reincarnationCount) * 1e9
    + num(m.lifetimeSoulflame) * 1e6
    + num(m.lifetimeEmbers) * 10
    + num(m.totalPlayTime);
}

// 競合検出。browser/folder は { present, meta } の形。
export function detectConflict(browser, folder) {
  const reasons = [];
  if (!browser?.present || !folder?.present) return { conflict: false, reasons };
  const a = browser.meta, b = folder.meta;
  if (a.saveId && b.saveId && a.saveId !== b.saveId) reasons.push('saveId が異なる');
  if (Math.abs(time(a.updatedAt) - time(b.updatedAt)) > UPDATED_AT_THRESHOLD_MS) reasons.push('更新日時が大きく異なる');
  if (a.writerId && b.writerId && a.writerId !== b.writerId) reasons.push('別の書き込み主体(writerId)による更新');
  // 一方だけ進行度が高い軸がある（分岐）
  const axes = ['reincarnationCount', 'lifetimeSoulflame', 'lifetimeEmbers', 'totalPlayTime', 'highestEverDifficulty'];
  let aHigher = false, bHigher = false;
  for (const k of axes) { if (num(a[k]) > num(b[k])) aHigher = true; else if (num(b[k]) > num(a[k])) bHigher = true; }
  if (aHigher && bHigher) reasons.push('進行度が軸ごとに食い違っている（どちらかが一方的に新しくない）');
  // active_run と profile の cycleNumber 不一致（各サイドの整合）
  if (a.hasActiveRun && a.activeCycleNumber !== a.cycleNumber) reasons.push('ブラウザ側の active_run と profile の cycleNumber 不一致');
  if (b.hasActiveRun && b.activeCycleNumber !== b.cycleNumber) reasons.push('フォルダ側の active_run と profile の cycleNumber 不一致');
  return { conflict: reasons.length > 0, reasons };
}

// 推奨の算出（自動決定はしない・あくまで目安）。
export function recommend(browser, folder) {
  if (!browser?.present && !folder?.present) return { recommended: null, reasons: ['どちらのデータも存在しません'] };
  if (!browser?.present) return { recommended: 'folder', reasons: ['ブラウザ内データがありません'] };
  if (!folder?.present) return { recommended: 'browser', reasons: ['フォルダ内データがありません'] };
  const a = browser.meta, b = folder.meta;
  const sa = progressScore(a), sb = progressScore(b);
  const reasons = [];
  let recommended;
  if (sa > sb) { recommended = 'browser'; reasons.push('ブラウザ内データの方が進行度が高い'); }
  else if (sb > sa) { recommended = 'folder'; reasons.push('フォルダ内データの方が進行度が高い'); }
  else {
    // 進行度が同等なら更新日時で補助（それでも最終決定はユーザー）
    const ta = time(a.updatedAt), tb = time(b.updatedAt);
    if (ta >= tb) { recommended = 'browser'; reasons.push('進行度は同等・ブラウザ内データの方が新しい'); }
    else { recommended = 'folder'; reasons.push('進行度は同等・フォルダ内データの方が新しい'); }
  }
  return { recommended, reasons };
}
