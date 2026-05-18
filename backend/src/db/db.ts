import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runMigrations } from "./migrations/index.ts";

const dataDir = process.env.DATA_PATH ?? resolve(process.cwd(), "data");
const dbPath = join(dataDir, "db.sqlite");

await mkdir(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("cache_size = -12000"); // 12 MB cache
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000"); // Wait up to 5 seconds if the database is locked
db.pragma("auto_vacuum = incremental");

// Auto-run on import so migrations are always applied before any prepared statements are created
runMigrations();

export { db };
