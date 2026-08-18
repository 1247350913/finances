import styles from "./Button.module.css";

type Props = {
  type?: "button" | "submit";
  text: string;
  disabled?: boolean;
}

export function Button({ type="button", text, disabled = false }: Props) {
  return (
    <button className={styles.button} type={type} disabled={disabled}>{text}</button>
  );
}
