const isLocalHostname = (hostname) => {
  if (!hostname) return false;
  return (
    ["localhost", "127.0.0.1"].includes(hostname) ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname.startsWith("172.")
  );
};

const isLocalUrl = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    return ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch (_) {
    return false;
  }
};

export function resolveApiBaseUrl(
  configured,
  winHostname = "",
  winProtocol = "http:",
  winOrigin = "",
  isDev = false
) {
  const cleanConfigured = (configured || "").trim().replace(/\/+$/, "");
  const isLocal = isLocalHostname(winHostname);

  // When accessed in dev mode over HTTPS (LAN SSL via `npm run dev:lan` or a tunnel like
  // Cloudflare/ngrok) with a local backend target, route HTTP + WebSocket calls through
  // Vite's same-origin `/__api_proxy` to prevent Mixed Content & CORS blocks on other PCs.
  if (isDev && winProtocol === "https:" && winOrigin && (!cleanConfigured || isLocalUrl(cleanConfigured))) {
    return `${winOrigin.replace(/\/+$/, "")}/__api_proxy`;
  }

  if (cleanConfigured) {
    if (isLocal && winHostname) {
      try {
        const parsed = new URL(cleanConfigured);
        if (["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.hostname !== winHostname) {
          parsed.hostname = winHostname;
          return parsed.toString().replace(/\/+$/, "");
        }
      } catch (_) {}
    }
    return cleanConfigured;
  }

  if (isLocal && winHostname) {
    const proto = winProtocol === "https:" ? "https:" : "http:";
    return `${proto}//${winHostname}:8000`;
  }

  return "https://hireiq.co.in/api";
}

const configuredBaseUrl =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)
    ? (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL).trim().replace(/\/+$/, "")
    : "";

const isDevEnv = typeof import.meta !== "undefined" && import.meta.env ? Boolean(import.meta.env.DEV) : false;
const winHost = typeof window !== "undefined" ? window.location.hostname : "";
const winProto = typeof window !== "undefined" ? window.location.protocol : "http:";
const winOrigin = typeof window !== "undefined" ? window.location.origin : "";

export const API_BASE_URL = resolveApiBaseUrl(configuredBaseUrl, winHost, winProto, winOrigin, isDevEnv);
export const API_BASE = API_BASE_URL;
