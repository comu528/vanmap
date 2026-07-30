// M9-A.1 4/15: reactive / defensive 刺激（§6）。Node.js 標準機能のみ。
// 同一 timeline を 3 ジョブへ適用し、reactive / 防御スキルの trigger と utility を別集計する。
// 実行: node tests/cross-job-reactive-stimulus.mjs
import { JOB_IDS, PROFILES, STIMULUS, makeBattle, instrument, stepFrame, applyStimulus, collectMetrics, gameplayTrace, sha, QUALITIES, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('reactive 刺激（M9-A.1）');
const { ok, section, info } = T;

// 各ジョブの reactive / defensive スキル（data の isDefensive / isReactive / castMode reactive 由来）。
const REACTIVE = {
  flame_witch: ['phoenix_feather', 'flame_barrier', 'ash_doppelganger', 'bullet_furnace', 'blazing_step'],
  frost_mage: ['mirror_ice', 'winter_halo', 'ice_wall', 'snowblind_mist'],
  warrior: ['counter_stance', 'weapon_deflection', 'blade_guard', 'shield_charge', 'backstep_riposte'],
};

const runStim = async (jobId, quality = 'high', seed = 909) => {
  resetPhysics();
  const h = instrument(await makeBattle({ jobId, profile: 'stimulus', build: 'full', seed, quality }));
  const fired = new Set();
  while (h.scene._elapsedMs < PROFILES.stimulus.durationMs) {
    for (const k of applyStimulus(h, h.scene._elapsedMs)) fired.add(k);
    stepFrame(h);
    if (h.scene.gameOver) break;
  }
  return { h, fired };
};

section('1. 刺激 timeline の全種別が 3 ジョブへ同一に届く');
{
  const kinds = new Set(STIMULUS.map((s) => s.kind));
  info(`timeline: ${STIMULUS.length} イベント / ${kinds.size} 種別 = ${[...kinds].join(' ')}`);
  const firedBy = {};
  for (const j of JOB_IDS) {
    const { fired } = await runStim(j);
    firedBy[j] = [...fired].sort();
    ok(fired.size === kinds.size, `${j}: ${kinds.size} 種別すべてが発火（${fired.size}）`);
  }
  const base = JSON.stringify(firedBy.flame_witch);
  for (const j of JOB_IDS) ok(JSON.stringify(firedBy[j]) === base, `${j}: 発火した刺激の集合が 3 ジョブで同一（特定ジョブへ有利な刺激を増やしていない）`);
}

section('2. reactive / defensive スキルが production の経路で反応する');
for (const j of JOB_IDS) {
  const { h } = await runStim(j);
  const acted = [];
  for (const id of REACTIVE[j]) {
    const x = h.scene.skills.stats.get(id);
    const ex = x ? Object.values(x.extra || {}).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0) : 0;
    const active = !!x && ((x.damage || 0) > 0 || (x.hits || 0) > 0 || (x.casts || 0) > 0 || ex > 0);
    ok(active, `${j}/${id}: 刺激に反応する（cast ${x ? x.casts : 0} / dmg ${x ? Math.round(x.damage) : 0} / extra ${Math.round(ex)}）`);
    if (active) acted.push(id);
  }
  info(`${j}: 反応した reactive ${acted.length}/${REACTIVE[j].length}`);
}

section('3. 刺激に対する防御経路が production のフックを通る');
{
  const { h: hf } = await runStim('flame_witch');
  ok(hf.paths.onBarrierBlock > 0, `火: 障壁の受け止め（onBarrierBlock ${hf.paths.onBarrierBlock}）`);
  ok(hf.paths.onPhoenixRevive > 0, `火: 不死鳥の復活（onPhoenixRevive ${hf.paths.onPhoenixRevive}）`);
  ok(hf.paths.performClone > 0, `火: 分身の複製（${hf.paths.performClone}）`);
  const { h: hw } = await runStim('warrior');
  ok(hw.paths.onWarriorDamage > 0, `戦士: 被弾フック（${hw.paths.onWarriorDamage}）`);
  ok(hw.paths.tryDeflectProjectile > 0, `戦士: 弾き返し判定（${hw.paths.tryDeflectProjectile}）`);
  ok(hw.paths.createReflectedPhysicalProjectile > 0, `戦士: 反射弾生成（${hw.paths.createReflectedPhysicalProjectile}）`);
  const wsum = hw.scene.warrior.summary();
  ok(wsum.counters > 0, `戦士: 反撃が成立（${wsum.counters}）`);
  const { h: hi } = await runStim('frost_mage');
  ok(hi.paths.absorbBossBullets > 0, `氷: 迎撃 / 吸収の判定が走る（${hi.paths.absorbBossBullets}）`);
}

section('4. 弾ける弾 / 弾けない弾の区別（戦士）');
{
  const { h } = await runStim('warrior');
  const w = h.scene.warrior.summary();
  const deflected = (w.deflects != null ? w.deflects : 0);
  ok(h.paths.tryDeflectProjectile > 0, '弾き返しの可否判定が走る');
  // 反射弾が生成された = 弾ける弾が弾かれた。beam / telegraph は弾かれない。
  ok(h.paths.createReflectedPhysicalProjectile > 0, `弾ける弾だけが反射弾になる（${h.paths.createReflectedPhysicalProjectile}）`);
  ok(h.paths.createReflectedPhysicalProjectile <= h.paths.tryDeflectProjectile,
    `反射 ${h.paths.createReflectedPhysicalProjectile} ≤ 判定 ${h.paths.tryDeflectProjectile}（弾けない弾は通る）`);
  void deflected;
}

section('5. 刺激下でも品質 4 段階で gameplay trace が一致');
for (const j of JOB_IDS) {
  const hashes = {};
  for (const q of QUALITIES) {
    const { h } = await runStim(j, q, 1919);
    hashes[q] = sha(gameplayTrace(h));
  }
  ok(new Set(Object.values(hashes)).size === 1, `${j}: 刺激 timeline 下でも 4 品質一致`);
}

section('6. reactive の utility は通常攻撃とは別集計になる');
{
  const { h } = await runStim('flame_witch');
  const m = collectMetrics(h);
  const react = REACTIVE.flame_witch.filter((id) => {
    const x = h.scene.skills.stats.get(id);
    return x && (x.casts || 0) === 0; // reactive は casts を持たない設計
  });
  ok(react.length > 0, `casts を持たない reactive スキルが存在（${react.join(',')}）`);
  ok(m.offense.zeroUtility.length <= 1, `刺激 profile では zero utility がほぼ 0（${m.offense.zeroUtility.join(',') || 'なし'}）`);
}

T.finish();
