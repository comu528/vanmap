// 残響詠唱・灰燼分身の複製における再帰防止（M6-D）を CastPolicy の純ロジックで検証する。Node標準のみ。
import { resolveCastMeta, defaultCastContext, replayContext, canCastTriggerEcho, canCloneCopy } from '../src/systems/CastPolicy.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// ===== 1. メタ解決 =====
section('1. cast メタデータの解決');
{
  const std = resolveCastMeta({ echoPolicy: 'standard', clonePolicy: 'standard' });
  ok(std.canTriggerEcho === true && std.canBeCopiedByClone === true, 'standard は echo/clone 対象');
  const forb = resolveCastMeta({ echoPolicy: 'forbidden', clonePolicy: 'forbidden' });
  ok(forb.canTriggerEcho === false && forb.canBeCopiedByClone === false, 'forbidden は echo/clone 対象外');
  const def = resolveCastMeta({ isDefensive: true });
  ok(def.canTriggerEcho === false, '防御スキルは既定で残響を進めない');
  const cust = resolveCastMeta({ echoPolicy: 'custom', clonePolicy: 'custom', usesResourceCost: true });
  ok(cust.canTriggerEcho === true && cust.canBeCopiedByClone === true, 'custom(資源消費)は複製可（攻撃部分のみ）');
  const undef = resolveCastMeta(undefined);
  ok(undef.echoPolicy === 'standard' && undef.clonePolicy === 'standard', '未定義は standard 既定');
  const bad = resolveCastMeta({ echoPolicy: 'weird' });
  ok(bad.echoPolicy === 'standard', '不正な policy は standard へ丸める');
}

// ===== 2. 1世代で停止 =====
section('2. echo/clone は normal から1世代で停止');
{
  const root = defaultCastContext('fireball');
  const echo = replayContext(root, 'echo', 0.6, 1);
  ok(echo && echo.origin === 'echo' && echo.generation === 1, 'normal→echo は1世代');
  ok(echo.powerMultiplier === 0.6 && echo.suppressEcho && echo.suppressClone, 'echo は威力倍率＋以後抑制');
  const clone = replayContext(root, 'clone', 0.35, 1);
  ok(clone && clone.origin === 'clone' && clone.generation === 1, 'normal→clone は1世代');

  // echo→* / clone→* は一切発生しない
  ok(replayContext(echo, 'echo', 0.6, 1) === null, 'echo→echo は発生しない');
  ok(replayContext(echo, 'clone', 0.35, 1) === null, 'echo→clone は発生しない');
  ok(replayContext(clone, 'echo', 0.6, 1) === null, 'clone→echo は発生しない');
  ok(replayContext(clone, 'clone', 0.35, 1) === null, 'clone→clone は発生しない');

  // 世代上限
  ok(replayContext(root, 'echo', 0.6, 0) === null, 'maxGen=0 なら発生しない（世代上限超）');
  // maxCopyGeneration は 1（データ）
  const deepAttempt = replayContext(echo, 'echo', 0.6, 5);
  ok(deepAttempt === null, 'maxGen を上げても非normal親からは発生しない（origin ガードが優先）');
}

// ===== 3. echo カウンター起動条件 =====
section('3. echo トリガー・clone 複製の可否');
{
  const meta = resolveCastMeta({ echoPolicy: 'standard', clonePolicy: 'standard' });
  ok(canCastTriggerEcho(meta, defaultCastContext('x')) === true, 'normal 発動は残響を進める');
  ok(canCastTriggerEcho(meta, replayContext(defaultCastContext('x'), 'echo', 0.6, 1)) === false, 'echo 発動は残響を進めない（自己増殖防止）');
  ok(canCastTriggerEcho(meta, replayContext(defaultCastContext('x'), 'clone', 0.35, 1)) === false, 'clone 発動は残響を進めない');
  const forb = resolveCastMeta({ echoPolicy: 'forbidden', clonePolicy: 'forbidden' });
  ok(canCastTriggerEcho(forb, defaultCastContext('x')) === false, 'forbidden は残響を進めない');
  ok(canCloneCopy(meta) === true && canCloneCopy(forb) === false, 'clone 複製可否');
}

// ===== 4. 実データとの整合（新スキルの policy） =====
section('4. 新スキル/進化の cast メタが妥当');
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const skills = JSON.parse(readFileSync(join(dir, 'skills.json'), 'utf8')).skills;
  const evos = JSON.parse(readFileSync(join(dir, 'skill-evolutions.json'), 'utf8')).evolutions;
  const byId = (id) => skills.find((s) => s.id === id);
  // 期待する policy
  const EXPECT = {
    ash_doppelganger: ['forbidden', 'forbidden'], blazing_step: ['forbidden', 'forbidden'],
    bloodfire_pact: ['custom', 'custom'], bullet_furnace: ['custom', 'custom'],
    scorching_ray: ['standard', 'standard'], ember_minefield: ['standard', 'standard'],
    flame_crescent: ['standard', 'standard'], ricochet_ember: ['standard', 'standard'],
    four_sided_inferno: ['standard', 'standard'], molten_chains: ['standard', 'standard'],
  };
  for (const [id, [ep, cp]] of Object.entries(EXPECT)) {
    const m = resolveCastMeta(byId(id));
    ok(m.echoPolicy === ep && m.clonePolicy === cp, `${id} の policy = ${ep}/${cp}`);
  }
  // 危険スキルは複製・残響対象外
  for (const id of ['ash_doppelganger', 'blazing_step']) {
    const m = resolveCastMeta(byId(id));
    ok(!m.canTriggerEcho && !m.canBeCopiedByClone, `${id} は残響・複製の対象外`);
  }
  // 全ての cast policy が妥当な値
  for (const s of [...skills, ...evos]) {
    if (s.echoPolicy != null) ok(['standard', 'custom', 'forbidden'].includes(s.echoPolicy), `${s.id} echoPolicy 妥当`);
    if (s.clonePolicy != null) ok(['standard', 'custom', 'forbidden'].includes(s.clonePolicy), `${s.id} clonePolicy 妥当`);
  }
}

console.log('');
if (fail) { console.error(`✗ cast複製安全テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ cast複製安全テスト成功: ${pass} 件すべて通過`); process.exit(0); }
