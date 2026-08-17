import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.development" });
loadEnv();

export const authConfig = {
  cookieName: process.env.AUTH_COOKIE_NAME?.trim() || "fin_auth",
  jwtSecret: process.env.JWT_SECRET?.trim() || "",
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_SECONDS ?? 60 * 60 * 24 * 7),
  cookieSecure: process.env.AUTH_COOKIE_SECURE === "true",
  devExposeOtp: process.env.AUTH_DEV_EXPOSE_OTP === "true" && process.env.NODE_ENV !== "production",
  resendApiKey: process.env.RESEND_API_KEY?.trim() || "",
  resendFrom: process.env.RESEND_FROM?.trim() || "",
};

if (!authConfig.jwtSecret) {
  throw new Error("Missing JWT_SECRET. Set it in your server environment.");
}

if (!Number.isFinite(authConfig.jwtExpiresInSeconds) || authConfig.jwtExpiresInSeconds <= 0) {
  throw new Error("JWT_EXPIRES_SECONDS must be a positive number.");
}
