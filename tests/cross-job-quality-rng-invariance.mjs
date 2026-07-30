// M9-A 横断監査 5/25: 品質 4 段階で RNG cursor が変わらない。Node.js 標準機能のみ。
// - status RNG（氷の付与判定）: production の StatusEffectManager + SeededRandom を品質別 cap で駆動し、
//   RNG 消費数・cursor・付与結果が一致すること
// - draft RNG: SkillDraftManager は品質を一切読まない（source + 実駆動）
// 実行: node tests/cross-job-quality-rng-invariance.mjs
import { QUALITIES, DATA, runner, readSrc, simDraft } from './cross-job-common.mjs';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { capFor } from './warrior-common.mjs';

const T = runner('品質不変性: RNG cursor（M9-A）');
const { ok, section, info } = T;

section('1. status RNG: 品質だけを変えても消費数・cursor・付与結果が一致');
{
  const play = (quality) => {
    const registry = new StatusEffectRegistry(DATA.statusEffects);
    const fs = new FreezeSystem(registry);
    let t = 1000;
    const enemies = Array.from({ length: 60 }, (_, i) => ({
      _seq: i + 1, x: 100 + i * 7, y: 200, alive: true, hp: 500, maxHp: 500,
      isBoss: false, isElite: i % 9 === 0, applySlow() {},
    }));
    const mgr = new StatusEffectManager({
      registry, freezeSystem: fs, seed: 987654,
      cap: (name, fb) => capFor(name, quality, fb),
      now: () => t,
    });
    const applied = [];
    for (let i = 0; i < 400; i++) {
      const e = enemies[i % enemies.length];
      const r = mgr.applyIceHit(e, {
        chillAmount: 20 + (i % 5), baseFreezeChance: 0.06, procCoefficient: 0.8,
        hitGroupId: 1000 + (i >> 3), sourceSkillId: 'frost_shard',
      });
      applied.push([e._seq, Math.round((r.chill || 0) * 100) / 100, r.froze ? 1 : 0]);
      t += 16;
    }
    return {
      cursor: mgr.rng.cursor, applied: JSON.stringify(applied),
      frozen: enemies.filter((e) => mgr.isFrozen(e)).length,
      counters: JSON.stringify(mgr.counters()), index: mgr.statusIndexSize(),
    };
  };
  const base = play('high');
  for (const q of QUALITIES) {
    const r = play(q);
    ok(r.cursor === base.cursor, `${q}: status RNG cursor が high と一致（${r.cursor} / ${base.cursor}）`);
    ok(r.applied === base.applied, `${q}: 付与列（対象 / 冷気量 / 凍結）が high と一致`);
    ok(r.frozen === base.frozen && r.counters === base.counters, `${q}: 凍結数と実動作カウンタが一致（凍結 ${r.frozen}）`);
    ok(r.index === base.index, `${q}: 状態索引サイズが一致（${r.index}）`);
  }
  info(`RNG cursor ${base.cursor} / 凍結 ${base.frozen} 体（全品質で同一）`);
}

section('2. draft RNG: SkillDraftManager は品質を読まない');
{
  const src = readSrc('src/systems/SkillDraftManager.js') + readSrc('src/systems/SeededRandom.js');
  ok(!/effectQuality|quality/i.test(src), 'SkillDraftManager / SeededRandom のソースに品質参照が無い');
  // 実駆動: 同 seed で 2 回 → 候補列が完全一致（品質はそもそも入力に存在しない）。
  for (const jobId of ['flame_witch', 'frost_mage', 'warrior']) {
    const a = simDraft(jobId, { seed: 42, slotActive: 6, levelUps: 40 });
    const b = simDraft(jobId, { seed: 42, slotActive: 6, levelUps: 40 });
    ok(a.candidateSeq.join('|') === b.candidateSeq.join('|'), `${jobId}: 同 seed の候補列が決定論的に一致`);
  }
}

section('3. status RNG の cursor 保存が品質と独立（保存キーに品質が無い）');
{
  const src = readSrc('src/systems/StatusEffectManager.js');
  ok(!/effectQuality/.test(src), 'StatusEffectManager が品質名を直接読まない（cap 関数注入のみ）');
}

T.finish();
