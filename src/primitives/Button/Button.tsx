import styles from "./Button.module.css";

export function Button({ children, type = "button" }: { children: React.ReactNode; type?: "button" | "submit" }) {
  return <button className={styles.button} type={type}>{children}</button>;
}
