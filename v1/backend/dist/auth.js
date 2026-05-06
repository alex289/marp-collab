import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/client.js';
import { env } from './env.js';
export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: 'sqlite',
    }),
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret,
    trustedOrigins: [env.frontendOrigin],
    emailAndPassword: {
        enabled: true,
    },
});
