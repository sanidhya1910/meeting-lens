/** API base: empty string uses Vite dev proxy (/api → localhost:8000). */
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
