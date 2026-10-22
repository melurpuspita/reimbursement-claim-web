// Membaca file struk dari disk dengan pagar ketat. Isi struk tidak pernah dianggap perintah,
// dan path yang diminta (misal oleh teks di dalam struk) tidak boleh keluar dari folder struk.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Receipt } from "./client";

export const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

export async function loadReceipt(requested: string, receiptsDir: string): Promise<Receipt> {
  const root = await fs.realpath(path.resolve(receiptsDir));
  let real: string;
  try {
    real = await fs.realpath(path.resolve(root, requested));
  } catch {
    throw new Error(`File struk tidak ditemukan: ${requested}`);
  }
  if (real !== root && !real.startsWith(root + path.sep)) throw new Error(`Ditolak: struk harus berada di folder ${receiptsDir}`);
  const expected = EXT[path.extname(real).toLowerCase()];
  if (!expected) throw new Error("Ditolak: hanya file gambar (png, jpg, webp, gif) yang boleh diunggah sebagai struk");
  const stat = await fs.stat(real);
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) throw new Error("Ditolak: file struk kosong atau lebih dari 5 MB");
  const bytes = new Uint8Array(await fs.readFile(real));
  const actual = sniff(bytes);
  if (!actual || actual !== expected) throw new Error("Ditolak: isi file tidak cocok dengan ekstensinya");
  return { bytes, contentType: actual };
}
