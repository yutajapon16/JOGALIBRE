import type { Metadata, Viewport } from "next";
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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://jogalibre.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "JOGALIBRE",
  description: "Compra y Subasta Directa de Japón / Compra e Leilão Direto do Japão",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/customer-icon.png", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" }
    ],
    shortcut: "/icons/customer-icon.png",
    apple: "/icons/customer-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JOGALIBRE",
  },
  openGraph: {
    title: "JOGALIBRE",
    description: "Compra y Subasta Directa de Japón / Compra e Leilão Direto do Japão",
    siteName: "JOGALIBRE",
    type: "website",
    images: [
      {
        url: `${siteUrl}/icons/customer-icon.png`,
        width: 512,
        height: 512,
        alt: "JOGALIBRE Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "JOGALIBRE",
    description: "Compra y Subasta Directa de Japón / Compra e Leilão Direto do Japão",
    images: [`${siteUrl}/icons/customer-icon.png`],
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const imageUrl = `${siteUrl}/icons/customer-icon.png`;

  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light" />
        <link rel="icon" href="/icons/customer-icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/customer-icon.png" />

        {/* Fallback explicit Open Graph Meta Tags for WhatsApp & Social Web Crawlers */}
        <meta property="og:title" content="JOGALIBRE" />
        <meta property="og:description" content="Compra y Subasta Directa de Japón / Compra e Leilão Direto do Japão" />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:secure_url" content={imageUrl} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:site_name" content="JOGALIBRE" />
        <meta property="og:type" content="website" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="JOGALIBRE" />
        <meta name="twitter:description" content="Compra y Subasta Directa de Japón / Compra e Leilão Direto do Japão" />
        <meta name="twitter:image" content={imageUrl} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
