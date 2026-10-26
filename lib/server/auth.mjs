import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getPool, configured } from "./db.mjs";
let auth;
export function authOptions() {
  return {
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    plugins: [nextCookies()],
  };
}
export function getAuth() {
  if (!configured()) return null;
  return (auth ??= betterAuth(authOptions()));
}
