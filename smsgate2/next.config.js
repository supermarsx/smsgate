let fileConfig = {};
try {
  // Prefer dev config when not in production
  const base = require("./config/app.config.json");
  const dev = require("./config/app.config.dev.json");
  fileConfig = { ...base, ...(process.env.NODE_ENV !== "production" ? dev : {}) };
} catch {
  fileConfig = {};
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? fileConfig.apiBaseUrl ?? "http://localhost:4000/api/v1";
const apiOrigin = (() => {
  try {
    return new URL(apiBase).origin;
  } catch {
    return "http://localhost:4000";
  }
})();
const wsOrigin = process.env.NEXT_PUBLIC_WS_ORIGIN ?? fileConfig.wsOrigin ?? apiOrigin;

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
    const csp = [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      scriptSrc,
      "img-src 'self' data: blob:",
      `connect-src 'self' ${apiOrigin} ${wsOrigin} ws: wss:`,
      "font-src 'self' data:",
      "frame-ancestors 'none'"
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
