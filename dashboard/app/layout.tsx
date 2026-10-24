import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Govi Analytics | Thambuttegama Vegetable Prices",
  description: "Portfolio demo: synthetic vegetable price data, multi-year comparisons and experimental seasonal estimation. Not real market forecasts.",
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
