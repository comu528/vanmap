// M9-A.1 9/15: 完全ハーネスでの品質不変性（§9）。Node.js 標準機能のみ。
// M9-A は「弾が当たらない」ハーネスでの一致だった。M9-A.1 は
// **projectile / DoT / field / secondary / reactive / death event / XP / boss まで解決した状態**で
// 4 品質の gameplay trace が byte-identical であることを確認する。
// M9-A の cap 分類を巻き戻すとこのスイートは必ず落ちる。
// 実行: node tests/cross-job-quality-full-invariance.mjs（HEAVY=1 で profile / build を増やす）
import { JOB_IDS, QUALITIES, PROFILES, makeBattle, runProfile, instrument, stepFrame, applyStimulus, gameplayTrace, sha, HEAVY, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('品質不変性（完全ハーネス・M9-A.1）');
const { ok, section, info } = T;
const PROFS = HEAVY ? ['normal', 'elite', 'boss', 'survival', 'stimulus'] : ['elite', 'boss', 'stimulus'];
const BUILDS = HEAVY ? ['slot8', 'full', 'evolved'] : ['slot8', 'full'];

const runOne = async (jobId, profile, build, quality, seed) => {
  resetPhysics();
  const h = instrument(await makeBattle({ jobId, profile, build, quality, seed }));
  if (profile === 'stimulus') {
    while (h.scene._elapsedMs < PROFILES.stimulus.durationMs) { applyStimulus(h, h.scene._elapsedMs); stepFrame(h); if (h.scene.gameOver) break; }
  } else runProfile(h);
  return h;
};

section('1. 4 品質の gameplay trace が byte-identical');
for (const prof of PROFS) {
  for (const build of BUILDS) {
    for (const j of JOB_IDS) {
      const traces = {}; const vis = {};
      for (const q of QUALITIES) {
        const h = await runOne(j, prof, build, q, 4242);
        traces[q] = gameplayTrace(h);
        vis[q] = h.counters.visualTotal;
      }
      const hashes = Object.fromEntries(QUALITIES.map((q) => [q, sha(traces[q])]));
      const same = new Set(Object.values(hashes)).size === 1;
      ok(same, `${prof}/${build}/${j}: 4 品質の gameplay trace 一致`);
      if (!same) {
        for (const k of Object.keys(traces.high)) {
          if (JSON.stringify(traces.low[k]) !== JSON.stringify(traces.high[k])) info(`  差分キー: ${k}`);
        }
      }
      // 必須一致項目（§9）を個別にも確認する。
      const t = traces.low, u = traces.ultra;
      ok(JSON.stringify(t.skills) === JSON.stringify(u.skills), `${prof}/${build}/${j}: per-skill damage / cast / hit / kill 一致`);
      ok(t.level === u.level && t.xp === u.xp, `${prof}/${build}/${j}: XP / level 一致`);
      ok(t.hp === u.hp && t.dead === u.dead, `${prof}/${build}/${j}: HP / 死亡 一致`);
      ok(t.bossHp === u.bossHp && t.elapsedMs === u.elapsedMs, `${prof}/${build}/${j}: boss HP / 経過（kill time）一致`);
      ok(JSON.stringify(t.statusCounters) === JSON.stringify(u.statusCounters), `${prof}/${build}/${j}: status 一致`);
      ok(t.statusRngCursor === u.statusRngCursor, `${prof}/${build}/${j}: status RNG cursor 一致`);
      ok(JSON.stringify(t.warrior) === JSON.stringify(u.warrior), `${prof}/${build}/${j}: 資源（闘気 / コンボ）一致`);
      ok(JSON.stringify(t.runtime) === JSON.stringify(u.runtime), `${prof}/${build}/${j}: runtime state 一致`);
      ok(JSON.stringify(t.pools) === JSON.stringify(u.pools), `${prof}/${build}/${j}: gameplay projectile / enemy pool 数 一致`);
      ok(t.deathEvents === u.deathEvents, `${prof}/${build}/${j}: death event 数 一致`);
      ok(JSON.stringify(t.telemetry) === JSON.stringify(u.telemetry), `${prof}/${build}/${j}: telemetry（quality / FPS を除く）一致`);
      // visual だけが品質で変わる（単調非減少）。
      ok(vis.low <= vis.medium && vis.medium <= vis.high && vis.high <= vis.ultra,
        `${prof}/${build}/${j}: visual が品質で単調増加（${QUALITIES.map((q) => vis[q]).join('/')}）`);
      ok(vis.low < vis.ultra, `${prof}/${build}/${j}: low で演出が実際に減っている`);
    }
  }
}

section('2. quality trace（visual）と gameplay trace が分離している');
{
  const h1 = await runOne('flame_witch', 'elite', 'full', 'low', 5151);
  const h2 = await runOne('flame_witch', 'elite', 'full', 'ultra', 5151);
  ok(sha(gameplayTrace(h1)) === sha(gameplayTrace(h2)), 'gameplay trace は同一');
  ok(h1.counters.visualTotal !== h2.counters.visualTotal, `visual は異なる（${h1.counters.visualTotal} vs ${h2.counters.visualTotal}）`);
  info(`gameplay hash ${sha(gameplayTrace(h1)).slice(0, 16)}… / visual low ${h1.counters.visualTotal} ultra ${h2.counters.visualTotal}`);
}

T.finish();
