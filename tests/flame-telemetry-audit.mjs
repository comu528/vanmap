// 火の魔女 完成監査 12/12: テレメトリ監査（M8-A §13）。Node.js 標準機能のみ。
// active30・進化18 のテレメトリ（cast/hit/damage/kill/defensiveValue/activeTime/extra）が記録されること、
// debugRun が通常統計と分離されること、reload で二重加算されないこと、外部送信が無いことを確認する。
// 実行: node tests/flame-telemetry-audit.mjs

import { DATA, FLAME, registryMap, skillSource, readSrc, makeScene, makeEnemies, runner, bootRuntime, evolutionBaseMap } from './flame-audit-common.mjs';
import { CombatTelemetry } from '../src/systems/CombatTelemetry.js';
import { applyRun, emptyTelemetry, mergeRunIntoSummary } from '../src/systems/RunBalanceSummary.js';

const { SkillManager } = await bootRuntime();

const T = runner('火の魔女 テレメトリ監査（M8-A）');
const { ok, section, info } = T;
const MAP = registryMap();
const EVO_BASE = evolutionBaseMap();

// ===== 1. 全スキルが SkillManager の統計へ現れる =====
section('1. active30・進化18 が統計（casts/hits/damage/extra）へ現れる');
const silent = [];
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  const isActive = FLAME.activeSkillPool.includes(id);
  // 防御/反応スキルは敵弾の吸収や被弾でのみ動くため、吸収が発生する scene で駆動する。
  const scene = makeScene({ enemies: makeEnemies(16), absorb: 1, seed: 0x9a41b2, deathEvents: [{ id: 1, x: 320, y: 200 }] });
  const sm = new SkillManager(scene); scene.skills = sm;
  if (isActive) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  else { sm.acquireOrLevel(EVO_BASE[id]); sm.setLevel(EVO_BASE[id], 8); sm.evolve(EVO_BASE[id]); }
  for (let i = 0; i < 200; i++) {
    scene.advance(50);
    sm.update(50, { hasEnemies: true });
    // 移動/反応系（爆炎歩法）はダッシュでのみ発動するため、一定間隔でダッシュを発生させる。
    if (i % 40 === 10) { sm.dispatchDash('start', scene.player); scene.player.x += 30; sm.dispatchDash('move', scene.player); sm.dispatchDash('end', scene.player); }
  }
  const stats = sm.stats.get(id) || {};
  const extras = stats.extra || {};
  const any = (stats.casts || 0) > 0 || (stats.hits || 0) > 0 || (stats.damage || 0) > 0 || Object.keys(extras).length > 0
    || scene.calls.some((c) => c[3] === id || c[5] === id);
  ok(any, `${id}: 何らかのテレメトリ（cast / hit / damage / extra / combat 呼び出し）が発生する`);
  if (!any) silent.push(id);
  for (const [k, v] of Object.entries(extras)) ok(typeof v === 'number' && Number.isFinite(v), `${id}: extra ${k} が有限数（${v}）`);
}
info(`テレメトリが発生しないスキル: ${silent.join(', ') || 'なし'}`);
ok(silent.length === 0, `テレメトリ 0 のスキルが無い（実際 ${silent.length}）`);

// ===== 2. recordCast と casts が一致（二重計上なし）=====
section('2. recordCast の回数と統計の casts が一致（二重計上なし）');
{
  const scene = makeScene({ enemies: makeEnemies(8), seed: 0x9a41b2 });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel('fireball'); sm.setLevel('fireball', 8);
  let casts = 0;
  scene._onSkillCast = () => { casts++; };
  for (let i = 0; i < 200; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  const stat = sm.statsList().find((s) => s.id === 'fireball');
  ok(stat.casts === casts, `casts ${stat.casts} = recordCast 通知 ${casts}`);
  ok(stat.casts > 0, '主発動が実際に記録される');
  // 残響/分身の再実行は casts を進めない。
  const before = stat.casts;
  sm.requestEchoCast('fireball');
  sm.requestCloneCast('fireball');
  const after = sm.statsList().find((s) => s.id === 'fireball').casts;
  ok(after === before, '残響/分身の再実行で casts が増えない（発動数の二重計上なし）');
}
// 常設型（自前 update）も主発動を1回だけ記録する（スロットル）。
section('2b. 常設型スキルの主発動スロットル（recordCast が毎フレーム走らない）');
for (const id of ['orbiting_flame', 'fire_spirit']) {
  const scene = makeScene({ enemies: makeEnemies(12), seed: 0x9a41b2 });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel(id); sm.setLevel(id, 8);
  let casts = 0; scene._onSkillCast = () => { casts++; };
  const frames = 200; // 10 秒
  for (let i = 0; i < frames; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  ok(casts > 0, `${id}: 主発動が記録される（${casts} 回 / 10秒）`);
  ok(casts < frames, `${id}: 毎フレーム記録していない（${casts} < ${frames}）`);
}
for (const eid of ['eternal_pyre', 'solar_annihilation_array']) {
  const scene = makeScene({ enemies: makeEnemies(12), seed: 0x9a41b2 });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel(EVO_BASE[eid]); sm.setLevel(EVO_BASE[eid], 8); sm.evolve(EVO_BASE[eid]);
  let casts = 0; scene._onSkillCast = () => { casts++; };
  for (let i = 0; i < 200; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  ok(casts > 0, `${eid}: M8-A で主発動が記録されるようになった（${casts} 回 / 10秒・以前は 0 で残響が発生しなかった）`);
  ok(casts < 200, `${eid}: 毎フレーム記録していない（${casts} < 200）`);
}

// ===== 3. CombatTelemetry のキーが火の魔女向けに揃っている =====
section('3. CombatTelemetry のスキル別キーと周回キー');
{
  const t = new CombatTelemetry({ jobId: 'flame_witch', seed: 1, quality: 'high', debugRun: false });
  t.noteSkillAcquired('fireball', 3, 1);
  t.addSkillStat('fireball', { casts: 2, hits: 5, damage: 100, kills: 3 });
  t.addDefensiveStat('flame_barrier', { blockedDamage: 50, absorbedBullets: 2, lethalAvoided: 1 });
  t.addActiveTime('eternal_pyre', 1500);
  t.noteRunResult({ survivalSeconds: 300, victory: true, totalDamage: 1000, evolutions: 2 });
  const fin = t.finalize();
  for (const k of ['casts', 'hits', 'damage']) ok(k in fin.skills.fireball, `スキル別キー ${k} を持つ`);
  ok(fin.skills.flame_barrier.defensiveValue > 0, '防御スキルの defensiveValue が算出される');
  ok(fin.skills.eternal_pyre.activeSeconds > 0, 'activeSeconds（設置/常設の稼働時間）が算出される');
  ok(fin.run.jobId === 'flame_witch', 'jobId が記録される（ジョブ別集計）');
  ok(fin.skills.fireball.damageShare >= 0, 'damageShare（ダメージ寄与率）が算出される');
}

// ===== 4. debugRun は通常統計へ混ざらない =====
section('4. debugRun と通常 profile 統計の分離');
{
  const mk = (debugRun) => {
    const t = new CombatTelemetry({ jobId: 'flame_witch', debugRun });
    t.addSkillStat('fireball', { casts: 1, damage: 100 });
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
  const t = new CombatTelemetry({ jobId: 'flame_witch' });
  t.addSkillStat('fireball', { casts: 4, damage: 200 });
  t.noteRunResult({ totalDamage: 200 });
  const fin = t.finalize();
  const s1 = {}; mergeRunIntoSummary(s1, fin);
  const s2 = {}; mergeRunIntoSummary(s2, fin); mergeRunIntoSummary(s2, fin);
  ok(s1.fireball.samples === 1 && s2.fireball.samples === 2, '畳み込み回数は samples に正しく反映される（黙って倍増しない）');
  ok(s2.fireball.totalDps === s1.fireball.totalDps, 'DPS は走査平均のため2回畳み込みでも値が跳ねない');
  const bm = readSrc('src/systems/BattleManager.js');
  ok(/buildRunSnapshot/.test(bm), 'BattleManager が周回スナップショットを作る（途中再開は snapshot 経由）');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok((bs.match(/telemetry\.finalize\(\)/g) || []).length <= 2, 'finalize の呼び出し箇所が限定されている（周回終了時のみ）');
}

// ===== 6. 進化スキルは自分の id で記録する =====
section('6. 進化スキルのテレメトリ id と進化前後の関連付け');
{
  const t = new CombatTelemetry({ jobId: 'flame_witch' });
  t.noteSkillEvolved('fireball', 'infernal_barrage');
  const fin = t.finalize();
  ok(fin.skills.infernal_barrage.baseId === 'fireball', '進化行が baseId を持つ');
  ok(fin.skills.fireball.evolutionId === 'infernal_barrage', '進化元行が evolutionId を持つ');
  ok(fin.skills.fireball.evolved === true && fin.skills.infernal_barrage.evolved === true, '両方が evolved フラグを持つ');
  for (const eid of FLAME.evolutionPool) {
    const src = skillSource(eid, MAP);
    ok(!/recordExtra\(\s*this\.baseSkillId/.test(src) && !/recordCast\(\s*this\.baseSkillId/.test(src), `${eid}: 進化元 id では記録しない`);
    ok(!/recordExtra\('/.test(src) || /recordExtra\(this\.id/.test(src), `${eid}: recordExtra は this.id で記録する`);
  }
}
// 進化後は元 active の id でダメージが記録されない（実駆動）。
for (const eid of FLAME.evolutionPool) {
  const base = EVO_BASE[eid];
  const scene = makeScene({ enemies: makeEnemies(12), absorb: 1, seed: 0x9a41b2, deathEvents: [{ id: 1, x: 320, y: 200 }] });
  const sm = new SkillManager(scene); scene.skills = sm;
  sm.acquireOrLevel(base); sm.setLevel(base, 8); sm.evolve(base);
  const baseDamageBefore = (sm.stats.get(base) || {}).damage || 0;
  for (let i = 0; i < 120; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  const baseDamageAfter = (sm.stats.get(base) || {}).damage || 0;
  ok(baseDamageAfter === baseDamageBefore, `${eid}: 進化後に元 ${base} の damage が増えない（id の取り違えなし）`);
}

// ===== 7. sourceSkillId / rootSkillId が維持される =====
section('7. 残響/分身の castContext が sourceSkillId / rootSkillId を保持する');
{
  const cp = readSrc('src/systems/CastPolicy.js');
  ok(/parentSkillId: p\.parentSkillId \|\| p\.rootSkillId \|\| null/.test(cp), 'parentSkillId（発生元）を子へ引き継ぐ');
  ok(/rootSkillId: p\.rootSkillId \|\| p\.parentSkillId \|\| null/.test(cp), 'rootSkillId（根）を子へ引き継ぐ');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/_runReplay\(/.test(bs), '残響/分身は _runReplay の1経路で実行される（テレメトリの二重記録なし）');
}

// ===== 8. 外部送信なし =====
section('8. 外部送信なし（ローカル保存のみ）');
for (const f of ['src/systems/CombatTelemetry.js', 'src/systems/RunBalanceSummary.js', 'src/systems/BalanceWarnings.js',
  'src/systems/FlameBalanceWarnings.js', 'src/systems/FrostBalanceWarnings.js', 'src/systems/BalancePlaytest.js',
  'src/systems/DraftBalanceAnalyzer.js']) {
  const s = readSrc(f);
  ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\//.test(s), `${f}: 外部送信/外部URL を含まない`);
}

void DATA;
T.finish();
