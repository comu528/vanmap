// M9-A.2 7/12: 周回途中の品質切替（実ブラウザ）。Node.js 標準機能のみ。
// low→ultra / ultra→low / medium→high を時刻固定で行い、
// pending gameplay（弾 / DoT / 場）が消えず gameplay が不変で visual だけ変わることを検証する。
// 実行: node tests/browser-quality-midrun-plan.mjs
import { results, runner, JOB_IDS } from './browser-results-common.mjs';

const T = runner('周回途中の品質切替（実ブラウザ・M9-A.2）');
const { ok, section, info } = T;
const R = results();

section('1. 必須の 3 遷移が実施されている');
{
  const all = R.midrun.flatMap((m) => m.transitions.map((t) => `${t.from}->${t.to}`));
  for (const need of ['low->ultra', 'ultra->low', 'medium->high']) {
    ok(all.includes(need), `${need} を実施（実施: ${[...new Set(all)].join(', ')}）`);
  }
  ok(R.midrun.length === 3, `3 ジョブで実施（${R.midrun.length}）`);
  for (const j of JOB_IDS) ok(R.midrun.some((m) => m.job === j), `${j} で実施`);
}

section('2. 切替で pending gameplay が消えない');
for (const m of R.midrun) {
  for (const t of m.transitions) {
    const tag = `${m.job} ${t.from}→${t.to}`;
    // ★ before / after のスナップショットは同一フレームではないので、弾は寿命や命中で自然に数が減る。
    //   見るのは「切替で一掃されない」こと（全消滅・大量消滅がない）であって、厳密一致ではない。
    // 弾は切替の前後で新規発射されることもあるので、**減った方向だけ**を見る。
    const projKept = t.projAfter >= t.projBefore - 3;
    ok(projKept, `${tag}: 飛行中の弾が切替で一掃されない（${t.projBefore} → ${t.projAfter}）`);
    const enemyKept = t.enemiesBefore === 0 ? true : (t.enemiesAfter >= t.enemiesBefore - 3);
    ok(enemyKept, `${tag}: 敵が切替で一掃されない（${t.enemiesBefore} → ${t.enemiesAfter}）`);
    ok(t.pendingTimersKept === true, `${tag}: 遅延 / 場のタイマーが残る`);
    ok(t.statusKept === true, `${tag}: 状態異常（炎上 / 冷気 / 凍結）が残る`);
  }
}

section('3. 切替の瞬間に gameplay が変わらない');
for (const m of R.midrun) {
  for (const t of m.transitions) {
    const tag = `${m.job} ${t.from}→${t.to}`;
    ok(t.unchangedKeys.length >= 5, `${tag}: 切替直後の進行量 / RNG / 資源が不変（${t.unchangedKeys.join(' ')}）`);
    // ★ runtimeHash（cooldown 残量）は 2 つのスナップショットの間に必ず進むので不変にはならない。
    //   切替が壊していないかを見るのは、進行量そのもの（撃破 / ダメージ / Lv）と RNG cursor と資源。
    for (const k of ['kills', 'damage', 'level', 'statusRngCursor', 'resourceHash']) {
      ok(t.unchangedKeys.includes(k), `${tag}: ${k} が不変として確認されている`);
    }
    ok(t.capsAfter.maxEnemies === 200 && t.capsAfter.maxProjectiles === 400 && t.capsAfter.hitStop === true,
      `${tag}: gameplay 上限が不変（敵 ${t.capsAfter.maxEnemies} / 弾 ${t.capsAfter.maxProjectiles} / hitStop ${t.capsAfter.hitStop}）`);
  }
}

section('4. visual だけが変わる');
for (const m of R.midrun) {
  for (const t of m.transitions) {
    const tag = `${m.job} ${t.from}→${t.to}`;
    const up = ['low', 'medium', 'high', 'ultra'].indexOf(t.to) > ['low', 'medium', 'high', 'ultra'].indexOf(t.from);
    // M9-A.2 で修正: 以前は particleBudget が create() の値のまま固定で切替に追従しなかった。
    ok(t.capsAfter.particleBudget !== t.capsBefore.particleBudget,
      `${tag}: particleBudget が切替で変わる（${t.capsBefore.particleBudget} → ${t.capsAfter.particleBudget}）`);
    ok(up ? t.capsAfter.particleBudget > t.capsBefore.particleBudget : t.capsAfter.particleBudget < t.capsBefore.particleBudget,
      `${tag}: particleBudget の増減が品質の向きと一致`);
  }
}

section('5. 切替後も周回が継続し JS エラーが出ない');
for (const m of R.midrun) {
  ok(m.errors === 0, `${m.job}: エラー 0`);
  ok(m.aliveAfterAll === true, `${m.job}: 全切替後もプレイヤーが生存し周回継続`);
  ok(m.killsIncreased === true, `${m.job}: 切替を跨いで撃破数が増え続ける（gameplay 停止なし）`);
  ok(m.finalTimeSec > m.firstSwitchAtSec, `${m.job}: 最初の切替（${m.firstSwitchAtSec}s）以降も進行（${m.finalTimeSec}s）`);
}

T.finish();
