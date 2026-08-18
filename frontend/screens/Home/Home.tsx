import { Link } from "react-router-dom";
import { ScreenShell } from "../../components/ScreenShell";
import styles from "./Home.module.css";

export function Home() {
  return (
    <ScreenShell headerIconVariant="profile">
      <div className={styles.homePage}>
        <h1>finances</h1>
        <nav className={styles.homeNav} aria-label="Primary">
          <Link to="/overview">Overview</Link>
          <Link to="/expenses">Expenses</Link>
          <Link to="/entry">Entry</Link>
        </nav>
      </div>
    </ScreenShell>
  );
}
