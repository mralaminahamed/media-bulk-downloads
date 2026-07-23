export interface ApiHandler { (req: Request, url: URL): Response | Promise<Response> }
export interface ServerHandle { port: number; token: string; close(): Promise<void> }
export interface StartServerOpts {
  assets: Record<string, { body: string; type: string }>;
  api: Record<string, ApiHandler>;   // keyed by "METHOD /api/path" with :param segments
  sse?: (req: Request, url: URL) => Response;
  port?: number;                     // 0 = random (default)
}
