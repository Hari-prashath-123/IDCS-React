export function getAdminApiBase(): string {
  // Priority: Vite env -> window global override -> infer localhost:7888 for dev
  const fromEnv = (import.meta as any).env?.VITE_ADMIN_API_URL;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');

  const fromGlobal = (window as any).__ADMIN_API_URL__;
  if (fromGlobal && typeof fromGlobal === 'string' && fromGlobal.trim().length > 0) return fromGlobal.replace(/\/$/, '');

  try {
    // Fallback: assume admin API runs on same host but port 7888 (dev)
    return window.location.origin.replace(/:\d+$/, ':7888');
  } catch (e) {
    return 'http://localhost:7888';
  }
}

export function getAdminApiUrl(path: string) {
  const base = getAdminApiBase();
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
