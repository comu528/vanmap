// M7-A: 複数ジョブの抽選分離・決定論・火の魔女抽選の非回帰のテスト。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
const skills = load('skills.json').skills;
const passives = load('passives.json').passives;
const jobs = load('jobs.json').jobs;
const cfg = load('skill-config.json');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const meta = (x, cat) => ({ id: x.id, category: cat, rarity: x.rarity, weight: x.weight, maxLevel: x.maxLevel, enabled: x.enabled, jobs: x.jobs, isCommon: x.isCommon, prerequisites: x.prerequisites, conflicts: x.conflicts, unlockCondition: x.unlockCondition });
const fullCatalog = [...skills.map((s) => meta(s, s.category)), ...passives.map((p) => meta(p, 'passive'))];
// 火の魔女スキルのみ＋共通passive のカタログ（氷追加前を模す）。
const fireOnlyCatalog = [...skills.filter((s) => (s.jobs || []).includes('flame_witch')).map((s) => meta(s, s.category)), ...passives.map((p) => meta(p, 'passive'))];

const fireJob = jobs.find((j) => j.id === 'flame_witch');
const iceJob = jobs.find((j) => j.id === 'frost_mage');
const frostIds = new Set(skills.filter((s) => (s.jobs || []).includes('frost_mage')).map((s) => s.id));
const fireIds = new Set(skills.filter((s) => (s.jobs || []).includes('flame_witch')).map((s) => s.id));

const mkDraft = (seed) => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights, synergy: null }); d.reset(seed, { rerolls: 1, banishes: 1, skips: 1 }); return d; };
const ctx = (job, catalog, owned, slotsMax) => ({
  catalog, job: { activeSkillPool: job.activeSkillPool || [], passiveSkillPool: job.passiveSkillPool || [] },
  owned, slots: { active: { used: Object.keys(owned.active).length, max: slotsMax }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
  evolvables: [], need: 4, unlock: { highestClearedDifficulty: 0 },
});
const keyOf = (cands) => cands.map((c) => `${c.kind}:${c.id}`).join('|');

section('1. 火の魔女の抽選に氷術師スキルが出ない');
{
  let bad = 0, total = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const d = mkDraft(seed);
    for (let lv = 0; lv < 6; lv++) { const cand = d.open(ctx(fireJob, fullCatalog, { active: { fireball: 1 }, passive: {} }, 8)); for (const c of cand) { total++; if (frostIds.has(c.id)) bad++; } }
  }
  ok(bad === 0, `火の魔女の候補に氷スキルが出ない (${bad}/${total})`);
  ok(total > 0, '候補が生成されている');
}

section('2. 氷術師の抽選に火の魔女スキルが出ない・初期は氷晶弾');
{
  let bad = 0, total = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const d = mkDraft(seed);
    for (let lv = 0; lv < 6; lv++) { const cand = d.open(ctx(iceJob, fullCatalog, { active: { frost_shard: 1 }, passive: {} }, 8)); for (const c of cand) { total++; if (fireIds.has(c.id)) bad++; } }
  }
  ok(bad === 0, `氷術師の候補に火スキルが出ない (${bad}/${total})`);
  ok(iceJob.initialActiveSkills[0] === 'frost_shard', '氷術師の初期スキルが氷晶弾');
}

section('3. 決定論（同 jobId・seed・状態・操作で同じ候補）');
{
  const a = mkDraft(999); const b = mkDraft(999);
  let same = true;
  for (let lv = 0; lv < 8; lv++) {
    const ca = a.open(ctx(iceJob, fullCatalog, { active: { frost_shard: 1 }, passive: {} }, 8));
    const cb = b.open(ctx(iceJob, fullCatalog, { active: { frost_shard: 1 }, passive: {} }, 8));
    if (keyOf(ca) !== keyOf(cb)) same = false;
  }
  ok(same, '氷術師: 同条件で同じ候補列');
}

section('4. 火の魔女の抽選が氷追加で変化しない（同 job/seed/状態）');
{
  // フルカタログ（氷含む）と火のみカタログで、火の魔女の候補列が完全一致すること。
  let same = true, diffAt = null;
  for (let seed = 1; seed <= 200; seed++) {
    const dFull = mkDraft(seed), dFire = mkDraft(seed);
    for (let lv = 0; lv < 6; lv++) {
      const owned = { active: { fireball: 1 }, passive: {} };
      const cFull = dFull.open(ctx(fireJob, fullCatalog, owned, 8));
      const cFire = dFire.open(ctx(fireJob, fireOnlyCatalog, owned, 8));
      if (keyOf(cFull) !== keyOf(cFire)) { same = false; diffAt = `seed${seed} lv${lv}`; }
    }
  }
  ok(same, `火の魔女の候補は氷追加前後で byte 一致（相違: ${diffAt || 'なし'}）`);
}

console.log(fail ? `\n✗ 複数ジョブ抽選テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 複数ジョブ抽選テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
