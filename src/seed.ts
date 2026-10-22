// Data dummy: tiga user, tiga klaim awal, dua token sales. Semua fiktif.
import { hashPassword, sha256Hex } from "./crypto";

export const DEMO_PASSWORD = "pocong123";
export const DEMO_TOKENS = {
  rina: "opsf_dummy_rina_0000000000000001",
  budi: "opsf_dummy_budi_0000000000000002",
};

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
let cachedHash: string | undefined;

/** Daftar statement SQL satu-baris (aman untuk D1 batch maupun file .sql). */
export async function buildSeedStatements(): Promise<string[]> {
  cachedHash ??= await hashPassword(DEMO_PASSWORD, new Uint8Array(16).fill(7));
  const h = cachedHash;
  const [tRina, tBudi] = await Promise.all([sha256Hex(DEMO_TOKENS.rina), sha256Hex(DEMO_TOKENS.budi)]);
  return [
    `INSERT OR IGNORE INTO users (id,email,name,role,password_hash) VALUES (1,'dewi@ops.test','Dewi','admin',${q(h)})`,
    `INSERT OR IGNORE INTO users (id,email,name,role,password_hash) VALUES (2,'rina@ops.test','Rina','sales',${q(h)})`,
    `INSERT OR IGNORE INTO users (id,email,name,role,password_hash) VALUES (3,'budi@ops.test','Budi','sales',${q(h)})`,
    `INSERT OR IGNORE INTO tokens (id,user_id,token_hash,label) VALUES (1,2,${q(tRina)},'Claude Code Rina (dummy)')`,
    `INSERT OR IGNORE INTO tokens (id,user_id,token_hash,label) VALUES (2,3,${q(tBudi)},'Claude Code Budi (dummy)')`,
    `INSERT OR IGNORE INTO claims (id,user_id,merchant,amount_idr,spent_on,category,description,status,source) VALUES (1,2,'Warung Kopi Kuntilanak',85000,'2026-10-19','makan','Kopi tubruk bareng klien di sela demo produk','pending','web')`,
    `INSERT OR IGNORE INTO claims (id,user_id,merchant,amount_idr,spent_on,category,description,status,source) VALUES (2,3,'Ojek Pocong Express',245000,'2026-10-20','transport','Ojek ke kantor klien di Bekasi, pulang pergi','pending','web')`,
    `INSERT OR IGNORE INTO claims (id,user_id,merchant,amount_idr,spent_on,category,description,status,decision_note,decided_by,decided_at,source) VALUES (3,2,'Parkir Mall Gentayangan',15000,'2026-10-18','parkir','Parkir saat meeting vendor','approved','Aman, arwah tenang',1,'2026-10-19 09:00:00','web')`,
  ];
}
