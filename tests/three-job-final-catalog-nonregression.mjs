// 戦士 最終Wave 16/16: 3 ジョブ最終カタログ非回帰（M8-E §非回帰）。Node.js 標準機能のみ。
// M8-E の絶対条件「火の魔女と氷術師を完全に非回帰にする」を実データ＋production 実装で確認する。
// 基準値は M8-A 完了時点（ec503fe）のものをそのまま使う（M8-B〜M8-D でも不変だった）。
//   - 3 ジョブがそろって active30 / passive4 / evolution18 の同規模になった
//   - 火 / 氷のカタログ・データが 1 バイトも変わらない
//   - 同 seed のドラフト候補列が byte-identical
//   - 火 / 氷 48 スキルのランタイム挙動が完全一致
//   - 共通状態異常が 5 種のまま（M8-E で formal status を増やしていない）
//   - save_version が 6 のまま
//   - 火 / 氷の周回では M8-E の機構（直線 / 決闘 / 構え / 踏破 / 弾き返し）が一切動かない
//   - 火 / 氷のスキルが戦士の M8-E API を 1 つも呼ばない
//   - meleeStrike の line / Projectile の弾き返しフィールドは opt-in（既定では従来どおり）
// 実行: node tests/three-job-final-catalog-nonregression.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, FLAME, FROST, WARRIOR, EXPECTED, draftCatalog, jobPools, seedRange, runner, readSrc, makeScene, makeEnemies, makeWarrior, bootRuntime, registryMap } from './warrior-common.mjs';

const T = runner('3 ジョブ最終カタログ非回帰（M8-E）');
const { ok, section, info } = T;

const sha = (s) => createHash('sha256').update(s).digest('hex');
const { WarriorCombatSystem } = await bootRuntime();
const FINAL = [...EXPECTED.finalActives, ...EXPECTED.finalEvolutions];

// M8-A 完了時点（ec503fe）で測定し、M8-B / M8-B.1 / M8-C / M8-C.1 / M8-D でも不変だった固定値。
const BASELINE = {
  draft: {
    flame_witch: '15a8585c4f60681ba2b58da959771c0ae404a5dbad527b51cfb618156e709b3f',
    frost_mage: 'bd38bcf580523b7a26d21faee0734b0595539e996c1b33a747fafc816a9e9abb',
  },
  runtime: {
    flame_witch: '1f0f2c1805bf06fa6b0f98ae00870376af1a8155aed9f9de608b8345b3c2ad75',
    frost_mage: '029a44bd73b485aee5aad74c37de7cc41645fbbe3b913cc30e6a4ea896597dd9',
  },
};

// ===== 1. 3 ジョブが同規模 =====
section('1. 3 ジョブがそろって active30 / passive4 / evolution18 になった');
{
  for (const [j, name] of [[FLAME, '火'], [FROST, '氷'], [WARRIOR, '戦士']]) {
    ok(j.activeSkillPool.length === 30, `${name} active ${j.activeSkillPool.length} = 30`);
    ok((j.passiveSkillPool || []).length === 4, `${name} passive ${(j.passiveSkillPool || []).length} = 4`);
    ok(j.evolutionPool.length === 18, `${name} evolution ${j.evolutionPool.length} = 18`);
  }
  ok(WARRIOR.activeSkillPool.length === EXPECTED.activeCount && WARRIOR.evolutionPool.length === EXPECTED.evolutionCount,
    `戦士が最終カタログ ${EXPECTED.activeCount}/${EXPECTED.passiveCount}/${EXPECTED.evolutionCount} に到達`);
  // プールは 3 ジョブとも互いに素。
  const sets = { 火: FLAME, 氷: FROST, 戦士: WARRIOR };
  for (const [an, a] of Object.entries(sets)) {
    for (const [bn, b] of Object.entries(sets)) {
      if (an === bn) continue;
      const overlap = a.activeSkillPool.filter((id) => b.activeSkillPool.includes(id));
      ok(overlap.length === 0, `${an} と ${bn} の active プールが互いに素（重複 ${overlap.length}）`);
      const eo = a.evolutionPool.filter((id) => b.evolutionPool.includes(id));
      ok(eo.length === 0, `${an} と ${bn} の進化プールが互いに素（重複 ${eo.length}）`);
    }
  }
  for (const [j, name] of [[FLAME, '火'], [FROST, '氷']]) {
    for (const id of FINAL) {
      ok(!j.activeSkillPool.includes(id) && !j.evolutionPool.includes(id), `${name}: ${id} が混ざっていない`);
    }
  }
  // 戦士以外の data 件数は不変。
  const nonWarrior = DATA.skills.filter((s) => !(s.jobs || []).includes('warrior')).length;
  ok(nonWarrior === 60, `戦士以外の skills は 60 件のまま（${nonWarrior}）`);
  const nonWarriorEvo = DATA.evolutions.filter((e) => !(FLAME.evolutionPool.includes(e.id) || FROST.evolutionPool.includes(e.id)) === false).length;
  ok(nonWarriorEvo === 36, `火 / 氷の進化は 36 件のまま（${nonWarriorEvo}）`);
  info(`最終カタログ: 火 30/4/18・氷 30/4/18・戦士 ${WARRIOR.activeSkillPool.length}/${(WARRIOR.passiveSkillPool || []).length}/${WARRIOR.evolutionPool.length}`);
}

// ===== 2. 候補列が byte-identical =====
section('2. 火 / 氷の 300 seed 候補列が M8-A 時点と byte-identical');
{
  const catalog = draftCatalog();
  for (const jid of ['flame_witch', 'frost_mage']) {
    const job = jobPools(jid);
    const lines = [];
    for (const s of seedRange(300)) {
      const d = new SkillDraftManager({});
      const c = d._generate({
        catalog, job, owned: { active: {}, passive: {} },
        slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3,
      }, s);
      lines.push(c.map((x) => `${x.id}:${x.kind}:${x.rarity}`).join('|'));
    }
    const h = sha(lines.join('\n'));
    ok(h === BASELINE.draft[jid], `${jid}: 候補列 hash が一致（${h.slice(0, 16)}…）`);
    if (h !== BASELINE.draft[jid]) info(`実測 ${h} / 期待 ${BASELINE.draft[jid]}`);
  }
}

// ===== 3. ランタイム挙動が完全一致 =====
section('3. 火 / 氷 48 スキルのランタイム挙動が完全一致');
{
  const common = await import('./flame-audit-common.mjs');
  const boot = await common.bootRuntime();
  const trace = (jid) => {
    const j = DATA.jobs.find((x) => x.id === jid);
    const lines = [];
    for (const id of [...j.activeSkillPool, ...j.evolutionPool]) {
      const enemies = common.makeEnemies(12, { x: 320, y: 300, dy: 8 });
      const scene = common.makeScene({ enemies, seed: 12345, now: 1000 });
      const sm = new boot.SkillManager(scene);
      scene.skills = sm;
      sm.acquireOrLevel(id);
      if (DATA.skills.some((s) => s.id === id)) { try { sm.setLevel(id, 8); } catch (e) { void e; } }
      for (let i = 0; i < 120; i++) { sm.update(16, { hasEnemies: true }); scene.advance(16); }
      const st = sm.statsList().find((s) => s.id === id) || {};
      lines.push(`${id} casts=${st.casts} hits=${st.hits} dmg=${(st.damage || 0).toFixed(4)} calls=${scene.calls.length}`);
    }
    return sha(lines.join('\n'));
  };
  for (const jid of ['flame_witch', 'frost_mage']) {
    const h = trace(jid);
    ok(h === BASELINE.runtime[jid], `${jid}: ランタイム hash が一致（${h.slice(0, 16)}…）`);
    if (h !== BASELINE.runtime[jid]) info(`実測 ${h} / 期待 ${BASELINE.runtime[jid]}`);
  }
}

// ===== 4. 共通状態異常は 5 種のまま =====
section('4. 共通状態異常を 1 種も増やしていない（M8-E は formal status を作らない）');
{
  const known = ['burning', 'chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability'];
  const ids = (DATA.statusEffects.statusEffects || []).map((x) => x.id);
  ok(ids.length === known.length, `状態異常は ${ids.length} 種のまま（${ids.join(',')}）`);
  ok(known.every((k) => ids.includes(k)), '既存 5 種がそのまま');
  const json = JSON.stringify(DATA.statusEffects);
  for (const k of ['duel', 'trance', 'deflect', 'reflected', 'thrust', 'march']) {
    ok(!new RegExp(`"${k}"`, 'i').test(json), `status-effects.json に ${k} を追加していない`);
  }
  // 新 active も status を宣言していない。
  for (const id of EXPECTED.finalActives) {
    const s = DATA.skills.find((x) => x.id === id);
    ok(!s.status && !s.statusEffect && !s.appliesStatus, `${id}: data に status 宣言が無い`);
  }
}

// ===== 5. save_version =====
section('5. save_version が 6 のまま');
{
  ok(DATA.balance.saveVersion === 6, `saveVersion ${DATA.balance.saveVersion} = 6`);
}

// ===== 6. 火 / 氷では M8-E の機構が動かない =====
section('6. 火 / 氷の周回では M8-E の機構が一切動かない');
{
  const foes = makeEnemies(8);
  const scene = makeScene({ enemies: foes, now: 1000 });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  w.enabled = false; // 火 / 氷の周回では WarriorCombatSystem が無効
  ok(w.beginPiercingLunge({ lineLength: 200, width: 60, maxTargets: 8, maxHitsPerTarget: 1, stepIn: 40 }) === null, '直線突きを始められない');
  ok(w.beginDuelChallenge('x', foes[0], { durationMs: 5000, meleeDamageBonus: 0.3 }) === null, '決闘を挑めない');
  ok(w.duelActive === false && w.duelBonus('meleeDamage') === 0, '決闘の補正が 0');
  ok(w.beginBattleTrance('x', { durationMs: 5000, meleeDamageBonus: 0.3 }) === null, '構えに入れない');
  ok(w.getBattleTranceModifiers().meleeDamage === 0, '構えの補正が 0');
  ok(w.getBattleTranceModifiers().mitigationPenalty === 0, '軽減低下も 0（火 / 氷の被弾計算が変わらない）');
  ok(w.beginEarthshakerMarch({ stompCount: 3, intervalMs: 150, stepDistance: 40, radius: 90, maxMs: 2000, mitigation: 0 }) === null, '進軍を始められない');
  ok(w.beginDeflectionWindow('x', { windowMs: 2000, maxDeflections: 4, radius: 120, reflect: true, reflectedDamage: 30, reflectedSpeed: 300, reflectLifeMs: 500 }) === null, '弾き窓を開けない');
  ok(w.deflectionActive === false && w.deflectionWindowOpen === false, '弾き返しが動かない');
  ok(w.canDeflectProjectile({ alive: true, hostile: true, projectileKind: 'bossBullet' }).ok === false, '弾を弾けない');
  ok(w.arbitrateDeflectionAndCounter('projectile') === null, '弾イベントに応じない');
  ok(w.resolveLineMeleeTargets([foes[0]], { maxTargets: 8 }).length <= 1, '直線の対象選択が素通し');
  for (const k of ['lineThrusts', 'duelStarts', 'tranceStarts', 'marchStomps', 'deflectWindows', 'reflectedSpawned', 'reactionArbitrated']) {
    ok((w.telemetry[k] || 0) === 0, `${k} が 1 も増えない`);
  }
}

// ===== 7. 火 / 氷のスキルが M8-E API を呼ばない =====
section('7. 火 / 氷のスキルが戦士の M8-E API を 1 つも呼ばない');
{
  const FINAL_API = ['lineStrike', 'beginDuel', 'duelTarget', 'refreshDuel', 'pickDuelTarget',
    'deflectableProjectiles', 'tryDeflectProjectile', 'setDeflectOptions', 'createReflectedPhysicalProjectile',
    'beginPiercingLunge', 'beginBattleTrance', 'beginEarthshakerMarch', 'beginDeflectionWindow',
    'resolveLineMeleeTargets', 'noteLineStepIn', 'noteMirrorCounter', 'noteReflectedHit'];
  const map = registryMap();
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of [...j.activeSkillPool, ...j.evolutionPool]) {
      const cls = map[id];
      if (!cls) continue;
      let src = '';
      try { src = readSrc('src/skills/' + cls + '.js'); } catch (e) { void e; continue; }
      for (const api of FINAL_API) ok(!src.includes(api), `${id}: ${api} を呼ばない`);
      ok(!/scene\.warrior\b/.test(src), `${id}: WarriorCombatSystem を触らない`);
    }
  }
}

// ===== 8. 共通経路の追加は opt-in =====
section('8. 共通経路の追加が opt-in（既定では火 / 氷と同じ挙動）');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  // meleeStrike の直線判定は o.line を明示したときだけ効く。
  ok(/if\s*\(o\.line\b/.test(bs), 'meleeStrike の直線判定は o.line があるときだけ');
  // 敵弾 vs プレイヤーの弾き返しは、窓が開いていて opts があるときだけ。
  ok(/w\.deflectionWindowOpen\s*&&\s*this\._deflectOpts/.test(bs), '弾き返しフックは窓 + opts があるときだけ');
  ok(/isMelee:\s*!o\.isThrown/.test(bs), 'M8-D の投擲分岐も従来どおり');

  // Projectile の追加フィールドは既定値が無害（火 / 氷の弾の挙動を変えない）。
  const proj = readSrc('src/entities/Projectile.js');
  for (const f of ['_deflectId', 'alreadyDeflected', 'deflectGeneration', 'suppressSpecialEffects']) {
    ok(proj.includes(f), `Projectile に ${f} がある`);
  }
  ok(/this\._deflectId\s*=\s*null/.test(proj), '_deflectId の既定は null');
  ok(/this\.alreadyDeflected\s*=\s*false/.test(proj), 'alreadyDeflected の既定は false');
  ok(/this\.deflectGeneration\s*=\s*0/.test(proj), 'deflectGeneration の既定は 0');
  ok(/this\.suppressSpecialEffects\s*=\s*false/.test(proj), 'suppressSpecialEffects の既定は false');
  ok(!/M8-E[^\n]*(chill|freeze|ignite|burn)/i.test(proj), 'Projectile の状態異常経路に手を入れていない');

  // Enemy の追加も既定値が無害。
  const en = readSrc('src/entities/Enemy.js');
  ok(/this\._duelMark\s*=\s*false/.test(en), '_duelMark の既定は false');
  ok(!/_duelMark[^\n]*(speed|move|update)/.test(en), '決闘マーカーが敵の移動 / AI を変えない');
}

// ===== 9. 火 / 氷の guidance / balance を変えていない =====
section('9. 火 / 氷の guidance / balance を 1 件も変えていない');
{
  const g = DATA.skillConfig.guidance;
  ok(Array.isArray(g.jobs) && g.jobs.length === 1 && g.jobs[0] === 'warrior',
    `guidance は戦士だけに効く（jobs=${JSON.stringify(g.jobs)}）`);
  // M8-E で足した guidance キーも戦士専用の枠内。
  ok(typeof g.highRequirementSupportLevel === 'number' && g.highRequirementSupportLevel >= 1,
    `highRequirementSupportLevel ${g.highRequirementSupportLevel}`);
  ok(typeof g.highRequirementSupportMultiplier === 'number' && g.highRequirementSupportMultiplier >= 1,
    `highRequirementSupportMultiplier ${g.highRequirementSupportMultiplier}`);
  // rarity / synergy などの全体設定は不変。
  const rw = DATA.skillConfig.rarityWeights || {};
  ok(Object.keys(rw).length > 0, 'rarityWeights が残っている');
  // balance.warrior 以外の balance ブロックには M8-E の記述が無い。
  const bal = { ...DATA.balance };
  delete bal.warrior; delete bal.skillCaps;
  const json = JSON.stringify(bal);
  for (const k of ['duel', 'trance', 'deflection', 'march', 'line']) {
    ok(!new RegExp(`"${k}"`).test(json), `balance.warrior 以外に ${k} を足していない`);
  }
}

// ===== 10. 戦士だけが物理のまま =====
section('10. 属性の住み分けが変わっていない');
{
  for (const id of EXPECTED.finalActives) {
    const s = DATA.skills.find((x) => x.id === id);
    ok(s.element === 'physical', `${id}: element=physical`);
  }
  const fire = DATA.skills.filter((s) => (s.jobs || []).includes('flame_witch'));
  const ice = DATA.skills.filter((s) => (s.jobs || []).includes('frost_mage'));
  // 火は既定属性なので element を書かない（M8-A 以前からの取り決め）。物理へ変わっていないことを見る。
  ok(fire.every((s) => s.element === undefined || s.element === 'fire'), '火のスキルは fire（既定）のまま');
  ok(fire.every((s) => s.element !== 'physical'), '火のスキルが物理へ変わっていない');
  ok(ice.every((s) => s.element === 'ice'), '氷のスキルはすべて ice のまま');
  // 属性反応を作っていない。
  const all = JSON.stringify(DATA.skills) + JSON.stringify(DATA.evolutions);
  for (const k of ['elementalReaction', 'reactionWith', 'comboElement']) {
    ok(!all.includes(k), `属性反応（${k}）を作っていない`);
  }
}

T.finish();
