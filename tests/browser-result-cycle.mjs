// M9-A.2 4/12: Result / Base / 再 run のサイクル。Node.js 標準機能のみ。
// 勝敗どちらでも Result → 報酬 → Base → 次 run が成立し、二重加算も残留も無いことを実測記録で検証する。
// 実行: node tests/browser-result-cycle.mjs
import { results, runner, JOB_IDS } from './browser-results-common.mjs';

const T = runner('Result / Base / 再 run（M9-A.2）');
const { ok, section, info } = T;
const R = results();

section('1. 3 ジョブとも Result へ到達している');
for (const j of JOB_IDS) {
  const rs = R.resultCycle.filter((x) => x.job === j);
  ok(rs.length >= 1, `${j}: Result サイクル ${rs.length} 件`);
  ok(rs.every((x) => x.resultReached), `${j}: Result 到達`);
}

section('2. 報酬（残り火 / Job XP / 熟練度）が付与され、二重加算が無い');
for (const c of R.resultCycle) {
  const tag = `${c.job}/${c.win ? 'WIN' : 'LOSE'}`;
  ok(c.awarded === true, `${tag}: 報酬が付与された（awarded）`);
  ok(typeof c.embersGained === 'number' && c.embersGained >= 0, `${tag}: 残り火 +${c.embersGained}`);
  ok(c.embersAfter === c.embersBefore + c.embersGained,
    `${tag}: 残り火の加算が 1 回だけ（${c.embersBefore} + ${c.embersGained} = ${c.embersAfter}）`);
  ok(typeof c.jobXpGain === 'number', `${tag}: Job XP +${c.jobXpGain}`);
  ok(c.jobXpAfter === c.jobXpBefore + c.jobXpGain, `${tag}: Job XP の加算が 1 回だけ`);
  ok(c.doubleAwardCheck === true, `${tag}: 同じ resultId の再処理で二重加算しない`);
  ok(typeof c.resultId === 'string' && c.resultId.length > 0, `${tag}: resultId が記録されている`);
}

section('3. 勝利と敗北の両方が記録されている');
{
  const wins = R.resultCycle.filter((c) => c.win);
  const losses = R.resultCycle.filter((c) => !c.win);
  info(`勝利 ${wins.length} / 敗北 ${losses.length}`);
  ok(losses.length >= 1, `敗北 Result が最低 1 件（${losses.length}）`);
  ok(R.defeatRuns.length >= 1, `敗北 run の詳細記録が最低 1 件（${R.defeatRuns.length}）`);
  for (const d of R.defeatRuns) {
    ok(d.win === false, `${d.job}: 敗北として記録`);
    ok(d.activeRunCleared === true, `${d.job}: active_run が消去される`);
    ok(d.embersGained >= 0, `${d.job}: 敗北でも報酬 ${d.embersGained}（少量）`);
    ok(d.baseReached === true, `${d.job}: Base へ復帰`);
    ok(d.rerunOk === true, `${d.job}: 再 run 可能`);
  }
  // 勝利がある場合は winBonus が乗ること（無い場合は「未到達」として記録されていること）。
  if (wins.length) ok(wins.every((w) => w.embersGained > 0), '勝利 run の報酬 > 0');
  else ok(R.unverified.some((u) => /勝利|victory|ボス撃破/.test(u)), '勝利 Result 未到達が未確認として記録されている');
}

section('4. Base 復帰と次 run で残留が無い');
for (const c of R.resultCycle) {
  const tag = `${c.job}/${c.win ? 'WIN' : 'LOSE'}`;
  ok(c.baseReached === true, `${tag}: Base 復帰`);
  ok(c.rerunOk === true, `${tag}: Base から次 run を開始できる`);
  const res = c.rerunResidue || {};
  for (const [k, v] of Object.entries({ kills: 0, enemies: 0, proj: 0, deathEvents: 0 })) {
    ok(res[k] === v, `${tag}: 次 run に ${k} の残留なし（${res[k]}）`);
  }
  ok(res.boss === false, `${tag}: ボスの残留なし`);
  ok(res.timeSec <= 2, `${tag}: 次 run の経過時間がリセットされている（${res.timeSec}s）`);
  ok(res.skills === 1, `${tag}: 所持スキルが初期 1 種へ戻る（${res.skills}）`);
}

section('5. Result 画面に必要な表示がある（構造）');
for (const c of R.resultCycle) {
  const t = (c.resultTexts || []).join(' ');
  ok((c.resultTexts || []).length > 0, `${c.job}: Result にテキストが描画されている（${(c.resultTexts || []).length} 要素）`);
  ok(/残り火/.test(t), `${c.job}: 残り火の表示`);
  ok(/拠点/.test(t), `${c.job}: 拠点へ戻る導線`);
}

section('6. profile が保護されている（読み取り専用フィールドが壊れない）');
for (const c of R.resultCycle) {
  ok(c.saveVersionAfter === 6, `${c.job}: save_version 6 のまま`);
  ok(c.permanentUpgradesUnchanged === true, `${c.job}: 恒久強化が run で書き換わらない`);
  ok(c.telemetryDoubleCount === false, `${c.job}: telemetry の二重集計なし`);
}

T.finish();
