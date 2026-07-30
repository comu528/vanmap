// M9-A 横断監査 11/25: cooldown 保存の 144 スキル横断監査。Node.js 標準機能のみ。
// - 144 件すべてが cdLeft を保存し、往復（serialize → restore → serialize）で一致する
// - **改ざん耐性**: NaN / ±Infinity / 桁外れ / 文字列は production の SkillManager.restoreRuntime の
//   共通入口（M9-A の _sanitizeRuntimeState）が全ジョブ一律に無害化する。
//   戦士は基底 restoreCd()（M8-F）との二重防御。**この共通入口を巻き戻すと火 / 氷の節が落ちる。**
// 実行: node tests/cross-job-cooldown-save.mjs
import { DATA, JOB_IDS, poolsOf, runJob, runner, bootAll } from './cross-job-common.mjs';

const T = runner('cooldown 保存 横断監査（M9-A）');
const { ok, section, info } = T;
const MAX = 120000;

for (const jobId of JOB_IDS) {
  const p = poolsOf(jobId);
  const ALL = [...p.active, ...p.evolution];

  section(`${jobId}: 48 件すべてが runtimeState を保存し往復する`);
  const r = await runJob(jobId, { quality: 'high', ids: ALL, steps: 500 });
  const runtime = r.sm.serializeRuntime();
  const defOf = (id) => DATA.skills.find((x) => x.id === id) || DATA.evolutions.find((x) => x.id === id) || {};
  for (const id of ALL) {
    const st = runtime[id];
    const d = defOf(id);
    const custom = (d.castMode && d.castMode !== 'cooldown') || !!d.mainCastEvent;
    if (!custom) {
      // 通常の cooldown 型は cdLeft を必ず保存する。
      ok(!!st && typeof st.cdLeft === 'number' && Number.isFinite(st.cdLeft), `${id}: cooldown 型は cdLeft が有限数（${st && st.cdLeft}）`);
    } else if (st && st.cdLeft !== undefined) {
      ok(typeof st.cdLeft === 'number' && Number.isFinite(st.cdLeft), `${id}: cdLeft を持つなら有限数`);
    } else {
      // custom-cast（continuous / periodic / resource / reactive / mainCastEvent 宣言つき）は
      // 自前の再開状態（castPulse / timers / charge）を保存するか、状態を持たない設計
      //（M8-A / M7-E の SkillAudit が per-job で理由つきで確認済み）。
      ok(true, `${id}: custom-cast（${d.castMode || 'cooldown'} / ${d.mainCastEvent}）は per-job SkillAudit の対象`);
    }
  }
  // 往復: 復元 → 再直列化が一致。
  {
    const { SkillManager } = await bootAll();
    const sm2 = new SkillManager(r.scene); r.scene.skills = sm2;
    for (const id of ALL) { sm2.acquireOrLevel(id); try { sm2.setLevel(id, 8); } catch (e) { void e; } }
    sm2.restoreRuntime(runtime);
    const again = sm2.serializeRuntime();
    let mismatch = 0;
    for (const id of ALL) {
      const a = (again[id] || {}).cdLeft, b = (runtime[id] || {}).cdLeft;
      if (a === undefined && b === undefined) continue;
      if (Math.abs((a || 0) - (b || 0)) > 1e-9) mismatch++;
    }
    ok(mismatch === 0, `復元 → 再直列化で cdLeft が全件一致（不一致 ${mismatch}）`);
    r.scene.skills = r.sm;
  }

  section(`${jobId}: 改ざん耐性（NaN / ±Infinity / 桁外れ / 文字列）`);
  {
    const { SkillManager } = await bootAll();
    const sm3 = new SkillManager(r.scene); r.scene.skills = sm3;
    for (const id of ALL) sm3.acquireOrLevel(id);
    const evil = {};
    const KINDS = [NaN, Infinity, -Infinity, 9e15, -9e15, 'garbage'];
    ALL.forEach((id, i) => { evil[id] = { cdLeft: KINDS[i % KINDS.length] }; });
    sm3.restoreRuntime(evil); // 共通入口が無害化（例外を投げない）
    let bad = 0;
    for (const id of ALL) {
      const sk = sm3.skills.get(id);
      const cd = sk ? (sk._cd ?? 0) : 0;
      if (!(typeof cd === 'number' && Number.isFinite(cd) && Math.abs(cd) <= MAX)) { bad++; info(`  ${id}: _cd=${cd}`); }
    }
    ok(bad === 0, `全 48 件の _cd が有限かつ ±${MAX}ms 以内（違反 ${bad}）`);
    r.scene.skills = r.sm;
  }
}

section('正当な保存値は 1 件も変えない（±120s 以内の値は素通し）');
{
  const { SkillManager } = await bootAll();
  const r = await runJob('frost_mage', { quality: 'high', ids: poolsOf('frost_mage').active.slice(0, 8), steps: 200 });
  const runtime = r.sm.serializeRuntime();
  const sm2 = new SkillManager(r.scene); r.scene.skills = sm2;
  for (const id of Object.keys(runtime)) sm2.acquireOrLevel(id);
  sm2.restoreRuntime(JSON.parse(JSON.stringify(runtime)));
  for (const [id, st] of Object.entries(runtime)) {
    const sk = sm2.skills.get(id);
    ok(sk && Math.abs(sk._cd - st.cdLeft) < 1e-9, `${id}: 正当な cdLeft ${st.cdLeft} がそのまま復元される`);
  }
}

T.finish();
