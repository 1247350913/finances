import { Header } from "../Header";
import { Footer } from "../Footer";
import styles from "./ScreenShell.module.css";

type Props = {
  children: React.ReactNode;
  headerIconVariant?: "flag" | "profile";
};

export function ScreenShell({ children, headerIconVariant = "flag" }: Props) {
  return (
    <div className={styles.pageShell}>
      <Header iconVariant={headerIconVariant} />
      <main className={styles.main}>{children}</main>
      <Footer />
    </div>
  );
}
