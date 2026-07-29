// 戦士 16/17: テレメトリ・HUD 表示状態（M8-B §22・§25・§26）。Node.js 標準機能のみ。
// - CombatTelemetry の warrior ブロックと WarriorCombatSystem.summary() のキーが 1:1
// - 火/氷の周回でも warrior ブロックのキー構造が変わらない（すべて 0）
// - 外部送信が一切ないこと
// - HUD の表示状態（warriorHudState）が戦士周回のみ visible になること
// 実行: node tests/warrior-telemetry.mjs

import { CombatTelemetry } from '../src/systems/CombatTelemetry.js';
import { warriorHudState } from '../src/ui/WarriorHud.js';
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, allSrc } from './warrior-common.mjs';

const T = runner('戦士 テレメトリ・HUD（M8-B）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem, FURY_SOURCES } = await bootRuntime();

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 316, y: 300, dy: 3, hp: opts.hp || 1e9 });
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
  }
};

// ===== 1. キー構造の 1:1 対応 =====
section('1. CombatTelemetry.warrior と summary() のキーが 1:1');
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const ctx = build();
  const sum = ctx.w.summary();
  // summary はライブ表示用のキーを追加で持つ（M8-D で戦旗 / 前面防御の 3 つが増えた）。
  const live = new Set(['fury', 'combo', 'bossPoiseGauge', 'rallyActive', 'rallyInside', 'frontGuardActive']);
  for (const k of Object.keys(t.warrior)) {
    ok(Object.prototype.hasOwnProperty.call(sum, k), `summary() が ${k} を返す`);
  }
  for (const k of Object.keys(sum)) {
    ok(Object.prototype.hasOwnProperty.call(t.warrior, k) || live.has(k), `summary() の ${k} は telemetry 側にも存在する（またはライブ表示専用）`);
  }
  info(`warrior テレメトリキー ${Object.keys(t.warrior).length} 件`);
}

// ===== 2. 取り込み（noteWarriorSummary）=====
section('2. noteWarriorSummary が実測値を取り込む');
{
  const boss = makeBoss();
  const ctx = build({ boss, enemies: makeEnemies(30, { x: 300, y: 300, dy: 2, hp: 300, elite: true }), mods: { killHealMult: 1 } });
  for (const id of EXPECTED.actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 12000);
  const t = new CombatTelemetry({ jobId: 'warrior' });
  t.noteWarriorSummary(ctx.w.summary());
  ok(t.warrior.meleeCasts > 0, `meleeCasts ${t.warrior.meleeCasts}`);
  ok(t.warrior.meleeHits > 0, `meleeHits ${t.warrior.meleeHits}`);
  ok(t.warrior.physicalDamage > 0, `physicalDamage ${Math.round(t.warrior.physicalDamage)}`);
  ok(t.warrior.comboPeak > 0, `comboPeak ${t.warrior.comboPeak}`);
  ok(t.warrior.furyGained > 0, `furyGained ${t.warrior.furyGained.toFixed(1)}`);
  ok(t.warrior.poiseDamage > 0, `poiseDamage ${Math.round(t.warrior.poiseDamage)}`);
  for (const s of FURY_SOURCES) ok(typeof t.warrior.furyBySource[s] === 'number', `furyBySource.${s} が取り込まれる`);
  const out = t.finalize();
  ok(!!out.run.warrior, 'finalize() の run に warrior ブロックがある');
  ok(out.run.warrior.meleeHits === t.warrior.meleeHits, 'finalize でも値が保持される');
  ok(out.run.warrior.furyBySource !== t.warrior.furyBySource, 'finalize は複製を返す（後から書き換えられない）');
  info(`集計: 発動${t.warrior.meleeCasts} 命中${t.warrior.meleeHits} 解放${t.warrior.furyReleases} stagger${t.warrior.eliteStaggers} 崩し${t.warrior.bossStanceBreaks}`);
}

// ===== 3. スキル別テレメトリ =====
section('3. スキル別の戦士統計が加算される');
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  t.addSkillStat('great_cleave', { meleeHits: 5, physicalDamage: 120, knockbacks: 3, poiseDamage: 40, eliteStaggers: 1, bossStanceBreaks: 0, comboGain: 2, furyGain: 1.5 });
  t.addSkillStat('great_cleave', { meleeHits: 5, physicalDamage: 100 });
  const out = t.finalize();
  const s = out.skills.great_cleave;
  ok(s.meleeHits === 10, `meleeHits が加算される（${s.meleeHits}）`);
  ok(s.physicalDamage === 220, `physicalDamage が加算される（${s.physicalDamage}）`);
  ok(s.knockbacks === 3 && s.poiseDamage === 40, 'knockbacks / poiseDamage が入る');
  ok(s.eliteStaggers === 1 && s.bossStanceBreaks === 0, 'stagger / 崩し回数が入る');
  ok(s.comboGain === 2 && s.furyGain === 1.5, 'コンボ/闘気の寄与が入る');
  t.addSkillStat('great_cleave', { meleeHits: NaN, physicalDamage: 'x' });
  const out2 = t.finalize();
  ok(out2.skills.great_cleave.meleeHits === 10, 'NaN / 文字列は無視される');
}

// ===== 4. 火/氷の周回でもキー構造が変わらない =====
section('4. 火 / 氷の周回でも warrior ブロックのキー構造が同じ（すべて 0）');
for (const jobId of ['flame_witch', 'frost_mage']) {
  const t = new CombatTelemetry({ jobId });
  const out = t.finalize();
  ok(!!out.run.warrior, `${jobId}: warrior ブロックが存在する`);
  const zeros = Object.entries(out.run.warrior).filter(([, v]) => typeof v === 'number' && v !== 0);
  ok(zeros.length === 0, `${jobId}: 数値がすべて 0（非ゼロ ${zeros.map(([k]) => k).join(',') || 'なし'}）`);
  ok(Object.keys(out.run.warrior).length === Object.keys(new CombatTelemetry({ jobId: 'warrior' }).warrior).length,
    `${jobId}: キー数が戦士周回と同じ（job でスキーマを変えない）`);
  // 既存の status ブロックが壊れていない。
  ok(!!out.run.status, `${jobId}: status ブロックが残っている（非回帰）`);
}

// ===== 5. 外部送信なし =====
section('5. テレメトリ・戦士システムが外部通信をしない');
{
  const files = ['src/systems/CombatTelemetry.js', 'src/systems/WarriorCombatSystem.js', 'src/ui/WarriorHud.js', 'src/skills/WarriorSkillBase.js'];
  for (const f of files) {
    const src = readSrc(f);
    ok(!/fetch\s*\(/.test(src), `${f}: fetch を使わない`);
    ok(!/XMLHttpRequest/.test(src), `${f}: XMLHttpRequest を使わない`);
    ok(!/sendBeacon/.test(src), `${f}: sendBeacon を使わない`);
    ok(!/WebSocket/.test(src), `${f}: WebSocket を使わない`);
    ok(!/https?:\/\//.test(src.replace(/\/\/[^\n]*/g, '')), `${f}: 外部 URL を持たない`);
  }
  const all = allSrc();
  ok(!/navigator\.sendBeacon/.test(all), '全体で sendBeacon を使わない');
}

// ===== 6. HUD 表示状態（純ロジック）=====
section('6. warriorHudState は戦士周回のみ visible');
{
  const ctx = build();
  ok(warriorHudState(ctx.w, false, null).visible === false, '他ジョブでは visible=false');
  ok(warriorHudState(null, true, null).visible === false, 'システムが無い場合も visible=false');
  const off = build({ enabled: false });
  ok(warriorHudState(off.w, true, null).visible === false, 'enabled=false では visible=false');
  const st = warriorHudState(ctx.w, true, null);
  ok(st.visible === true, '戦士周回では visible=true');
  ok(st.furyMax === DATA.balance.warrior.fury.max, `furyMax ${st.furyMax} が data と一致`);
  ok(st.bossPoiseVisible === false, 'ボス不在では体勢ゲージ非表示');
  ok(st.combo === 0 && st.fury === 0, '初期値は 0');
  ok(st.unyieldingReady === true, '不屈は待機表示');
}

// ===== 7. HUD 表示状態（実動作）=====
section('7. warriorHudState が実状態を反映する');
{
  const boss = makeBoss();
  const ctx = build({ boss, enemies: makeEnemies(20, { x: 300, y: 300, dy: 2, hp: 1e9, elite: true }) });
  for (const id of EXPECTED.actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 6000);
  const st = warriorHudState(ctx.w, true, boss);
  ok(st.fury > 0, `闘気 ${st.fury.toFixed(1)} が表示値へ入る`);
  ok(st.furyRatio > 0 && st.furyRatio <= 1, `furyRatio ${st.furyRatio.toFixed(3)} が [0,1]`);
  ok(st.combo > 0, `コンボ ${st.combo}`);
  ok(Number.isInteger(st.combo), 'コンボ表示は整数へ丸める');
  ok(Array.isArray(st.comboThresholds), '到達閾値が配列で返る');
  ok(st.bossPoiseVisible === true, 'ボス在で体勢ゲージ表示');
  ok(st.bossPoiseThreshold > 0, `体勢しきい値 ${Math.round(st.bossPoiseThreshold)}`);
  ok(st.bossPoiseRatio >= 0 && st.bossPoiseRatio <= 1, `体勢比率 ${st.bossPoiseRatio.toFixed(3)} が [0,1]`);
  // 解放中・露出中の表示。
  ctx.w.fury = DATA.balance.warrior.fury.max; ctx.w.startRelease();
  ctx.w.bossPoise.exposedLeftMs = 2000;
  const st2 = warriorHudState(ctx.w, true, boss);
  ok(st2.releaseActive === true && st2.releaseRemainMs > 0, '解放中と残り時間が表示される');
  ok(st2.exposedActive === true && st2.exposedRemainMs > 0, '露出中と残り時間が表示される');
  // 不屈の CD 表示。
  ctx.w.unyielding.cooldownLeftMs = 12345;
  const st3 = warriorHudState(ctx.w, true, boss);
  ok(st3.unyieldingReady === false && st3.unyieldingCooldownMs === 12345, '不屈の CD が表示される');
  // 死亡したボスは非表示。
  boss.alive = false;
  ok(warriorHudState(ctx.w, true, boss).bossPoiseVisible === false, 'ボス死亡で体勢ゲージ非表示');
}

// ===== 8. debugRun の分離 =====
section('8. デバッグ操作をした周回は debugRun として分離される');
{
  const t = new CombatTelemetry({ jobId: 'warrior', debugRun: true });
  const out = t.finalize();
  ok(out.run.debugRun === true, 'debugRun フラグが立つ');
  const t2 = new CombatTelemetry({ jobId: 'warrior' });
  ok(t2.finalize().run.debugRun === false, '通常周回では false');
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/toggleWarriorDebug\(\)\s*\{\s*\n\s*this\.markDebugRun\(\)/.test(src), 'F9 戦士パネルを開くと markDebugRun される');
}

// ===== 9. F8 / F9 の存在 =====
section('9. F8（バランス分析）・F9（戦士検証）に戦士の項目がある');
{
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/toggleWarriorDebug/.test(src), 'toggleWarriorDebug がある');
  ok(/_warriorReport/.test(src), '_warriorReport がある');
  ok(/isWarrior \? this\.toggleWarriorDebug\(\) : this\.toggleFrostDebug\(\)/.test(src), 'F9 が戦士周回では戦士パネルを開く（火/氷は従来どおり）');
  const jaStart = src.indexOf('jobAnalysisReport() {');
  const jaBody = src.slice(jaStart, src.indexOf('\n  }\n', jaStart));
  ok(/戦士（実動作カウンタ）/.test(jaBody), 'F8 分析に戦士セクションがある');
  for (const key of ['闘気', 'コンボ', '軽減', '不屈', '体勢', '露出']) {
    ok(jaBody.includes(key), `F8 分析に「${key}」の表示がある`);
  }
  ok(/⚠/.test(jaBody), 'F8 分析に警告表示がある');
}

T.finish();
