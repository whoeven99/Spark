/**
 * Tiny LRU map for worker in-process caches (profile, glossary, etc.).
 */

export class BoundedLruMap<K, V> {
  private readonly _map = new Map<K, V>();

  constructor(private readonly _maxSize: number) {}

  get size(): number {
    return this._map.size;
  }

  get(key: K): V | undefined {
    const value = this._map.get(key);
    if (value === undefined) return undefined;
    // refresh LRU order
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, value);
    while (this._map.size > this._maxSize) {
      const oldest = this._map.keys().next().value;
      if (oldest === undefined) break;
      this._map.delete(oldest);
    }
  }

  delete(key: K): boolean {
    return this._map.delete(key);
  }

  clear(): void {
    this._map.clear();
  }
}
