import * as fs from 'fs';
import * as path from 'path';
import { HistoryEntry } from './storage';

/**
 * Best-effort importer for VS Code's `recentlyOpenedPathsList`.
 *
 * The list lives in `state.vscdb` (SQLite) under the key
 * `history.recentlyOpenedPathsList`. We avoid an SQLite dependency
 * (per spec: vscode + fs + path only) by scanning the file as text
 * for `"folderUri":"file://..."` / `"configPath":"file://..."`
 * patterns. SQLite may split records across pages with binary
 * headers; balanced-JSON parsing is unreliable, so we extract URIs
 * directly with a regex.
 */

export function findStateVscdbPath(): string | undefined {
  // Windows-only per spec.
  const appData = process.env.APPDATA;
  if (!appData) {
    return undefined;
  }
  const candidates = [
    path.join(appData, 'Code', 'User', 'globalStorage', 'state.vscdb'),
    path.join(appData, 'Code - Insiders', 'User', 'globalStorage', 'state.vscdb'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return undefined;
}

export function importFromStateVscdb(dbPath: string): HistoryEntry[] {
  const text = fs.readFileSync(dbPath, 'utf8');
  // Match folderUri or configPath/fileUri values that look like file:// URIs.
  // Stop at the closing quote — file URIs do not contain " in the percent-encoded form.
  const re = /"(?:folderUri|configPath|fileUri)"\s*:\s*"(file:\/\/[^"]+)"/g;
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const folderPath = uriToPath(m[1]);
    if (!folderPath || seen.has(folderPath)) {
      continue;
    }
    seen.add(folderPath);
    out.push({
      date: null,
      path: folderPath,
      name: path.basename(folderPath) || folderPath,
    });
  }
  return out;
}

function uriToPath(uri: string | undefined): string | undefined {
  if (!uri) {
    return undefined;
  }
  // Expect file:///C:/foo/bar form.
  const m = /^file:\/\/\/?(.*)$/.exec(uri);
  if (!m) {
    return undefined;
  }
  let p: string;
  try {
    p = decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
  // Normalize: Windows path comes through as "C:/foo/bar".
  p = p.replace(/\//g, path.sep);
  // If we got "C:\foo" we're done; if "/c:\foo" strip leading sep on Windows.
  if (process.platform === 'win32' && /^[\\/][a-zA-Z]:/.test(p)) {
    p = p.slice(1);
  }
  return p;
}
