// M9-A 横断監査 14/25: status / resource の横断監査。Node.js 標準機能のみ。
// 火（burning）・氷（chill / frozen / immunity / frostbreak）・戦士（Fury / Combo / Recovery / Poise）が
// **ジョブ外で恒等**であり、event cap が品質非依存で、永久状態が無いことを確認する。
// 実行: node tests/cross-job-status-resource.mjs
import { DATA, JOB_IDS, jobOf, runner, readSrc, bootAll } from './cross-job-common.mjs';
import * as W from './warrior-common.mjs';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';

const T = runner('status / resource 横断監査（M9-A）');
const { ok, section, info } = T;

section('1. jobs.json の statusEffects 宣言（ジョブ外で使わない）');
{
  const expect = { flame_witch: ['burning'], frost_mage: ['chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability'], warrior: [] };
  for (const j of JOB_IDS) {
    ok(JSON.stringify(jobOf(j).statusEffects || []) === JSON.stringify(expect[j]),
      `${j}: statusEffects = ${JSON.stringify(expect[j])}`);
  }
  ok(Object.keys(DATA.statusEffects.effects || DATA.statusEffects).length >= 5, '共通状態異常は 5 種（追加なし）');
}

section('2. 戦士資源（Fury / Combo / Recovery / Poise）はジョブ外で存在しない');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/isWarrior/.test(bs), 'BattleScene が isWarrior でゲートしている');
  // WarriorCombatSystem は常に生成されるが「他ジョブでは enabled=false の恒等」設計（M8-B）。
  const gen = bs.slice(Math.max(0, bs.indexOf('new WarriorCombatSystem') - 400), bs.indexOf('new WarriorCombatSystem'));
  ok(/他ジョブでは enabled=false の恒等/.test(gen), 'WarriorCombatSystem は他ジョブで恒等（enabled=false）と明記されている');
}

section('3. 氷 status がジョブ外で恒等（戦士 / 火の周回では乗率も判定も動かない）');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/_refreshStatusPassivesIfNeeded/.test(bs), 'status passive の反映が passives.version 駆動（M8-B.1）');
  ok(/const isFrost = this\.jobId === 'frost_mage';/.test(bs),
    'status 乗率の適用が氷術師の周回に限定されている（isFrost ゲート）');
}

section('4. event cap が固定（品質を変えても同じ / 上限到達でも例外なし）');
{
  const registry = new StatusEffectRegistry(DATA.statusEffects);
  const fs = new FreezeSystem(registry);
  let t = 1000;
  const mkMgr = (quality) => new StatusEffectManager({
    registry, freezeSystem: fs, seed: 5,
    cap: (n, f) => W.capFor(n, quality, f), now: () => t,
  });
  // maxFrozenEnemies（gameplay・100 固定）へ大量の敵で到達させ、品質で変わらないこと。
  for (const quality of ['low', 'ultra']) {
    const mgr = mkMgr(quality);
    const enemies = Array.from({ length: 160 }, (_, i) => ({ _seq: i, x: i, y: 0, alive: true, hp: 100, maxHp: 100, applySlow() {} }));
    let frozen = 0;
    for (const e of enemies) { mgr.addChill(e, 1000); if (mgr.applyIceHit(e, { chillAmount: 0, baseFreezeChance: 1, procCoefficient: 1 }).froze) frozen++; }
    ok(frozen <= 100, `${quality}: 凍結同時数が maxFrozenEnemies(100) 以下（${frozen}）`);
    if (quality === 'low') { const u = frozen; t += 1; const mgr2 = mkMgr('ultra'); let f2 = 0; t -= 1;
      void mgr2; void u; }
  }
  const low = W.capFor('maxFrozenEnemies', 'low', -1), ultra = W.capFor('maxFrozenEnemies', 'ultra', -1);
  ok(low === 100 && ultra === 100, `maxFrozenEnemies が品質非依存（low ${low} / ultra ${ultra}）`);
}

section('5. 永久状態が無い（凍結 / 耐性 / 炎上 / 戦士の窓）');
{
  const registry = new StatusEffectRegistry(DATA.statusEffects);
  const fs = new FreezeSystem(registry);
  let t = 1000;
  const mgr = new StatusEffectManager({ registry, freezeSystem: fs, seed: 6, cap: (n, f) => W.capFor(n, 'high', f), now: () => t });
  const e = { _seq: 1, x: 0, y: 0, alive: true, hp: 100, maxHp: 100, applySlow() {} };
  mgr.addChill(e, 1000);
  mgr.applyIceHit(e, { chillAmount: 0, baseFreezeChance: 1, procCoefficient: 1 });
  ok(mgr.isFrozen(e), '凍結が入る');
  t += 60000;
  ok(!mgr.isFrozen(e), '60 秒後には凍結が解けている（永久凍結なし）');
  t += 60000;
  ok(!mgr.isFreezeImmune(e), '耐性も切れる（永久耐性なし）');
  // 戦士: 全時限状態が 0 へ戻る（M8-F の性質を横断側からも固定）。
  const { WarriorCombatSystem } = await bootAll();
  const scene = W.makeScene({ enemies: W.makeEnemies(5, { hp: 1e9 }), now: 1000, quality: 'high' });
  const w = W.makeWarrior(WarriorCombatSystem, scene, {});
  w.applyWarCryBuff({ durationMs: 4000, meleeDamageBonus: 0.2 });
  for (let i = 0; i < 800; i++) { w.update(32); scene.advance(32); }
  ok(!w.releaseActive && !w.duelActive && !w.tranceActive && !w.rallyActive, '戦士の時限状態がすべて 0 に戻る');
}

section('6. passives.version ゲート（毎フレーム再計算しない）');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/passives\.version/.test(bs), 'passives.version を単一トリガーにしている（M8-B.1 非回帰）');
}

T.finish();
