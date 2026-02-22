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
      <body style={{ background: "#f8fafc", color: "#0f172a", margin: 0, padding: 0 }}>
        <main>{children}</main>
      </body>
    </html>
  );
}
