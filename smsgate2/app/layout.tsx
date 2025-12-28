import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "smsgate2",
  description: "Realtime verification dashboard (migration scaffold)"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="gg-body">
        <div className="gg-shell">{children}</div>
      </body>
    </html>
  );
}
