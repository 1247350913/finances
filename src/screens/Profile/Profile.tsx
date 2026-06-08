import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { ASSETS } from "../../lib";
import { supabase } from "../../lib/supabaseClient";
import styles from "./Profile.module.css";

const APP_REPO_URL = "https://github.com/1247350913/finances";

type Metadata = Record<string, any>;
type ProfileSection = "identity" | "update" | "about";

export function Profile() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeSection, setActiveSection] = useState<ProfileSection>("identity");

  const [metadata, setMetadata] = useState<Metadata>({});
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!data.user) throw new Error("Please sign in again.");

      const nextMetadata = (data.user.user_metadata ?? {}) as Metadata;

      setMetadata(nextMetadata);
      setEmail(data.user.email ?? "");
      setUsername(typeof nextMetadata.username === "string" ? nextMetadata.username : "");
      setDisplayName(typeof nextMetadata.display_name === "string" ? nextMetadata.display_name : "");
      setPhotoUrl(typeof nextMetadata.profile_photo_url === "string" ? nextMetadata.profile_photo_url : "");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load profile.");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveMetadata(patch: Metadata, successText: string) {
    const merged = { ...metadata, ...patch };
    const { error } = await supabase.auth.updateUser({ data: merged });
    if (error) throw error;
    setMetadata(merged);
    setStatusMessage(successText);
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsProfileSaving(true);
      setErrorMessage(null);
      setStatusMessage(null);
      await saveMetadata(
        {
          username: username.trim(),
          display_name: displayName.trim(),
          profile_photo_url: photoUrl.trim(),
        },
        "Profile updated."
      );
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not update profile.");
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function handlePhotoUpload(file: File | null) {
    if (!file) return;
    try {
      setErrorMessage(null);
      const dataUrl = await readFileAsDataUrl(file);
      setPhotoUrl(dataUrl);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not read profile photo file.");
    }
  }

  async function handlePasswordSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < 8) {
      setErrorMessage("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Password confirmation does not match.");
      return;
    }

    try {
      setIsPasswordSaving(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      setStatusMessage("Password updated.");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not update password.");
    } finally {
      setIsPasswordSaving(false);
    }
  }

  async function handleSignOut() {
    const shouldSignOut = window.confirm("Sign out now?");
    if (!shouldSignOut) return;

    try {
      setIsSigningOut(true);
      setErrorMessage(null);
      setStatusMessage(null);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate("/", { replace: true });
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not sign out.");
    } finally {
      setIsSigningOut(false);
    }
  }

  function handleDeleteProfileShell() {
    const shouldContinue = window.confirm(
      "Profile deletion is not implemented yet. This will be added in a later step."
    );
    if (!shouldContinue) return;
    setErrorMessage(null);
    setStatusMessage("Delete profile workflow is not available yet.");
  }

  const profileImageSrc = photoUrl.trim().length > 0 ? photoUrl : ASSETS.defaultProfileIcon;

  return (
    <div className={styles.pageShell}>
      <main className={styles.main}>
        <header className={styles.subnav}>
          <Link className={styles.backLink} to="/home" aria-label="Home">
            Home
          </Link>
          <Link className={styles.subnavLink} to="/overview">Overview</Link>
          <Link className={styles.subnavLink} to="/expenses">Expenses</Link>
          <Link className={styles.subnavLink} to="/entry">Entry</Link>
          <Link className={styles.profileLink} to="/profile" aria-label="Profile">
            <img className={styles.profileIcon} src={profileImageSrc} alt="" aria-hidden="true" />
          </Link>
        </header>

        <section className={styles.body}>
          {isLoading && <p className={styles.loadingText}>Loading profile...</p>}

          {errorMessage && <p className={styles.error}>{errorMessage}</p>}
          {statusMessage && <p className={styles.status}>{statusMessage}</p>}

          <div className={styles.layout}>
            <aside className={styles.sideNav} aria-label="Profile sections">
              <button
                type="button"
                className={`${styles.sideNavButton} ${activeSection === "identity" ? styles.sideNavButtonActive : ""}`}
                onClick={() => setActiveSection("identity")}
              >
                Identity
              </button>
              <button
                type="button"
                className={`${styles.sideNavButton} ${activeSection === "update" ? styles.sideNavButtonActive : ""}`}
                onClick={() => setActiveSection("update")}
              >
                Update Profile
              </button>
              <button
                type="button"
                className={`${styles.sideNavButton} ${activeSection === "about" ? styles.sideNavButtonActive : ""}`}
                onClick={() => setActiveSection("about")}
              >
                About
              </button>
            </aside>

            <section className={styles.contentCard}>
              {activeSection === "identity" && (
                <div className={styles.identityPanel}>
                  <div className={styles.identityPhotoWrap}>
                    <img className={styles.avatarPreview} src={profileImageSrc} alt="Profile" />
                  </div>

                  <div className={styles.identityInfo}>
                    <div className={styles.infoRow}>
                      <span>Email</span>
                      <strong>{email || "-"}</strong>
                    </div>
                    <div className={styles.infoRow}>
                      <span>Username</span>
                      <strong>{username.trim().length > 0 ? username : "-"}</strong>
                    </div>
                    <div className={styles.infoRow}>
                      <span>Display Name</span>
                      <strong>{displayName.trim().length > 0 ? displayName : "-"}</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "update" && (
                <div className={styles.updatePanel}>
                  <h2>Profile Details</h2>

                  <form className={styles.form} onSubmit={handleProfileSave}>
                    <label>
                      Username
                      <input
                        type="text"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="Optional"
                      />
                    </label>

                    <label>
                      Display Name
                      <input
                        type="text"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Optional"
                      />
                    </label>

                    <label>
                      Profile Image URL
                      <input
                        type="url"
                        value={photoUrl}
                        onChange={(event) => setPhotoUrl(event.target.value)}
                        placeholder="https://..."
                      />
                    </label>

                    <label>
                      Upload Profile Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => void handlePhotoUpload(event.target.files?.[0] ?? null)}
                      />
                    </label>

                    <button type="submit" disabled={isProfileSaving || isLoading}>
                      {isProfileSaving ? "Saving..." : "Save Profile Updates"}
                    </button>
                  </form>

                  <form className={styles.form} onSubmit={handlePasswordSave}>
                    <h3>Change Password</h3>
                    <label>
                      New Password
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="At least 8 characters"
                        minLength={8}
                      />
                    </label>
                    <label>
                      Confirm Password
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repeat new password"
                        minLength={8}
                      />
                    </label>
                    <button type="submit" disabled={isPasswordSaving || isLoading}>
                      {isPasswordSaving ? "Saving..." : "Change Password"}
                    </button>
                  </form>

                  <div className={styles.dangerZone}>
                    <h3>Session & Account</h3>
                    <div className={styles.dangerActions}>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={() => void handleSignOut()}
                        disabled={isSigningOut || isLoading}
                      >
                        {isSigningOut ? "Signing out..." : "Sign Out"}
                      </button>
                      <button
                        type="button"
                        className={styles.dangerAction}
                        onClick={handleDeleteProfileShell}
                        disabled={isLoading}
                      >
                        Delete Profile (Coming Soon)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "about" && (
                <div className={styles.aboutPanel}>
                  <h2>About</h2>
                  <p>Finances is a lightweight personal dashboard for tracking account values and statement-driven expenses.</p>
                  <p>
                    Repository: <a href={APP_REPO_URL} target="_blank" rel="noreferrer">{APP_REPO_URL}</a>
                  </p>
                  <p>Contact: open an issue in the repository for bugs, feedback, and feature requests.</p>
                </div>
              )}
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
