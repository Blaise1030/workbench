import { describe, expect, it } from "vitest";
import { LruMap } from "../lruMap";

describe("LruMap", () => {
  it("evicts least recently used after get refreshes order (maxSize 2)", () => {
    const cache = new LruMap<string, string>(2);
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.get("a")).toBe("1");
    cache.set("c", "3");
    expect(cache.has("b")).toBe(false);
    expect(cache.get("a")).toBe("1");
    expect(cache.get("c")).toBe("3");
  });

  it("get promotes existing key so it is not evicted next", () => {
    const cache = new LruMap<string, number>(2);
    cache.set("x", 1);
    cache.set("y", 2);
    cache.get("x");
    cache.set("z", 3);
    expect(cache.has("y")).toBe(false);
    expect(cache.get("x")).toBe(1);
    expect(cache.get("z")).toBe(3);
  });

  it("rejects non-positive maxSize", () => {
    expect(() => new LruMap<string, string>(0)).toThrow(RangeError);
    expect(() => new LruMap<string, string>(-1)).toThrow(RangeError);
    expect(() => new LruMap<string, string>(1.5)).toThrow(RangeError);
  });

  it("has, delete, clear", () => {
    const cache = new LruMap<string, string>(3);
    cache.set("a", "1");
    expect(cache.has("a")).toBe(true);
    expect(cache.delete("a")).toBe(true);
    expect(cache.has("a")).toBe(false);
    cache.set("b", "2");
    cache.clear();
    expect(cache.has("b")).toBe(false);
    expect(cache.get("b")).toBeUndefined();
  });

  it("set updates value for existing key without growing size", () => {
    const cache = new LruMap<string, string>(2);
    cache.set("a", "1");
    cache.set("a", "2");
    cache.set("b", "x");
    expect(cache.get("a")).toBe("2");
    expect(cache.get("b")).toBe("x");
  });
});
