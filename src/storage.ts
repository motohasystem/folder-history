import * as fs from 'fs';
import * as path from 'path';

export interface HistoryEntry {
  date: string | null; // YYYY-MM-DD or null
  path: string;
  name: string;
}

export interface HistoryFile {
  version: number;
  entries: HistoryEntry[];
  stars: string[]; // folder paths
}

const EMPTY: HistoryFile = { version: 2, entries: [], stars: [] };

export class HistoryStorage {
  constructor(private readonly filePath: string) {}

  getFilePath(): string {
    return this.filePath;
  }

  private ensureDir(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load(): HistoryFile {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { ...EMPTY, stars: [] };
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) {
        return { ...EMPTY, stars: [] };
      }
      const parsed = JSON.parse(raw) as Partial<HistoryFile>;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
        return { ...EMPTY, stars: [] };
      }
      return {
        version: parsed.version ?? 1,
        entries: parsed.entries,
        stars: Array.isArray(parsed.stars) ? parsed.stars : [],
      };
    } catch {
      return { ...EMPTY, stars: [] };
    }
  }

  save(data: HistoryFile): void {
    this.ensureDir();
    // Always serialize as v2.
    const out: HistoryFile = {
      version: 2,
      entries: data.entries,
      stars: data.stars,
    };
    fs.writeFileSync(this.filePath, JSON.stringify(out, null, 2), 'utf8');
  }

  /**
   * Add an entry. Dedup key is `date + path`.
   * Returns true if added, false if already existed.
   */
  addEntry(entry: HistoryEntry): boolean {
    const data = this.load();
    const exists = data.entries.some(
      e => e.date === entry.date && e.path === entry.path
    );
    if (exists) {
      return false;
    }
    data.entries.push(entry);
    this.save(data);
    return true;
  }

  /**
   * Bulk-add entries with the same dedup rule. Returns count added.
   */
  addEntries(entries: HistoryEntry[]): number {
    const data = this.load();
    const key = (e: HistoryEntry) => `${e.date ?? ''}\u0000${e.path}`;
    const seen = new Set(data.entries.map(key));
    let added = 0;
    for (const e of entries) {
      const k = key(e);
      if (!seen.has(k)) {
        seen.add(k);
        data.entries.push(e);
        added++;
      }
    }
    if (added > 0) {
      this.save(data);
    }
    return added;
  }

  isStarred(folderPath: string): boolean {
    return this.load().stars.includes(folderPath);
  }

  /**
   * Toggle star for a folder. Returns the new state (true = starred).
   */
  toggleStar(folderPath: string): boolean {
    const data = this.load();
    const idx = data.stars.indexOf(folderPath);
    let nowStarred: boolean;
    if (idx >= 0) {
      data.stars.splice(idx, 1);
      nowStarred = false;
    } else {
      data.stars.push(folderPath);
      nowStarred = true;
    }
    this.save(data);
    return nowStarred;
  }
}

export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
