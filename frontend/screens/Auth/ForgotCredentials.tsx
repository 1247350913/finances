import { useMemo, useState } from "react";
import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input }from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import { authClient } from "../../lib";
import styles from "./Auth.module.css";

export function ForgotCredentials() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed), [emailTrimmed]);
  const formValid = emailValid && !loading;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!formValid) return;

    try {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await authClient.requestPasswordReset(emailTrimmed);

      setSuccessMessage("If that email exists, a reset link has been sent.");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell>
      <div className={styles.flowPage}>
        <h1 className={styles.flowHeading}>First, Enter The Email You Used For<br />Sign Up To Verify Your Account</h1>
        <AuthCard wide>
          <form className={styles.formStack} onSubmit={handleSubmit}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className={styles.buttonRow}>
              <Button type="submit" text={loading ? "Sending..." : "Send Reset Link"} disabled={!formValid} />
            </div>
          </form>

          {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
          {successMessage && <p className={styles.successMessage}>{successMessage}</p>}
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
