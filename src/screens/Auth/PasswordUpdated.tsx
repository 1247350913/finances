import { Link } from "react-router-dom";
import { ScreenShell } from "../../components/ScreenShell";
import { Button } from "../../primitives/Button";
import styles from "./Auth.module.css";

export function PasswordUpdated() {
  return (
    <ScreenShell>
      <div className={styles.flowPage}>
        <h1 className={styles.flowHeading}>Your Password Has Been Updated</h1>
        <div className={styles.successBox}>
          <Link to="/">
            <Button type="button" text="Sign In" />
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
