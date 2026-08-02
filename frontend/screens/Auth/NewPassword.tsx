import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input } from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import { authClient } from "../../lib";
import styles from "./Auth.module.css";

export function NewPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isCustomAuth = authClient.mode === "custom";

  const emailTrimmed = email.trim();
  const codeTrimmed = code.trim();
  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed), [emailTrimmed]);
  const codeValid = useMemo(() => /^[a-zA-Z0-9]{6,8}$/.test(codeTrimmed), [codeTrimmed]);

  const passwordLengthValid = password.length >= 8;
  const passwordLowercaseValid = /[a-z]/.test(password);
  const passwordUppercaseValid = /[A-Z]/.test(password);
  const passwordNumberValid = /[0-9]/.test(password);
  const passwordSpecialCharacterValid = /[^a-zA-Z0-9]/.test(password);

  const passwordValid =
    passwordLengthValid &&
    passwordLowercaseValid &&
    passwordUppercaseValid &&
    passwordNumberValid &&
    passwordSpecialCharacterValid;

  const passwordsMatch = useMemo(() => {
    if (confirmPassword.length === 0) return true;
    return password === confirmPassword;
  }, [password, confirmPassword]);

  const customInputsValid = !isCustomAuth || (emailValid && codeValid);
  const formValid = passwordValid && passwordsMatch && confirmPassword.length > 0 && customInputsValid && !loading;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!formValid) return;

    try {
      setLoading(true);
      setErrorMessage(null);

      if (isCustomAuth) {
        await authClient.resetPassword(emailTrimmed, codeTrimmed, password);
      } else {
        await authClient.resetPassword("", password);
      }

      navigate("/password-updated");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell>
      <div className={styles.flowPage}>
        <h1 className={styles.flowHeading}>Verification Successful!<br />Now Enter A New Password</h1>
        <AuthCard wide>
          <form className={styles.formStack} onSubmit={handleSubmit}>
            {isCustomAuth && (
              <>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                {email.length > 0 && !emailValid && <p className={styles.errorMessage}>Enter a valid email.</p>}
                <Input type="code entry" value={code} onChange={(e) => setCode(e.target.value)} />
                {code.length > 0 && !codeValid && <p className={styles.errorMessage}>Enter a valid 6-8 character reset code.</p>}
              </>
            )}
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}/>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}/>
            {password.length > 0 && (!passwordLengthValid || !passwordLowercaseValid || !passwordUppercaseValid || !passwordNumberValid || !passwordSpecialCharacterValid) && (
              <ul className={styles.requirements}>
                {!passwordLengthValid && <li>Password must be at least 8 characters.</li>}
                {!passwordLowercaseValid && <li>Password must include a lowercase letter.</li>}
                {!passwordUppercaseValid && <li>Password must include an uppercase letter.</li>}
                {!passwordNumberValid && <li>Password must include a number.</li>}
                {!passwordSpecialCharacterValid && <li>Password must include a special character.</li>}
              </ul>
            )}

            {confirmPassword.length > 0 && !passwordsMatch && <p className={styles.errorMessage}>Passwords do not match.</p>}

            <div className={styles.buttonRow}>
              <Button type="submit" text={loading ? "Resetting..." : "Reset Password"} disabled={!formValid} />
            </div>
          </form>

          {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}

          <div className={styles.textLinks}>
            <Link to="/forgot">Request a new reset email</Link>
          </div>
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
