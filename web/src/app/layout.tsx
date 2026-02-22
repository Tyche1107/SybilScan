import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SybilScan",
  description: "Pre-airdrop sybil detection for Web3 teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ background: "#0f1117", color: "#e2e8f0", margin: 0, padding: 0 }}>
        <main>{children}</main>
      </body>
    </html>
  );
}
