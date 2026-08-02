import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function resolveEnvPath(): string | undefined {
  const explicit = process.env.AUTH_ENV_FILE?.trim();
  if (explicit) {
    const absoluteExplicit = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
    return fs.existsSync(absoluteExplicit) ? absoluteExplicit : undefined;
  }

  const modeFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
  const absoluteModeFile = path.resolve(process.cwd(), modeFile);
  if (fs.existsSync(absoluteModeFile)) return absoluteModeFile;

  const fallbackFile = path.resolve(process.cwd(), ".env");
  return fs.existsSync(fallbackFile) ? fallbackFile : undefined;
}

dotenv.config({ path: resolveEnvPath() });

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  authOrigin: process.env.AUTH_ORIGIN ?? "http://localhost:5173",
  mongodbUri: required("MONGODB_URI"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  cookieName: process.env.AUTH_COOKIE_NAME ?? "mv_auth",
  cookieSecure: process.env.AUTH_COOKIE_SECURE === "true",
  resendApiKey: process.env.RESEND_API_KEY,
  resendFrom: process.env.RESEND_FROM,
};
