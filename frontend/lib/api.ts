// In dev, VITE_API_BASE_URL is unset so fetch uses the Vite proxy (relative paths work fine).
// In prod (Cloudflare Pages), VITE_API_BASE_URL should point at the deployed backend origin.
// Normalize it to reduce errors from missing schemes, trailing slashes, or mixed-content http URLs.
const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);

function normalizeApiBase(rawValue: string | undefined): string {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return "";

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  // Avoid mixed-content failures when frontend is served over HTTPS.
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    /^http:\/\//i.test(withScheme) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(withScheme)
  ) {
    return withScheme.replace(/^http:\/\//i, "https://").replace(/\/+$/, "");
  }

  return withScheme.replace(/\/+$/, "");
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}
