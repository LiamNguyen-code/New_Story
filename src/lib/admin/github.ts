// Thao tác repo GitHub qua Git Data API. Dùng chung cho:
// - trình duyệt (kết nối GitHub bằng token cá nhân)
// - Cloudflare Pages Function /api/admin (token nằm trên server, người dùng đăng nhập bằng email)

/** Commit có dấu này sẽ không làm Cloudflare Pages build lại (gom nhiều lần lưu vào 1 lần đăng). */
export const SKIP_BUILD = '[CF-Pages-Skip]';

export interface RepoConfig {
  repo: string; // "user/repo"
  branch: string;
  token: string;
  api?: string; // mặc định https://api.github.com (đổi được để test)
}

/** text: nội dung UTF-8 · base64: nội dung nhị phân · cả hai null = xoá (dir: xoá cả thư mục) */
export interface GitChange {
  path: string;
  text?: string | null;
  base64?: string | null;
  dir?: boolean;
}

const clean = (p: string) => p.split('/').filter(Boolean).join('/');

export class GitRepo {
  headSha = '';
  /** path -> blob sha */
  tree = new Map<string, string>();

  constructor(private cfg: RepoConfig) {}

  private async api(path: string, init?: RequestInit) {
    const res = await fetch(`${this.cfg.api ?? 'https://api.github.com'}/repos/${this.cfg.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'story-admin',
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      const err = new Error(`GitHub ${res.status}: ${body.message ?? res.statusText}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<any>;
  }

  async load() {
    const ref = await this.api(`/git/ref/heads/${this.cfg.branch}`);
    this.headSha = ref.object.sha;
    const commit = await this.api(`/git/commits/${this.headSha}`);
    const tree = await this.api(`/git/trees/${commit.tree.sha}?recursive=1`);
    this.tree.clear();
    for (const t of tree.tree) if (t.type === 'blob') this.tree.set(t.path, t.sha);
    return this;
  }

  async readBase64(path: string): Promise<string | null> {
    const sha = this.tree.get(clean(path));
    if (!sha) return null;
    return this.readBlobBase64(sha);
  }

  async readBlobBase64(sha: string): Promise<string> {
    const blob = await this.api(`/git/blobs/${sha}`);
    return String(blob.content).replace(/\n/g, '');
  }

  /** Tạo 1 commit chứa mọi thay đổi. Tự thử lại nếu nhánh vừa bị người khác cập nhật. */
  async commit(changes: GitChange[], message: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      await this.load();
      const entries: Record<string, unknown>[] = [];
      for (const c of changes) {
        const path = clean(c.path);
        if (c.text == null && c.base64 == null) {
          const targets = c.dir ? [...this.tree.keys()].filter((p) => p.startsWith(path + '/')) : this.tree.has(path) ? [path] : [];
          for (const p of targets) entries.push({ path: p, mode: '100644', type: 'blob', sha: null });
        } else if (c.text != null) {
          entries.push({ path, mode: '100644', type: 'blob', content: c.text });
        } else {
          const blob = await this.api('/git/blobs', { method: 'POST', body: JSON.stringify({ content: c.base64, encoding: 'base64' }) });
          entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
        }
      }
      if (!entries.length) return this.headSha;
      const base = await this.api(`/git/commits/${this.headSha}`);
      const tree = await this.api('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree: entries }) });
      const commit = await this.api('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [this.headSha] }) });
      try {
        await this.api(`/git/refs/heads/${this.cfg.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
        await this.load();
        return commit.sha;
      } catch (e) {
        // 422 = nhánh đã có commit mới (người khác vừa lưu) → làm lại trên HEAD mới
        if ((e as { status?: number }).status === 422 && attempt < 3) continue;
        throw e;
      }
    }
  }

  /** Số lần lưu chưa được đăng (các commit gần nhất có SKIP_BUILD, tính tới commit build gần nhất). */
  async pending(): Promise<number> {
    const commits = await this.api(`/commits?sha=${encodeURIComponent(this.cfg.branch)}&per_page=100`);
    let n = 0;
    for (const c of commits) {
      if (!String(c.commit.message).includes(SKIP_BUILD)) break;
      n++;
    }
    return n;
  }

  /** Commit rỗng (không có SKIP_BUILD) để Cloudflare Pages build và đăng mọi thay đổi đã lưu. */
  async publish(message: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      await this.load();
      const head = await this.api(`/git/commits/${this.headSha}`);
      const commit = await this.api('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: head.tree.sha, parents: [this.headSha] }) });
      try {
        await this.api(`/git/refs/heads/${this.cfg.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
        return;
      } catch (e) {
        if ((e as { status?: number }).status === 422 && attempt < 3) continue;
        throw e;
      }
    }
  }
}

export function bytesToBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
