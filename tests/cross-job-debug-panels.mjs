// M9-A 横断監査 19/25: F8 / F9 / F10 の横断監査。Node.js 標準機能のみ。
// 実行: node tests/cross-job-debug-panels.mjs
import { DATA, JOB_IDS, poolsOf, runner, readSrc } from './cross-job-common.mjs';

const T = runner('F8 / F9 / F10 横断監査（M9-A）');
const { ok, section, info } = T;
const BS = readSrc('src/scenes/BattleScene.js');

section('1. F8 に 3 ジョブ共通比較（M9-A）がある');
{
  ok(BS.includes('— 3 ジョブ比較（M9-A）—'), 'jobAnalysisReport に 3 ジョブ比較ブロックがある');
  ok(/for \(const j of DataManager\.jobs\)/.test(BS), '比較は DataManager.jobs（3 ジョブ全て）を走査する');
  ok(/skillCapClasses/.test(BS), 'cap 分類（visual / gameplay / safety）の件数を表示する');
  ok(/品質(.*)は演出のみ・戦闘結果へ影響しない/.test(BS), '品質が gameplay へ影響しないことを表示する');
  // 表示に使う集計を data で再現し、値が正しいことを確認する（パネルの計算式と同一）。
  const cls = DATA.balance.skillCapClasses;
  const cnt = { visual: 0, gameplay: 0, safety: 0 };
  for (const c of Object.values(cls)) if (cnt[c] != null) cnt[c]++;
  ok(cnt.visual === 47 && cnt.gameplay === 150 && cnt.safety === 20, `cap 表示の値: visual47 / gameplay150 / safety20`);
  for (const j of JOB_IDS) {
    const p = poolsOf(j);
    ok(p.active.length === 30 && p.passive.length === 4 && p.evolution.length === 18, `${j}: 比較行の元データが 30/4/18`);
  }
}

section('2. F8 の既存ジョブ固有表示を壊していない');
{
  for (const probe of ['— カタログ —', '— damage share —', '— 状態異常（実動作カウンタ）—', '— 戦士（実動作カウンタ）—', 'bossGaugeMult']) {
    ok(BS.includes(probe), `F8 分析に「${probe}」が残っている`);
  }
  ok(BS.includes('Balance Playtest'), 'F8 の通常プレイ検証パネルが残っている');
  ok(/profile（通貨\/進行\/JobXP\/クリア）は\\n変更しません/.test(BS) || BS.includes('profile を変更しない'),
    'F8 が profile を変更しないことを明記');
}

section('3. F9（戦士 / 氷術師）と F10（状態異常）が維持されている');
{
  ok(BS.includes("keydown-F9"), 'F9 バインドがある');
  ok(/isWarrior \? this\.toggleWarriorDebug\(\) : this\.toggleFrostDebug\(\)/.test(BS), 'F9 はジョブで切り替わる');
  ok(BS.includes('_warriorReport'), '戦士 F9 レポートが残っている');
  ok(BS.includes("keydown-F10") || readSrc('src/ui/StatusDebugPanel.js').length > 0, 'F10（状態異常デバッグ）が存在');
  // F10 は M9-A で変更しない。
  const sdp = readSrc('src/ui/StatusDebugPanel.js');
  ok(!/M9-A/.test(sdp), 'StatusDebugPanel に M9-A の変更が無い（F10 不変）');
  ok(/frozenCount|凍結/.test(sdp), 'F10 の氷 status デバッグ機能が残っている');
}

section('4. デバッグパネルが profile を汚染しない');
{
  // F8 / F9 のトグル関数ブロックに saveProfile 呼び出しが無い。
  const grab = (name) => {
    const i = BS.indexOf(name);
    return i < 0 ? '' : BS.slice(i, BS.indexOf('\n  }', i + 100) + 4);
  };
  for (const fn of ['toggleBalancePlaytest', 'toggleJobAnalysis', 'toggleWarriorDebug', 'toggleFrostDebug']) {
    const body = grab(fn);
    ok(body.length > 0 && !/saveProfile|SaveManager\.save/.test(body), `${fn}: profile を書き換えない`);
  }
}

section('5. デバッグは ?debug=1 のみ（通常プレイに露出しない）');
{
  ok(/RFS_DEBUG/.test(BS.slice(BS.indexOf('keydown-F8') - 900, BS.indexOf('keydown-F8'))), 'F8 バインドが RFS_DEBUG ゲート内');
}

T.finish();
