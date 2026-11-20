// Lớp lưu trữ cho trang admin, chạy trên trình duyệt:
// - ServerBackend: site đã deploy → gọi /api/admin (Cloudflare Pages Function). Người dùng đăng nhập
//   bằng email qua Cloudflare Access, không cần GitHub. Tự dùng khi API trả lời được.
// - LocalBackend:  đọc/ghi thẳng thư mục dự án (File System Access API, Chrome/Edge) khi chạy local.
// - GitHubBackend: dùng token GitHub cá nhân (phương án dự phòng).
// Server/GitHub: mỗi lần lưu là 1 commit KHÔNG build; bấm "Đăng lên site" mới build 1 lần.
import { GitRepo, SKIP_BUILD, base64ToBytes, bytesToBase64, type GitChange, type RepoConfig } from './github';

/** content = null: xoá file (hoặc cả thư mục nếu dir = true) */
export interface Change {
  path: string;
  content: string | Blob | null;
  dir?: boolean;
}

export interface Publisher {
  pending(): Promise<number>;
  publish(): Promise<void>;
}

export interface Backend {
  kind: 'local' | 'github' | 'server';
  label: string;
  listFiles(dir: string): Promise<string[]>;
  listDirs(dir: string): Promise<string[]>;
  read(path: string): Promise<string | null>;
  readBlob(path: string): Promise<Blob | null>;
  apply(changes: Change[], message: string): Promise<void>;
  /** Có khi thay đổi cần "Đăng lên site" mới hiện (server / github) */
  publisher?: Publisher;
}

const split = (path: string) => path.split('/').filter(Boolean);

const mimeOf = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'text/plain';
};

async function toGitChanges(changes: Change[]): Promise<GitChange[]> {
  return Promise.all(
    changes.map(async (c) =>
      c.content === null
        ? { path: c.path, dir: c.dir }
        : typeof c.content === 'string'
          ? { path: c.path, text: c.content }
          : { path: c.path, base64: bytesToBase64(new Uint8Array(await c.content.arrayBuffer())) },
    ),
  );
}

/** Liệt kê file/thư mục con trực tiếp của `dir` từ danh sách đường dẫn đầy đủ */
function childrenOf(paths: Iterable<string>, dir: string) {
  const prefix = split(dir).join('/') + '/';
  const files = new Set<string>();
  const dirs = new Set<string>();
  for (const p of paths) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length).split('/');
    (rest.length === 1 ? files : dirs).add(rest[0]);
  }
  return { files: [...files].sort(), dirs: [...dirs].sort() };
}

// ---------------------------------------------------------------- Local

class LocalBackend implements Backend {
  kind = 'local' as const;
  label: string;
  constructor(private root: FileSystemDirectoryHandle) {
    this.label = `Thư mục: ${root.name}`;
  }

  private async dir(path: string, create = false): Promise<FileSystemDirectoryHandle | null> {
    let d = this.root;
    try {
      for (const p of split(path)) d = await d.getDirectoryHandle(p, { create });
      return d;
    } catch {
      return null;
    }
  }

  private async entries(path: string, kind: 'file' | 'directory') {
    const d = await this.dir(path);
    if (!d) return [];
    const out: string[] = [];
    for await (const e of (d as any).values()) if (e.kind === kind) out.push(e.name);
    return out.sort();
  }

  listFiles(dir: string) {
    return this.entries(dir, 'file');
  }
  listDirs(dir: string) {
    return this.entries(dir, 'directory');
  }

  async readBlob(path: string) {
    const parts = split(path);
    const d = await this.dir(parts.slice(0, -1).join('/'));
    if (!d) return null;
    try {
      return await (await d.getFileHandle(parts.at(-1)!)).getFile();
    } catch {
      return null;
    }
  }
  async read(path: string) {
    const blob = await this.readBlob(path);
    return blob ? blob.text() : null;
  }

  async apply(changes: Change[]) {
    for (const c of changes) {
      const parts = split(c.path);
      const name = parts.at(-1)!;
      if (c.content === null) {
        const d = await this.dir(parts.slice(0, -1).join('/'));
        try {
          await d?.removeEntry(name, { recursive: !!c.dir });
        } catch {}
        continue;
      }
      const d = (await this.dir(parts.slice(0, -1).join('/'), true))!;
      const w = await (await d.getFileHandle(name, { create: true })).createWritable();
      await w.write(c.content);
      await w.close();
    }
  }
}

// ---------------------------------------------------------------- GitHub (token cá nhân)

class GitHubBackend implements Backend {
  kind = 'github' as const;
  label: string;
  private repo: GitRepo;
  publisher: Publisher;

  constructor(cfg: RepoConfig) {
    this.label = `GitHub: ${cfg.repo}@${cfg.branch}`;
    this.repo = new GitRepo(cfg);
    this.publisher = {
      pending: () => this.repo.pending(),
      publish: () => this.repo.publish('publish: đăng nội dung lên site'),
    };
  }
  async load() {
    await this.repo.load();
  }
  async listFiles(dir: string) {
    return childrenOf(this.repo.tree.keys(), dir).files;
  }
  async listDirs(dir: string) {
    return childrenOf(this.repo.tree.keys(), dir).dirs;
  }
  async readBlob(path: string) {
    const b64 = await this.repo.readBase64(path);
    return b64 === null ? null : new Blob([base64ToBytes(b64)], { type: mimeOf(path) });
  }
  async read(path: string) {
    const b64 = await this.repo.readBase64(path);
    return b64 === null ? null : new TextDecoder().decode(base64ToBytes(b64));
  }
  async apply(changes: Change[], message: string) {
    await this.repo.commit(await toGitChanges(changes), `${message} ${SKIP_BUILD}`);
  }
}

// ---------------------------------------------------------------- Server (/api/admin trên Cloudflare)

class ServerBackend implements Backend {
  kind = 'server' as const;
  label: string;
  private tree = new Map<string, string>(); // path -> sha
  publisher: Publisher;

  constructor(public email: string) {
    this.label = `Đăng nhập: ${email}`;
    this.publisher = {
      pending: async () => (await this.call('pending')).pending as number,
      publish: async () => void (await this.call('publish', { method: 'POST' })),
    };
  }

  private async call(path: string, init?: RequestInit) {
    const res = await fetch(`/api/admin/${path}`, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  }

  async load() {
    this.tree = new Map(Object.entries((await this.call('tree')).files as Record<string, string>));
  }
  async listFiles(dir: string) {
    return childrenOf(this.tree.keys(), dir).files;
  }
  async listDirs(dir: string) {
    return childrenOf(this.tree.keys(), dir).dirs;
  }
  async readBlob(path: string) {
    const sha = this.tree.get(split(path).join('/'));
    if (!sha) return null;
    const res = await fetch(`/api/admin/blob?sha=${sha}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Không đọc được ${path} (HTTP ${res.status})`);
    return new Blob([await res.arrayBuffer()], { type: mimeOf(path) });
  }
  async read(path: string) {
    const blob = await this.readBlob(path);
    return blob ? blob.text() : null;
  }
  async apply(changes: Change[], message: string) {
    const data = await this.call('commit', { method: 'POST', body: JSON.stringify({ changes: await toGitChanges(changes), message }) });
    this.tree = new Map(Object.entries(data.files as Record<string, string>));
  }
}

// ---------------------------------------------------------------- Kết nối (nhớ lại giữa các lần mở)

const DB = 'story-admin';
const GH_KEY = 'gh-admin';
export const isLocalhost = () => ['localhost', '127.0.0.1'].includes(location.hostname);

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction('kv', mode).objectStore('kv'));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}

export type Restore =
  | { status: 'ready'; backend: Backend }
  | { status: 'needs-permission'; name: string }
  | { status: 'server-error'; message: string }
  | { status: 'none' };

/** Thử dùng API của site (khi đã deploy). null = không có API (đang chạy local / chưa cấu hình). */
async function tryServer(): Promise<{ backend?: ServerBackend; error?: string }> {
  try {
    const res = await fetch('/api/admin/me', { credentials: 'same-origin' });
    if (res.status === 404) return {};
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.email) return { error: data?.error ?? `HTTP ${res.status}` };
    const b = new ServerBackend(data.email);
    await b.load();
    return { backend: b };
  } catch {
    return {};
  }
}

/** Khôi phục kết nối: ưu tiên API của site (production), rồi GitHub token, rồi thư mục local. */
export async function restoreBackend(): Promise<Restore> {
  // Có API (site đã deploy, hoặc wrangler pages dev) thì luôn dùng API; `astro dev` không có API → 404 → bỏ qua
  const s = await tryServer();
  if (s.backend) return { status: 'ready', backend: s.backend };
  const serverError = s.error;
  try {
    const gh = JSON.parse(localStorage.getItem(GH_KEY) || 'null') as RepoConfig | null;
    if (gh) {
      const b = new GitHubBackend(gh);
      await b.load();
      return { status: 'ready', backend: b };
    }
  } catch (e) {
    console.warn(e);
  }
  try {
    const handle = await idb<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get('root'));
    if (handle) {
      const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return { status: 'ready', backend: new LocalBackend(handle) };
      return { status: 'needs-permission', name: handle.name };
    }
  } catch {}
  if (serverError) return { status: 'server-error', message: serverError };
  return { status: 'none' };
}

/** Cấp lại quyền cho thư mục đã lưu (phải gọi từ một cú click). */
export async function regrantLocal(): Promise<Backend | null> {
  const handle = await idb<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get('root'));
  if (!handle) return null;
  const perm = await (handle as any).requestPermission({ mode: 'readwrite' });
  return perm === 'granted' ? new LocalBackend(handle) : null;
}

/** Chọn thư mục dự án (phải gọi từ một cú click). */
export async function connectLocal(): Promise<Backend> {
  if (!('showDirectoryPicker' in window)) throw new Error('Trình duyệt không hỗ trợ chọn thư mục. Hãy dùng Chrome hoặc Edge.');
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'story-project', mode: 'readwrite' });
  try {
    await handle.getFileHandle('astro.config.mjs');
  } catch {
    throw new Error(`Thư mục "${handle.name}" không phải thư mục gốc dự án (không thấy astro.config.mjs).`);
  }
  localStorage.removeItem(GH_KEY);
  await idb('readwrite', (s) => s.put(handle, 'root'));
  return new LocalBackend(handle);
}

export async function connectGitHub(cfg: RepoConfig): Promise<Backend> {
  const b = new GitHubBackend(cfg);
  await b.load();
  if (!(await b.listFiles('')).includes('astro.config.mjs')) throw new Error('Repo này không phải dự án site truyện (không thấy astro.config.mjs).');
  localStorage.setItem(GH_KEY, JSON.stringify(cfg));
  await idb('readwrite', (s) => s.delete('root')).catch(() => {});
  return b;
}

export async function disconnect() {
  localStorage.removeItem(GH_KEY);
  await idb('readwrite', (s) => s.delete('root')).catch(() => {});
}
