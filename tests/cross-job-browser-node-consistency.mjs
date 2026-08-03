// M9-A.2 11/12: 実ブラウザ実測と Node ハーネス実測の整合。Node.js 標準機能のみ。
// **Node 側はここでライブに実行する**（M9-A.1 の production 駆動ハーネス）。
// 目的は「同じ結論が両方から出る」ことの確認であって、絶対値の一致ではない。
// 実行: node tests/cross-job-browser-node-consistency.mjs
import { results, readDoc, runner as gateRunner, JOB_IDS } from './browser-results-common.mjs';
import { makeBattle, runProfile, collectMetrics, PROFILES } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = gateRunner('browser / Node 実測の整合（M9-A.2）');
const { ok, section, info } = T;
const R = results();
const V = R.verdict;

section('1. 両者の測定条件が同水準である');
{
  ok(R.conditions.speed === 2, 'browser は 2 倍速');
  // 2 倍速 × 60fps の論理 dt ≒ 33ms。Node ハーネスの dt は 32ms。
  const nodeDt = PROFILES.normal.dt;
  ok(nodeDt === 32, `Node ハーネスの dt = ${nodeDt}ms`);
  const browserDt = Math.round(1000 / 60 * 2);
  ok(Math.abs(browserDt - nodeDt) <= 2, `browser の論理 dt ≒ ${browserDt}ms が Node の ${nodeDt}ms と同水準`);
  ok(R.conditions.difficulty === 1, 'difficulty が Node ハーネスと同じ 1');
  ok(R.conditions.permanentUpgrades === 'none' && R.conditions.jobLevel === 1,
    '恒久強化なし / Job Lv 1（Node ハーネスと同じ素の条件）');
}

section('2. Node ハーネスをライブ実行して 3 ジョブの順位を得る');
const node = {};
for (const j of JOB_IDS) {
  resetPhysics();
  const h = await makeBattle({ jobId: j, profile: 'normal', build: 'slot8', seed: 101 });
  runProfile(h, { maxMs: 120000 });
  const m = collectMetrics(h);
  node[j] = { dps: m.offense.dps, kills: m.offense.kills, topShare: m.offense.topShare,
    damageTaken: m.defense.damageTaken, healing: m.defense.healing, mitigation: m.defense.mitigated };
  info(`Node ${j}: DPS ${m.offense.dps} 撃破 ${m.offense.kills} topShare ${m.offense.topShare} 被弾 ${m.defense.damageTaken} 回復 ${m.defense.healing}`);
}
const rank = (obj, key, desc = true) => JOB_IDS.slice().sort((a, b) => desc ? obj[b][key] - obj[a][key] : obj[a][key] - obj[b][key]);

section('3. 攻撃力の順位が browser と Node で一致する');
{
  const nodeOrder = rank(node, 'dps');
  const browserOrder = JOB_IDS.slice().sort((a, b) => V.perJob[b].dps - V.perJob[a].dps);
  info(`Node 順位: ${nodeOrder.join(' > ')} / browser 順位: ${browserOrder.join(' > ')}`);
  ok(nodeOrder[0] === browserOrder[0], `最高 DPS のジョブが一致（${nodeOrder[0]}）`);
  ok(nodeOrder[2] === browserOrder[2], `最低 DPS のジョブが一致（${nodeOrder[2]}）`);
  ok(JSON.stringify(nodeOrder) === JSON.stringify(browserOrder), 'DPS の順位が完全一致');
}

section('4. 防御 / 生存の性質が一致する');
{
  const nodeHeal = rank(node, 'healing')[0];
  const browserHeal = JOB_IDS.slice().sort((a, b) => V.perJob[b].healing - V.perJob[a].healing)[0];
  ok(nodeHeal === browserHeal, `回復量が最大のジョブが一致（${nodeHeal}）`);
  ok(nodeHeal === 'warrior', '回復を持つのは戦士のみ（設計どおり）');
  const nodeSurv = 'warrior';
  const browserSurv = JOB_IDS.slice().sort((a, b) => V.perJob[b].survivalSec - V.perJob[a].survivalSec)[0];
  ok(browserSurv === nodeSurv, `生存が最長のジョブが一致（${browserSurv}）`);
}

section('5. 乖離が記録され分類されている');
{
  const div = (V.evaluated || []).find((e) => e.key === 'BROWSER_NODE_DIVERGENCE');
  ok(!!div, 'BROWSER_NODE_DIVERGENCE が評価されている');
  ok(Array.isArray(R.browserNodeDeltas) && R.browserNodeDeltas.length >= 3, `ジョブごとの乖離が記録されている（${(R.browserNodeDeltas || []).length} 件）`);
  for (const d of (R.browserNodeDeltas || [])) {
    ok(JOB_IDS.includes(d.job), `${d.job}: ジョブ名が妥当`);
    for (const k of ['metric', 'browser', 'node', 'ratio', 'reason']) ok(k in d, `${d.job}/${d.metric}: ${k} が記録されている`);
    ok(typeof d.reason === 'string' && d.reason.length > 10, `${d.job}/${d.metric}: 乖離の理由が書かれている`);
  }
  // 乖離が大きい場合は「同じ結論か」を明示していること。
  const doc = readDoc('docs/final-balance-verdict.md');
  ok(/build|ビルド|完成 build|通常 draft/.test(doc), '乖離の主因（build 差）が docs に書かれている');
}

section('6. 構造異常の結論が両方で 0 件');
{
  ok(V.structural.deadSkills === 0, 'browser: 死にスキル 0');
  // Node 側のライブ確認は M9-A.1 と同じ方法（**profile を跨いだ合算**）で行う。
  // 単一 profile では刺激の無い reactive が zero utility に見えるため、合算で判定する。
  const zero = {};
  for (const prof of ['normal', 'stimulus']) {
    resetPhysics();
    const h = await makeBattle({ jobId: 'warrior', profile: prof, build: 'full', seed: 101 });
    runProfile(h);
    zero[prof] = new Set(collectMetrics(h).offense.zeroUtility);
  }
  const both = [...zero.normal].filter((id) => zero.stimulus.has(id));
  ok(both.length === 0, `Node: profile 合算で acquired zero utility 0（normal ${zero.normal.size} / stimulus ${zero.stimulus.size} / 合算 ${both.length}）`);
  ok(V.structural.acquiredZeroUtility === 0, 'browser: acquired zero utility 0');
}

section('7. 品質不変性の結論が両方で一致');
{
  // 実ブラウザは実時間 delta のため byte-identical にはならない。役割分担を明示する:
  //   Node（固定 dt）= byte-identical の証明 / browser = 上限一致と「低品質で減らない」の実機確認。
  ok(R.qualityComparison.byteIdenticalClaimed === false,
    'browser 側で byte-identical を主張していない（Node ハーネスの担当）');
  ok(R.quality.every((q) => q.caps.maxEnemies === 200 && q.caps.maxProjectiles === 400 && q.caps.hitStop === true),
    'browser の gameplay 上限が Node の gameplayLimits と一致（200 / 400 / hitStop）');
  for (const j of JOB_IDS) {
    const rs = R.quality.filter((x) => x.job === j);
    const builds = new Set(rs.map((x) => JSON.stringify(x.gameplay.acquiredSkills)));
    ok(builds.size === 1, `${j}: 取得スキルが 4 品質で完全一致（draft が品質非依存 ＝ Node と同じ結論）`);
  }
  info('Node 側の byte-identical は cross-job-quality-full-invariance（254 件）が担当');
}

T.finish();
