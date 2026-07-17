// 爆炎歩法（M6-D・反応/移動強化）: 通常ダッシュを強化する。一定時間ごとに爆炎チャージを生成し、
// チャージ所持中のダッシュで開始/終了地点の爆発・炎の軌跡・わずかに長い無敵を発生させる。
// プレイヤーを自前で移動させない（onDash は実ダッシュからのみ呼ばれる。autoDash も tryDash 経由で同一）。
// echoPolicy/clonePolicy は data で forbidden のため echo/clone 上書きは不要（複製ダッシュは発生しない）。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class BlazingStepSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._charges = 0;
    this._nextChargeMs = null; // 初回 update で stats.chargeMs から初期化
    this._empowered = false;
    this._lastTrailX = 0; this._lastTrailY = 0;
    this.trails = []; // { x, y, timeLeft, maxLife, tickLeft, sprite }
  }
  canFire() { return false; } // 攻撃発火は持たず、ダッシュ強化＋チャージ管理のみ

  update(dt) {
    const s = this.stats;
    if (this._nextChargeMs == null) this._nextChargeMs = s.chargeMs || 5000;
    // チャージ生成（dt ベース・一時停止中は update が呼ばれず進まない）。
    const maxCharge = s.maxCharge || 1;
    if (this._charges < maxCharge) {
      this._nextChargeMs -= dt;
      if (this._nextChargeMs <= 0) { this._charges++; this._nextChargeMs = s.chargeMs || 5000; }
    } else {
      this._nextChargeMs = s.chargeMs || 5000; // 満タン時はタイマー保持
    }

    // 炎の軌跡パッチの進行（期限切れ破棄・DoT tick）。
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.timeLeft -= dt; t.tickLeft -= dt;
      if (t.sprite) t.sprite.setAlpha(0.5 * Math.max(0, t.timeLeft) / (t.maxLife || 1));
      if (t.tickLeft <= 0) {
        t.tickLeft = 120;
        this.scene.combat.forEachEnemyInRadius(t.x, t.y, 18, (e) => {
          this.scene.combat.dealDamage(e, s.trailDamage, this.id, { tag: 'dot', quiet: true, color: 0xff6d00 });
          this.scene.skills.recordExtra(this.id, 'dashTrailDamage', s.trailDamage, 'add');
        });
      }
      if (t.timeLeft <= 0) { if (t.sprite) t.sprite.destroy(); this.trails.splice(i, 1); }
    }
  }

  // ダッシュフック。phase: 'start' | 'move' | 'end'。プレイヤーは自前で動かさない。
  onDash(phase, player) {
    const s = this.stats;
    if (phase === 'start') {
      if (this._charges > 0) {
        this._charges--;
        this._empowered = true;
        this._explode(player.x, player.y);
        // 無敵をわずかに延長（既存無敵時間を短縮しない）。
        player._invulnUntil = Math.max(player._invulnUntil || 0, this.scene.time.now + (s.invulnBonusMs || 0));
        this.scene.skills.recordExtra(this.id, 'empoweredDashes', 1, 'add');
        this._lastTrailX = player.x; this._lastTrailY = player.y;
      } else {
        this._empowered = false; // チャージなし＝通常ダッシュ（効果なし）
      }
    } else if (phase === 'move') {
      if (this._empowered) {
        const dx = player.x - this._lastTrailX, dy = player.y - this._lastTrailY;
        if (dx * dx + dy * dy >= 14 * 14) { // 一定距離ごとに軌跡を落とす（毎フレーム大量生成を防ぐ）
          this._spawnTrail(player.x, player.y);
          this._lastTrailX = player.x; this._lastTrailY = player.y;
        }
      }
    } else if (phase === 'end') {
      if (this._empowered) { this._explode(player.x, player.y); this._empowered = false; }
    }
  }

  _explode(x, y) {
    const s = this.stats;
    this.scene.combat.damageArea(x, y, s.explosionRadius, s.explosionDamage, this.id, { isExplosion: true });
    this.scene.effects.explosion(x, y, s.explosionRadius, 0xff6d00);
    this.scene.skills.recordExtra(this.id, 'dashExplosions', 1, 'add');
  }

  _spawnTrail(x, y) {
    const cap = this.scene.combat.skillCap('maxBlazingTrails', 44);
    if (this.trails.length >= cap) return;
    const life = this.stats.trailMs || 500;
    const spr = this.scene.add.image(x, y, TEX.PARTICLE)
      .setTint(0xff6d00).setBlendMode(Phaser.BlendModes.ADD).setDepth(42).setScale(3).setAlpha(0.5);
    this.trails.push({ x, y, timeLeft: life, maxLife: life, tickLeft: 0, sprite: spr });
  }

  // リロードでチャージが完全回復しないよう保存値を復元する。
  serializeState() { return { charges: this._charges, nextChargeMs: this._nextChargeMs }; }
  restoreState(st) { if (!st) return; this._charges = st.charges || 0; this._nextChargeMs = (st.nextChargeMs != null) ? st.nextChargeMs : null; }

  destroy() { for (const t of this.trails) if (t.sprite) t.sprite.destroy(); this.trails = []; }
}
