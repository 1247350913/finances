import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input } from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import styles from "./Auth.module.css";

export function SignUp() {

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signUp(email: string, password: string, username: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    const userId = data.user?.id;

    if (userId) {
      await supabase.from("profiles").insert({
        id: userId,
        email,
        username,
      });
    }

    return data;
  }

  return (
    <ScreenShell>
      <div className={styles.centerPage}>
        <AuthCard>
          <h1 className={styles.brandTitle}>finances</h1>
          <h2 className={styles.smallHeading}>Sign Up</h2>
          <form className={styles.signUpStack}>
            <p>email</p>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}/>
            {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
            <p>username</p> 
            <Input type="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
            <p>password</p>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
            <div className={styles.buttonRow}><Button type="submit">Create Account</Button></div>
          </form>
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
