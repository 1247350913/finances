export type AuthSession = {
  authenticated: true;
  userId: string;
  email: string;
  username: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthTokenPayload = {
  sub: string;
  email: string;
  tokenVersion: number;
  exp?: number;
};
