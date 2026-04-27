
# Folder History 拡張機能 仕様書

## 目的

VS Codeで開いたフォルダを日付付きで記録し、過去の履歴をリスト表示してクリック一発でエクスプローラを開けるようにする。VS Codeの「最近使用した項目」ではタイムスタンプが取れず、件数も限られるという問題を解決する。

## 機能要件

### 1. 記録機能

- **トリガー**: VS Codeでフォルダ(ワークスペース)を開いた時
  - 起動時にすでにフォルダが開かれている場合
  - 起動後にフォルダが追加された場合(`onDidChangeWorkspaceFolders`)
- **記録粒度**: フォルダ単位、1日1件
  - 同じフォルダを同日に複数回開いても1件のみ
  - 別の日に再度開けば新しい記録として追加
- **記録項目**:
  - `date`: YYYY-MM-DD形式(ローカル日付)
  - `path`: フォルダのフルパス
  - `name`: フォルダ名(表示用)
- **複数フォルダ対応**: マルチルートワークスペースの場合、各フォルダを個別に記録

### 2. 表示機能

- **コマンド**: コマンドパレットから「Folder History: Show」で起動
- **UI**: VS Code内のWebViewパネルで開く
- **表示形式**: リスト、新しい日付順
- **グループ化**: 日付ごとに見出し(例: `2026-04-27 (月)`)、その下にフォルダ一覧
- **行クリック動作**: そのフォルダをWindowsエクスプローラで開く
  - フォルダが既に削除されている場合はエラー表示
- **検索**: シンプルなテキストフィルタ(フォルダ名・パスで絞り込み)

### 3. 補助機能

- **ログファイルを開く**: コマンド「Folder History: Open Log File」でJSONを直接編集可能
- **既存履歴の取込み(任意)**: コマンド「Folder History: Import from VS Code Recent List」で `state.vscdb` の `recentlyOpenedPathsList` を読み、**タイムスタンプなしの「過去に開いたことがある」エントリ**として `date: null` で取り込む(リスト末尾の「日付不明」セクションに表示)

## データ仕様

### 保存場所

```
%APPDATA%\Code\User\globalStorage\local.folder-history\history.json
```
(VS Codeの `globalStorageUri` で取得される拡張機能専用の永続領域)

### フォーマット

```json
{
  "version": 1,
  "entries": [
    {
      "date": "2026-04-27",
      "path": "C:\\projects\\kintone-plugin",
      "name": "kintone-plugin"
    },
    {
      "date": "2026-04-26",
      "path": "C:\\projects\\bike-research",
      "name": "bike-research"
    },
    {
      "date": null,
      "path": "C:\\old\\some-project",
      "name": "some-project"
    }
  ]
}
```

- 重複排除キー: `date + path` の組み合わせ
- ファイルアクセスは追記時のみ。読み書きは同期I/Oでシンプルに(履歴件数が爆発する想定はないため)

## 非機能要件

- **常駐なし**: VS Codeの起動中のみ動作
- **外部通信なし**: すべてローカル完結
- **依存ライブラリ**: VS Code拡張APIのみ(`vscode`モジュール)、Node.js標準モジュール(`fs`, `path`)のみ使用
- **対象OS**: Windows優先(エクスプローラ起動部分。macOS/Linux対応は将来拡張として可能だが今回は対象外)
- **VS Codeバージョン**: 1.80以上

## 想定外(やらないこと)

- 作業時間の計測(ActivityWatchの領域)
- ファイル単位の履歴
- カレンダー表示(リストのみ)
- クラウド同期
- 複数PC間でのデータ共有
- 自動的な古い履歴の削除(手動でJSONを編集してもらう)

## ファイル構成(予定)

```
folder-history/
├── package.json          // 拡張機能マニフェスト
├── tsconfig.json
├── README.md
└── src/
    ├── extension.ts      // エントリポイント、記録処理
    ├── storage.ts        // history.jsonの読み書き
    ├── webview.ts        // リストUI(HTML生成)
    └── importer.ts       // state.vscdbからの取込み(任意機能)
```

## ビルド・配布方法

- TypeScriptでコンパイル → `vsce package` で `.vsix` を生成
- `code --install-extension folder-history-0.1.0.vsix` でインストール
- マーケットプレイスへの公開はしない(ローカル利用前提)

