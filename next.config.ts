import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Jangan tampilkan badge "N" development karena menutupi avatar pengguna
  // di bagian bawah sidebar. Error kompilasi/runtime tetap ditampilkan Next.js.
  devIndicators: false,
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
    // Akses dari HP di WiFi yang sama untuk tes tampilan mobile.
    // Pola lebar dipakai karena IP laptop berubah tiap ganti jaringan.
    "192.168.*.*",
    "10.*.*.*",
  ],
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/uploads/:folder/:file",
          destination: "/api/uploads/:folder/:file",
        },
      ],
    };
  },
};

export default nextConfig;
