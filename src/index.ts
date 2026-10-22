import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { hashPassword, verifyPassword, sha256Hex, randomHex } from "./crypto";
import { buildWhere, MAX_CSV_ROWS, parseFilters, toCsv } from "./search";

export interface Env {
  DB: D1Database;
  RECEIPTS: R2Bucket;
  ASSETS: Fetcher;
}
type User = { id: number; email: string; name: string; role: "admin" | "sales" };
type Vars = { user: User; via: "session" | "token" };
type App = { Bindings: Env; Variables: Vars };

const SESSION_COOKIE = "hk_session";
const SESSION_TTL_S = 8 * 60 * 60;
const CATEGORIES = ["transport", "makan", "bensin", "parkir", "akomodasi", "lainnya"] as const;
const IMAGE_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
  "image/webp": (b) => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45,
  "image/gif": (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
};
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const app = new Hono<App>();

// ---------- helpers ----------
async function authenticate(c: import("hono").Context<App>): Promise<{ user: User; via: "session" | "token" } | null> {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const hash = await sha256Hex(auth.slice(7).trim());
    const row = await c.env.DB.prepare(
      `SELECT u.id,u.email,u.name,u.role FROM tokens t JOIN users u ON u.id=t.user_id
       WHERE t.token_hash=? AND t.revoked_at IS NULL`,
    )
      .bind(hash)
      .first<User>();
    return row ? { user: row, via: "token" } : null;
  }
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) {
    const row = await c.env.DB.prepare(
      `SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.id=? AND s.expires_at > ?`,
    )
      .bind(sid, Math.floor(Date.now() / 1000))
      .first<User>();
    return row ? { user: row, via: "session" } : null;
  }
  return null;
}

const requireAuth = async (c: import("hono").Context<App>, next: () => Promise<void>) => {
  const a = await authenticate(c);
  if (!a) return c.json({ error: "Belum login atau token tidak valid" }, 401);
  // Perlindungan CSRF untuk request berbasis cookie: Origin harus sama dengan host kita.
  if (a.via === "session" && !["GET", "HEAD"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "Origin tidak diizinkan" }, 403);
  }
  c.set("user", a.user);
  c.set("via", a.via);
  await next();
};

const requireAdmin = async (c: import("hono").Context<App>, next: () => Promise<void>) => {
  if (c.get("user").role !== "admin") return c.json({ error: "Khusus admin finance" }, 403);
  await next();
};

type ClaimInput = { merchant: string; amount_idr: number; spent_on: string; category: string; description: string };

function validateClaim(body: any, partial = false): { ok: true; value: Partial<ClaimInput> } | { ok: false; error: string } {
  const v: Partial<ClaimInput> = {};
  const has = (k: string) => body && body[k] !== undefined;
  if (!body || typeof body !== "object") return { ok: false, error: "Body harus JSON object" };

  if (has("merchant") || !partial) {
    const m = typeof body.merchant === "string" ? body.merchant.trim() : "";
    if (m.length < 1 || m.length > 80) return { ok: false, error: "merchant wajib, maks 80 karakter" };
    v.merchant = m;
  }
  if (has("amount_idr") || !partial) {
    const a = body.amount_idr;
    if (!Number.isInteger(a) || a < 1 || a > 1_000_000_000) return { ok: false, error: "amount_idr harus bilangan bulat 1 - 1.000.000.000" };
    v.amount_idr = a;
  }
  if (has("spent_on") || !partial) {
    const d = body.spent_on;
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d)
      return { ok: false, error: "spent_on harus tanggal valid format YYYY-MM-DD" };
    v.spent_on = d;
  }
  if (has("category") || !partial) {
    if (!CATEGORIES.includes(body.category)) return { ok: false, error: `category harus salah satu dari: ${CATEGORIES.join(", ")}` };
    v.category = body.category;
  }
  if (has("description")) {
    if (typeof body.description !== "string" || body.description.length > 500) return { ok: false, error: "description maks 500 karakter" };
    v.description = body.description.trim();
  }
  return { ok: true, value: v };
}

const CLAIM_SELECT = `SELECT c.id,c.user_id,u.name AS owner_name,c.merchant,c.amount_idr,c.spent_on,c.category,c.description,
  c.status,c.decision_note,c.decided_at,c.source,c.created_at,(c.receipt_key IS NOT NULL) AS has_receipt
  FROM claims c JOIN users u ON u.id=c.user_id`;

async function loadClaim(c: import("hono").Context<App>, id: number) {
  const user = c.get("user");
  const row = await c.env.DB.prepare(`${CLAIM_SELECT} WHERE c.id=?`).bind(id).first<any>();
  // Sales yang bukan pemilik dapat 404 (tidak membocorkan keberadaan klaim orang lain).
  if (!row || (user.role !== "admin" && row.user_id !== user.id)) return null;
  return { ...row, has_receipt: !!row.has_receipt };
}

const parseId = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : NaN);

// ---------- halaman ----------
app.get("/assets/*", (c) => c.env.ASSETS.fetch(c.req.raw));

const page = (c: import("hono").Context<App>, file: string) =>
  c.env.ASSETS.fetch(new Request(new URL(`/pages/${file}`, c.req.url)));

app.get("/login", async (c) => ((await authenticate(c))?.via === "session" ? c.redirect("/") : page(c, "login.html")));
app.get("/", async (c) => ((await authenticate(c))?.via === "session" ? page(c, "app.html") : c.redirect("/login")));

// ---------- auth ----------
app.post("/api/login", async (c) => {
  const origin = c.req.header("Origin");
  if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "Origin tidak diizinkan" }, 403);
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const row = await c.env.DB.prepare(`SELECT id,email,name,role,password_hash FROM users WHERE email=?`).bind(email).first<User & { password_hash: string }>();
  // Selalu jalankan verifikasi supaya waktu respons tidak membocorkan email valid/tidak.
  const ok = await verifyPassword(password, row?.password_hash ?? (await hashPassword("dummy")));
  if (!row || !ok) return c.json({ error: "Email atau password salah" }, 401);
  const sid = randomHex(32);
  await c.env.DB.prepare(`INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)`)
    .bind(sid, row.id, Math.floor(Date.now() / 1000) + SESSION_TTL_S)
    .run();
  setCookie(c, SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_S,
    secure: new URL(c.req.url).protocol === "https:",
  });
  return c.json({ user: { id: row.id, email: row.email, name: row.name, role: row.role } });
});

app.post("/api/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await c.env.DB.prepare(`DELETE FROM sessions WHERE id=?`).bind(sid).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/me", requireAuth, (c) => c.json({ user: c.get("user"), via: c.get("via") }));

// ---------- klaim ----------
app.get("/api/claims", requireAuth, async (c) => {
  const parsed = parseFilters((k) => c.req.query(k));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { where, binds } = buildWhere(c.get("user"), parsed.filters);
  const { results } = await c.env.DB.prepare(`${CLAIM_SELECT} ${where} ORDER BY c.id DESC`).bind(...binds).all<any>();
  return c.json({ claims: results.map((r) => ({ ...r, has_receipt: !!r.has_receipt })) });
});

// Unduh CSV dari hasil yang sedang difilter. Filter dan hak akses sama persis dengan daftar klaim.
app.get("/api/claims.csv", requireAuth, async (c) => {
  const parsed = parseFilters((k) => c.req.query(k));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { where, binds } = buildWhere(c.get("user"), parsed.filters);
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM claims c ${where}`).bind(...binds).first<{ n: number }>())?.n ?? 0;
  if (total > MAX_CSV_ROWS)
    return c.json({ error: `Hasil ${total} baris melebihi batas ${MAX_CSV_ROWS}. Persempit kata kunci, tanggal, atau status.` }, 413);
  const { results } = await c.env.DB.prepare(
    `SELECT c.id,c.spent_on,c.category,c.merchant,c.amount_idr,c.status FROM claims c ${where} ORDER BY c.id DESC`,
  ).bind(...binds).all<any>();
  return new Response(toCsv(results), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="klaim-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

app.post("/api/claims", requireAuth, async (c) => {
  const user = c.get("user");
  const parsed = validateClaim(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const v = parsed.value as ClaimInput;
  // Status SELALU pending dan pemilik SELALU user yang login, apa pun isi body-nya.
  const res = await c.env.DB.prepare(
    `INSERT INTO claims (user_id,merchant,amount_idr,spent_on,category,description,status,source) VALUES (?,?,?,?,?,?, 'pending', ?)`,
  )
    .bind(user.id, v.merchant, v.amount_idr, v.spent_on, v.category, v.description ?? "", c.get("via") === "token" ? "mcp" : "web")
    .run();
  const claim = await loadClaim(c, res.meta.last_row_id as number);
  return c.json({ claim }, 201);
});

app.get("/api/claims/:id", requireAuth, async (c) => {
  const claim = await loadClaim(c, parseId(c.req.param("id")));
  return claim ? c.json({ claim }) : c.json({ error: "Klaim tidak ditemukan" }, 404);
});

app.patch("/api/claims/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseId(c.req.param("id"));
  if (!(await loadClaim(c, id))) return c.json({ error: "Klaim tidak ditemukan" }, 404);
  const parsed = validateClaim(await c.req.json().catch(() => null), true);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const entries = Object.entries(parsed.value);
  if (!entries.length) return c.json({ error: "Tidak ada field yang diubah" }, 400);
  await c.env.DB.prepare(`UPDATE claims SET ${entries.map(([k]) => `${k}=?`).join(",")} WHERE id=?`)
    .bind(...entries.map(([, val]) => val), id)
    .run();
  return c.json({ claim: await loadClaim(c, id) });
});

app.delete("/api/claims/:id", requireAuth, requireAdmin, async (c) => {
  const id = parseId(c.req.param("id"));
  const row = await c.env.DB.prepare(`SELECT receipt_key FROM claims WHERE id=?`).bind(id).first<{ receipt_key: string | null }>();
  if (!row) return c.json({ error: "Klaim tidak ditemukan" }, 404);
  if (row.receipt_key) await c.env.RECEIPTS.delete(row.receipt_key);
  await c.env.DB.prepare(`DELETE FROM claims WHERE id=?`).bind(id).run();
  return c.json({ ok: true });
});

async function decide(c: import("hono").Context<App>, status: "approved" | "rejected") {
  const id = parseId(c.req.param("id") ?? "");
  if (!(await loadClaim(c, id))) return c.json({ error: "Klaim tidak ditemukan" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (status === "rejected" && (note.length < 3 || note.length > 300)) return c.json({ error: "Alasan penolakan wajib diisi (3-300 karakter)" }, 400);
  if (note.length > 300) return c.json({ error: "Catatan maks 300 karakter" }, 400);
  const res = await c.env.DB.prepare(
    `UPDATE claims SET status=?, decision_note=?, decided_by=?, decided_at=datetime('now') WHERE id=? AND status='pending'`,
  )
    .bind(status, note || null, c.get("user").id, id)
    .run();
  if (!res.meta.changes) return c.json({ error: "Klaim sudah diputuskan sebelumnya" }, 409);
  return c.json({ claim: await loadClaim(c, id) });
}
app.post("/api/claims/:id/approve", requireAuth, requireAdmin, (c) => decide(c, "approved"));
app.post("/api/claims/:id/reject", requireAuth, requireAdmin, (c) => decide(c, "rejected"));

// ---------- struk (R2) ----------
app.put("/api/claims/:id/receipt", requireAuth, async (c) => {
  const id = parseId(c.req.param("id"));
  const claim = await loadClaim(c, id);
  if (!claim) return c.json({ error: "Klaim tidak ditemukan" }, 404);
  if (c.get("user").role !== "admin" && claim.status !== "pending") return c.json({ error: "Klaim sudah diputuskan" }, 409);
  const type = (c.req.header("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  const magic = IMAGE_TYPES[type];
  if (!magic) return c.json({ error: "Tipe file harus png, jpeg, webp, atau gif" }, 415);
  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (declared > MAX_RECEIPT_BYTES) return c.json({ error: "Struk maksimal 5 MB" }, 413);
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_RECEIPT_BYTES) return c.json({ error: "Struk kosong atau lebih dari 5 MB" }, 413);
  if (!magic(bytes)) return c.json({ error: "Isi file tidak cocok dengan tipe gambar" }, 415);

  const old = await c.env.DB.prepare(`SELECT receipt_key FROM claims WHERE id=?`).bind(id).first<{ receipt_key: string | null }>();
  const key = `claims/${id}/${crypto.randomUUID()}`;
  await c.env.RECEIPTS.put(key, bytes, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare(`UPDATE claims SET receipt_key=?, receipt_type=? WHERE id=?`).bind(key, type, id).run();
  if (old?.receipt_key) await c.env.RECEIPTS.delete(old.receipt_key);
  return c.json({ claim: await loadClaim(c, id) });
});

app.get("/api/claims/:id/receipt", requireAuth, async (c) => {
  const id = parseId(c.req.param("id"));
  if (!(await loadClaim(c, id))) return c.json({ error: "Klaim tidak ditemukan" }, 404);
  const row = await c.env.DB.prepare(`SELECT receipt_key,receipt_type FROM claims WHERE id=?`).bind(id).first<{ receipt_key: string | null; receipt_type: string | null }>();
  if (!row?.receipt_key) return c.json({ error: "Klaim ini belum punya struk" }, 404);
  const obj = await c.env.RECEIPTS.get(row.receipt_key);
  if (!obj) return c.json({ error: "File struk hilang" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.receipt_type ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=60",
    },
  });
});

// ---------- admin: user & token ----------
app.get("/api/users", requireAuth, requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT id,email,name,role FROM users ORDER BY id`).all();
  return c.json({ users: results });
});

app.get("/api/tokens", requireAuth, requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id,t.user_id,u.name AS owner_name,t.label,t.created_at,t.revoked_at FROM tokens t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC`,
  ).all();
  return c.json({ tokens: results });
});

app.post("/api/tokens", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!Number.isInteger(body?.user_id) || label.length < 1 || label.length > 60) return c.json({ error: "user_id dan label (maks 60 karakter) wajib" }, 400);
  const target = await c.env.DB.prepare(`SELECT id,role FROM users WHERE id=?`).bind(body.user_id).first<{ id: number; role: string }>();
  if (!target) return c.json({ error: "User tidak ditemukan" }, 404);
  const token = `opsf_${randomHex(20)}`;
  const res = await c.env.DB.prepare(`INSERT INTO tokens (user_id,token_hash,label) VALUES (?,?,?)`).bind(target.id, await sha256Hex(token), label).run();
  // Token asli hanya ditampilkan sekali; di DB hanya tersimpan hash-nya.
  return c.json({ id: res.meta.last_row_id, token }, 201);
});

app.delete("/api/tokens/:id", requireAuth, requireAdmin, async (c) => {
  const res = await c.env.DB.prepare(`UPDATE tokens SET revoked_at=datetime('now') WHERE id=? AND revoked_at IS NULL`).bind(parseId(c.req.param("id"))).run();
  return res.meta.changes ? c.json({ ok: true }) : c.json({ error: "Token tidak ditemukan atau sudah dicabut" }, 404);
});

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Endpoint tidak ada" }, 404) : c.text("Hantunya nyasar: halaman tidak ada 👻", 404)));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Server lagi kesurupan, coba lagi" }, 500);
});

export default app;
