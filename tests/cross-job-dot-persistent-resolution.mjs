// M9-A.1 3/15: DoT / persistent / delayed の解決。Node.js 標準機能のみ。
// 実行: node tests/cross-job-dot-persistent-resolution.mjs
import { QUALITIES, makeBattle, runProfile, instrument, gameplayTrace, sha, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('DoT / persistent / delayed 解決（M9-A.1）');
const { ok, section, info } = T;

const run = async (jobId, profile, build, seed) => {
  resetPhysics();
  const h = instrument(await makeBattle({ jobId, profile, build, seed }));
  runProfile(h);
  return h;
};

section('1. 火: 炎上 DoT / 起爆 / 連鎖 / 共鳴 / echo / clone が解決される');
{
  const h = await run('flame_witch', 'elite', 'full', 2121);
  const fin = h.scene.telemetry.finalize();
  ok(fin.run.status.burningDamage > 0, `炎上ダメージ > 0（${Math.round(fin.run.status.burningDamage)}）`);
  ok(h.paths.detonateMark > 0 || h.paths._doMarkExplosion > 0, `起爆刻印が起爆する（mark ${h.paths.detonateMark || 0} / explosion ${h.paths._doMarkExplosion || 0}）`);
  ok(h.paths.performClone > 0, `分身（clone）が発動する（${h.paths.performClone}）`);
  ok(h.paths.aoe > 0, `範囲ダメージが発生する（${h.paths.aoe}）`);
  // DoT が「一括」でなく tick で入っていること: dot タグの damage が複数フレームに分散する。
  // DoT が「一括」でなく tick で入っていること: 常設 / tick 系スキルが継続記録を持つ。
  const dotSkills = [...h.scene.skills.stats.entries()]
    .filter(([, x]) => { const e = x.extra || {}; return e.dotTicks || e.activeMs || e.totalBeamSeconds || e.maxConcurrent || e.minesPlaced; });
  ok(dotSkills.length > 0, `DoT / 常設の tick 記録があるスキルがある（${dotSkills.length} 種）`);
  info(`炎上 / DoT ダメージ ${Math.round(fin.run.status.burningDamage)}（M9-A.1 で dead key を解消）`);
}

section('2. 火（進化）: 連鎖起爆 / 分裂 / 炎上感染');
{
  const h = await run('flame_witch', 'elite', 'evolved', 2222);
  ok(h.paths.chainDetonate > 0 || h.paths.detonateMark > 0, `連鎖起爆が走る（chain ${h.paths.chainDetonate || 0}）`);
  ok((h.paths['proj:split_lance'] || 0) > 0, `分裂弾が生成される（${h.paths['proj:split_lance'] || 0}）`);
}

section('3. 氷: 冷気 / 凍結 / 粉砕 / ボスゲージ / 氷砕が解決される');
{
  const h = await run('frost_mage', 'elite', 'full', 2323);
  const c = h.scene.statusFx.counters();
  ok(c.chillApplications > 0, `冷気付与 > 0（${c.chillApplications}）`);
  ok(c.freezeAttempts > 0, `凍結判定 > 0（${c.freezeAttempts}）`);
  ok(c.freezeSuccesses > 0, `凍結成功 > 0（${c.freezeSuccesses}）`);
  const fin = h.scene.telemetry.finalize();
  ok(fin.run.status.iceDamage > 0, `氷ダメージ > 0（${Math.round(fin.run.status.iceDamage)}）`);
  const hb = await run('frost_mage', 'boss', 'full', 2323);
  const cb = hb.scene.statusFx.counters();
  ok(cb.bossGaugeApplications > 0, `ボス氷砕ゲージ付与 > 0（${cb.bossGaugeApplications}）`);
  const finb = hb.scene.telemetry.finalize();
  ok(finb.run.status.bossFrostbreaks > 0 || hb.paths._onBossFrostbreak > 0, `氷砕が発生する（${finb.run.status.bossFrostbreaks}）`);
  info(`氷: 冷気 ${c.chillApplications} / 凍結 ${c.freezeSuccesses} / 粉砕 ${fin.run.status.shatters} / 氷砕 ${finb.run.status.bossFrostbreaks}`);
}

section('4. 戦士: 近接 / 体勢 / 資源 / 移動攻撃が解決される');
{
  const h = await run('warrior', 'elite', 'full', 2424);
  const w = h.scene.warrior.summary();
  ok(w.meleeCasts > 0, `近接発動 > 0（${w.meleeCasts}）`);
  ok(h.paths.meleeStrike > 0, `meleeStrike が走る（${h.paths.meleeStrike}）`);
  ok(h.paths.movePlayerTowards > 0, `移動攻撃（踏み込み / 突進）が走る（${h.paths.movePlayerTowards}）`);
  ok(h.scene.kills > 0, `近接で撃破が発生する（${h.scene.kills}）`);
  // ★ production の meleeStrike は「即死した対象へは knockback / 体勢 / combo を乗せない」
  //   （`if (died) continue;`）。full build Lv8 は通常敵をほぼ 1 撃で倒すため、
  //   これらは **生き残る対象**（ボス / エリート）が居る profile で計測する。
  const hb = await run('warrior', 'boss', 'full', 2424);
  const wb = hb.scene.warrior.summary();
  ok(wb.meleeHits > 0, `ボス profile で近接命中 > 0（${wb.meleeHits}）`);
  ok(wb.poiseDamage > 0, `体勢ダメージ > 0（${Math.round(wb.poiseDamage)}）`);
  ok(wb.furyGained > 0, `闘気獲得 > 0（${Math.round(wb.furyGained)}）`);
  ok(wb.comboPeak > 0, `コンボ最大 > 0（${wb.comboPeak}）`);
  ok(wb.knockbacks > 0 || wb.eliteStaggers > 0 || wb.bossStanceBreaks > 0,
    `ノックバック / stagger / 崩しのいずれかが発生（kb ${wb.knockbacks} / stagger ${wb.eliteStaggers} / 崩し ${wb.bossStanceBreaks}）`);
  info(`戦士（boss profile）: 命中 ${wb.meleeHits} / 体勢 ${Math.round(wb.poiseDamage)} / 闘気 ${Math.round(wb.furyGained)} / コンボ最大 ${wb.comboPeak}`);
}

section('5. 死亡イベント / XP / レベルが 1 回ずつ記録される');
{
  const h = await run('warrior', 'normal', 'slot8', 2525);
  ok(h.paths.onEnemyKilled > 0, `撃破イベント（${h.paths.onEnemyKilled}）`);
  ok(h.paths._recordDeathEvent === h.paths.onEnemyKilled + (h.paths.onBossKilled || 0),
    `死亡イベントが撃破ごとに 1 回（${h.paths._recordDeathEvent} = ${h.paths.onEnemyKilled}+${h.paths.onBossKilled || 0}）`);
  ok(h.paths.grantXp > 0, `XP が付与される（${h.paths.grantXp}）`);
  ok(h.scene.player.level > 1, `レベルアップする（Lv${h.scene.player.level}）`);
}

section('6. 品質 4 段階で DoT / 状態 / 陣の結果が一致');
for (const j of ['flame_witch', 'frost_mage', 'warrior']) {
  const hashes = {};
  for (const q of QUALITIES) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: 'elite', build: 'full', seed: 2626, quality: q }));
    runProfile(h);
    hashes[q] = sha(gameplayTrace(h));
  }
  ok(new Set(Object.values(hashes)).size === 1, `${j}: 4 品質で DoT / 状態 / 資源を含む trace が一致`);
}

T.finish();
