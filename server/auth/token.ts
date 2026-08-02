import jwt from "jsonwebtoken";
import type { Response } from "express";
import { authConfig } from "../lib/authConfig";
import type { AuthTokenPayload } from "./types";

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, authConfig.jwtSecret, {
    expiresIn: authConfig.jwtExpiresInSeconds,
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, authConfig.jwtSecret) as AuthTokenPayload;
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(authConfig.cookieName, token, {
    httpOnly: true,
    secure: authConfig.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: authConfig.jwtExpiresInSeconds * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(authConfig.cookieName, {
    httpOnly: true,
    secure: authConfig.cookieSecure,
    sameSite: "lax",
    path: "/",
  });
}
