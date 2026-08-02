import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input } from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import { authClient } from "../../lib";
import styles from "./Auth.module.css";

export function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed), [emailTrimmed]);
  const formValid = emailValid && password.length > 0 && !loading;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!formValid) return;

    try {
      setLoading(true);
      setErrorMessage(null);

      await authClient.signIn(emailTrimmed, password);

      navigate("/home");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell>
      <div className={styles.centerPage}>
        <AuthCard>
          <h1 className={styles.brandTitle}>finances</h1>
          <h2 className={styles.smallHeading}>Sign In</h2>
          <form className={styles.signUpStack} onSubmit={handleSubmit}>
            <p className={styles.label}>email</p>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}/>

            <p className={styles.label}>password</p>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}/>

            <div className={styles.buttonRow}>
              <Button type="submit" text={loading ? "Signing In..." : "Sign In"} disabled={!formValid} />
            </div>
          </form>

          {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}

          <div className={styles.textLinks}>
            <Link to="/signup">Don’t have an account? Sign Up here.</Link>
            <Link to="/forgot">Forgot your username or password?</Link>
          </div>
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
