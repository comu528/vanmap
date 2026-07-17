// M6-E 残響・分身イベント監査: castContext の再帰防止（残響→残響なし・分身→残響なし 等）と、
// active30種・進化18種の主発動イベント/ポリシーの一貫性を CastPolicy（純ロジック）＋data で検証する。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveCastMeta, defaultCastContext, replayContext, canCastTriggerEcho, canCloneCopy } from '../src/systems/CastPolicy.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
const skills = load('skills.json').skills;
const evolutions = load('skill-evolutions.json').evolutions;
const balance = load('balance.json');
const actives = skills.filter((s) => (s.category || 'active') === 'active');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// ===== 1. 再帰防止: 残響/分身から更なる残響/分身が発生しない =====
section('1. 残響→残響なし / 残響→分身なし / 分身→残響なし / 分身→分身なし');
const normal = defaultCastContext('fireball');
const echoCtx = replayContext(normal, 'echo', 0.6, 1);
const cloneCtx = replayContext(normal, 'clone', 0.4, 1);
ok(echoCtx && echoCtx.origin === 'echo' && echoCtx.generation === 1, 'normal→echo は1世代で生成される');
ok(cloneCtx && cloneCtx.origin === 'clone' && cloneCtx.generation === 1, 'normal→clone は1世代で生成される');
ok(replayContext(echoCtx, 'echo', 0.6, 1) === null, '残響→残響 は発生しない');
ok(replayContext(echoCtx, 'clone', 0.4, 1) === null, '残響→分身 は発生しない');
ok(replayContext(cloneCtx, 'echo', 0.6, 1) === null, '分身→残響 は発生しない');
ok(replayContext(cloneCtx, 'clone', 0.4, 1) === null, '分身→分身 は発生しない');
// suppress フラグが子で立つ。
ok(echoCtx.suppressEcho && echoCtx.suppressClone, '残響の子は echo/clone を抑制する');
ok(cloneCtx.suppressEcho && cloneCtx.suppressClone, '分身の子は echo/clone を抑制する');

// ===== 2. maxCopyGeneration/maxEchoCloneGeneration=1 を尊重（無限複製しない） =====
section('2. 世代上限');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const cap = balance.skillCaps.maxEchoCloneGeneration[q];
  ok(cap >= 1, `maxEchoCloneGeneration.${q} >= 1`);
  // gen が cap を超える親からは生成されない。
  const deep = { origin: 'normal', generation: cap, suppressEcho: false, suppressClone: false, powerMultiplier: 1, rootSkillId: 'x', parentSkillId: 'x' };
  ok(replayContext(deep, 'echo', 1, cap) === null, `gen=${cap} からは echo を生成しない (${q})`);
}

// ===== 3. canCastTriggerEcho: normal 由来かつ echo 対象のみカウンタを進める =====
section('3. 残響カウンタの起点');
for (const s of actives) {
  const meta = resolveCastMeta(s);
  // 残響の再実行(echo 由来)は決してカウンタを進めない。
  ok(canCastTriggerEcho(meta, echoCtx) === false, `${s.id}: echo 由来はカウンタを進めない`);
  ok(canCastTriggerEcho(meta, cloneCtx) === false, `${s.id}: clone 由来はカウンタを進めない`);
  // forbidden/防御/反応は normal 由来でもカウンタを進めない。
  if (meta.echoPolicy === 'forbidden' || s.isDefensive || s.isReactive) {
    ok(canCastTriggerEcho(meta, normal) === false, `${s.id}: forbidden/防御/反応は残響を起こさない`);
  }
}

// ===== 4. clonePolicy: forbidden は複製されない・custom は複製可(攻撃部分のみ) =====
section('4. 分身複製ポリシー');
for (const s of actives) {
  const meta = resolveCastMeta(s);
  if (s.clonePolicy === 'forbidden') ok(!canCloneCopy(meta), `${s.id}: forbidden は複製対象外`);
  if (s.clonePolicy === 'standard' || s.clonePolicy === 'custom') ok(canCloneCopy(meta) === (meta.canBeCopiedByClone), `${s.id}: standard/custom の複製可否が一貫`);
}

// ===== 5. 主発動イベントの一貫性（攻撃 active は mainCastEvent、DoT/連鎖等は宣言上 recordCast しない） =====
section('5. 主発動イベントの一貫性');
const ATTACK = new Set(['periodic', 'cooldown', 'continuous', 'resource']);
for (const s of actives) {
  if (ATTACK.has(s.castMode)) ok(!!s.mainCastEvent, `${s.id}: 攻撃 castMode に mainCastEvent`);
  // 防御/反応/移動は攻撃サイクルの主発動を持たない（残響非対応）。
  if (['defensive', 'movement'].includes(s.castMode)) ok(s.echoPolicy === 'forbidden', `${s.id}: ${s.castMode} は残響 forbidden`);
}

// ===== 6. 進化のポリシーが基礎と矛盾しない（forbidden 系は進化でも forbidden） =====
section('6. 進化ポリシーの整合');
const forbiddenBases = new Set(actives.filter((s) => s.echoPolicy === 'forbidden').map((s) => s.id));
for (const ev of evolutions) {
  if (forbiddenBases.has(ev.baseSkillId)) ok(ev.echoPolicy === 'forbidden', `進化 ${ev.id}: 基礎が forbidden なら進化も forbidden`);
  ok(['standard', 'custom', 'forbidden'].includes(ev.echoPolicy), `進化 ${ev.id}: echoPolicy 有効`);
  ok(['standard', 'custom', 'forbidden'].includes(ev.clonePolicy), `進化 ${ev.id}: clonePolicy 有効`);
}

console.log('');
if (fail) { console.error(`✗ 残響イベント監査テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 残響イベント監査テスト成功: ${pass} 件すべて通過`); process.exit(0); }
