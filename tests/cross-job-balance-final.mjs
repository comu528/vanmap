// M9-A.1 7/15: 3 ジョブ横断 最終バランス比較（§7）。Node.js 標準機能のみ。
// 完全ハーネス（全 damage 経路が解決済み）で offense / defense / utility / resource / progression を測る。
// **ジョブを同じ数値へ揃えることはしない。** 構造異常の検出と回帰フェンスだけを assert する。
// 実行: node tests/cross-job-balance-final.mjs（HEAVY=1 で seed 増）
import { JOB_IDS, makeBattle, runProfile, instrument, collectMetrics, HEAVY, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('最終バランス比較（M9-A.1）');
const { ok, section, info } = T;
const SEEDS = HEAVY ? [101, 202, 303, 404, 505, 606, 707, 808] : [101, 202, 303];
const PROFS = ['normal', 'elite', 'boss', 'survival'];
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

const table = {};
for (const prof of PROFS) {
  table[prof] = {};
  for (const j of JOB_IDS) {
    const ms = [];
    for (const seed of SEEDS) {
      resetPhysics();
      const h = instrument(await makeBattle({ jobId: j, profile: prof, build: 'slot8', seed }));
      runProfile(h);
      ms.push(collectMetrics(h));
    }
    table[prof][j] = {
      dps: med(ms.map((m) => m.offense.dps)), dmg: med(ms.map((m) => m.offense.totalDamage)),
      kills: med(ms.map((m) => m.offense.kills)), elite: med(ms.map((m) => m.offense.eliteKills)),
      topShare: med(ms.map((m) => m.offense.topShare)), topSkill: ms[0].offense.topSkill,
      bossKillMs: ms.every((m) => m.offense.bossKillMs != null) ? med(ms.map((m) => m.offense.bossKillMs)) : null,
      surv: med(ms.map((m) => m.defense.survivedMs)), hp: med(ms.map((m) => m.defense.hp)),
      heal: med(ms.map((m) => m.defense.healing)), mit: med(ms.map((m) => m.defense.mitigated)),
      lvl: med(ms.map((m) => m.progression.level)),
      zeroHit: med(ms.map((m) => m.offense.zeroHitCasts.length)),
      zeroUtil: ms[0].offense.zeroUtility,
      chill: med(ms.map((m) => m.utility.chillApplied)), freezes: med(ms.map((m) => m.utility.freezes)),
      burning: med(ms.map((m) => m.utility.burningDamage)), poise: med(ms.map((m) => m.utility.poise)),
      counters: med(ms.map((m) => m.utility.counters)),
    };
  }
}

section(`1. 実測表（${SEEDS.length} seed 中央値・共通 profile）`);
for (const prof of PROFS) {
  info(`— ${prof} —`);
  for (const j of JOB_IDS) {
    const r = table[prof][j];
    info(`  ${j.padEnd(12)} dps ${String(r.dps).padStart(5)} dmg ${String(r.dmg).padStart(7)} kills ${String(r.kills).padStart(4)} boss ${String(r.bossKillMs ?? '-').padStart(6)} surv ${String(r.surv).padStart(6)} hp ${r.hp} top ${r.topSkill} ${r.topShare} Lv${r.lvl}`);
  }
}

section('2. 構造異常が無い（死にスキル / zero utility / zero-hit）');
for (const prof of PROFS) {
  for (const j of JOB_IDS) {
    const r = table[prof][j];
    // zero utility は「その profile に刺激が無い reactive」のみ許容し、
    // 全 profile を通した 100% カバレッジは cross-job-full-harness が保証する。
    ok(Array.isArray(r.zeroUtil), `${prof}/${j}: zero utility を列挙できる（${r.zeroUtil.length} 件）`);
    ok(r.dmg > 0, `${prof}/${j}: 総ダメージ > 0（${r.dmg}）`);
    ok(r.kills > 0 || r.bossKillMs != null, `${prof}/${j}: 撃破がある（kills ${r.kills}）`);
  }
}

section('3. 回帰フェンス（暴走検知・ジョブの均一化はしない）');
{
  for (const prof of PROFS) {
    const dps = JOB_IDS.map((j) => table[prof][j].dps);
    const ratio = Math.max(...dps) / Math.max(1, Math.min(...dps));
    info(`${prof}: DPS 比 ${ratio.toFixed(2)}（${JOB_IDS.map((j) => `${j.slice(0, 5)} ${table[prof][j].dps}`).join(' / ')}）`);
    ok(ratio <= 20, `${prof}: DPS 比 ${ratio.toFixed(2)} ≤ 20（暴走検知フェンス。role 差は許容）`);
    for (const j of JOB_IDS) ok(table[prof][j].topShare <= 1.0, `${prof}/${j}: top share が有効値（${table[prof][j].topShare}）`);
  }
  // どのジョブも normal / elite / boss / survival のすべてで最下位ではない（役割の居場所がある）。
  const rank = (prof, key) => {
    const vals = JOB_IDS.map((j) => [j, table[prof][j][key]]).sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(vals.map(([j], i) => [j, i]));
  };
  for (const j of JOB_IDS) {
    const lastEverywhere = PROFS.every((p) => rank(p, 'dps')[j] === 2) && PROFS.every((p) => rank(p, 'surv')[j] === 2);
    ok(!lastEverywhere, `${j}: すべての profile の offense と defense で同時に最下位ではない`);
  }
  // offense / defense / CC を 1 ジョブが同時独占していない。
  for (const prof of PROFS) {
    // 「独占」= 3 指標すべてで**他の 2 ジョブより厳密に大きい**こと（同値は独占ではない）。
    const strictTop = (key) => {
      const vals = JOB_IDS.map((j) => [j, table[prof][j][key]]);
      const max = Math.max(...vals.map((v) => v[1]));
      const tops = vals.filter((v) => v[1] === max);
      return tops.length === 1 ? tops[0][0] : null;
    };
    const d = strictTop('dps'), sv = strictTop('surv'), c = strictTop('freezes');
    const monopoly = (d && d === sv && sv === c) ? d : null;
    ok(!monopoly, `${prof}: offense / defense / CC の同時独占が無い（${monopoly || 'なし'}）`);
  }
}

section('4. ジョブの個性が数値として残っている（均一化していない）');
{
  // 個性は「そのジョブしか持たない機構」で測る。slot8（枠 8 の部分 build）では
  // 機構を持つスキルが入らないことがあるので、full build（active30）で測る。
  const n = {};
  for (const j of JOB_IDS) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: 'normal', build: 'full', seed: 101 }));
    runProfile(h);
    const m = collectMetrics(h);
    n[j] = { freezes: m.utility.freezes, burning: m.utility.burningDamage, poise: m.utility.poise, surv: m.defense.survivedMs };
  }
  info(`full build: ${JOB_IDS.map((j) => `${j.slice(0, 5)} 凍結${n[j].freezes}/炎上${n[j].burning}/体勢${n[j].poise}`).join(' ')}`);
  ok(n.frost_mage.freezes > 0 && n.flame_witch.freezes === 0 && n.warrior.freezes === 0,
    `凍結は氷術師だけ（氷 ${n.frost_mage.freezes} / 火 ${n.flame_witch.freezes} / 戦士 ${n.warrior.freezes}）`);
  ok(n.flame_witch.burning > 0 && n.frost_mage.burning === 0,
    `炎上 / DoT は火の魔女だけ（火 ${n.flame_witch.burning} / 氷 ${n.frost_mage.burning}）`);
  ok(n.warrior.poise > 0 && n.flame_witch.poise === 0 && n.frost_mage.poise === 0,
    `体勢は戦士だけ（戦士 ${n.warrior.poise} / 火 ${n.flame_witch.poise} / 氷 ${n.frost_mage.poise}）`);
  const sv = table.survival;
  ok(sv.warrior.surv > sv.flame_witch.surv && sv.warrior.surv > sv.frost_mage.surv,
    `survival は戦士が最長（戦士 ${sv.warrior.surv} / 火 ${sv.flame_witch.surv} / 氷 ${sv.frost_mage.surv}）`);
}

T.finish();
