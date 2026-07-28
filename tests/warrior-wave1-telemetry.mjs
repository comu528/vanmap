// 戦士 Wave1 18/19: テレメトリ・F8 / F9（M8-C §21, §22）。Node.js 標準機能のみ。
// Wave1 で増えた指標が「取れて・0 でなくなり・外へ出ない」ことを固定する。
//   - 処刑 / 反撃 / 戦吼 / 引き寄せ / 跳躍 / 進軍 / 連撃の各指標が telemetry と summary の両方にある
//   - 実プレイで実際に値が入る（宣言だけの指標がない）
//   - スキル別統計にも Wave1 の指標が入る
//   - 火 / 氷の周回ではキー構造が変わらず、すべて 0 のまま
//   - 外部送信が一切ない（localStorage / console 以外へ出さない）
//   - F8 の戦士分析・F9 のデバッグ表示に Wave1 が載っている（F10 は変えない）
// 実行: node tests/warrior-wave1-telemetry.mjs

import { CombatTelemetry } from '../src/systems/CombatTelemetry.js';
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, allSrc } from './warrior-common.mjs';

const T = runner('戦士 Wave1 テレメトリ・F8 / F9（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const WAVE1 = [...EXPECTED.wave1Actives, ...EXPECTED.wave1Evolutions];
const SKILL = (id) => DATA.skills.find((x) => x.id === id);

// M8-C で追加した戦士テレメトリ（周回全体）。
const NEW_KEYS = [
  'executions', 'executeFailures', 'executeOverkill',
  'counters', 'counterBySource',
  'warCryApplications', 'warCryUptimeSeconds',
  'chainPulls', 'chainPullDistance', 'bossApproaches',
  'leapLandings', 'sweepDistance', 'relentlessChains', 'relentlessRetargets',
];
// M8-C で追加したスキル別統計。
const NEW_SKILL_KEYS = ['executions', 'counters', 'pullDistance', 'retargets', 'movementDistance'];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(20, { x: 330, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000 });
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
    if (i % 25 === 12) ctx.scene.onWarriorHit(60, 40);
  }
};

// ===== 1. キーが両側に揃っている =====
section('1. Wave1 の指標が CombatTelemetry と summary() の両方にある');
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const ctx = build();
  const sum = ctx.w.summary();
  for (const k of NEW_KEYS) {
    // uptimeSeconds は summary 側の名前（内部は ...Ms）。
    const internalKey = k === 'warCryUptimeSeconds' ? 'warCryUptimeMs' : k;
    ok(Object.prototype.hasOwnProperty.call(t.warrior, k), `CombatTelemetry.warrior に ${k} がある`);
    ok(Object.prototype.hasOwnProperty.call(sum, k), `summary() が ${k} を返す`);
    ok(Object.prototype.hasOwnProperty.call(ctx.w.telemetry, internalKey), `内部 telemetry に ${internalKey} がある`);
  }
  // 1:1 が崩れていない（M8-B のテストと同じ規則）。
  const live = new Set(['fury', 'combo', 'bossPoiseGauge']);
  for (const k of Object.keys(t.warrior)) ok(Object.prototype.hasOwnProperty.call(sum, k), `summary() が ${k} を返す（全体の 1:1）`);
  for (const k of Object.keys(sum)) {
    ok(Object.prototype.hasOwnProperty.call(t.warrior, k) || live.has(k), `${k}: telemetry 側にも存在する`);
  }
  info(`warrior テレメトリキー ${Object.keys(t.warrior).length} 件（うち M8-C 追加 ${NEW_KEYS.length} 件）`);
}

// ===== 2. 実プレイで実際に値が入る =====
section('2. 実プレイで Wave1 の指標に実際の値が入る（宣言だけの指標がない）');
{
  // 処刑 / 撃破が起きる条件。
  const weak = makeEnemies(30, { x: 330, y: 300, dy: 2, hp: 300 });
  for (const e of weak) e.hp = 40;
  const ctx = build({ enemies: weak, boss: makeBoss({ x: 380, y: 300, hp: 1e9 }), mods: { killHealMult: 1 } });
  for (const id of WAVE1) { ctx.sm.acquireOrLevel(id); if (SKILL(id)) ctx.sm.setLevel(id, 8); }
  run(ctx, 40000);
  const t = ctx.w.telemetry;
  ok(t.executions > 0, `処刑 ${t.executions} 件`);
  ok(t.executeFailures > 0, `処刑失敗 ${t.executeFailures} 件`);
  ok(t.counters > 0, `反撃 ${t.counters} 件`);
  ok(Object.keys(t.counterBySource).length > 0, `反撃の系統別 ${JSON.stringify(t.counterBySource)}`);
  ok(t.warCryApplications > 0, `戦吼 ${t.warCryApplications} 回`);
  ok(t.warCryUptimeMs > 0, `戦吼の稼働 ${Math.round(t.warCryUptimeMs)}ms`);
  // 引き寄せは「近接の外の通常敵」を狙うので、遠くの敵を用意した別の周回で見る。
  const pullCtx = build({ enemies: makeEnemies(8, { x: 540, y: 300, dy: 8, hp: 1e9 }) });
  pullCtx.sm.acquireOrLevel('chain_hook'); pullCtx.sm.setLevel('chain_hook', 8);
  run(pullCtx, 20000);
  ok(pullCtx.w.telemetry.chainPulls > 0, `引き寄せ ${pullCtx.w.telemetry.chainPulls} 回`);
  ok(pullCtx.w.telemetry.chainPullDistance > 0, `引き寄せ距離 ${Math.round(pullCtx.w.telemetry.chainPullDistance)}px`);
  ok(t.leapLandings > 0, `着地 ${t.leapLandings} 回`);
  ok(t.sweepDistance > 0, `進軍距離 ${Math.round(t.sweepDistance)}px`);
  ok(t.relentlessChains > 0, `連撃完走 ${t.relentlessChains} 回`);
  // 引き継ぎは「1 打撃で 1 体しか倒れない」配置でしか起きないので、専用の周回で見る。
  const rt = build({ enemies: [] });
  const ring = [[355, 300], [300, 355], [245, 300], [300, 245]];
  const around = makeEnemies(4, { x: 0, y: 0, dy: 0, hp: 1 });
  around.forEach((e, i) => { e.x = ring[i][0]; e.y = ring[i][1]; });
  const rctx = build({ enemies: around });
  rctx.sm.acquireOrLevel('relentless_combo'); rctx.sm.setLevel('relentless_combo', 8);
  run(rctx, 12000);
  ok(rctx.w.telemetry.relentlessRetargets > 0, `連撃の引き継ぎ ${rctx.w.telemetry.relentlessRetargets} 回`);
  void rt;
  // summary が秒へ変換している。
  const sum = ctx.w.summary();
  ok(Math.abs(sum.warCryUptimeSeconds - t.warCryUptimeMs / 1000) < 1e-9, `稼働時間を秒で返す（${sum.warCryUptimeSeconds.toFixed(2)}s）`);
  info(`実測: 処刑${t.executions} 反撃${t.counters} 戦吼${t.warCryApplications} 引き寄せ${t.chainPulls} 着地${t.leapLandings} 連撃${t.relentlessChains}`);
}

// ===== 3. ボス接近も記録される =====
section('3. ボス相手の接近（引き寄せの代わり）も記録される');
{
  const ctx = build({ enemies: [], boss: makeBoss({ x: 520, y: 300, hp: 1e9 }) });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  run(ctx, 20000);
  ok(ctx.w.telemetry.bossApproaches > 0, `ボス接近 ${ctx.w.telemetry.bossApproaches} 回`);
  ok(ctx.w.telemetry.chainPulls === 0, 'ボス相手では引き寄せ回数は増えない（区別されている）');
}

// ===== 4. スキル別統計 =====
section('4. スキル別統計にも Wave1 の指標が入る');
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  for (const k of NEW_SKILL_KEYS) {
    t.addSkillStat('armor_breaker', k, 1);
  }
  const out = t.finalize ? t.finalize() : null;
  const src = readSrc('src/systems/CombatTelemetry.js');
  for (const k of NEW_SKILL_KEYS) ok(src.includes(`'${k}'`), `addSkillStat の許可キーに ${k} がある`);
  void out;
  // 実プレイでも値が入る。
  const weak = makeEnemies(24, { x: 330, y: 300, dy: 2, hp: 1000 });
  for (const e of weak) e.hp = 100; // 10%（処刑圏内）
  const ctx = build({ enemies: weak });
  for (const id of ['execution_strike', 'chain_hook', 'relentless_combo', 'counter_stance', 'sweeping_advance'] ) {
    ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  }
  run(ctx, 30000);
  const ws = ctx.scene._warriorSkillStats;
  ok((ws.execution_strike?.executions || 0) > 0, `処刑斬のスキル別処刑数 ${ws.execution_strike?.executions || 0}`);
  ok((ws.counter_stance?.counters || 0) > 0, `迎撃の構えのスキル別反撃数 ${ws.counter_stance?.counters}`);
  info(`スキル別: 処刑${ws.execution_strike?.executions} 反撃${ws.counter_stance?.counters}`);
}

// ===== 5. 火 / 氷ではキー構造が変わらず 0 のまま =====
section('5. 火 / 氷の周回では Wave1 の指標がすべて 0 のまま');
for (const jid of ['flame_witch', 'frost_mage']) {
  const t = new CombatTelemetry({ jobId: jid });
  for (const k of NEW_KEYS) {
    ok(Object.prototype.hasOwnProperty.call(t.warrior, k), `${jid}: ${k} のキーは存在する（構造不変）`);
    const v = t.warrior[k];
    if (typeof v === 'number') ok(v === 0, `${jid}: ${k} は 0`);
    else ok(Object.keys(v).length === 0, `${jid}: ${k} は空`);
  }
  // 戦士システムが無効なら値が入らない。
  const scene = makeScene({ enemies: makeEnemies(4), now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, { enabled: false });
  w.noteExecute(true, 5); w.noteMovement('chainPull', 100); w.applyWarCryBuff({ durationMs: 5000 });
  w.beginCounterWindow('counter_stance', { durationMs: 3000, maxCounters: 1 });
  ok(w.telemetry.executions === 0, `${jid}: 無効時は処刑が記録されない`);
  ok(w.telemetry.chainPulls === 0, `${jid}: 無効時は引き寄せが記録されない`);
  ok(w.telemetry.warCryApplications === 0, `${jid}: 無効時は戦吼が記録されない`);
  ok(w.counterWindows.size === 0, `${jid}: 無効時は構えが登録されない`);
}

// ===== 6. 外部送信なし =====
section('6. テレメトリを外部へ送信していない');
{
  const src = allSrc();
  for (const bad of ['XMLHttpRequest', 'navigator.sendBeacon', 'WebSocket', 'axios', 'import(\'http']) {
    ok(!src.includes(bad), `${bad} を使っていない`);
  }
  // fetch はローカル data/*.json の読み込み（DataManager）だけに限る。
  const fetchFiles = [];
  for (const [f, body] of [['CombatTelemetry', readSrc('src/systems/CombatTelemetry.js')], ['BattleScene', readSrc('src/scenes/BattleScene.js')], ['WarriorCombatSystem', readSrc('src/systems/WarriorCombatSystem.js')]]) {
    if (body.includes('fetch(')) fetchFiles.push(f);
  }
  ok(fetchFiles.length === 0, `テレメトリ側で fetch を使っていない（${fetchFiles.join(',') || 'なし'}）`);
  const ct = readSrc('src/systems/CombatTelemetry.js');
  ok(!/https?:\/\//.test(ct.replace(/\/\/.*$/gm, '')), 'CombatTelemetry に外部 URL がない');
}

// ===== 7. F8（バランス検証）の戦士分析 =====
section('7. F8 の戦士分析に Wave1 の指標が載っている');
{
  const src = readSrc('src/scenes/BattleScene.js');
  const ui = src;
  ok(/activeSkillPool \|\| \[\]\)\.length/.test(ui), 'F8 が戦士のカタログ規模を data から出す');
  ok(/戦士カタログ/.test(ui), 'F8 に戦士カタログの見出しがある');
  ok(/lv80ProjectileTarget/.test(ui), 'F8 が Job Lv80 対象数を出す');
  for (const k of ['executions', 'counters', 'warCry', 'chainPull', 'leapLandings', 'sweepDistance', 'relentless']) {
    ok(ui.includes(k), `F8 の出力に ${k} が含まれる`);
  }
  ok(/counterBySource/.test(ui), 'F8 が反撃の系統別内訳を出す');
  ok(/executeFailures/.test(ui), 'F8 が処刑の失敗数も出す');
}

// ===== 8. F9（デバッグ表示）に Wave1 が載っている =====
section('8. F9 の戦士デバッグ表示に Wave1 が載っている');
{
  const src = readSrc('src/scenes/BattleScene.js');
  const i = src.indexOf('  _warriorReport() {');
  ok(i > 0, 'F9 の戦士レポート（_warriorReport）がある');
  const body = src.slice(i, src.indexOf('\n  }\n', i));
  for (const k of ['warCry', 'counterWindows', 'executeParams', 'chainPulls', 'leapLandings', 'lv80ProjectileTarget']) {
    ok(body.includes(k), `F9 の表示に ${k} が含まれる`);
  }
  ok(/外部送信しません/.test(body), 'F9 に「外部送信しません」の明記がある');
  // F9 の操作ボタンにも Wave1 の検証項目がある。
  const dbg = src.slice(src.indexOf('toggleWarriorDebug() {'), src.indexOf('  _warriorReport() {'));
  for (const k of ['処刑圏内', '戦吼バフ', '反撃の構え', '鎖鉤']) ok(dbg.includes(k), `F9 の操作に「${k}」がある`);
  ok(/activeSkillPool/.test(dbg), 'F9 の検証 active 一覧を data のプールから引いている（15 種）');
}

// ===== 9. F10 は変えない =====
section('9. F10（品質切替）の表示・挙動を変えていない');
{
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/F10/.test(src) || /quality/.test(src), 'F10 の品質切替が残っている');
  // 品質切替の対象キーに戦士固有のものを混ぜていない。
  const gc = readSrc('src/config/game-config.js');
  ok(!/warrior/i.test((gc.match(/QUALITY[\s\S]{0,2000}/) || [''])[0]), 'F10 の品質定義に戦士固有の項目を足していない');
}

// ===== 10. デバッグ用の周回情報が debugRun として分離されている =====
section('10. Wave1 の指標も debugRun 側に分離されたまま');
{
  const ct = readSrc('src/systems/CombatTelemetry.js');
  ok(/debugRun/.test(ct), 'debugRun の分離が残っている');
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const snap = t.snapshot ? t.snapshot() : null;
  if (snap) ok(!!snap.warrior, 'snapshot に warrior ブロックがある');
  else ok(true, 'snapshot API を持たない構成');
  // 保存に外部送信フラグが混ざっていない。
  ok(!/upload|telemetryUrl|endpoint/i.test(ct), '送信先の設定が存在しない');
}

T.finish();
