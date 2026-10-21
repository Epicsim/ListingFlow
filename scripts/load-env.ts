import { existsSync } from "node:fs";

/** Loads .env.local then .env (like Next.js) for standalone scripts. Existing variables win. */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
