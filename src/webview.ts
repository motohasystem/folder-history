import * as vscode from 'vscode';
import { HistoryEntry, HistoryStorage } from './storage';

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * Wires a `vscode.Webview` (panel or view) to the history list:
 * sets HTML, handles messages, exposes a refresh().
 */
export class HistoryWebviewController {
  constructor(
    private readonly storage: HistoryStorage,
    private readonly webview: vscode.Webview
  ) {
    webview.options = { enableScripts: true };
    webview.onDidReceiveMessage(async msg => {
      if (!msg || typeof msg !== 'object') {
        return;
      }
      switch (msg.type) {
        case 'openInExplorer':
          await openInExplorer(String(msg.path));
          break;
        case 'openInVscode':
          await openInVscode(String(msg.path));
          break;
        case 'copyPath':
          await copyPath(String(msg.path));
          break;
        case 'refresh':
          this.refresh();
          break;
      }
    });
    this.refresh();
  }

  refresh(): void {
    const data = this.storage.load();
    this.webview.html = renderHtml(data.entries);
  }
}

/**
 * Standalone WebView panel (for the "Folder History: Show" command).
 */
export class HistoryWebviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private controller: HistoryWebviewController | undefined;

  constructor(private readonly storage: HistoryStorage) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.controller?.refresh();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'folderHistory',
      'Folder History',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.controller = undefined;
    });
    this.controller = new HistoryWebviewController(this.storage, this.panel.webview);
  }

  refresh(): void {
    this.controller?.refresh();
  }
}

/**
 * Sidebar (activity bar) view provider. VS Code creates the webview
 * lazily when the user opens the view.
 */
export class HistorySidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'folderHistory.sidebar';

  private controller: HistoryWebviewController | undefined;

  constructor(private readonly storage: HistoryStorage) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.controller = new HistoryWebviewController(this.storage, view.webview);
    view.onDidDispose(() => {
      this.controller = undefined;
    });
  }

  refresh(): void {
    this.controller?.refresh();
  }
}

async function openInExplorer(folderPath: string): Promise<void> {
  if (!folderPath) {
    return;
  }
  try {
    const uri = vscode.Uri.file(folderPath);
    await vscode.commands.executeCommand('revealFileInOS', uri);
  } catch (err) {
    vscode.window.showErrorMessage(
      `フォルダを開けませんでした: ${folderPath} (${(err as Error).message})`
    );
  }
}

async function openInVscode(folderPath: string): Promise<void> {
  if (!folderPath) {
    return;
  }
  try {
    const uri = vscode.Uri.file(folderPath);
    // forceNewWindow: 既存ウィンドウを置き換えず、新しいウィンドウで開く。
    await vscode.commands.executeCommand('vscode.openFolder', uri, {
      forceNewWindow: true,
    });
  } catch (err) {
    vscode.window.showErrorMessage(
      `VS Code でフォルダを開けませんでした: ${folderPath} (${(err as Error).message})`
    );
  }
}

async function copyPath(folderPath: string): Promise<void> {
  if (!folderPath) {
    return;
  }
  try {
    await vscode.env.clipboard.writeText(folderPath);
    vscode.window.setStatusBarMessage(`コピーしました: ${folderPath}`, 3000);
  } catch (err) {
    vscode.window.showErrorMessage(
      `コピーに失敗しました: ${(err as Error).message}`
    );
  }
}

function renderHtml(entries: HistoryEntry[]): string {
  const groups = new Map<string, HistoryEntry[]>();
  const sorted = [...entries].sort((a, b) => {
    if (a.date === null && b.date === null) {
      return a.name.localeCompare(b.name);
    }
    if (a.date === null) {
      return 1;
    }
    if (b.date === null) {
      return -1;
    }
    return b.date.localeCompare(a.date);
  });

  for (const e of sorted) {
    const key = e.date ?? '__unknown__';
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(e);
  }

  const sectionsHtml: string[] = [];
  for (const [key, list] of groups) {
    const heading = key === '__unknown__' ? '日付不明' : `${key} (${weekdayOf(key)})`;
    const rows = list
      .map(
        e => `
        <li class="item" data-path="${escapeAttr(e.path)}" data-name="${escapeAttr(e.name)}">
          <div class="row" title="${escapeAttr(e.path)}">
            <div class="row-main">
              <div class="name">${escapeHtml(e.name)}</div>
              <div class="path">${escapeHtml(e.path)}</div>
            </div>
          </div>
          <div class="menu" role="menu">
            <button data-action="openInVscode" role="menuitem"><span class="ico">&#x270E;</span>VS Code で開く</button>
            <button data-action="openInExplorer" role="menuitem"><span class="ico">&#x1F4C1;</span>エクスプローラで開く</button>
            <button data-action="copyPath" role="menuitem"><span class="ico">&#x29C9;</span>フルパスをコピー</button>
          </div>
        </li>`
      )
      .join('');
    sectionsHtml.push(`
      <section class="group" data-heading="${escapeAttr(heading)}">
        <h2>${escapeHtml(heading)}</h2>
        <ul class="list">${rows}</ul>
      </section>`);
  }

  const totalCount = entries.length;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Folder History</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 8px;
    margin: 0;
    font-size: 13px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    position: sticky;
    top: 0;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 4px 0;
    z-index: 10;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .count { opacity: 0.6; font-size: 11px; }
  input[type="search"] {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 4px 6px;
    border-radius: 2px;
    font-family: inherit;
    font-size: 12px;
    min-width: 0;
  }
  .group { margin-bottom: 12px; }
  .group h2 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 2px;
    margin: 0 0 4px 0;
  }
  .list { list-style: none; padding: 0; margin: 0; }
  .row {
    padding: 4px 6px;
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    position: relative;
  }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .row-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    text-align: center;
    padding: 24px 0;
    opacity: 0.6;
    font-size: 12px;
  }
  .group.hidden, .item.hidden { display: none; }
  .item { list-style: none; padding: 0; margin: 0; }

  /* Inline action menu shown under the active row */
  .menu {
    display: none;
    margin: 2px 6px 6px 6px;
    background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, var(--vscode-panel-border)));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    padding: 4px;
    z-index: 5;
  }
  .menu.show { display: block; }
  .menu button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    background: transparent;
    color: inherit;
    border: none;
    padding: 6px 8px;
    border-radius: 3px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
    color: var(--vscode-menu-selectionForeground, inherit);
  }
  .menu button .ico {
    flex: 0 0 14px;
    opacity: 0.8;
    text-align: center;
  }
</style>
</head>
<body>
  <header>
    <input id="filter" type="search" placeholder="絞り込み..." />
    <span class="count">${totalCount}</span>
  </header>
  <main id="content">
    ${
      sectionsHtml.length === 0
        ? '<div class="empty">履歴がありません。<br/>フォルダを開くと記録されます。</div>'
        : sectionsHtml.join('\n')
    }
  </main>
<script>
  const vscode = acquireVsCodeApi();
  const filter = document.getElementById('filter');

  let activeItem = null;

  function closeMenu() {
    if (activeItem) {
      activeItem.querySelector('.menu')?.classList.remove('show');
      activeItem.querySelector('.row')?.classList.remove('active');
      activeItem = null;
    }
  }

  function openMenu(item) {
    closeMenu();
    item.querySelector('.menu')?.classList.add('show');
    item.querySelector('.row')?.classList.add('active');
    activeItem = item;
  }

  document.querySelectorAll('.item').forEach(item => {
    const row = item.querySelector('.row');
    row.addEventListener('click', e => {
      e.stopPropagation();
      if (activeItem === item) {
        closeMenu();
      } else {
        openMenu(item);
      }
    });
    item.querySelectorAll('.menu button').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const path = item.getAttribute('data-path');
        vscode.postMessage({ type: action, path: path });
        closeMenu();
      });
    });
  });

  // Click outside / Esc closes the menu.
  document.addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  filter.addEventListener('input', () => {
    closeMenu();
    const q = filter.value.toLowerCase().trim();
    document.querySelectorAll('.group').forEach(group => {
      let anyVisible = false;
      group.querySelectorAll('.item').forEach(item => {
        const name = (item.getAttribute('data-name') || '').toLowerCase();
        const path = (item.getAttribute('data-path') || '').toLowerCase();
        const match = !q || name.includes(q) || path.includes(q);
        item.classList.toggle('hidden', !match);
        if (match) anyVisible = true;
      });
      group.classList.toggle('hidden', !anyVisible);
    });
  });
</script>
</body>
</html>`;
}

function weekdayOf(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) {
    return '';
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return WEEKDAY_JA[d.getDay()] ?? '';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
