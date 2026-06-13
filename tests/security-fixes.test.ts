import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

// Mock redis. O rate limiter usa um script Lua atômico via redis.eval que
// retorna [count, ttl] numa única ida ao Redis (EXPIRE só na 1ª requisição).
vi.mock("@/lib/redis", () => ({
  redis: {
    eval: vi.fn(),
    del: vi.fn(),
  },
}));

describe("Rate Limiting (E5)", () => {
  const mockedRedis = vi.mocked(redis);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permite requisições dentro do limite e bloqueia quando excede", async () => {
    // 1ª tentativa → eval retorna [count, ttl]
    mockedRedis.eval.mockResolvedValueOnce([1, 60]);

    const r1 = await rateLimit("test-key", 2, 60);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    // 2ª tentativa (no limite)
    mockedRedis.eval.mockResolvedValueOnce([2, 59]);

    const r2 = await rateLimit("test-key", 2, 60);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    // 3ª tentativa (excedido)
    mockedRedis.eval.mockResolvedValueOnce([3, 58]);

    const r3 = await rateLimit("test-key", 2, 60);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });
});
