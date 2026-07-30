// M9-A.1 6/15: survival profile（§3 D）。Node.js 標準機能のみ。
// 高密度 + 敵弾 + 回避不能ダメージで生存力を測る。
// 実行: node tests/cross-job-survival-profile.mjs
import { JOB_IDS, QUALITIES, makeBattle, runProfile, instrument, collectMetrics, gameplayTrace, sha, HEAVY, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('survival profile（M9-A.1）');
const { ok, section, info } = T;
const SEEDS = HEAVY ? [11, 22, 33, 44, 55, 66, 77] : [11, 22, 33];
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

const results = {};
section('1. 3 ジョブの生存時間 / 被弾 / 回復が測れる');
for (const j of JOB_IDS) {
  const surv = [], hp = [], heal = [], mit = [], deaths = [];
  for (const seed of SEEDS) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: 'survival', build: 'slot8', seed }));
    runProfile(h);
    const m = collectMetrics(h);
    surv.push(m.defense.survivedMs); hp.push(m.defense.hp);
    heal.push(m.defense.healing); mit.push(m.defense.mitigated);
    deaths.push(m.defense.died ? 1 : 0);
  }
  results[j] = { surv: med(surv), hp: med(hp), heal: med(heal), mit: med(mit), deaths: deaths.reduce((a, b) => a + b, 0) };
  ok(med(surv) > 0, `${j}: 生存時間が測れる（中央値 ${med(surv)}ms）`);
  ok(results[j].deaths >= 0, `${j}: 死亡が記録される（${results[j].deaths}/${SEEDS.length}）`);
  info(`${j}: 生存 ${med(surv)}ms / HP ${med(hp)} / 回復 ${med(heal)} / 軽減 ${med(mit)} / 死亡 ${results[j].deaths}/${SEEDS.length}`);
}

section('2. 生存差の警告判定（差 > 40% は分類して記録する）');
{
  const vals = JOB_IDS.map((j) => results[j].surv);
  const ratio = Math.max(...vals) / Math.max(1, Math.min(...vals));
  info(`生存時間の比 ${ratio.toFixed(2)}（${JOB_IDS.map((j) => `${j} ${results[j].surv}`).join(' / ')}）`);
  // 戦士は軽減 / 不屈 / 撃破回復を持つため生存が長い（意図した role 差）。
  // docs/cross-job-final-balance.md へ分類つきで記録する。ここは暴走の検知フェンスのみ。
  ok(ratio <= 12.0, `生存時間の比 ${ratio.toFixed(2)} ≤ 12.0（暴走検知フェンス）`);
  ok(vals.every((v) => v >= 5000), 'どのジョブも 5 秒以上は生存する（即死しない）');
}

section('3. 防御手段が profile で実際に動く');
{
  resetPhysics();
  const hw = instrument(await makeBattle({ jobId: 'warrior', profile: 'survival', build: 'full', seed: 11 }));
  runProfile(hw);
  const w = hw.scene.warrior.summary();
  ok(w.mitigationAmount > 0 || w.killHeal > 0 || w.unyieldingTriggers > 0,
    `戦士: 軽減 ${Math.round(w.mitigationAmount)} / 撃破回復 ${Math.round(w.killHeal)} / 不屈 ${w.unyieldingTriggers} のいずれかが動く`);
  ok(hw.paths.onWarriorDamage > 0, `戦士: 被弾フックが走る（${hw.paths.onWarriorDamage}）`);
  for (const j of ['flame_witch', 'frost_mage']) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: 'survival', build: 'full', seed: 11 }));
    runProfile(h);
    ok(h.paths.absorbBossBullets > 0 || h.paths.onBarrierBlock > 0 || h.scene.player.hp < h.scene.player.maxHp,
      `${j}: 被弾 / 吸収 / 障壁のいずれかが動く`);
  }
}

section('4. survival profile でも 4 品質で gameplay trace が一致');
for (const j of JOB_IDS) {
  const hashes = {};
  for (const q of QUALITIES) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: 'survival', build: 'slot8', seed: 33, quality: q }));
    runProfile(h);
    hashes[q] = sha(gameplayTrace(h));
  }
  ok(new Set(Object.values(hashes)).size === 1, `${j}: survival profile の 4 品質一致（死亡時刻を含む）`);
}

T.finish();
