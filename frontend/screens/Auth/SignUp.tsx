import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "../../lib";
import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input } from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import styles from "./Auth.module.css";

type Step = "signup" | "verify" | "success";

export function SignUp() {
  const [step, setStep] = useState<Step>("signup");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const usernameTrimmed = username.trim();
  const verificationCodeTrimmed = verificationCode.trim();

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed), [emailTrimmed]);

  const usernameLengthValid = usernameTrimmed.length === 0 || (usernameTrimmed.length >= 3 && usernameTrimmed.length <= 24);
  const usernameCharactersValid = usernameTrimmed.length === 0 || /^[a-zA-Z0-9_]+$/.test(usernameTrimmed);
  const usernameValid = usernameLengthValid && usernameCharactersValid;

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

  const verificationCodeValid = /^[a-zA-Z0-9]{6,8}$/.test(verificationCodeTrimmed);

  const formValid = emailValid && passwordValid && usernameValid && !loading;
  const verifyValid = verificationCodeValid && !loading;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!formValid) return;

    try {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await authClient.signUp(emailTrimmed, usernameTrimmed, password);

      setStep("verify");
      setSuccessMessage("If this email can be used, a verification code was sent.");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!verifyValid) return;

    try {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await authClient.verifySignUp(emailTrimmed, verificationCodeTrimmed);

      setStep("success");
      setSuccessMessage("Account created. You can now log in.");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    try {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await authClient.resendSignUpCode(emailTrimmed);

      setSuccessMessage("Verification code resent.");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not resend code.");
    } finally {
      setLoading(false);
    }
  }

  function handleBackToSignUp() {
    setStep("signup");
    setVerificationCode("");
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  return (
    <ScreenShell>
      <div className={styles.centerPage}>
        <AuthCard>
          <h1 className={styles.brandTitle}>finances</h1>
          <h2 className={styles.smallHeading}>Sign Up</h2>

          {step === "signup" && (
            <form className={styles.signUpStack} onSubmit={handleSubmit}>
              <p className={styles.label}>email <span className={styles.required}>*</span></p>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}/>
              {email.length > 0 && !emailValid && <p className={styles.requirements}>Enter a valid email address.</p>}

              <p className={styles.label}>username</p> 
              <Input type="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              {username.length > 0 && (!usernameLengthValid || !usernameCharactersValid) && (
                <ul className={styles.requirements}>
                  {!usernameLengthValid && <li>Username must be 3–24 characters.</li>}
                  {!usernameCharactersValid && <li>Username can only use letters, numbers, and underscores.</li>}
                </ul>
              )}

              <p className={styles.label}>password <span className={styles.required}>*</span></p>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {password.length > 0 && (!passwordLengthValid || !passwordLowercaseValid || !passwordUppercaseValid || !passwordNumberValid || !passwordSpecialCharacterValid) && (
                <ul className={styles.requirements}>
                  {!passwordLengthValid && <li>Password must be at least 8 characters.</li>}
                  {!passwordLowercaseValid && <li>Password must include a lowercase letter.</li>}
                  {!passwordUppercaseValid && <li>Password must include an uppercase letter.</li>}
                  {!passwordNumberValid && <li>Password must include a number.</li>}
                  {!passwordSpecialCharacterValid && <li>Password must include a special character.</li>}
                </ul>
              )}

              <div className={styles.buttonRow}>
                <Button type="submit" text={loading ? "Creating..." : "Create Account"} disabled={!formValid}/>
              </div>
            </form>
          )}

          {step === "verify" && (
            <form className={styles.signUpStack} onSubmit={handleVerify}>
              <p className={styles.label}>code <span className={styles.required}>*</span></p>
              <input
                className={styles.codeInput}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.trim())}
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
              />

              {verificationCode.length > 0 && !verificationCodeValid && <p className={styles.requirements}>Enter the 6-8 character verification code.</p>}

              <div className={styles.buttonRow}>
                <Button type="submit" text={loading ? "Verifying..." : "Verify Email"} disabled={!verifyValid}/>
              </div>

              <div className={styles.buttonRow}>
                <button className={styles.textButton} type="button" onClick={handleResendCode} disabled={loading}>Resend code</button>
              </div>

              <div className={styles.buttonRow}>
                <button className={styles.textButton} type="button" onClick={handleBackToSignUp} disabled={loading}>Back to Sign Up</button>
              </div>
            </form>
          )}

          {step === "success" && (
            <div className={styles.formStack}>
              <p className={styles.successMessage}>Account created. You can now log in.</p>
              <Link className={styles.textButton} to="/">Go to Sign In</Link>
            </div>
          )}

          {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
          {successMessage && step !== "success" && <p className={styles.successMessage}>{successMessage}</p>}

          {step !== "success" && (
            <div className={styles.textLinks}>
              <Link to="/">Already have an account? Sign In</Link>
            </div>
          )}
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
