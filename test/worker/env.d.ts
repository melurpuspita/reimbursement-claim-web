/// <reference types="@cloudflare/vitest-pool-workers/types" />
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    RECEIPTS: R2Bucket;
    ASSETS: Fetcher;
    TEST_MIGRATIONS: import("@cloudflare/vitest-pool-workers").D1Migration[];
  }
  interface GlobalProps {
    mainModule: typeof import("../../src/index");
  }
}
