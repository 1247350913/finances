import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export function hashOtpCode(rawCode: string): string {
  return createHash("sha256").update(rawCode).digest("hex");
}

export function makeOtpCode(): { rawCode: string; hashedCode: string } {
  const rawCode = String(Math.floor(100000 + Math.random() * 900000));
  return {
    rawCode,
    hashedCode: hashOtpCode(rawCode),
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function randomToken(size = 24): string {
  return randomBytes(size).toString("hex");
}
