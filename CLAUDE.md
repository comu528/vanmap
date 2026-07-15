# CLAUDE.md — 恒久的な開発制約

このリポジトリ（Reincarnation Flame Survivor）で作業する際に**常に守る**制約。

## 環境
- GitHub 上の Claude Code 環境で作業する。ローカルPCへのソフトのインストールを前提にしない
  （ゲームエディタ起動・ローカル実プレイ確認・Windows実行ファイル生成・常駐サーバー起動は不可）。
- 実行していないものを「動作確認済み」と報告しない。

## 技術構成（変更しない）
- 静的な HTML / CSS / JavaScript（ES Modules）/ **Phaser 3.90.0** のみ。
- Phaser は CDN 固定: `https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js`。
- **npm・ビルド工程を新たに必須化しない**。`package.json` なし、TypeScript なし、外部API/DB/バックエンドなし。
- 仮素材は `BootScene` が実行時生成（正式画像素材を追加しない・全面グラフィック改修をしない）。

## GitHub Pages / 相対パス
- **すべて相対パス**（`./src/...`）。ルート絶対パス禁止（リポジトリ名付きURLで壊れないため）。
- 公開は **`.github/workflows/static.yml`**、データ検証は **`.github/workflows/validate.yml`** を維持。
- **`pages.yml` は削除済み。再作成しない。** Pages ワークフローを追加・重複させない。

## データ / セーブ
- ゲームデータは `data/*.json`。変更時は `node tests/validate-data.mjs` が通ること（外部ライブラリ不使用）。
- セーブは localStorage。`save_version` を変えるときは移行/安全初期化を用意し、旧データで起動不能にしない。

## 作業手順
- 開発ブランチは `claude/funny-heisenberg-frhgq9`。指定なき限りここへコミット・プッシュ。
- Milestone は指定された範囲のみ実装し、未指定の先行実装はしない（設計と TODO への記載に留める）。
- ゲームバランス（敵HP/攻撃力/経験値/スキル威力/難易度倍率/報酬）は指示なく大きく変更しない。
- 引き継ぎは `docs/handoff-*.md` を参照・更新する。
