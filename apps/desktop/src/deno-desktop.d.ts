declare global {
  namespace Deno {
    interface BrowserWindowOptions {
      title?: string;
      width?: number;
      height?: number;
    }
    interface ExecuteJsResult<T = unknown> {
      ok: boolean;
      value: T;
    }
    class BrowserWindow {
      constructor(options?: BrowserWindowOptions);
      readonly windowId: number;
      navigate(url: string): void;
      executeJs<T = unknown>(code: string): Promise<ExecuteJsResult<T>>;
      bind(name: string, handler: (...args: never[]) => unknown): void;
      unbind(name: string): void;
      close(): void;
      show(): void;
      hide(): void;
      focus(): void;
      reload(): void;
      setTitle(title: string): void;
    }
  }
}

export {};
