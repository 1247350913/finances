import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import { db } from "../lib/db";
import { authConfig } from "../lib/authConfig";
import { clearAuthCookie, setAuthCookie, signAuthToken, verifyAuthToken } from "./token";
import { hashOtpCode, hashPassword, makeOtpCode, verifyPassword } from "./crypto";
import { sendPasswordResetEmail, sendVerifyEmail } from "./email";

const OTP_TTL_MS = 1000 * 60 * 30;

// pg returns `date` columns as JS Date objects, whose JSON serialization shifts by local
// timezone (e.g. "1999-12-28" -> "1999-12-28T05:00:00.000Z"); normalize back to plain YYYY-MM-DD.
export function formatDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : value;
  }
  return null;
}

type DbUser = {
  id: string;
  email: string;
  username: string | null;
  password_hash: string;
  email_verified: boolean;
  verify_otp_hash: string | null;
  verify_otp_expires_at: string | null;
  reset_otp_hash: string | null;
  reset_otp_expires_at: string | null;
  auth_version: number;
  birth_date: string | null;
  created_at: string;
  updated_at: string;
};

type AuthRequest = Request & {
  authUser?: DbUser;
};

function bodyString(req: Request, key: string): string {
  return String(req.body?.[key] ?? "").trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function passwordValid(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^a-zA-Z0-9]/.test(password)
  );
}

function toSessionPayload(user: DbUser) {
  return {
    authenticated: true as const,
    userId: user.id,
    email: user.email,
    username: user.username,
    emailVerified: user.email_verified,
    birthDate: formatDateOnly(user.birth_date),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

async function getUserById(userId: string): Promise<DbUser | null> {
  const result = await db.query<DbUser>("select * from public.users where id = $1 limit 1", [userId]);
  return result.rows[0] ?? null;
}

async function getSessionFromCookie(req: Request) {
  const token = req.cookies?.[authConfig.cookieName] as string | undefined;
  if (!token) return null;

  try {
    const payload = verifyAuthToken(token);
    const user = await getUserById(payload.sub);
    if (!user || user.auth_version !== payload.tokenVersion) {
      return null;
    }

    return toSessionPayload(user);
  } catch {
    return null;
  }
}

async function authGuard(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[authConfig.cookieName] as string | undefined;
  if (!token) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await getUserById(payload.sub);

    if (!user || user.auth_version !== payload.tokenVersion) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    req.authUser = user;
    next();
  } catch {
    res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

export const authRouter = Router();

function maybeDevCodePayload(rawCode: string) {
  return authConfig.devExposeOtp ? { verificationCode: rawCode } : {};
}

function maybeDevResetCodePayload(rawCode: string) {
  return authConfig.devExposeOtp ? { resetCode: rawCode } : {};
}

authRouter.post("/signup", async (req, res) => {
  try {
    const email = normalizeEmail(bodyString(req, "email"));
    const username = bodyString(req, "username");
    const password = String(req.body?.password ?? "");

    if (!email.includes("@")) {
      res.status(400).json({ ok: false, error: "Valid email required" });
      return;
    }

    if (!passwordValid(password)) {
      res.status(400).json({ ok: false, error: "Password must be 8+ chars and include lower/upper/number/special" });
      return;
    }

    if (username && username.length < 3) {
      res.status(400).json({ ok: false, error: "Username must be at least 3 chars" });
      return;
    }

    const existingByEmail = await db.query<{ id: string }>("select id from public.users where email = $1 limit 1", [email]);
    if (existingByEmail.rows[0]) {
      res.status(409).json({ ok: false, error: "Email already in use" });
      return;
    }

    if (username) {
      const existingByUsername = await db.query<{ id: string }>("select id from public.users where username = $1 limit 1", [username]);
      if (existingByUsername.rows[0]) {
        res.status(409).json({ ok: false, error: "Username already in use" });
        return;
      }
    }

    const passwordHash = await hashPassword(password);
    const { rawCode, hashedCode } = makeOtpCode();
    const verifyOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const inserted = await db.query<DbUser>(
      `insert into public.users (
        email,
        username,
        password_hash,
        email_verified,
        verify_otp_hash,
        verify_otp_expires_at
      ) values ($1, $2, $3, false, $4, $5)
      returning *`,
      [email, username || null, passwordHash, hashedCode, verifyOtpExpiresAt]
    );

    const user = inserted.rows[0];
    await sendVerifyEmail(user.email, rawCode);

    res.json({
      ok: true,
      user: {
        email: user.email,
        username: user.username,
        emailVerified: user.email_verified,
      },
      ...maybeDevCodePayload(rawCode),
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not sign up" });
  }
});

authRouter.post("/verify/request", async (req, res) => {
  try {
    const email = normalizeEmail(bodyString(req, "email"));
    if (!email.includes("@")) {
      res.status(400).json({ ok: false, error: "Email required" });
      return;
    }

    const result = await db.query<DbUser>("select * from public.users where email = $1 limit 1", [email]);
    const user = result.rows[0];
    if (!user) {
      res.json({ ok: true });
      return;
    }

    const { rawCode, hashedCode } = makeOtpCode();
    const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();

    await db.query(
      "update public.users set verify_otp_hash = $1, verify_otp_expires_at = $2, updated_at = now() where id = $3",
      [hashedCode, expires, user.id]
    );

    await sendVerifyEmail(email, rawCode);
    res.json({ ok: true, ...maybeDevCodePayload(rawCode) });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not send verification code" });
  }
});

authRouter.post("/verify/confirm", async (req, res) => {
  try {
    const email = normalizeEmail(bodyString(req, "email"));
    const code = bodyString(req, "code");

    if (!email || !code) {
      res.status(400).json({ ok: false, error: "Invalid verification code" });
      return;
    }

    const result = await db.query<DbUser>(
      `select * from public.users
       where email = $1
         and verify_otp_hash = $2
         and verify_otp_expires_at > now()
       limit 1`,
      [email, hashOtpCode(code)]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(400).json({ ok: false, error: "Invalid or expired verification code" });
      return;
    }

    await db.query(
      `update public.users
       set email_verified = true,
           verify_otp_hash = null,
           verify_otp_expires_at = null,
           updated_at = now()
       where id = $1`,
      [user.id]
    );

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not verify code" });
  }
});

authRouter.post("/signin", async (req, res) => {
  try {
    const email = normalizeEmail(bodyString(req, "email"));
    const password = String(req.body?.password ?? "");

    const result = await db.query<DbUser>("select * from public.users where email = $1 limit 1", [email]);
    const user = result.rows[0];

    if (!user) {
      res.status(401).json({ ok: false, error: "Invalid credentials" });
      return;
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ ok: false, error: "Invalid credentials" });
      return;
    }

    if (!user.email_verified) {
      res.status(403).json({ ok: false, error: "Verify your email before signing in" });
      return;
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.auth_version,
    });

    setAuthCookie(res, token);

    res.json({ ok: true, session: toSessionPayload(user) });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not sign in" });
  }
});

authRouter.post("/signout", async (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get("/session", async (req, res) => {
  const session = await getSessionFromCookie(req);
  if (!session) {
    clearAuthCookie(res);
    res.json({ ok: true, session: null });
    return;
  }

  res.json({ ok: true, session });
});

authRouter.patch("/profile", authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser as DbUser;
    const username = bodyString(req, "username");
    const birthDateRaw = bodyString(req, "birth_date");

    if (username && username.length < 3) {
      res.status(400).json({ ok: false, error: "Username must be at least 3 chars" });
      return;
    }

    let birthDate: string | null = null;
    if (birthDateRaw) {
      const parsed = new Date(birthDateRaw);
      if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateRaw) || parsed > new Date()) {
        res.status(400).json({ ok: false, error: "Invalid birth date" });
        return;
      }
      birthDate = birthDateRaw;
    }

    if (username) {
      const conflict = await db.query<{ id: string }>(
        "select id from public.users where username = $1 and id <> $2 limit 1",
        [username, user.id]
      );
      if (conflict.rows[0]) {
        res.status(409).json({ ok: false, error: "Username already in use" });
        return;
      }
    }

    const updated = await db.query<DbUser>(
      "update public.users set username = $1, birth_date = $2, updated_at = now() where id = $3 returning *",
      [username || null, birthDate, user.id]
    );

    res.json({ ok: true, session: toSessionPayload(updated.rows[0]) });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not update profile" });
  }
});

authRouter.post("/password-reset/request", async (req, res) => {
  try {
    const email = normalizeEmail(bodyString(req, "email"));
    if (!email.includes("@")) {
      res.status(400).json({ ok: false, error: "Email required" });
      return;
    }

    const result = await db.query<DbUser>("select * from public.users where email = $1 limit 1", [email]);
    const user = result.rows[0];

    if (!user) {
      res.json({ ok: true });
      return;
    }

    const { rawCode, hashedCode } = makeOtpCode();
    const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();

    await db.query(
      "update public.users set reset_otp_hash = $1, reset_otp_expires_at = $2, updated_at = now() where id = $3",
      [hashedCode, expires, user.id]
    );

    await sendPasswordResetEmail(email, rawCode);
    res.json({ ok: true, ...maybeDevResetCodePayload(rawCode) });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not send reset code" });
  }
});

authRouter.post("/password-reset/confirm", async (req, res) => {
  try {
    const email = normalizeEmail(bodyString(req, "email"));
    const code = bodyString(req, "code");
    const password = String(req.body?.password ?? "");

    if (!email || !code || !passwordValid(password)) {
      res.status(400).json({ ok: false, error: "Invalid reset submission" });
      return;
    }

    const result = await db.query<DbUser>(
      `select * from public.users
       where email = $1
         and reset_otp_hash = $2
         and reset_otp_expires_at > now()
       limit 1`,
      [email, hashOtpCode(code)]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(400).json({ ok: false, error: "Invalid or expired reset code" });
      return;
    }

    const nextHash = await hashPassword(password);

    await db.query(
      `update public.users
       set password_hash = $1,
           reset_otp_hash = null,
           reset_otp_expires_at = null,
           auth_version = auth_version + 1,
           updated_at = now()
       where id = $2`,
      [nextHash, user.id]
    );

    clearAuthCookie(res);
    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not reset password" });
  }
});

authRouter.patch("/password", authGuard, async (req: AuthRequest, res) => {
  try {
    const password = String(req.body?.password ?? "");
    if (!passwordValid(password)) {
      res.status(400).json({ ok: false, error: "Password must be 8+ chars and include lower/upper/number/special" });
      return;
    }

    const user = req.authUser as DbUser;
    const nextHash = await hashPassword(password);

    await db.query(
      `update public.users
       set password_hash = $1,
           auth_version = auth_version + 1,
           updated_at = now()
       where id = $2`,
      [nextHash, user.id]
    );

    clearAuthCookie(res);
    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not update password" });
  }
});

authRouter.delete("/account", authGuard, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser as DbUser;
    await db.query("delete from public.users where id = $1", [user.id]);
    clearAuthCookie(res);
    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not delete account" });
  }
});
