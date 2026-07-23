export interface CollectedItem {
  src: string;
  kind: 'image' | 'video' | 'audio';
  type?: string;
  ext?: string;
  thumbnailSrc?: string;
  poster?: string;
  width?: number;
  height?: number;
  sourcePage?: { url?: string; title?: string };
}

export interface StoredHistoryEntry {
  src: string;
  filename: string;
  kind: 'image' | 'video' | 'audio';
  type: string;
  thumbnailSrc?: string;
  sourcePageUrl: string;
  sourcePageTitle?: string;
  time: number;
  downloadId?: number;
  path?: string;
}

export interface FavouriteEntry {
  src: string;
  kind: 'image' | 'video' | 'audio';
  type: string;
  thumbnailSrc?: string;
  sourcePageUrl: string;
  sourcePageTitle?: string;
  time: number;
}

const token = new URLSearchParams(location.search).get('token') ?? '';
const h = { 'x-mbd-token': token, 'content-type': 'application/json' };

async function toJson(res: Response): Promise<unknown> {
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (res.status === 204) return {};
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export const api = {
  get: (p: string) => fetch(p, { headers: h }).then(toJson),
  post: (p: string, b?: unknown) =>
    fetch(p, { method: 'POST', headers: h, body: JSON.stringify(b ?? {}) }).then(toJson),
  put: (p: string, b?: unknown) =>
    fetch(p, { method: 'PUT', headers: h, body: JSON.stringify(b ?? {}) }).then(toJson),
  del: (p: string) => fetch(p, { method: 'DELETE', headers: h }).then(toJson),
};

export function subscribe(handlers: Record<string, (data: unknown) => void>): () => void {
  const es = new EventSource('/events?token=' + token);
  for (const [ev, cb] of Object.entries(handlers)) {
    es.addEventListener(ev, (e) => cb(JSON.parse((e as MessageEvent).data)));
  }
  return () => es.close();
}
