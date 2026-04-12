/**
 * Least-recently-used map: eviction on `set` when at capacity removes the key
 * least recently read or written. `get` promotes the entry (refreshes order).
 */
export class LruMap<K, V> {
  private readonly store = new Map<K, V>();

  constructor(private readonly maxSize: number) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new RangeError("LruMap maxSize must be a positive integer");
    }
  }

  get(key: K): V | undefined {
    if (!this.store.has(key)) return undefined;
    const value = this.store.get(key) as V;
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      const lru = this.store.keys().next().value as K;
      this.store.delete(lru);
    }
    this.store.set(key, value);
    return this;
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
