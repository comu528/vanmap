// FrostBalanceWarnings（Milestone 7-E: 氷術師完成監査）: カタログ／抽選シミュレーション／監査結果／状態異常集計から
// 開発者向けの警告（FROST_*）を生成する純ロジック。自動調整はしない（警告のみ）。閾値はすべて引数から取る。
//
// ローカル専用: 生成した警告は F8 / テスト / docs でのみ使う。外部送信は一切しない（他の集計系と同じ方針）。
// Phaser / DOM 非依存で Node からテストできる。決定論: 同じ入力なら同じ配列（code → target で安定ソート）。
//
// 入力（すべて任意・欠けているセクションはそのぶん判定をスキップする）:
//   {
//     catalog:  { activeCount, passiveCount, evolutionCount, issues:[], poolLeaks:[], lv80Targets:[] },
//     expected: { activeCount, passiveCount, evolutionCount, lv80Targets:[] },
//     draft:    { bySlot: { 4: summary, 6: summary, 8: summary }, byPolicy: { [policy]: summary } },
//                 // summary は DraftBalanceAnalyzer.summarize() の戻り値
//     content:  { deadFields:[], unusedCaps:[], invalidCaps:[], recordCastMismatch:[], echoRecursion:[],
//                 cloneRecursion:[], shatterRecursion:[], lv80Mismatch:[], runtimeMissing:[],
//                 reloadDuplicates:[], statusRngDrift:[], telemetryMissing:[], cleanupLeaks:[] },
//     status:   { freezeAttempts, freezeSuccesses, immunitySkips, hitGroupSkips, shatters,
//                 bossFrostbreaks, bossFightSeconds, vulnerabilitySeconds, bossFrozen }
//   }

export const FROST_WARNING_CODES = [
  'FROST_CATALOG_MISMATCH', 'FROST_POOL_LEAK', 'FROST_EVOLUTION_UNREACHABLE', 'FROST_EVOLUTION_ZERO_RATE',
  'FROST_EVOLUTION_LOW_RATE', 'FROST_ACTIVE_ZERO_OFFER', 'FROST_ACTIVE_ZERO_PICK', 'FROST_RARITY_SKEW',
  'FROST_PASSIVE_SKEW', 'FROST_DEAD_FIELD', 'FROST_UNUSED_CAP', 'FROST_RECORD_CAST_MISMATCH',
  'FROST_ECHO_RECURSION', 'FROST_CLONE_RECURSION', 'FROST_SHATTER_RECURSION', 'FROST_LV80_MISMATCH',
  'FROST_FREEZE_ZERO', 'FROST_FREEZE_EXCESSIVE', 'FROST_IMMUNITY_UNUSED', 'FROST_HITGROUP_UNUSED',
  'FROST_BOSS_FREEZE_INVALID', 'FROST_FROSTBREAK_ZERO', 'FROST_FROSTBREAK_EXCESSIVE',
  'FROST_VULNERABILITY_EXCESSIVE', 'FROST_RUNTIME_MISSING', 'FROST_RELOAD_DUPLICATE',
  'FROST_STATUS_RNG_DRIFT', 'FROST_TELEMETRY_MISSING', 'FROST_QUALITY_CAP_INVALID', 'FROST_CLEANUP_LEAK',
];

// M7-E で仮定した警告閾値。根拠は docs/frost-balance-report.md に記載する（自動調整はしない）。
export const DEFAULT_FROST_THRESHOLDS = {
  // 進化到達（evolution-first・60 level-up・200 seed 以上）
  evoAtLeast1BySlot: { 4: 0.80, 6: 0.95, 8: 0.95 },
  evoAtLeast2BySlot: { 6: 0.60, 8: 0.65 },
  evoMeanBySlot: { 4: 1.0, 6: 1.7, 8: 1.8 },
  evoZeroMaxBySlot: { 4: 0.20 },
  // 個別進化: 全戦略・全枠を通じて取得0なら不具合候補、低率は理由つきで報告するだけ。
  evolutionLowExecutedRate: 0.02,
  // レアリティ帯内の提示率の偏り（同帯中央値比）
  raritySkewHigh: 3.0,
  raritySkewLow: 1 / 3,
  // passive 取得の偏り（4種の最大/最小比）
  passiveSkewRatio: 3.0,
  // 状態異常
  freezeSuccessRateMin: 0.02,
  freezeSuccessRateMax: 0.85,
  frostbreakMaxPerMinute: 30,
  vulnerabilityUptimeMax: 0.90,
};

const SEV_RANK = { high: 0, medium: 1, low: 2, info: 3 };
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const num = (x, d = 0) => (isNum(x) ? x : d);
const arr = (x) => (Array.isArray(x) ? x : []);

function median(values) {
  const v = values.filter(isNum).slice().sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function analyzeFrostWarnings(input = {}, thresholds = {}) {
  const t = { ...DEFAULT_FROST_THRESHOLDS, ...(thresholds || {}) };
  const out = [];
  const push = (code, target, severity, detail) => out.push({ code, target: String(target), severity, detail });

  // ---- 1. カタログ整合性 / プール分離 ----
  const cat = input.catalog || null;
  const exp = input.expected || null;
  if (cat && exp) {
    for (const k of ['activeCount', 'passiveCount', 'evolutionCount']) {
      if (isNum(exp[k]) && num(cat[k], -1) !== exp[k]) {
        push('FROST_CATALOG_MISMATCH', k, 'high', `${k} が ${cat[k]}（期待 ${exp[k]}）`);
      }
    }
    const gotLv80 = arr(cat.lv80Targets).slice().sort().join(',');
    const wantLv80 = arr(exp.lv80Targets).slice().sort().join(',');
    if (wantLv80 && gotLv80 !== wantLv80) push('FROST_LV80_MISMATCH', 'lv80Targets', 'high', `Lv80対象が [${gotLv80}]（期待 [${wantLv80}]）`);
  }
  if (cat) {
    for (const iss of arr(cat.issues)) push('FROST_CATALOG_MISMATCH', iss.id || 'catalog', 'high', `${iss.type}: ${iss.detail || ''}`);
    for (const leak of arr(cat.poolLeaks)) push('FROST_POOL_LEAK', leak.id || leak, 'high', leak.detail || 'ジョブプール外/他ジョブのスキルが候補に混入している');
  }

  // ---- 2. 抽選（進化到達率・提示/取得0・偏り）----
  const bySlot = (input.draft && input.draft.bySlot) || {};
  for (const slot of Object.keys(bySlot)) {
    const s = bySlot[slot]; if (!s) continue;
    const need1 = t.evoAtLeast1BySlot[slot];
    if (isNum(need1) && num(s.evoAtLeast1Rate) < need1) {
      push('FROST_EVOLUTION_LOW_RATE', `slot${slot}:atLeast1`, 'medium', `進化1個以上 ${(s.evoAtLeast1Rate * 100).toFixed(1)}% が基準 ${(need1 * 100).toFixed(0)}% 未満`);
    }
    const need2 = t.evoAtLeast2BySlot[slot];
    if (isNum(need2) && num(s.evoAtLeast2Rate) < need2) {
      push('FROST_EVOLUTION_LOW_RATE', `slot${slot}:atLeast2`, 'medium', `進化2個以上 ${(s.evoAtLeast2Rate * 100).toFixed(1)}% が基準 ${(need2 * 100).toFixed(0)}% 未満`);
    }
    const needM = t.evoMeanBySlot[slot];
    if (isNum(needM) && num(s.evolutionsPerRunMean) < needM) {
      push('FROST_EVOLUTION_LOW_RATE', `slot${slot}:mean`, 'medium', `平均進化数 ${s.evolutionsPerRunMean} が基準 ${needM} 未満`);
    }
    const maxZero = t.evoZeroMaxBySlot[slot];
    if (isNum(maxZero) && num(s.evoZeroRate) > maxZero) {
      push('FROST_EVOLUTION_LOW_RATE', `slot${slot}:zero`, 'medium', `進化0個の周回 ${(s.evoZeroRate * 100).toFixed(1)}% が上限 ${(maxZero * 100).toFixed(0)}% 超`);
    }
    // 必ず0であるべき健全性カウンタ。
    if (num(s.otherJobCandidates) > 0) push('FROST_POOL_LEAK', `slot${slot}`, 'high', `他ジョブのスキルが候補に ${s.otherJobCandidates} 件混入`);
    if (num(s.invalidCandidates) > 0) push('FROST_CATALOG_MISMATCH', `slot${slot}:invalidCandidates`, 'high', `不正候補 ${s.invalidCandidates} 件`);
  }

  // 全戦略・全枠を通じた「取得0の進化」＝到達不能候補。
  const execTotals = input.draft && input.draft.evolutionExecutedTotals;
  if (execTotals) {
    for (const id of Object.keys(execTotals).sort()) {
      if (num(execTotals[id]) <= 0) push('FROST_EVOLUTION_UNREACHABLE', id, 'high', 'どの戦略・どの枠数でも一度も進化していない（到達不能の疑い）');
      else if (num(execTotals[id]) < t.evolutionLowExecutedRate) push('FROST_EVOLUTION_ZERO_RATE', id, 'low', `取得率の合計が ${(execTotals[id] * 100).toFixed(2)}% と極端に低い`);
    }
  }
  // active の提示0 / 取得0（全戦略合算）。
  const offerTotals = input.draft && input.draft.activeOfferTotals;
  const pickTotals = input.draft && input.draft.activePickTotals;
  if (offerTotals) for (const id of Object.keys(offerTotals).sort()) if (num(offerTotals[id]) <= 0) push('FROST_ACTIVE_ZERO_OFFER', id, 'high', 'どの戦略でも一度も候補に提示されない');
  if (pickTotals) for (const id of Object.keys(pickTotals).sort()) if (num(pickTotals[id]) <= 0) push('FROST_ACTIVE_ZERO_PICK', id, 'medium', 'どの戦略でも一度も取得されない（ハズレ候補の疑い）');

  // レアリティ帯内の提示率の偏り。
  const rarityOf = input.draft && input.draft.rarityOf;
  if (offerTotals && rarityOf) {
    const groups = {};
    for (const id of Object.keys(offerTotals)) { const r = rarityOf[id] || 'unknown'; (groups[r] = groups[r] || []).push(id); }
    for (const r of Object.keys(groups).sort()) {
      const ids = groups[r]; if (ids.length < 3) continue;
      const m = median(ids.map((id) => num(offerTotals[id])));
      if (m <= 0) continue;
      for (const id of ids.sort()) {
        const v = num(offerTotals[id]);
        if (v > m * t.raritySkewHigh) push('FROST_RARITY_SKEW', id, 'low', `${r} 中央値 ${m.toFixed(4)} の ${t.raritySkewHigh}倍超（${v.toFixed(4)}）`);
        else if (v < m * t.raritySkewLow) push('FROST_RARITY_SKEW', id, 'low', `${r} 中央値 ${m.toFixed(4)} の 1/${Math.round(1 / t.raritySkewLow)} 未満（${v.toFixed(4)}）`);
      }
    }
  }
  // passive 取得の偏り（4種の最大/最小比）。
  const passivePick = input.draft && input.draft.passivePickTotals;
  if (passivePick) {
    const vals = Object.values(passivePick).map((v) => num(v));
    const mn = Math.min(...vals), mx = Math.max(...vals);
    if (vals.length >= 2 && mn > 0 && mx / mn > t.passiveSkewRatio) {
      push('FROST_PASSIVE_SKEW', 'passivePool', 'low', `passive 取得回数の最大/最小比が ${(mx / mn).toFixed(2)}（基準 ${t.passiveSkewRatio}）`);
    }
    if (vals.some((v) => v <= 0)) push('FROST_PASSIVE_SKEW', 'passivePool', 'medium', '一度も取得されない passive がある');
  }

  // ---- 3. 死にコンテンツ / 監査 ----
  const c = input.content || {};
  const bulk = [
    ['FROST_DEAD_FIELD', c.deadFields, 'high', '宣言されているが実装から参照されない（成長項目/効果値）'],
    ['FROST_UNUSED_CAP', c.unusedCaps, 'medium', 'skillCaps に宣言されているが実装から参照されない'],
    ['FROST_QUALITY_CAP_INVALID', c.invalidCaps, 'high', 'quality cap の値が不正（非正 / low>medium>high>ultra の順序違反 / 参照先なし）'],
    ['FROST_RECORD_CAST_MISMATCH', c.recordCastMismatch, 'high', '主発動1回あたりの recordCast が1回になっていない'],
    ['FROST_ECHO_RECURSION', c.echoRecursion, 'high', '残響から残響が連鎖している'],
    ['FROST_CLONE_RECURSION', c.cloneRecursion, 'high', '分身から分身が連鎖している'],
    ['FROST_SHATTER_RECURSION', c.shatterRecursion, 'high', '粉砕から粉砕が再帰している'],
    ['FROST_LV80_MISMATCH', c.lv80Mismatch, 'high', 'Lv80 発射数対象の宣言と実装が一致しない'],
    ['FROST_RUNTIME_MISSING', c.runtimeMissing, 'high', 'runtimeState を宣言しているのに serializeState/restoreState が無い'],
    ['FROST_RELOAD_DUPLICATE', c.reloadDuplicates, 'high', '再開後に設置物/召喚/印などが二重生成される'],
    ['FROST_STATUS_RNG_DRIFT', c.statusRngDrift, 'high', '保存→復元で状態異常 RNG の cursor がずれる'],
    ['FROST_TELEMETRY_MISSING', c.telemetryMissing, 'medium', 'テレメトリのキーが記録されていない'],
    ['FROST_CLEANUP_LEAK', c.cleanupLeaks, 'high', '破棄/再利用後に表示物・参照・状態が残留する'],
  ];
  for (const [code, list, sev, detail] of bulk) {
    for (const it of arr(list)) {
      const id = (it && it.id) || it;
      push(code, id, sev, (it && it.detail) || detail);
    }
  }

  // ---- 4. 状態異常バランス ----
  const s = input.status;
  if (s) {
    const attempts = num(s.freezeAttempts);
    const rate = attempts > 0 ? num(s.freezeSuccesses) / attempts : null;
    if (attempts > 0 && num(s.freezeSuccesses) === 0) push('FROST_FREEZE_ZERO', 'freeze', 'high', `凍結判定 ${attempts} 回で成功 0`);
    else if (rate != null && rate < t.freezeSuccessRateMin) push('FROST_FREEZE_ZERO', 'freeze', 'medium', `凍結成功率 ${(rate * 100).toFixed(2)}% が下限 ${(t.freezeSuccessRateMin * 100).toFixed(0)}% 未満`);
    if (rate != null && rate > t.freezeSuccessRateMax) push('FROST_FREEZE_EXCESSIVE', 'freeze', 'medium', `凍結成功率 ${(rate * 100).toFixed(1)}% が上限 ${(t.freezeSuccessRateMax * 100).toFixed(0)}% 超`);
    if (num(s.freezeSuccesses) > 0 && num(s.immunitySkips) === 0) push('FROST_IMMUNITY_UNUSED', 'freeze_immunity', 'medium', '凍結が発生しているのに凍結耐性による抑止が一度も起きていない');
    if (num(s.multiHitCasts) > 0 && num(s.hitGroupSkips) === 0) push('FROST_HITGROUP_UNUSED', 'hitGroup', 'medium', '多段命中があるのに hitGroup 上限による抑止が一度も起きていない');
    if (num(s.bossFrozen) > 0) push('FROST_BOSS_FREEZE_INVALID', 'boss', 'high', `ボスが通常凍結している（${s.bossFrozen} 回・氷砕ゲージへ変換されていない）`);
    const minutes = num(s.bossFightSeconds) / 60;
    if (minutes > 0) {
      const perMin = num(s.bossFrostbreaks) / minutes;
      if (num(s.bossFrostbreaks) === 0) push('FROST_FROSTBREAK_ZERO', 'boss', 'medium', `ボス戦 ${num(s.bossFightSeconds).toFixed(0)} 秒で氷砕が0回`);
      else if (perMin > t.frostbreakMaxPerMinute) push('FROST_FROSTBREAK_EXCESSIVE', 'boss', 'medium', `氷砕が毎分 ${perMin.toFixed(1)} 回（上限 ${t.frostbreakMaxPerMinute}）`);
      const uptime = num(s.vulnerabilitySeconds) / num(s.bossFightSeconds, 1);
      if (uptime > t.vulnerabilityUptimeMax) push('FROST_VULNERABILITY_EXCESSIVE', 'boss', 'medium', `氷砕脆弱の継続率 ${(uptime * 100).toFixed(1)}% が上限 ${(t.vulnerabilityUptimeMax * 100).toFixed(0)}% 超`);
    }
  }

  out.sort((a, b) => {
    const sa = SEV_RANK[a.severity] ?? 9, sb = SEV_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.target < b.target ? -1 : (a.target > b.target ? 1 : 0);
  });
  return out;
}

export const FROST_WARNING_SEVERITIES = { ...SEV_RANK };
