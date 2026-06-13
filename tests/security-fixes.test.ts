import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

// Mock redis
vi.mock("@/lib/redis", () => ({
  redis: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    del: vi.fn(),
  },
}));

describe("Rate Limiting (E5)", () => {
  const mockedRedis = vi.mocked(redis);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permite requisições dentro do limite e bloqueia quando excede", async () => {
    // 1ª tentativa
    mockedRedis.incr.mockResolvedValueOnce(1);
    mockedRedis.ttl.mockResolvedValueOnce(60);

    const r1 = await rateLimit("test-key", 2, 60);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    // 2ª tentativa (no limite)
    mockedRedis.incr.mockResolvedValueOnce(2);
    mockedRedis.ttl.mockResolvedValueOnce(59);

    const r2 = await rateLimit("test-key", 2, 60);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    // 3ª tentativa (excedido)
    mockedRedis.incr.mockResolvedValueOnce(3);
    mockedRedis.ttl.mockResolvedValueOnce(58);

    const r3 = await rateLimit("test-key", 2, 60);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });
});
