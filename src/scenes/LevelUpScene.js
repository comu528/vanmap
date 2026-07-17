// レベルアップ画面（Milestone 6-A）。SkillDraftManager が抽選した候補を表示する。
// 候補カード（新規/強化/進化・active/passive・レアリティ・現在→次Lv・説明）、
// スロット使用状況（Active x/max・Passive y/max）、リロール/追放/スキップ残数と操作。
// 数字キー・クリック・R(リロール)・B(追放モード)・S(スキップ)。640×360 内に収める。
//
// provider: { getView(): {candidates, slots, counts}, pick(i), reroll():bool, banish(i):bool, skip():bool, rescue() }
// 進化専用演出（EvolutionScene）は pick 側（BattleScene）で従来通り起動する。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { DataManager } from '../systems/DataManager.js';
import { skillSummaryLine } from '../systems/SkillAudit.js';

// スキル説明カードへ出す「残響・分身・Lv80・主要タグ・進化先」の短い記号行（M6-E/6-F）。
// SkillAudit の共通判定（skillSummaryLine）を使い UI 専用の別判定を作らない。640×360 を圧迫しないよう1行に凝縮する。
function castLine(id) {
  if (!id) return '';
  const skill = DataManager.getSkill(id);
  const def = skill || DataManager.getEvolution(id);
  if (!def) return '';
  const evo = skill ? DataManager.getEvolutionForBase(id) : null; // 基礎 active のみ進化先を表示
  return skillSummaryLine(def, evo);
}

export class LevelUpScene extends Phaser.Scene {
  constructor() { super('LevelUpScene'); }

  init(data) {
    this.provider = data.provider || null;
    this._banishMode = false;
  }

  create() {
    this._layer = null;
    this.render();
    // キーボード（再描画をまたいで有効）。
    const keys = ['ONE', 'TWO', 'THREE', 'FOUR'];
    for (let i = 0; i < 4; i++) this.input.keyboard.on(`keydown-${keys[i]}`, () => this.choose(i));
    this.input.keyboard.on('keydown-R', () => this.doReroll());
    this.input.keyboard.on('keydown-B', () => this.toggleBanish());
    this.input.keyboard.on('keydown-S', () => this.doSkip());
  }

  view() { return (this.provider && this.provider.getView()) || { candidates: [], slots: {}, counts: {} }; }

  render() {
    if (this._layer) this._layer.destroy(true);
    const layer = this.add.container(0, 0);
    this._layer = layer;
    const v = this.view();
    const s = v.slots || {}, c = v.counts || {};

    layer.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.74));
    layer.add(this.add.text(GAME_WIDTH / 2, 20, 'レベルアップ！', { fontSize: '18px', color: '#ffab40', fontStyle: 'bold' }).setOrigin(0.5));
    // スロット・残数表示
    layer.add(this.add.text(GAME_WIDTH / 2, 42,
      `Active ${s.activeUsed ?? 0}/${s.activeMax ?? 0}   Passive ${s.passiveUsed ?? 0}/${s.passiveMax ?? 0}   ` +
      `リロール ${c.rerolls ?? 0}  追放 ${c.banishes ?? 0}  スキップ ${c.skips ?? 0}`,
      { fontSize: '9px', color: '#ffe0b2' }).setOrigin(0.5));
    layer.add(this.add.text(GAME_WIDTH / 2, 56, this._banishMode ? '⚠ 追放モード: カードをクリックで追放（B で解除）' : '強化を1つ選択（数字/クリック）', { fontSize: '9px', color: this._banishMode ? '#ff8a80' : '#bcaaa4' }).setOrigin(0.5));

    const cands = v.candidates || [];
    if (cands.length === 0) {
      layer.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '選べる候補がありません（枠が満杯 / 条件未達）。', { fontSize: '11px', color: '#ffab91' }).setOrigin(0.5));
      const back = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, '戦闘へ戻る', { fontSize: '12px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      back.on('pointerdown', () => { if (this.provider) this.provider.rescue(); });
      layer.add(back);
      this._buttons(layer, c, cands.length);
      return;
    }

    const n = cands.length;
    const gap = 10;
    const cardW = Math.min(150, Math.floor((GAME_WIDTH - (n + 1) * gap) / n));
    const cardH = 150;
    const totalW = n * cardW + (n - 1) * gap;
    let x = (GAME_WIDTH - totalW) / 2 + cardW / 2;
    const y = GAME_HEIGHT / 2 + 8;
    cands.forEach((cd, i) => { this.makeCard(layer, x, y, cardW, cardH, cd, i + 1); x += cardW + gap; });
    this._buttons(layer, c, n);
  }

  _buttons(layer, c, n) {
    const y = GAME_HEIGHT - 16;
    let x = 40;
    const mk = (label, enabled, cb, bg) => {
      const t = this.add.text(x, y, label, { fontSize: '10px', color: enabled ? '#fff' : '#5d4037', backgroundColor: enabled ? (bg || '#2a1e2e') : '#241a20', padding: { x: 7, y: 4 } }).setOrigin(0, 0.5);
      if (enabled) { t.setInteractive({ useHandCursor: true }); t.on('pointerdown', cb); }
      layer.add(t); x += t.width + 8;
    };
    mk(`リロール(R) ${c.rerolls ?? 0}`, (c.rerolls ?? 0) > 0, () => this.doReroll(), '#1a3a3e');
    mk(`追放(B) ${c.banishes ?? 0}`, (c.banishes ?? 0) > 0 && n > 0, () => this.toggleBanish(), this._banishMode ? '#7a2e1a' : '#3a1a1e');
    mk(`スキップ(S) ${c.skips ?? 0}`, (c.skips ?? 0) > 0, () => this.doSkip(), '#2a1e2e');
  }

  makeCard(layer, cx, cy, w, h, cd, num) {
    const evo = cd.kind === 'evolution';
    const bgColor = evo ? 0x3a1420 : 0x241a2a;
    const stroke = cd.rarityColor ? Phaser.Display.Color.HexStringToColor(cd.rarityColor).color : (evo ? 0xffd54f : 0xff7043);
    const bg = this.add.rectangle(cx, cy, w, h, bgColor).setStrokeStyle(evo ? 3 : 2, stroke).setInteractive({ useHandCursor: true });
    layer.add(bg);
    layer.add(this.add.text(cx, cy - h / 2 + 7, cd.badge || '', { fontSize: '8px', color: cd.rarityColor || '#ffe0b2', fontStyle: 'bold' }).setOrigin(0.5));
    layer.add(this.add.text(cx + w / 2 - 8, cy - h / 2 + 7, cd.rarity || '', { fontSize: '7px', color: cd.rarityColor || '#bcaaa4' }).setOrigin(1, 0.5));
    if (cd.icon && this.textures.exists(cd.icon)) layer.add(this.add.image(cx, cy - 38, cd.icon).setScale(evo ? 3 : 2.4).setTint(evo ? 0xffe082 : 0xffffff));
    layer.add(this.add.text(cx, cy - 8, `${num}. ${cd.title}`, { fontSize: '11px', color: evo ? '#ffd54f' : '#ffe0b2', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 12 } }).setOrigin(0.5));
    layer.add(this.add.text(cx, cy + 20, cd.level || '', { fontSize: '8px', color: '#80deea' }).setOrigin(0.5));
    layer.add(this.add.text(cx, cy + 40, cd.description || '', { fontSize: '8px', color: '#bcaaa4', align: 'center', wordWrap: { width: w - 14 } }).setOrigin(0.5));
    // M6-E: 残響・分身・Lv80・主要タグの対応状況（短い記号行）。
    const cl = castLine(cd.id);
    if (cl) layer.add(this.add.text(cx, cy + h / 2 - 8, cl, { fontSize: '7px', color: '#a5d6a7', align: 'center', wordWrap: { width: w - 8 } }).setOrigin(0.5, 1));
    bg.on('pointerover', () => bg.setStrokeStyle(evo ? 4 : 3, this._banishMode ? 0xff5252 : 0xffab40));
    bg.on('pointerout', () => bg.setStrokeStyle(evo ? 3 : 2, stroke));
    bg.on('pointerdown', () => this.choose(num - 1));
  }

  choose(index) {
    const v = this.view();
    if (!v.candidates || index >= v.candidates.length) return;
    if (this._banishMode) {
      if (this.provider.banish(index)) { this._banishMode = false; this.render(); }
      return;
    }
    this.provider.pick(index); // BattleScene が適用・シーン停止（進化演出も起動）
  }

  doReroll() { if (this.provider && this.provider.reroll()) this.render(); }
  toggleBanish() { const c = this.view().counts || {}; if ((c.banishes ?? 0) <= 0) return; this._banishMode = !this._banishMode; this.render(); }
  doSkip() { if (this.provider) this.provider.skip(); }
}
