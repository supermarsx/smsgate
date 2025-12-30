/** @type {import('next').NextConfig} */
const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin
  : "http://localhost:4000";
const wsOrigin = process.env.NEXT_PUBLIC_WS_ORIGIN ?? apiOrigin;
const qrOrigin = process.env.NEXT_PUBLIC_QR_ORIGIN ?? "https://api.qrserver.com";

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const csp = [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      `img-src 'self' data: blob: ${qrOrigin}`,
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
