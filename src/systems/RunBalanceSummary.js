// RunBalanceSummary: finalize() 済み run を profile.balanceTelemetry へ畳み込む純ロジック。
// 永続化は呼び出し側（SaveCoordinator 経由）。ここは「形」と「集計」だけを担う。
//
// balanceTelemetry の構造:
//   { enabled:true, summaryBySkill:{ [skillId]: agg }, recentRuns:[...], debugRuns:[...] }
//   agg = { runs, totalDamage, totalDps(=DPS 走査平均), totalCasts, totalKills,
//           evolvedCount, defensiveValue(=走査平均), samples,
//           // 追加（警告生成用の付随情報。加算のため後方互換）:
//           meanDamageShare, capReachedCount, maxFinalLevel }
//
// バウンド（ソフト上限。既定値。data/balance-thresholds.json の telemetry と整合）:
//   maxRecentRuns=10, maxDebugRuns=10, maxSummarySkills=80, softMaxBytes=262144。
//   debugRun は summaryBySkill / recentRuns へは決して入らない（debugRuns 専用）。
//   estimateBytes が softMaxBytes を超える場合、recent/debug を末尾から削って収める（集計は保持）。

const DEFAULTS = {
  maxRecentRuns: 10,
  maxDebugRuns: 10,
  maxSummarySkills: 80,
  softMaxBytes: 262144,
};

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }
function num(x, d = 0) { return isNum(x) ? x : d; }

export function emptyTelemetry() {
  return { enabled: true, summaryBySkill: {}, recentRuns: [], debugRuns: [] };
}

// 欠損/空/壊れた telemetry を安全な既定へ正規化（浅いコピー）。
function normalize(bt) {
  const base = emptyTelemetry();
  if (!bt || typeof bt !== 'object') return base;
  return {
    enabled: bt.enabled !== false,
    summaryBySkill: (bt.summaryBySkill && typeof bt.summaryBySkill === 'object') ? bt.summaryBySkill : {},
    recentRuns: Array.isArray(bt.recentRuns) ? bt.recentRuns : [],
    debugRuns: Array.isArray(bt.debugRuns) ? bt.debugRuns : [],
  };
}

function newAgg() {
  return {
    runs: 0, totalDamage: 0, totalDps: 0, totalCasts: 0, totalKills: 0,
    evolvedCount: 0, defensiveValue: 0, samples: 0,
    meanDamageShare: 0, capReachedCount: 0, maxFinalLevel: 0,
  };
}

// 走査平均: oldMean + (x - oldMean)/n
function runningMean(oldMean, x, n) {
  if (!isNum(x) || n <= 0) return oldMean;
  return oldMean + (x - oldMean) / n;
}

// 1 run の per-skill 統計を summaryBySkill へ畳み込む（summaryBySkill を破壊的更新して返す）。
// 呼び出し側 applyRun がクローンを渡すため、外部の元オブジェクトは汚さない。
export function mergeRunIntoSummary(summaryBySkill, finalizedRun, opts = {}) {
  const out = summaryBySkill && typeof summaryBySkill === 'object' ? summaryBySkill : {};
  if (!finalizedRun || !finalizedRun.skills || typeof finalizedRun.skills !== 'object') return out;
  const maxSkills = num(opts.maxSummarySkills, DEFAULTS.maxSummarySkills);
  for (const [id, s] of Object.entries(finalizedRun.skills)) {
    if (!s || typeof s !== 'object') continue;
    let agg = out[id];
    if (!agg) {
      if (Object.keys(out).length >= maxSkills) continue; // 上限超過の新規は無視（既存は更新）
      agg = newAgg();
      out[id] = agg;
    }
    const n = agg.samples + 1;
    agg.runs += 1;
    agg.totalDamage += num(s.damage);
    agg.totalCasts += num(s.casts);
    agg.totalKills += num(s.kills);
    agg.evolvedCount += s.evolved ? 1 : 0;
    agg.capReachedCount += num(s.capReachedCount);
    agg.totalDps = runningMean(agg.totalDps, num(s.estimatedDps), n);
    agg.defensiveValue = runningMean(agg.defensiveValue, num(s.defensiveValue), n);
    agg.meanDamageShare = runningMean(agg.meanDamageShare, num(s.damageShare), n);
    agg.maxFinalLevel = Math.max(agg.maxFinalLevel, num(s.finalLevel));
    agg.samples = n;
    // NaN/Infinity 混入防止（保険）
    for (const k of Object.keys(agg)) if (!isNum(agg[k])) agg[k] = 0;
  }
  return out;
}

// 先頭へ prepend し maxRecent で打ち切った新配列を返す（元配列は不変）。
export function pushRecentRun(recentRuns, finalizedRun, maxRecent = DEFAULTS.maxRecentRuns) {
  const arr = Array.isArray(recentRuns) ? recentRuns : [];
  if (!finalizedRun) return arr.slice(0, Math.max(0, maxRecent));
  const cap = isNum(maxRecent) && maxRecent > 0 ? Math.floor(maxRecent) : DEFAULTS.maxRecentRuns;
  return [finalizedRun, ...arr].slice(0, cap);
}

// debug 専用バケツ。summaryBySkill / recentRuns とは完全に分離。
export function pushDebugRun(debugRuns, finalizedRun, maxDebug = DEFAULTS.maxDebugRuns) {
  const arr = Array.isArray(debugRuns) ? debugRuns : [];
  if (!finalizedRun) return arr.slice(0, Math.max(0, maxDebug));
  const cap = isNum(maxDebug) && maxDebug > 0 ? Math.floor(maxDebug) : DEFAULTS.maxDebugRuns;
  return [finalizedRun, ...arr].slice(0, cap);
}

function deepCloneSummary(summaryBySkill) {
  const out = {};
  for (const [id, agg] of Object.entries(summaryBySkill || {})) {
    if (agg && typeof agg === 'object') out[id] = { ...agg };
  }
  return out;
}

// 最上位。debugRun は debugRuns のみ。通常 run は summary へ畳み込み + recentRuns。
// 常に NEW な balanceTelemetry を返す（イミュータブル）。欠損 telemetry を許容し、決して throw しない。
export function applyRun(balanceTelemetry, finalizedRun, opts = {}) {
  const cfg = { ...DEFAULTS, ...(opts || {}) };
  let bt;
  try {
    bt = normalize(balanceTelemetry);
    if (!finalizedRun || !finalizedRun.run || typeof finalizedRun.run !== 'object') {
      // 何も畳み込まないが、正規化済みの新オブジェクトを返す。
      return {
        enabled: bt.enabled,
        summaryBySkill: deepCloneSummary(bt.summaryBySkill),
        recentRuns: bt.recentRuns.slice(),
        debugRuns: bt.debugRuns.slice(),
      };
    }
    let next;
    if (finalizedRun.run.debugRun) {
      next = {
        enabled: bt.enabled,
        summaryBySkill: deepCloneSummary(bt.summaryBySkill),
        recentRuns: bt.recentRuns.slice(),
        debugRuns: pushDebugRun(bt.debugRuns, finalizedRun, cfg.maxDebugRuns),
      };
    } else {
      const summary = deepCloneSummary(bt.summaryBySkill);
      mergeRunIntoSummary(summary, finalizedRun, cfg);
      next = {
        enabled: bt.enabled,
        summaryBySkill: summary,
        recentRuns: pushRecentRun(bt.recentRuns, finalizedRun, cfg.maxRecentRuns),
        debugRuns: bt.debugRuns.slice(),
      };
    }
    return enforceSoftCap(next, cfg.softMaxBytes);
  } catch (_e) {
    // 破損した入力等で内部例外 → 既存を汚さず、正規化済みの安全な形を返す。
    try {
      const safe = normalize(balanceTelemetry);
      return {
        enabled: safe.enabled,
        summaryBySkill: deepCloneSummary(safe.summaryBySkill),
        recentRuns: safe.recentRuns.slice(),
        debugRuns: safe.debugRuns.slice(),
      };
    } catch (_e2) {
      return emptyTelemetry();
    }
  }
}

// ソフトなバイト上限を超えたら recent/debug を末尾から削って収める（集計 summary は保持）。
function enforceSoftCap(bt, softMaxBytes) {
  const cap = isNum(softMaxBytes) && softMaxBytes > 0 ? softMaxBytes : DEFAULTS.softMaxBytes;
  let guard = 0;
  while (estimateBytes(bt) > cap && (bt.recentRuns.length + bt.debugRuns.length) > 0 && guard < 1000) {
    if (bt.debugRuns.length >= bt.recentRuns.length && bt.debugRuns.length > 0) bt.debugRuns.pop();
    else if (bt.recentRuns.length > 0) bt.recentRuns.pop();
    else bt.debugRuns.pop();
    guard++;
  }
  return bt;
}

export function exportJson(balanceTelemetry) {
  try {
    return JSON.stringify(normalize(balanceTelemetry));
  } catch (_e) {
    return JSON.stringify(emptyTelemetry());
  }
}

export function estimateBytes(balanceTelemetry) {
  const json = typeof balanceTelemetry === 'string' ? balanceTelemetry : exportJson(balanceTelemetry);
  // UTF-8 概算バイト数。
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(json, 'utf8');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
  return json.length;
}

export const SUMMARY_DEFAULTS = { ...DEFAULTS };
