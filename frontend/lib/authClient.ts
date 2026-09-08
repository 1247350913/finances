import { authUrl } from "./api";

// auth-service is a shared service for all apps; each request must say which tenant it is.
const APP_ID = "finances";

export type AppAuthSession = {
  authenticated: true;
  userId: string;
  email: string;
  username: string | null;
  emailVerified: boolean;
  birthDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SignUpResult = {
  verificationCode?: string;
};

export type ResendCodeResult = {
  verificationCode?: string;
};

export type PasswordResetRequestResult = {
  resetCode?: string;
};

const AUTH_EVENT = "fin-auth-changed";
const TAB_SESSION_KEY = "fin-authenticated-in-tab";

function hasTabSession(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.sessionStorage.getItem(TAB_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

function setTabSession(active: boolean): void {
  if (typeof window === "undefined") return;

  try {
    if (active) {
      window.sessionStorage.setItem(TAB_SESSION_KEY, "true");
    } else {
      window.sessionStorage.removeItem(TAB_SESSION_KEY);
    }
  } catch {
  }
}

function notifyAuthChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

function normalizeError(payload: any, fallback: string): Error {
  const text = String(payload?.error ?? payload?.message ?? fallback);
  return new Error(text);
}

async function fetchAuth(path: string, init: RequestInit = {}) {
  const response = await fetch(authUrl(`/auth${path}`), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": APP_ID,
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw normalizeError(payload, "Authentication request failed.");
  }

  return payload;
}

export const authClient = {
  eventName: AUTH_EVENT,

  async getSession(): Promise<AppAuthSession | null> {
    if (!hasTabSession()) return null;

    try {
      const response = await fetch(authUrl("/auth/session"), {
        method: "GET",
        credentials: "include",
        headers: { "X-App-Id": APP_ID },
      });

      if (response.status === 401) {
        setTabSession(false);
        return null;
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw normalizeError(payload, "Authentication request failed.");
      }

      return payload?.session ?? null;
    } catch {
      return null;
    }
  },

  async signIn(email: string, password: string): Promise<void> {
    await fetchAuth("/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setTabSession(true);
    notifyAuthChanged();
  },

  async signUp(email: string, username: string, password: string): Promise<SignUpResult> {
    const payload = await fetchAuth("/signup", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    });
    return {
      verificationCode:
        typeof payload?.verificationCode === "string" ? payload.verificationCode : undefined,
    };
  },

  async verifySignUp(email: string, code: string): Promise<void> {
    await fetchAuth("/verify/confirm", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  },

  async resendSignUpCode(email: string): Promise<ResendCodeResult> {
    const payload = await fetchAuth("/verify/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return {
      verificationCode:
        typeof payload?.verificationCode === "string" ? payload.verificationCode : undefined,
    };
  },

  async requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
    const payload = await fetchAuth("/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return {
      resetCode: typeof payload?.resetCode === "string" ? payload.resetCode : undefined,
    };
  },

  async resetPassword(email: string, code: string, password: string): Promise<void> {
    await fetchAuth("/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ email, code, password }),
    });
  },

  async signOut(): Promise<void> {
    try {
      await fetchAuth("/signout", { method: "POST" });
    } finally {
      setTabSession(false);
      notifyAuthChanged();
    }
  },

  async updateProfile(patch: { username?: string; birthDate?: string | null }): Promise<AppAuthSession> {
    const payload = await fetchAuth("/profile", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    notifyAuthChanged();
    return payload.session as AppAuthSession;
  },

  async changePassword(password: string): Promise<void> {
    await fetchAuth("/account/password", {
      method: "PATCH",
      body: JSON.stringify({ password }),
    });
  },

  async deleteAccount(): Promise<void> {
    await fetchAuth("/account", { method: "DELETE" });
    setTabSession(false);
    notifyAuthChanged();
  },
};

