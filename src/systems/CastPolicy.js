// CastPolicy（Milestone 6-D）: 残響詠唱（M6-C）と灰燼分身の複製が攻撃を再実行する際の、
// 再帰防止・世代管理・ポリシー解決を担う純粋ロジック。Phaser/DOM 非依存で Node からテストできる。
//
// スキルメタデータ（skills.json / skill-evolutions.json）の cast 項目:
//   echoPolicy / clonePolicy: 'standard' | 'custom' | 'forbidden'
//   isDefensive / isReactive / usesResourceCost / canTriggerEcho / canBeCopiedByClone
//
// castContext（発動文脈）:
//   { origin:'normal'|'echo'|'clone', generation, parentSkillId, rootSkillId,
//     powerMultiplier, suppressEcho, suppressClone }
//
// 再帰は「normal 由来の発動のみ echo/clone を1世代だけ発生できる」ルールで停止する。
//   normal→echo / normal→clone は各1世代で停止。echo→*, clone→* は一切発生しない。

const POLICIES = ['standard', 'custom', 'forbidden'];

function pick(list, v, d) { return list.includes(v) ? v : d; }

// スキル/進化の def から cast メタデータを解決する（未定義は安全な既定値）。
export function resolveCastMeta(def) {
  const d = def || {};
  const echoPolicy = pick(POLICIES, d.echoPolicy, 'standard');
  const clonePolicy = pick(POLICIES, d.clonePolicy, 'standard');
  const isDefensive = !!d.isDefensive;
  const isReactive = !!d.isReactive;
  const usesResourceCost = !!d.usesResourceCost;
  // 既定: forbidden・防御・反応スキルは残響カウンターを進めない。
  const canTriggerEcho = (d.canTriggerEcho !== undefined)
    ? !!d.canTriggerEcho
    : (echoPolicy !== 'forbidden' && !isDefensive && !isReactive);
  // 既定: forbidden は複製対象外。
  const canBeCopiedByClone = (d.canBeCopiedByClone !== undefined)
    ? !!d.canBeCopiedByClone
    : (clonePolicy !== 'forbidden');
  return { echoPolicy, clonePolicy, isDefensive, isReactive, usesResourceCost, canTriggerEcho, canBeCopiedByClone };
}

// normal 由来の初期 castContext。
export function defaultCastContext(skillId) {
  return {
    origin: 'normal', generation: 0,
    parentSkillId: skillId || null, rootSkillId: skillId || null,
    powerMultiplier: 1, suppressEcho: false, suppressClone: false,
  };
}

// parentCtx から echo/clone の子 castContext を作る。再帰不可なら null。
// kind: 'echo' | 'clone'。maxGen は品質別 maxCopyGeneration/maxEchoCloneGeneration（既定1）。
export function replayContext(parentCtx, kind, powerMult = 1, maxGen = 1) {
  const p = parentCtx || defaultCastContext(null);
  if (p.origin !== 'normal') return null;                 // echo/clone からの再複製は禁止
  if (kind === 'echo' && p.suppressEcho) return null;
  if (kind === 'clone' && p.suppressClone) return null;
  const gen = (p.generation || 0) + 1;
  const mg = (typeof maxGen === 'number' && Number.isFinite(maxGen)) ? maxGen : 1;
  if (gen > mg) return null;
  return {
    origin: kind, generation: gen,
    parentSkillId: p.parentSkillId || p.rootSkillId || null,
    rootSkillId: p.rootSkillId || p.parentSkillId || null,
    powerMultiplier: (p.powerMultiplier || 1) * (powerMult || 1),
    suppressEcho: true, suppressClone: true,             // 子からは echo も clone も発生させない
  };
}

// この発動が Job残響のカウンターを進めてよいか（normal 由来かつ echo 対象スキルのみ）。
export function canCastTriggerEcho(meta, ctx) {
  if (!meta || !ctx) return false;
  return ctx.origin === 'normal' && !ctx.suppressEcho && !!meta.canTriggerEcho;
}

// 灰燼分身がこのスキルを複製してよいか。
export function canCloneCopy(meta) {
  return !!meta && meta.clonePolicy !== 'forbidden' && !!meta.canBeCopiedByClone;
}
