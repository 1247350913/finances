import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input }from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import styles from "./auth.module.css";

export default function ForgotCredentialsPage() {
  return (
    <ScreenShell>
      <div className={styles.flowPage}>
        <h1 className={styles.flowHeading}>First, Enter The Email You Used For<br />Sign Up To Verify Your Account</h1>
        <AuthCard wide>
          <form className={styles.formStack}>
            <Input type="email" icon="user" />
            <div className={styles.buttonRow}><Button type="submit">Send Verification Code</Button></div>
          </form>
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
