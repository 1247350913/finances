import { Link } from "react-router-dom";
import { useState } from "react";
import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input } from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import styles from "./Auth.module.css";

export function Login() {
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <ScreenShell>
      <div className={styles.centerPage}>
        <AuthCard>
          <h1 className={styles.brandTitle}>finances</h1>
          <h2 className={styles.smallHeading}>Sign In</h2>
          <form className={styles.formStack}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} showEye />
            <div className={styles.buttonRow}><Button type="submit">Sign In</Button></div>
          </form>
          <div className={styles.textLinks}>
            <Link to="/signup">Don’t have an account? Sign Up here.</Link>
            <Link to="/forgot">Forgot your username or password?</Link>
          </div>
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
