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
        case 'open':
          await openInExplorer(String(msg.path));
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
        <li class="row" data-path="${escapeAttr(e.path)}" data-name="${escapeAttr(e.name)}" title="${escapeAttr(e.path)}">
          <div class="row-main">
            <div class="name">${escapeHtml(e.name)}</div>
            <div class="path">${escapeHtml(e.path)}</div>
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
  }
  .row:hover { background: var(--vscode-list-hoverBackground); }
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
  .group.hidden, .row.hidden { display: none; }
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

  document.querySelectorAll('.row').forEach(el => {
    el.addEventListener('click', () => {
      const p = el.getAttribute('data-path');
      vscode.postMessage({ type: 'open', path: p });
    });
  });

  filter.addEventListener('input', () => {
    const q = filter.value.toLowerCase().trim();
    document.querySelectorAll('.group').forEach(group => {
      let anyVisible = false;
      group.querySelectorAll('.row').forEach(row => {
        const name = (row.getAttribute('data-name') || '').toLowerCase();
        const path = (row.getAttribute('data-path') || '').toLowerCase();
        const match = !q || name.includes(q) || path.includes(q);
        row.classList.toggle('hidden', !match);
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
