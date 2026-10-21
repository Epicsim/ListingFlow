import type { PGlite } from "@electric-sql/pglite";
import type { Driver, Tx } from "./types";

export function pgliteDriver(db: PGlite): Driver {
  return {
    async transaction(fn) {
      return db.transaction(async (raw) => {
        const tx: Tx = {
          async query(text, params) {
            const result = await raw.query(text, params ? [...params] : undefined);
            return result.rows as never[];
          },
          async exec(text) {
            await raw.exec(text);
          },
        };
        return fn(tx);
      });
    },
    async close() {
      await db.close();
    },
  };
}
