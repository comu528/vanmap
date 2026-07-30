// M9-A 横断監査 18/25: telemetry の横断監査。Node.js 標準機能のみ。
// production の CombatTelemetry を直接駆動し、共通 / job 固有キーの分類・dead key・外部送信 0・
// debugRun 分離・品質記録が表示情報のみであることを確認する。
// 実行: node tests/cross-job-telemetry.mjs
import { runner, readSrc, allSrc, JOB_IDS } from './cross-job-common.mjs';
import { CombatTelemetry } from '../src/systems/CombatTelemetry.js';

const T = runner('telemetry 横断監査（M9-A）');
const { ok, section, info } = T;

section('1. 共通キーと job 固有キーの分類（構造がジョブで変わらない）');
{
  for (const jobId of JOB_IDS) {
    const t = new CombatTelemetry({ seed: 1, difficulty: 1, quality: 'high', jobId, jobLevelAtStart: 1 });
    const fin = t.finalize();
    // 共通構造は { run, skills }。run 配下に status / warrior / draftGuidance / caps がぶら下がる。
    for (const k of ['run', 'skills']) ok(k in fin, `${jobId}: finalize() にトップレベル ${k} がある`);
    for (const k of ['status', 'warrior', 'draftGuidance', 'caps']) {
      ok(k in fin.run, `${jobId}: run.${k} がある（キー構造をジョブで変えない）`);
    }
    // ジョブ外では全 0 のまま出力される。
    ok(Object.values(fin.run.status).every((v) => v === 0), `${jobId}: 初期の status ブロックが全 0`);
  }
  const a = new CombatTelemetry({ jobId: 'flame_witch' }).finalize();
  const b = new CombatTelemetry({ jobId: 'warrior' }).finalize();
  const keysOf = (o) => JSON.stringify(Object.keys(o).sort());
  ok(keysOf(a) === keysOf(b), 'finalize() のトップレベルキーがジョブ間で同一');
}

section('2. 品質は run ヘッダの表示情報のみ（gameplay 集計へ影響しない）');
{
  const mk = (q) => {
    const t = new CombatTelemetry({ seed: 9, quality: q, jobId: 'warrior' });
    t.noteFrame(16); t.noteFrame(17);
    return t.finalize();
  };
  const lo = mk('low'), hi = mk('ultra');
  ok(lo.run.quality === 'low' && hi.run.quality === 'ultra', 'run.quality は記録される（表示用）');
  const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.run.quality; return JSON.stringify(c); };
  ok(strip(lo) === strip(hi), 'quality 以外の全キーが一致（品質は集計へ影響しない）');
}

section('3. 外部送信 0（fetch / XHR / beacon / WebSocket がソースに無い）');
{
  const src = allSrc();
  // fetch は DataManager が**自リポジトリの data/*.json を相対パスで読む** 1 か所だけ（外部送信ではない）。
  const fetches = src.match(/fetch\(/g) || [];
  ok(fetches.length === 1, `fetch( は data 読み込みの 1 か所だけ（${fetches.length}）`);
  ok(/await fetch\(path, \{ cache: 'no-cache' \}\)/.test(readSrc('src/systems/DataManager.js')), 'fetch は DataManager の data 読み込み');
  for (const bad of ['XMLHttpRequest', 'sendBeacon', 'new WebSocket', 'http://', 'https://cdn']) {
    ok(!src.includes(bad), `ソースに ${bad} が無い（外部送信 0）`);
  }
}

section('4. debugRun の分離');
{
  const t = new CombatTelemetry({ jobId: 'warrior', debugRun: true });
  ok(t.finalize().run.debugRun === true, 'debugRun フラグが finalize に残る');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/debugRun/.test(bs), 'BattleScene が debugRun を扱う');
  const pm = readSrc('src/systems/ProgressionManager.js') + bs;
  ok(/debugRun/.test(pm), '通常統計への合算が debugRun でゲートされる');
}

section('5. dead key 検査（finalize のキーが表示 / 保存 / 分析のどこかで読まれる）');
{
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const fin = t.finalize();
  const consumers = allSrc();
  const unread = [];
  for (const k of Object.keys(fin.run.warrior)) if (!consumers.includes(k)) unread.push(k);
  ok(unread.length === 0, `warrior telemetry の dead key 0（${unread.join(',') || 'なし'}）`);
  const unread2 = [];
  for (const k of Object.keys(fin.run.status)) if (!consumers.includes(k)) unread2.push(k);
  ok(unread2.length === 0, `status telemetry の dead key 0（${unread2.join(',') || 'なし'}）`);
}

section('6. save / reload で telemetry が二重にならない（加算的 note の再適用が無い）');
{
  const t = new CombatTelemetry({ jobId: 'frost_mage' });
  t.status.chillApplied = 10;
  const f1 = JSON.stringify(t.finalize());
  const f2 = JSON.stringify(t.finalize());
  ok(f1 === f2, 'finalize() が冪等（呼ぶたびに値が増えない）');
}

T.finish();
