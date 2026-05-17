import { Header } from "../Header";
import { Footer } from "../Footer";
import styles from "./ScreenShell.module.css";

export function ScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.pageShell}>
      <Header />
      <main className={styles.main}>{children}</main>
      <Footer />
    </div>
  );
}
