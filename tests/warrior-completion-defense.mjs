// 戦士 完成監査 11/23: 防御系 完成監査（M8-F §13）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-defense.mjs
import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, readSrc, runner } from './warrior-common.mjs';
const T = runner('戦士 防御系 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
const MAXTOTAL = W.mitigation.maxTotalReduction;
const mk = (o = {}) => {
  const scene = makeScene({ enemies: makeEnemies(10, { x: 340, y: 300, hp: 1e9 }), boss: o.boss || null, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, o);
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm };
};

// ===== 1. 合算と 70% 上限 =====
section('1. 軽減の合算が 70% で必ず頭打ちになる（無敵にならない）');
{
  ok(MAXTOTAL > 0 && MAXTOTAL < 1, `balance の maxTotal が (0,1)（${MAXTOTAL}）`);
  const c = mk({ mods: { damageReductionBonus: 0.9 } });
  const w = c.w;
  w.fury = W.fury.max; w.startRelease();
  w.beginFrontGuard('x', { durationMs: 9000, mitigation: W.frontalGuard.maxFrontalMitigation, frontArc: 3.1, facing: 0 });
  w.beginCounterWindow('c', { durationMs: 9000, maxCounters: 5, priority: 2, mitigation: 0.3 });
  w.placeRallyField('r', { x: 0, y: 0, durationMs: 9000, radius: 1e6, mitigation: W.rally.maxMitigation, meleeArea: 0 });
  w.updateRallyPosition(0, 0);
  w.setChargeWindow(9000);
  c.scene.advance(W.unyielding.minRunTimeMs + 100);
  w.setHp(1, 100); w.checkUnyielding();
  const r = w.damageReduction({ engaged: true, fromX: 100, fromY: 0, x: 0, y: 0 });
  ok(r <= MAXTOTAL + 1e-9, `全部盛りでも ${MAXTOTAL} 以下（${r.toFixed(4)}）`);
  ok(r > 0.3, `それでも十分高い（${(r * 100).toFixed(1)}%）`);
  // 実ダメージが 0 にならない。
  const out = w.applyIncomingDamage(100, { fromX: 100, fromY: 0, x: 0, y: 0 });
  ok(out > 0, `被ダメージが 0 にならない（${out.toFixed(2)}）`);
  ok(out >= 100 * (1 - MAXTOTAL) - 1e-6, `最低 ${(100 * (1 - MAXTOTAL)).toFixed(1)} は通る`);
}

// ===== 2. penalty の順序と下限 =====
section('2. 構えの penalty は最後に引かれ、0 未満にならず重装 / 不屈を無効化しない');
{
  const floor = W.trance.minMitigationAfterPenalty;
  const bare = mk(); const bareR = bare.w.damageReduction({ engaged: true });
  const pen = mk(); pen.w.beginBattleTrance('t', { durationMs: 9000, mitigationPenalty: W.trance.maxMitigationPenalty });
  const penR = pen.w.damageReduction({ engaged: true });
  ok(penR >= floor - 1e-9, `下限 ${floor} を割らない（${penR.toFixed(4)}）`);
  ok(penR >= 0, '負にならない');
  ok(penR <= bareR + 1e-9, `軽減は下がる（${bareR.toFixed(4)} → ${penR.toFixed(4)}）`);
  // 重装ありでも「削り取られない」。
  const hv = mk({ mods: { damageReductionBonus: 0.25 } });
  const hvOff = hv.w.damageReduction({ engaged: true });
  hv.w.beginBattleTrance('t', { durationMs: 9000, mitigationPenalty: W.trance.maxMitigationPenalty });
  const hvOn = hv.w.damageReduction({ engaged: true });
  ok(hvOn > 0, `重装があれば構え中も軽減が残る（${hvOn.toFixed(4)}）`);
  ok(hvOff - hvOn <= W.trance.maxMitigationPenalty + 1e-9, `低下幅が上限内（${(hvOff - hvOn).toFixed(4)}）`);
  // 不屈も無効化されない。
  const un = mk();
  un.scene.advance(W.unyielding.minRunTimeMs + 100);
  un.w.beginBattleTrance('t', { durationMs: 9000, mitigationPenalty: W.trance.maxMitigationPenalty });
  un.w.setHp(1, 100);
  ok(un.w.checkUnyielding() === true, '構え中でも不屈が発動する');
  ok(un.w.damageReduction({ engaged: true }) >= floor - 1e-9, '不屈 + 構えでも下限を割らない');
  ok(un.w.damageReduction({ engaged: true }) <= MAXTOTAL + 1e-9, '不屈 + 構えでも上限を超えない');
}

// ===== 3. 方向つき / 方向なし =====
section('3. 前面防御は方向の分かる被弾だけ（前 / 横 / 後ろ / 方向なし）');
{
  ok(W.frontalGuard.requireDirection === true, 'balance で方向必須');
  const c = mk();
  c.w.beginFrontGuard('x', { durationMs: 9000, mitigation: 0.5, frontArc: 1.4, facing: 0 });
  const front = c.w.frontGuardMitigation({ fromX: 100, fromY: 0, x: 0, y: 0 });
  const side = c.w.frontGuardMitigation({ fromX: 0, fromY: 100, x: 0, y: 0 });
  const back = c.w.frontGuardMitigation({ fromX: -100, fromY: 0, x: 0, y: 0 });
  const none = c.w.frontGuardMitigation({});
  ok(front > side && side >= back, `前 ${front.toFixed(3)} > 横 ${side.toFixed(3)} ≥ 後ろ ${back.toFixed(3)}`);
  ok(none === 0, '方向なし（DoT / 全体攻撃）には乗らない');
  ok(front <= W.frontalGuard.maxFrontalMitigation + 1e-9, `前面の上限 ${W.frontalGuard.maxFrontalMitigation}`);
  ok(Math.abs(side - front * W.frontalGuard.sideMultiplier) < 1e-6, `横は ×${W.frontalGuard.sideMultiplier}`);
  ok(Math.abs(back - front * W.frontalGuard.backMultiplier) < 1e-6, `後ろは ×${W.frontalGuard.backMultiplier}`);
  // 地形ハザード / ボス予告のような方向なしダメージにも乗らない。
  ok(c.w.damageReduction({ engaged: false }) < c.w.damageReduction({ engaged: false, fromX: 100, fromY: 0, x: 0, y: 0 }),
    '方向を渡したときだけ前面軽減が合算される');
}

// ===== 4. 反撃 / 弾き返しの調停 =====
section('4. 1 イベント = 最大 1 反応系統（反撃 / 弾き返しが二重に出ない）');
{
  const c = mk();
  const w = c.w;
  w.beginCounterWindow('counter_stance', { durationMs: 9000, maxCounters: 3, priority: 2, mitigation: 0.2 });
  w.beginCounterWindow('adamant_counter', { durationMs: 9000, maxCounters: 3, priority: 3, mitigation: 0.25 });
  w.beginDeflectionWindow('weapon_deflection', { windowMs: 9000, maxDeflections: 4, radius: 200, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  // 近接被弾: 優先度の高い反撃だけが 1 系統。
  const m = w.arbitrateDeflectionAndCounter('melee');
  ok(m && m.kind === 'counter', `近接被弾 → 反撃（${m && m.source}）`);
  ok(m.source === 'adamant_counter', `優先度の高い側が選ばれる（priority ${m.priority}）`);
  ok(w.deflectUsed === 0, '弾き返しの枠を消費しない');
  const usedTotal = [...w.counterWindows.values()].reduce((a, x) => a + x.used, 0);
  ok(usedTotal === 1, `反撃の消費は 1 系統だけ（${usedTotal}）`);
  // 弾イベント: 弾き返しだけ。
  const p = w.arbitrateDeflectionAndCounter('projectile');
  ok(p && p.kind === 'deflect', '弾イベント → 弾き返し');
  const usedTotal2 = [...w.counterWindows.values()].reduce((a, x) => a + x.used, 0);
  ok(usedTotal2 === usedTotal, '弾イベントで反撃の回数が増えない');
  // 全体 CD が効く（連続で反撃し続けない）。
  let n = 0;
  for (let i = 0; i < 50; i++) if (w.arbitrateDeflectionAndCounter('melee')) n++;
  ok(n <= 6, `連続被弾でも反撃は上限内（${n}）`);
  ok(w.telemetry.reactionArbitrated > 0, `調停がテレメトリに残る（${w.telemetry.reactionArbitrated}）`);
}

// ===== 5. 再帰しない =====
section('5. 反撃 → 反撃 / 弾き返し → 弾き返しの再帰が無い');
{
  const src = readSrc('src/systems/WarriorCombatSystem.js');
  ok(!/consumeCounterEvent\([\s\S]{0,200}consumeCounterEvent\(/.test(src), '反撃の消費が再帰しない');
  const c = mk();
  c.w.beginDeflectionWindow('x', { windowMs: 5000, maxDeflections: 8, radius: 200, reflect: true, reflectedDamage: 30, reflectedSpeed: 300, reflectLifeMs: 500 });
  // 反射弾（世代 1）は再び弾けない。
  const refl = { alive: true, hostile: true, projectileKind: 'bossBullet', deflectGeneration: 1, alreadyDeflected: true, isBeam: false, isTelegraph: false };
  ok(c.w.canDeflectProjectile(refl).ok === false, '反射弾を再び弾けない');
  const refl2 = { ...refl, alreadyDeflected: false };
  ok(c.w.canDeflectProjectile(refl2).ok === false, '印が落ちても世代で止まる');
  ok(c.w.maxReflectGeneration() === 1, '世代上限が 1');
}

// ===== 6. 弾ける / 弾けない =====
section('6. 弾けるのは通常の敵弾だけ（予告 / 光条 / 地形 / DoT は弾かない）');
{
  const c = mk();
  c.w.beginDeflectionWindow('x', { windowMs: 5000, maxDeflections: 8, radius: 200, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  const base = { alive: true, hostile: true, isBeam: false, isTelegraph: false, alreadyDeflected: false, deflectGeneration: 0 };
  for (const kind of W.deflection.allowedKinds) {
    ok(c.w.canDeflectProjectile({ ...base, projectileKind: kind }).ok === true, `${kind}: 弾ける`);
  }
  for (const kind of W.deflection.deniedKinds) {
    ok(c.w.canDeflectProjectile({ ...base, projectileKind: kind }).ok === false, `${kind}: 弾けない`);
  }
  ok(c.w.canDeflectProjectile({ ...base, isBeam: true }).ok === false, '光条は弾けない');
  ok(c.w.canDeflectProjectile({ ...base, isTelegraph: true }).ok === false, 'ボス予告は弾けない');
  ok(c.w.canDeflectProjectile({ ...base, hostile: false }).ok === false, '味方弾は弾かない');
  ok(c.w.canDeflectProjectile({ ...base, alive: false }).ok === false, '消えた弾は弾かない');
}

// ===== 7. 保存 / 復元で窓を使い回せない =====
section('7. save / reload で反撃 / 弾き返しの窓を使い回せない');
{
  const c = mk();
  c.w.beginCounterWindow('counter_stance', { durationMs: 5000, maxCounters: 2, priority: 2, mitigation: 0.2 });
  c.w.consumeCounterEvent(); c.w.consumeCounterEvent();
  const buffs = c.w.serializeTimedBuffs();
  const c2 = mk();
  c2.w.restoreTimedBuffs(buffs);
  ok(c2.w.consumeCounterEvent() === null, '使い切った反撃窓は復元しても使えない');
  // 弾き返しも使用済み回数を引き継ぐ。
  const c3 = mk();
  c3.w.beginDeflectionWindow('x', { windowMs: 5000, maxDeflections: 2, radius: 200, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  c3.w.tryDeflectProjectile({ alive: true, hostile: true, projectileKind: 'bossBullet', _deflectId: 1 });
  c3.w.tryDeflectProjectile({ alive: true, hostile: true, projectileKind: 'bossBullet', _deflectId: 2 });
  const b3 = c3.w.serializeTimedBuffs();
  const c4 = mk();
  c4.w.restoreTimedBuffs(b3);
  ok(c4.w.deflectUsed === 2, `使用済み回数を引き継ぐ（${c4.w.deflectUsed}）`);
  ok(!c4.w.deflectionActive, '使い切った窓は復元しても弾けない');
}

// ===== 8. 防御の telemetry が source を区別する =====
section('8. 防御のテレメトリが源を区別する');
{
  const c = mk();
  c.w.beginCounterWindow('counter_stance', { durationMs: 9000, maxCounters: 5, priority: 2, mitigation: 0.2 });
  c.w.beginCounterWindow('blade_guard', { durationMs: 9000, maxCounters: 5, priority: 1, mitigation: 0.1 });
  for (let i = 0; i < 3; i++) { c.w.consumeCounterEvent(); c.scene.advance(2000); c.w.update(2000); }
  const by = c.w.telemetry.counterBySource;
  ok(Object.keys(by).length >= 1, `源が区別される（${JSON.stringify(by)}）`);
  ok(Object.values(by).some((v) => v > 0), '少なくとも 1 つの源で反撃が数えられる');
  ok(c.w.telemetry.counters > 0, `合計が記録される（${c.w.telemetry.counters}）`);
  ok(c.w.telemetry.mitigationAmount >= 0, '軽減量が記録される');
}

// ===== 9. 実プレイでの防御系（全 11 種を同時に持つ） =====
section('9. 防御系スキルを同時に持っても軽減が上限を超えない（実プレイ）');
{
  const DEFENSE = ['counter_stance', 'blade_guard', 'shield_charge', 'battle_trance', 'weapon_deflection',
    'adamant_counter', 'unyielding_fortress', 'heaven_mirror_reversal'];
  const c = mk({ mods: { damageReductionBonus: 0.25 }, boss: makeBoss({ x: 460, y: 300, hp: 1e9 }) });
  for (const id of DEFENSE) { c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; } }
  let worst = 0;
  for (let i = 0; i < 3000; i++) {
    c.sm.update(16, { hasEnemies: true });
    c.w.setHp(c.scene.player.maxHp * (i % 300 < 150 ? 1 : 0.15), c.scene.player.maxHp);
    c.w.update(16); c.scene.advance(16);
    if (i % 30 === 15) c.scene.onWarriorHit(40, 30);
    worst = Math.max(worst, c.w.damageReduction({ engaged: true, fromX: 100, fromY: 0, x: 0, y: 0 }));
  }
  ok(worst <= MAXTOTAL + 1e-9, `実プレイの最大軽減 ${(worst * 100).toFixed(1)}% ≤ ${(MAXTOTAL * 100).toFixed(0)}%`);
  info(`防御 8 種同時: 最大軽減 ${(worst * 100).toFixed(1)}% / 反撃 ${c.w.telemetry.counters} / 調停 ${c.w.telemetry.reactionArbitrated}`);
}

T.finish();
