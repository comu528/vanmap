// M9-A 横断監査 9/25: 3 ジョブ横断バランス比較。Node.js 標準機能のみ。
// 共通 battle profile（同じ敵配置 24+4elite+boss / 同じ steps / 同じ dt / active30 Lv8 /
// 同じ quality 非依存 gameplay cap）で 3 ジョブを回し、構造的異常（死にスキル / 一極集中 /
// utility 0）を検査する。**ジョブを同じ数値へ揃えることはしない。**
//
// 注意（docs/cross-job-balance.md に記録）:
//   ヘッドレスハーネスは弾の命中解決（fire/frost の projectile）や接敵移動（warrior）を再現しないため、
//   ジョブ間の絶対 DPS 比較はバランス判定に使えない。比率は回帰検知の広いフェンスとしてだけ使う。
// 実行: node tests/cross-job-balance-comparison.mjs
import { JOB_IDS, HEAVY, poolsOf, runJob, runner } from './cross-job-common.mjs';

const T = runner('3 ジョブ横断バランス比較（M9-A）');
const { ok, section, info } = T;
const STEPS = HEAVY ? 3600 : 1200;

// ハーネスでは発動刺激が来ない reactive / 変身系（各 job の専用スイートが実駆動で検証済み）。
const REACTIVE = {
  flame_witch: new Set(['phoenix_feather', 'flame_barrier', 'ash_doppelganger', 'bullet_furnace', 'blazing_step']),
  frost_mage: new Set(['mirror_ice']),
  warrior: new Set([]),
};
// ダメージ 0 が設計である utility スキル（M8-F / M7-E / M8-A で記録済み）。
const UTILITY = {
  flame_witch: new Set(['burning_trail', 'detonation_mark']), // 炎上マーカー / 起爆印（ダメージは起爆側に計上）
  frost_mage: new Set(['winter_halo']),                        // 迎撃 / 減速の防御スキル
  warrior: new Set(['weapon_deflection']),                     // 弾き返し（反射弾側に計上）
};

const results = {};
for (const jobId of JOB_IDS) {
  section(`${jobId}: 共通 profile（敵 24+4elite+boss・${STEPS} step × 32ms・active30 Lv8）`);
  const ids = poolsOf(jobId).active;
  const r = await runJob(jobId, { quality: 'high', ids, steps: STEPS });
  // ダメージ集計: warrior は stats.damage（combat モックが記録）、fire / frost は呼び出し列の dmg / area。
  let dmgSum = 0; const perSkill = {}; const mentioned = new Set(); let proj = 0;
  for (const c of r.scene.calls) {
    if (!Array.isArray(c)) continue;
    for (const v of c) {
      if (typeof v === 'string') mentioned.add(v);
      if (v && typeof v === 'object') { const id = v.skillId || v.sourceSkillId; if (id) mentioned.add(id); }
    }
    if (c[0] === 'dmg') { dmgSum += c[2] || 0; if (typeof c[3] === 'string') perSkill[c[3]] = (perSkill[c[3]] || 0) + (c[2] || 0); }
    else if (c[0] === 'area') { dmgSum += c[4] || 0; if (typeof c[5] === 'string') perSkill[c[5]] = (perSkill[c[5]] || 0) + (c[4] || 0); }
    else if (c[0] === 'proj') proj++;
  }
  const statDamage = Object.values(r.trace.stats).reduce((a, s) => a + (s.damage || 0), 0);
  if (jobId === 'warrior') { for (const [id, s] of Object.entries(r.trace.stats)) perSkill[id] = s.damage || 0; dmgSum = statDamage; }
  results[jobId] = { dmgSum, proj, stats: r.trace.stats, perSkill };

  // 1) 全 active が発動する（reactive の既知集合を除く）。
  for (const id of ids) {
    if (REACTIVE[jobId].has(id)) { ok(true, `${id}: reactive（専用スイートで実駆動済み・ここでは対象外）`); continue; }
    ok(r.trace.stats[id].casts > 0, `${id}: cast > 0（${r.trace.stats[id].casts}）`);
  }
  // 2) acquired but zero utility = 0: 全 active が「ダメージ or 何らかの gameplay イベント」を出す。
  for (const id of ids) {
    if (REACTIVE[jobId].has(id)) continue;
    const active = (perSkill[id] || 0) > 0 || (r.trace.stats[id].damage || 0) > 0 || mentioned.has(id) || Object.keys(r.trace.stats[id].extra || {}).length > 0;
    ok(active || UTILITY[jobId].has(id), `${id}: gameplay 上の効果がある（utility 0 でない）`);
  }
  // 3) top skill share（一極集中なし）。
  // warrior はモックが全ダメージを解決するので実シェア（≤35%）。
  // fire / frost は弾のダメージが未解決で分母が縮む＝シェアが**見かけ上**膨らむため、
  // ここでは 50% の回帰フェンスに留める（実シェアの 35% しきい値は各 completion スイートが保持）。
  const total = Object.values(perSkill).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(perSkill).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
  const shareCap = jobId === 'warrior' ? 0.35 : 0.5;
  ok(top[1] / total <= shareCap, `top skill share ${(top[1] / total * 100).toFixed(1)}% ≤ ${shareCap * 100}%（${top[0]}）`);
  info(`ダメージイベント総量 ${Math.round(dmgSum)} / projectile 生成 ${proj} / top ${top[0]} ${(top[1] / total * 100).toFixed(1)}%`);
}

section('ジョブ間の比率（回帰フェンス・絶対比較には使わない）');
{
  const f = results.flame_witch.dmgSum, s = results.frost_mage.dmgSum;
  const ratio = Math.max(f, s) / Math.max(1, Math.min(f, s));
  info(`即時ダメージイベント量: 火 ${Math.round(f)} / 氷 ${Math.round(s)}（比 ${ratio.toFixed(2)}）`);
  info('documented note: 比 > 1.8 はハーネス由来（火はダメージの多くが未解決の弾 2000 発超に載る）。');
  info('documented note: 戦士のダメージは近接モック経由の別尺度で、火 / 氷と直接比較しない（M8-B からの既知の制約）。');
  ok(ratio <= 4.0, `火 / 氷の即時ダメージ比 ${ratio.toFixed(2)} ≤ 4.0（暴走回帰の検知フェンス）`);
  ok(results.flame_witch.proj > 0 && results.frost_mage.proj > 0, '火 / 氷とも弾を生成している');
}

T.finish();
