// 戦士 完成監査 17/23: F8 / F9 完成監査（F10 非回帰）（M8-F §19）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-debug-panels.mjs
import { DATA, WARRIOR, EXPECTED, readSrc, runner } from './warrior-common.mjs';
const T = runner('戦士 F8 / F9 完成監査（M8-F）');
const { ok, section, info } = T;
const BS = readSrc('src/scenes/BattleScene.js');
const methodBody = (src, name) => {
  const re = new RegExp('(^|\\n)\\s*' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  for (let k = open; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(open + 1, k); } }
  return null;
};

// ===== 1. F8: 戦士分析の項目 =====
section('1. F8（バランス分析）に戦士の全観点が載る');
{
  const body = methodBody(BS, 'jobAnalysisText') || methodBody(BS, '_jobAnalysis') || BS;
  ok(/戦士/.test(body), 'F8 に戦士の節がある');
  for (const label of ['戦士 Wave1', '戦士 Wave2', '戦士 最終Wave']) ok(BS.includes(label), `F8 に「${label}」の見出しがある`);
  for (const key of ['闘気', 'コンボ', '体勢', '反撃', '処刑', '打ち上げ', '前面防御', '掴み', '戦旗',
    '貫穿突き', '一騎討ち', '修羅の構え', '震天踏破', '刃返し', '反射弾']) {
    ok(BS.includes(key), `F8 / F9 に「${key}」の表示がある`);
  }
  ok(/カタログ active\$\{/.test(BS), 'F8 がカタログ規模を data から出す');
  ok(/active補助の進化/.test(BS), 'F8 が active 補助の進化到達率を個別に出す');
  ok(/build が 1 進化へ偏っている/.test(BS), 'F8 に build 偏りの警告がある');
  ok(/抑制\/f|表示上限到達/.test(BS), 'F8 に性能 / 上限の項目がある');
  ok(/debugRun/.test(BS), 'F8 が debugRun を明示する');
  ok(/外部送信しません/.test(BS), 'F8 / F9 に「外部送信しません」の明記がある');
}

// ===== 2. F8 の警告 =====
section('2. F8 の警告が全観点をカバーする');
{
  const WARN = ['⚠ 昇竜斬はあるが打ち上げ0', '⚠ 前面防御は稼働しているが受け流し0', '⚠ 豪腕投げはあるが掴み0',
    '⚠ 戦旗は立つが内側に居た時間0', '⚠ 戦斧の帰りが 1 度も当たっていない', '⚠ build が 1 進化へ偏っている',
    '⚠ 直線攻撃が 1 度も複数体を貫いていない', '⚠ 一騎討ちは成立するが対象へ 1 度も当たっていない',
    '⚠ 構えは発動しているが稼働時間 0', '⚠ 震天踏破が 1 度も移動していない',
    '⚠ 刃返しの窓は開くが弾を 1 度も検知していない'];
  for (const w of WARN) ok(BS.includes(w), `警告「${w}」がある`);
  info(`F8 の戦士警告: ${WARN.length} 種`);
}

// ===== 3. F9: 戦士検証パネル =====
section('3. F9（戦士検証）に全 48 スキル・全機構が載る');
{
  const body = methodBody(BS, '_warriorReport');
  ok(!!body, '_warriorReport がある');
  for (const key of ['ジョブ', 'Job補正', '闘気', 'コンボ', '強靱', '不屈', '体勢崩し', 'ボス',
    '戦吼', '反撃の調停', '処刑', '移動', '打ち上げ', '前面防御', '掴み', '戦旗の陣',
    '貫穿突き', '一騎討ち', '修羅の構え', '震天踏破', '刃返し', '所持', 'Job Lv80']) {
    ok(body.includes(key), `F9 に「${key}」がある`);
  }
  ok(/外部送信しません/.test(body), 'F9 に「外部送信しません」がある');
  // 所持スキル / passive を data から列挙する（ハードコード一覧を持たない）。
  ok(/this\.skills\.skills\.keys\(\)/.test(body), 'F9 が所持 active を実データから列挙する');
  ok(/this\.passives\.ownedList\(\)/.test(body), 'F9 が所持 passive を実データから列挙する');
  ok(/activeSkillPool/.test(body), 'F9 が Job Lv80 対象を data から出す');
  // 「正式状態ではない」ことを明記する。
  ok(/正式な状態ではない|正式状態ではない/.test(body), 'F9 が決闘 / 構えが正式状態でないことを明記する');
}

// ===== 4. F9 のデバッグ操作が全 48 件を触れる =====
section('4. F9 のデバッグ操作が全 48 スキルを対象にできる');
{
  const panel = methodBody(BS, 'toggleWarriorDebug');
  ok(!!panel, 'toggleWarriorDebug がある');
  ok(/activeSkillPool|ACT\b/.test(panel), 'active プールを data から列挙する');
  ok(/evolutionPool|EVO\b/.test(panel), '進化プールを data から列挙する');
  ok(/passiveSkillPool|PAS\b/.test(panel), 'passive プールを data から列挙する');
  ok(/markDebugRun\(\)/.test(BS), 'デバッグ操作は debugRun を立てる（通常統計へ混ぜない）');
  // 数を直書きしていない。
  ok(/ACT\.length|activeSkillPool \|\| \[\]\)\.length/.test(panel + BS), 'カタログ数を直書きしない');
}

// ===== 5. F10 は変えていない =====
section('5. F10（品質切替）の表示・挙動を変えていない');
{
  ok(/F10/.test(BS), 'F10 が残っている');
  const gc = readSrc('src/config/game-config.js');
  for (const k of ['duel', 'trance', 'deflect', 'march', 'line']) {
    ok(!new RegExp(k, 'i').test(gc), `品質設定に ${k} が混ざっていない`);
  }
  ok(/skillCap\(/.test(BS), '品質は skillCap 経由でだけ効く');
  // 状態異常デバッグ（F10 相当）は氷 / 火の側だけ。
  ok(/toggleStatusDebug|StatusDebugPanel/.test(BS), '状態異常デバッグの経路が残っている');
}

// ===== 6. profile を汚染しない =====
section('6. F8 / F9 が profile を汚染せず、二重取得 / CD 二重を作らない');
{
  const bp = methodBody(BS, 'startBalancePlaytest');
  ok(!!bp, 'startBalancePlaytest がある');
  ok(/profile は不変|profile を変更しない/.test(BS), 'profile 不変が明記されている');
  ok(/markDebugRun\(\)/.test(bp), '検証周回は debugRun');
  ok(!/this\.profile\.[a-zA-Z]+\s*=/.test(bp), 'profile へ書き込まない');
  // デバッグの一括取得は acquireOrLevel を通す（CD / stats を壊さない）。
  const setup = methodBody(BS, 'debugSetupWave2Evolutions') || '';
  if (setup) ok(/acquireOrLevel|setLevel/.test(setup), 'デバッグ取得も通常経路を通る');
  // 進化前後を同時に持たない（evolve が base を消す）。
  const sm = readSrc('src/systems/SkillManager.js');
  ok(/this\.skills\.delete\(baseId\)/.test(sm), '進化で base を必ず消す');
  ok(/old && old\.destroy/.test(sm), '進化で base を破棄する');
}

// ===== 7. F8 が出す指標が summary のキーと一致する =====
section('7. F8 が参照するキーが summary に存在する');
{
  const { CombatTelemetry } = await import('../src/systems/CombatTelemetry.js');
  const t = new CombatTelemetry({ jobId: 'warrior' });
  const keys = Object.keys(t.warrior);
  // F8 の本文に現れる `w.<key>` を集めて、すべて存在するか見る。
  const used = new Set();
  const body = BS.slice(BS.indexOf('— 戦士 Wave2'), BS.indexOf('— 性能 / 上限 —'));
  for (const m of body.matchAll(/\bw\.([a-zA-Z][a-zA-Z0-9]*)\b/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !keys.includes(k) && !/^(cfg|telemetry|duelBonus|getBattleTranceModifiers)$/.test(k));
  ok(missing.length === 0, `F8 が参照する指標がすべて summary にある（欠落 ${missing.join(',') || 'なし'}）`);
  info(`F8 が参照する warrior 指標: ${used.size} 件`);
}

// ===== 8. docs との一致 =====
section('8. F8 / F9 の項目が docs に記載されている');
{
  const doc = readSrc('docs/balance-testing.md');
  for (const k of ['戦士 Wave2', '戦士 最終Wave']) ok(doc.includes(k), `balance-testing.md に「${k}」がある`);
  const tg = readSrc('docs/test-guide.md');
  ok(/F8/.test(tg) && /F9/.test(tg) && /F10/.test(tg), 'test-guide.md に F8 / F9 / F10 の確認項目がある');
}

T.finish();
