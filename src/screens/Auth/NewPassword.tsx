import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input } from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import styles from "./auth.module.css";

export default function NewPasswordPage() {
  return (
    <ScreenShell>
      <div className={styles.flowPage}>
        <h1 className={styles.flowHeading}>Verification Successful!<br />Now Enter A New Password</h1>
        <AuthCard wide>
          <form className={styles.formStack}>
            <Input label={"New\nPassword"} type="password" icon="user" />
            <Input label={"Confirm\nPassword"} type="password" icon="user" />
            <div className={styles.buttonRow}><Button type="submit">Reset Password</Button></div>
          </form>
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
