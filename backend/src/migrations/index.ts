import migration001 from "./001_auth_setup.ts";

const migrations = [migration001];

export function runMigrations() {
	for (const migration of migrations) {
		migration.up();
	}
}
