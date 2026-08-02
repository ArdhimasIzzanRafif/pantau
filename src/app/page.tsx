"use client";
import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Package,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  XCircle,
  Upload,
  Warehouse,
  ClipboardList,
  ShieldCheck,
  Star,
  Bell,
  ShoppingCart,
  ArrowLeftRight,
  FileText,
  Settings,
  Sun,
  Moon,
  TrendingUp,
  Users,
  Receipt,
  ChevronDown,
  CreditCard,
  Zap,
} from "lucide-react";

/* ─── Minimal theme ─── */
const L = {
  bg: "bg-white",
  bg2: "bg-blue-50/60",
  text: "text-slate-900",
  sub: "text-slate-500",
  border: "border-slate-200",
  card: "bg-white border border-slate-200",
  pill: "bg-blue-600 hover:bg-blue-700 text-white",
  pillOut:
    "border border-slate-300 text-slate-700 hover:border-slate-900 hover:text-slate-900",
  eye: "text-blue-600",
  toggle: "bg-slate-100 text-slate-500 hover:bg-slate-200",
};
const D = {
  bg: "bg-slate-950",
  bg2: "bg-slate-900",
  text: "text-white",
  sub: "text-white/50",
  border: "border-white/8",
  card: "bg-white/5 border border-white/8",
  pill: "bg-blue-500 hover:bg-blue-400 text-white",
  pillOut:
    "border border-white/20 text-white/70 hover:border-white hover:text-white",
  eye: "text-blue-400",
  toggle: "bg-white/8 text-white/50 hover:bg-white/15",
};

export default function LandingPage() {
  const [dark, setDark] = useState(false);
  const T = dark ? D : L;

  const section = `py-28 px-6 transition-colors duration-300 ${T.bg}`;
  const section2 = `py-28 px-6 transition-colors duration-300 ${T.bg2}`;

  return (
    <div
      className={`min-h-screen antialiased transition-colors duration-300 ${T.bg} ${T.text}`}
      style={{ fontFeatureSettings: '"ss03"' }}
    >
      {/* ── NAV ── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 h-14 border-b backdrop-blur-xl transition-colors duration-300
        ${dark ? "bg-slate-950/80 border-white/8" : "bg-white/90 border-slate-200"}`}
      >
        <div className="max-w-6xl mx-auto px-6 h-full grid grid-cols-3 items-center">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-base">Pantau</span>
          </div>
          <div className="hidden md:flex items-center justify-center gap-8">
            {[
              ["#fitur", "Fitur"],
              ["#cara-kerja", "Cara Kerja"],
              ["#harga", "Harga"],
              ["#faq", "FAQ"],
            ].map(([h, l]) => (
              <a
                key={h}
                href={h}
                className={`text-sm font-medium transition-colors ${T.sub} hover:${T.text}`}
              >
                {l}
              </a>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setDark((d) => !d)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${T.toggle}`}
              aria-label="Toggle dark mode"
            >
              {dark ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <Link
              href="/login"
              className={`hidden sm:block text-sm font-medium px-3 py-2 transition-colors ${T.sub}`}
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className={`text-sm font-semibold px-5 py-2.5 rounded-full transition-all ${T.pill}`}
            >
              Daftar Sekarang
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        className={`relative pt-28 pb-0 px-6 overflow-hidden transition-colors duration-300 ${T.bg}`}
      >
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-200 h-80 rounded-full blur-3xl pointer-events-none
          opacity-30 bg-blue-400"
          style={{ filter: "blur(80px)" }}
        />

        <div className="max-w-4xl mx-auto text-center pt-16 pb-16 relative">
          {/* Eyebrow */}
          <div
            className={`inline-flex items-center gap-2 border px-4 py-1.5 rounded-full text-xs font-semibold mb-8 transition-colors
            ${dark ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-blue-200 bg-blue-50 text-blue-600"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Platform Operasional untuk F&B & Retail UMKM Indonesia
          </div>

          {/* Headline */}
          <h1
            className={`text-[clamp(2.6rem,6.5vw,5rem)] leading-[1.05] tracking-tight mb-6 transition-colors ${T.text}`}
            style={{ fontWeight: 300 }}
          >
            Satu platform.
            <br />
            <span className="text-blue-600">
              Semua operasional bisnis Anda.
            </span>
          </h1>

          <p
            className={`text-lg max-w-lg mx-auto mb-10 leading-relaxed transition-colors ${T.sub}`}
          >
            Kasir, Stok Multi-Outlet, Opname Fisik, Transfer Gudang, Dan
            Peringatan Real-Time Semua Terhubung Dalam Satu Platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Link
              href="/register"
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-full font-semibold text-sm transition-all ${T.pill}`}
            >
              Daftar Sekarang <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#fitur"
              className={`w-full sm:w-auto flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-sm transition-all ${T.pillOut}`}
            >
              Lihat Fitur
            </a>
          </div>
          <p className={`text-xs mb-16 transition-colors ${T.sub}`}>
            Daftar dan langsung pakai · Tim kami siap membantu onboarding
          </p>

          {/* Stats */}
          <div
            className={`flex items-center justify-center gap-12 mb-16 pb-16 border-b transition-colors ${T.border}`}
          >
            {[
              ["100+", "Bisnis terdaftar"],
              ["8", "Modul terintegrasi"],
            ].map(([v, l]) => (
              <div key={v} className="text-center">
                <div
                  className={`text-3xl tracking-tight transition-colors ${T.text}`}
                  style={{ fontWeight: 300 }}
                >
                  {v}
                </div>
                <div
                  className={`text-xs mt-1 font-medium transition-colors ${T.sub}`}
                >
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── HERO DASHBOARD MOCKUP ── */}
        <div className="max-w-5xl mx-auto">
          <div
            className={`rounded-t-2xl overflow-hidden border-x border-t shadow-2xl transition-colors
            ${dark ? "border-white/10 shadow-black/60" : "border-slate-200 shadow-slate-200/60"}`}
          >
            {/* Chrome */}
            <div
              className={`flex items-center gap-3 px-4 py-3 border-b transition-colors
              ${dark ? "bg-slate-900 border-white/8" : "bg-slate-50 border-slate-200"}`}
            >
              <div className="flex gap-1.5">
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <div
                    key={c}
                    className="w-3 h-3 rounded-full"
                    style={{ background: c, opacity: 0.9 }}
                  />
                ))}
              </div>
              <div
                className={`flex-1 max-w-48 mx-auto rounded-md px-3 py-1 text-xs text-center border transition-colors
                ${dark ? "bg-slate-800 border-white/10 text-white/30" : "bg-white border-slate-200 text-slate-400"}`}
              >
                🔒 app.pantau.id/dashboard
              </div>
              <div
                className={`hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full
                ${dark ? "bg-blue-500/15 text-blue-400" : "bg-blue-50 text-blue-600 border border-blue-200"}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Live
              </div>
            </div>
            {/* App Layout */}
            <div
              className={`flex transition-colors ${dark ? "bg-slate-950" : "bg-white"}`}
            >
              {/* Sidebar */}
              <div
                className={`hidden md:flex flex-col w-14 border-r shrink-0 py-4 px-2 gap-1 transition-colors
                ${dark ? "bg-[#070b14] border-white/6" : "bg-slate-50 border-slate-100"}`}
              >
                {[
                  {
                    icon: <BarChart3 className="w-4 h-4" />,
                    active: true,
                    label: "Dashboard",
                  },
                  { icon: <ShoppingCart className="w-4 h-4" />, label: "POS" },
                  { icon: <Package className="w-4 h-4" />, label: "Stok" },
                  {
                    icon: <ArrowLeftRight className="w-4 h-4" />,
                    label: "Transfer",
                  },
                  {
                    icon: <Upload className="w-4 h-4" />,
                    label: "Barang Masuk",
                  },
                  {
                    icon: <ClipboardList className="w-4 h-4" />,
                    label: "Opname",
                  },
                  { icon: <FileText className="w-4 h-4" />, label: "Laporan" },
                  {
                    icon: <Settings className="w-4 h-4" />,
                    label: "Pengaturan",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    title={item.label}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors mb-0.5
                      ${
                        item.active
                          ? dark
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-blue-600 text-white"
                          : dark
                            ? "text-white/20 hover:text-white/50"
                            : "text-slate-400 hover:text-slate-700"
                      }`}
                  >
                    {item.icon}
                  </div>
                ))}
              </div>
              {/* Main */}
              <div className="flex-1 p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div
                      className={`text-[11px] font-medium transition-colors ${T.sub}`}
                    >
                      Pantau — Dashboard
                    </div>
                    <div
                      className={`text-sm font-bold transition-colors ${T.text}`}
                    >
                      Selamat pagi, Budiman 👋
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors
                      ${dark ? "bg-white/5 border-white/10 text-white/40" : "bg-slate-50 border-slate-200 text-slate-500"}`}
                    >
                      Owner · Burger Bali
                    </div>
                    <div className="relative">
                      <Bell className={`w-4 h-4 transition-colors ${T.sub}`} />
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                    </div>
                  </div>
                </div>
                {/* KPI Cards — match real dashboard */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    {
                      l: "Outlet Aktif",
                      v: "5",
                      c: "text-blue-600",
                      bg: dark
                        ? "bg-blue-500/12 border border-blue-500/15"
                        : "bg-blue-50",
                    },
                    {
                      l: "Peringatan",
                      v: "3",
                      c: "text-red-500",
                      bg: dark
                        ? "bg-red-500/12 border border-red-500/15"
                        : "bg-red-50",
                    },
                    {
                      l: "Omset Hari Ini",
                      v: "Rp 4,3jt",
                      c: "text-emerald-600",
                      bg: dark
                        ? "bg-emerald-500/12 border border-emerald-500/15"
                        : "bg-emerald-50",
                    },
                    {
                      l: "Stok Item",
                      v: "284",
                      c: dark ? "text-white" : "text-slate-700",
                      bg: dark
                        ? "bg-white/5 border border-white/8"
                        : "bg-white border border-slate-200",
                    },
                  ].map((s) => (
                    <div
                      key={s.l}
                      className={`rounded-2xl p-4 transition-colors ${s.bg}`}
                    >
                      <div
                        className={`text-2xl font-bold tracking-tight ${s.c}`}
                      >
                        {s.v}
                      </div>
                      <div
                        className={`text-[11px] mt-1 font-medium transition-colors ${T.sub}`}
                      >
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Bottom panels — match real dashboard */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Alerts panel */}
                  <div
                    className={`rounded-2xl p-4 border transition-colors ${dark ? "bg-white/3 border-white/6" : "bg-white border-slate-100"}`}
                  >
                    <div
                      className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-3.5 transition-colors ${T.sub}`}
                    >
                      <AlertTriangle className="w-3 h-3 text-red-500" />{" "}
                      Peringatan Aktif
                    </div>
                    <div className="space-y-2.5">
                      {[
                        {
                          t: "Beef Patty — Kemang selisih -5 pcs",
                          bc: "border-red-500",
                          tc: dark ? "text-red-300" : "text-red-600",
                        },
                        {
                          t: "Coca-Cola — Senopati stok kritis",
                          bc: "border-orange-500",
                          tc: dark ? "text-orange-300" : "text-orange-600",
                        },
                        {
                          t: "Harga beli Minyak naik 24% dari HPP",
                          bc: "border-yellow-500",
                          tc: dark ? "text-yellow-300" : "text-yellow-700",
                        },
                      ].map((a) => (
                        <div
                          key={a.t}
                          className={`border-l-4 pl-3 py-0.5 ${a.bc}`}
                        >
                          <div className={`text-[12px] font-medium ${a.tc}`}>
                            {a.t}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Stock per outlet panel */}
                  <div
                    className={`rounded-2xl p-4 border transition-colors ${dark ? "bg-white/3 border-white/6" : "bg-white border-slate-100"}`}
                  >
                    <div
                      className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-3.5 transition-colors ${T.sub}`}
                    >
                      <TrendingUp className="w-3 h-3 text-blue-500" /> Stok per
                      Outlet
                    </div>
                    <div className="space-y-3">
                      {[
                        { n: "Outlet Kemang", p: 85, ok: true },
                        { n: "Outlet Senopati", p: 48, ok: false },
                        { n: "Outlet BSD City", p: 92, ok: true },
                        { n: "Outlet Bekasi", p: 76, ok: true },
                      ].map((r) => (
                        <div key={r.n} className="flex items-center gap-2.5">
                          <div
                            className={`text-[11px] w-24 shrink-0 font-medium transition-colors ${T.sub}`}
                          >
                            {r.n}
                          </div>
                          <div
                            className={`flex-1 h-2 rounded-full transition-colors ${dark ? "bg-white/8" : "bg-slate-100"}`}
                          >
                            <div
                              className={`h-full rounded-full transition-all ${r.ok ? "bg-blue-500" : "bg-red-500"}`}
                              style={{ width: `${r.p}%` }}
                            />
                          </div>
                          <div
                            className={`text-[11px] w-8 text-right font-semibold ${r.ok ? (dark ? "text-slate-500" : "text-slate-400") : "text-red-500"}`}
                          >
                            {r.p}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE 1: POS BUILT-IN ── */}
      <section
        id="fitur"
        className={`py-28 px-6 transition-colors duration-300 bg-slate-950`}
      >
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Text */}
          <div>
            <div className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-4">
              POS Terintegrasi
            </div>
            <h2
              className="text-white text-[clamp(2rem,4vw,3rem)] leading-[1.1] tracking-tight mb-6"
              style={{ fontWeight: 300 }}
            >
              Kasir, shift, dan transaksi
              <br />
              dalam satu tampilan.
            </h2>
            <p className="text-white/50 leading-relaxed mb-8">
              POS Pantau sudah terhubung langsung ke inventori. Kasir buka
              shift, proses transaksi, tutup shift . Semua tercatat otomatis dan
              stok tersinkronisasi ke semua outlet secara real-time.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Setiap transaksi langsung kurangi stok outlet",
                "Buka & tutup shift tercatat otomatis",
                "Struk digital via WhatsApp atau cetak langsung",
                "Riwayat shift per kasir, per outlet, dan per periode",
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-2.5 text-sm text-white/60"
                >
                  <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />{" "}
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {/* POS Mockup */}
          <div className="bg-[#0a0a14] rounded-2xl border border-white/8 overflow-hidden shadow-2xl shadow-black/60">
            <div className="bg-blue-600 px-5 py-3.5 flex items-center justify-between">
              <div>
                <div className="text-blue-100 text-[11px] font-medium">
                  POS Pantau
                </div>
                <div className="text-white font-bold text-sm">
                  Outlet Kemang — Shift Pagi
                </div>
              </div>
              <div className="text-right">
                <div className="text-blue-200 text-[11px]">Kasir: Sarah</div>
                <div className="text-white text-[11px] font-medium">
                  08:00 – sekarang
                </div>
              </div>
            </div>
            <div className="p-5">
              {/* Cart */}
              <div className="space-y-2 mb-4">
                {[
                  { item: "Burger Bali Classic", qty: 2, price: "Rp 90.000" },
                  { item: "Crispy Chicken Burger", qty: 1, price: "Rp 38.000" },
                  { item: "Cola Float", qty: 3, price: "Rp 66.000" },
                  { item: "Kentang Goreng", qty: 2, price: "Rp 36.000" },
                ].map((r) => (
                  <div
                    key={r.item}
                    className="flex items-center justify-between bg-white/4 rounded-lg px-3.5 py-2.5 border border-white/6"
                  >
                    <div>
                      <div className="text-white text-[12px] font-medium">
                        {r.item}
                      </div>
                      <div className="text-white/40 text-[11px]">× {r.qty}</div>
                    </div>
                    <div className="text-white text-[12px] font-semibold">
                      {r.price}
                    </div>
                  </div>
                ))}
              </div>
              {/* Total */}
              <div className="border-t border-white/8 pt-4 mb-4">
                <div className="flex justify-between text-[12px] text-white/40 mb-1.5">
                  <span>Subtotal</span>
                  <span>Rp 212.000</span>
                </div>
                <div className="flex justify-between text-[12px] text-white/40 mb-3">
                  <span>Pajak (10%)</span>
                  <span>Rp 21.200</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white">
                  <span>Total</span>
                  <span>Rp 233.200</span>
                </div>
              </div>
              {/* Payment buttons */}
              <div className="grid grid-cols-3 gap-2">
                {["Tunai", "Transfer", "QRIS"].map((m, i) => (
                  <button
                    key={m}
                    className={`py-2.5 rounded-xl text-[12px] font-semibold transition-colors ${i === 0 ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-white/6 hover:bg-white/12 text-white/60 border border-white/8"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="mt-3 text-center text-[11px] text-white/25">
                18 transaksi hari ini · Total Rp 4.347.000
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE 2: STOK MULTI-OUTLET ── */}
      <section className={section}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Stock Mockup */}
          <div
            className={`rounded-2xl border overflow-hidden transition-colors ${T.card} shadow-xl ${dark ? "shadow-black/40" : "shadow-slate-200/60"}`}
          >
            <div
              className={`px-5 py-3.5 border-b flex items-center justify-between transition-colors ${dark ? "bg-white/3 border-white/8" : "bg-slate-50 border-slate-200"}`}
            >
              <div>
                <div
                  className={`text-[11px] font-medium transition-colors ${T.sub}`}
                >
                  Manajemen Stok
                </div>
                <div
                  className={`font-bold text-sm transition-colors ${T.text}`}
                >
                  Saldo per Outlet — Real-Time
                </div>
              </div>
              <div
                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors
                ${dark ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" : "bg-blue-50 text-blue-600 border border-blue-200"}`}
              >
                Update: baru saja
              </div>
            </div>
            <div className="p-4">
              {/* Table header */}
              <div
                className={`grid grid-cols-5 text-[11px] font-bold uppercase tracking-wider pb-2 mb-1 border-b transition-colors ${T.sub} ${T.border}`}
              >
                <div className="col-span-2">Item</div>
                <div className="text-center">Kemang</div>
                <div className="text-center">Senopati</div>
                <div className="text-center">BSD</div>
              </div>
              {[
                {
                  item: "Beef Patty 100gr",
                  unit: "pcs",
                  vals: [45, 8, 30],
                  min: 15,
                },
                {
                  item: "Bun Burger",
                  unit: "pcs",
                  vals: [120, 89, 74],
                  min: 30,
                },
                {
                  item: "Coca-Cola 330ml",
                  unit: "kaleng",
                  vals: [88, 12, 45],
                  min: 24,
                },
                {
                  item: "Minyak Goreng",
                  unit: "liter",
                  vals: [32, 27, 19],
                  min: 10,
                },
                {
                  item: "Saus Sambal",
                  unit: "btl",
                  vals: [18, 15, 22],
                  min: 6,
                },
              ].map((r) => {
                const isLow = (v: number) => v <= r.min;
                return (
                  <div
                    key={r.item}
                    className={`grid grid-cols-5 py-2.5 border-b text-[12px] transition-colors ${T.border} last:border-0`}
                  >
                    <div
                      className={`col-span-2 font-medium transition-colors ${T.text}`}
                    >
                      {r.item}
                    </div>
                    {r.vals.map((v, i) => (
                      <div
                        key={i}
                        className={`text-center font-semibold ${isLow(v) ? "text-red-500" : dark ? "text-emerald-400" : "text-emerald-600"}`}
                      >
                        {v}
                        {isLow(v) && (
                          <span className="ml-1 text-[10px] text-red-400">
                            ⚠
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              <div
                className={`mt-3 pt-3 border-t flex items-center justify-between text-[11px] transition-colors ${T.border} ${T.sub}`}
              >
                <span>284 item total · 3 item stok kritis</span>
                <button
                  className={`font-semibold transition-colors ${dark ? "text-blue-400" : "text-blue-600"}`}
                >
                  Lihat semua →
                </button>
              </div>
            </div>
          </div>
          {/* Text */}
          <div>
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-4 transition-colors ${T.eye}`}
            >
              Stok Multi-Lokasi
            </div>
            <h2
              className={`text-[clamp(2rem,4vw,3rem)] leading-[1.1] tracking-tight mb-6 transition-colors ${T.text}`}
              style={{ fontWeight: 300 }}
            >
              Stok semua outlet,
              <br />
              terpantau dari
              <br />
              satu tempat.
            </h2>
            <p className={`leading-relaxed mb-8 transition-colors ${T.sub}`}>
              Saldo stok di setiap outlet diperbarui secara otomatis dariPantau
              mendeteksi selisih stok, stok menipis, transfer belum
              dikonfirmasi, dan kenaikan harga beli. Peringatan masuk ke Owner
              sebelum jadi masalah besar. Opname fisik digital — supervisor
              input dari HP, selisih terhitung otomatis. transaksi kasir,
              penerimaan barang supplier, hingga transfer antar lokasi. Setiap
              pergerakan stok terdokumentasi lengkap dan dapat diaudit kapan
              saja.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Transfer stok dengan alur persetujuan digital",
                "Saldo per item per outlet sinkron secara real-time",
                "Notifikasi otomatis saat stok mendekati batas minimum",
                "Histori pergerakan stok lengkap dengan audit trail",
              ].map((t) => (
                <li
                  key={t}
                  className={`flex items-start gap-2.5 text-sm transition-colors ${T.sub}`}
                >
                  <CheckCircle
                    className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${dark ? "text-blue-400" : "text-blue-500"}`}
                  />{" "}
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── FEATURE 3: ALERTS & OPNAME ── */}
      <section className={section2}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Text */}
          <div>
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-4 transition-colors ${T.eye}`}
            >
              Peringatan & Opname
            </div>
            <h2
              className={`text-[clamp(2rem,4vw,3rem)] leading-[1.1] tracking-tight mb-6 transition-colors ${T.text}`}
              style={{ fontWeight: 300 }}
            >
              Ketahuan lebih awal.
              <br />
              Rugi lebih sedikit.
            </h2>
            <p className={`leading-relaxed mb-8 transition-colors ${T.sub}`}>
              Pantau mendeteksi selisih stok, stok menipis, transfer belum
              dikonfirmasi, dan kenaikan harga beli. Peringatan masuk ke Owner
              sebelum jadi masalah besar. Opname fisik digital supervisor input
              dari HP, selisih terhitung otomatis.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Peringatan real-time ke dashboard Owner",
                "Opname fisik dengan saldo point-in-time yang akurat",
                "Deteksi kenaikan harga beli >20% dari HPP",
                "WAC (Moving Average Cost) diperbarui otomatis",
              ].map((t) => (
                <li
                  key={t}
                  className={`flex items-start gap-2.5 text-sm transition-colors ${T.sub}`}
                >
                  <CheckCircle
                    className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${dark ? "text-blue-400" : "text-blue-500"}`}
                  />{" "}
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {/* Alert Mockup */}
          <div
            className={`rounded-2xl border overflow-hidden transition-colors ${T.card} shadow-xl ${dark ? "shadow-black/40" : "shadow-slate-200/60"}`}
          >
            <div
              className={`px-5 py-3.5 border-b transition-colors ${dark ? "bg-white/3 border-white/8" : "bg-slate-50 border-slate-200"}`}
            >
              <div
                className={`text-[11px] font-medium transition-colors ${T.sub}`}
              >
                Peringatan Aktif
              </div>
              <div className={`font-bold text-sm transition-colors ${T.text}`}>
                3 peringatan perlu perhatian
              </div>
            </div>
            <div className="p-4 space-y-3">
              {[
                {
                  icon: <AlertTriangle className="w-4 h-4" />,
                  label: "KRITIS",
                  labelC: "text-red-600",
                  labelBg: dark
                    ? "bg-red-500/15 border-red-500/25"
                    : "bg-red-50 border-red-200",
                  card: dark
                    ? "border-l-4 border-red-500 bg-red-500/5"
                    : "border-l-4 border-red-400 bg-red-50",
                  title: "Beef Patty — Senopati stok menipis",
                  desc: "Saldo 8 pcs · Min. stok 15 pcs · Transfer diperlukan",
                  time: "2 menit lalu",
                },
                {
                  icon: <ShoppingCart className="w-4 h-4" />,
                  label: "WARNING",
                  labelC: "text-orange-600",
                  labelBg: dark
                    ? "bg-orange-500/15 border-orange-500/25"
                    : "bg-orange-50 border-orange-200",
                  card: dark
                    ? "border-l-4 border-orange-500 bg-orange-500/5"
                    : "border-l-4 border-orange-400 bg-orange-50",
                  title: "Transfer ke BSD belum dikonfirmasi",
                  desc: "Transfer #TRF-240 · Dikirim 3 jam lalu · Menunggu konfirmasi Supervisor BSD",
                  time: "3 jam lalu",
                },
                {
                  icon: <TrendingUp className="w-4 h-4" />,
                  label: "INFO",
                  labelC: "text-blue-600",
                  labelBg: dark
                    ? "bg-blue-500/15 border-blue-500/25"
                    : "bg-blue-50 border-blue-200",
                  card: dark
                    ? "border-l-4 border-blue-500 bg-blue-500/5"
                    : "border-l-4 border-blue-400 bg-blue-50",
                  title: "Harga beli Minyak Goreng naik 24%",
                  desc: "HPP lama Rp 14.000 · Harga masuk Rp 17.350 · WAC diperbarui",
                  time: "Hari ini, 09:15",
                },
              ].map((a) => (
                <div
                  key={a.title}
                  className={`rounded-xl p-4 border transition-colors ${a.card}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`${a.labelC}`}>{a.icon}</span>
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${a.labelC} ${a.labelBg}`}
                      >
                        {a.label}
                      </span>
                    </div>
                    <span className={`text-[10px] transition-colors ${T.sub}`}>
                      {a.time}
                    </span>
                  </div>
                  <div
                    className={`text-[12px] font-semibold mb-1 transition-colors ${T.text}`}
                  >
                    {a.title}
                  </div>
                  <div
                    className={`text-[11px] leading-relaxed transition-colors ${T.sub}`}
                  >
                    {a.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ALL FEATURES GRID ── */}
      <section className={`py-28 px-6 transition-colors duration-300 ${T.bg}`}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-4 transition-colors ${T.eye}`}
            >
              Semua Fitur
            </div>
            <h2
              className={`text-[clamp(2rem,4.5vw,3rem)] leading-[1.08] tracking-tight transition-colors ${T.text}`}
              style={{ fontWeight: 300 }}
            >
              Satu platform, semua yang
              <br />
              dibutuhkan operasional bisnis.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: <ShoppingCart className="w-5 h-5" />,
                color: "text-blue-600",
                bg: dark
                  ? "bg-blue-500/10 border-blue-500/20"
                  : "bg-blue-50 border-blue-100",
                title: "POS & Kasir",
                desc: "Kasir buka shift, pilih menu, proses pembayaran (tunai, QRIS, GoFood, GrabFood), kirim struk WhatsApp. Semua transaksi langsung kurangi stok.",
              },
              {
                icon: <Package className="w-5 h-5" />,
                color: "text-emerald-600",
                bg: dark
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : "bg-emerald-50 border-emerald-100",
                title: "Inventori & Stok",
                desc: "Master item dengan satuan, pack size, dan HPP. Saldo stok per outlet terupdate otomatis setiap ada transaksi, barang masuk, atau transfer.",
              },
              {
                icon: <ArrowLeftRight className="w-5 h-5" />,
                color: "text-violet-600",
                bg: dark
                  ? "bg-violet-500/10 border-violet-500/20"
                  : "bg-violet-50 border-violet-100",
                title: "Transfer Stok",
                desc: "Kirim stok dari gudang ke outlet dengan alur kerja digital. Admin buat transfer → supervisor konfirmasi penerimaan → saldo langsung terupdate.",
              },
              {
                icon: <Warehouse className="w-5 h-5" />,
                color: "text-orange-600",
                bg: dark
                  ? "bg-orange-500/10 border-orange-500/20"
                  : "bg-orange-50 border-orange-100",
                title: "Barang Masuk",
                desc: "Catat penerimaan barang dari supplier lengkap dengan harga beli dan foto surat jalan. HPP otomatis diperbarui menggunakan metode WAC.",
              },
              {
                icon: <ClipboardList className="w-5 h-5" />,
                color: "text-sky-600",
                bg: dark
                  ? "bg-sky-500/10 border-sky-500/20"
                  : "bg-sky-50 border-sky-100",
                title: "Opname Fisik",
                desc: "Supervisor hitung stok fisik langsung dari HP. Sistem otomatis hitung selisih dengan stok sistem dan estimasi nilai kerugian.",
              },
              {
                icon: <Receipt className="w-5 h-5" />,
                color: "text-pink-600",
                bg: dark
                  ? "bg-pink-500/10 border-pink-500/20"
                  : "bg-pink-50 border-pink-100",
                title: "Menu & Resep",
                desc: "Buat menu dengan foto, harga jual, dan resep bahan baku. Setiap penjualan otomatis kurangi stok bahan sesuai resep yang sudah ditentukan.",
              },
              {
                icon: <Bell className="w-5 h-5" />,
                color: "text-red-600",
                bg: dark
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-red-50 border-red-100",
                title: "Peringatan Otomatis",
                desc: "Notifikasi real-time ke Owner saat stok di bawah minimum, harga beli naik >20% dari HPP, atau transfer belum dikonfirmasi lebih dari 24 jam.",
              },
              {
                icon: <TrendingUp className="w-5 h-5" />,
                color: "text-slate-600",
                bg: dark
                  ? "bg-white/5 border-white/10"
                  : "bg-slate-50 border-slate-100",
                title: "Dashboard Owner",
                desc: "Lihat omset, top produk, kondisi stok semua outlet, dan peringatan aktif — dari HP atau laptop, kapanpun dan dimanapun.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className={`rounded-2xl border p-5 transition-all ${dark ? "bg-white/3 border-white/8 hover:border-white/20" : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 border ${f.bg} ${f.color}`}
                >
                  {f.icon}
                </div>
                <div
                  className={`font-semibold text-sm mb-2 transition-colors ${T.text}`}
                >
                  {f.title}
                </div>
                <div
                  className={`text-xs leading-relaxed transition-colors ${T.sub}`}
                >
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        id="cara-kerja"
        className={`py-28 px-6 bg-slate-950 transition-colors duration-300`}
      >
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-4">
              Cara Kerja
            </div>
            <h2
              className="text-white text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-tight"
              style={{ fontWeight: 300 }}
            >
              Dari nol ke kontrol penuh
              <br />
              dalam 5 menit.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                n: "01",
                t: "Daftar dan konfigurasi bisnis",
                d: "Buat akun, tambahkan lokasi outlet, input master inventori, dan undang anggota tim sesuai perannya masing-masing.",
              },
              {
                n: "02",
                t: "Mulai operasional harian",
                d: "Kasir membuka shift dan memproses transaksi melalui POS. Setiap penjualan otomatis mengurangi stok outlet secara real-time.",
              },
              {
                n: "03",
                t: "Kelola stok dan pasokan",
                d: "Admin Gudang mencatat penerimaan barang dari supplier dan membuat permintaan transfer ke outlet. Supervisor mengonfirmasi penerimaan langsung dari aplikasi.",
              },
              {
                n: "04",
                t: "Pantau kondisi bisnis",
                d: "Owner memantau performa seluruh outlet dari omset, kondisi stok, peringatan aktif, dan laporan shift — dari satu dashboard.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="bg-white/4 hover:bg-white/6 border border-white/8 hover:border-blue-500/30 rounded-2xl p-8 transition-all"
              >
                <div className="text-5xl font-black text-white/6 mb-4">
                  {s.n}
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{s.t}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className={section}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-4 transition-colors ${T.eye}`}
            >
              Testimoni
            </div>
            <h2
              className={`text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-tight transition-colors ${T.text}`}
              style={{ fontWeight: 300 }}
            >
              Owner UMKM sudah merasakannya.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                n: "Budiman H.",
                r: "Owner, Burger Bali · 3 outlet Jakarta",
                i: "B",
                c: "bg-blue-600",
                q: "Selisih stok yang biasanya bikin pusing tiap bulan sekarang bisa saya deteksi di hari yang sama. POS Pantau juga bikin kasir lebih disiplin, semua shift tercatat.",
              },
              {
                n: "Dewi K.",
                r: "Owner, Warkop Nusantara · 5 outlet Bandung",
                i: "D",
                c: "bg-blue-700",
                q: "Dulu harus WA satu-satu ke supervisor buat tau kondisi outlet. Sekarang buka HP langsung keliatan semuanya. Transfer barang sekarang terlacak, tidak ada lagi yang lupa dikonfirmasi.",
              },
              {
                n: "Rizky P.",
                r: "Owner, Minimart Pratama · 2 outlet Surabaya",
                i: "R",
                c: "bg-slate-700",
                q: "Staff lebih disiplin karena semua pergerakan stok tercatat. Ada yang coba curang langsung ketahuan dari audit log. Investasi paling worth it tahun ini.",
              },
            ].map((t) => (
              <div
                key={t.n}
                className={`flex flex-col rounded-2xl p-7 border-2 transition-all hover:shadow-xl ${dark ? "border-white/8 hover:border-blue-500/30 bg-white/2" : "border-slate-100 hover:border-blue-200 hover:shadow-blue-50/80"}`}
              >
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <p
                  className={`text-sm leading-relaxed flex-1 mb-7 transition-colors ${T.sub}`}
                >
                  &ldquo;{t.q}&rdquo;
                </p>
                <div
                  className={`flex items-center gap-3 border-t pt-5 transition-colors ${T.border}`}
                >
                  <div
                    className={`w-9 h-9 ${t.c} rounded-full flex items-center justify-center text-white font-black text-sm shrink-0`}
                  >
                    {t.i}
                  </div>
                  <div>
                    <div
                      className={`font-bold text-sm transition-colors ${T.text}`}
                    >
                      {t.n}
                    </div>
                    <div className={`text-xs transition-colors ${T.sub}`}>
                      {t.r}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="harga" className={section2}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-4 transition-colors ${T.eye}`}
            >
              Harga
            </div>
            <h2
              className={`text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-tight mb-4 transition-colors ${T.text}`}
              style={{ fontWeight: 300 }}
            >
              Transparan. Tanpa kejutan.
            </h2>
            <p className={`transition-colors ${T.sub}`}>
              Pilih paket yang sesuai kebutuhan bisnis Anda.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start max-w-3xl mx-auto">
            {[
              {
                n: "Kasir",
                p: "Rp 60.000",
                per: "per bulan",
                pop: false,
                cta: "Daftar Sekarang",
                desc: "Untuk bisnis yang hanya butuh sistem kasir.",
                f: [
                  "Kasir tak terbatas",
                  "Manajemen shift",
                  "Struk digital & cetak",
                  "Riwayat transaksi",
                  "Laporan penjualan harian",
                ],
              },
              {
                n: "Operasional",
                p: "Rp 100.000",
                per: "per bulan",
                pop: true,
                cta: "Daftar Sekarang",
                desc: "Kasir + manajemen stok, gudang, dan operasional lengkap.",
                f: [
                  "Semua fitur Kasir",
                  "Multi-outlet",
                  "Barang masuk dari supplier (WAC)",
                  "Transfer stok antar outlet",
                  "Opname fisik",
                  "Peringatan stok & harga otomatis",
                  "Audit trail lengkap",
                  "Akses Owner, Supervisor, Admin Gudang",
                ],
              },
            ].map((plan) => (
              <div
                key={plan.n}
                className={`relative rounded-2xl p-8 border-2 transition-all ${
                  plan.pop
                    ? "border-blue-600 bg-blue-600 text-white shadow-2xl shadow-blue-200/40 md:-mt-4 md:-mb-4"
                    : dark
                      ? "border-white/8 bg-white/3 hover:border-white/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
                }`}
              >
                {plan.pop && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 bg-white text-blue-600 text-xs font-black px-4 py-1.5 rounded-full shadow-lg">
                      <Star className="w-3 h-3 fill-blue-600" /> Paling Populer
                    </span>
                  </div>
                )}
                <div className="mb-7">
                  <div
                    className={`text-sm font-semibold mb-3 ${plan.pop ? "text-blue-100" : T.sub}`}
                  >
                    {plan.n}
                  </div>
                  <div
                    className={`text-4xl tracking-tight ${plan.pop ? "text-white" : T.text}`}
                    style={{ fontWeight: 300 }}
                  >
                    {plan.p}
                  </div>
                  <div
                    className={`text-sm mt-1 ${plan.pop ? "text-blue-200" : T.sub}`}
                  >
                    {plan.per}
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.f.map((f) => (
                    <li
                      key={f}
                      className={`flex items-start gap-2.5 text-sm ${plan.pop ? "text-blue-100" : T.sub}`}
                    >
                      <CheckCircle
                        className={`w-4 h-4 shrink-0 mt-0.5 ${plan.pop ? "text-blue-200" : dark ? "text-blue-400" : "text-blue-500"}`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`w-full py-3.5 rounded-full font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                    plan.pop
                      ? "bg-white text-blue-600 hover:bg-blue-50 font-bold"
                      : T.pill
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className={`text-center text-sm mt-8 transition-colors ${T.sub}`}>
            Hubungi kami untuk info lebih lanjut dan proses onboarding
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className={section}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-4 transition-colors ${T.eye}`}
            >
              FAQ
            </div>
            <h2
              className={`text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-tight transition-colors ${T.text}`}
              style={{ fontWeight: 300 }}
            >
              Pertanyaan umum.
            </h2>
          </div>
          <div className="space-y-2">
            {[
              {
                q: "Apakah sistem kasir sudah termasuk dalam Pantau?",
                a: "Ya. POS sudah terintegrasi langsung tidak perlu aplikasi kasir tambahan. Kasir membuka shift, memproses transaksi, dan mencetak struk dari satu tampilan. Setiap penjualan langsung memperbarui stok secara otomatis.",
              },
              {
                q: "Apakah Pantau mendukung bisnis dengan lebih dari satu outlet?",
                a: "Ya. Pantau dirancang untuk multi-outlet sejak awal. Setiap outlet memiliki stok dan kasir masing-masing, namun Owner dan Supervisor dapat memantau kondisi seluruh outlet dari satu dashboard secara real-time.",
              },
              {
                q: "Siapa saja yang bisa mengakses sistem Pantau?",
                a: "Akses diatur berdasarkan peran. Owner dapat melihat seluruh data bisnis. Supervisor mengonfirmasi transfer dan memantau stok. Admin Gudang mengelola barang masuk dan opname. Kasir hanya dapat mengakses POS dan transaksi shift mereka.",
              },
              {
                q: "Apakah ada bantuan untuk proses setup awal?",
                a: "Ya. Setelah akun disetujui, tim kami mendampingi proses onboarding — mulai dari konfigurasi outlet, input data produk dan inventori, hingga pembagian akses tim. Kami pastikan sistem siap digunakan sebelum operasional dimulai.",
              },
              {
                q: "Apakah Pantau tersedia di perangkat mobile?",
                a: "Ya. Pantau tersedia dalam dua bentuk: web app yang dapat dibuka langsung dari browser HP atau laptop tanpa instalasi, dan aplikasi Android untuk tim di lapangan. Keduanya terhubung ke data yang sama secara real-time.",
              },
            ].map((item) => (
              <details
                key={item.q}
                className={`group rounded-2xl border-2 overflow-hidden transition-all ${dark ? "border-white/8 hover:border-blue-500/30" : "border-slate-100 hover:border-blue-200"}`}
              >
                <summary
                  className={`flex items-center justify-between gap-4 p-6 cursor-pointer list-none select-none font-medium transition-colors ${T.text}`}
                >
                  {item.q}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all group-open:rotate-180 ${dark ? "bg-white/8" : "bg-slate-100"}`}
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-colors ${T.sub}`}
                    />
                  </div>
                </summary>
                <div
                  className={`px-6 pb-6 border-t transition-colors ${T.border}`}
                >
                  <p
                    className={`text-sm leading-relaxed pt-4 transition-colors ${T.sub}`}
                  >
                    {item.a}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-slate-950 py-36 px-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(37,99,235,0.15) 0%, transparent 65%)",
          }}
        />
        <div className="max-w-3xl mx-auto text-center relative">
          <h2
            className="text-white text-[clamp(2.5rem,6.5vw,4.5rem)] leading-[1.04] tracking-tight mb-6"
            style={{ fontWeight: 300 }}
          >
            Bisnis Anda layak dikelola
            <br />
            <span className="text-blue-400">dengan lebih baik.</span>
          </h2>
          <p
            className="text-white/40 text-lg mb-10 max-w-md mx-auto leading-relaxed"
            style={{ fontWeight: 300 }}
          >
            Daftar sekarang dan tim kami
            <br />
            siap membantu proses onboarding Anda.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-10 py-4 rounded-full transition-all text-base shadow-xl shadow-blue-600/30"
            >
              Daftar Sekarang <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto flex items-center justify-center border border-white/20 hover:border-white/40 text-white/60 hover:text-white font-medium px-8 py-4 rounded-full transition-all text-base"
            >
              Sudah punya akun? Masuk
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 mt-8">
            {[
              "Web & Mobile app",
              "Onboarding dibantu tim kami",
              "Support langsung via WhatsApp",
            ].map((t) => (
              <span
                key={t}
                className="flex items-center gap-1.5 text-xs text-white/25"
              >
                <CheckCircle className="w-3.5 h-3.5 text-blue-400" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-slate-950 border-t border-white/6 py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-12">
            <div className="max-w-xs">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-white font-bold">Pantau</span>
              </div>
              <p className="text-sm text-white/25 leading-relaxed">
                Platform operasional all-in-one untuk UMKM F&B dan Retail
                Indonesia. POS, stok, opname, transfer — satu dashboard.
              </p>
            </div>
            <div className="flex gap-12 sm:gap-16 text-sm">
              <div>
                <div className="text-white/40 font-semibold mb-4 text-xs uppercase tracking-wider">
                  Produk
                </div>
                <ul className="space-y-3 text-white/25">
                  {[
                    ["#fitur", "Fitur"],
                    ["#harga", "Harga"],
                    ["#cara-kerja", "Cara Kerja"],
                    ["#faq", "FAQ"],
                  ].map(([h, l]) => (
                    <li key={h}>
                      <a
                        href={h}
                        className="hover:text-white transition-colors"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-white/40 font-semibold mb-4 text-xs uppercase tracking-wider">
                  Perusahaan
                </div>
                <ul className="space-y-3 text-white/25">
                  {[
                    "Tentang Kami",
                    "Hubungi Kami",
                    "Kebijakan Privasi",
                    "Syarat & Ketentuan",
                  ].map((l) => (
                    <li key={l}>
                      <a
                        href="#"
                        className="hover:text-white transition-colors"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/15">
            <span>© 2025 Pantau. Hak cipta dilindungi.</span>
            <span>Dibuat untuk UMKM Indonesia</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
