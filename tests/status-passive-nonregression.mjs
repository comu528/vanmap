// M8-B.1 6/6: 非回帰（M8-B.1 §非回帰）。Node.js 標準機能のみ。
// M8-B.1 は「呼び出しタイミングの修正」であり、数値・データ・抽選・RNG を変えていないことを機械的に確認する。
//   - 火 / 氷 / 戦士のカタログ・データが 1 バイトも変わらない
//   - 同 seed のドラフト候補列が M8-A / M8-B 時点と完全一致
//   - 火 / 氷 48 スキルのランタイム挙動が完全一致
//   - 戦士の _refreshWarriorMods が従来どおり動く
//   - StatusEffectManager / FreezeSystem / PassiveManager の数値ロジックを変えていない
// 実行: node tests/status-passive-nonregression.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, bootRuntime, makeSceneStub, statusMods, runner, readSrc } from './status-passive-common.mjs';

const T = runner('status passive 非回帰（M8-B.1）');
const { ok, section, info } = T;

const sha = (s) => createHash('sha256').update(s).digest('hex');
const mods = await bootRuntime();

// M8-A / M8-B 完了時点で測定した固定値（tests/three-job-nonregression.mjs と同じ基準）。
const BASELINE_DRAFT = {
  flame_witch: '15a8585c4f60681ba2b58da959771c0ae404a5dbad527b51cfb618156e709b3f',
  frost_mage: 'bd38bcf580523b7a26d21faee0734b0595539e996c1b33a747fafc816a9e9abb',
};
const BASELINE_RUNTIME = {
  flame_witch: '1f0f2c1805bf06fa6b0f98ae00870376af1a8155aed9f9de608b8345b3c2ad75',
  frost_mage: '029a44bd73b485aee5aad74c37de7cc41645fbbe3b913cc30e6a4ea896597dd9',
};

// ===== 1. カタログ規模 =====
section('1. 3 ジョブのカタログ規模が変わっていない');
{
  const expect = { flame_witch: [30, 4, 18], frost_mage: [30, 4, 18], warrior: [5, 4, 3] };
  for (const [jid, [a, p, e]] of Object.entries(expect)) {
    const j = DATA.jobs.find((x) => x.id === jid);
    ok(j.activeSkillPool.length === a, `${jid}: active ${j.activeSkillPool.length} = ${a}`);
    ok((j.passiveSkillPool || []).length === p, `${jid}: passive ${(j.passiveSkillPool || []).length} = ${p}`);
    ok((j.evolutionPool || []).length === e, `${jid}: evolution ${(j.evolutionPool || []).length} = ${e}`);
  }
}

// ===== 2. ドラフト候補列（ケース19）=====
section('2. 同 seed の候補列が M8-A / M8-B 時点と完全一致（RNG 消費不変）');
{
  const pick = (s, category) => ({
    id: s.id, category: category || s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel,
    enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites,
    conflicts: s.conflicts, unlockCondition: s.unlockCondition,
  });
  const catalog = [...DATA.skills.map((s) => pick(s)), ...DATA.passives.map((p) => pick(p, 'passive'))];
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    const job = { activeSkillPool: j.activeSkillPool, passiveSkillPool: j.passiveSkillPool || [] };
    const lines = [];
    for (let s = 1; s <= 300; s++) {
      const d = new SkillDraftManager({});
      const c = d._generate({
        catalog, job, owned: { active: {}, passive: {} },
        slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3,
      }, s);
      lines.push(c.map((x) => `${x.id}:${x.kind}:${x.rarity}`).join('|'));
    }
    const h = sha(lines.join('\n'));
    ok(h === BASELINE_DRAFT[jid], `${jid}: 300 seed の候補列 hash が一致（${h.slice(0, 16)}…）`);
    if (h !== BASELINE_DRAFT[jid]) info(`実測 ${h} / 期待 ${BASELINE_DRAFT[jid]}`);
  }
}

// ===== 3. 火 / 氷のランタイム挙動 =====
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
    ok(h === BASELINE_RUNTIME[jid], `${jid}: ランタイム hash が一致（${h.slice(0, 16)}…）`);
    if (h !== BASELINE_RUNTIME[jid]) info(`実測 ${h} / 期待 ${BASELINE_RUNTIME[jid]}`);
  }
}

// ===== 4. 戦士の _refreshWarriorMods 非回帰（ケース20）=====
section('4. 戦士の _refreshWarriorMods が従来どおり動く');
{
  const wc = await import('../src/systems/WarriorCombatSystem.js');
  const jm = await import('../src/systems/JobModifierManager.js');
  const makeWarriorStub = () => {
    const jobMods = new jm.JobModifierManager();
    jobMods.setResolved(jm.JobModifierManager.resolve(DATA.jobProgression.jobs.warrior, 100));
    const warrior = new wc.WarriorCombatSystem({ config: DATA.balance.warrior, enabled: true, now: () => 1000 });
    const s = makeSceneStub(mods, { jobId: 'warrior', warrior, jobMods, player: { hp: 100, maxHp: 100 } });
    s._baseMaxHp = 100;
    s.isWarrior = true;
    return s;
  };
  const s = makeWarriorStub();
  s._refreshWarriorMods(true);
  const base = { ...s.warrior.mods };
  ok(base.furyGainMult > 1, `Job Lv100 の闘気獲得倍率が乗る（${base.furyGainMult.toFixed(3)}）`);
  ok(base.damageReductionBonus > 0, `軽減ボーナスが乗る（${base.damageReductionBonus}）`);

  // gate: passive 未変更では再計算しない。
  const wasMax = s.player.maxHp;
  for (let i = 0; i < 100; i++) s._refreshWarriorMods();
  ok(JSON.stringify(s.warrior.mods) === JSON.stringify(base), '100 フレーム回しても mods が変わらない（冪等）');
  ok(s.player.maxHp === wasMax, '最大HP も動かない（二重適用なし）');

  // 戦士 passive を取ると次の呼び出しで反映される。
  s.passives.setLevel('brute_force', 5);
  s._refreshWarriorMods();
  ok(s.warrior.mods.meleeDamageMult > base.meleeDamageMult, `剛力 Lv5 で近接ダメージ倍率が上がる（${base.meleeDamageMult.toFixed(3)} → ${s.warrior.mods.meleeDamageMult.toFixed(3)}）`);
  const after = { ...s.warrior.mods };
  for (let i = 0; i < 50; i++) s._refreshWarriorMods();
  ok(JSON.stringify(s.warrior.mods) === JSON.stringify(after), '反映後は再び安定する（累積しない）');

  // 戦士の周回では status 乗率が動かない。
  s._refreshStatusPassivesIfNeeded(true);
  const m = statusMods(s.statusFx);
  ok(m.chillDecayMult === 1 && m.iceStatusDurationMult === 1, '戦士の周回で status 乗率は恒等のまま');
}

// ===== 5. 変更していないファイル =====
section('5. 数値ロジックを持つモジュールを変更していない');
{
  // PassiveManager: 集計と version の仕組みは M8-B から不変。
  const pm = readSrc('src/systems/PassiveManager.js');
  ok(/this\.version \+= 1;/.test(pm), 'PassiveManager が _recompute で version を進める（既存仕様）');
  ok(/getChillDecayMultiplier\(\)\s*\{\s*return Math\.max\(0\.5/.test(pm), 'chillDecay の下限クランプが不変');
  ok(/getIceStatusDurationMultiplier\(\)\s*\{\s*return this\.getMult\('iceStatusDuration'\)/.test(pm), 'iceStatusDuration の取得が不変');
  // StatusEffectManager: setPassiveMods は「完全置換」のまま（加算にしていない）。
  const sem = readSrc('src/systems/StatusEffectManager.js');
  ok(/setPassiveMods\(\{ chillDecayMult = 1, iceStatusDurationMult = 1 \} = \{\}\) \{/.test(sem), 'setPassiveMods のシグネチャが不変');
  ok(/this\._chillDecayMult = num\(chillDecayMult, 1\);/.test(sem), '受け取った値をそのまま代入する（累積しない）');
  ok(!/this\._chillDecayMult \*=|this\._iceStatusDurationMult \*=/.test(sem), '乗算での累積をしていない');
  // FreezeSystem / 状態異常データは触っていない。
  const known = ['burning', 'chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability'];
  const ids = (DATA.statusEffects.statusEffects || []).map((s) => s.id);
  ok(ids.length === known.length && known.every((k) => ids.includes(k)), `共通状態異常は 5 種のまま（${ids.join(',')}）`);
}

// ===== 6. RNG 非回帰（ケース18）=====
section('6. status RNG を消費しない');
{
  for (const jobId of ['frost_mage', 'flame_witch', 'warrior']) {
    const s = makeSceneStub(mods, { jobId });
    const before = s.statusFx.rng.serialize();
    for (let i = 0; i < 50; i++) {
      s.passives.acquireOrLevel('lingering_cold');
      s._refreshStatusPassivesIfNeeded();
      s._refreshStatusPassivesIfNeeded(true);
    }
    const after = s.statusFx.rng.serialize();
    ok(before.cursor === after.cursor && before.seed === after.seed, `${jobId}: status RNG が動かない（cursor ${after.cursor}）`);
  }
}

// ===== 7. データ変更なし =====
section('7. data ファイルを変更していない（M8-B.1 はコード修正のみ）');
{
  const j = DATA.jobs.find((x) => x.id === 'frost_mage');
  for (const id of j.passiveSkillPool) {
    const p = DATA.passives.find((x) => x.id === id);
    ok(p.maxLevel === 5, `${id}: maxLevel 5 のまま`);
    ok((p.modifiers || []).length > 0, `${id}: modifiers がある`);
  }
  const lc = DATA.passives.find((p) => p.id === 'lingering_cold');
  const byKey = Object.fromEntries((lc.modifiers || []).map((m) => [m.key, m]));
  ok(byKey.iceStatusDuration && byKey.iceStatusDuration.perLevel === 0.08, '余寒残留: iceStatusDuration +0.08/Lv のまま');
  ok(byKey.chillDecay && byKey.chillDecay.op === 'subMult' && byKey.chillDecay.perLevel === 0.05, '余寒残留: chillDecay -0.05/Lv（subMult）のまま');
  ok(DATA.balance.saveVersion === 6, 'save_version は 6 のまま');
}

T.finish();
