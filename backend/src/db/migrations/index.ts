import type { Database } from "better-sqlite3";
import { logger } from "../../helpers/logger.ts";
import migration001 from "./001_auth_setup.ts";
import migration002 from "./002_projects.ts";
import migration003 from "./003_mcp_auth.ts";

const migrations = [migration001, migration002, migration003];

export function runMigrations(db: Database): void {
	const applyMigrations = db.transaction(() => {
		const currentVersion = db.pragma("user_version", { simple: true }) as number;
		const pendingMigrations = migrations.slice(currentVersion);
		for (const migration of pendingMigrations) {
			try {
				migration.up(db);
			} catch (error) {
				logger.error(error, `Failed to apply migration: ${migration.name}`);
				throw error;
			}
		}

		if (pendingMigrations.length > 0) {
			db.pragma(`user_version = ${migrations.length}`);
		}
		return pendingMigrations;
	});
	const appliedMigrations = applyMigrations.immediate();

	if (appliedMigrations.length === 0) {
		logger.info("No migrations to apply, database is up to date.");
		return;
	}

	for (const migration of appliedMigrations) {
		logger.info(`Migration ${migration.name} applied successfully.`);
	}
	logger.info("All migrations applied successfully. Database is now up to date.");
}
