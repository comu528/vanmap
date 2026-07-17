// 万象炎鳴（M6-E・灼熱共鳴の進化）: 炎上中の敵を共鳴点として扱い、パルス時に炎上敵同士を炎で連鎖。
// 炎上数が閾値以上なら画面規模の最終共鳴爆発。tier が連鎖数・範囲・最終爆発をスケールする。
// 連鎖ダメージは新たな共鳴を再帰誘発しない（ただの追加ダメージ）。連鎖/最終爆発では recordCast しない。
// echo/clone は「基本パルスのみ」を再現（連鎖/最終爆発なし）。周期型のため自前 update で cooldown/recordCast を管理。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class UniversalFlameResonanceSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._cd = 0;
    this._finalCd = 0; // 最終爆発のクールダウン（finalBlastMs 未満で連発しない）。
  }

  canFire() { return false; } // 自前 update

  _tierFor(burning) {
    const th = (this.evoDef.config && this.evoDef.config.tierThresholds) || [0, 5, 15, 30, 60];
    let tier = 0;
    for (let t = 0; t < th.length; t++) { if (burning >= th[t]) tier = t; }
    return tier;
  }

  update(dt, ctx) {
    if (this._finalCd > 0) this._finalCd = Math.max(0, this._finalCd - dt);
    this._cd -= dt;
    if (this._cd > 0) return;
    if (this.scene.gameOver) return;
    if (!(ctx && ctx.hasEnemies)) return; // 敵がいないだけならスキップ（CD は据え置き）。
    this._cd = (this.evoDef.cooldown ?? 2000) * this.passiveCooldownMult();
    this.scene.skills.recordCast(this.id); // 主発動（resonancePulse）1回のみ。
    this._pulse();
  }

  _pulse() {
    const d = this.evoDef; const cfg = d.config || {}; const combat = this.scene.combat; const p = this.scene.player;
    const burning = combat.burningCount();
    const tier = this._tierFor(burning);

    // 基本パルス（プレイヤー中心）。
    const pulseR = ((d.area && d.area.radius) || 96) * this.passiveAreaMult();
    combat.damageArea(p.x, p.y, pulseR, (d.damage && d.damage.pulse) || 22, this.id, { isExplosion: false, element: 'fire' });
    this.scene.effects.explosion(p.x, p.y, pulseR, 0xffab40);
    this.scene.skills.recordExtra(this.id, 'resonancePulses', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'maxResonanceLevel', tier, 'max');

    // 炎上敵同士の連鎖。
    this._doChains(tier);

    // 最終共鳴爆発（閾値以上、かつ finalBlastMs 経過ごとに最大1回）。
    const minB = cfg.finalBlastMinBurning || 15;
    if (burning >= minB && this._finalCd <= 0) {
      const fr = ((d.area && d.area.finalRadius) || 320) * this.passiveAreaMult();
      combat.damageArea(p.x, p.y, fr, (d.damage && d.damage.finalBlast) || 100, this.id, { isExplosion: true, element: 'fire' });
      this.scene.effects.explosion(p.x, p.y, fr, 0xff5722);
      this.scene.effects.sparks(p.x, p.y, 10, 0xffca28);
      this._finalCd = cfg.finalBlastMs || 3000;
      this.scene.skills.recordExtra(this.id, 'finalBlasts', 1, 'add');
    }
  }

  // 炎上敵をノード、chainRange 内の近接ペアをリンクとして連鎖ダメージ。
  // visited でペア重複を防ぎ、無限往復を防止。総リンク数は tier とキャップ・毎フレーム予算で制限。
  _doChains(tier) {
    const d = this.evoDef; const cfg = d.config || {}; const combat = this.scene.combat;
    const pts = combat.burningEnemies(Math.min(cfg.maxResonancePoints || 40, this.cap('maxResonanceTargets', 60)));
    if (pts.length < 2) return;
    const chainRange = ((d.area && d.area.chainRange) || 130) * this.passiveAreaMult();
    const rangeSq = chainRange * chainRange;
    const maxLinks = Math.min((cfg.maxChains || 8) * (1 + tier), this.cap('maxResonanceChains', 24));
    const chainDmg = (d.damage && d.damage.chain) || 16;
    const visited = new Set();
    let links = 0;
    for (let i = 0; i < pts.length && links < maxLinks; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length && links < maxLinks; j++) {
        const key = i + '_' + j;
        if (visited.has(key)) continue;
        const b = pts[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > rangeSq) continue;
        if (!combat.frameBudget('resChain', 'maxArrayTicksPerFrame')) { // 毎フレーム上限に達したら打ち切り。
          if (links > 0) this.scene.skills.recordExtra(this.id, 'chainsFired', links, 'add');
          return;
        }
        visited.add(key);
        // 連鎖は「ただの追加ダメージ」。共鳴を再帰誘発しない。
        combat.dealDamage(b, chainDmg, this.id, { isExplosion: false, element: 'fire', from: { x: a.x, y: a.y } });
        links++;
      }
    }
    if (links > 0) this.scene.skills.recordExtra(this.id, 'chainsFired', links, 'add');
  }

  // 残響/複製: 基本パルスのみ（連鎖/最終爆発なし・状態変更なし・recordCast なし）。
  echoCast() {
    if (this.scene.gameOver) return;
    const d = this.evoDef; const combat = this.scene.combat; const p = this.scene.player;
    const pulseR = ((d.area && d.area.radius) || 96) * this.passiveAreaMult();
    combat.damageArea(p.x, p.y, pulseR, (d.damage && d.damage.pulse) || 22, this.id, { isExplosion: false, element: 'fire' });
    this.scene.effects.explosion(p.x, p.y, pulseR, 0xffab40);
  }
  cloneCast() { this.echoCast(); }

  serializeState() { return { cdLeft: this._cd, finalCd: this._finalCd || 0 }; }
  restoreState(st) { if (!st) return; this._cd = st.cdLeft || 0; this._finalCd = Math.max(0, st.finalCd || 0); }

  destroy() {}
}
