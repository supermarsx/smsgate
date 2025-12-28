import type { Metadata } from "next";
import "../styles/globals.css";
import { SessionProvider } from "../components/session-provider";
import { ConfigProvider } from "../components/config-provider";

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
            <div className="gg-shell">{children}</div>
          </ConfigProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
