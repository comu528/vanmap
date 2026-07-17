// JobModifierManager（M6-C）の補正解決・ダメージタグ適用・到達報酬・残響詠唱・抽選重み・保存のテスト。
// Node.js 標準機能のみ。data/job-progression.json を実際に読み込んで検証する。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JobModifierManager } from '../src/systems/JobModifierManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
const cfg = load('job-progression.json').jobs.flame_witch;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const section = (t) => console.log(t);

const mk = (lv) => { const jm = new JobModifierManager(); jm.setResolved(JobModifierManager.resolve(cfg, lv)); return jm; };
const fire = (extra = {}) => ({ element: 'fire', ...extra });

// ===== 1. 基本補正 =====
section('1. 基本補正（Lv1 恒等 / Lv100 最大）');
{
  const j1 = mk(1);
  ok(j1.damageMultiplier(fire()) === 1, 'Lv1: 火ダメージ恒等');
  ok(j1.damageMultiplier(fire({ isDoT: true })) === 1, 'Lv1: DoT恒等');
  ok(j1.fireAreaMult() === 1 && j1.cooldownMult() === 1, 'Lv1: 範囲/CD恒等');
  ok(j1.projectileSpeedMult() === 1 && j1.projectileCountBonus() === 0, 'Lv1: 速度/発射数恒等');
  ok(j1.echoEnabled() === false && j1.extraRerolls() === 0, 'Lv1: 残響/リロール無し');
  ok(j1.rarityWeightMult('rare') === 1 && j1.rarityWeightMult('legendary') === 1, 'Lv1: 抽選重み恒等');

  const j100 = mk(100);
  // 火属性ダメージ: 1 + 0.0035*99 + Lv5(0.05) + Lv40 は爆発のみ。基本+Lv5 = 1.3465+0.05=1.3965
  ok(approx(j100.damageMultiplier(fire()), 1 + 0.0035 * 99 + 0.05), 'Lv100: 火ダメージ=基本34.65%+Lv5(5%)');
  // DoT: 火×DoT = (1.3965) * (1+0.005*99=1.495)
  ok(approx(j100.damageMultiplier(fire({ isDoT: true })), (1 + 0.0035 * 99 + 0.05) * (1 + 0.005 * 99)), 'Lv100: DoT=火×DoT倍率');
  // 範囲: 1+0.001*99 = 1.099
  ok(approx(j100.fireAreaMult(), 1 + 0.001 * 99), 'Lv100: 火範囲+9.9%');
  // CD: 0.95*0.90 = 0.855
  ok(approx(j100.cooldownMult(), 0.95 * 0.90), 'Lv100: CD=0.95×0.90（乗算合成）');
}

// ===== 2. fire 以外へ適用しない =====
section('2. 属性・タグの正しい適用');
{
  const j100 = mk(100);
  ok(j100.damageMultiplier({ element: 'ice' }) === 1, '架空属性(ice)へは適用しない');
  ok(j100.damageMultiplier({ element: undefined }) === 1, '属性未指定へは適用しない');
  // DoT補正が通常攻撃へ誤適用されない（fire だが isDoT=false なら dot 倍率は掛からない）
  const plain = j100.damageMultiplier(fire());
  const dot = j100.damageMultiplier(fire({ isDoT: true }));
  ok(dot > plain, '通常火ダメージには dot 倍率が掛からない（DoTのみ追加）');
  // 爆発補正が非爆発へ誤適用されない
  const exp = j100.damageMultiplier(fire({ isExplosion: true }));
  ok(exp > plain && approx(exp, plain * 1.15), '爆発(Lv40+15%)は isExplosion のみ');
  // 進化補正が進化前へ誤適用されない
  const evo = j100.damageMultiplier(fire({ isEvolved: true }));
  ok(approx(evo, plain * 1.20), '進化(Lv60+20%)は isEvolved のみ');
  // area補正は範囲アクセサのみ（ダメージへ混ざらない）
  ok(j100.explosionAreaMult() === 1.10, 'Lv100: 爆発範囲+10%(Lv40)');
}

// ===== 3. 到達報酬（レベル境界） =====
section('3. 到達報酬の解放レベル');
{
  // Lv5 火属性ダメージ+5%
  ok(approx(mk(5).damageMultiplier(fire()) - mk(4).damageMultiplier(fire()), 0.05 + 0.0035), 'Lv5: +5%（＋その1レベル分の基本成長）');
  ok(mk(4).damageMultiplier(fire()) < mk(5).damageMultiplier(fire()), 'Lv4では Lv5 報酬が無い');
  // Lv10 projectile速度
  ok(mk(9).projectileSpeedMult() === 1 && approx(mk(10).projectileSpeedMult(), 1.10), 'Lv10: 投射速度+10%（Lv9では無し）');
  // Lv20 cooldown
  ok(mk(19).cooldownMult() === 1 && approx(mk(20).cooldownMult(), 0.95), 'Lv20: CD-5%（Lv19では無し）');
  // Lv30 リロール
  ok(mk(29).extraRerolls() === 0 && mk(30).extraRerolls() === 1, 'Lv30: リロール+1（Lv29では無し）');
  // Lv40 爆発
  ok(mk(39).damageMultiplier(fire({ isExplosion: true })) === mk(39).damageMultiplier(fire()), 'Lv39: 爆発補正無し');
  ok(approx(mk(40).explosionAreaMult(), 1.10) && mk(39).explosionAreaMult() === 1, 'Lv40: 爆発範囲+10%（Lv39では無し）');
  // Lv60 進化
  ok(mk(59).damageMultiplier(fire({ isEvolved: true })) === mk(59).damageMultiplier(fire()), 'Lv59: 進化補正無し');
  ok(approx(mk(60).damageMultiplier(fire({ isEvolved: true })) / mk(60).damageMultiplier(fire()), 1.20), 'Lv60: 進化+20%');
  // Lv70 抽選重み
  ok(mk(69).rarityWeightMult('rare') === 1 && approx(mk(70).rarityWeightMult('rare'), 1.15), 'Lv70: rare重み×1.15（Lv69では無し）');
  ok(approx(mk(70).rarityWeightMult('legendary'), 1.25), 'Lv70: legendary重み×1.25');
  ok(mk(70).rarityWeightMult('common') === 1 && mk(70).rarityWeightMult('uncommon') === 1, 'Lv70: common/uncommon は不変');
  // Lv80 発射数
  ok(mk(79).projectileCountBonus() === 0 && mk(80).projectileCountBonus() === 1, 'Lv80: 発射数+1（Lv79では無し）');
  // Lv90 追加cooldown
  ok(approx(mk(90).cooldownMult(), 0.95 * 0.90) && approx(mk(89).cooldownMult(), 0.95), 'Lv90: 追加CD-10%（Lv89は-5%のみ）');
  // 火の魔女以外の架空ジョブ（config なし）は恒等
  const none = new JobModifierManager(); none.setResolved(JobModifierManager.resolve(null, 100));
  ok(none.damageMultiplier(fire()) === 1 && none.cooldownMult() === 1, '未定義ジョブでは効果が有効にならない');
}

// ===== 4. 残響詠唱 =====
section('4. 残響詠唱（Lv50 / Lv100）');
{
  // Lv50: 12回ごと・威力60%
  const j50 = mk(50);
  ok(j50.echoEnabled() && j50.echoInterval() === 12 && approx(j50.echoPower(), 0.6), 'Lv50: 12回・60%');
  let triggers = 0;
  for (let i = 1; i <= 11; i++) { if (j50.registerCast()) triggers++; }
  ok(triggers === 0, '11回では残響が発生しない');
  ok(j50.registerCast() === true, '12回目で残響が発生');
  ok(j50.echoCount() === 0, '残響発生でカウンターがリセット');

  // Lv100: 8回ごと・威力100%
  const j100 = mk(100);
  ok(j100.echoInterval() === 8 && approx(j100.echoPower(), 1.0), 'Lv100: 8回・100%');
  let t2 = 0;
  for (let i = 1; i <= 7; i++) { if (j100.registerCast()) t2++; }
  ok(t2 === 0, 'Lv100: 7回では発生しない');
  ok(j100.registerCast() === true, 'Lv100: 8回目で発生');

  // Lv49 では残響無し（registerCast は常に false＝カウントしない）
  const j49 = mk(49);
  let t3 = 0; for (let i = 0; i < 30; i++) if (j49.registerCast()) t3++;
  ok(!j49.echoEnabled() && t3 === 0, 'Lv49では残響が無効');
}

// ===== 5. 保存・復元（凍結値と残響カウンター） =====
section('5. 直列化・復元');
{
  const j = mk(100);
  j.registerCast(); j.registerCast(); j.registerCast(); // count=3
  const s = j.serialize();
  ok(s.resolved.jobLevel === 100 && s.echoCount === 3, 'serialize: 凍結値と残響カウンター');
  const j2 = new JobModifierManager();
  j2.restore(s);
  ok(approx(j2.damageMultiplier(fire()), j.damageMultiplier(fire())) && j2.echoCount() === 3, 'restore: 同じ補正と残響カウンター');
  // 復元した凍結値は同一（周回開始時レベルで固定される想定）
  ok(j2.jobLevel === 100, 'restore: jobLevel を保持');
}

// ===== 6. 抽選重み倍率（Lv70）が決定論を壊さない =====
section('6. Lv70 抽選重み × 決定論');
{
  const { SkillDraftManager } = await import('../src/systems/SkillDraftManager.js');
  const skills = load('skills.json').skills;
  const jobs = load('jobs.json').jobs;
  const cfgSk = load('skill-config.json');
  const job = jobs.find((j) => j.id === 'flame_witch');
  const catalog = skills.map((s) => ({ id: s.id, category: s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel, enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites, conflicts: s.conflicts, unlockCondition: s.unlockCondition }));
  const ctx = () => ({ catalog, job: { activeSkillPool: job.activeSkillPool, passiveSkillPool: [] }, owned: { active: { fireball: 1 }, passive: {} }, slots: { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 4, unlock: { highestClearedDifficulty: 0 } });
  const mult = { rare: mk(70).rarityWeightMult('rare'), legendary: mk(70).rarityWeightMult('legendary') };
  const openWith = (m) => { const d = new SkillDraftManager({ rarityWeights: cfgSk.rarityWeights, rarityWeightMult: m }); d.reset(123, {}); return d.open(ctx()); };
  const a = openWith(mult), b = openWith(mult);
  ok(JSON.stringify(a) === JSON.stringify(b), '同 seed・同重み倍率で同一候補（決定論維持）');
  // 重み倍率なし(Lv1)は従来と同一挙動
  const c1 = openWith(null), c2 = openWith({ rare: 1, legendary: 1 });
  ok(JSON.stringify(c1) === JSON.stringify(c2), 'Lv1(倍率1)は倍率なしと同一（非回帰）');
}

console.log('');
if (fail) { console.error(`✗ ジョブ補正テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ ジョブ補正テスト成功: ${pass} 件すべて通過`); process.exit(0); }
