import { apiUrl } from "./api";
import { supabase } from "./supabaseClient";

export type AppAuthSession = {
  authenticated: true;
  userId: string;
  email: string;
  username: string | null;
  emailVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthMode = "legacy-supabase" | "custom";

const AUTH_MODE: AuthMode = import.meta.env.VITE_AUTH_MODE === "custom" ? "custom" : "legacy-supabase";
const AUTH_EVENT = "fin-auth-changed";

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
  const response = await fetch(apiUrl(`/api/auth${path}`), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw normalizeError(payload, "Authentication request failed.");
  }

  return payload;
}

async function getCustomSession(): Promise<AppAuthSession | null> {
  try {
    const payload = await fetchAuth("/session", { method: "GET" });
    return payload?.session ?? null;
  } catch {
    return null;
  }
}

async function getLegacySession(): Promise<AppAuthSession | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;

    return {
      authenticated: true,
      userId: data.user.id,
      email: data.user.email ?? "",
      username: typeof meta.username === "string" ? meta.username : null,
      emailVerified: !!data.user.email_confirmed_at,
      createdAt: data.user.created_at,
      updatedAt: data.user.updated_at,
    };
  } catch {
    return null;
  }
}

export const authClient = {
  mode: AUTH_MODE,
  eventName: AUTH_EVENT,

  async getSession(): Promise<AppAuthSession | null> {
    if (AUTH_MODE === "custom") return getCustomSession();
    return getLegacySession();
  },

  async signIn(email: string, password: string): Promise<void> {
    if (AUTH_MODE === "custom") {
      await fetchAuth("/signin", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      notifyAuthChanged();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    notifyAuthChanged();
  },

  async signUp(email: string, username: string, password: string): Promise<void> {
    if (AUTH_MODE === "custom") {
      await fetchAuth("/signup", {
        method: "POST",
        body: JSON.stringify({ email, username, password }),
      });
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);

    if (!data.user) {
      throw new Error("User account could not be created.");
    }

    if ((data.user.identities?.length ?? 0) === 0) {
      throw new Error("This email is already registered. Try Sign In or reset your password.");
    }
  },

  async verifySignUp(email: string, code: string): Promise<void> {
    if (AUTH_MODE === "custom") {
      await fetchAuth("/verify/confirm", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "signup",
    });

    if (error) throw new Error(error.message);
    await supabase.auth.signOut();
  },

  async resendSignUpCode(email: string): Promise<void> {
    if (AUTH_MODE === "custom") {
      await fetchAuth("/verify/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return;
    }

    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) throw new Error(error.message);
  },

  async requestPasswordReset(email: string): Promise<void> {
    if (AUTH_MODE === "custom") {
      await fetchAuth("/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  },

  async resetPassword(email: string, codeOrPassword: string, maybePassword?: string): Promise<void> {
    if (AUTH_MODE === "custom") {
      const code = codeOrPassword;
      const password = String(maybePassword ?? "");
      await fetchAuth("/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ email, code, password }),
      });
      return;
    }

    const password = codeOrPassword;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw new Error("Reset link is invalid or has expired. Please request a new reset email.");
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },

  async signOut(): Promise<void> {
    if (AUTH_MODE === "custom") {
      await fetchAuth("/signout", { method: "POST" });
      notifyAuthChanged();
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    notifyAuthChanged();
  },
};
