// Search, filter, dan CSV klaim. Satu sumber filter dipakai daftar dan CSV supaya hasilnya selalu sama.
export const MAX_CSV_ROWS = 5000;
export const MAX_QUERY_LENGTH = 100;
export const CSV_HEADER = ["id", "tanggal", "kategori", "merchant", "nominal", "status"] as const;
const STATUSES = ["pending", "approved", "rejected"];

export type Filters = { q?: string; from?: string; to?: string; status?: string };
type Parsed = { ok: true; filters: Filters } | { ok: false; error: string };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export function parseFilters(get: (key: string) => string | undefined): Parsed {
  const q = (get("q") ?? "").trim();
  const from = get("from")?.trim() || undefined;
  const to = get("to")?.trim() || undefined;
  const status = get("status")?.trim() || undefined;
  if (q.length > MAX_QUERY_LENGTH) return { ok: false, error: `Kata kunci maksimal ${MAX_QUERY_LENGTH} karakter` };
  if (from && !isDate(from)) return { ok: false, error: "from harus tanggal valid format YYYY-MM-DD" };
  if (to && !isDate(to)) return { ok: false, error: "to harus tanggal valid format YYYY-MM-DD" };
  if (from && to && from > to) return { ok: false, error: "Tanggal from tidak boleh setelah to" };
  return { ok: true, filters: { q: q || undefined, from, to, status: status && STATUSES.includes(status) ? status : undefined } };
}

/** Tanda %, _ dan \ dicari sebagai teks biasa, bukan wildcard LIKE. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

/** WHERE berparameter. Hak akses (sales hanya miliknya) selalu ikut, apa pun filternya. */
export function buildWhere(user: { id: number; role: string }, f: Filters) {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (user.role !== "admin") { where.push("c.user_id=?"); binds.push(user.id); }
  if (f.status) { where.push("c.status=?"); binds.push(f.status); }
  if (f.from) { where.push("c.spent_on>=?"); binds.push(f.from); }
  if (f.to) { where.push("c.spent_on<=?"); binds.push(f.to); }
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    where.push("(c.merchant LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')");
    binds.push(like, like);
  }
  return { where: where.length ? "WHERE " + where.join(" AND ") : "", binds };
}

function cell(v: string | number): string {
  let s = String(v);
  // Cegah formula Excel: sel teks yang diawali = + - @ diberi tanda kutip tunggal.
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows: { id: number; spent_on: string; category: string; merchant: string; amount_idr: number; status: string }[]) {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) lines.push([r.id, cell(r.spent_on), cell(r.category), cell(r.merchant), r.amount_idr, cell(r.status)].join(","));
  return lines.join("\r\n") + "\r\n";
}
