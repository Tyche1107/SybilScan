import type { Metadata } from "next";
import Link from "next/link";
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
        <nav
          style={{
            background: "#1a202c",
            borderBottom: "1px solid #2d3748",
            padding: "0 24px",
            height: "56px",
            display: "flex",
            alignItems: "center",
            gap: "32px",
          }}
        >
          <Link
            href="/"
            style={{
              color: "#e2e8f0",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: "18px",
              letterSpacing: "-0.02em",
            }}
          >
            SybilScan
          </Link>
          <Link
            href="/api-keys"
            style={{
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "14px",
              transition: "color 0.15s",
            }}
          >
            API Keys
          </Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
