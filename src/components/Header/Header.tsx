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
      <Link className={styles.profileLink} to="/profile" aria-label="Profile">
        <img className={styles.profileIcon} src={ASSETS.defaultProfileIcon} alt="" aria-hidden="true" />
      </Link>
    </header>
  );
}
