// 戦士 11/17: Job Lv 1〜100（M8-B §16）。Node.js 標準機能のみ。
// - 到達報酬 11 段がすべて JobModifierManager から実際に読める（宣言だけの報酬がない）
// - Lv1 と Lv100 で補正が明確に変わり、Lv80「打撃数+1」が明示 flag のスキルにだけ効く
// - 火/氷の補正解決が M8-B で変わっていない（同じ Lv で同じ値）
// 実行: node tests/warrior-job-level.mjs

import { JobModifierManager } from '../src/systems/JobModifierManager.js';
import { appliesLv80ProjectileCount } from '../src/systems/SkillAudit.js';
import { DATA, WARRIOR, EXPECTED, runner, readSrc } from './warrior-common.mjs';

const T = runner('戦士 Job Lv 1〜100（M8-B）');
const { ok, section, info } = T;

const jp = DATA.jobProgression.jobs.warrior;
const resolve = (lv) => JobModifierManager.resolve(jp, lv);
const mgr = (lv) => { const m = new JobModifierManager(); m.setResolved(resolve(lv)); return m; };

// ===== 1. 曲線・報酬の健全性 =====
section('1. job-progression.json（warrior）の健全性');
ok(jp.levelCap === 100, 'levelCap = 100');
ok(jp.xpCurve && jp.xpCurve.quad > 0 && jp.xpCurve.lin > 0, `xpCurve quad=${jp.xpCurve.quad} lin=${jp.xpCurve.lin}`);
ok(jp.xpReward && Object.keys(jp.xpReward).length > 0, 'xpReward が定義されている');
ok(jp.perLevelBonuses && Object.keys(jp.perLevelBonuses).length > 0, `perLevelBonuses ${Object.keys(jp.perLevelBonuses).join(',')}`);
{
  let asc = true;
  for (let i = 1; i < jp.milestones.length; i++) if (jp.milestones[i].level <= jp.milestones[i - 1].level) asc = false;
  ok(asc, '到達報酬レベルが昇順・重複なし');
  const ids = new Set(jp.milestones.map((m) => m.id));
  ok(ids.size === jp.milestones.length, '報酬 ID が一意');
  for (const m of jp.milestones) ok(m.level >= 1 && m.level <= 100, `${m.id}: Lv${m.level} が 1..100`);
}
info(`到達報酬: ${jp.milestones.map((m) => `Lv${m.level}:${m.type}`).join(' / ')}`);

// ===== 2. 全報酬が実装から読める（宣言だけの報酬がない）=====
section('2. すべての到達報酬が JobModifierManager の解決結果へ反映される');
{
  const src = readSrc('src/systems/JobModifierManager.js');
  for (const m of jp.milestones) {
    ok(src.includes(`'${m.type}'`), `${m.type}: JobModifierManager が case を持つ`);
    const lo = resolve(Math.max(1, m.level - 1));
    const hi = resolve(m.level);
    ok(JSON.stringify(lo) !== JSON.stringify(hi), `Lv${m.level}（${m.id} / ${m.type}）で解決結果が変わる`);
  }
}

// ===== 3. Lv1 と Lv100 の差 =====
section('3. Lv1 と Lv100 で補正が明確に変わる');
{
  const a = mgr(1), b = mgr(100);
  ok(b.damageMultiplier({ element: 'physical' }) > a.damageMultiplier({ element: 'physical' }),
    `物理ダメージ倍率 ${a.damageMultiplier({ element: 'physical' }).toFixed(3)} → ${b.damageMultiplier({ element: 'physical' }).toFixed(3)}`);
  ok(b.cooldownMult() < a.cooldownMult(), `クールダウン倍率 ${a.cooldownMult().toFixed(3)} → ${b.cooldownMult().toFixed(3)}`);
  ok(b.maxHpMult() > a.maxHpMult(), `最大HP倍率 ${a.maxHpMult().toFixed(3)} → ${b.maxHpMult().toFixed(3)}`);
  ok(b.furyGainMult() > a.furyGainMult(), `闘気獲得倍率 ${a.furyGainMult().toFixed(3)} → ${b.furyGainMult().toFixed(3)}`);
  ok(b.damageReductionBonus() > a.damageReductionBonus(), `軽減ボーナス ${a.damageReductionBonus()} → ${b.damageReductionBonus()}`);
  ok(b.poiseDamageMult() > a.poiseDamageMult(), `体勢削り倍率 ${a.poiseDamageMult().toFixed(3)} → ${b.poiseDamageMult().toFixed(3)}`);
  ok(b.comboThresholdBonusMult() > a.comboThresholdBonusMult(), `コンボ閾値強化 ${a.comboThresholdBonusMult().toFixed(2)} → ${b.comboThresholdBonusMult().toFixed(2)}`);
  ok(b.extraRerolls() > a.extraRerolls(), `リロール +${b.extraRerolls()}`);
  ok(b.resolved.evolvedDamageMult > a.resolved.evolvedDamageMult, `進化ダメージ倍率 ${a.resolved.evolvedDamageMult} → ${b.resolved.evolvedDamageMult}`);
  ok(b.rarityWeightMult('rare') > a.rarityWeightMult('rare'), 'レアリティ重み（rare）が上がる');
  ok(!!b.furyReleaseBonus(), 'Lv50 の闘気解放強化が取れている');
  ok(!!b.warriorApex(), 'Lv100 の頂点効果が取れている');
  ok(b.projectileCountBonus() > a.projectileCountBonus(), `打撃数 +${b.projectileCountBonus()}`);
}

// ===== 4. Lv80「打撃数+1」の適用範囲 =====
section('4. Lv80「打撃数+1」は明示 flag のスキルのみ');
{
  const m = mgr(80);
  ok(m.projectileCountBonus() >= 1, `Lv80 で打撃数 +${m.projectileCountBonus()}`);
  for (const id of WARRIOR.activeSkillPool) {
    const def = DATA.skills.find((s) => s.id === id);
    const applies = appliesLv80ProjectileCount(def);
    const expected = EXPECTED.lv80Targets.includes(id);
    ok(applies === expected, `${id}: Lv80 対象 ${applies}（期待 ${expected}）`);
  }
  for (const id of WARRIOR.evolutionPool) {
    const def = DATA.evolutions.find((e) => e.id === id);
    ok(appliesLv80ProjectileCount(def) === false, `${id}: 進化は Lv80 対象外`);
  }
  const at79 = mgr(79);
  ok(at79.projectileCountBonus() === 0, 'Lv79 では打撃数ボーナスなし');
}

// ===== 5. 単調性（レベルが上がって弱くならない）=====
section('5. Lv が上がって弱くなる区間がない');
{
  let prevDmg = 0, prevCd = Infinity, prevHp = 0, mono = true, cdMono = true, hpMono = true;
  for (let lv = 1; lv <= 100; lv++) {
    const m = mgr(lv);
    const d = m.damageMultiplier({ element: 'physical' });
    const c = m.cooldownMult();
    const h = m.maxHpMult();
    if (d < prevDmg - 1e-9) mono = false;
    if (c > prevCd + 1e-9) cdMono = false;
    if (h < prevHp - 1e-9) hpMono = false;
    prevDmg = d; prevCd = c; prevHp = h;
  }
  ok(mono, '物理ダメージ倍率が単調非減少');
  ok(cdMono, 'クールダウン倍率が単調非増加');
  ok(hpMono, '最大HP倍率が単調非減少');
}

// ===== 6. 火/氷の補正が変わっていない（非回帰）=====
section('6. 火の魔女 / 氷術師の Job 補正解決が M8-B で変わっていない');
{
  // 期待値は M8-A 時点の実装（火=fire / 氷=ice の属性ダメージのみが上がる）と同じ意味論。
  for (const jid of ['flame_witch', 'frost_mage']) {
    const p = DATA.jobProgression.jobs[jid];
    const m1 = new JobModifierManager(); m1.setResolved(JobModifierManager.resolve(p, 1));
    const m100 = new JobModifierManager(); m100.setResolved(JobModifierManager.resolve(p, 100));
    const el = jid === 'flame_witch' ? 'fire' : 'ice';
    ok(m100.damageMultiplier({ element: el }) > m1.damageMultiplier({ element: el }), `${jid}: 主属性ダメージが Lv で上がる`);
    ok(m100.damageMultiplier({ element: 'physical' }) === 1, `${jid}: physical へは補正が乗らない（戦士の追加で漏れていない）`);
    // 戦士専用の解決値は火/氷では既定のまま。
    ok(m100.maxHpMult() === 1, `${jid}: maxHpMult は 1（戦士専用報酬が漏れない）`);
    ok(m100.furyGainMult() === 1, `${jid}: furyGainMult は 1`);
    ok(m100.damageReductionBonus() === 0, `${jid}: damageReductionBonus は 0`);
    ok(m100.poiseDamageMult() === 1, `${jid}: poiseDamageMult は 1`);
    ok(m100.furyReleaseBonus() === null, `${jid}: furyRelease は null`);
    ok(m100.warriorApex() === null, `${jid}: warriorApex は null`);
  }
  // 戦士では氷専用（絶対零度）が付かない。
  ok(mgr(100).absoluteZero() === null, 'warrior: absoluteZero は null');
  ok(mgr(100).echoEnabled() === false || mgr(100).echoEnabled() === undefined || !mgr(100).echoEnabled(), 'warrior: 残響は無効');
}

// ===== 7. identity（Job 補正 OFF）=====
section('7. identity（F8 の Job 補正 OFF）で戦士の補正がすべて既定へ戻る');
{
  const m = new JobModifierManager(); m.setResolved(JobModifierManager.identity());
  ok(m.maxHpMult() === 1 && m.furyGainMult() === 1 && m.poiseDamageMult() === 1, '倍率が 1');
  ok(m.damageReductionBonus() === 0, '軽減ボーナス 0');
  ok(m.comboThresholdBonusMult() === 1, 'コンボ閾値強化 1');
  ok(m.furyReleaseBonus() === null && m.warriorApex() === null, '解放強化・頂点効果が null');
  ok(m.projectileCountBonus() === 0, '打撃数ボーナス 0');
}

T.finish();
