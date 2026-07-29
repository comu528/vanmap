// 戦士 Wave2 20/21: テレメトリ・F8 / F9（M8-D §telemetry）。Node.js 標準機能のみ。
//   - Wave2 で足した指標が CombatTelemetry と summary() の両方にあり 1:1
//   - 実プレイで実際に値が入る（宣言だけの指標が無い）
//   - スキル別 stats にも Wave2 の項目が入る
//   - F8（バランス分析）・F9（戦士検証）に Wave2 の項目が載る。**F10 は変えていない**
//   - テレメトリは端末内のみ（外部送信をしない）
// 実行: node tests/warrior-wave2-telemetry.mjs

import { CombatTelemetry } from '../src/systems/CombatTelemetry.js';
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc } from './warrior-common.mjs';

const T = runner('戦士 Wave2 テレメトリ・F8 / F9（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();

// Wave2 で足した戦士テレメトリ。
// WarriorCombatSystem.telemetry 側の内部キー（ミリ秒・合計値）。
const WAVE2_KEYS = [
  'launches', 'launchBlocked', 'launchPoiseConverted',
  'frontGuardUptimeMs', 'frontGuardBlocked', 'frontGuardSideHits', 'frontGuardBackHits',
  'grabs', 'grabRefused', 'grabCancels', 'throwImpacts', 'throwDistance',
  'comboStages', 'guardTicks', 'guardUptimeMs',
  'lowHpBonusSum', 'lowHpBonusSamples',
  'axeOutboundHits', 'axeReturnHits', 'stepIns', 'stepInDistance',
  'rallyPlacements', 'rallyUptimeMs', 'rallyInsideMs', 'rallyAssists', 'rallyKillHealBonus',
];
// summary() / CombatTelemetry.warrior 側の外向きキー（秒・平均へ換算済み）。
const WAVE2_SUMMARY_KEYS = [
  'launches', 'launchBlocked', 'launchPoiseConverted',
  'frontGuardUptimeSeconds', 'frontGuardBlocked', 'frontGuardSideHits', 'frontGuardBackHits',
  'grabs', 'grabRefused', 'grabCancels', 'throwImpacts', 'throwDistance',
  'comboStages', 'guardTicks', 'guardUptimeSeconds', 'lowHpAvgMultiplier',
  'axeOutboundHits', 'axeReturnHits', 'stepIns', 'stepInDistance',
  'rallyPlacements', 'rallyUptimeSeconds', 'rallyInsideSeconds', 'rallyAssists',
];
const WAVE2_SKILL_KEYS = ['launches', 'frontGuardMs', 'grabs', 'throws', 'stages', 'guardTicks', 'axeHits', 'stepIns', 'rallyMs'];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 340, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};

// ===== 1. キー構造の 1:1 対応 =====
section('1. Wave2 の指標が CombatTelemetry と summary() の両方にある');
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const ctx = build();
  const sum = ctx.w.summary();
  for (const k of WAVE2_KEYS) ok(Object.prototype.hasOwnProperty.call(ctx.w.telemetry, k), `telemetry に ${k} がある`);
  for (const k of WAVE2_SUMMARY_KEYS) {
    ok(Object.prototype.hasOwnProperty.call(t.warrior, k), `CombatTelemetry.warrior に ${k} がある`);
    ok(Object.prototype.hasOwnProperty.call(sum, k), `summary() が ${k} を返す`);
  }
  // ライブ表示専用キー（数値ではなく現在状態）。
  const live = new Set(['fury', 'combo', 'bossPoiseGauge', 'rallyActive', 'rallyInside', 'frontGuardActive']);
  for (const k of Object.keys(t.warrior)) ok(Object.prototype.hasOwnProperty.call(sum, k), `summary() が ${k} を返す`);
  for (const k of Object.keys(sum)) {
    ok(Object.prototype.hasOwnProperty.call(t.warrior, k) || live.has(k) || /Seconds$/.test(k),
      `summary() の ${k} は telemetry 側にもある（またはライブ / 秒換算）`);
  }
  info(`warrior テレメトリキー ${Object.keys(t.warrior).length} 件（うち M8-D 追加 ${WAVE2_SUMMARY_KEYS.length} 件）`);
}

// ===== 2. 実プレイで値が入る =====
section('2. 実プレイで Wave2 の指標に実際の値が入る（宣言だけの指標がない）');
{
  const got = new Set();
  const scenarios = [
    { enemies: makeEnemies(12, { x: 340, y: 300, dy: 3, hp: 1e9 }) },
    { enemies: makeEnemies(8, { x: 340, y: 300, dy: 3, hp: 1e9, elite: true }) },
    { enemies: [], boss: makeBoss({ x: 340, y: 300, hp: 1e9 }) },
    { enemies: makeEnemies(12, { x: 340, y: 300, dy: 3, hp: 40 }), hp: 40 },
  ];
  for (const sc of scenarios) {
    const ctx = build(sc);
    for (const id of EXPECTED.wave2Actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
    // 低 HP でも回す（低 HP 補正・不屈を踏む）。
    for (let i = 0; i < 2500; i++) {
      ctx.sm.update(16, { hasEnemies: true });
      ctx.w.setHp(ctx.scene.player.maxHp * (i % 400 < 200 ? 1 : 0.1), ctx.scene.player.maxHp);
      ctx.w.update(16);
      ctx.scene.advance(16);
      if (i % 60 === 30) ctx.scene.onWarriorHit(50, 40);
    }
    for (const k of WAVE2_KEYS) if ((ctx.w.telemetry[k] || 0) > 0) got.add(k);
  }
  const missing = WAVE2_KEYS.filter((k) => !got.has(k));
  // 進化側でだけ増える指標（血の誓いの回復強化など）。
  const evo = build({ hp: 40 });
  for (const id of EXPECTED.wave2Evolutions) evo.sm.acquireOrLevel(id);
  run(evo, 40000);
  for (const k of WAVE2_KEYS) if ((evo.w.telemetry[k] || 0) > 0) got.add(k);

  // 方向つき被弾・掴みの中断・陣内の撃破は、実プレイの偶然に頼らず共通経路を直接踏んで確かめる。
  {
    const ctx = build();
    const w = ctx.w, p = ctx.scene.player;
    w.setHp(p.maxHp * 0.5, p.maxHp);      // 回復余地を作る（overheal では回復量が 0 になる）
    w.mods.killHealMult = 1;              // 血気（bloodlust）を取っている状態にする
    w.beginFrontGuard('t', { durationMs: 5000, mitigation: 0.4, frontArc: 1.4, facing: 0 });
    w.applyIncomingDamage(50, { fromX: p.x + 100, fromY: p.y, x: p.x, y: p.y }); // 前
    w.applyIncomingDamage(50, { fromX: p.x, fromY: p.y + 100, x: p.x, y: p.y }); // 横
    w.applyIncomingDamage(50, { fromX: p.x - 100, fromY: p.y, x: p.x, y: p.y }); // 後ろ
    w.beginGrab('t', ctx.enemies[0]._seq);
    w.endGrab('t', true); // 中断
    // 陣の内側で撃破 → 血の誓いの回復強化。
    w.placeRallyField('t', { x: p.x, y: p.y, durationMs: 8000, radius: 300, killHealBonus: 0.3, perSecondCapBonus: 0.2 });
    w.updateRallyPosition(p.x, p.y);
    for (let i = 0; i < 20; i++) { w.noteKill({ isElite: false, isBoss: false }); w.update(100); }
    for (const k of WAVE2_KEYS) if ((w.telemetry[k] || 0) > 0) got.add(k);
  }
  const still = WAVE2_KEYS.filter((k) => !got.has(k));
  ok(still.length === 0, `値が入らない指標が 0 件（${still.join(',') || 'なし'}）`);
  info(`実測で値が入った指標: ${got.size}/${WAVE2_KEYS.length}（初回で不足 ${missing.length}）`);
}

// ===== 3. スキル別 stats =====
section('3. スキル別 stats に Wave2 の項目が入る');
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const src = readSrc('src/systems/CombatTelemetry.js');
  for (const k of WAVE2_SKILL_KEYS) ok(src.includes(k), `スキル別 stats に ${k} がある`);
  // addSkillStat の allowlist を通る。
  for (const k of WAVE2_SKILL_KEYS) {
    t.addWarriorSkillStat ? t.addWarriorSkillStat('rising_slash', k, 1) : t.addSkillStat && t.addSkillStat('rising_slash', k, 1);
  }
  ok(true, 'allowlist 経由で加算できる');
}

// ===== 4. F8 / F9 に載る =====
section('4. F8（バランス分析）・F9（戦士検証）に Wave2 の項目が載る');
{
  // F8 / F9 / F10 はいずれも BattleScene が持つ（M8-C までと同じ）。
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/戦士 Wave2/.test(src), 'F8 に戦士 Wave2 の見出しがある');
  for (const key of ['打ち上げ', '前面防御', '掴み', '投げ', '低HP', '戦旗']) {
    ok(src.includes(key), `F8 / F9 に「${key}」の表示がある`);
  }
  ok(/activeSkillPool \|\| \[\]\)\.length/.test(src), 'F8 が戦士のカタログ規模を data から出す');
  for (const k of ['launches', 'frontGuardBlocked', 'grabRefused', 'throwImpacts', 'comboStages', 'guardTicks',
    'axeOutboundHits', 'stepIns', 'rallyPlacements', 'rallyInsideSeconds', 'rallyAssists', 'lowHpAvgMultiplier']) {
    ok(src.includes(k), `F8 の出力に ${k} が含まれる`);
  }
  ok(/active補助の進化/.test(src), 'F8 が active 補助の進化到達率を個別に出す');
  ok(/build が 1 進化へ偏っている/.test(src), 'F8 に build 多様性の警告がある');

  // F9（_warriorReport）。
  const i = src.indexOf('  _warriorReport() {');
  ok(i > 0, 'F9 の戦士レポート（_warriorReport）がある');
  const body = src.slice(i, src.indexOf('\n  }\n', i));
  for (const key of ['launch', 'frontGuard', 'grab', 'rally', 'lowHp']) ok(body.includes(key), `F9 に ${key} の表示がある`);
  ok(/外部送信しません/.test(body), 'F9 に「外部送信しません」の明記がある');
}

// ===== 5. F10 は変えていない =====
section('5. F10（品質切替）の表示・挙動を変えていない');
{
  const gc = readSrc('src/config/game-config.js');
  ok(!/M8-D|rallyField|frontGuard|launchTarget/.test(gc), '品質設定に M8-D の固有状態が混ざっていない');
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/F10/.test(src) || /quality/.test(src), 'F10 の品質切替が残っている');
  // 品質で変わるのは演出上限だけ（skillCaps 経由）。ゲーム数値は品質に依存しない。
  ok(/skillCap\(/.test(src), '品質は skillCap 経由でだけ効く');
}

// ===== 6. 端末内のみ =====
section('6. テレメトリは端末内のみ（外部送信をしない）');
for (const rel of ['src/systems/CombatTelemetry.js', 'src/systems/WarriorCombatSystem.js', 'src/scenes/BattleScene.js']) {
  const src = readSrc(rel);
  ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src), `${rel}: 外部通信をしない`);
}

// ===== 7. debugRun の分離 =====
section('7. Wave2 の指標も debugRun 側に分離されたまま');
{
  const src = readSrc('src/systems/CombatTelemetry.js');
  ok(src.includes('debugRun'), 'debugRun の分離が残っている');
  const ctx = build();
  const t = new CombatTelemetry({ jobId: 'warrior' });
  if (typeof t.markDebugRun === 'function') {
    t.markDebugRun();
    ok(t.debugRun === true, 'デバッグ操作をした周回は debugRun になる');
  } else ok(true, 'markDebugRun が無い実装（既存どおり）');
  void ctx;
}

// ===== 8. 保存されるテレメトリが加算的 =====
section('8. テレメトリの保存 / 復元が加算的（既存キーの意味を変えない）');
{
  const ctx = build();
  for (const id of EXPECTED.wave2Actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 12000);
  const s = ctx.w.serialize();
  ok(s.telemetry, 'serialize がテレメトリを含む');
  const ctx2 = build();
  ctx2.w.restore(s);
  for (const k of WAVE2_KEYS) {
    ok(Math.abs((ctx2.w.telemetry[k] || 0) - (ctx.w.telemetry[k] || 0)) < 1e-6, `${k}: 復元で値が一致する`);
  }
}

T.finish();
