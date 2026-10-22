#!/usr/bin/env node
// MCP server "ops-finance" (stdio). Token sales dibaca dari env, tidak pernah lewat argumen tool.
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OpsClient } from "./client";
import { createTools } from "./tools";

const baseUrl = process.env.OPS_API_URL ?? "http://localhost:8787";
const token = process.env.OPS_API_TOKEN;
if (!token) {
  console.error("OPS_API_TOKEN belum di-set. Isi di env pada konfigurasi MCP.");
  process.exit(1);
}
const receiptsDir = process.env.OPS_RECEIPTS_DIR ?? path.resolve(process.cwd(), "receipts");

const server = new McpServer({ name: "ops-finance", version: "1.0.0" });
for (const t of createTools(new OpsClient(baseUrl, token), receiptsDir)) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema as any }, t.handler as any);
}
await server.connect(new StdioServerTransport());
