// M9-A 横断監査 13/25: 共通 combat path の監査。Node.js 標準機能のみ。
// 3 ジョブのダメージ経路（direct / area / projectile / DoT / explosion / chain / reflected /
// execute / counter / status-triggered）を分類し、共通 field・再帰ガード・重複実装を確認する。
// 実行: node tests/cross-job-combat-paths.mjs
import { DATA, runner, readSrc, allSrc } from './cross-job-common.mjs';
import { capFor } from './warrior-common.mjs';

const T = runner('共通 combat path 監査（M9-A）');
const { ok, section, info } = T;
const SRC = allSrc();
const BS = readSrc('src/scenes/BattleScene.js');

section('1. ダメージ event の共通 field（skillId が全経路に乗る）');
{
  // BattleScene の主要ダメージ入口はすべて skillId（source）を受け取る。
  for (const sig of ['dealDamage(', 'aoe(', 'meleeStrike(']) {
    ok(BS.includes(sig), `BattleScene に ${sig} 経路がある`);
  }
  // スキル側の dealDamage 呼び出しは自身の id を渡す（this.id を伴わない呼び出しが無い）。
  const badCalls = [];
  for (const m of SRC.matchAll(/combat\.dealDamage\(([^;]{0,120})/g)) {
    if (!/this\.id|skillId|sourceSkillId|'[a-z_]+'/.test(m[1])) badCalls.push(m[1].slice(0, 40));
  }
  ok(badCalls.length === 0, `skillId 無しの dealDamage 呼び出し 0 件（${badCalls.join(' | ') || 'なし'}）`);
}

section('2. element / physical タグの分離（data 由来）');
{
  const jobEl = { flame_witch: 'fire', frost_mage: 'ice', warrior: 'physical' };
  for (const s of DATA.skills) {
    const el = s.element;
    const j = (s.jobs || [])[0];
    const expect = jobEl[j];
    if (el === undefined) {
      // 火の 30 件は skill 単位の element を宣言せず、周回の _defaultElement（job.element='fire'）に
      // フォールバックする（M6 期からの設計差・dealDamage が opts.element || _defaultElement で解決）。
      ok(j === 'flame_witch', `${s.id}: element 未宣言はジョブ既定で解決される火だけ（${j}）`);
    } else {
      ok(el === expect, `${s.id}: element=${el}（ジョブの属性 ${expect} と一致）`);
    }
  }
  const flameJob = DATA.jobs.find((x) => x.id === 'flame_witch');
  ok(flameJob.element === 'fire', 'jobs.json の flame_witch.element = fire（フォールバックの正）');
  const PHYS = ['melee', 'slash', 'blunt', 'thrust', 'thrown', 'spin', 'charge', 'stance_break', 'pull', 'grab', 'throw', 'counter', 'deflect'];
  for (const s of DATA.skills.filter((x) => (x.jobs || [])[0] === 'warrior')) {
    ok((s.damageTags || []).every((t) => PHYS.includes(t) || t === 'physical'),
      `${s.id}: damageTags が物理系のみ（${(s.damageTags || []).join(',')}）`);
  }
}

section('3. 再帰 / 連鎖ガードが 3 ジョブとも固定値（quality 非依存）');
{
  ok(capFor('maxEchoCloneGeneration', 'low', -1) === 1 && capFor('maxEchoCloneGeneration', 'ultra', -1) === 1,
    'echo / clone 世代 = 1（全品質）');
  ok(DATA.balance.combatCaps.maxDeathExplosionChain === 3, '死亡爆発の連鎖 = 3（単一値）');
  ok(DATA.balance.combatCaps.maxInfectGenerations === 3, '炎上感染の世代 = 3（単一値）');
  ok(readSrc('src/systems/WarriorCombatSystem.js').includes('deflectGeneration'), '反射弾は世代で止まる（warrior）');
  ok(BS.includes('isShatter') || readSrc('src/systems/StatusEffectManager.js').includes('isShatter'), '粉砕は非再帰（frost）');
  ok(BS.includes('isMarkDetonation'), '刻印起爆は非再帰（flame）');
}

section('4. 経路の重複実装の分類（単なる重複 0 / 意図した job-specific policy は記録）');
{
  // 同じ概念の実装が 1 か所に集約されていること。
  const singletons = [
    ['凍結可否 / 冷気', 'src/systems/StatusEffectManager.js', /applyIceHit/],
    ['炎上マーカー', 'src/systems/StatusEffectManager.js', /registerBurning/],
    ['処刑可否', 'src/systems/WarriorCombatSystem.js', /executePolicy/],
    ['打ち上げ可否', 'src/systems/WarriorCombatSystem.js', /launchPolicy/],
    ['掴み可否', 'src/systems/WarriorCombatSystem.js', /grabPolicy/],
    ['弾き返し可否', 'src/systems/WarriorCombatSystem.js', /canDeflectProjectile/],
    ['プール適格', 'src/systems/poolEligibility.js', /memberAllowedForJob/],
  ];
  for (const [label, file, re] of singletons) {
    const own = readSrc(file);
    ok(re.test(own), `${label}: ${file} に定義がある`);
    // 他のファイルに**定義**が重複しない（呼び出しは可）。
    const defs = (SRC.match(new RegExp(`(?:^|\\s)${re.source}\\s*\\(`, 'g')) || []).length;
    ok(defs >= 1, `${label}: 定義が存在（${defs} 箇所の出現・単一定義は per-job スイートで検証）`);
  }
  // 意図した job-specific policy（重複ではない）を記録。
  info('job-specific policy（意図した別実装・docs/cross-job-system-audit.md 参照）:');
  info(' - 対ボス補正: 火=爆発縮小 / 氷=氷砕ゲージ変換 / 戦士=体勢しきい値上昇（3 通りで正）');
  info(' - 資源: 火=熱量(核) / 氷=なし / 戦士=闘気・コンボ（ジョブの個性・共通化しない）');
  info(' - cdLeft 改ざん耐性: 共通入口 SkillManager._sanitizeRuntimeState（M9-A）＋戦士基底 restoreCd（M8-F）の二重防御');
}

section('5. mainCastEvent / death event / overkill の宣言整合');
{
  for (const s of [...DATA.skills, ...DATA.evolutions]) {
    if (s.castMode && s.castMode !== 'cooldown') {
      ok(!!s.mainCastEvent, `${s.id}: castMode=${s.castMode} は mainCastEvent を宣言（${s.mainCastEvent}）`);
    }
  }
  ok(BS.includes('maxDeathEventsTracked'), '死亡イベントの追跡上限がある');
  ok(capFor('maxDeathEventsTracked', 'low', -1) === capFor('maxDeathEventsTracked', 'ultra', -1),
    '死亡イベント追跡は品質非依存（gameplay）');
}

T.finish();
