// 戦士 完成監査 23/23: 3 ジョブ完成非回帰（M8-F §23 / §3）。Node.js 標準機能のみ。
// M8-F は監査と最小修正の回。**火の魔女・氷術師を 1 バイトも変えていない**ことを
// ハッシュと実装の両面で確かめる。戦士側も「カタログを増やしていない」ことを見る。
// 実行: node tests/three-job-completion-nonregression.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { capTiers } from './cap-shape.mjs';
import { DATA, FLAME, FROST, WARRIOR, EXPECTED, draftCatalog, jobPools, seedRange, registeredIds,
  makeScene, makeEnemies, makeWarrior, bootRuntime, readSrc, runner } from './warrior-common.mjs';

const T = runner('3 ジョブ完成非回帰（M8-F）');
const { ok, section, info } = T;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const { WarriorCombatSystem } = await bootRuntime();

// M8-A 完了時点（ec503fe）で測定し、M8-B〜M8-E でも不変だった固定値。
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

// ===== 1. カタログを 1 件も増やしていない =====
section('1. 3 ジョブとも 30 / 4 / 18 のまま（M8-F は新規コンテンツなし）');
{
  for (const [j, name] of [[FLAME, '火'], [FROST, '氷'], [WARRIOR, '戦士']]) {
    ok(j.activeSkillPool.length === 30, `${name} active 30（${j.activeSkillPool.length}）`);
    ok((j.passiveSkillPool || []).length === 4, `${name} passive 4`);
    ok(j.evolutionPool.length === 18, `${name} evolution 18`);
  }
  ok(DATA.skills.length === 90, `skills.json は 90 件のまま（${DATA.skills.length}）`);
  ok(DATA.evolutions.length === 54, `skill-evolutions.json は 54 件のまま（${DATA.evolutions.length}）`);
  ok(DATA.passives.length === 12, `passives.json は 12 件のまま（${DATA.passives.length}）`);
  ok(DATA.jobs.length === 3, `jobs.json は 3 ジョブのまま（${DATA.jobs.length}）`);
  ok(EXPECTED.activeCount === 30 && EXPECTED.evolutionCount === 18, 'EXPECTED も 30 / 18');
}

// ===== 2. 候補列が byte-identical =====
section('2. 火 / 氷の 300 seed 候補列が M8-A 時点と byte-identical');
{
  const catalog = draftCatalog();
  for (const jid of ['flame_witch', 'frost_mage']) {
    const job = jobPools(jid);
    const lines = seedRange(300).map((s) => {
      const d = new SkillDraftManager({});
      return d._generate({ catalog, job, owned: { active: {}, passive: {} },
        slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, s)
        .map((x) => `${x.id}:${x.kind}:${x.rarity}`).join('|');
    });
    const h = sha(lines.join('\n'));
    ok(h === BASELINE.draft[jid], `${jid}: 候補列 hash が一致（${h.slice(0, 16)}…）`);
    if (h !== BASELINE.draft[jid]) info(`実測 ${h} / 期待 ${BASELINE.draft[jid]}`);
  }
  // M8-F で足した evolvedBaseIds は「渡さなければ従来と完全に同じ」。
  for (const jid of ['flame_witch', 'frost_mage']) {
    const job = jobPools(jid);
    const gen = (extra) => sha(seedRange(120).map((s) => {
      const d = new SkillDraftManager({});
      return d._generate({ catalog, job, owned: { active: {}, passive: {} },
        slots: { active: { used: 0, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3, ...extra }, s)
        .map((x) => x.id).join(',');
    }).join('\n'));
    ok(gen({}) === gen({ evolvedBaseIds: [] }), `${jid}: evolvedBaseIds を空で渡しても候補が同じ`);
    ok(gen({}) === gen({ evolvedBaseIds: undefined }), `${jid}: 未指定でも候補が同じ`);
  }
}

// ===== 3. ランタイムが完全一致 =====
section('3. 火 / 氷 48 スキルのランタイムが M8-A 時点と完全一致');
{
  const common = await import('./flame-audit-common.mjs');
  const boot = await common.bootRuntime();
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    const lines = [];
    for (const id of [...j.activeSkillPool, ...j.evolutionPool]) {
      const enemies = common.makeEnemies(12, { x: 320, y: 300, dy: 8 });
      const scene = common.makeScene({ enemies, seed: 12345, now: 1000 });
      const sm = new boot.SkillManager(scene); scene.skills = sm;
      sm.acquireOrLevel(id);
      if (DATA.skills.some((s) => s.id === id)) { try { sm.setLevel(id, 8); } catch (e) { void e; } }
      for (let i = 0; i < 120; i++) { sm.update(16, { hasEnemies: true }); scene.advance(16); }
      const st = sm.statsList().find((s) => s.id === id) || {};
      lines.push(`${id} casts=${st.casts} hits=${st.hits} dmg=${(st.damage || 0).toFixed(4)} calls=${scene.calls.length}`);
    }
    const h = sha(lines.join('\n'));
    ok(h === BASELINE.runtime[jid], `${jid}: ランタイム hash が一致（${h.slice(0, 16)}…）`);
    if (h !== BASELINE.runtime[jid]) info(`実測 ${h} / 期待 ${BASELINE.runtime[jid]}`);
  }
}

// ===== 4. M8-F の修正が火 / 氷へ及ばない =====
section('4. M8-F の修正が火 / 氷のコードへ及んでいない');
{
  // (a) restoreCd は戦士の基底にだけある。火 / 氷は従来の生の代入のまま。
  const wb = readSrc('src/skills/WarriorSkillBase.js');
  ok(/restoreCd\s*\(value\)/.test(wb), 'restoreCd は WarriorSkillBase にある');
  const sb = readSrc('src/skills/SkillBase.js');
  ok(!/restoreCd/.test(sb), 'SkillBase には足していない（火 / 氷の restore は不変）');
  const eb = readSrc('src/skills/EvolvedSkillBase.js');
  ok(!/restoreCd/.test(eb), 'EvolvedSkillBase にも足していない');
  // (b) _dead ガードも戦士の基底だけ。
  ok(/if \(this\._dead\) return; super\.update/.test(wb), '_dead ガードは WarriorSkillBase にある');
  ok(!/_dead/.test(sb), 'SkillBase に _dead ガードを足していない');
  // (c) 火 / 氷のスキルファイルは従来の cdLeft 代入のまま（触っていない）。
  const map = (await import('./warrior-common.mjs')).registryMap();
  const warriorFiles = new Set([...EXPECTED.actives, ...EXPECTED.evolutions].map((id) => map[id]));
  let fireIceOld = 0;
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of [...j.activeSkillPool, ...j.evolutionPool]) {
      const cls = map[id];
      if (!cls || warriorFiles.has(cls)) continue;
      let src = ''; try { src = readSrc(`src/skills/${cls}.js`); } catch (e) { void e; continue; }
      ok(!/restoreCd/.test(src), `${id}: restoreCd を使っていない（従来のまま）`);
      if (/typeof (?:st|s)\.cdLeft === 'number'/.test(src)) fireIceOld++;
    }
  }
  ok(fireIceOld > 0, `火 / 氷は従来の cdLeft 代入のまま（${fireIceOld} 件）`);
}

// ===== 5. 共通経路の追加は opt-in =====
section('5. 共通経路（draft / meleeStrike / Projectile / Enemy）の追加が opt-in');
{
  const dm = readSrc('src/systems/SkillDraftManager.js');
  ok(/ctx\.evolvedBaseIds \|\| \[\]/.test(dm), 'evolvedBaseIds は未指定なら空（従来と同じ挙動）');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/if \(o\.line\b/.test(bs), 'meleeStrike の直線判定は o.line があるときだけ');
  ok(/isMelee:\s*!o\.isThrown/.test(bs), '投擲は isThrown を明示したときだけ');
  ok(/w\.deflectionWindowOpen\s*&&\s*this\._deflectOpts/.test(bs), '弾き返しは窓 + opts があるときだけ');
  const proj = readSrc('src/entities/Projectile.js');
  for (const [f, def] of [['_deflectId', 'null'], ['alreadyDeflected', 'false'], ['deflectGeneration', '0'], ['suppressSpecialEffects', 'false']]) {
    ok(new RegExp(`this\\.${f}\\s*=\\s*${def}`).test(proj), `Projectile.${f} の既定は ${def}（無害）`);
  }
  const en = readSrc('src/entities/Enemy.js');
  ok(/this\._duelMark = false/.test(en), 'Enemy._duelMark の既定は false');
}

// ===== 6. 火 / 氷の周回では戦士の機構が動かない =====
section('6. 火 / 氷の周回では戦士の全機構が動かない');
{
  const foes = makeEnemies(8, { hp: 1e9 });
  const scene = makeScene({ enemies: foes, now: 1000 });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  w.enabled = false;
  ok(w.addFury(1000, 'meleeHit', null) === 0, '闘気が増えない');
  ok(w.addCombo(10, null) === 0 || w.combo === 0, 'コンボが増えない');
  ok(w.beginPiercingLunge({ lineLength: 200, width: 60, maxTargets: 8, maxHitsPerTarget: 1, stepIn: 40 }) === null, '直線突きが始まらない');
  ok(w.beginDuelChallenge('x', foes[0], { durationMs: 5000, meleeDamageBonus: 0.3 }) === null, '決闘が始まらない');
  ok(w.beginBattleTrance('x', { durationMs: 5000, meleeDamageBonus: 0.3 }) === null, '構えに入れない');
  ok(w.beginEarthshakerMarch({ stompCount: 3, intervalMs: 150, stepDistance: 40, radius: 90, maxMs: 2000, mitigation: 0 }) === null, '進軍が始まらない');
  ok(w.beginDeflectionWindow('x', { windowMs: 2000, maxDeflections: 4, radius: 120, reflect: true, reflectedDamage: 30, reflectedSpeed: 300, reflectLifeMs: 500 }) === null, '弾き窓が開かない');
  ok(w.beginCounterWindow('x', { durationMs: 2000, maxCounters: 3, priority: 2, mitigation: 0.2 }) === null, '反撃窓が開かない');
  ok(w.beginFrontGuard('x', { durationMs: 900, mitigation: 0.4, frontArc: 1.4, facing: 0 }) === null, '前面防御が張れない');
  ok(w.placeRallyField('x', { x: 0, y: 0, durationMs: 5000, radius: 100, meleeArea: 0.2 }) === null, '陣が張れない');
  ok(w.launchPolicy(foes[0]).launched === false, '打ち上げが成立しない');
  ok(w.grabPolicy(foes[0]).canGrab === false, '掴めない');
  ok(w.executePolicy(foes[0], { thresholdNormal: 0.9 }).canExecute === false, '処刑できない');
  ok(w.applyPoiseDamage(foes[0], 1e9) === null, '体勢が動かない');
  ok(w.damageReduction({ engaged: true }) === 0, '軽減が 0');
  ok(w.meleeDamageMultiplier(foes[0]) === 1, 'ダメージ倍率が恒等');
  ok(w.checkUnyielding() === false, '不屈が発動しない');
  ok(w.lowHpDamageMultiplier(1) === 1, '低 HP 補正が恒等');
  for (const k of Object.keys(w.telemetry)) {
    const v = w.telemetry[k];
    if (typeof v === 'number') ok(v === 0 || k === '_lastReleaseAt', `${k}: テレメトリが 0`);
  }
}

// ===== 7. 状態異常 / cap / guidance の非回帰 =====
section('7. 共通状態異常 5 種・skillCaps の火 / 氷ぶん・guidance が不変');
{
  const ids = (DATA.statusEffects.statusEffects || []).map((x) => x.id);
  ok(ids.length === 5, `共通状態異常は 5 種のまま（${ids.join(',')}）`);
  ok(DATA.balance.saveVersion === 6, 'save_version は v6 のまま');
  const g = DATA.skillConfig.guidance;
  ok(Array.isArray(g.jobs) && g.jobs.length === 1 && g.jobs[0] === 'warrior', 'guidance は戦士だけに効く');
  // M8-F で guidance の値を 1 つも変えていない（M8-E の値のまま）。
  const EXPECT_G = { ownedBaseUpgradeWeightMultiplier: 1.8, nearMaxRemainingLevels: 3, baseNearMaxBonusMultiplier: 1.7,
    supportReadyBaseMultiplier: 1.5, requiredSupportWeightMultiplier: 1.3, nearRequiredRemainingLevels: 1,
    supportNearRequiredMultiplier: 1.2, activeSupportWeightMultiplier: 1.6,
    highRequirementSupportLevel: 6, highRequirementSupportMultiplier: 1.5 };
  for (const [k, v] of Object.entries(EXPECT_G)) ok(g[k] === v, `guidance.${k} = ${v}（変更なし）`);
  // 火 / 氷が使う cap の形が保たれている。
  const FIRE_ICE = ['maxFlameLances', 'maxHomingWisps', 'maxSummons', 'maxActiveVortices', 'maxMarks',
    'maxActiveBeams', 'maxMines', 'maxClones', 'maxInfernoBlades'].filter((k) => DATA.balance.skillCaps[k]);
  ok(FIRE_ICE.length >= 8, `火 / 氷の cap を確認できる（${FIRE_ICE.length} 件）`);
  for (const k of FIRE_ICE) {
    const c = capTiers(DATA.balance.skillCaps[k]);
    ok(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra && c.low > 0, `${k}: 形が保たれている`);
  }
}

// ===== 8. catalog issue 0 =====
section('8. 3 ジョブとも catalog issue 0');
{
  const IDS = registeredIds();
  for (const jid of ['flame_witch', 'frost_mage', 'warrior']) {
    const c = buildCatalog({ skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions,
      jobs: DATA.jobs, jobId: jid, registeredIds: IDS, runtimeStateIds: IDS });
    ok((c.issues || []).length === 0, `${jid}: issue 0 件（${(c.issues || []).join(' / ')}）`);
    ok(c.actives.length === 30 && c.evolutions.length === 18, `${jid}: 30 / 18`);
  }
}

// ===== 9. M8-F で変えた data は戦士だけ =====
section('9. M8-F で変えた data が戦士の範囲に収まっている');
{
  // balance.warrior へ足したのは rally.maxRadius / counter.maxCountersPerWindow / counter.maxWindowMs の 3 キーだけ。
  ok(DATA.balance.warrior.rally.maxRadius > 0, `rally.maxRadius を追加（${DATA.balance.warrior.rally.maxRadius}）`);
  ok(DATA.balance.warrior.counter.maxCountersPerWindow > 0, `counter.maxCountersPerWindow を追加（${DATA.balance.warrior.counter.maxCountersPerWindow}）`);
  ok(DATA.balance.warrior.counter.maxWindowMs > 0, `counter.maxWindowMs を追加（${DATA.balance.warrior.counter.maxWindowMs}）`);
  // 火 / 氷の balance ブロックへは何も足していない。
  const bal = { ...DATA.balance };
  delete bal.warrior; delete bal.skillCaps;
  const json = JSON.stringify(bal);
  for (const k of ['maxRadius', 'maxCountersPerWindow', 'maxWindowMs', 'duel', 'trance', 'deflection']) {
    ok(!new RegExp(`"${k}"`).test(json), `balance.warrior 以外に ${k} を足していない`);
  }
  // 火 / 氷のスキル data は 1 件も変えていない（rarity / levels の件数で確認）。
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of j.activeSkillPool) {
      const s = DATA.skills.find((x) => x.id === id);
      ok(s.maxLevel === 8 && (s.levels || []).length === 8, `${id}: Lv1〜8 のまま`);
    }
  }
}

T.finish();
