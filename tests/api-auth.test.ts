import { describe, it, expect } from "vitest";

import { extractBearerToken } from "@/modules/shared/auth/api-context";

function req(auth?: string): Request {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("https://test.local/api/v1/me", { headers });
}

describe("extractBearerToken", () => {
  it("extracts a bearer token", () => {
    expect(extractBearerToken(req("Bearer abc.def.123"))).toBe("abc.def.123");
  });

  it("is case-insensitive on the scheme", () => {
    expect(extractBearerToken(req("bearer tok123"))).toBe("tok123");
    expect(extractBearerToken(req("BEARER tok123"))).toBe("tok123");
  });

  it("returns null when no Authorization header", () => {
    expect(extractBearerToken(req())).toBeNull();
  });

  it("returns null for non-bearer schemes", () => {
    expect(extractBearerToken(req("Basic dXNlcjpwYXNz"))).toBeNull();
    expect(extractBearerToken(req("Bearer"))).toBeNull();
  });

  it("trims whitespace", () => {
    expect(extractBearerToken(req("Bearer   spaced-token  "))).toBe("spaced-token");
  });
});
