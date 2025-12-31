import type { Metadata } from "next";
import "../styles/globals.css";
import { SessionProvider } from "../components/session-provider";
import { ConfigProvider } from "../components/config-provider";
import { StatusProvider } from "../components/status-context";
import { ThemeProvider } from "../components/theme";
import { GlobalToggles } from "../components/global-toggles";

export const metadata: Metadata = {
  title: "smsgate2",
  description: "Realtime verification dashboard (migration scaffold)"
};

/**
 * App root layout wiring providers and global styling.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="gg-body" suppressHydrationWarning>
        <SessionProvider>
          <ConfigProvider>
            <ThemeProvider>
              <StatusProvider>
                <div className="gg-shell page-transition">{children}</div>
                <GlobalToggles />
              </StatusProvider>
            </ThemeProvider>
          </ConfigProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
