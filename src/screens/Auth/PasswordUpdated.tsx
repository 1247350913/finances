import { ScreenShell } from "../../components/ScreenShell";
import { Button } from "../../primitives/Button";
import styles from "./auth.module.css";

export default function PasswordUpdatedPage() {
  return (
    <ScreenShell>
      <div className={styles.flowPage}>
        <h1 className={styles.flowHeading}>Your Password Has Been Updated</h1>
        <div className={styles.successBox}><Button>Sign In</Button></div>
      </div>
    </ScreenShell>
  );
}
