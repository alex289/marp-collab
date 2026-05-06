import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from '../env.js';
import * as schema from './schema.js';
export const sqlite = new Database(env.databaseUrl);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
export const db = drizzle(sqlite, { schema });
