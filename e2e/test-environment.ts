import { join } from "node:path";

export const APP_URL = "http://127.0.0.1:8090";
export const AUTH_STATE_PATH = join(import.meta.dirname, "playwright/.auth/user.json");
