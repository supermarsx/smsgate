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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="gg-body">
        <SessionProvider>
          <ConfigProvider>
            <ThemeProvider>
              <StatusProvider>
                <div className="gg-shell">{children}</div>
                <GlobalToggles />
              </StatusProvider>
            </ThemeProvider>
          </ConfigProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
