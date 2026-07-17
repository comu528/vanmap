// BalanceWarnings: 集計済みテレメトリから開発者向け警告を生成する純ロジック。
// 自動調整はしない（警告のみ）。閾値はすべて thresholds 引数から取る。
//
// analyzeWarnings(summaryBySkill, thresholds, catalogInfo)
//   -> [{ code, skillId, severity, detail, sampleCount }]  （severity→skillId で決定論的にソート）
//
// summaryBySkill は RunBalanceSummary の agg（runs,totalDps(平均),samples,meanDamageShare,
//   defensiveValue(平均),capReachedCount,maxFinalLevel,totalCasts,...）。
// catalogInfo（任意）: { [skillId]: { rarity, role, isDefensive, maxLevel,
//   baseId(進化行のみ), evolutionFeasibility(0..1 任意), appearanceRate(任意) } }
//
// warning code:
//   dps-below-median / dps-above-median : 同レアリティ帯の中央値に対する DPS 逸脱
//   acquired-but-never-cast             : 所持したが casts==0
//   low-usage-at-max                    : 最大Lv到達なのに damageShare が極小
//   evolved-dps-drop                    : 進化後 DPS < 進化前 DPS（両方 tracked のとき）
//   defensive-value-zero                : 防御タグ付きなのに defensiveValue ≒ 0
//   frequent-cap-reached                : capReachedCount/run が高い
//   high-rarity-underperform            : legendary/rare が同role common 中央値未満
//   low-evolution-feasibility           : evolutionFeasibility が閾値未満（catalogInfo 必須・任意）
//   low-appearance                      : appearanceRate が閾値未満（catalogInfo 必須・任意）

const SEV_RANK = { high: 0, medium: 1, low: 2, info: 3 };

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }
function num(x, d = 0) { return isNum(x) ? x : d; }

function median(values) {
  const v = values.filter(isNum).slice().sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function analyzeWarnings(summaryBySkill, thresholds = {}, catalogInfo = {}) {
  const out = [];
  const skills = (summaryBySkill && typeof summaryBySkill === 'object') ? summaryBySkill : {};
  const info = (catalogInfo && typeof catalogInfo === 'object') ? catalogInfo : {};
  const t = thresholds || {};

  const minSamples = num(t.minSamples, 5);
  const lowPct = num(t.dpsLowPct, 0.25);
  const highPct = num(t.dpsHighPct, 3.0);
  const lowUsageShare = num(t.lowUsageDamageShare, 0.01);
  const capPerRun = num(t.capReachedPerRun, 50);
  const defEps = num(t.defensiveValueEpsilon, 1);
  const feasibilityMin = t.evolutionFeasibilityMin; // 任意
  const appearanceMin = t.appearanceMin;            // 任意

  const ids = Object.keys(skills);
  const enough = (id) => num(skills[id] && skills[id].samples) >= minSamples;

  // レアリティ帯ごとの DPS 中央値（サンプル十分なもののみ採用）。
  const byRarity = new Map();
  for (const id of ids) {
    if (!enough(id)) continue;
    const rar = (info[id] && info[id].rarity) || 'unknown';
    if (!byRarity.has(rar)) byRarity.set(rar, []);
    byRarity.get(rar).push(num(skills[id].totalDps));
  }
  const rarityMedian = new Map();
  for (const [rar, arr] of byRarity) rarityMedian.set(rar, median(arr));

  // role ごとの common 中央値（high-rarity-underperform 用）。
  const commonByRole = new Map();
  for (const id of ids) {
    if (!enough(id)) continue;
    const ci = info[id] || {};
    if (ci.rarity === 'common' && ci.role != null) {
      const key = String(ci.role);
      if (!commonByRole.has(key)) commonByRole.set(key, []);
      commonByRole.get(key).push(num(skills[id].totalDps));
    }
  }
  const commonRoleMedian = new Map();
  for (const [role, arr] of commonByRole) commonRoleMedian.set(role, median(arr));

  const push = (code, skillId, severity, detail, sampleCount) => {
    out.push({ code, skillId: String(skillId), severity, detail, sampleCount: num(sampleCount) });
  };

  for (const id of ids) {
    const agg = skills[id];
    if (!agg || typeof agg !== 'object') continue;
    const samples = num(agg.samples);
    if (samples < minSamples) continue;
    const ci = info[id] || {};
    const dps = num(agg.totalDps);

    // acquired-but-never-cast
    if (num(agg.totalCasts) === 0 && num(agg.runs) > 0) {
      push('acquired-but-never-cast', id, 'high',
        `所持 ${num(agg.runs)} run で一度も発動していない（casts=0）`, samples);
    }

    // dps below/above median（同レアリティ帯）
    const rar = ci.rarity || 'unknown';
    const med = num(rarityMedian.get(rar));
    if (med > 0) {
      if (dps < med * lowPct) {
        push('dps-below-median', id, 'medium',
          `DPS ${dps.toFixed(1)} が ${rar} 中央値 ${med.toFixed(1)} の ${(lowPct * 100).toFixed(0)}% 未満`, samples);
      } else if (dps > med * highPct) {
        push('dps-above-median', id, 'medium',
          `DPS ${dps.toFixed(1)} が ${rar} 中央値 ${med.toFixed(1)} の ${highPct}倍 超`, samples);
      }
    }

    // low-usage-at-max
    if (isNum(ci.maxLevel) && ci.maxLevel > 0
      && num(agg.maxFinalLevel) >= ci.maxLevel
      && num(agg.meanDamageShare) < lowUsageShare) {
      push('low-usage-at-max', id, 'low',
        `最大Lv到達だが平均 damageShare ${(num(agg.meanDamageShare) * 100).toFixed(2)}% と極小`, samples);
    }

    // evolved-dps-drop（進化行: baseId が summary に存在し両方サンプル十分）
    if (ci.baseId && skills[ci.baseId] && enough(ci.baseId)) {
      const baseDps = num(skills[ci.baseId].totalDps);
      if (baseDps > 0 && dps < baseDps) {
        push('evolved-dps-drop', id, 'high',
          `進化後 DPS ${dps.toFixed(1)} < 進化前(${ci.baseId}) DPS ${baseDps.toFixed(1)}`,
          Math.min(samples, num(skills[ci.baseId].samples)));
      }
    }

    // defensive-value-zero
    if (ci.isDefensive && num(agg.defensiveValue) <= defEps) {
      push('defensive-value-zero', id, 'medium',
        `防御スキルだが defensiveValue ${num(agg.defensiveValue).toFixed(2)} ≒ 0`, samples);
    }

    // frequent-cap-reached
    if (num(agg.runs) > 0 && (num(agg.capReachedCount) / num(agg.runs)) > capPerRun) {
      push('frequent-cap-reached', id, 'low',
        `1 run あたり平均 ${(num(agg.capReachedCount) / num(agg.runs)).toFixed(1)} 回キャップ到達`, samples);
    }

    // high-rarity-underperform（role の common 中央値と比較）
    if ((ci.rarity === 'legendary' || ci.rarity === 'rare') && ci.role != null) {
      const cm = num(commonRoleMedian.get(String(ci.role)));
      if (cm > 0 && dps < cm) {
        push('high-rarity-underperform', id, 'high',
          `${ci.rarity} だが DPS ${dps.toFixed(1)} が同role common 中央値 ${cm.toFixed(1)} 未満`, samples);
      }
    }

    // low-evolution-feasibility（任意）
    if (isNum(feasibilityMin) && isNum(ci.evolutionFeasibility) && ci.evolutionFeasibility < feasibilityMin) {
      push('low-evolution-feasibility', id, 'low',
        `進化成立率 ${(ci.evolutionFeasibility * 100).toFixed(1)}% が閾値 ${(feasibilityMin * 100).toFixed(1)}% 未満`, samples);
    }

    // low-appearance（任意）
    if (isNum(appearanceMin) && isNum(ci.appearanceRate) && ci.appearanceRate < appearanceMin) {
      push('low-appearance', id, 'low',
        `出現率 ${(ci.appearanceRate * 100).toFixed(2)}% が閾値 ${(appearanceMin * 100).toFixed(2)}% 未満`, samples);
    }
  }

  out.sort((a, b) => {
    const sa = SEV_RANK[a.severity] ?? 9;
    const sb = SEV_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.skillId !== b.skillId) return a.skillId < b.skillId ? -1 : 1;
    return a.code < b.code ? -1 : (a.code > b.code ? 1 : 0);
  });
  return out;
}

export const WARNING_SEVERITIES = { ...SEV_RANK };
