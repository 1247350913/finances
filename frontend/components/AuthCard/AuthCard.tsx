import styles from "./AuthCard.module.css";

export function AuthCard({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`${styles.card} ${wide ? styles.wide : ""}`}>{children}</section>
  );
}
