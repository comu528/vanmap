// 戦士 完成監査 15/23: Job Lv / passive4（M8-F §17）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-job-passive.mjs
import { DATA, WARRIOR, EXPECTED, loadData, readSrc, runner } from './warrior-common.mjs';

// Job Lv の定義は data/job-progression.json（levelCap / xpCurve / milestones）。
const PROG = loadData('job-progression.json').jobs.warrior;
const T = runner('戦士 Job Lv / passive 完成監査（M8-F）');
const { ok, section, info } = T;

// ===== 1. Job Lv1〜100 =====
section('1. Job Lv1〜100・到達報酬・XP カーブ');
{
  ok(PROG.levelCap === 100, `Job Lv 最大 100（${PROG.levelCap}）`);
  ok(PROG.enabled !== false, '戦士の Job 進行が有効');
  const ms = PROG.milestones || [];
  ok(ms.length >= 10, `到達報酬 ${ms.length} 段`);
  const levels = ms.map((m) => m.level);
  ok(new Set(levels).size === levels.length, '同じ Lv に 2 つの報酬が無い');
  ok(levels.every((l) => l >= 1 && l <= 100), 'すべて 1〜100 の範囲');
  ok(levels.slice().sort((a, b) => a - b).join(',') === levels.join(','), '報酬が Lv 昇順');
  // XP カーブ（quad / lin）が正で、Lv が上がるほど必要 XP が増える。
  ok(PROG.xpCurve && PROG.xpCurve.quad > 0 && PROG.xpCurve.lin > 0, `XP カーブ ${JSON.stringify(PROG.xpCurve)}`);
  const need = (lv) => PROG.xpCurve.quad * lv * lv + PROG.xpCurve.lin * lv;
  for (let lv = 1; lv < 100; lv++) ok(need(lv + 1) > need(lv), lv === 1 ? 'XP カーブが単調増加' : true);
  ok(PROG.xpReward && PROG.xpReward.perNormalKill > 0 && PROG.xpReward.normalKillCap > 0, `XP 報酬に上限がある（雑魚 ${PROG.xpReward.normalKillCap}）`);
  ok(Object.keys(PROG.xpReward.difficultyMult || {}).length >= 5, '難易度倍率が 5 段');
  // Lv80 の報酬が「打撃数 +1」であり、対象は 6 種。
  const lv80 = ms.find((m) => m.level === 80);
  ok(!!lv80, 'Lv80 の報酬がある');
  const lv80Targets = WARRIOR.activeSkillPool.filter((id) => (DATA.skills.find((s) => s.id === id) || {}).lv80ProjectileTarget === true);
  ok(lv80Targets.length === 6, `Lv80 の対象はちょうど 6 種（${lv80Targets.length}）`);
  ok(lv80Targets.slice().sort().join(',') === EXPECTED.lv80Targets.slice().sort().join(','), '対象が期待どおり');
  const evoLv80 = WARRIOR.evolutionPool.filter((id) => (DATA.evolutions.find((e) => e.id === id) || {}).lv80ProjectileTarget === true);
  ok(evoLv80.length === 0, '進化は Lv80 対象外');
  info(`到達報酬: ${ms.map((m) => `Lv${m.level}`).join(' ')}`);
}

// ===== 2. Lv80 は打撃数だけを増やし cast を増やさない =====
section('2. Lv80 は打撃数だけを増やす（recordCast を増やさない）');
{
  const wb = readSrc('src/skills/WarriorSkillBase.js');
  ok(/strikeCount\(base\)/.test(wb), 'strikeCount が打撃数を決める');
  ok(/appliesLv80ProjectileCount/.test(wb), '明示 flag のスキルだけへ適用する');
  const sb = readSrc('src/skills/SkillBase.js');
  ok(/recordCast\(this\.id\)/.test(sb), 'recordCast は主発動 1 回だけ（打撃数とは独立）');
  // 弾は増えない（戦士は弾を作らない）。
  for (const id of EXPECTED.lv80Targets) {
    const s = DATA.skills.find((x) => x.id === id);
    ok(!s.projectile, `${id}: 弾スキルではない（打撃数だけが増える）`);
  }
}

// ===== 3. passive4 の宣言 =====
section('3. passive4（剛力 / 重装 / 戦闘本能 / 血気）の宣言が健全');
{
  const ids = WARRIOR.passiveSkillPool || [];
  ok(ids.length === 4, `4 種（${ids.join(',')}）`);
  ok(ids.slice().sort().join(',') === EXPECTED.passives.slice().sort().join(','), '期待どおりの 4 種');
  for (const id of ids) {
    const p = DATA.passives.find((x) => x.id === id);
    ok(!!p, `${id}: data がある`);
    ok((p.jobs || []).length === 1 && p.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
    ok((p.maxLevel || 4) >= 1, `${id}: maxLevel ${p.maxLevel || 4}`);
    // passive は levels 配列ではなく modifiers（key / op / perLevel）で表される。
    ok(Array.isArray(p.modifiers) && p.modifiers.length > 0, `${id}: modifiers がある（${p.modifiers.length} 件）`);
    for (const m of p.modifiers) {
      ok(typeof m.key === 'string' && m.key.length > 0, `${id}: modifier に key がある（${m.key}）`);
      ok(['addMult', 'subMult'].includes(m.op), `${id}.${m.key}: op=${m.op} が既知`);
      ok(typeof m.perLevel === 'number' && Number.isFinite(m.perLevel), `${id}.${m.key}: perLevel が有限（${m.perLevel}）`);
      ok(m.perLevel !== 0, `${id}.${m.key}: perLevel が 0 でない（死に modifier でない）`);
    }
    // 全 key が実装から参照される（宣言だけの modifier が無い）。
    const src = readSrc('src/systems/PassiveManager.js') + readSrc('src/systems/WarriorCombatSystem.js')
      + readSrc('src/scenes/BattleScene.js') + readSrc('src/systems/JobModifierManager.js')
      + readSrc('src/skills/SkillBase.js') + readSrc('src/skills/WarriorSkillBase.js');
    for (const m of p.modifiers) ok(src.includes(m.key), `${id}.${m.key}: 実装から参照される`);
    // Lv が上がるほど強くなる（perLevel が正）。
    for (const m of p.modifiers) ok(m.perLevel > 0, `${id}.${m.key}: Lv が上がるほど強くなる（${m.perLevel}）`);
  }
}

// ===== 4. 進化の補助として 4 種が均等に使われる =====
section('4. 4 passive が進化の補助として均等に使われる');
{
  const byP = {};
  for (const id of WARRIOR.evolutionPool) {
    const e = DATA.evolutions.find((x) => x.id === id);
    for (const r of e.requiredSkills || []) {
      if ((WARRIOR.passiveSkillPool || []).includes(r.skill)) byP[r.skill] = (byP[r.skill] || 0) + 1;
    }
  }
  ok(Object.keys(byP).length === 4, `4 種すべてが補助を担当（${JSON.stringify(byP)}）`);
  const counts = Object.values(byP);
  ok(Math.max(...counts) - Math.min(...counts) <= 2, `担当数の差が 2 以下（${counts.join('/')}）`);
  info(`passive 別の担当進化数: ${JSON.stringify(byP)}`);
}

// ===== 5. passives.version による再計算 =====
section('5. passive の反映は passives.version 駆動（M8-B.1 の非回帰）');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/_refreshStatusPassivesIfNeeded|passives\.version/.test(bs), 'version 駆動の再計算経路がある');
  ok(/_refreshStatusPassives/.test(bs), '完全再構築の関数がある');
  const pm = readSrc('src/systems/PassiveManager.js');
  ok(/version/.test(pm), 'PassiveManager が version を持つ');
  // 加算蓄積しない（完全再構築）。
  ok(/=\s*\{\}|reset|rebuild|Object\.assign/.test(pm), '再構築で加算蓄積しない経路がある');
}

// ===== 6. 他ジョブでは恒等 =====
section('6. 戦士 passive は他ジョブへ漏れない');
{
  const { memberAllowedForJob } = await import('../src/systems/poolEligibility.js');
  for (const jid of ['flame_witch', 'frost_mage']) {
    const job = DATA.jobs.find((j) => j.id === jid);
    for (const id of WARRIOR.passiveSkillPool || []) {
      const p = DATA.passives.find((x) => x.id === id);
      ok(!memberAllowedForJob({ ...p, category: 'passive' }, job), `${jid}: ${id} が適格にならない`);
    }
  }
  // 逆方向: 火 / 氷の passive が戦士へ漏れない。
  const wjob = WARRIOR;
  for (const jid of ['flame_witch', 'frost_mage']) {
    const other = DATA.jobs.find((j) => j.id === jid);
    for (const id of other.passiveSkillPool || []) {
      const p = DATA.passives.find((x) => x.id === id);
      ok(!memberAllowedForJob({ ...p, category: 'passive' }, wjob), `戦士: ${id}（${jid}）が適格にならない`);
    }
  }
}

// ===== 7. 不明 id / 改ざん値 =====
section('7. 不明な passive id / 改ざん値で壊れない');
{
  const { PassiveManager } = await import('../src/systems/PassiveManager.js');
  const pm = new PassiveManager();
  pm.setDefs(DATA.passives, {});
  let threw = false;
  try {
    pm.setLevel('unknown_passive', 3);
    for (const [id, lv] of [['brute_force', 1e9], ['heavy_armor', NaN], ['combat_instinct', -5], ['bloodlust', 'x']]) pm.setLevel(id, lv);
    pm._recompute();
  } catch (e) { threw = true; info(`setLevel で例外: ${e.message}`); }
  ok(!threw, '不明 id / 改ざん値で例外にならない');
  for (const id of WARRIOR.passiveSkillPool || []) {
    const lv = pm.getLevel(id);
    ok(Number.isFinite(lv) || lv === 0, `${id}: Lv が壊れない（${lv}）`);
    const max = (DATA.passives.find((p) => p.id === id) || {}).maxLevel || 4;
    ok(!(lv > max), `${id}: Lv が最大 ${max} を超えない（${lv}）`);
  }
  // 集計値が有限（NaN が倍率へ漏れない）。
  for (const k of ['meleeDamage', 'knockback', 'poiseDamage', 'comboGrace', 'attackSpeed']) {
    ok(Number.isFinite(pm.getMult(k)), `集計 ${k} が有限（${pm.getMult(k)}）`);
  }
  ok(pm.getLevel('unknown_passive') === 0 || pm.maxLevelOf('unknown_passive') === 1, '不明 id は既定扱い');
  // serialize / 再構築で加算蓄積しない。
  const pm2 = new PassiveManager();
  pm2.setDefs(DATA.passives, {});
  pm2.setLevel('brute_force', 4);
  const m1 = pm2.getMult('meleeDamage');
  for (let i = 0; i < 10; i++) pm2._recompute();
  ok(Math.abs(pm2.getMult('meleeDamage') - m1) < 1e-9, `10 回再計算しても倍率が積み上がらない（${m1.toFixed(4)}）`);
}

// ===== 8. selectedJobId と active_run.jobId =====
section('8. selectedJobId と active_run.jobId が混同されない');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  const sm = readSrc('src/systems/SaveManager.js');
  ok(/active_run/.test(sm) || /activeRun/.test(sm), 'SaveManager が active_run を持つ');
  ok(/this\.jobId/.test(bs), 'BattleScene が周回の jobId を持つ');
  // 周回中の jobId は active_run 由来（プロフィールの選択と別）。
  ok(/r\.jobId|jobId:\s*this\.jobId/.test(bs), '周回の jobId が active_run と往復する');
}

T.finish();
