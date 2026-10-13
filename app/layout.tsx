import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OHO CRM | OHO Solutions",
  description: "From first enquiry to successful implementation. OHO Solutions CRM.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
