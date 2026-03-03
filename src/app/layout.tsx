import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Archon — The 1-Person Unicorn Engine",
  description:
    "Autonomous, self-evolving AI organization that runs your entire business. 10 AI agents working 24/7 to grow your company. You just steer.",
  openGraph: {
    title: "Archon — The 1-Person Unicorn Engine",
    description:
      "Autonomous AI organization that runs your entire business. 10 AI agents. You just steer.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
