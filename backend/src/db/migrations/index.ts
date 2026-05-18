import { db } from "../db.ts";
import { logger } from "../../helpers/logger.ts";
import migration001 from "./001_auth_setup.ts";
import migration002 from "./002_projects.ts";

const migrations = [migration001, migration002];

export function runMigrations() {
	const currentVersion = getCurrentVersion();
	const pendingMigrations = migrations.slice(currentVersion);

	if (pendingMigrations.length === 0) {
		logger.info("No migrations to apply, database is up to date.");
		return;
	}

	for (const migration of pendingMigrations) {
		try {
			migration.up();
			logger.info(`Migration ${migration.name} applied successfully.`);
		} catch (error) {
			logger.error(error, `Failed to apply migration: ${migration.name}`);
			throw error;
		}
	}

	setCurrentVersion(migrations.length);
	logger.info("All migrations applied successfully. Database is now up to date.");
}

function getCurrentVersion(): number {
	const result = db.pragma("user_version", { simple: true });
	return result as number;
}

function setCurrentVersion(version: number) {
	db.pragma(`user_version = ${version}`);
}
