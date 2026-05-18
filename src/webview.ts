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
        case 'toggleStar':
          this.handleToggleStar(String(msg.path));
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
    this.webview.html = renderHtml(data.entries, data.stars);
  }

  private handleToggleStar(folderPath: string): void {
    try {
      this.storage.toggleStar(folderPath);
      // 楽観 UI のため通常は WebView 側で即反映済み。
      // ここではエラー時のみユーザーに通知する。
    } catch (err) {
      vscode.window.showErrorMessage(
        `スターの保存に失敗しました: ${(err as Error).message}`
      );
      // 失敗時は全体を再描画して整合性を取り戻す。
      this.refresh();
    }
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

function renderHtml(entries: HistoryEntry[], stars: string[]): string {
  const totalCount = entries.length;
  // Inline the data as JSON for the client to consume. Only fields we need.
  const payload = {
    entries: entries.map(e => ({ d: e.date, p: e.path, n: e.name })),
    stars,
  };
  const payloadJson = JSON.stringify(payload)
    // Avoid premature </script> from data ending up in the inline script.
    .replace(/</g, '\\u003c');

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
  /* tabs */
  .tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .tab {
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    padding: 6px 10px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    border-radius: 3px 3px 0 0;
  }
  .tab:hover { background: var(--vscode-list-hoverBackground); }
  .tab.active {
    color: var(--vscode-foreground);
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  /* header */
  header {
    display: flex;
    align-items: center;
    gap: 4px;
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
  .star-filter-btn {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 3px 6px;
    cursor: pointer;
    font-size: 13px;
    border-radius: 2px;
    line-height: 1;
  }
  .star-filter-btn:hover { background: var(--vscode-list-hoverBackground); }
  .star-filter-btn.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  /* month selector */
  .month-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 8px;
    padding: 4px 0;
  }
  .month-bar button {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    padding: 2px 8px;
    cursor: pointer;
    font-size: 13px;
    border-radius: 2px;
  }
  .month-bar button:hover { background: var(--vscode-list-hoverBackground); }
  .month-bar .month-label {
    font-weight: 600;
    min-width: 80px;
    text-align: center;
  }
  /* groups */
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
  .item { list-style: none; padding: 0; margin: 0; }
  .row {
    padding: 4px 6px;
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
  }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .star-icon {
    flex: 0 0 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    opacity: 0.45;
    font-size: 13px;
    line-height: 1;
    border-radius: 2px;
    padding: 2px;
    user-select: none;
  }
  .star-icon:hover { opacity: 1; }
  .item.starred .star-icon {
    color: var(--vscode-charts-yellow, #d7ba7d);
    opacity: 1;
  }
  .rank-num {
    flex: 0 0 24px;
    text-align: right;
    color: var(--vscode-descriptionForeground);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
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
  .row-count {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-variant-numeric: tabular-nums;
  }
  .empty {
    text-align: center;
    padding: 24px 0;
    opacity: 0.6;
    font-size: 12px;
  }
  .group.hidden, .item.hidden, .view.hidden { display: none; }

  /* Inline action menu */
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
  <div class="tabs" role="tablist">
    <button class="tab active" data-tab="history" role="tab">履歴</button>
    <button class="tab" data-tab="ranking" role="tab">ランキング</button>
  </div>

  <!-- History view -->
  <section class="view view-history" data-view="history">
    <header>
      <input id="filter" type="search" placeholder="絞り込み..." />
      <button id="starFilter" class="star-filter-btn" title="スター付きで絞り込み">&#x2605;</button>
      <span class="count" id="historyCount">${totalCount}</span>
    </header>
    <main id="historyContent"></main>
  </section>

  <!-- Ranking view -->
  <section class="view view-ranking hidden" data-view="ranking">
    <div class="month-bar">
      <button id="prevMonth" title="前の月">&#9664;</button>
      <span class="month-label" id="monthLabel"></span>
      <button id="nextMonth" title="次の月">&#9654;</button>
    </div>
    <main id="rankingContent"></main>
  </section>

<script>
  const vscode = acquireVsCodeApi();
  const PAYLOAD = ${payloadJson};

  const WEEKDAY_JA = ${JSON.stringify(WEEKDAY_JA)};

  // ---- state (persisted across reloads) ----
  const saved = vscode.getState() || {};
  const state = {
    tab: saved.tab || 'history',
    starFilter: !!saved.starFilter,
    month: saved.month || currentYearMonth(),
  };
  function persist() { vscode.setState(state); }

  // ---- data ----
  const stars = new Set(PAYLOAD.stars || []);
  const entries = PAYLOAD.entries || [];
  // Memoized ranking aggregates: Map<YYYY-MM, Array<{path, name, count}>>
  const rankCache = new Map();

  function currentYearMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0');
  }
  function weekdayOf(dateStr) {
    const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(dateStr);
    if (!m) return '';
    const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
    return WEEKDAY_JA[d.getDay()] || '';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
  }

  // ---- rendering ----
  function renderHistory() {
    const groups = new Map();
    const sorted = entries.slice().sort((a,b) => {
      if (a.d === null && b.d === null) return a.n.localeCompare(b.n);
      if (a.d === null) return 1;
      if (b.d === null) return -1;
      return b.d.localeCompare(a.d);
    });
    for (const e of sorted) {
      const key = e.d || '__unknown__';
      let bucket = groups.get(key);
      if (!bucket) { bucket = []; groups.set(key, bucket); }
      bucket.push(e);
    }
    const parts = [];
    for (const [key, list] of groups) {
      const heading = key === '__unknown__' ? '日付不明' : (key + ' (' + weekdayOf(key) + ')');
      const rows = list.map(e => itemHtml({
        path: e.p, name: e.n,
      })).join('');
      parts.push('<section class="group"><h2>' + esc(heading) + '</h2><ul class="list">' + rows + '</ul></section>');
    }
    document.getElementById('historyContent').innerHTML = parts.length
      ? parts.join('')
      : '<div class="empty">履歴がありません。<br/>フォルダを開くと記録されます。</div>';
    bindRowEvents(document.getElementById('historyContent'));
    applyFilters();
  }

  function rankingFor(ym) {
    if (rankCache.has(ym)) return rankCache.get(ym);
    const counts = new Map();
    const names = new Map();
    const prefix = ym + '-';
    for (const e of entries) {
      if (!e.d || !e.d.startsWith(prefix)) continue;
      counts.set(e.p, (counts.get(e.p) || 0) + 1);
      if (!names.has(e.p)) names.set(e.p, e.n);
    }
    const arr = Array.from(counts.entries())
      .map(([p, c]) => ({ path: p, name: names.get(p) || p, count: c }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    rankCache.set(ym, arr);
    return arr;
  }

  function renderRanking() {
    document.getElementById('monthLabel').textContent = state.month;
    const ranked = rankingFor(state.month);
    if (ranked.length === 0) {
      document.getElementById('rankingContent').innerHTML =
        '<div class="empty">' + esc(state.month) + ' に開いたフォルダはありません。</div>';
      return;
    }
    const rows = ranked.map((r, i) => itemHtml({
      path: r.path,
      name: r.name,
      rankNum: i + 1,
      count: r.count + '日',
    })).join('');
    document.getElementById('rankingContent').innerHTML = '<ul class="list">' + rows + '</ul>';
    bindRowEvents(document.getElementById('rankingContent'));
  }

  function itemHtml(opts) {
    const starred = stars.has(opts.path);
    const starIco = starred ? '&#x2605;' : '&#x2606;';
    const rankNum = opts.rankNum != null
      ? '<span class="rank-num">' + opts.rankNum + '.</span>' : '';
    const countLabel = opts.count != null
      ? '<span class="row-count">' + esc(opts.count) + '</span>' : '';
    return '<li class="item' + (starred ? ' starred' : '') + '" data-path="' + esc(opts.path) + '" data-name="' + esc(opts.name) + '">'
      + '<div class="row" title="' + esc(opts.path) + '">'
      +   rankNum
      +   '<span class="star-icon" data-action="toggleStar" title="スター切替">' + starIco + '</span>'
      +   '<div class="row-main">'
      +     '<div class="name">' + esc(opts.name) + '</div>'
      +     '<div class="path">' + esc(opts.path) + '</div>'
      +   '</div>'
      +   countLabel
      + '</div>'
      + '<div class="menu" role="menu">'
      +   '<button data-action="openInVscode" role="menuitem"><span class="ico">&#x270E;</span>VS Code で開く</button>'
      +   '<button data-action="openInExplorer" role="menuitem"><span class="ico">&#x1F4C1;</span>エクスプローラで開く</button>'
      +   '<button data-action="copyPath" role="menuitem"><span class="ico">&#x29C9;</span>フルパスをコピー</button>'
      + '</div>'
      + '</li>';
  }

  // ---- menu / row events ----
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

  function bindRowEvents(container) {
    container.querySelectorAll('.item').forEach(item => {
      const row = item.querySelector('.row');
      // star icon
      const starEl = item.querySelector('.star-icon');
      if (starEl) {
        starEl.addEventListener('click', e => {
          e.stopPropagation();
          const path = item.getAttribute('data-path');
          const nowStarred = !stars.has(path);
          if (nowStarred) stars.add(path); else stars.delete(path);
          item.classList.toggle('starred', nowStarred);
          const ico = starEl;
          ico.innerHTML = nowStarred ? '&#x2605;' : '&#x2606;';
          vscode.postMessage({ type: 'toggleStar', path });
          // re-apply filters in case starFilter is on and this row should hide
          applyFilters();
          // ranking icons aren't affected by stars, but keep state consistent
        });
      }
      row.addEventListener('click', e => {
        e.stopPropagation();
        if (activeItem === item) closeMenu();
        else openMenu(item);
      });
      item.querySelectorAll('.menu button').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const action = btn.getAttribute('data-action');
          const path = item.getAttribute('data-path');
          vscode.postMessage({ type: action, path });
          closeMenu();
        });
      });
    });
  }

  document.addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // ---- filter (history view only) ----
  function applyFilters() {
    const q = (document.getElementById('filter').value || '').toLowerCase().trim();
    const onlyStar = state.starFilter;
    const container = document.getElementById('historyContent');
    container.querySelectorAll('.group').forEach(group => {
      let anyVisible = false;
      group.querySelectorAll('.item').forEach(item => {
        const name = (item.getAttribute('data-name') || '').toLowerCase();
        const path = (item.getAttribute('data-path') || '').toLowerCase();
        const matchText = !q || name.includes(q) || path.includes(q);
        const matchStar = !onlyStar || item.classList.contains('starred');
        const visible = matchText && matchStar;
        item.classList.toggle('hidden', !visible);
        if (visible) anyVisible = true;
      });
      group.classList.toggle('hidden', !anyVisible);
    });
  }

  document.getElementById('filter').addEventListener('input', () => {
    closeMenu();
    applyFilters();
  });

  const starFilterBtn = document.getElementById('starFilter');
  function syncStarFilterBtn() {
    starFilterBtn.classList.toggle('active', state.starFilter);
  }
  starFilterBtn.addEventListener('click', () => {
    state.starFilter = !state.starFilter;
    persist();
    syncStarFilterBtn();
    applyFilters();
  });

  // ---- tabs ----
  function setTab(name) {
    state.tab = name;
    persist();
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('hidden', v.getAttribute('data-view') !== name);
    });
    closeMenu();
    if (name === 'ranking') renderRanking();
  }
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => setTab(t.getAttribute('data-tab')));
  });

  // ---- month nav ----
  document.getElementById('prevMonth').addEventListener('click', () => {
    state.month = shiftMonth(state.month, -1);
    persist();
    renderRanking();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    state.month = shiftMonth(state.month, +1);
    persist();
    renderRanking();
  });

  // ---- init ----
  renderHistory();
  syncStarFilterBtn();
  setTab(state.tab);
</script>
</body>
</html>`;
}
