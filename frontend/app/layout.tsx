import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import PageTransition from "@/components/PageTransition";
import { LoadingProvider } from "@/providers/LoadingProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Packify",
  description: "Packaging Design Tool",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen flex flex-col overflow-hidden`}
      >
        <div className="h-screen flex flex-col overflow-hidden bg-background">
          <LoadingProvider>
            <main className="flex-1 flex flex-col overflow-hidden relative">
              <PageTransition>
                <Header />
                {children}
              </PageTransition>
            </main>
          </LoadingProvider>
        </div>
      </body>
    </html>
  );
}
