// 氷術師 完成監査 9/12: 状態異常・ボス氷砕・粉砕のバランス分析（M7-E §16・§17）。Node.js 標準機能のみ。
// production の StatusEffectManager / FreezeSystem / StatusEffectRegistry をそのまま駆動し、
// chill / freeze / immunity / hitGroup / shatter / boss frostbreak / vulnerability を通常敵・エリート・ボス別に集計、
// FrostBalanceWarnings で異常（0件・過剰・ボス通常凍結など）を検出する。外部送信は一切しない。
// 実行: node tests/frost-status-balance.mjs

import { DATA, runner } from './frost-audit-common.mjs';
import { analyzeFrostWarnings } from '../src/systems/FrostBalanceWarnings.js';

const { StatusEffectRegistry } = await import('../src/systems/StatusEffectRegistry.js');
const { FreezeSystem } = await import('../src/systems/FreezeSystem.js');
const { StatusEffectManager } = await import('../src/systems/StatusEffectManager.js');

const T = runner('氷術師 状態異常バランス分析（M7-E）');
const { ok, section, info } = T;

const reg = new StatusEffectRegistry(DATA.statusEffects);
const fs = new FreezeSystem(reg, null);

function mkEntity(type, i) {
  return {
    x: 100 + i * 7, y: 100 + i * 5, alive: true, hp: 100, maxHp: type === 'boss' ? 6000 : 80,
    isBoss: type === 'boss', isElite: type === 'elite', _seq: i,
    onFreezeStart() { this._frozenVisual = true; }, onFreezeEnd() { this._frozenVisual = false; },
  };
}

// 代表的な氷スキルの命中プロファイル（実データの Lv8 値から作る）。
function iceProfiles() {
  const out = [];
  for (const id of ['frost_shard', 'frost_nova', 'icicle_volley', 'hailstorm', 'glacial_spear_rain', 'aurora_veil']) {
    const s = DATA.skills.find((x) => x.id === id);
    const lv = (s.levels || [])[7] || (s.levels || [])[0] || {};
    out.push({
      id, chillAmount: lv.chillAmount || 10, baseFreezeChance: lv.baseFreezeChance || 0,
      procCoefficient: s.procCoefficient != null ? s.procCoefficient : 1,
      bossGaugeMult: lv.bossGaugeMult || 1,
    });
  }
  return out;
}
const PROFILES = iceProfiles();

// ---- ヘッドレス戦闘（決定論・時間は固定刻み）----
function simulateStatus({ type, seconds = 60, hitsPerSecond = 8, multiHit = false }) {
  let now = 0;
  const sfx = new StatusEffectManager({ registry: reg, freezeSystem: fs, now: () => now, seed: 0x51ce9e11 });
  const ents = Array.from({ length: type === 'boss' ? 1 : 10 }, (_, i) => mkEntity(type, i));
  const M = {
    chillApplications: 0, chillTotal: 0, freezeAttempts: 0, freezes: 0, guaranteed: 0, immunitySkips: 0,
    hitGroupSkips: 0, shatters: 0, shatterDamage: 0, frozenSeconds: 0, frozenPeak: 0,
    bossGaugeApplications: 0, bossGaugeTotal: 0, frostbreaks: 0, breakTimes: [], vulnerabilitySeconds: 0,
    bossFrozen: 0, bossGaugeBySkill: {}, freezeBySkill: {}, shatterBySkill: {}, multiHitCasts: 0,
  };
  const frames = seconds * 20; // 50ms 刻み
  let hitAcc = 0, hg = 0;
  for (let f = 0; f < frames; f++) {
    now += 50;
    hitAcc += hitsPerSecond * 0.05;
    while (hitAcc >= 1) {
      hitAcc -= 1;
      const prof = PROFILES[(f + Math.floor(hitAcc)) % PROFILES.length];
      hg += 1;
      const passes = multiHit ? 3 : 1;   // 多段命中（hitGroup 上限が効くか）
      if (multiHit) M.multiHitCasts += 1;
      for (let p = 0; p < passes; p++) {
        for (const e of ents) {
          if (!e.alive) continue;
          const before = sfx.chillOf(e);
          const res = sfx.applyIceHit(e, {
            chillAmount: prof.chillAmount, baseFreezeChance: prof.baseFreezeChance,
            procCoefficient: prof.procCoefficient, hitGroupId: hg, statusPowerMult: 1,
            bossGaugeMult: prof.bossGaugeMult,
          });
          if (res.boss) {
            M.bossGaugeBySkill[prof.id] = (M.bossGaugeBySkill[prof.id] || 0) + prof.chillAmount * prof.bossGaugeMult;
            if (res.brokeFrost) { M.frostbreaks += 1; M.breakTimes.push(now); }
            if (sfx.isFrozen(e)) M.bossFrozen += 1;
          } else {
            if (sfx.chillOf(e) > before) { M.chillApplications += 1; M.chillTotal += sfx.chillOf(e) - before; }
            if (res.froze) { M.freezes += 1; M.freezeBySkill[prof.id] = (M.freezeBySkill[prof.id] || 0) + 1; }
          }
          // 凍結中なら粉砕を試す（1体1回・再帰なし）。
          if (sfx.isFrozen(e) && (f % 7 === 0)) {
            const s = sfx.shatter(e, { skillPower: 30, powerMult: 1 });
            if (s) { M.shatters += 1; M.shatterDamage += s.damage; M.shatterBySkill[prof.id] = (M.shatterBySkill[prof.id] || 0) + 1; }
          }
        }
      }
    }
    const frozenNow = sfx.countStatus('frozen');
    M.frozenPeak = Math.max(M.frozenPeak, frozenNow);
    M.frozenSeconds += frozenNow * 0.05;
    if (type === 'boss' && sfx.bossVulnActive(ents[0])) M.vulnerabilitySeconds += 0.05;
    sfx.update(50);
  }
  const c = sfx.counters();
  M.freezeAttempts = c.freezeAttempts; M.immunitySkips = c.immunitySkips; M.hitGroupSkips = c.hitGroupSkips;
  M.bossGaugeApplications = c.bossGaugeApplications;
  return M;
}

// ===== 1. 通常敵 =====
section('1. 通常敵: chill / freeze / immunity / hitGroup / shatter');
const normal = simulateStatus({ type: 'normal', seconds: 60, multiHit: true });
info(`chill付与 ${normal.chillApplications} 回 / 合計 ${normal.chillTotal.toFixed(0)}（平均 ${(normal.chillTotal / Math.max(1, normal.chillApplications)).toFixed(2)}/命中）`);
info(`凍結判定 ${normal.freezeAttempts} / 成功 ${normal.freezes}（${((normal.freezes / Math.max(1, normal.freezeAttempts)) * 100).toFixed(1)}%）/ 耐性で防止 ${normal.immunitySkips} / hitGroup で防止 ${normal.hitGroupSkips}`);
info(`凍結ピーク ${normal.frozenPeak} 体 / 凍結延べ ${normal.frozenSeconds.toFixed(1)} 秒 / 粉砕 ${normal.shatters} 回（合計 ${normal.shatterDamage.toFixed(0)}）`);
ok(normal.chillApplications > 0, '冷気が付与される');
ok(normal.freezeAttempts > 0, '凍結判定が発生する');
ok(normal.freezes > 0, '凍結が成立する（attempts ありで success 0 でない）');
ok(normal.immunitySkips > 0, '凍結耐性による抑止が発生する（immunity block が常に0でない）');
ok(normal.hitGroupSkips > 0, '多段命中で hitGroup 上限による抑止が発生する（永久凍結の防止）');
ok(normal.shatters > 0, '粉砕が発生する');
ok(normal.frozenPeak <= 10, '同時凍結数が対象数を超えない');

// ===== 2. エリート =====
section('2. エリート: 冷気耐性と凍結時間の差');
const elite = simulateStatus({ type: 'elite', seconds: 60, multiHit: true });
info(`elite: chill合計 ${elite.chillTotal.toFixed(0)} / 凍結 ${elite.freezes} / 粉砕 ${elite.shatters}`);
ok(elite.chillTotal > 0, 'エリートにも冷気が乗る');
ok(fs.chillGainMultiplier('elite') <= fs.chillGainMultiplier('normal'), 'エリートの冷気獲得倍率は通常敵以下（耐性）');
ok(fs.freezeDuration('elite') <= fs.freezeDuration('normal'), 'エリートの凍結時間は通常敵以下');
ok(elite.chillTotal < normal.chillTotal, `エリートは通常敵より冷気が乗りにくい（${elite.chillTotal.toFixed(0)} < ${normal.chillTotal.toFixed(0)}）`);

// ===== 3. ボス =====
section('3. ボス: 通常凍結しない / 氷砕ゲージ / frostbreak / 脆弱');
const boss = simulateStatus({ type: 'boss', seconds: 120 });
const perMin = boss.frostbreaks / 2;
info(`ボス: ゲージ付与 ${boss.bossGaugeApplications} 回 / 氷砕 ${boss.frostbreaks} 回（毎分 ${perMin.toFixed(1)}）/ 脆弱 ${boss.vulnerabilitySeconds.toFixed(1)} 秒（継続率 ${((boss.vulnerabilitySeconds / 120) * 100).toFixed(1)}%）`);
ok(boss.bossFrozen === 0, 'ボスは通常凍結しない（ゲージへ変換）');
ok(boss.bossGaugeApplications > 0, 'ボス氷砕ゲージが溜まる');
ok(boss.frostbreaks > 0, 'ボス氷砕が発生する');
ok(perMin <= 30, `氷砕が毎分 ${perMin.toFixed(1)} 回（過剰でない）`);
ok(boss.vulnerabilitySeconds / 120 < 0.9, '氷砕脆弱がほぼ常時にならない');
ok(boss.shatters === 0, 'ボスは粉砕されない（frostbreak で代替）');
// 氷砕の間隔が広がっていく（閾値成長が効いている）。
if (boss.breakTimes.length >= 3) {
  const first = boss.breakTimes[1] - boss.breakTimes[0];
  const last = boss.breakTimes[boss.breakTimes.length - 1] - boss.breakTimes[boss.breakTimes.length - 2];
  ok(last >= first, `氷砕の間隔が短縮しない（初回 ${first}ms → 最終 ${last}ms・閾値成長が効く）`);
}
info(`bossGaugeMult 別の寄与: ${Object.entries(boss.bossGaugeBySkill).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' ')}`);

// ===== 4. スキル別の寄与 =====
section('4. スキル別の freeze / shatter / boss gauge 寄与');
for (const p of PROFILES) {
  const f = normal.freezeBySkill[p.id] || 0, s = normal.shatterBySkill[p.id] || 0, g = boss.bossGaugeBySkill[p.id] || 0;
  info(`${p.id.padEnd(20)} chill=${p.chillAmount} proc=${p.procCoefficient} baseFreeze=${p.baseFreezeChance} bossGaugeMult=${p.bossGaugeMult} → freeze ${f} / shatter ${s} / gauge ${g.toFixed(0)}`);
  ok(p.chillAmount > 0, `${p.id}: 冷気量が正`);
  ok(p.procCoefficient > 0 && p.procCoefficient <= 1.2, `${p.id}: procCoefficient が妥当な範囲`);
}

// ===== 5. 警告生成 =====
section('5. FrostBalanceWarnings による状態異常警告');
{
  const warns = analyzeFrostWarnings({
    status: {
      freezeAttempts: normal.freezeAttempts, freezeSuccesses: normal.freezes,
      immunitySkips: normal.immunitySkips, hitGroupSkips: normal.hitGroupSkips, multiHitCasts: normal.multiHitCasts,
      shatters: normal.shatters, bossFrostbreaks: boss.frostbreaks, bossFightSeconds: 120,
      vulnerabilitySeconds: boss.vulnerabilitySeconds, bossFrozen: boss.bossFrozen,
    },
  });
  for (const w of warns) info(`${w.severity}: ${w.code} ${w.target} — ${w.detail}`);
  info('注: 本ハーネスは「10体が移動せず毎秒8命中を浴び続ける」飽和負荷のため、冷気が確定閾値へ達しやすく凍結成功率が実プレイより高く出る。');
  info('    実際の抑止は凍結耐性（immunity）が担っており、上の immunitySkips が凍結判定の大半を弾いている（永久凍結にならない）。');
  ok(warns.filter((w) => w.severity === 'high').length === 0, `状態異常の high 警告 0 件（実際 ${warns.filter((w) => w.severity === 'high').length}）`);
  // 警告器が壊れていないことを、異常な入力で確認する。
  const bad = analyzeFrostWarnings({ status: { freezeAttempts: 500, freezeSuccesses: 0, immunitySkips: 0, hitGroupSkips: 0, bossFrozen: 3, bossFightSeconds: 60, bossFrostbreaks: 0, vulnerabilitySeconds: 0 } });
  ok(bad.some((w) => w.code === 'FROST_FREEZE_ZERO'), 'freeze 0 を検出する');
  ok(bad.some((w) => w.code === 'FROST_BOSS_FREEZE_INVALID'), 'ボスの通常凍結を検出する');
  ok(bad.some((w) => w.code === 'FROST_FROSTBREAK_ZERO'), 'frostbreak 0 を検出する');
}

// ===== 6. 外部送信をしない =====
section('6. 外部送信なし（ローカル集計のみ）');
{
  const srcs = ['src/systems/StatusEffectManager.js', 'src/systems/FrostBalanceWarnings.js', 'src/systems/CombatTelemetry.js', 'src/systems/RunBalanceSummary.js'];
  const { readSrc } = await import('./frost-audit-common.mjs');
  for (const f of srcs) {
    const s = readSrc(f);
    ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(s), `${f}: 外部送信 API を使わない`);
  }
}

T.finish();
