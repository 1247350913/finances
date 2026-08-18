import { Link } from "react-router-dom";
import { ASSETS } from "../../lib";
import styles from "./Header.module.css";

type Props = {
  homeLink?: string;
  iconVariant?: "flag" | "profile";
};

export function Header({ homeLink = "/", iconVariant = "flag" }: Props) {
  const iconSrc = iconVariant === "profile" ? ASSETS.defaultProfileIcon : ASSETS.flag;
  const iconAlt = iconVariant === "profile" ? "" : "";

  return (
    <header className={styles.header}>
      <Link className={styles.logo} to={homeLink}>finances</Link>
      {iconVariant === "profile" ? (
        <Link className={styles.profileBadgeLink} to="/profile" aria-label="Profile">
          <img className={styles.profileBadgeIcon} src={iconSrc} alt={iconAlt} aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          className={styles.flagButton}
          aria-label="NCC flag"
          title="About NCC project page coming soon"
        >
          <img className={styles.flagIcon} src={iconSrc} alt="" aria-hidden="true" />
        </button>
      )}
    </header>
  );
}
