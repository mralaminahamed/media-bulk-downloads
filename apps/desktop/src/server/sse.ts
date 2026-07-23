export interface SseHub {
  handler(req: Request): Response;
  broadcast(event: string, data: unknown): void;
  clientCount(): number;
}

export function createSseHub(): SseHub {
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const enc = new TextEncoder();
  return {
    handler(req) {
      let ctrl: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(c) { ctrl = c; clients.add(c); },
        cancel() { clients.delete(ctrl); },
      });
      req.signal.addEventListener('abort', () => { clients.delete(ctrl); try { ctrl.close(); } catch { /* closed */ } });
      return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'connection': 'keep-alive' } });
    },
    broadcast(event, data) {
      const frame = enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      for (const c of clients) { try { c.enqueue(frame); } catch { clients.delete(c); } }
    },
    clientCount: () => clients.size,
  };
}
