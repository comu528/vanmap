// M9-A.2 8/12: stress profile（実ブラウザ）。Node.js 標準機能のみ。
// 敵 100 体 / 弾多数 / boss + elite / 2 倍速 / 10 分相当を low・high で回した記録を検証する。
// 実行: node tests/browser-stress-plan.mjs
import { results, readDoc, runner, JOB_IDS } from './browser-results-common.mjs';

const T = runner('stress profile（実ブラウザ・M9-A.2）');
const { ok, section, info } = T;
const R = results();

section('1. 3 ジョブ × low / high で実施している');
for (const j of JOB_IDS) {
  const rs = R.stress.filter((x) => x.job === j);
  ok(rs.length >= 2, `${j}: ${rs.length} run`);
  const qs = new Set(rs.map((x) => x.quality));
  ok(qs.has('low') && qs.has('high'), `${j}: low / high 両方（${[...qs].join(',')}）`);
}

section('2. 負荷条件を満たしている（敵 100 体・弾多数・boss・2 倍速・10 分相当）');
for (const r of R.stress) {
  const tag = `${r.job}/${r.quality}`;
  ok(r.peakEnemies >= 100, `${tag}: 敵ピーク ${r.peakEnemies} ≥ 100`);
  // ★ 戦士は近接ジョブで自弾をほぼ撃たない（反射弾のみ）。弾の負荷は敵弾側で掛かる。
  //   ジョブの設計差を「不足」と誤判定しないよう、**自弾 + 敵弾の合計**で負荷を見る。
  const projLoad = r.peakProjectiles + r.peakBossBullets;
  ok(projLoad >= 50, `${tag}: 弾ピーク（自弾 ${r.peakProjectiles} + 敵弾 ${r.peakBossBullets}）= ${projLoad} ≥ 50`);
  if (r.job === 'warrior') ok(r.peakProjectiles <= 20, `${tag}: 戦士の自弾はほぼ 0（${r.peakProjectiles}・反射弾のみ＝設計どおり）`);
  else ok(r.peakProjectiles >= 20, `${tag}: 弾を撃つジョブの自弾ピーク ${r.peakProjectiles} ≥ 20`);
  ok(r.bossActive === true, `${tag}: ボスが出現している`);
  ok(r.eliteSeen === true, `${tag}: エリートが混在している`);
  ok(r.speed === 2, `${tag}: 2 倍速`);
  ok(r.gameSecReached >= 540, `${tag}: ${r.gameSecReached} ゲーム秒 ≥ 540（10 分相当の 90%）`);
  ok(r.activeSkills >= 25, `${tag}: active ${r.activeSkills} 種（完成 build 相当）`);
  ok(r.evolutions >= 2, `${tag}: 進化 ${r.evolutions} 件`);
}

section('3. 最低合格条件（crash / error / freeze / 停止 / 残留）');
for (const r of R.stress) {
  const tag = `${r.job}/${r.quality}`;
  ok(r.errors === 0, `${tag}: JS エラー 0`);
  ok(r.crashed === false, `${tag}: crash なし`);
  ok(r.fps.freezes500ms === 0, `${tag}: 500ms 超のフリーズ 0`);
  ok(r.fps.maxFrameMs < 10000, `${tag}: 最大フレーム時間 ${r.fps.maxFrameMs}ms < 10 秒`);
  ok(r.gameplayProgressed === true, `${tag}: gameplay が停止しない（撃破・ダメージが増え続ける）`);
  ok(r.inputResponsive === true, `${tag}: 入力が効く`);
}

section('4. 上限を超えない（PoolManager / SpatialGrid / 状態索引）');
for (const r of R.stress) {
  const tag = `${r.job}/${r.quality}`;
  ok(r.peakEnemies <= 200, `${tag}: 敵 ${r.peakEnemies} ≤ gameplayLimits 200`);
  ok(r.peakProjectiles <= 400, `${tag}: 弾 ${r.peakProjectiles} ≤ gameplayLimits 400`);
  ok(r.pool.enemyTotal <= 200 && r.pool.projTotal <= 400, `${tag}: プール実体が上限内（敵 ${r.pool.enemyTotal} / 弾 ${r.pool.projTotal}）`);
  ok(r.gridRegistered === r.finalEnemies, `${tag}: SpatialGrid 登録 ${r.gridRegistered} = 敵 ${r.finalEnemies}`);
  ok(typeof r.statusIndex === 'number', `${tag}: 状態索引 ${r.statusIndex} を記録`);
}

section('5. heap が単調増加しない（GC が効いている）');
for (const r of R.stress) {
  const tag = `${r.job}/${r.quality}`;
  // ★ start / end の 1 サンプル比較は GC のタイミング次第で大きく振れるので使わない。
  //   見るのは「単調増加でない」「上限内に収まる」「前半と後半の中央値が跳ね上がらない」。
  ok(typeof r.heap.max === 'number' && r.heap.max > 0, `${tag}: heap ピーク ${r.heap.max}MB / 谷 ${r.heap.min}MB`);
  ok(r.heap.monotonic === false, `${tag}: heap が単調増加していない`);
  ok(r.heap.max <= 400, `${tag}: heap ピークが 400MB 以内（${r.heap.max}MB）`);
  ok(r.heap.secondHalfMedian <= r.heap.firstHalfMedian * 2 + 20,
    `${tag}: 後半の heap 中央値が前半の 2 倍以内（${r.heap.firstHalfMedian} → ${r.heap.secondHalfMedian}MB）`);
}

section('6. cleanup 残留 0');
for (const r of R.stress) {
  const tag = `${r.job}/${r.quality}`;
  ok(r.cleanup.skills === 0, `${tag}: cleanup 後の skill 残留 0`);
  ok(r.cleanup.grid === 0, `${tag}: cleanup 後のグリッド残留 0`);
  ok(r.cleanup.deathEvents === 0, `${tag}: cleanup 後の死亡履歴 0`);
  ok(r.cleanup.statusIndex === 0, `${tag}: cleanup 後の状態索引 0`);
  ok(r.cleanup.rfsBattleCleared === true, `${tag}: window.RFS_BATTLE の解除`);
}

section('7. low と high で gameplay が一致し、low で visual が減る');
for (const j of JOB_IDS) {
  const lo = R.stress.find((x) => x.job === j && x.quality === 'low');
  const hi = R.stress.find((x) => x.job === j && x.quality === 'high');
  if (!lo || !hi) { ok(false, `${j}: low / high の両方が無い`); continue; }
  // 実ブラウザは実時間 delta なので byte-identical にはならない（Node ハーネスの担当）。
  // 負荷時に見るのは「上限が同じ」「low で gameplay が削られない」こと。
  ok(lo.caps.maxEnemies === hi.caps.maxEnemies && lo.caps.maxProjectiles === hi.caps.maxProjectiles && lo.caps.hitStop === hi.caps.hitStop,
    `${j}: 負荷時も gameplay 上限が同一（敵 ${lo.caps.maxEnemies} / 弾 ${lo.caps.maxProjectiles} / hitStop ${lo.caps.hitStop}）`);
  ok(lo.maxDisplayObjects <= hi.maxDisplayObjects, `${j}: 表示オブジェクト low ${lo.maxDisplayObjects} ≤ high ${hi.maxDisplayObjects}`);
  ok(lo.peakProjectiles + lo.peakBossBullets >= (hi.peakProjectiles + hi.peakBossBullets) * 0.8,
    `${j}: gameplay 弾数が low で削られない（low ${lo.peakProjectiles}+${lo.peakBossBullets} / high ${hi.peakProjectiles}+${hi.peakBossBullets}）`);
  ok(lo.peakEnemies >= hi.peakEnemies * 0.8, `${j}: 敵数が low で削られない（low ${lo.peakEnemies} / high ${hi.peakEnemies}）`);
}

section('8. FPS の warning を分類している');
{
  const low30 = R.stress.filter((r) => r.fps.avg < 30);
  info(`平均 FPS: ${R.stress.map((r) => `${r.job}/${r.quality} ${r.fps.avg}`).join(' / ')}`);
  if (low30.length) {
    const doc = readDoc('docs/final-balance-verdict.md') + readDoc('docs/browser-longrun-results.md');
    ok(/FPS|fps/.test(doc), '平均 30fps 未満が docs に記録されている');
    ok(R.verdict.classified.some((c) => /FPS/i.test(c.key)), 'FPS の warning が verdict に分類されている');
  } else {
    ok(true, `全 run が平均 30fps 以上（最低 ${Math.min(...R.stress.map((r) => r.fps.avg))}）`);
  }
}

T.finish();
