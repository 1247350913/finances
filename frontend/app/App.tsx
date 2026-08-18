import { useEffect, useMemo, useState } from "react";
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
import { authClient, type AppAuthSession } from "../lib";

export function App() {
  const [session, setSession] = useState<AppAuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let disposed = false;

    const loadSession = async () => {
      try {
        const nextSession = await authClient.getSession();
        if (disposed) return;
        setSession(nextSession);
      } catch (error) {
        if (disposed) return;
        console.error("Failed to load auth session", error);
        setSession(null);
      } finally {
        if (!disposed) {
          setAuthReady(true);
        }
      }
    };

    const onAuthChanged = () => {
      void loadSession();
    };

    window.addEventListener(authClient.eventName, onAuthChanged);

    void loadSession();

    return () => {
      disposed = true;
      window.removeEventListener(authClient.eventName, onAuthChanged);
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
