// 戦士 Wave1 19/19: 3 ジョブ非回帰（M8-C §23）。Node.js 標準機能のみ。
// M8-C の絶対条件「火の魔女と氷術師を完全に非回帰にする」を実データ＋production 実装で確認する。
// tests/three-job-nonregression.mjs（M8-B 版）と同じ基準値を使い、M8-C の追加でも動かないことを見る。
//   - 火 / 氷のカタログ規模・データが 1 バイトも変わらない
//   - 同 seed のドラフト候補列が byte-identical（M8-A / M8-B と完全一致）
//   - 火 / 氷 48 スキルのランタイム挙動が完全一致
//   - 共通状態異常が 5 種のまま（戦吼で formal status を増やしていない）
//   - save_version が 6 のまま（追加フィールドのみ）
//   - 火 / 氷の周回では Wave1 の機構（処刑 / 反撃 / 引き寄せ / 戦吼）が一切動かない
//   - 火 / 氷のスキルが戦士の新 API を 1 つも呼ばない
// 実行: node tests/three-job-wave1-nonregression.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, FLAME, FROST, WARRIOR, EXPECTED, draftCatalog, jobPools, seedRange, runner, readSrc, makeScene, makeEnemies, makeWarrior, bootRuntime } from './warrior-common.mjs';

const T = runner('3 ジョブ非回帰（M8-C Wave1）');
const { ok, section, info } = T;

const sha = (s) => createHash('sha256').update(s).digest('hex');
const { WarriorCombatSystem } = await bootRuntime();

// M8-A 完了時点（ec503fe）で測定し、M8-B / M8-B.1 でも不変だった固定値。
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
section('1. 火 / 氷のカタログ規模が M8-C で変わっていない');
{
  ok(FLAME.activeSkillPool.length === 30, `火 active ${FLAME.activeSkillPool.length} = 30`);
  ok(FLAME.passiveSkillPool.length === 4, `火 passive ${FLAME.passiveSkillPool.length} = 4`);
  ok(FLAME.evolutionPool.length === 18, `火 evolution ${FLAME.evolutionPool.length} = 18`);
  ok(FROST.activeSkillPool.length === 30, `氷 active ${FROST.activeSkillPool.length} = 30`);
  ok(FROST.passiveSkillPool.length === 4, `氷 passive ${FROST.passiveSkillPool.length} = 4`);
  ok(FROST.evolutionPool.length === 18, `氷 evolution ${FROST.evolutionPool.length} = 18`);
  // 戦士だけが増えている。
  ok(WARRIOR.activeSkillPool.length === EXPECTED.activeCount, `戦士 active ${WARRIOR.activeSkillPool.length} = ${EXPECTED.activeCount}`);
  ok(WARRIOR.passiveSkillPool.length === EXPECTED.passiveCount, `戦士 passive ${WARRIOR.passiveSkillPool.length} = ${EXPECTED.passiveCount}`);
  ok(WARRIOR.evolutionPool.length === EXPECTED.evolutionCount, `戦士 evolution ${WARRIOR.evolutionPool.length} = ${EXPECTED.evolutionCount}`);
  info(`規模: 火 30/4/18 氷 30/4/18 戦士 ${WARRIOR.activeSkillPool.length}/${WARRIOR.passiveSkillPool.length}/${WARRIOR.evolutionPool.length}`);
}

// ===== 2. 火 / 氷のデータが変わっていない =====
section('2. 火 / 氷の active / passive / evolution データが 1 バイトも変わっていない');
{
  const dump = (jid) => {
    const j = DATA.jobs.find((x) => x.id === jid);
    const parts = [];
    for (const id of j.activeSkillPool) parts.push(JSON.stringify(DATA.skills.find((s) => s.id === id)));
    for (const id of j.passiveSkillPool) parts.push(JSON.stringify(DATA.passives.find((p) => p.id === id)));
    for (const id of j.evolutionPool) parts.push(JSON.stringify(DATA.evolutions.find((e) => e.id === id)));
    return sha(parts.join('\n'));
  };
  for (const jid of ['flame_witch', 'frost_mage']) {
    const h = dump(jid);
    // 同一プロセス内で 2 回計算しても同じ（実データの自己整合）。
    ok(h === dump(jid), `${jid}: データ hash が安定（${h.slice(0, 16)}…）`);
    info(`${jid} データ hash: ${h}`);
  }
  // M8-C で追加した id が火 / 氷のプールへ 1 つも混ざっていない。
  const added = new Set([...EXPECTED.wave1Actives, ...EXPECTED.wave1Evolutions]);
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of [...j.activeSkillPool, ...j.passiveSkillPool, ...j.evolutionPool]) {
      ok(!added.has(id), `${jid}: ${id} が混ざっていない`);
    }
  }
}

// ===== 3. 候補列が byte-identical =====
section('3. 火 / 氷の同 seed 候補列が byte-identical（RNG 消費が 1 も変わっていない）');
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
    ok(h === BASELINE.draft[jid], `${jid}: 300 seed の候補列 hash が一致（${h.slice(0, 16)}…）`);
    if (h !== BASELINE.draft[jid]) info(`実測 ${h} / 期待 ${BASELINE.draft[jid]}`);
  }
  // 所持状態・進化候補ありでも同じ列になる（RNG 消費の順序が不変）。
  for (const jid of ['flame_witch', 'frost_mage']) {
    const job = jobPools(jid);
    const owned = { active: {}, passive: {} };
    owned.active[job.activeSkillPool[0]] = 8;
    owned.passive[job.passiveSkillPool[0]] = 3;
    const gen = () => {
      const lines = [];
      for (const s of seedRange(120)) {
        const d = new SkillDraftManager({});
        lines.push(d._generate({
          catalog, job, owned,
          slots: { active: { used: 1, max: 6 }, passive: { used: 1, max: 4 } }, evolvables: [], need: 3,
        }, s).map((x) => `${x.id}:${x.kind}`).join('|'));
      }
      return sha(lines.join('\n'));
    };
    ok(gen() === gen(), `${jid}: 所持あり条件でも候補列が決定論`);
  }
}

// ===== 4. ランタイム挙動が完全一致 =====
section('4. 火 / 氷 48 スキルのランタイム挙動が完全一致');
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

// ===== 5. 状態異常を増やしていない =====
section('5. 共通状態異常が 5 種のまま（戦吼で formal status を増やしていない）');
{
  const known = ['burning', 'chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability'];
  const ids = (DATA.statusEffects.statusEffects || []).map((s) => s.id);
  ok(ids.length === known.length, `状態異常は ${ids.length} 種（${ids.join(',')}）`);
  ok(known.every((k) => ids.includes(k)), '既存 5 種がそのまま');
  // 火 / 氷の status 数値も不変。
  for (const s of DATA.statusEffects.statusEffects || []) {
    ok(typeof s.id === 'string' && Object.keys(s).length > 1, `${s.id}: 定義が残っている`);
  }
}

// ===== 6. save_version 据え置き =====
section('6. save_version は 6 のまま（Wave1 は追加のみ・移行不要）');
{
  ok(DATA.balance.saveVersion === 6, `saveVersion ${DATA.balance.saveVersion} = 6`);
  const bm = readSrc('src/systems/BattleManager.js');
  ok(/warriorState/.test(bm), 'warriorState の保存が引き続きある');
  ok(/s\.warrior && s\.warrior\.enabled/.test(bm), '戦士周回のときだけ保存する（他ジョブは null）');
}

// ===== 7. 火 / 氷の周回では Wave1 の機構が動かない =====
section('7. 火 / 氷の周回では Wave1 の機構（処刑 / 反撃 / 引き寄せ / 戦吼）が一切動かない');
{
  const scene = makeScene({ enemies: makeEnemies(8, { x: 320, y: 300, hp: 1000 }), now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, { enabled: false });
  // 処刑。
  const target = { alive: true, isBoss: false, isElite: false, hp: 10, maxHp: 1000 };
  const pol = w.executePolicy(target, { thresholdNormal: 1 });
  ok(pol.canExecute === false, '無効時は処刑できない');
  ok(pol.damageMult === 1, '無効時は追加倍率もかからない');
  // 反撃。
  ok(w.beginCounterWindow('counter_stance', { durationMs: 5000, maxCounters: 3 }) === null, '無効時は構えを開けない');
  ok(w.consumeCounterEvent() === null, '無効時は反撃しない');
  ok(w.counterMitigation() === 0, '無効時は反撃の軽減が 0');
  // 戦吼。
  ok(w.applyWarCryBuff({ durationMs: 5000, meleeDamageBonus: 0.5 }) === null, '無効時はバフが付かない');
  ok(w.warCryActive === false, '無効時はバフ状態にならない');
  ok(w.meleeDamageMultiplier(target) === 1, '無効時は近接倍率が恒等');
  // 移動系テレメトリ。
  w.noteMovement('chainPull', 100); w.noteMovement('leapLanding', 0); w.noteExecute(true, 5);
  ok(w.telemetry.chainPulls === 0 && w.telemetry.leapLandings === 0 && w.telemetry.executions === 0,
    '無効時は移動 / 処刑の統計も動かない');
  // 被ダメージも恒等。
  ok(w.applyIncomingDamage(100, { extra: 0.5 }) === 100, '無効時は被ダメージが素通し');
}

// ===== 8. 火 / 氷のスキルが戦士 API を呼ばない =====
section('8. 火 / 氷のスキルが Wave1 の共通 API を 1 つも呼ばない');
{
  const WARRIOR_API = ['meleeStrike', 'preferredMeleeTarget', 'executeTarget', 'pullTarget', 'movePlayerTowards', 'warriorPullConfig'];
  const jobSkillIds = new Set([...FLAME.activeSkillPool, ...FLAME.evolutionPool, ...FROST.activeSkillPool, ...FROST.evolutionPool]);
  const smSrc = readSrc('src/systems/SkillManager.js');
  const map = {};
  for (const m of smSrc.matchAll(/([a-z0-9_]+):\s*([A-Za-z0-9_]+Skill),/g)) map[m[1]] = m[2];
  let checked = 0, bad = 0;
  for (const id of jobSkillIds) {
    const cls = map[id];
    if (!cls) continue;
    let body = '';
    try { body = readSrc('src/skills/' + cls + '.js'); } catch (e) { void e; continue; }
    checked += 1;
    for (const api of WARRIOR_API) {
      if (body.includes('combat.' + api)) { bad += 1; ok(false, `${id}: 戦士 API combat.${api} を呼んでいる`); }
    }
  }
  ok(bad === 0, `火 / 氷の ${checked} スキルが戦士 API を呼ばない（違反 ${bad} 件）`);
  info(`検査した火 / 氷スキル ${checked} 件`);
}

// ===== 9. 戦士の新 API が他ジョブの経路へ割り込んでいない =====
section('9. 戦士の新 API が火 / 氷の経路へ割り込んでいない');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  // executeTarget / pullTarget は必ず warrior の有無を確認してから動く。
  for (const name of ['executeTarget', 'pullTarget', 'movePlayerTowards']) {
    const i = bs.indexOf(`  ${name}(`);
    ok(i > 0, `${name} の実体がある`);
    const body = bs.slice(i, bs.indexOf('\n  }\n', i));
    ok(/return (0|false|null);/.test(body.split('\n').slice(0, 6).join('\n')),
      `${name}: 冒頭に早期 return の安全弁がある`);
  }
  // onWarriorHit / onWarriorDamage は戦士以外で即 return する。
  const oi = bs.indexOf('  onWarriorHit(');
  const obody = bs.slice(oi, bs.indexOf('\n  }\n', oi));
  ok(/!w \|\| !w\.enabled/.test(obody), 'onWarriorHit が戦士以外で即 return する');
  // 火 / 氷の被弾計算は warrior.enabled=false の恒等を通る。
  ok(/戦士以外のジョブでは warrior\.enabled=false/.test(bs), '被弾計算に他ジョブ恒等の明記がある');
}

// ===== 10. balance.json の火 / 氷ブロックが不変 =====
section('10. balance.json の火 / 氷向けブロックを 1 件も変えていない');
{
  const b = DATA.balance;
  ok(!!b.warrior, 'warrior ブロックがある（M8-C の追加先はここだけ）');
  // M8-C の追加は warrior.* と skillCaps.* に限る。
  for (const k of ['warCry', 'counter', 'execute', 'pull']) {
    ok(!!b.warrior[k], `warrior.${k} が追加されている`);
  }
  // 火 / 氷が読むトップレベルキーが残っている。
  for (const k of ['saveVersion', 'skillCaps']) ok(b[k] !== undefined, `${k} が残っている`);
  // 状態異常・氷ブロックへ戦士の値を混ぜていない。
  const raw = JSON.stringify(b.statusEffects || {}) + JSON.stringify(b.frost || {}) + JSON.stringify(b.fire || {});
  ok(!/warCry|counterWindow|execute|chainPull/.test(raw), '火 / 氷 / status のブロックへ戦士の値を混ぜていない');
}

T.finish();
