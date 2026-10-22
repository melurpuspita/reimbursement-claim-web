import { writeFileSync } from "node:fs";
import { buildSeedStatements } from "../src/seed";

const stmts = await buildSeedStatements();
writeFileSync(new URL("../seed.sql", import.meta.url), stmts.join(";\n") + ";\n");
console.log(`seed.sql ditulis (${stmts.length} statement)`);
