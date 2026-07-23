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

const token = new URLSearchParams(location.search).get('token') ?? '';
const h = { 'x-mbd-token': token, 'content-type': 'application/json' };

export const api = {
  get: (p: string) => fetch(p, { headers: h }).then((r) => r.json()),
  post: (p: string, b?: unknown) =>
    fetch(p, { method: 'POST', headers: h, body: JSON.stringify(b ?? {}) }).then((r) => r.json()),
  put: (p: string, b?: unknown) =>
    fetch(p, { method: 'PUT', headers: h, body: JSON.stringify(b ?? {}) }).then((r) => r.json()),
  del: (p: string) => fetch(p, { method: 'DELETE', headers: h }).then((r) => r.json()),
};

export function subscribe(handlers: Record<string, (data: unknown) => void>): () => void {
  const es = new EventSource('/events?token=' + token);
  for (const [ev, cb] of Object.entries(handlers)) {
    es.addEventListener(ev, (e) => cb(JSON.parse((e as MessageEvent).data)));
  }
  return () => es.close();
}
