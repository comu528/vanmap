// poolEligibility（Milestone 7-B 追加監査）: 「あるスキル/パッシブが、あるジョブの抽選候補として適格か」を判定する
// 単一の正。SkillDraftManager（実抽選）・SkillCatalog（カタログ表示）・シミュレーター・テストが同じ判定を共有し、
// 「jobs 未指定を暗黙の全ジョブ共通として扱わない／各ジョブの *SkillPool を候補抽選の正とする」原則を1か所で保証する。
//
// 適格条件（いずれか）:
//   1) そのジョブの activeSkillPool / passiveSkillPool に id が含まれる（＝ジョブ専用プールが正）。
//   2) member.isCommon === true（明示的な全ジョブ共通）。
//   3) member.jobs に "*" が含まれる（明示的な全ジョブ共通・将来の共通passive追加口）。
//   4) extra（extraAllowedIds・継承/特例）に id が含まれる。
// member.jobs に特定ジョブ名だけが入っていても、それだけでは共通扱いにしない（プール登録が必要）。

export function memberAllowedForJob(member, job, extra = []) {
  if (!member || !job) return false;
  const cat = member.category === 'active' ? 'active' : 'passive';
  const pool = cat === 'active' ? (job.activeSkillPool || []) : (job.passiveSkillPool || []);
  if (pool.includes(member.id)) return true;
  if (member.isCommon === true) return true;
  if (Array.isArray(member.jobs) && member.jobs.includes('*')) return true;
  if (Array.isArray(extra) && extra.includes(member.id)) return true;
  return false;
}
