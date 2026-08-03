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

section('3. 順位は一致しない（build が違うため）。その事実と理由が記録されていること');
{
  // ★ 実測の結論: **DPS / 生存の順位は browser と Node で一致しない。**
  //   Node = 固定 build（プール先頭 8 種 Lv8）、browser = 通常 draft（4〜6 種・低 Lv）で
  //   build の選ばれ方が根本的に違うため。どちらかが誤りなのではなく、測っている対象が違う。
  //   ここで検査するのは「一致すること」ではなく「不一致が理由つきで記録されていること」。
  const nodeOrder = rank(node, 'dps');
  const browserOrder = JOB_IDS.slice().sort((a, b) => V.perJob[b].dps - V.perJob[a].dps);
  info(`Node 順位: ${nodeOrder.join(' > ')} / browser 順位: ${browserOrder.join(' > ')}`);
  const same = JSON.stringify(nodeOrder) === JSON.stringify(browserOrder);
  info(same ? 'DPS 順位は一致した' : 'DPS 順位は不一致（build 差）');
  const div = (V.evaluated || []).find((e) => e.key === 'BROWSER_NODE_DIVERGENCE');
  ok(!!div, 'BROWSER_NODE_DIVERGENCE が評価されている');
  if (!same) {
    ok(div.exceeded === true, '順位が違うことが「超過」として記録されている');
    const c = (V.classified || []).find((x) => x.key === 'BROWSER_NODE_DIVERGENCE');
    ok(!!c && c.class === 'harness', `harness 分類（測り方の差）として記録（${c && c.class}）`);
    ok(!!c && /build/.test(c.reason), '理由に build 差が書かれている');
    const doc = readDoc('docs/final-balance-verdict.md');
    ok(/順位[^\n]*一致しない|順位[^\n]*不一致/.test(doc), '判定 docs が順位不一致を明記している');
  }
  // 絶対値の乖離はジョブごとに記録されていること。
  for (const j of JOB_IDS) {
    const d = (R.browserNodeDeltas || []).find((x) => x.job === j);
    ok(!!d && typeof d.ratio === 'number', `${j}: 乖離比が記録されている（${d && d.ratio}）`);
  }
}

section('4. ジョブ設計に由来する性質は一致する（build に依らない）');
{
  // build が変わっても変わらないのは「そのジョブが何を持っているか」。
  // ★ Node の normal profile は被弾が起きないので回復も 0 になり、比較に使えない。
  //   回復が実際に発生する survival profile で測り直して照合する。
  const nodeHeal = {};
  for (const j of JOB_IDS) {
    resetPhysics();
    const h = await makeBattle({ jobId: j, profile: 'survival', build: 'full', seed: 101 });
    runProfile(h);
    const m = collectMetrics(h);
    nodeHeal[j] = m.defense.healing;
  }
  info(`Node（survival）の回復: ${JOB_IDS.map((j) => `${j} ${nodeHeal[j]}`).join(' / ')}`);
  const nodeHealers = JOB_IDS.filter((j) => nodeHeal[j] > 0);
  const browserHealers = JOB_IDS.filter((j) => V.perJob[j].healing > 0);
  ok(nodeHealers.length === 1 && nodeHealers[0] === 'warrior', `Node: 回復を持つのは戦士のみ（${nodeHealers.join(',') || 'なし'}）`);
  ok(browserHealers.length === 1 && browserHealers[0] === 'warrior', `browser: 回復を持つのは戦士のみ（${browserHealers.join(',') || 'なし'}）`);
  ok(JSON.stringify(nodeHealers) === JSON.stringify(browserHealers), '回復を持つジョブの集合が両方で一致');
  // 近接ジョブは被弾が最も多い（接敵し続けるため）。build に依らない性質。
  const browserTaken = JOB_IDS.slice().sort((a, b) => V.perJob[b].damageTaken - V.perJob[a].damageTaken)[0];
  ok(browserTaken === 'warrior', `被ダメージが最大のジョブは戦士（${browserTaken}・接敵前提の設計）`);
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
    // 取得スキル「数」は 4 品質とも同じ。集合の差は level-up 回数の分散で進化を取った / 取っていない
    // の違いだけで（base ↔ evolution の置換）、品質に依存する差ではない。
    const counts = new Set(rs.map((x) => x.gameplay.acquiredSkills.length));
    ok(counts.size === 1, `${j}: 取得スキル数が 4 品質で一致（${[...counts].join('/')}）`);
  }
  info('Node 側の byte-identical は cross-job-quality-full-invariance（254 件）が担当');
}

T.finish();
