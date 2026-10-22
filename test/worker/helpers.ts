import { env, exports } from "cloudflare:workers";
import { buildSeedStatements, DEMO_PASSWORD, DEMO_TOKENS } from "../../src/seed";

export { DEMO_TOKENS, DEMO_PASSWORD };
const BASE = "http://example.com";

export async function resetDb() {
  const db = env.DB;
  await db.batch(["sessions", "tokens", "claims", "users"].map((t) => db.prepare(`DELETE FROM ${t}`)));
  await db.batch((await buildSeedStatements()).map((s) => db.prepare(s)));
  const list = await env.RECEIPTS.list();
  if (list.objects.length) await env.RECEIPTS.delete(list.objects.map((o) => o.key));
}

export const fetchApp = (path: string, init?: RequestInit) => exports.default.fetch(new Request(BASE + path, init));

export async function login(email: string, password = DEMO_PASSWORD) {
  const res = await fetchApp("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const cookie = res.headers.get("Set-Cookie")?.split(";")[0] ?? "";
  return { res, cookie };
}

/** Request sebagai user dengan cookie session ATAU bearer token. */
export function as(auth: { cookie?: string; token?: string }) {
  const headers = (extra?: Record<string, string>) => ({
    ...(auth.cookie ? { Cookie: auth.cookie } : {}),
    ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...extra,
  });
  return {
    get: (p: string) => fetchApp(p, { headers: headers() }),
    json: (method: string, p: string, body?: unknown) =>
      fetchApp(p, { method, headers: headers({ "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body) }),
    put: (p: string, type: string, body: BodyInit) => fetchApp(p, { method: "PUT", headers: headers({ "Content-Type": type }), body }),
    fetch: (p: string, init: RequestInit) => fetchApp(p, { ...init, headers: { ...headers(), ...(init.headers as any) } }),
  };
}

// PNG 1x1 valid untuk tes upload.
export const TINY_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
