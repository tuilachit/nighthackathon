import { existsSync, readFileSync } from "node:fs";

/**
 * Loads a KEY=VALUE env file into process.env. Node's --env-file silently drops
 * some Vercel-exported secret values, so the catalog CLIs use this deterministic
 * parser instead. Values may be optionally single- or double-quoted. Called
 * before any code that reads process.env, so getLiveSearchServerEnvironment sees
 * the full production configuration.
 */
export function loadCatalogEnv(path = process.env.CATALOG_ENV_FILE ?? ".env.catalog"): void {
  if (!existsSync(path)) {
    return;
  }
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
