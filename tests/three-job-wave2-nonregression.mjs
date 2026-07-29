// 戦士 Wave2 21/21: 3 ジョブ非回帰（M8-D §非回帰）。Node.js 標準機能のみ。
// M8-D の絶対条件「火の魔女と氷術師を完全に非回帰にする」を実データ＋production 実装で確認する。
// 基準値は M8-A 完了時点（ec503fe）のものをそのまま使う。
//   - 火 / 氷のカタログ規模・データが 1 バイトも変わらない
//   - 同 seed のドラフト候補列が byte-identical
//   - 火 / 氷 48 スキルのランタイム挙動が完全一致
//   - 共通状態異常が 5 種のまま（M8-D で formal status を増やしていない）
//   - save_version が 6 のまま
//   - 火 / 氷の周回では Wave2 の機構（打ち上げ / 前面防御 / 掴み / 陣 / 低 HP）が一切動かない
//   - 火 / 氷のスキルが戦士の Wave2 API を 1 つも呼ばない
//   - Player.takeDamage の第 2 引数（被弾方向）は任意で、渡さなければ挙動が変わらない
// 実行: node tests/three-job-wave2-nonregression.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, FLAME, FROST, WARRIOR, EXPECTED, draftCatalog, jobPools, seedRange, runner, readSrc, makeScene, makeEnemies, makeWarrior, bootRuntime } from './warrior-common.mjs';

const T = runner('3 ジョブ非回帰（M8-D Wave2）');
const { ok, section, info } = T;

const sha = (s) => createHash('sha256').update(s).digest('hex');
const { WarriorCombatSystem } = await bootRuntime();

// M8-A 完了時点（ec503fe）で測定し、M8-B / M8-B.1 / M8-C / M8-C.1 でも不変だった固定値。
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

// ===== 1. カタログ規模 =====
section('1. 火 / 氷のカタログ規模が M8-D で変わっていない');
{
  for (const [j, name] of [[FLAME, '火'], [FROST, '氷']]) {
    ok(j.activeSkillPool.length === 30, `${name} active ${j.activeSkillPool.length} = 30`);
    ok(j.passiveSkillPool.length === 4, `${name} passive ${j.passiveSkillPool.length} = 4`);
    ok(j.evolutionPool.length === 18, `${name} evolution ${j.evolutionPool.length} = 18`);
    for (const id of [...EXPECTED.wave2Actives, ...EXPECTED.wave2Evolutions]) {
      ok(!j.activeSkillPool.includes(id) && !j.evolutionPool.includes(id), `${name}: ${id} が混ざっていない`);
    }
  }
  // 戦士の規模は Milestone ごとに増える（M8-D 25/13 → M8-E 30/18）。正は EXPECTED。
  ok(WARRIOR.activeSkillPool.length === EXPECTED.activeCount && WARRIOR.evolutionPool.length === EXPECTED.evolutionCount,
    `戦士だけが ${EXPECTED.activeCount}/${EXPECTED.evolutionCount} へ増えている`);
  // 戦士以外の data 件数は不変。
  const nonWarrior = DATA.skills.filter((s) => !(s.jobs || []).includes('warrior')).length;
  ok(nonWarrior === 60, `戦士以外の skills は 60 件のまま（${nonWarrior}）`);
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
section('4. 共通状態異常を 1 種も増やしていない（M8-D は formal status を作らない）');
{
  const known = ['burning', 'chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability'];
  const ids = (DATA.statusEffects.statusEffects || []).map((x) => x.id);
  ok(ids.length === known.length, `状態異常は ${ids.length} 種のまま（${ids.join(',')}）`);
  ok(known.every((k) => ids.includes(k)), '既存 5 種がそのまま');
  const json = JSON.stringify(DATA.statusEffects);
  for (const k of ['launch', 'airborne', 'grabbed', 'frontGuard', 'rally', 'banner']) {
    ok(!new RegExp(`"${k}"`, 'i').test(json), `status-effects.json に ${k} を追加していない`);
  }
}

// ===== 5. save_version =====
section('5. save_version が 6 のまま');
{
  ok(DATA.balance.saveVersion === 6, `saveVersion ${DATA.balance.saveVersion} = 6`);
}

// ===== 6. 火 / 氷では Wave2 の機構が動かない =====
section('6. 火 / 氷の周回では Wave2 の機構が一切動かない');
{
  const scene = makeScene({ enemies: makeEnemies(8), now: 1000 });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  w.enabled = false; // 火 / 氷の周回では WarriorCombatSystem が無効
  ok(w.launchPolicy({ alive: true }).launched === false, '打ち上げが成立しない');
  ok(w.beginFrontGuard('x', { durationMs: 900, mitigation: 0.4, frontArc: 1.4, facing: 0 }) === null, '前面防御が張れない');
  ok(w.frontGuardMitigation({ fromX: 1, fromY: 0, x: 0, y: 0 }) === 0, '前面軽減が乗らない');
  ok(w.grabPolicy({ alive: true }).canGrab === false, '掴めない');
  ok(w.beginGrab('x', 1) === null, '掴みを開始できない');
  ok(w.placeRallyField('x', { x: 0, y: 0, durationMs: 5000, radius: 100, meleeArea: 0.2 }) === null, '陣が張れない');
  ok(w.rallyBonus('meleeArea') === 0, '陣の補正が 0');
  ok(w.lowHpDamageMultiplier(1) === 1, '低 HP 補正が 1（恒等）');
  ok(w.refillComboGrace(1) === 0, 'コンボ猶予も戻らない');
  for (const k of ['launches', 'grabs', 'rallyPlacements', 'frontGuardBlocked', 'stepIns', 'axeOutboundHits']) {
    ok((w.telemetry[k] || 0) === 0, `${k} が 1 も増えない`);
  }
}

// ===== 7. 火 / 氷のスキルが Wave2 API を呼ばない =====
section('7. 火 / 氷のスキルが戦士の Wave2 API を 1 つも呼ばない');
{
  const WAVE2_API = ['launchTarget', 'grabTarget', 'throwGrabbed', 'releaseGrab', 'grabbedTarget', 'thrownStrike',
    'beginFrontGuard', 'placeRallyField', 'lowHpDamageMultiplier', 'noteThrowImpact', 'noteGuardTick', 'noteAxeHit', 'noteStepIn'];
  const map = (await import('./warrior-common.mjs')).registryMap();
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of [...j.activeSkillPool, ...j.evolutionPool]) {
      const cls = map[id];
      if (!cls) continue;
      let src = '';
      try { src = readSrc('src/skills/' + cls + '.js'); } catch (e) { void e; continue; }
      for (const api of WAVE2_API) ok(!src.includes(api), `${id}: ${api} を呼ばない`);
      ok(!/scene\.warrior\b/.test(src), `${id}: WarriorCombatSystem を触らない`);
    }
  }
}

// ===== 8. takeDamage の第 2 引数は任意 =====
section('8. Player.takeDamage の被弾方向は任意（渡さなければ挙動が変わらない）');
{
  const src = readSrc('src/entities/Player.js');
  ok(/takeDamage\s*\(\s*amount\s*,\s*from\s*\)/.test(src), 'takeDamage(amount, from) の第 2 引数が任意');
  ok(!/takeDamage\s*\(\s*amount\s*,\s*from\s*=\s*\{/.test(src), '第 2 引数に既定オブジェクトを作っていない（火 / 氷で余計な処理をしない）');
  // 方向なしでは前面軽減が乗らない＝火 / 氷の被弾計算が変わらない。
  const scene = makeScene({ enemies: makeEnemies(4), now: 1000 });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  w.beginFrontGuard('x', { durationMs: 900, mitigation: 0.5, frontArc: 3.0, facing: 0 });
  ok(w.frontGuardMitigation({}) === 0, '方向なしの被弾には前面軽減が乗らない');
  ok(DATA.balance.warrior.frontalGuard.requireDirection === true, 'balance で方向必須が宣言されている');
}

// ===== 9. 共通経路の非破壊性 =====
section('9. 共通経路（meleeStrike / Projectile / Enemy）の火 / 氷向け挙動が変わっていない');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  // 投擲は isThrown フラグでのみ分岐し、既定（未指定）では従来どおり近接扱い。
  ok(/isMelee:\s*!o\.isThrown/.test(bs), 'meleeStrike は isThrown を明示したときだけ投擲扱いになる');
  ok(/w\.meleeDamageMultiplier\(e\)\s*:\s*1/.test(bs), '近接倍率の適用条件だけを足している');
  // Projectile は M8-D で触っていない（火 / 氷の弾は完全に不変）。
  const proj = readSrc('src/entities/Projectile.js');
  ok(!/M8-D|isThrown|launch|grab|rally/.test(proj), 'Projectile に M8-D の記述が無い');
  // Enemy は残留フィールドの追加と移動抑止だけ。既定値では火 / 氷と同じ動き。
  const en = readSrc('src/entities/Enemy.js');
  ok(/_airborneUntil/.test(en), 'Enemy に打ち上げ残留がある');
  ok(/this\._grabbed\s*\|\|\s*now\s*<\s*this\._airborneUntil/.test(en),
    '移動抑止は「掴み中 or 打ち上げ中」だけ（既定値 0 / false では従来と同一）');
}

T.finish();
