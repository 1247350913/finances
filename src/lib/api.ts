// In dev, VITE_API_BASE_URL is unset so fetch uses the Vite proxy (relative paths work fine).
// In prod (Cloudflare Pages), VITE_API_BASE_URL is set to https://api.finances.lnks.info
// and all /api/* calls are prefixed with it.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
