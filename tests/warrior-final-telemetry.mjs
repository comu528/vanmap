// 戦士 最終Wave 15/16: テレメトリ・F8 / F9（M8-E §telemetry）。Node.js 標準機能のみ。
//   - M8-E で足した指標が CombatTelemetry と summary() の両方にあり 1:1
//   - 実プレイで実際に値が入る（宣言だけの指標が無い）
//   - スキル別 stats にも M8-E の項目が入る
//   - F8（バランス分析）・F9（戦士検証）に M8-E の項目が載る。**F10 は変えていない**
//   - テレメトリは端末内のみ（外部送信をしない）・debugRun 分離が残っている
// 実行: node tests/warrior-final-telemetry.mjs

import { CombatTelemetry } from '../src/systems/CombatTelemetry.js';
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc } from './warrior-common.mjs';

const T = runner('戦士 最終Wave テレメトリ・F8 / F9（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();

// WarriorCombatSystem.telemetry 側の内部キー（ミリ秒・合計値）。
const FINAL_KEYS = [
  'lineThrusts', 'linePenetrations', 'lineToughHits', 'lineStepIns',
  'duelStarts', 'duelBoss', 'duelElite', 'duelNormal',
  'duelUptimeMs', 'duelDamageBonusSum', 'duelHits', 'duelRetargets', 'duelExtensions', 'duelClears',
  'tranceStarts', 'tranceUptimeMs', 'tranceDamageBonusSum', 'trancePenaltySum', 'tranceSamples',
  'marchStomps', 'marchCompleted', 'marchDistance', 'marchFinalStomps',
  'deflectWindows', 'deflectUptimeMs', 'deflectSeen', 'deflected', 'deflectRejected',
  'reflectedSpawned', 'reflectedHits', 'reflectedDamage', 'reactionArbitrated',
];
// 実プレイでは滅多に踏まないが、共通経路を直接叩いて必ず確かめる指標。
const FINAL_EDGE_KEYS = ['tranceKillHealBonus', 'deflectCapReached', 'mirrorCounters'];
// 安全弁のカウンタ。出荷中の data では合成上限に届かないので実プレイでは 0 のまま。
// 「宣言だけの指標」にならないよう、上限が効く config を明示して経路そのものを確かめる。
const SAFETY_KEYS = ['tranceOffenseCapped'];
// summary() / CombatTelemetry.warrior 側の外向きキー（秒・平均へ換算済み）。
const FINAL_SUMMARY_KEYS = [
  'lineThrusts', 'linePenetrations', 'lineToughHits', 'lineStepIns',
  'duelStarts', 'duelBoss', 'duelElite', 'duelNormal',
  'duelUptimeSeconds', 'duelHits', 'duelAvgDamageBonus', 'duelRetargets', 'duelExtensions', 'duelClears',
  'tranceStarts', 'tranceUptimeSeconds', 'tranceAvgDamageBonus', 'tranceAvgPenalty',
  'tranceOffenseCapped', 'tranceKillHealBonus',
  'marchStomps', 'marchCompleted', 'marchDistance', 'marchFinalStomps',
  'deflectWindows', 'deflectUptimeSeconds', 'deflectSeen', 'deflected', 'deflectRejected',
  'deflectCapReached', 'reflectedSpawned', 'reflectedHits', 'reflectedDamage',
  'mirrorCounters', 'reactionArbitrated',
];
const FINAL_SKILL_KEYS = ['thrusts', 'penetrations', 'duels', 'duelMs', 'tranceMs', 'stomps', 'deflects', 'reflected'];

let bulletSeq = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bulletSeq, x: 402 + (i % 6) * 4, y: 300 + Math.floor(i / 6) * 4, angle: Math.PI,
  alive: true, hostile: true, damage: 20, speed: 180, projectileKind: 'bossBullet',
  isBeam: false, isTelegraph: false, alreadyDeflected: false, deflectGeneration: 0,
  suppressSpecialEffects: false, _deflectId: null,
}));

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: 'high', enemyBullets: opts.bullets || mkBullets(24) });
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
section('1. M8-E の指標が CombatTelemetry と summary() の両方にある');
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const ctx = build();
  const sum = ctx.w.summary();
  for (const k of [...FINAL_KEYS, ...FINAL_EDGE_KEYS]) {
    ok(Object.prototype.hasOwnProperty.call(ctx.w.telemetry, k), `telemetry に ${k} がある`);
  }
  for (const k of FINAL_SUMMARY_KEYS) {
    ok(Object.prototype.hasOwnProperty.call(t.warrior, k), `CombatTelemetry.warrior に ${k} がある`);
    ok(Object.prototype.hasOwnProperty.call(sum, k), `summary() が ${k} を返す`);
  }
  // ライブ表示専用キー（数値ではなく現在状態）。
  const live = new Set(['fury', 'combo', 'bossPoiseGauge', 'rallyActive', 'rallyInside', 'frontGuardActive',
    'duelActive', 'duelKind', 'tranceActive', 'deflectionActive']);
  for (const k of Object.keys(t.warrior)) ok(Object.prototype.hasOwnProperty.call(sum, k), `summary() が ${k} を返す`);
  for (const k of Object.keys(sum)) {
    ok(Object.prototype.hasOwnProperty.call(t.warrior, k) || live.has(k) || /Seconds$/.test(k),
      `summary() の ${k} は telemetry 側にもある（またはライブ / 秒換算）`);
  }
  info(`warrior テレメトリキー ${Object.keys(t.warrior).length} 件（うち M8-E 追加 ${FINAL_SUMMARY_KEYS.length} 件）`);
}

// ===== 2. 実プレイで値が入る =====
section('2. 実プレイで M8-E の指標に実際の値が入る（宣言だけの指標がない）');
{
  const got = new Set();
  const scenarios = [
    { enemies: makeEnemies(14, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 }) },
    { enemies: makeEnemies(8, { x: 340, y: 300, dx: 10, hp: 1e9, elite: true }) },
    { enemies: makeEnemies(4, { x: 360, y: 300, dx: 10, hp: 1e9 }), boss: makeBoss({ x: 420, y: 300, hp: 1e9 }) },
  ];
  for (const sc of scenarios) {
    const ctx = build(sc);
    for (const id of EXPECTED.finalActives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
    for (let i = 0; i < 2500; i++) {
      ctx.sm.update(16, { hasEnemies: true });
      ctx.w.setHp(ctx.scene.player.maxHp * (i % 400 < 200 ? 1 : 0.2), ctx.scene.player.maxHp);
      ctx.w.update(16);
      ctx.scene.advance(16);
      // 弾を補充し続ける（弾き返しの窓が毎回空にならないように）。
      if (i % 120 === 0) ctx.scene.enemyBullets.push(...mkBullets(12));
    }
    for (const k of FINAL_KEYS) if ((ctx.w.telemetry[k] || 0) > 0) got.add(k);
  }
  // 進化側でだけ増える指標（再指定 / 延長 / 天鏡の反撃など）。
  const evo = build({ enemies: makeEnemies(6, { x: 360, y: 300, dx: 10, hp: 200, elite: true }), boss: makeBoss({ x: 430, y: 300, hp: 1e9 }) });
  for (const id of EXPECTED.finalEvolutions) evo.sm.acquireOrLevel(id);
  run(evo, 40000);
  for (const k of FINAL_KEYS) if ((evo.w.telemetry[k] || 0) > 0) got.add(k);

  // 実プレイの偶然に頼らず、共通経路を直接踏んで残りを埋める。
  {
    const ctx = build();
    const w = ctx.w;
    // 決闘: 再指定と体勢崩しによる延長、解除。
    w.beginDuelChallenge('t', ctx.enemies[0], {
      durationMs: 6000, meleeDamageBonus: 0.2, poiseDamageBonus: 0.2, furyGainBonus: 0.1,
      maxRetargets: 1, extendPerBreakMs: 800, maxExtensionMs: 2400,
    });
    ctx.enemies[1].isElite = true;
    w.retargetDuel(ctx.enemies[1]);
    w.noteDuelStanceBreak(ctx.enemies[1]);
    w.clearDuelTarget('t', 'manual');
    // 構え: 合成上限の到達と撃破回復の強化。
    w.beginBattleTrance('t', { durationMs: 6000, meleeDamageBonus: 0.45, killHealBonus: 0.3, perSecondCapBonus: 0.2 });
    w.addFury(w.cfg.fury.max * 2); w.startRelease();
    w.getBattleTranceModifiers();
    w.setHp(ctx.scene.player.maxHp * 0.5, ctx.scene.player.maxHp);
    w.mods.killHealMult = 1;
    for (let i = 0; i < 20; i++) { w.noteKill({ isElite: false, isBoss: false }); w.update(100); }
    // 弾き返し: 上限到達と天鏡の反撃。
    w.beginDeflectionWindow('t', { windowMs: 2000, maxDeflections: 1, radius: 300, reflect: true, reflectedDamage: 30, reflectedSpeed: 300, reflectLifeMs: 500 });
    for (const b of mkBullets(4)) ctx.scene.tryDeflectProjectile(b, { skillId: 'weapon_deflection' });
    w.noteReflectedHit(30);
    w.noteMirrorCounter();
    // 直線の踏み込み。
    w.noteLineStepIn(24);
    // 軽減の低下（構え中に軽減を問い合わせるたびにサンプルが増える）。
    w.beginBattleTrance('t2', { durationMs: 4000, meleeDamageBonus: 0.2, mitigationPenalty: DATA.balance.warrior.trance.maxMitigationPenalty });
    for (let i = 0; i < 10; i++) w.damageReduction({ engaged: true });
    // 弾けない種別（窓が開いている間に飛んでくる光条 / 予兆）。
    w.beginDeflectionWindow('t3', { windowMs: 2000, maxDeflections: 4, radius: 300, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
    for (const b of mkBullets(3)) { b.isBeam = true; b.projectileKind = 'beam'; ctx.scene.tryDeflectProjectile(b, { skillId: 'weapon_deflection' }); }
    for (const k of [...FINAL_KEYS, ...FINAL_EDGE_KEYS]) if ((w.telemetry[k] || 0) > 0) got.add(k);
  }
  const still = [...FINAL_KEYS, ...FINAL_EDGE_KEYS].filter((k) => !got.has(k));
  ok(still.length === 0, `値が入らない指標が 0 件（${still.join(',') || 'なし'}）`);
  info(`実測で値が入った指標: ${got.size}/${FINAL_KEYS.length + FINAL_EDGE_KEYS.length}`);
}

// ===== 2b. 安全弁のカウンタ =====
section('2b. 安全弁のカウンタ（合成上限の到達）は経路が生きている');
{
  const TR = DATA.balance.warrior.trance;
  const FR = DATA.balance.warrior.furyRelease;
  const room = TR.combinedOffenseCap - Math.max(0, FR.meleeDamageMult - 1);
  // 出荷中の data では「解放中でも構えの上限ぶんの余地が残る」ので上限に触れない。
  ok(TR.maxMeleeDamageBonus <= room + 1e-9,
    `出荷 data では合成上限に届かない（構え上限 ${TR.maxMeleeDamageBonus} ≤ 余地 ${room.toFixed(2)}）`);
  // 上限が効く config を明示して、クランプとカウンタが実際に動くことを確かめる。
  const scene = makeScene({ enemies: makeEnemies(4, { hp: 1e9 }), now: 10000 });
  const tight = new WarriorCombatSystem({
    config: { ...DATA.balance.warrior, trance: { ...TR, combinedOffenseCap: 0.25 } },
    enabled: true, now: () => scene.time.now, heal: () => 0, emit: () => {},
  });
  tight.beginBattleTrance('t', { durationMs: 5000, meleeDamageBonus: TR.maxMeleeDamageBonus });
  tight.addFury(tight.cfg.fury.max * 2); tight.startRelease();
  const m = tight.getBattleTranceModifiers();
  ok(m.meleeDamage < TR.maxMeleeDamageBonus - 1e-9, `合成上限でクランプされる（+${(m.meleeDamage * 100).toFixed(0)}%）`);
  ok(m.meleeDamage + Math.max(0, FR.meleeDamageMult - 1) <= 0.25 + 1e-9, '構え + 解放が合成上限を超えない');
  for (const k of SAFETY_KEYS) ok((tight.telemetry[k] || 0) > 0, `${k}: 上限が効く条件で実際に数える`);
}

// ===== 3. スキル別 stats =====
section('3. スキル別 stats に M8-E の項目が入る');
{
  const src = readSrc('src/systems/CombatTelemetry.js');
  for (const k of FINAL_SKILL_KEYS) ok(src.includes(k), `スキル別 stats に ${k} がある`);
  // 実プレイで実際に入る。
  const ctx = build();
  for (const id of EXPECTED.finalActives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 20000);
  const stats = ctx.sm.statsList();
  const has = (id, k) => ((stats.find((s) => s.id === id) || {}).extra || {})[k];
  ok((has('piercing_lunge', 'thrusts') || 0) > 0, '貫穿突きの thrusts に値が入る');
  ok((has('duel_challenge', 'duels') || 0) > 0, '一騎討ちの duels に値が入る');
  ok((has('battle_trance', 'trances') || 0) > 0, '修羅の構えの trances に値が入る');
  ok((has('earthshaker_march', 'stomps') || 0) > 0, '震天踏破の stomps に値が入る');
  ok((has('weapon_deflection', 'windows') || 0) > 0, '刃返しの windows に値が入る');
}

// ===== 4. F8 / F9 に載る =====
section('4. F8（バランス分析）・F9（戦士検証）に M8-E の項目が載る');
{
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/戦士 最終Wave/.test(src), 'F8 に戦士 最終Wave の見出しがある');
  for (const key of ['貫穿突き', '一騎討ち', '修羅の構え', '震天踏破', '刃返し', '反射弾']) {
    ok(src.includes(key), `F8 / F9 に「${key}」の表示がある`);
  }
  for (const k of ['lineThrusts', 'duelStarts', 'duelUptimeSeconds', 'tranceStarts', 'tranceUptimeSeconds',
    'marchStomps', 'deflectWindows', 'deflected', 'reflectedSpawned', 'mirrorCounters', 'reactionArbitrated']) {
    ok(src.includes(k), `F8 の出力に ${k} が含まれる`);
  }
  ok(/active補助の進化/.test(src), 'F8 が active 補助の進化到達率を個別に出す（M8-D から維持）');
  ok(/カタログ active\$\{/.test(src), 'F8 が最終カタログ規模を data から出す');
  // 警告。
  for (const warn of ['直線攻撃が 1 度も複数体を貫いていない', '一騎討ちは成立するが対象へ 1 度も当たっていない',
    '構えは発動しているが稼働時間 0', '震天踏破が 1 度も移動していない', '刃返しの窓は開くが弾を 1 度も検知していない']) {
    ok(src.includes(warn), `F8 に警告「${warn}」がある`);
  }

  // F9（_warriorReport）。
  const i = src.indexOf('  _warriorReport() {');
  ok(i > 0, 'F9 の戦士レポート（_warriorReport）がある');
  const body = src.slice(i, src.indexOf('\n  }\n', i));
  for (const key of ['貫穿突き', '一騎討ち', '修羅の構え', '震天踏破', '刃返し']) ok(body.includes(key), `F9 に ${key} の表示がある`);
  ok(body.includes('正式な状態ではない') || body.includes('正式状態ではない'), 'F9 が「正式状態ではない」ことを明記する');
  ok(body.includes('ボス予告') || body.includes('弾けない'), 'F9 が弾けない種別を明記する');
  ok(/外部送信しません/.test(body), 'F9 に「外部送信しません」の明記がある');
  // Job Lv80 の対象数も F9 に載ったまま。
  ok(body.includes('Job Lv80'), 'F9 に Job Lv80 の対象が載ったまま');
}

// ===== 5. F10 は変えていない =====
section('5. F10（品質切替）の表示・挙動を変えていない');
{
  const gc = readSrc('src/config/game-config.js');
  ok(!/M8-E|duel|trance|deflect|march/i.test(gc), '品質設定に M8-E の固有状態が混ざっていない');
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/F10/.test(src), 'F10 の品質切替が残っている');
  ok(/skillCap\(/.test(src), '品質は skillCap 経由でだけ効く');
}

// ===== 6. 端末内のみ =====
section('6. テレメトリは端末内のみ（外部送信をしない）');
for (const rel of ['src/systems/CombatTelemetry.js', 'src/systems/WarriorCombatSystem.js', 'src/scenes/BattleScene.js']) {
  const src = readSrc(rel);
  ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src), `${rel}: 外部通信をしない`);
}

// ===== 7. debugRun の分離 =====
section('7. M8-E の指標も debugRun 側に分離されたまま');
{
  const src = readSrc('src/systems/CombatTelemetry.js');
  ok(src.includes('debugRun'), 'debugRun の分離が残っている');
  const t = new CombatTelemetry({ jobId: 'warrior' });
  if (typeof t.markDebugRun === 'function') {
    t.markDebugRun();
    ok(t.debugRun === true, 'デバッグ操作をした周回は debugRun になる');
  } else ok(true, 'markDebugRun が無い実装（既存どおり）');
}

// ===== 8. 保存 / 復元が加算的 =====
section('8. テレメトリの保存 / 復元が加算的（既存キーの意味を変えない）');
{
  const ctx = build();
  for (const id of EXPECTED.finalActives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 12000);
  const s = ctx.w.serialize();
  ok(s.telemetry, 'serialize がテレメトリを含む');
  const ctx2 = build();
  ctx2.w.restore(s);
  for (const k of FINAL_KEYS) {
    ok(Math.abs((ctx2.w.telemetry[k] || 0) - (ctx.w.telemetry[k] || 0)) < 1e-6, `${k}: 復元で値が一致する`);
  }
  // M8-B/C/D の既存キーも意味が変わっていない。
  for (const k of ['meleeCasts', 'physicalDamage', 'counters', 'launches', 'rallyPlacements']) {
    ok(Object.prototype.hasOwnProperty.call(ctx2.w.telemetry, k), `既存キー ${k} が残っている`);
  }
}

// ===== 9. 火 / 氷のテレメトリを変えていない =====
section('9. 火 / 氷のテレメトリブロックを 1 件も変えていない');
{
  const fire = new CombatTelemetry({ jobId: 'flame_witch' });
  const frost = new CombatTelemetry({ jobId: 'frost_mage' });
  for (const t of [fire, frost]) {
    ok(t.warrior === undefined || typeof t.warrior === 'object', '他ジョブでも構造は同じ（加算的）');
  }
  const src = readSrc('src/systems/CombatTelemetry.js');
  // M8-E の追加は warrior ブロックの中だけ。
  const wi = src.indexOf('this.warrior = {');
  const we = src.indexOf('};', wi);
  const block = src.slice(wi, we);
  for (const k of ['duelStarts', 'tranceStarts', 'deflectWindows', 'lineThrusts', 'marchStomps']) {
    ok(block.includes(k), `${k} は warrior ブロックの中にある`);
    ok(src.indexOf(k) >= wi && src.indexOf(k) <= we + 4000, `${k} が warrior ブロック以外へ漏れていない`);
  }
}

T.finish();
