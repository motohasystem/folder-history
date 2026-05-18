# Changelog

本拡張機能の変更履歴です。フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、[Semantic Versioning](https://semver.org/lang/ja/) を採用しています。

## [0.4.0] - 2026-04-28

### Added
- **スター機能**: 各履歴行の先頭に ★/☆ アイコンを常時表示。クリックでフォルダ単位の「お気に入り」を切替（楽観 UI のためレスポンスは即時）。
- 絞り込み入力欄の横に **★ トグルボタン** を追加。押すとスター付きフォルダのみに絞り込み。テキスト絞り込みと AND 条件で動作。
- **月別ランキングタブ** を新設。月セレクタ（◀ ▶ で前後月へ）で対象月を切替、その月に開いた **実日数** が多い順にフォルダをランキング表示。`date: null` の取込みエントリは集計から除外。
- タブ状態・月選択・スターフィルタの状態を WebView の `vscode.setState()` で永続化。

### Changed
- データフォーマットを v2 に更新（`stars: string[]` 追加）。v1 ファイルは読み込み時に `stars: []` を自動補完するため後方互換あり。
- WebView を「サーバー側全 HTML 生成」から「データ inline + クライアント側レンダリング」方式に変更。タブ・月・絞り込みの切替を extension 往復なしで反映。
- ランキング集計は月ごとに `Map<YYYY-MM, ranked[]>` でメモ化し、月切替時の再計算を回避。

## [0.3.0] - 2026-04-28

### Added
- 履歴行をクリックするとインラインメニューが開き、3つのアクションを選択可能に：
  - **VS Code で開く**（`vscode.openFolder` で新しいウィンドウ）
  - **エクスプローラで開く**（従来の `revealFileInOS`）
  - **フルパスをコピー**（`vscode.env.clipboard.writeText`）
- メニュー外クリック／Esc キーで閉じる挙動。

### Changed
- 行クリック直接で OS エクスプローラを起動していた挙動を、明示的なアクション選択方式に変更。

## [0.2.0] - 2026-04-28

### Added
- アクティビティバーに専用アイコンを追加し、サイドバー内に履歴ビュー（`folderHistory.sidebar`）を常駐表示できるようにしました。
- ビュータイトルバーから「再読み込み」「エディタで開く」「ログファイルを開く」「VS Code Recent List から取込み」を実行できるアクションを追加。
- `folderHistory.refresh` コマンドを追加。

### Changed
- WebView 描画ロジックを `HistoryWebviewController` として共通化し、パネル版とサイドバー版で共有。
- サイドバー幅でも見やすいよう、UI をコンパクトなレイアウトに調整。
- ワークスペース変更や履歴取込み後に自動でサイドバーをリフレッシュ。

## [0.1.0] - 2026-04-27

### Added
- 初回リリース。
- VS Code でフォルダを開いた日付（`YYYY-MM-DD`）を `globalStorage` 配下の `history.json` に記録。
- マルチルートワークスペース対応（`onDidChangeWorkspaceFolders` でフォルダ追加を検知）。
- コマンド「Folder History: Show」で WebView パネルに日付グループ化リストを表示。行クリックで `revealFileInOS`（Windows エクスプローラ）でフォルダを開く。
- フォルダ名・パスのテキストフィルタ。
- コマンド「Folder History: Open Log File」で `history.json` をエディタに直接展開。
- コマンド「Folder History: Import from VS Code Recent List」で `state.vscdb` の `recentlyOpenedPathsList` を `date: null` で取込み（追加依存ライブラリなし、URI を正規表現で抽出）。
