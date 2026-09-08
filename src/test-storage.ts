const mem = new Map<string, string>();

const storage = {
  getItem(key: string): string | null {
    return mem.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    mem.set(key, value);
  },
  removeItem(key: string): void {
    mem.delete(key);
  },
  clear(): void {
    mem.clear();
  },
  key(index: number): string | null {
    return [...mem.keys()][index] ?? null;
  },
  get length(): number {
    return mem.size;
  },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

export function resetMemoryStorage(): void {
  mem.clear();
}
