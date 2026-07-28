// FlameBalanceWarnings（Milestone 8-A: 火の魔女完成監査）: カタログ／抽選シミュレーション／監査結果／
// 炎上・DoT・爆発・共鳴の集計から、開発者向けの警告（FLAME_*）を生成する純ロジック。自動調整はしない（警告のみ）。
//
// M7-E の FrostBalanceWarnings と同じ構造・同じ既定しきい値を使い、火固有の項目（炎上 / DoT / 爆発 / 共鳴 /
// 残響 / 分身）だけを差し替えている。氷側の警告生成には一切影響しない（別モジュール・別コード体系）。
//
// ローカル専用: 生成した警告は F8 / テスト / docs でのみ使う。外部送信は一切しない。
// Phaser / DOM 非依存で Node からテストできる。決定論: 同じ入力なら同じ配列（severity → code → target で安定ソート）。
//
// 入力（すべて任意・欠けているセクションはそのぶん判定をスキップする）:
//   {
//     catalog:  { activeCount, passiveCount, evolutionCount, issues:[], poolLeaks:[], lv80Targets:[] },
//     expected: { activeCount, passiveCount, evolutionCount, lv80Targets:[] },
//     draft:    { bySlot: { 4: summary, 6: summary, 8: summary },
//                 evolutionExecutedTotals, activeOfferTotals, activePickTotals, passivePickTotals, rarityOf },
//                 // summary は DraftBalanceAnalyzer.summarize() の戻り値
//     content:  { deadFields:[], unusedCaps:[], invalidCaps:[], recordCastMismatch:[], echoRecursion:[],
//                 cloneRecursion:[], explosionRecursion:[], lv80Mismatch:[], runtimeMissing:[],
//                 reloadDuplicates:[], telemetryMissing:[], cleanupLeaks:[] },
//     status:   { burningApplications, burningPeak, burningDamage, dotTicks, dotDamage,
//                 explosions, secondaryExplosions, resonancePulses, resonanceChains,
//                 burningIndexLeaks, fightSeconds }
//   }

export const FLAME_WARNING_CODES = [
  'FLAME_CATALOG_MISMATCH', 'FLAME_POOL_LEAK', 'FLAME_EVOLUTION_UNREACHABLE', 'FLAME_EVOLUTION_ZERO_RATE',
  'FLAME_EVOLUTION_LOW_RATE', 'FLAME_ACTIVE_ZERO_OFFER', 'FLAME_ACTIVE_ZERO_PICK', 'FLAME_RARITY_SKEW',
  'FLAME_PASSIVE_SKEW', 'FLAME_DEAD_FIELD', 'FLAME_UNUSED_CAP', 'FLAME_RECORD_CAST_MISMATCH',
  'FLAME_ECHO_RECURSION', 'FLAME_CLONE_RECURSION', 'FLAME_EXPLOSION_RECURSION', 'FLAME_LV80_MISMATCH',
  'FLAME_BURNING_ZERO', 'FLAME_BURNING_EXCESSIVE', 'FLAME_DOT_ZERO', 'FLAME_DOT_DAMAGE_ZERO',
  'FLAME_EXPLOSION_ZERO', 'FLAME_EXPLOSION_EXCESSIVE', 'FLAME_RESONANCE_ZERO', 'FLAME_RESONANCE_RUNAWAY',
  'FLAME_BURNING_INDEX_LEAK', 'FLAME_RUNTIME_MISSING', 'FLAME_RELOAD_DUPLICATE',
  'FLAME_TELEMETRY_MISSING', 'FLAME_QUALITY_CAP_INVALID', 'FLAME_CLEANUP_LEAK',
];

// M8-A で使う警告しきい値。M7-E（氷術師）と同じ基準を基本に、火固有の項目だけを足している。
// 根拠は docs/flame-balance-report.md に記載する（自動調整はしない）。
export const DEFAULT_FLAME_THRESHOLDS = {
  // 進化到達（evolution-first・60 level-up・200 seed 以上）— M7-E と同一基準
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
  // 炎上 / DoT / 爆発 / 共鳴（1分あたり・飽和ハーネス基準）
  burningPeakMax: 400,
  explosionsPerMinuteMax: 1800,
  resonanceChainsPerPulseMax: 40,
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

export function analyzeFlameWarnings(input = {}, thresholds = {}) {
  const t = { ...DEFAULT_FLAME_THRESHOLDS, ...(thresholds || {}) };
  const out = [];
  const push = (code, target, severity, detail) => out.push({ code, target: String(target), severity, detail });

  // ---- 1. カタログ整合性 / プール分離 ----
  const cat = input.catalog || null;
  const exp = input.expected || null;
  if (cat && exp) {
    for (const k of ['activeCount', 'passiveCount', 'evolutionCount']) {
      if (isNum(exp[k]) && num(cat[k], -1) !== exp[k]) {
        push('FLAME_CATALOG_MISMATCH', k, 'high', `${k} が ${cat[k]}（期待 ${exp[k]}）`);
      }
    }
    const gotLv80 = arr(cat.lv80Targets).slice().sort().join(',');
    const wantLv80 = arr(exp.lv80Targets).slice().sort().join(',');
    if (wantLv80 && gotLv80 !== wantLv80) push('FLAME_LV80_MISMATCH', 'lv80Targets', 'high', `Lv80対象が [${gotLv80}]（期待 [${wantLv80}]）`);
  }
  if (cat) {
    for (const iss of arr(cat.issues)) push('FLAME_CATALOG_MISMATCH', iss.id || 'catalog', 'high', `${iss.type}: ${iss.detail || ''}`);
    for (const leak of arr(cat.poolLeaks)) push('FLAME_POOL_LEAK', leak.id || leak, 'high', leak.detail || 'ジョブプール外/他ジョブのスキルが候補に混入している');
  }

  // ---- 2. 抽選（進化到達率・提示/取得0・偏り）----
  const bySlot = (input.draft && input.draft.bySlot) || {};
  for (const slot of Object.keys(bySlot)) {
    const s = bySlot[slot]; if (!s) continue;
    const need1 = t.evoAtLeast1BySlot[slot];
    if (isNum(need1) && num(s.evoAtLeast1Rate) < need1) {
      push('FLAME_EVOLUTION_LOW_RATE', `slot${slot}:atLeast1`, 'medium', `進化1個以上 ${(s.evoAtLeast1Rate * 100).toFixed(1)}% が基準 ${(need1 * 100).toFixed(0)}% 未満`);
    }
    const need2 = t.evoAtLeast2BySlot[slot];
    if (isNum(need2) && num(s.evoAtLeast2Rate) < need2) {
      push('FLAME_EVOLUTION_LOW_RATE', `slot${slot}:atLeast2`, 'medium', `進化2個以上 ${(s.evoAtLeast2Rate * 100).toFixed(1)}% が基準 ${(need2 * 100).toFixed(0)}% 未満`);
    }
    const needM = t.evoMeanBySlot[slot];
    if (isNum(needM) && num(s.evolutionsPerRunMean) < needM) {
      push('FLAME_EVOLUTION_LOW_RATE', `slot${slot}:mean`, 'medium', `平均進化数 ${s.evolutionsPerRunMean} が基準 ${needM} 未満`);
    }
    const maxZero = t.evoZeroMaxBySlot[slot];
    if (isNum(maxZero) && num(s.evoZeroRate) > maxZero) {
      push('FLAME_EVOLUTION_LOW_RATE', `slot${slot}:zero`, 'medium', `進化0個の周回 ${(s.evoZeroRate * 100).toFixed(1)}% が上限 ${(maxZero * 100).toFixed(0)}% 超`);
    }
    // 必ず0であるべき健全性カウンタ。
    if (num(s.otherJobCandidates) > 0) push('FLAME_POOL_LEAK', `slot${slot}`, 'high', `他ジョブのスキルが候補に ${s.otherJobCandidates} 件混入`);
    if (num(s.invalidCandidates) > 0) push('FLAME_CATALOG_MISMATCH', `slot${slot}:invalidCandidates`, 'high', `不正候補 ${s.invalidCandidates} 件`);
  }

  // 全戦略・全枠を通じた「取得0の進化」＝到達不能候補。
  const execTotals = input.draft && input.draft.evolutionExecutedTotals;
  if (execTotals) {
    for (const id of Object.keys(execTotals).sort()) {
      if (num(execTotals[id]) <= 0) push('FLAME_EVOLUTION_UNREACHABLE', id, 'high', 'どの戦略・どの枠数でも一度も進化していない（到達不能の疑い）');
      else if (num(execTotals[id]) < t.evolutionLowExecutedRate) push('FLAME_EVOLUTION_ZERO_RATE', id, 'low', `取得率の合計が ${(execTotals[id] * 100).toFixed(2)}% と極端に低い`);
    }
  }
  // active の提示0 / 取得0（全戦略合算）。
  const offerTotals = input.draft && input.draft.activeOfferTotals;
  const pickTotals = input.draft && input.draft.activePickTotals;
  if (offerTotals) for (const id of Object.keys(offerTotals).sort()) if (num(offerTotals[id]) <= 0) push('FLAME_ACTIVE_ZERO_OFFER', id, 'high', 'どの戦略でも一度も候補に提示されない');
  if (pickTotals) for (const id of Object.keys(pickTotals).sort()) if (num(pickTotals[id]) <= 0) push('FLAME_ACTIVE_ZERO_PICK', id, 'medium', 'どの戦略でも一度も取得されない（ハズレ候補の疑い）');

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
        if (v > m * t.raritySkewHigh) push('FLAME_RARITY_SKEW', id, 'low', `${r} 中央値 ${m.toFixed(4)} の ${t.raritySkewHigh}倍超（${v.toFixed(4)}）`);
        else if (v < m * t.raritySkewLow) push('FLAME_RARITY_SKEW', id, 'low', `${r} 中央値 ${m.toFixed(4)} の 1/${Math.round(1 / t.raritySkewLow)} 未満（${v.toFixed(4)}）`);
      }
    }
  }
  // passive 取得の偏り（4種の最大/最小比）。
  const passivePick = input.draft && input.draft.passivePickTotals;
  if (passivePick) {
    const vals = Object.values(passivePick).map((v) => num(v));
    const mn = Math.min(...vals), mx = Math.max(...vals);
    if (vals.length >= 2 && mn > 0 && mx / mn > t.passiveSkewRatio) {
      push('FLAME_PASSIVE_SKEW', 'passivePool', 'low', `passive 取得回数の最大/最小比が ${(mx / mn).toFixed(2)}（基準 ${t.passiveSkewRatio}）`);
    }
    if (vals.some((v) => v <= 0)) push('FLAME_PASSIVE_SKEW', 'passivePool', 'medium', '一度も取得されない passive がある');
  }

  // ---- 3. 死にコンテンツ / 監査 ----
  const c = input.content || {};
  const bulk = [
    ['FLAME_DEAD_FIELD', c.deadFields, 'high', '宣言されているが実装から参照されない（成長項目/効果値）'],
    ['FLAME_UNUSED_CAP', c.unusedCaps, 'medium', 'skillCaps に宣言されているが実装から参照されない'],
    ['FLAME_QUALITY_CAP_INVALID', c.invalidCaps, 'high', 'quality cap の値が不正（非正 / low>medium>high>ultra の順序違反 / 参照先なし）'],
    ['FLAME_RECORD_CAST_MISMATCH', c.recordCastMismatch, 'high', '主発動1回あたりの recordCast が1回になっていない'],
    ['FLAME_ECHO_RECURSION', c.echoRecursion, 'high', '残響から残響が連鎖している'],
    ['FLAME_CLONE_RECURSION', c.cloneRecursion, 'high', '分身から分身が連鎖している'],
    ['FLAME_EXPLOSION_RECURSION', c.explosionRecursion, 'high', '爆発から爆発が無制限に再帰している'],
    ['FLAME_LV80_MISMATCH', c.lv80Mismatch, 'high', 'Lv80 発射数対象の宣言と実装が一致しない'],
    ['FLAME_RUNTIME_MISSING', c.runtimeMissing, 'high', 'クールダウン/周期を持つのに runtimeState を保存していない（再開直後の無料発動）'],
    ['FLAME_RELOAD_DUPLICATE', c.reloadDuplicates, 'high', '再開後に設置物/召喚/弾幕などが二重生成される'],
    ['FLAME_TELEMETRY_MISSING', c.telemetryMissing, 'medium', 'テレメトリのキーが記録されていない'],
    ['FLAME_CLEANUP_LEAK', c.cleanupLeaks, 'high', '破棄/再利用後に表示物・参照・炎上索引が残留する'],
  ];
  for (const [code, list, sev, detail] of bulk) {
    for (const it of arr(list)) {
      const id = (it && it.id) || it;
      push(code, id, sev, (it && it.detail) || detail);
    }
  }

  // ---- 4. 炎上 / DoT / 爆発 / 共鳴 ----
  const s = input.status;
  if (s) {
    const minutes = num(s.fightSeconds) / 60;
    if (num(s.burningApplications) === 0 && num(s.fightSeconds) > 0) {
      push('FLAME_BURNING_ZERO', 'burning', 'high', `${num(s.fightSeconds).toFixed(0)} 秒の戦闘で炎上付与が 0 回`);
    }
    if (num(s.burningPeak) > t.burningPeakMax) {
      push('FLAME_BURNING_EXCESSIVE', 'burning', 'medium', `同時炎上のピークが ${s.burningPeak} 体（上限 ${t.burningPeakMax}）`);
    }
    if (num(s.burningApplications) > 0 && num(s.dotTicks) === 0) {
      push('FLAME_DOT_ZERO', 'dot', 'high', '炎上付与があるのに DoT tick が 1 度も発生していない');
    }
    if (num(s.dotTicks) > 0 && num(s.dotDamage) <= 0) {
      push('FLAME_DOT_DAMAGE_ZERO', 'dot', 'high', `DoT tick が ${s.dotTicks} 回あるのに与ダメージが 0`);
    }
    if (num(s.explosions) === 0 && num(s.fightSeconds) > 0) {
      push('FLAME_EXPLOSION_ZERO', 'explosion', 'medium', '爆発が 1 度も発生していない');
    }
    if (minutes > 0 && num(s.explosions) / minutes > t.explosionsPerMinuteMax) {
      push('FLAME_EXPLOSION_EXCESSIVE', 'explosion', 'medium', `爆発が毎分 ${(s.explosions / minutes).toFixed(0)} 回（上限 ${t.explosionsPerMinuteMax}）`);
    }
    if (num(s.secondaryExplosions) > num(s.explosions)) {
      push('FLAME_EXPLOSION_RECURSION', 'explosion', 'high', `二次爆発 ${s.secondaryExplosions} が一次爆発 ${s.explosions} を上回る（再帰の疑い）`);
    }
    if (num(s.resonancePulses) === 0 && num(s.fightSeconds) > 0) {
      push('FLAME_RESONANCE_ZERO', 'resonance', 'medium', '共鳴パルスが 1 度も発生していない');
    }
    if (num(s.resonancePulses) > 0 && num(s.resonanceChains) / num(s.resonancePulses, 1) > t.resonanceChainsPerPulseMax) {
      push('FLAME_RESONANCE_RUNAWAY', 'resonance', 'high', `共鳴 1 パルスあたりの連鎖が ${(s.resonanceChains / s.resonancePulses).toFixed(1)} 本（上限 ${t.resonanceChainsPerPulseMax}・無限連鎖の疑い）`);
    }
    if (num(s.burningIndexLeaks) > 0) {
      push('FLAME_BURNING_INDEX_LEAK', 'burningIndex', 'high', `死亡/返却後も炎上索引に ${s.burningIndexLeaks} 件が残留している`);
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

export const FLAME_WARNING_SEVERITIES = { ...SEV_RANK };
