import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Login, SignUp } from "../screens/Auth";
import { ForgotCredentials } from "../screens/Auth/ForgotCredentials";
import { NewPassword } from "../screens/Auth/NewPassword";
import { PasswordUpdated } from "../screens/Auth/PasswordUpdated";
import { Expenses, ManageExpenses, Parser, Statements } from "../screens/Expenses";
import { Entry } from "../screens/Entry";
import { Home } from "../screens/Home";
import { Overview } from "../screens/Overview";
import { Profile } from "../screens/Profile";
import { supabase } from "../lib/supabaseClient";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;

    const loadInitialSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setSession(data.session);
      } catch (error) {
        if (!active) return;
        console.error("Failed to load initial Supabase session", error);
        setSession(null);
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    };

    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAuthenticated = useMemo(() => Boolean(session), [session]);

  if (!authReady) {
    return null;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/home" replace /> : <Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot" element={<ForgotCredentials />} />
        <Route path="/reset-password" element={<NewPassword />} />
        <Route path="/password-updated" element={<PasswordUpdated />} />
        <Route path="/home" element={isAuthenticated ? <Home /> : <Navigate to="/" replace />} />
        <Route path="/expenses" element={isAuthenticated ? <Expenses /> : <Navigate to="/" replace />} />
        <Route path="/expenses/manage" element={isAuthenticated ? <ManageExpenses /> : <Navigate to="/" replace />} />
        <Route path="/expenses/parser" element={isAuthenticated ? <Parser /> : <Navigate to="/" replace />} />
        <Route path="/expenses/statements" element={isAuthenticated ? <Statements /> : <Navigate to="/" replace />} />
        <Route path="/entry" element={isAuthenticated ? <Entry /> : <Navigate to="/" replace />} />
        <Route path="/overview" element={isAuthenticated ? <Overview /> : <Navigate to="/" replace />} />
        <Route path="/profile" element={isAuthenticated ? <Profile /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? "/home" : "/"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
