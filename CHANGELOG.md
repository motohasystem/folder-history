# Changelog

本拡張機能の変更履歴です。フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、[Semantic Versioning](https://semver.org/lang/ja/) を採用しています。

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
