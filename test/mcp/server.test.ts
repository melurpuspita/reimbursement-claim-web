import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
let api: http.Server, port = 0;
const seen: { method: string; url: string; auth?: string }[] = [];

beforeAll(async () => {
  api = http.createServer((req, res) => {
    seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/me") return void res.end(JSON.stringify({ user: { id: 2, name: "Rina", role: "sales" } }));
    res.statusCode = 404; res.end("{}");
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  port = (api.address() as any).port;
});
afterAll(() => api.close());

describe("server MCP lewat stdio", () => {
  it("tool terdaftar benar dan token dikirim dari env sebagai Bearer", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), "mcp/server.ts"],
      cwd: ROOT,
      env: { ...process.env, OPS_API_URL: `http://127.0.0.1:${port}`, OPS_API_TOKEN: "opsf_tes_token", OPS_RECEIPTS_DIR: "./receipts" } as any,
    });
    const client = new Client({ name: "tes", version: "1.0.0" });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_claim", "list_my_claims", "submit_claim_from_receipt", "whoami"]);
    const out: any = await client.callTool({ name: "whoami", arguments: {} });
    expect(out.content[0].text).toContain("Rina");
    expect(seen.at(-1)).toMatchObject({ url: "/api/me", auth: "Bearer opsf_tes_token" });
    await client.close();
  }, 30000);
});
