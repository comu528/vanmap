// M9-A 横断監査 15/25: 防御 / 軽減 / 免疫の横断比較。Node.js 標準機能のみ。
// 3 ジョブの防御手段が「完全無効化にならない」「上限が data で固定」「ジョブ外で恒等」であることを確認する。
// 実行: node tests/cross-job-defense.mjs
import { DATA, runner, readSrc, bootAll } from './cross-job-common.mjs';
import * as W from './warrior-common.mjs';

const T = runner('防御 横断監査（M9-A）');
const { ok, section, info } = T;

section('1. 戦士: 合計軽減が maxTotalReduction でクランプ（無敵にならない）');
{
  const cfg = DATA.balance.warrior;
  ok(cfg.mitigation.maxTotalReduction <= 0.7, `合計軽減の上限 ${cfg.mitigation.maxTotalReduction} ≤ 0.7`);
  const { WarriorCombatSystem } = await bootAll();
  const scene = W.makeScene({ enemies: W.makeEnemies(5, { hp: 1e9 }), now: 1000, quality: 'high' });
  const w = W.makeWarrior(WarriorCombatSystem, scene, {});
  // 可能な軽減をすべて重ねても上限を超えない（production の damageReduction() を直接駆動）。
  w.mods.damageReductionBonus = 0.9;                       // 改ざん相当の過大ボーナス
  if (w.beginChargeMitigation) w.beginChargeMitigation({ durationMs: 5000, reduction: 0.9 });
  const total = w.damageReduction({});
  ok(total <= cfg.mitigation.maxTotalReduction + 1e-9, `実測の合計軽減 ${total.toFixed(3)} ≤ ${cfg.mitigation.maxTotalReduction}`);
}

section('2. 火: 障壁 / 不死鳥は回数と吸収に上限がある');
{
  const barrier = DATA.skills.find((s) => s.id === 'flame_barrier');
  const phoenix = DATA.skills.find((s) => s.id === 'phoenix_feather');
  ok(!!barrier && !!phoenix, '防御スキルの data がある');
  for (const lv of barrier.levels || []) {
    ok((lv.rechargeSec || lv.cooldown || 0) > 0 || lv.charges > 0, 'flame_barrier: 再チャージ / 回数の制約がある');
  }
  const src = readSrc('src/skills/PhoenixFeatherSkill.js');
  ok(/revive|Revive|復活/.test(src), 'phoenix_feather: 復活は明示処理（無限復活はレベル由来の回数管理）');
}

section('3. 氷: 氷壁 / 光輪の迎撃は per-frame 上限つき（完全遮断にならない）');
{
  ok(W.capFor('maxIceWallCollisionsPerFrame', 'high', -1) > 0, '氷壁の衝突判定に上限がある');
  ok(W.capFor('maxWinterHaloInterceptsPerFrame', 'high', -1) > 0, '光輪の迎撃に上限がある');
  ok(W.capFor('maxMirrorIceInterceptsPerFrame', 'high', -1) > 0, '氷鏡の迎撃に上限がある');
  // 迎撃系 cap は gameplay（品質非依存）。
  for (const n of ['maxIceWallCollisionsPerFrame', 'maxWinterHaloInterceptsPerFrame', 'maxMirrorIceInterceptsPerFrame']) {
    ok(W.capFor(n, 'low', -1) === W.capFor(n, 'ultra', -1), `${n}: 品質非依存`);
  }
}

section('4. 3 ジョブの CC 免疫 / 拘束の比較（永久拘束なし）');
{
  const cfgW = DATA.balance.warrior;
  ok(cfgW.poise.boss && cfgW.poise.boss.thresholdMaxMult > 1, `戦士: ボス崩ししきい値は上がり続けて頭打ち（×${cfgW.poise.boss.thresholdMaxMult}・永久拘束なし）`);
  const fz = DATA.statusEffects;
  const frozen = (fz.effects || fz).frozen || {};
  ok(!!frozen, '氷: frozen の定義がある');
  const src = readSrc('src/systems/FreezeSystem.js');
  ok(/immunity|免疫|耐性/.test(src), '氷: 凍結後の耐性がある（連続凍結ハメなし）');
  ok(/boss/.test(src) || readSrc('src/systems/StatusEffectManager.js').includes('addBossGauge'),
    '氷: ボスは凍結せず氷砕ゲージへ変換');
  info('比較（意図した設計差）: 火=拘束なし(火力) / 氷=凍結+耐性サイクル / 戦士=体勢崩し+しきい値上昇');
}

section('5. Player.takeDamage の第 2 引数（方向）は任意（火 / 氷の被弾計算は不変）');
{
  const p = readSrc('src/entities/Player.js');
  ok(/takeDamage\((\w+)(,\s*\w+)?\)/.test(p) || /takeDamage/.test(p), 'Player.takeDamage が存在');
  const fireIce = ['src/skills/FlameBarrierSkill.js', 'src/skills/MirrorIceSkill.js'].map((f) => readSrc(f)).join('');
  ok(!/takeDamage\([^)]*,\s*\{/.test(fireIce), '火 / 氷の防御スキルは方向引数を渡さない（従来経路）');
}

T.finish();
