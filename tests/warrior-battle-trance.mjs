// 戦士 最終Wave 8/16: 修羅の構え（M8-E §battle_trance）。Node.js 標準機能のみ。
//   - **正式な状態異常を作らない**。WarriorCombatSystem 上の timed stance として持つ
//   - 同時に 1 つだけ。重ねがけせず、再発動は上書き
//   - 攻撃補正は闘気解放との合成上限（combinedOffenseCap）で必ず頭打ちになる
//   - リスクは軽減の実効値の小幅低下だけ。重装 / 闘気解放 / 不屈を無効化しない
//   - 合計軽減が 0 未満にならない（下限は data の minMitigationAfterPenalty）
//   - 自傷もライフスティールもしない
// 実行: node tests/warrior-battle-trance.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, capFor, skillSourceDeep, registryMap } from './warrior-common.mjs';

const T = runner('戦士 修羅の構え（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'battle_trance';
const SKILL = DATA.skills.find((x) => x.id === ID);
const TR = DATA.balance.warrior.trance;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 340, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 12000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};
const L8 = SKILL.levels[7];

// ===== 1. 正式な状態異常ではない =====
section('1. 正式な状態異常を作らない（戦士本人の timed stance）');
{
  ok(!SKILL.status && !SKILL.statusEffect, 'data に status 宣言が無い');
  const src = skillSourceDeep(ID, registryMap()) || '';
  ok(!/statusManager|applyStatus|addStatus/.test(src), '実装が状態異常 API を呼ばない');
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 4000);
  ok(ctx.w.tranceActive, '構えに入れる');
  for (const e of ctx.enemies) {
    ok(!(e._chill > 0) && !(e._frozenUntil > 0) && !(e._igniteUntil > 0), '敵へ状態異常を撒かない');
  }
  info(`修羅の構え: cast${st(ctx, ID).casts} 発動${ctx.w.telemetry.tranceStarts} 稼働${Math.round(ctx.w.telemetry.tranceUptimeMs)}ms`);
}

// ===== 2. 同時 1 つ・重ねがけしない =====
section('2. 同時に 1 つだけ（重ねがけせず上書き）');
{
  ok(TR.maxStances === 1, `balance の maxStances が 1（${TR.maxStances}）`);
  ok(SKILL.config.stack === 'refresh', `data の stack が refresh（${SKILL.config.stack}）`);
  const ctx = build();
  const w = ctx.w;
  w.beginBattleTrance('a', { durationMs: 3000, meleeDamageBonus: 0.2 });
  const first = w.tranceLeftMs;
  w.beginBattleTrance('a', { durationMs: 3000, meleeDamageBonus: 0.2 });
  ok(Math.abs(w.tranceLeftMs - first) < 1e-6, `再発動で持続が積み上がらない（${w.tranceLeftMs}ms）`);
  const m1 = w.getBattleTranceModifiers().meleeDamage;
  w.beginBattleTrance('a', { durationMs: 3000, meleeDamageBonus: 0.2 });
  ok(Math.abs(w.getBattleTranceModifiers().meleeDamage - m1) < 1e-9, `補正も積み上がらない（+${(m1 * 100).toFixed(0)}%）`);
  // 品質上限が 0 なら構えない（上限は演出ではなく本数）。
  ok(capFor('maxTranceStances', 'low', 1) >= 1, 'low 品質でも 1 本は構えられる');
}

// ===== 3. balance 上限へクランプ =====
section('3. すべての補正が balance の上限へクランプされる');
{
  const ctx = build();
  const w = ctx.w;
  w.beginBattleTrance('a', {
    durationMs: 1e9, meleeDamageBonus: 9, attackSpeedBonus: 9,
    comboGraceBonus: 9, furyGainBonus: 9, mitigationPenalty: 9, killHealBonus: 9,
  });
  const m = w.getBattleTranceModifiers();
  ok(w.tranceLeftMs <= TR.maxDurationMs + 1e-9, `持続 ≤ ${TR.maxDurationMs}ms（${w.tranceLeftMs}）`);
  ok(m.meleeDamage <= TR.maxMeleeDamageBonus + 1e-9, `Dmg ≤ ${TR.maxMeleeDamageBonus}（${m.meleeDamage}）`);
  ok(m.attackSpeed <= TR.maxAttackSpeedBonus + 1e-9, `攻速 ≤ ${TR.maxAttackSpeedBonus}（${m.attackSpeed}）`);
  ok(m.comboGrace <= TR.maxComboGraceBonus + 1e-9, `猶予 ≤ ${TR.maxComboGraceBonus}（${m.comboGrace}）`);
  ok(m.furyGain <= TR.maxFuryGainBonus + 1e-9, `闘気 ≤ ${TR.maxFuryGainBonus}（${m.furyGain}）`);
  ok(m.mitigationPenalty <= TR.maxMitigationPenalty + 1e-9, `軽減低下 ≤ ${TR.maxMitigationPenalty}（${m.mitigationPenalty}）`);
  // data も上限内。
  ok(L8.duration <= TR.maxDurationMs, `Lv8 duration ${L8.duration} ≤ ${TR.maxDurationMs}`);
  ok(L8.meleeDamageBonus <= TR.maxMeleeDamageBonus, `Lv8 Dmg ${L8.meleeDamageBonus} ≤ ${TR.maxMeleeDamageBonus}`);
  ok(L8.mitigationPenalty <= TR.maxMitigationPenalty, `Lv8 軽減低下 ${L8.mitigationPenalty} ≤ ${TR.maxMitigationPenalty}`);
}

// ===== 4. 闘気解放との合成上限 =====
section('4. 闘気解放と合わせても combinedOffenseCap を超えない');
{
  const cap = TR.combinedOffenseCap;
  ok(cap > 0 && cap < 1.5, `balance の combinedOffenseCap が現実的な値（${cap}）`);
  const ctx = build();
  const w = ctx.w;
  w.beginBattleTrance('a', { durationMs: 8000, meleeDamageBonus: TR.maxMeleeDamageBonus });
  const alone = w.getBattleTranceModifiers().meleeDamage;
  ok(alone > 0, `単独では補正が乗る（+${(alone * 100).toFixed(0)}%）`);
  // 闘気を満たして解放中にする。
  w.addFury(w.cfg.fury.max * 2);
  w.startRelease();
  ok(w.releaseActive, '闘気解放を発動できる');
  const withRelease = w.getBattleTranceModifiers().meleeDamage;
  const releaseBonus = Math.max(0, (w.cfg.furyRelease.meleeDamageMult || 1) - 1);
  ok(withRelease + releaseBonus <= cap + 1e-9,
    `構え +${(withRelease * 100).toFixed(0)}% + 解放 +${(releaseBonus * 100).toFixed(0)}% ≤ 上限 ${(cap * 100).toFixed(0)}%`);
  ok(withRelease <= alone + 1e-9, '解放中は構えの取り分が減る（合算で頭打ち）');
  ok(w.telemetry.tranceOffenseCapped >= 0, 'クランプ回数がテレメトリに残る');
}

// ===== 5. 軽減のリスク =====
section('5. リスクは軽減の小幅低下だけ（重装 / 不屈を無効化しない・0 未満にならない）');
{
  const floor = TR.minMitigationAfterPenalty;
  ok(floor >= 0, `balance の下限が 0 以上（${floor}）`);
  // 素の軽減。
  const base = build();
  const r0 = base.w.damageReduction({ engaged: true });
  // 構え中。
  const tctx = build();
  tctx.w.beginBattleTrance('a', { durationMs: 8000, mitigationPenalty: TR.maxMitigationPenalty });
  const r1 = tctx.w.damageReduction({ engaged: true });
  ok(r1 < r0 || r0 === 0, `構え中は軽減が下がる（${(r0 * 100).toFixed(1)}% → ${(r1 * 100).toFixed(1)}%）`);
  ok(r1 >= floor - 1e-9, `軽減が下限 ${(floor * 100).toFixed(0)}% を割らない（${(r1 * 100).toFixed(1)}%）`);
  ok(r1 >= 0, '軽減が負にならない');

  // 重装（passive 由来の mods）を無効化しない。
  const heavy = build({ mods: { damageReductionBonus: 0.25 } });
  const hOff = heavy.w.damageReduction({ engaged: true });
  heavy.w.beginBattleTrance('a', { durationMs: 8000, mitigationPenalty: TR.maxMitigationPenalty });
  const hOn = heavy.w.damageReduction({ engaged: true });
  ok(hOn > r1, `重装ぶんは構え中も残る（${(hOn * 100).toFixed(1)}% > 素の構え中 ${(r1 * 100).toFixed(1)}%）`);
  ok(hOn > 0, '重装があれば構え中でも軽減が残る（無効化ではない）');
  ok(hOff - hOn <= TR.maxMitigationPenalty + 1e-9,
    `低下幅が上限 ${TR.maxMitigationPenalty} 以下（${(hOff - hOn).toFixed(3)}）＝重装ぶんを削り取らない`);

  // 不屈（瀕死時）も無効化しない。
  const un = build();
  un.scene.advance(DATA.balance.warrior.unyielding.minRunTimeMs + 100); // 周回開始直後ガードを越える
  un.w.beginBattleTrance('a', { durationMs: 8000, mitigationPenalty: TR.maxMitigationPenalty });
  un.w.setHp(1, 100);
  ok(un.w.checkUnyielding() === true, '構え中でも不屈が発動する（構えが不屈を塞がない）');
  ok(un.w.unyieldingActive, '不屈が発動中');
  const rU = un.w.damageReduction({ engaged: true });
  ok(rU >= floor - 1e-9, `不屈中も軽減が下限を割らない（${(rU * 100).toFixed(1)}%）`);
}

// ===== 6. 自傷 / ライフスティールをしない =====
section('6. 自傷もライフスティールもしない');
{
  const src = skillSourceDeep(ID, registryMap()) || '';
  ok(!/takeDamage|player\.hp\s*-=|lifesteal|drain/i.test(src), '実装に自傷 / 吸血の経路が無い');
  const ctx = build();
  ctx.scene.player.hp = 100; ctx.scene.player.maxHp = 100;
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 12000);
  ok(ctx.scene.player.hp === 100, `HP が 1 も減らない（${ctx.scene.player.hp}）`);
  // data 側にも自傷キーが無い。
  for (const lv of SKILL.levels) {
    ok(!('selfDamage' in lv) && !('hpCost' in lv) && !('lifesteal' in lv), 'data に自傷 / 吸血のキーが無い');
  }
}

// ===== 7. 無料の打撃数 / 発動数が増えない =====
section('7. 構え中でも打撃数 / 発動数が無料で増えない');
{
  const off = build(); off.sm.acquireOrLevel('great_cleave'); off.sm.setLevel('great_cleave', 8); run(off, 8000);
  const on = build();
  on.sm.acquireOrLevel('great_cleave'); on.sm.setLevel('great_cleave', 8);
  on.w.beginBattleTrance('a', { durationMs: 1e9, attackSpeedBonus: TR.maxAttackSpeedBonus });
  run(on, 8000);
  const cOff = st(off, 'great_cleave').casts || 0, cOn = st(on, 'great_cleave').casts || 0;
  ok(cOn >= cOff, `攻速ぶん発動は増える（${cOff} → ${cOn}）`);
  const maxRatio = 1 + TR.maxAttackSpeedBonus + 0.35; // 端数と CD 位相のぶんだけ余裕を持たせる
  ok(cOn <= cOff * maxRatio + 2, `増分が攻速の範囲内（×${(cOn / Math.max(1, cOff)).toFixed(2)} ≤ ×${maxRatio.toFixed(2)}）`);
  // 打撃数（Lv80 の +1）は構えでは増えない。
  ok(on.w.mods.projectileCountBonus === off.w.mods.projectileCountBonus, '打撃数は構えで増えない');
}

// ===== 8. 時間切れ / destroy / reset =====
section('8. 時間切れ・destroy・reset で必ず解ける');
{
  const ctx = build();
  ctx.w.beginBattleTrance('a', { durationMs: 1200, meleeDamageBonus: 0.2 });
  for (let i = 0; i < 200; i++) { ctx.w.update(16); ctx.scene.advance(16); }
  ok(!ctx.w.tranceActive, '時間切れで解ける');
  ok(ctx.w.getBattleTranceModifiers().meleeDamage === 0, '解けた後は補正が 0');

  const dctx = build();
  dctx.sm.acquireOrLevel(ID); dctx.sm.setLevel(ID, 8);
  run(dctx, 3000);
  dctx.sm.skills.get(ID).destroy();
  ok(!dctx.w.tranceActive, 'スキルの destroy で解ける');

  const w2 = makeWarrior(WarriorCombatSystem, ctx.scene, {});
  w2.beginBattleTrance('a', { durationMs: 5000, meleeDamageBonus: 0.2 });
  w2.reset();
  ok(!w2.tranceActive && w2.telemetry.tranceStarts === 0, 'reset で状態もテレメトリも消える');
}

// ===== 9. 成長 =====
section('9. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = L8;
  for (const k of ['duration', 'meleeDamageBonus', 'attackSpeedBonus', 'comboGraceBonus', 'furyGainBonus']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  // リスク（軽減低下）は伸びてもよいが、必ず balance の上限内で、伸び幅は攻撃側より小さい。
  ok(b.mitigationPenalty <= TR.maxMitigationPenalty + 1e-9,
    `mitigationPenalty: ${a.mitigationPenalty} → ${b.mitigationPenalty}（上限 ${TR.maxMitigationPenalty} 以内）`);
  ok((b.meleeDamageBonus / a.meleeDamageBonus) >= (b.mitigationPenalty / a.mitigationPenalty) - 1e-9,
    `攻撃の伸び ×${(b.meleeDamageBonus / a.meleeDamageBonus).toFixed(2)} ≥ リスクの伸び ×${(b.mitigationPenalty / a.mitigationPenalty).toFixed(2)}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 20000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 20000);
  ok(hi.w.telemetry.tranceUptimeMs > lo.w.telemetry.tranceUptimeMs,
    `Lv8 の構え時間 ${Math.round(hi.w.telemetry.tranceUptimeMs)}ms > Lv1 ${Math.round(lo.w.telemetry.tranceUptimeMs)}ms`);
}

T.finish();
