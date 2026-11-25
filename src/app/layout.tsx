import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Keyboard diperlakukan sebagai lapisan yang menimpa halaman, bukan sesuatu yang
// mengubah ukuran viewport. Dengan begitu layout aplikasi tidak ikut bergerak
// sama sekali saat keyboard muncul atau berganti jenis. Berlaku untuk seluruh
// halaman karena ditulis di layout root.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "overlays-content",
};

export const metadata: Metadata = {
  title: "Pantau — Kontrol Bisnis F&B & Retail Anda",
  description:
    "Pantau membantu pemilik usaha F&B dan Retail memverifikasi stok, transaksi, dan operasional outlet dari satu tempat. Tahu kondisi nyata bisnis Anda tanpa harus selalu ada di outlet.",
  // Safari iPhone otomatis mengubah tanggal/jam/angka mirip nomor telepon menjadi
  // tautan dengan menambah atribut ke HTML sebelum React aktif. Akibatnya muncul
  // error "hydration ... attributes didn't match". Dimatikan agar HTML tidak diubah.
  formatDetection: { telephone: false, date: false, email: false, address: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${jakartaSans.variable} ${geistMono.variable} h-full`}
      // WebKit pada iPhone dapat menambahkan atribut milik browser ke elemen
      // dokumen sebelum React melakukan hydration. Hanya atribut root ini yang
      // diabaikan; mismatch di komponen aplikasi tetap akan dilaporkan React.
      suppressHydrationWarning
    >
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script id="ignore-broken-metamask-extension" strategy="beforeInteractive">
            {`
            (() => {
              const metamaskExtensionId = "nkbihfbeogaeaoehlefnkodbefgpgknn";
              const isMetaMaskExtensionError = (value) => {
                const message = typeof value === "string"
                  ? value
                  : [value?.message, value?.stack, value?.cause?.message, value?.cause?.stack]
                      .filter(Boolean)
                      .join(" ");

                return message.includes("Failed to connect to MetaMask")
                  || message.includes("MetaMask extension not found")
                  || message.includes("chrome-extension://" + metamaskExtensionId);
              };

              window.addEventListener("error", (event) => {
                if (!isMetaMaskExtensionError(event.error) && !isMetaMaskExtensionError(event.message)) return;
                event.preventDefault();
                event.stopImmediatePropagation();
              }, true);

              window.addEventListener("unhandledrejection", (event) => {
                if (!isMetaMaskExtensionError(event.reason)) return;
                event.preventDefault();
                event.stopImmediatePropagation();
              }, true);
            })();
            `}
          </Script>
        )}
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
