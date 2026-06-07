import { Link } from "react-router-dom";
import { ASSETS } from "../../lib";
import styles from "./Header.module.css";

type Props = {
  homeLink?: string;
};

export function Header({ homeLink = "/" }: Props) {
  return (
    <header className={styles.header}>
      <Link className={styles.logo} to={homeLink}>finances</Link>
      <button className={styles.languageButton} type="button" aria-label="Change language">
        <img className={styles.flag} src={ASSETS.flag} alt="Planet"></img>
        <span>English</span>
        <span className={styles.chevron}>^</span>
      </button>
    </header>
  );
}
