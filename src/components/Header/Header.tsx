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
      <button
        type="button"
        className={styles.profileLink}
        aria-label="NCC flag"
        title="About NCC project page coming soon"
      >
        <img className={styles.profileIcon} src={ASSETS.flag} alt="" aria-hidden="true" />
      </button>
    </header>
  );
}
