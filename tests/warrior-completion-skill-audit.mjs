// 戦士 完成監査 5/23: SkillAudit 全 48 件（M8-F §8）。Node.js 標準機能のみ。
// active30 + evolution18 を共通フォーマットで監査する。regex だけに頼らず、
// production の SkillAudit / CastPolicy / SkillManager を直接駆動して実測する。
// 実行: node tests/warrior-completion-skill-audit.mjs

import { readFileSync } from 'node:fs';
import { castSummary, echoStatus, cloneStatus, appliesLv80ProjectileCount, primaryTags, CAST_MODES, ATTACK_CAST_MODES } from '../src/systems/SkillAudit.js';
import { resolveCastMeta } from '../src/systems/CastPolicy.js';
import { DATA, WARRIOR, EXPECTED, registryMap, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, readSrc, runner } from './warrior-common.mjs';

const T = runner('戦士 SkillAudit 全 48 件（M8-F）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const MAP = registryMap();
const ALL = [
  ...WARRIOR.activeSkillPool.map((id) => ({ id, kind: 'active', def: DATA.skills.find((s) => s.id === id) })),
  ...WARRIOR.evolutionPool.map((id) => ({ id, kind: 'evolution', def: DATA.evolutions.find((e) => e.id === id) })),
];
const issues = [];
const note = (id, m) => issues.push(`${id}: ${m}`);
const srcOf = (id) => { try { return readFileSync(`src/skills/${MAP[id]}.js`, 'utf8'); } catch { return ''; } };
// 進化は基礎クラスを継承して data の読み先だけを差し替える形が多いので、
// 「実装が何を通しているか」を見るときは基礎クラスの本体も合わせて読む。
const deepSrcOf = (id) => {
  const e = DATA.evolutions.find((x) => x.id === id);
  return srcOf(id) + (e && e.baseSkillId ? srcOf(e.baseSkillId) : '');
};

const build = () => {
  const enemies = [...makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 }), ...makeEnemies(3, { x: 360, y: 300, dx: 8, hp: 1e9, elite: true })];
  const scene = makeScene({ enemies, boss: makeBoss({ x: 470, y: 300, hp: 1e9 }), now: 10000, quality: 'high', enemyBullets: [] });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    c.sm.update(step, { hasEnemies: true });
    c.w.setHp(c.scene.player.maxHp * (i % 300 < 150 ? 1 : 0.2), c.scene.player.maxHp);
    c.w.update(step); c.scene.advance(step);
  }
};

ok(ALL.length === 48, `監査対象 ${ALL.length} 件 = 30 + 18`);

// ===== 1. メタデータ =====
section('1. id / class / data / job / rarity / category / castMode / mainCastEvent');
for (const { id, kind, def } of ALL) {
  ok(!!def, `${id}: data がある`);
  ok(!!MAP[id], `${id}: 実装クラスが登録されている`);
  ok(CAST_MODES.includes(def.castMode), `${id}: castMode=${def.castMode} が既知`);
  if (ATTACK_CAST_MODES.includes(def.castMode)) ok(!!def.mainCastEvent, `${id}: 攻撃系は mainCastEvent を持つ`);
  if (kind === 'active') {
    ok(['common', 'uncommon', 'rare', 'legendary'].includes(def.rarity), `${id}: rarity=${def.rarity}`);
    ok((def.jobs || []).length === 1 && def.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
    ok(def.isCommon === false, `${id}: isCommon=false`);
    ok(def.maxLevel === 8, `${id}: maxLevel=8`);
    ok(def.element === 'physical', `${id}: element=physical`);
    ok(Array.isArray(def.tags) && def.tags.length > 0, `${id}: tags がある（${(def.tags || []).join('/')}）`);
  } else {
    ok(def.visualTier === 'evolved', `${id}: visualTier=evolved`);
    ok(def.replacementSkillId === id, `${id}: replacementSkillId が自身`);
  }
}

// ===== 2. echo / clone / Lv80 =====
section('2. echoPolicy / clonePolicy / canTriggerEcho / canBeCopiedByClone / Lv80');
for (const { id, def } of ALL) {
  const meta = resolveCastMeta(def);
  ok(meta.echoPolicy === (def.echoPolicy || 'standard'), `${id}: echoPolicy 解決が data と一致`);
  ok(meta.clonePolicy === (def.clonePolicy || 'standard'), `${id}: clonePolicy 解決が data と一致`);
  // 戦士は残響 / 分身の対象外（無料の近接攻撃を増やさない）。
  ok(def.echoPolicy === 'forbidden', `${id}: echoPolicy=forbidden`);
  ok(def.clonePolicy === 'forbidden', `${id}: clonePolicy=forbidden`);
  ok(def.canTriggerEcho === false, `${id}: canTriggerEcho=false`);
  ok(def.canBeCopiedByClone === false, `${id}: canBeCopiedByClone=false`);
  ok(echoStatus(def) === '非対応', `${id}: 残響非対応`);
  ok(cloneStatus(def) === '複製不可', `${id}: 複製不可`);
  ok(appliesLv80ProjectileCount(def) === (def.lv80ProjectileTarget === true), `${id}: Lv80 判定が明示 flag と一致`);
  ok(Array.isArray(castSummary(def).tags) && Array.isArray(primaryTags(def)), `${id}: castSummary / primaryTags が使える`);
  // 実装側に echoCast / cloneCast が無い（無料発動の入口が無い）。
  const s = srcOf(id);
  ok(!/echoCast\s*\(/.test(s), `${id}: echoCast を実装していない`);
  ok(!/cloneCast\s*\(/.test(s), `${id}: cloneCast を実装していない`);
}
{
  const lv80 = ALL.filter((x) => appliesLv80ProjectileCount(x.def)).map((x) => x.id).sort();
  ok(lv80.join(',') === EXPECTED.lv80Targets.slice().sort().join(','), `Lv80 対象はちょうど 6 種（${lv80.join(',')}）`);
}

// ===== 3. runtimeState / serialize / restore =====
section('3. runtimeState / serializeState / restoreState / cooldown 保存');
for (const { id } of ALL) {
  const c = build(); c.sm.acquireOrLevel(id);
  const sk = c.sm.skills.get(id);
  ok(typeof sk.serializeState === 'function' && typeof sk.restoreState === 'function', `${id}: serialize / restore を持つ`);
  const s = sk.serializeState();
  ok(s && typeof s.cdLeft === 'number', `${id}: cdLeft を保存する`);
  ok(typeof sk.restoreCd === 'function', `${id}: 共通の restoreCd を持つ（保存値のクランプが 1 か所）`);
  sk.restoreCd(1234); ok(sk._cd === 1234, `${id}: restoreCd が効く`);
}

// ===== 4. tags / 物理 =====
section('4. damageTags が物理であり火 / 氷の属性経路へ入らない');
for (const { id, kind, def } of ALL) {
  const s = deepSrcOf(id);
  ok(!/'fire'|'ice'|chillAmount|freezeChance|igniteMs/.test(s), `${id}: 火 / 氷の属性経路を使わない`);
  if (kind === 'active') {
    const tags = def.tags || [];
    ok(tags.includes('melee') || tags.includes('physical') || tags.includes('buff') || tags.includes('defensive')
      || tags.includes('stance') || tags.includes('deflect') || tags.includes('thrown') || tags.includes('movement'),
    `${id}: 近接 / 物理 / 防御 / 構え系の tag を持つ（${tags.join('/')}）`);
  }
  // meleeStrike / lineStrike / thrownStrike のいずれかを通す（Scene の内部を直接触らない）。
  const usesCombat = /combat\.(meleeStrike|lineStrike|thrownStrike|damageArea)/.test(s)
    || /combat\.(beginDuel|tryDeflectProjectile|launchTarget|grabTarget|throwGrabbed)/.test(s)
    || /warrior\.(begin|note|apply)/.test(s);
  ok(usesCombat, `${id}: 共通経路（combat / warrior API）を通す`);
}

// ===== 5. PoolManager / SpatialGrid / 全敵総当たり禁止 =====
section('5. PoolManager / SpatialGrid（全敵総当たりをしない）');
for (const { id } of ALL) {
  const s = deepSrcOf(id);
  ok(!/forEachActive\(/.test(s), `${id}: enemyPool.forEachActive を使わない`);
  ok(!/enemyPool|projPool|bossBulletPool|gemPool/.test(s), `${id}: プールを直接触らない`);
  ok(!/this\.scene\.enemies\b/.test(s), `${id}: 敵配列を直接走査しない`);
}
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/targetsInRadius/.test(bs) && /SpatialGrid|_grid/.test(bs), '近接判定は SpatialGrid 経由（BattleScene 側）');
}

// ===== 6. 対象選択 =====
section('6. エリート / ボスの可否は共通経路が決める（スキルは自前で決めない）');
{
  // 「読む」ことは許す（優先度・引き寄せ距離・表示の材料）。禁じるのは**可否そのものを決める**こと。
  // それを regex ではなく実測で確かめる: 可否 API が false を返す限り、どのスキルも
  // エリート / ボスを打ち上げ・掴み・処刑できない。
  const c = build();
  const w = c.w;
  const elite = makeEnemies(1, { x: 420, y: 300, hp: 1e9, elite: true })[0];
  const boss = makeBoss({ x: 440, y: 300, hp: 1e9 });
  ok(w.launchPolicy(elite).launched === false && w.launchPolicy(boss).launched === false, 'launchPolicy がエリート / ボスを拒否');
  ok(w.grabPolicy(elite).canGrab === false && w.grabPolicy(boss).canGrab === false, 'grabPolicy がエリート / ボスを拒否');
  elite.hp = 1; elite.maxHp = 1000; boss.hp = 1; boss.maxHp = 1000;
  ok(w.executePolicy(elite, { thresholdNormal: 0.9 }).canExecute === false, 'executePolicy がエリートを拒否');
  ok(w.executePolicy(boss, { thresholdNormal: 0.9 }).canExecute === false, 'executePolicy がボスを拒否');
  // 全 48 件を通しても、エリート / ボスが打ち上がったり掴まれたりしない。
  const c2 = build();
  for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool]) { c2.sm.acquireOrLevel(id); try { c2.sm.setLevel(id, 8); } catch (e) { void e; } }
  run(c2, 20000);
  const tough = c2.enemies.filter((e) => e.isElite);
  ok(tough.every((e) => !(e._airborneUntil > 0)), 'エリートが 1 度も浮かない');
  ok(tough.every((e) => e._grabbed !== true), 'エリートが 1 度も掴まれない');
  ok(!(c2.scene.boss._airborneUntil > 0) && c2.scene.boss._grabbed !== true, 'ボスが浮かず掴まれない');
  ok(c2.w.telemetry.launchBlocked > 0 || c2.w.telemetry.grabRefused > 0, '拒否がテレメトリに残る');
  // 参照しているスキルは note として記録する（可否ではなく材料としての参照）。
  for (const { id } of ALL) {
    if (/\.isBoss\b|\.isElite\b/.test(deepSrcOf(id))) note(id, 'isElite / isBoss を参照する（優先度・距離・表示の材料。可否は共通経路が決める）');
  }
}

// ===== 7. cleanup / destroy =====
section('7. destroy と破棄後の停止（実測）');
for (const { id } of ALL) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 4000);
  const sk = c.sm.skills.get(id);
  ok(typeof sk.destroy === 'function', `${id}: destroy がある`);
  sk.destroy();
  ok(sk.dead === true, `${id}: destroy で破棄済みフラグが立つ`);
  const before = c.scene.calls.length;
  for (let i = 0; i < 400; i++) { sk.update(16, { hasEnemies: true }); c.scene.advance(16); }
  ok(c.scene.calls.length === before, `${id}: 破棄後に 1 件も動かない（+${c.scene.calls.length - before}）`);
}

// ===== 8. telemetry 接続 =====
section('8. telemetry へ接続している（実測で cast か damage が記録される）');
for (const { id } of ALL) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 12000);
  const s = c.sm.statsList().find((x) => x.id === id) || {};
  ok((s.casts || 0) > 0, `${id}: cast が記録される（${s.casts}）`);
  const hasEffect = (s.damage || 0) > 0 || (s.hits || 0) > 0 || Object.keys(s.extra || {}).length > 0;
  ok(hasEffect, `${id}: 何らかの効果が記録される（damage / hits / extra）`);
}

// ===== 9. data フィールドの参照 =====
section('9. data の levels / config / safetyCaps が実装から参照される');
for (const { id, kind, def } of ALL) {
  const s = srcOf(id) + (kind === 'evolution' ? srcOf(def.baseSkillId) : '');
  const keys = new Set();
  if (kind === 'active') {
    for (const lv of def.levels || []) for (const k of Object.keys(lv)) keys.add(k);
    for (const k of Object.keys(def.config || {})) keys.add(k);
  } else {
    for (const k of Object.keys(def.safetyCaps || {})) keys.add(k);
  }
  const unref = [...keys].filter((k) => !s.includes(k) && !readSrc('src/systems/WarriorCombatSystem.js').includes(k)
    && !readSrc('src/scenes/BattleScene.js').includes(k) && !readSrc('src/skills/WarriorSkillBase.js').includes(k)
    && !readSrc('src/skills/SkillBase.js').includes(k) && !readSrc('src/skills/EvolvedSkillBase.js').includes(k));
  ok(unref.length === 0, `${id}: 未参照の data フィールド 0 件（${unref.join(',') || 'なし'}）`);
}

// ===== 10. 監査結果 =====
section('10. 監査結果');
info(`意図的な仕様として残す note: ${issues.length} 件`);
for (const i of issues) info('  ' + i);
ok(true, 'SkillAudit 全 48 件を完了（未解決 issue は 0・上記は意図した仕様）');

T.finish();
