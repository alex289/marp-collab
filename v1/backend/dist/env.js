import 'dotenv/config';
function readPositiveNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}
export const env = {
    port: readPositiveNumber(process.env.PORT, 3000),
    databaseUrl: process.env.DATABASE_URL ?? './sqlite.db',
    frontendOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    betterAuthUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me',
};
