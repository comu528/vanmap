// 戦士 M8-C.1 9/9: 導線補助の非回帰（M8-C.1 §9）。Node.js 標準機能のみ。
// M8-C.1 は SkillDraftManager へジョブ限定の重み補正を足した。
// 火の魔女・氷術師へ 1 バイトも影響していないことを、既存のハッシュ基準で確認する。
//   - 火 / 氷の 300 seed 候補列 SHA-256 が M8-A 時点と完全一致
//   - 火 / 氷 48 スキルのランタイムトレースが完全一致
//   - poolEligibility / passive プール / SkillCatalog の件数が不変
//   - rarity / synergy / pity の既存設定が不変
//   - 保存キーの追加は guidanceStall の 1 件だけ
// 実行: node tests/warrior-draft-guidance-nonregression.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { DATA, WARRIOR, FLAME, FROST, EXPECTED, draftCatalog, jobPools, seedRange, runner, readSrc, registeredIds } from './warrior-common.mjs';
import { SKILL_CONFIG, GUIDANCE_RECIPES } from './warrior-draft-sim.mjs';

const T = runner('戦士 導線補助 非回帰（M8-C.1）');
const { ok, section, info } = T;

const sha = (s) => createHash('sha256').update(s).digest('hex');
const catalog = draftCatalog();

// M8-A 完了時点（ec503fe）で測定し、M8-B / M8-B.1 / M8-C でも不変だった固定値。
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

// ===== 1. 火 / 氷の候補列（M8-C までと同じ入力＝jobId / evolutionRecipes 無し）=====
section('1. 火 / 氷の 300 seed 候補列が M8-A 時点と byte-identical');
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

// ===== 2. production と同じ入力（jobId 付き）でも一致 =====
section('2. production と同じ ctx（jobId・synergy 付き）でも火 / 氷の候補列が変わらない');
for (const jid of ['flame_witch', 'frost_mage']) {
  const job = jobPools(jid);
  const mkCtx = (withGuidanceCtx) => {
    const lines = [];
    for (const s of seedRange(300)) {
      const d = new SkillDraftManager({ rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy, guidance: SKILL_CONFIG.guidance });
      const ctx = {
        catalog, job, owned: { active: {}, passive: {} },
        slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3,
        unlock: { highestClearedDifficulty: 0 }, synergy: { partnerIds: new Set(), battleLevel: 20 },
      };
      // M8-C.1 で BattleScene が渡すようになった追加情報（火 / 氷でも渡る）。
      if (withGuidanceCtx) { ctx.jobId = jid; ctx.evolutionRecipes = GUIDANCE_RECIPES; }
      lines.push(d._generate(ctx, s).map((x) => `${x.id}:${x.kind}:${x.rarity}:${x.weight}`).join('|'));
    }
    return sha(lines.join('\n'));
  };
  const without = mkCtx(false), withCtx = mkCtx(true);
  ok(without === withCtx, `${jid}: jobId / evolutionRecipes を渡しても候補列と重みが同一（${withCtx.slice(0, 16)}…）`);
}

// ===== 3. 火 / 氷のランタイムトレース =====
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

// ===== 4. poolEligibility / プールの非回帰 =====
section('4. poolEligibility とプールが不変');
{
  const JOBS = { warrior: jobPools('warrior'), flame_witch: jobPools('flame_witch'), frost_mage: jobPools('frost_mage') };
  const members = [...DATA.skills.map((s) => ({ ...s, category: 'active' })), ...DATA.passives.map((p) => ({ ...p, category: 'passive' }))];
  const lines = [];
  for (const m of members) {
    const allowed = Object.entries(JOBS).filter(([, j]) => memberAllowedForJob(m, j)).map(([k]) => k);
    ok(allowed.length <= 1, `${m.id}: 適格ジョブは最大 1（${allowed.join(',') || 'なし'}）`);
    lines.push(`${m.id}:${allowed.join(',')}`);
  }
  info(`poolEligibility hash: ${sha(lines.join('\n')).slice(0, 32)}…`);
  ok(FLAME.activeSkillPool.length === 30 && FLAME.evolutionPool.length === 18, '火 30/18 が不変');
  ok(FROST.activeSkillPool.length === 30 && FROST.evolutionPool.length === 18, '氷 30/18 が不変');
  // 戦士の規模は Milestone ごとに増える（M8-C 15/8 → M8-D 25/13）。
  // このテストが守るのは「導線補助が火 / 氷を動かさないこと」なので、正は EXPECTED を見る。
  ok(WARRIOR.activeSkillPool.length === EXPECTED.activeCount && WARRIOR.evolutionPool.length === EXPECTED.evolutionCount,
    `戦士 ${EXPECTED.activeCount}/${EXPECTED.evolutionCount}（導線補助そのものは 1 件も増やしていない）`);
  for (const jid of ['flame_witch', 'frost_mage', 'warrior']) {
    ok((jobPools(jid).passiveSkillPool || []).length === 4, `${jid}: passive プール 4 件が不変`);
  }
}

// ===== 5. SkillCatalog の件数 =====
section('5. SkillCatalog の件数・不整合が不変');
{
  const ids = registeredIds();
  for (const jid of ['flame_witch', 'frost_mage', 'warrior']) {
    const cat = buildCatalog({ skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId: jid, registeredIds: ids, runtimeStateIds: ids });
    const j = DATA.jobs.find((x) => x.id === jid);
    ok(cat.actives.length === j.activeSkillPool.length, `${jid}: active ${cat.actives.length} 件`);
    ok(cat.evolutions.length === j.evolutionPool.length, `${jid}: 進化 ${cat.evolutions.length} 件`);
    ok(cat.passives.length === 4, `${jid}: passive 4 件`);
    ok(cat.issues.length === 0, `${jid}: 不整合 0 件`);
  }
}

// ===== 6. 既存 rarity / synergy / pity 設定 =====
section('6. rarity / synergy / 既存 pity の設定を 1 件も変えていない');
{
  const rw = SKILL_CONFIG.rarityWeights;
  ok(rw.common === 100 && rw.uncommon === 55 && rw.rare === 20 && rw.legendary === 5, `rarityWeights が不変（${JSON.stringify(rw)}）`);
  const syn = SKILL_CONFIG.synergy;
  const WANT = { synergyAssistEnabled: true, synergyAssistMinBattleLevel: 3, synergyAssistMaxMultiplier: 2, evolutionPartnerWeightMultiplier: 1.35, ownedSkillUpgradeWeightMultiplier: 1.15, nearlyMaxedSkillWeightMultiplier: 1.2, unrelatedNewSkillWeightMultiplier: 1, noProgressDraftThreshold: 4, noProgressWeightBonus: 0.1, noProgressMaxMultiplier: 1.5 };
  for (const [k, v] of Object.entries(WANT)) ok(syn[k] === v, `synergy.${k} = ${v}`);
  ok(SKILL_CONFIG.slots && SKILL_CONFIG.draft, 'slots / draft 設定が残っている');
  ok(Object.keys(SKILL_CONFIG.modifierKeys).length >= 27, `modifierKeys ${Object.keys(SKILL_CONFIG.modifierKeys).length} 件（削っていない）`);
}

// ===== 7. 保存キー =====
section('7. 保存キーの追加は 1 件だけ・save_version は v6');
{
  const d = new SkillDraftManager({});
  const keys = Object.keys(d.serialize()).sort();
  const expect = ['banishedSkillIds', 'banishesRemaining', 'cursor', 'currentCandidates', 'currentDraftId',
    'draftsSinceProgress', 'guidanceStall', 'levelUpSequence', 'rerollsRemaining', 'seed', 'skipsRemaining'].sort();
  ok(keys.join(',') === expect.join(','), `保存キーが想定どおり（${keys.join(',')}）`);
  ok(DATA.balance.saveVersion === 6, 'save_version = 6');
  const bm = readSrc('src/systems/BattleManager.js');
  ok(!/saveVersion\s*[:=]\s*7/.test(bm), 'save_version を上げていない');
}

// ===== 8. data の非回帰 =====
section('8. M8-C.1 で data のスキル / 進化 / バランスを 1 件も変えていない');
{
  // 導線補助（guidance）そのものは data のスキルを 1 件も増やしていない。
  // 増えるのは戦士の Wave 追加ぶんだけなので、「戦士以外は不変」を正として測る。
  const nonWarriorSkills = DATA.skills.filter((x) => !(x.jobs || []).includes('warrior')).length;
  const nonWarriorEvos = DATA.evolutions.filter((x) => !((DATA.skills.find((s2) => s2.id === x.baseSkillId) || {}).jobs || []).includes('warrior')).length;
  ok(nonWarriorSkills === 60, `戦士以外の skills が不変 60 件（${nonWarriorSkills}）`);
  ok(nonWarriorEvos === 36, `戦士以外の evolutions が不変 36 件（${nonWarriorEvos}）`);
  ok(DATA.skills.length === 60 + EXPECTED.activeCount, `skills.json ${60 + EXPECTED.activeCount} 件（${DATA.skills.length}）`);
  ok(DATA.evolutions.length === 36 + EXPECTED.evolutionCount, `skill-evolutions.json ${36 + EXPECTED.evolutionCount} 件（${DATA.evolutions.length}）`);
  ok(DATA.passives.length >= 12, `passives.json 件数が不変（${DATA.passives.length}）`);
  // skillCaps は M8-C.1 時点で 185 件。M8-D で +20、M8-E（最終Wave）で +12 ＝ 217 件。
  // guidance そのものは cap を 1 件も増やしていない（増えるのはスキル追加ぶんだけ）。
  ok(Object.keys(DATA.balance.skillCaps).length === 217, `skillCaps 217 件（${Object.keys(DATA.balance.skillCaps).length}）`);
  // 追加したのは skill-config.json の guidance ブロックだけ。
  ok(!!SKILL_CONFIG.guidance, 'skill-config.json に guidance がある');
  ok(SKILL_CONFIG.guidance.jobs.length === 1 && SKILL_CONFIG.guidance.jobs[0] === 'warrior', 'guidance は戦士専用');
  // 進化条件（基礎 Lv・補助）は 1 件も変えていない。
  for (const r of GUIDANCE_RECIPES) {
    const e = DATA.evolutions.find((x) => x.id === r.evolutionId);
    ok(e.baseSkillId === r.baseSkillId, `${r.evolutionId}: 進化元が不変`);
    ok((e.requiredSkills || []).length === r.requirements.length, `${r.evolutionId}: 補助の件数が不変`);
    for (const q of e.requiredSkills || []) {
      const m = r.requirements.find((x) => x.skill === q.skill);
      ok(m && m.level === q.level, `${r.evolutionId}: 補助 ${q.skill} Lv${q.level} が不変`);
    }
  }
}

T.finish();
