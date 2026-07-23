export interface Store {
  durableGet<T>(key: string): Promise<T | null>;
  durableSet<T>(key: string, value: T): Promise<void>;
  close(): void;
}

export async function openStore(path: string): Promise<Store> {
  const kv = await Deno.openKv(path);
  return {
    async durableGet<T>(key: string): Promise<T | null> {
      const res = await kv.get<T>([key]);
      return res.value ?? null;
    },
    async durableSet<T>(key: string, value: T): Promise<void> {
      await kv.set([key], value);
    },
    close() {
      kv.close();
    },
  };
}
