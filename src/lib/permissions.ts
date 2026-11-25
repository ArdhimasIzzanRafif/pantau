export type AccessLevel = "VIEW" | "EDIT"
export type FeatureKey =
  | "MASTER_INVENTORY" | "MASTER_MENU" | "SUPPLIERS" | "STOCK_LOCATION"
  | "TRANSFER" | "GOODS_RECEIPT" | "OPNAME" | "ADJUSTMENTS" | "ALERTS" | "HISTORY"

export type RoleKey = "ADMIN_GUDANG" | "SUPERVISOR" | "KASIR"
export type RolePermissions = Partial<Record<FeatureKey, AccessLevel>>
export type OrgPermissions = Partial<Record<RoleKey, RolePermissions>>

export const FEATURES: Record<FeatureKey, { label: string; href: string; description: string; viewOnly?: boolean }> = {
  MASTER_INVENTORY: { label: "Master Inventori", href: "/dashboard/inventory",     description: "Kelola daftar bahan baku & produk" },
  MASTER_MENU:      { label: "Master Menu",       href: "/dashboard/menu",          description: "Kelola menu & resep" },
  SUPPLIERS:        { label: "Supplier",          href: "/dashboard/suppliers",     description: "Lihat dan kelola data pemasok" },
  STOCK_LOCATION:   { label: "Stok per Lokasi",   href: "/dashboard/stok",          description: "Saldo stok berubah lewat transaksi, transfer, dan opname", viewOnly: true },
  TRANSFER:         { label: "Transfer Barang",    href: "/dashboard/transfer",      description: "Pindah stok antar gudang & outlet" },
  GOODS_RECEIPT:    { label: "Barang Masuk",       href: "/dashboard/goods-receipt", description: "Catat penerimaan barang dari supplier" },
  OPNAME:           { label: "Opname Fisik",       href: "/dashboard/opname",        description: "Hitung & sesuaikan stok fisik" },
  ADJUSTMENTS:      { label: "Waste & Penyesuaian",href: "/dashboard/adjustments",   description: "Catat stok rusak, hilang, complimentary, dan kedaluwarsa" },
  ALERTS:           { label: "Peringatan",         href: "/dashboard/alerts",        description: "Stok menipis/habis dan notifikasi operasional" },
  HISTORY:          { label: "Riwayat",            href: "/dashboard/audit",         description: "Lihat riwayat sesuai lokasi tanggung jawab", viewOnly: true },
}

export const ROLE_FEATURES: Record<RoleKey, readonly FeatureKey[]> = {
  ADMIN_GUDANG: Object.keys(FEATURES) as FeatureKey[],
  SUPERVISOR: ["MASTER_INVENTORY", "MASTER_MENU", "SUPPLIERS", "STOCK_LOCATION", "TRANSFER", "GOODS_RECEIPT", "OPNAME", "ALERTS", "HISTORY"],
  // Kasir bekerja khusus dari POS, jadi tidak memiliki menu backoffice yang
  // perlu diatur pada halaman Akses Fitur per Role.
  KASIR: [],
}

export function featureForDashboardPath(pathname: string): FeatureKey | null {
  if (pathname === "/dashboard/stock-card" || pathname.startsWith("/dashboard/stock-card/")) {
    return "STOCK_LOCATION"
  }
  for (const [key, feature] of Object.entries(FEATURES) as [FeatureKey, typeof FEATURES[FeatureKey]][]) {
    // Halaman daftar riwayat mengikuti izin HISTORY. Halaman rinciannya juga
    // dipakai dari Peringatan dan modul operasional, sehingga dijaga oleh API
    // sumber datanya masing-masing.
    if (key === "HISTORY" && pathname !== feature.href) continue
    if (pathname === feature.href || pathname.startsWith(`${feature.href}/`)) return key
  }
  return null
}

export function isViewOnlyFeature(feature: FeatureKey) {
  return FEATURES[feature].viewOnly === true
}

/** Abaikan nilai izin tidak dikenal dan paksa fitur tanpa aksi tulis menjadi VIEW. */
export function normalizeOrgPermissions(value: unknown): OrgPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const result: OrgPermissions = {}
  for (const role of ["ADMIN_GUDANG", "SUPERVISOR", "KASIR"] as const) {
    const raw = input[role]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const roleInput = raw as Record<string, unknown>
    const permissions: RolePermissions = {}
    for (const feature of ROLE_FEATURES[role]) {
      const level = roleInput[feature]
      if (level === "VIEW" || level === "EDIT") {
        permissions[feature] = isViewOnlyFeature(feature) ? "VIEW" : level
      }
    }
    result[role] = permissions
  }
  return result
}

export function areOrgPermissionsEqual(a: OrgPermissions, b: OrgPermissions): boolean {
  const left = normalizeOrgPermissions(a)
  const right = normalizeOrgPermissions(b)
  return (["ADMIN_GUDANG", "SUPERVISOR", "KASIR"] as const).every((role) =>
    (Object.keys(FEATURES) as FeatureKey[]).every((feature) =>
      left[role]?.[feature] === right[role]?.[feature]
    )
  )
}

export const ROLE_DEFAULTS: Record<RoleKey, RolePermissions> = {
  ADMIN_GUDANG: {
    SUPPLIERS:        "EDIT",
    STOCK_LOCATION:   "VIEW",
    TRANSFER:         "EDIT",
    GOODS_RECEIPT:    "EDIT",
    OPNAME:           "EDIT",
    ALERTS:           "VIEW",
    HISTORY:          "VIEW",
  },
  SUPERVISOR: {
    MASTER_INVENTORY: "EDIT",
    MASTER_MENU:      "EDIT",
    SUPPLIERS:        "EDIT",
    STOCK_LOCATION:   "VIEW",
    TRANSFER:         "EDIT",
    GOODS_RECEIPT:    "EDIT",
    OPNAME:           "EDIT",
    ALERTS:           "VIEW",
    HISTORY:          "VIEW",
  },
  KASIR: {},
}

export function getEffectivePermissions(
  role: string,
  orgPermissions: OrgPermissions | null | undefined
): RolePermissions {
  if (role === "OWNER") {
    return Object.fromEntries(
      (Object.keys(FEATURES) as FeatureKey[]).map((k) => [k, isViewOnlyFeature(k) ? "VIEW" : "EDIT"])
    ) as RolePermissions
  }
  if (!["ADMIN_GUDANG", "SUPERVISOR", "KASIR"].includes(role)) return {}
  const roleKey = role as RoleKey
  const configured = normalizeOrgPermissions(orgPermissions)?.[roleKey]
  // Transfer untuk Supervisor kini mengikuti pengaturan seperti fitur lain;
  // nilai bawaannya tetap EDIT lewat ROLE_DEFAULTS.
  return { ...(configured ?? ROLE_DEFAULTS[roleKey]) }
}
