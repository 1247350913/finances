import { config as loadEnv } from "dotenv";
import jwt from "jsonwebtoken";

loadEnv({ path: ".env.development" });
loadEnv();

// Finances no longer issues or stores its own sessions — auth-service does. This only
// verifies the token auth-service signed, using the same secret, app id, and cookie name.
const APP_ID = "finances";
const ISSUER = "auth-service";

const jwtSecret = process.env.JWT_SECRET?.trim() || "";
if (!jwtSecret) {
  throw new Error("Missing JWT_SECRET. Set it to the same value configured in auth-service.");
}

export const authCookieName = process.env.AUTH_COOKIE_NAME?.trim() || "auth_session";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  tokenVersion: number;
};

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, jwtSecret, {
    audience: APP_ID,
    issuer: ISSUER,
  }) as jwt.JwtPayload;

  return {
    sub: String(decoded.sub),
    email: String(decoded.email),
    tokenVersion: Number(decoded.tokenVersion),
  };
}
