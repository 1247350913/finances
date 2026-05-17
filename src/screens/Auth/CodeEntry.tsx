import { ScreenShell } from "../../components/ScreenShell";
import { AuthCard } from "../../components/AuthCard";
import { Input } from "../../primitives/Input";
import { Button } from "../../primitives/Button";
import styles from "./Auth.module.css";

export default function CodeEntryPage() {
  return (
    <ScreenShell>
      <div className={styles.flowPage}>
        <h1 className={styles.flowHeading}>Enter The Six-Digit Code Sent To Your Email</h1>
        <AuthCard>
          <form className={styles.formStack}>
            <div className={styles.inlineForm}>
              <Input label="Enter Code" icon="user" />
            </div>
            <div className={styles.buttonRow}><Button type="submit">Verify</Button></div>
          </form>
        </AuthCard>
      </div>
    </ScreenShell>
  );
}
