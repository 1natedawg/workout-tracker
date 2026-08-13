import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lifting Tracker",
  description: "Personal workout tracker",
  manifest: "/manifest.json", // We'll add this later for home screen installation
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LiftTracker",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} max-w-md mx-auto bg-gray-950 min-h-screen relative flex flex-col`}>
        {/* Main scrollable content area, padded at the bottom so it doesn't hide behind the navbar */}
        <main className="flex-1 pb-24 px-4 pt-6">
          {children}
        </main>
        
        <BottomNav />
      </body>
    </html>
  );
}