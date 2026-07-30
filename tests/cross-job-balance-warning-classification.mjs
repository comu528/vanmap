// M9-A.1 8/15: warning の分類（§8）。Node.js 標準機能のみ。
// 目安を超えた指標を「ハーネス不足 / profile 偏り / role 差 / bug / balance」へ分類し、
// **明確な bug 以外は documented note** として docs へ記録されていることを検証する。
// 実行: node tests/cross-job-balance-warning-classification.mjs
import { JOB_IDS, makeBattle, runProfile, instrument, collectMetrics, readSrc, HEAVY, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('warning 分類（M9-A.1）');
const { ok, section, info } = T;
const SEEDS = HEAVY ? [101, 202, 303, 404, 505] : [101, 202, 303];
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const CLASSES = ['harness', 'profile', 'role', 'bug', 'balance'];

// M9-A.1 で分類を確定した warning（docs/cross-job-final-balance.md の表と一致していなければ落ちる）。
const CLASSIFIED = {
  DPS_RATIO: 'role',            // 火 = 単体 / 面の直接火力・氷 = CC 主体・戦士 = 近接持続。役割差
  BOSS_KILL_TIME_RATIO: 'role', // ボスは凍結しない（氷砕ゲージ経由）ため氷は時間が掛かる
  SURVIVAL_DIFF: 'role',        // 戦士だけが軽減 / 不屈 / 撃破回復を持つ
  TOP_SHARE: 'profile',         // slot8 = プール先頭 8 種の部分 build。全 30 種では per-job スイートが 35% 以下を保証
  ZERO_UTILITY_IN_PROFILE: 'profile', // その profile に刺激が無い reactive（stimulus profile で 100% 反応）
  DAMAGE_TAKEN_RATIO: 'role',
  HEALING_RATIO: 'role',
};

section('1. 分類キーがすべて既知のクラスに属する');
for (const [k, v] of Object.entries(CLASSIFIED)) ok(CLASSES.includes(v), `${k} → ${v}（既知クラス）`);

section('2. 実測して目安超過を検出し、分類済みであることを確認する');
const found = [];
{
  const tbl = {};
  for (const prof of ['normal', 'elite', 'boss', 'survival']) {
    tbl[prof] = {};
    for (const j of JOB_IDS) {
      const ms = [];
      for (const seed of SEEDS) {
        resetPhysics();
        const h = instrument(await makeBattle({ jobId: j, profile: prof, build: 'slot8', seed }));
        runProfile(h);
        ms.push(collectMetrics(h));
      }
      tbl[prof][j] = {
        dps: med(ms.map((m) => m.offense.dps)), surv: med(ms.map((m) => m.defense.survivedMs)),
        topShare: med(ms.map((m) => m.offense.topShare)),
        bossKillMs: ms.every((m) => m.offense.bossKillMs != null) ? med(ms.map((m) => m.offense.bossKillMs)) : null,
        heal: med(ms.map((m) => m.defense.healing)),
        zeroUtil: ms[0].offense.zeroUtility.length,
      };
    }
  }
  const ratio = (vals) => Math.max(...vals) / Math.max(1, Math.min(...vals));
  for (const prof of Object.keys(tbl)) {
    const r = ratio(JOB_IDS.map((j) => tbl[prof][j].dps));
    if (r > 1.8) found.push(['DPS_RATIO', `${prof} 比 ${r.toFixed(2)}`]);
    const sv = ratio(JOB_IDS.map((j) => tbl[prof][j].surv));
    if (sv > 1.4) found.push(['SURVIVAL_DIFF', `${prof} 比 ${sv.toFixed(2)}`]);
    for (const j of JOB_IDS) {
      if (tbl[prof][j].topShare > 0.35) found.push(['TOP_SHARE', `${prof}/${j} ${tbl[prof][j].topShare}`]);
      if (tbl[prof][j].zeroUtil > 0) found.push(['ZERO_UTILITY_IN_PROFILE', `${prof}/${j} ${tbl[prof][j].zeroUtil} 件`]);
    }
  }
  const bk = JOB_IDS.map((j) => tbl.boss[j].bossKillMs).filter((v) => v != null);
  if (bk.length === JOB_IDS.length && ratio(bk) > 2.0) found.push(['BOSS_KILL_TIME_RATIO', `比 ${ratio(bk).toFixed(2)}`]);

  const keys = [...new Set(found.map((f) => f[0]))];
  info(`検出した warning: ${keys.join(', ') || 'なし'}`);
  for (const f of found.slice(0, 12)) info(`  ${f[0]}: ${f[1]}`);
  for (const k of keys) ok(!!CLASSIFIED[k], `${k}: 分類済み（${CLASSIFIED[k]}）`);
  // bug / balance に分類された warning が 1 件も無いこと（あれば修正が必要）。
  const needFix = keys.filter((k) => CLASSIFIED[k] === 'bug' || CLASSIFIED[k] === 'balance');
  ok(needFix.length === 0, `bug / balance 分類の warning が 0 件（${needFix.join(',') || 'なし'}）`);
}

section('3. documented note が docs に実在する');
{
  const doc = readSrc('docs/cross-job-final-balance.md');
  for (const k of Object.keys(CLASSIFIED)) ok(doc.includes(k), `docs/cross-job-final-balance.md に ${k} の記載がある`);
  for (const c of CLASSES) ok(doc.includes(c), `分類語 ${c} が docs にある`);
  ok(/balance 変更(は)?\s*0\s*件|バランス値の変更は\s*0\s*件|balance 変更 0 件/.test(doc), 'balance 変更 0 件が明記されている');
}

section('4. 明確な bug として修正したものは docs に別掲されている');
{
  const doc = readSrc('docs/cross-job-final-balance.md') + readSrc('docs/cross-job-full-balance-harness.md');
  ok(doc.includes('burningDamage'), 'burningDamage の dead key 修正が記録されている');
}

T.finish();
