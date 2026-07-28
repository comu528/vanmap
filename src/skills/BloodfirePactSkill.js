// 血炎契約（M6-D）: 現在HPの一定割合をコストに強力な炎爆発＋火弾を放つ高リスクバースト。
// 安全HP以下では不発（自滅しない）。HP消費は spendHealthCost 経由（障壁/無敵/不死鳥で防がれず、最低HP1保証、被ダメ統計に含めない）。
// echoCast/cloneCast は「攻撃部分のみ」を再現し、HP消費を行わない（威力倍率は dealDamage 側で自動適用）。
// M8-A: HP消費の見返りは「発動時の大威力バースト」で表現する。かつて宣言だけされていた
// buffMs / buffDamage（実装から一度も参照されない死にパラメータ＝no-op タイマー）は data ごと削除した。
import { SkillBase } from './SkillBase.js';

export class BloodfirePactSkill extends SkillBase {
  // 敵がいて、かつ HP割合が安全値を上回るときのみ発動可。
  canFire(ctx) {
    const p = this.scene.player;
    const frac = p.maxHp ? p.hp / p.maxHp : 1;
    return !!ctx.hasEnemies && frac > (this.stats.safeHpPercent || 0.25);
  }

  update(dt, ctx) {
    const s = this.stats;
    if (this._cd > 0) { this._cd -= dt; return; }
    if (this.scene.gameOver) return;
    if (!ctx.hasEnemies) return; // 敵がいないだけならスキップ扱いにしない
    if (!this.canFire(ctx)) {
      // 敵はいるが安全HP以下 → 不発。短い再試行間隔で数える（毎フレーム加算を避ける）。
      this.scene.skills.recordExtra(this.id, 'castsSkippedLowHp', 1, 'add');
      this._cd = 300;
      return;
    }
    this._cd = (s.cooldown ?? 6000) * this.passiveCooldownMult();
    this.scene.skills.recordCast(this.id);
    this.fire(ctx);
  }

  // フルキャスト = HP消費 + 攻撃。
  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; const p = this.scene.player;
    // HP消費（現在HP割合・最低HP1は API 保証・takeDamage 非経由）。
    const spent = this.scene.combat.spendHealthCost(p.hp * (s.hpCostPercent || 0.12));
    if (spent > 0) this.scene.skills.recordExtra(this.id, 'healthSpent', spent, 'add');
    // 攻撃（爆発＋火弾）。
    this._burst(p.x, p.y);
  }

  // 攻撃部分のみ（HP消費なし）。実発動と echo/clone 再現で共有する。
  _burst(x, y) {
    const s = this.stats; const combat = this.scene.combat;
    combat.damageArea(x, y, s.radius, s.damage, this.id, { isExplosion: true, crit: true });
    this.scene.effects.explosion(x, y, s.radius, 0xff3d00);
    this.scene.effects.sparks(x, y, 8, 0xffca28);
    this.scene.skills.recordExtra(this.id, 'burstDamage', s.damage, 'add');
    const bolts = s.extraBolts || 0;
    if (bolts > 0) {
      const cap = combat.skillCap('maxBloodfireProjectiles', 40);
      const room = Math.max(0, cap - this.scene.countProjBySkill(this.id));
      const n = Math.min(bolts, room);
      for (let i = 0; i < n; i++) {
        if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) break;
        const ang = (Math.PI * 2 * i) / (n || 1);
        combat.spawnPlayerProjectile(x, y, ang, 320, {
          skillId: this.id, damage: s.damage * 0.3, pierce: 1, explosionRadius: 8, scale: 0.6, lifeMs: 900, tint: 0xff5722, element: 'fire',
        });
      }
    }
  }

  // 残響/複製: 攻撃のみ再現（HP消費なし・チャージなし）。威力倍率は dealDamage 内で自動適用。
  echoCast() { if (this.scene.gameOver) return; const p = this.scene.player; this._burst(p.x, p.y); }
  cloneCast() { this.echoCast(); }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (!st) return; this._cd = st.cdLeft || 0; }
}
