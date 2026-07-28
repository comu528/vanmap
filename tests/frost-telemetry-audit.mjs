// 氷術師 完成監査 12/12: テレメトリ監査（M7-E §24）。Node.js 標準機能のみ。
// active30・進化18 のテレメトリキー（cast/hit/damage/chill/freeze/shatter/boss gauge/defensiveValue/activeTime/extra）が
// 記録されること、debugRun が通常統計と分離されること、reload で二重加算されないこと、外部送信が無いことを確認する。
// 実行: node tests/frost-telemetry-audit.mjs

import { DATA, FROST, registryMap, skillSource, readSrc, makeScene, makeEnemies, runner } from './frost-audit-common.mjs';
import { CombatTelemetry } from '../src/systems/CombatTelemetry.js';
import { applyRun, emptyTelemetry, mergeRunIntoSummary } from '../src/systems/RunBalanceSummary.js';

globalThis.Phaser = { BlendModes: { ADD: 1, NORMAL: 0 } };
globalThis.window = globalThis.window || {};

const { DataManager } = await import('../src/systems/DataManager.js');
for (const [k, v] of Object.entries({
  skills: { skills: DATA.skills }, skillEvolutions: { evolutions: DATA.evolutions }, balance: DATA.balance,
  skillMastery: DATA.skillMastery, passives: { passives: DATA.passives }, jobs: { jobs: DATA.jobs },
  skillConfig: DATA.skillConfig, jobProgression: DATA.jobProgression, statusEffects: DATA.statusEffects,
})) DataManager.data[k] = v;
for (const s of DATA.skills) DataManager._skillMap.set(s.id, s);
DataManager.loaded = true;
const { SkillManager } = await import('../src/systems/SkillManager.js');

const T = runner('氷術師 テレメトリ監査（M7-E）');
const { ok, section, info } = T;
const MAP = registryMap();
const EVO_BASE = {};
for (const e of DATA.evolutions) if (FROST.evolutionPool.includes(e.id)) EVO_BASE[e.id] = e.baseSkillId;

// ===== 1. 全スキルが SkillManager の統計へ現れる =====
section('1. active30・進化18 が統計（casts/hits/damage/extra）へ現れる');
const silent = [];
for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
  const isActive = FROST.activeSkillPool.includes(id);
  // 防御スキルは敵弾の吸収でのみ動くため、吸収が発生する scene で駆動する。
  const scene = makeScene({ enemies: makeEnemies(16), absorb: 1 });
  const sm = new SkillManager(scene); scene.skills = sm;
  if (isActive) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  else { sm.acquireOrLevel(EVO_BASE[id]); sm.setLevel(EVO_BASE[id], 8); sm.evolve(EVO_BASE[id]); }
  for (let i = 0; i < 160; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  // statsList() は casts/damage/kills を持つものだけを返す（結果画面向け）。防御スキルは extra のみのため raw を見る。
  const stats = sm.stats.get(id) || {};
  const extras = stats.extra || {};
  const any = (stats.casts || 0) > 0 || (stats.hits || 0) > 0 || (stats.damage || 0) > 0 || Object.keys(extras).length > 0
    || scene.calls.some((c) => c[3] === id || c[5] === id);
  ok(any, `${id}: 何らかのテレメトリ（cast / hit / damage / extra / combat 呼び出し）が発生する`);
  if (!any) silent.push(id);
  // 0 の extra キーが「未接続」なのか「未発生」なのか判別できる（キー自体は宣言され値が数値）。
  for (const [k, v] of Object.entries(extras)) ok(typeof v === 'number' && Number.isFinite(v), `${id}: extra ${k} が有限数（${v}）`);
}
info(`テレメトリが発生しないスキル: ${silent.join(', ') || 'なし'}`);

// ===== 2. recordCast と casts が一致（二重計上なし）=====
section('2. recordCast の回数と統計の casts が一致（二重計上なし）');
{
  const scene = makeScene({ enemies: makeEnemies(8) });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel('frost_shard'); sm.setLevel('frost_shard', 8);
  let casts = 0;
  scene._onSkillCast = () => { casts++; };
  for (let i = 0; i < 200; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  const stat = sm.statsList().find((s) => s.id === 'frost_shard');
  ok(stat.casts === casts, `casts ${stat.casts} = recordCast 通知 ${casts}`);
  ok(stat.casts > 0, '主発動が実際に記録される');
  // 残響/分身の再実行は casts を進めない。
  const before = stat.casts;
  sm.requestEchoCast('frost_shard');
  sm.requestCloneCast('frost_shard');
  const after = sm.statsList().find((s) => s.id === 'frost_shard').casts;
  ok(after === before, '残響/分身の再実行で casts が増えない（発動数の二重計上なし）');
}

// ===== 3. CombatTelemetry のキーが氷術師向けに揃っている =====
section('3. CombatTelemetry のスキル別キー（氷）と周回キー');
{
  const t = new CombatTelemetry({ jobId: 'frost_mage', seed: 1, quality: 'high', debugRun: false });
  t.noteSkillAcquired('frost_shard', 3, 1);
  t.addSkillStat('frost_shard', { casts: 2, hits: 5, damage: 100, chillApplied: 30, freezeAttempts: 4, freezesCaused: 1, shatters: 1, shatterDamage: 20, bossFrostGaugeApplied: 40, damageToChilled: 10, damageToFrozen: 5, damageToFrostbreakTarget: 3 });
  t.addDefensiveStat('winter_halo', { blockedDamage: 50, absorbedBullets: 2, lethalAvoided: 1 });
  t.addActiveTime('aurora_veil', 1500);
  for (const k of ['chillApplied', 'freezeAttempts', 'freezes', 'shatters', 'shatterDamage', 'bossFrostbreaks', 'frostbreakVulnerabilitySeconds', 'iceDamage', 'frozenSecondsApplied']) t.noteStatusEvent(k, 1);
  t.noteRunResult({ survivalSeconds: 300, victory: true, totalDamage: 1000, evolutions: 2 });
  const fin = t.finalize();
  for (const k of ['chillApplied', 'freezeAttempts', 'freezesCaused', 'shatters', 'shatterDamage', 'bossFrostGaugeApplied', 'damageToChilled', 'damageToFrozen', 'damageToFrostbreakTarget']) {
    ok(k in fin.skills.frost_shard, `スキル別キー ${k} を持つ`);
  }
  ok(fin.skills.winter_halo.defensiveValue > 0, '防御スキルの defensiveValue が算出される');
  ok(fin.skills.aurora_veil.activeSeconds > 0, 'activeSeconds（設置/常設の稼働時間）が算出される');
  for (const k of ['chillApplied', 'freezeAttempts', 'freezes', 'shatters', 'shatterDamage', 'bossFrostbreaks', 'frostbreakVulnerabilitySeconds', 'iceDamage', 'frozenSecondsApplied']) {
    ok(fin.run.status[k] > 0, `周回キー status.${k} が記録される`);
  }
  ok(fin.run.jobId === 'frost_mage', 'jobId が記録される（ジョブ別集計）');
}

// ===== 4. debugRun は通常統計へ混ざらない =====
section('4. debugRun と通常 profile 統計の分離');
{
  const mk = (debugRun) => {
    const t = new CombatTelemetry({ jobId: 'frost_mage', debugRun });
    t.addSkillStat('frost_shard', { casts: 1, damage: 100 });
    t.noteRunResult({ totalDamage: 100 });
    return t.finalize();
  };
  let bt = emptyTelemetry();
  bt = applyRun(bt, mk(true));
  ok(Object.keys(bt.summaryBySkill).length === 0, 'debugRun は summaryBySkill へ入らない');
  ok(bt.recentRuns.length === 0, 'debugRun は recentRuns へ入らない');
  ok(bt.debugRuns.length === 1, 'debugRun は debugRuns へ入る');
  bt = applyRun(bt, mk(false));
  ok(Object.keys(bt.summaryBySkill).length === 1, '通常 run は summaryBySkill へ入る');
  ok(bt.recentRuns.length === 1, '通常 run は recentRuns へ入る');
  ok(bt.debugRuns.length === 1, '通常 run は debugRuns を増やさない');
}

// ===== 5. reload で二重加算されない =====
section('5. 同じ周回スナップショットを2回畳み込んでも統計が壊れない（reload 二重加算の検出）');
{
  const t = new CombatTelemetry({ jobId: 'frost_mage' });
  t.addSkillStat('frost_shard', { casts: 4, damage: 200 });
  t.noteRunResult({ totalDamage: 200 });
  const fin = t.finalize();
  const s1 = {}; mergeRunIntoSummary(s1, fin);
  const s2 = {}; mergeRunIntoSummary(s2, fin); mergeRunIntoSummary(s2, fin);
  ok(s1.frost_shard.samples === 1 && s2.frost_shard.samples === 2, '畳み込み回数は samples に正しく反映される（黙って倍増しない）');
  ok(s2.frost_shard.totalDps === s1.frost_shard.totalDps, 'DPS は走査平均のため2回畳み込みでも値が跳ねない');
  // 周回中は BattleManager のスナップショット→復元経路であり、finalize は周回終了時の1回だけ。
  const bm = readSrc('src/systems/BattleManager.js');
  ok(/buildRunSnapshot/.test(bm), 'BattleManager が周回スナップショットを作る（途中再開は snapshot 経由）');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok((bs.match(/telemetry\.finalize\(\)/g) || []).length <= 2, 'finalize の呼び出し箇所が限定されている（周回終了時のみ）');
}

// ===== 6. 進化・rootSkillId の扱い =====
section('6. 進化スキルのテレメトリ id と進化前後の関連付け');
{
  const t = new CombatTelemetry({ jobId: 'frost_mage' });
  t.noteSkillEvolved('frost_shard', 'diamond_blizzard');
  const fin = t.finalize();
  ok(fin.skills.diamond_blizzard.baseId === 'frost_shard', '進化行が baseId を持つ');
  ok(fin.skills.frost_shard.evolutionId === 'diamond_blizzard', '進化元行が evolutionId を持つ');
  ok(fin.skills.frost_shard.evolved === true && fin.skills.diamond_blizzard.evolved === true, '両方が evolved フラグを持つ');
  // 進化スキルは自分自身の id でテレメトリを記録する（元 active へ混ざらない）。
  for (const eid of FROST.evolutionPool) {
    const src = skillSource(eid, MAP);
    ok(!/recordExtra\(\s*this\.baseSkillId/.test(src) && !/recordCast\(\s*this\.baseSkillId/.test(src), `${eid}: 進化元 id では記録しない`);
    ok(!/recordExtra\('/.test(src) || /recordExtra\(this\.id/.test(src), `${eid}: recordExtra は this.id で記録する`);
  }
}

// ===== 7. 外部送信なし =====
section('7. 外部送信なし（ローカル保存のみ）');
for (const f of ['src/systems/CombatTelemetry.js', 'src/systems/RunBalanceSummary.js', 'src/systems/BalanceWarnings.js',
  'src/systems/FrostBalanceWarnings.js', 'src/systems/BalancePlaytest.js', 'src/systems/DraftBalanceAnalyzer.js']) {
  const s = readSrc(f);
  ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\//.test(s), `${f}: 外部送信/外部URL を含まない`);
}

T.finish();
