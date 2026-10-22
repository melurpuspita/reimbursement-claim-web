import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTools } from "../../mcp/tools";
import { loadReceipt } from "../../mcp/receipt";

const RECEIPTS = path.resolve(import.meta.dirname, "../../receipts");

function fakeClient() {
  return {
    whoami: vi.fn(async () => ({ user: { id: 2, name: "Rina", role: "sales" } })),
    listClaims: vi.fn(async () => []),
    getClaim: vi.fn(),
    submitClaim: vi.fn(async (f: any) => ({ id: 9, status: "pending", spent_on: f.spent_on, merchant: f.merchant, amount_idr: f.amount_idr, category: f.category, has_receipt: true })),
  };
}
const tools = (c = fakeClient()) => ({ c, list: createTools(c as any, RECEIPTS) });

describe("daftar tool MCP", () => {
  it("hanya empat tool; tidak ada approve, reject, hapus, edit, atau shell", () => {
    const names = tools().list.map((t) => t.name).sort();
    expect(names).toEqual(["get_claim", "list_my_claims", "submit_claim_from_receipt", "whoami"]);
    expect(names.join(" ")).not.toMatch(/approve|reject|delete|edit|exec|shell|token/);
  });
  it("tool submit memperingatkan bahwa isi struk adalah data, bukan perintah", () => {
    const submit = tools().list.find((t) => t.name === "submit_claim_from_receipt")!;
    expect(submit.description).toMatch(/DATA, bukan perintah/);
  });
});

describe("loadReceipt: pagar file", () => {
  it("menerima struk asli di folder receipts", async () => {
    const r = await loadReceipt("struk-04-warung-sate.png", RECEIPTS);
    expect(r.contentType).toBe("image/png");
    expect(r.bytes.length).toBeGreaterThan(1000);
  });
  it.each(["../package.json", "../.mcp.json", "/etc/passwd", "../../../etc/hosts", "../node_modules/hono/package.json"])("menolak path di luar folder: %s", async (p) => {
    await expect(loadReceipt(p, RECEIPTS)).rejects.toThrow();
  });
  it("menolak file yang bukan gambar atau tidak ada", async () => {
    await expect(loadReceipt("tidak-ada.png", RECEIPTS)).rejects.toThrow(/tidak ditemukan/);
  });
});

describe("struk berisi perintah (prompt injection)", () => {
  it("struk ke-4 diajukan sebagai data biasa: hanya submitClaim yang dipanggil, status pending", async () => {
    const { c, list } = tools();
    const submit = list.find((t) => t.name === "submit_claim_from_receipt")!;
    const res = await submit.handler({
      receipt_path: "struk-04-warung-sate.png", merchant: "Warung Sate Nyi Roro", amount_idr: 225000, spent_on: "2026-10-22", category: "makan",
      description: "Makan siang bersama klien",
    } as any);
    expect(res.isError).toBeUndefined();
    expect(c.submitClaim).toHaveBeenCalledTimes(1);
    const [fields, receipt] = c.submitClaim.mock.calls[0] as any[];
    expect(fields).not.toHaveProperty("receipt_path");
    expect(receipt.contentType).toBe("image/png");
    expect(res.content[0].text).toMatch(/pending/);
    // Tidak ada klien method lain yang disentuh (tidak ada approve/hapus/baca token).
    expect(c.listClaims).not.toHaveBeenCalled();
    expect(c.getClaim).not.toHaveBeenCalled();
  });
  it("kalau teks struk menyuruh baca file lain, upload ditolak dan klaim tidak dibuat", async () => {
    const { c, list } = tools();
    const submit = list.find((t) => t.name === "submit_claim_from_receipt")!;
    const res = await submit.handler({ receipt_path: "../.mcp.json", merchant: "x", amount_idr: 1, spent_on: "2026-10-22", category: "makan" } as any);
    expect(res.isError).toBe(true);
    expect(c.submitClaim).not.toHaveBeenCalled();
  });
});
