import { Link } from "react-router-dom";
import { ASSETS } from "../../lib";
import styles from "./Header.module.css";

type Props = {
  homeLink?: string;
  iconVariant?: "flag" | "profile";
};

export function Header({ homeLink = "/", iconVariant = "flag" }: Props) {
  return (
    <header className={styles.header}>
      <Link className={styles.logo} to={homeLink}>finances</Link>
      {iconVariant === "profile" ? (
        <Link className={styles.profileTextLink} to="/profile">Profile</Link>
      ) : (
        <button
          type="button"
          className={styles.flagButton}
          aria-label="NCC flag"
          title="About NCC project page coming soon"
        >
          <img className={styles.flagIcon} src={ASSETS.flag} alt="" aria-hidden="true" />
        </button>
      )}
    </header>
  );
}
