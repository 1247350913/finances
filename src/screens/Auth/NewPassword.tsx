import { useState } from "react";
import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input } from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import styles from "./auth.module.css";

export default function NewPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <ScreenShell>
      <div className={styles.flowPage}>
        <h1 className={styles.flowHeading}>Verification Successful!<br />Now Enter A New Password</h1>
        <AuthCard wide>
          <form className={styles.formStack}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}/>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}/>
            <div className={styles.buttonRow}><Button type="submit">Reset Password</Button></div>
          </form>
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
