import * as vscode from 'vscode';
import * as path from 'path';
import { HistoryStorage, HistoryEntry, todayLocal } from './storage';
import { HistoryWebviewPanel, HistorySidebarProvider } from './webview';
import { findStateVscdbPath, importFromStateVscdb } from './importer';

let storage: HistoryStorage;
let panel: HistoryWebviewPanel;
let sidebar: HistorySidebarProvider;

export function activate(context: vscode.ExtensionContext): void {
  const historyPath = path.join(context.globalStorageUri.fsPath, 'history.json');
  storage = new HistoryStorage(historyPath);
  panel = new HistoryWebviewPanel(storage);
  sidebar = new HistorySidebarProvider(storage);

  // Record currently open folders on activation.
  recordCurrentFolders();

  // Record on workspace folder changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(e => {
      for (const f of e.added) {
        recordFolder(f);
      }
      sidebar.refresh();
    })
  );

  // Sidebar webview view (activity bar shortcut).
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      HistorySidebarProvider.viewType,
      sidebar
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('folderHistory.show', () => {
      panel.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('folderHistory.refresh', () => {
      sidebar.refresh();
      panel.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('folderHistory.openLogFile', async () => {
      try {
        const data = storage.load();
        storage.save(data);
        const doc = await vscode.workspace.openTextDocument(storage.getFilePath());
        await vscode.window.showTextDocument(doc);
      } catch (err) {
        vscode.window.showErrorMessage(
          `ログファイルを開けませんでした: ${(err as Error).message}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('folderHistory.importFromRecent', async () => {
      await importFromRecentList();
      sidebar.refresh();
      panel.refresh();
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}

function recordCurrentFolders(): void {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const f of folders) {
    recordFolder(f);
  }
}

function recordFolder(folder: vscode.WorkspaceFolder): void {
  if (folder.uri.scheme !== 'file') {
    return;
  }
  const folderPath = folder.uri.fsPath;
  const entry: HistoryEntry = {
    date: todayLocal(),
    path: folderPath,
    name: folder.name || path.basename(folderPath) || folderPath,
  };
  try {
    storage.addEntry(entry);
  } catch (err) {
    console.error('[folder-history] failed to record entry', err);
  }
}

async function importFromRecentList(): Promise<void> {
  const dbPath = findStateVscdbPath();
  if (!dbPath) {
    vscode.window.showErrorMessage(
      'state.vscdb が見つかりませんでした (Windows用、%APPDATA%\\Code\\User\\globalStorage\\state.vscdb)。'
    );
    return;
  }
  try {
    const entries = importFromStateVscdb(dbPath);
    if (entries.length === 0) {
      vscode.window.showWarningMessage(
        'recentlyOpenedPathsList の解析結果が空でした。'
      );
      return;
    }
    const added = storage.addEntries(entries);
    vscode.window.showInformationMessage(
      `${added}件のフォルダを取り込みました(date: null)。既存と重複したものはスキップしています。`
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `取込みに失敗しました: ${(err as Error).message}`
    );
  }
}
