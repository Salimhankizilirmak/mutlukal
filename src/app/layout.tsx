import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lavaş Trace",
  description: "Endüstriyel Üretim İzleme ve Görev Yönetimi",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={{ variables: { colorPrimary: '#059669' } }}>
      <html lang="tr" className="dark">
        <body className={`${inter.className} bg-[#09090b] text-zinc-50 antialiased min-h-screen`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
