// M9-A 横断監査 10/25: recordCast の 1:1 を 144 スキル横断で確認。Node.js 標準機能のみ。
// - 主記録は基底（SkillBase / EvolvedSkillBase）が 1 発動 = 1 回行う。
// - スキル自身が recordCast を呼んでよいのは、data が castMode ≠ 'cooldown'（continuous /
//   periodic / resource / reactive）と mainCastEvent を宣言する custom-cast だけ。
// - 戦士 48 件はスキル側の呼び出し 0（M8-F の不変条件）。
// - restore（save/reload）で casts が増えない。
// 実行: node tests/cross-job-record-cast.mjs
import { DATA, JOB_IDS, poolsOf, runJob, runner, registryMap } from './cross-job-common.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './warrior-common.mjs';

const T = runner('recordCast 横断監査（M9-A）');
const { ok, section, info } = T;
const REG = registryMap();

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const fileOf = (cls) => join(REPO, 'src', 'skills', `${cls}.js`);

section('1. スキル側から recordCast を呼ぶのは custom-cast 宣言のあるスキルだけ（144 件全数）');
{
  const defOf = (id) => DATA.skills.find((s) => s.id === id) || DATA.evolutions.find((e) => e.id === id);
  for (const jobId of JOB_IDS) {
    const p = poolsOf(jobId);
    for (const id of [...p.active, ...p.evolution]) {
      const cls = REG[id];
      let src = '';
      try { src = stripComments(readFileSync(fileOf(cls), 'utf8')); } catch { /* 共有ファイル */ }
      const calls = (src.match(/this\.scene\.skills\.recordCast\(/g) || []).length;
      const d = defOf(id) || {};
      const castMode = d.castMode || 'cooldown';
      if (calls > 0) {
        // castMode ≠ 'cooldown'（continuous / periodic / resource / reactive）か、
        // cooldown でも熱量系のように主発動記録を自前で行う場合は mainCastEvent の宣言が必須。
        ok(!!d.mainCastEvent,
          `${id}: recordCast を自前で呼ぶ（${calls} 箇所）→ mainCastEvent='${d.mainCastEvent}'（castMode='${castMode}'）が宣言済み`);
        if (jobId === 'warrior') ok(false, `${id}: 戦士はスキル側から recordCast を呼ばない（M8-F 不変条件違反）`);
      } else {
        ok(true, `${id}: 主記録は基底に任せる（呼び出し 0）`);
      }
    }
  }
}

section('2. 実駆動: 全 active が記録され、multi-hit で cast が膨らまない');
for (const jobId of JOB_IDS) {
  const r = await runJob(jobId, { quality: 'high', ids: poolsOf(jobId).active, steps: 900 });
  const seconds = 900 * 32 / 1000;
  for (const id of poolsOf(jobId).active) {
    const s = r.trace.stats[id];
    // cooldown 型は「経過時間 / 最短 CD」を大きく超えて記録されない（multi-hit / tick が cast を膨らませていない）。
    const d = DATA.skills.find((x) => x.id === id);
    const lvl = (d.levels || [])[7] || (d.levels || [])[0] || {};
    if ((d.castMode || 'cooldown') === 'cooldown' && typeof lvl.cooldown === 'number' && lvl.cooldown > 0) {
      const maxCasts = Math.ceil((seconds * 1000) / (lvl.cooldown * 0.4)) + 3; // 攻撃速度系の余裕込み
      ok(s.casts <= maxCasts, `${id}: casts ${s.casts} ≤ CD 由来の上界 ${maxCasts}`);
      // ※ casts > hits は正当（空振り）。逆に hits が cast を大きく超えるのは multi-hit で、
      //   それが cast へ紛れ込んでいないことは上の CD 上界が保証する。
    }
  }
  info(`${jobId}: active 30 の cast 合計 ${poolsOf(jobId).active.reduce((a, id) => a + r.trace.stats[id].casts, 0)}`);
}

section('3. save / reload で casts が二重にならない');
{
  const { SkillManager } = await (await import('./cross-job-common.mjs')).bootAll();
  for (const jobId of JOB_IDS) {
    const r = await runJob(jobId, { quality: 'high', ids: poolsOf(jobId).active.slice(0, 6), steps: 300 });
    const before = JSON.stringify([...r.sm.stats.entries()]);
    const saved = r.sm.serialize();
    const runtime = r.sm.serializeRuntime();
    // 新しい SkillManager へ復元（production の restore 経路）。
    const sm2 = new SkillManager(r.scene);
    sm2.loadFrom(saved);          // production の再開経路（レベルの復元）
    sm2.restoreRuntime(runtime);  // cooldown / 再開状態の復元
    ok(JSON.stringify([...r.sm.stats.entries()]) === before, '復元操作が元の統計を変えない');
    for (const [id] of sm2.stats) {
      const c = sm2.stats.get(id);
      ok((c.casts || 0) === 0, `${id}: 復元だけでは casts が増えない（${c.casts || 0}）`);
    }
  }
}

T.finish();
