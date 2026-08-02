export type AccessLevel = "VIEW" | "EDIT"
export type FeatureKey =
  | "MASTER_INVENTORY" | "MASTER_MENU" | "STOCK_LOCATION"
  | "TRANSFER" | "GOODS_RECEIPT" | "OPNAME" | "ALERTS"

export type RoleKey = "ADMIN_GUDANG" | "SUPERVISOR"
export type RolePermissions = Partial<Record<FeatureKey, AccessLevel>>
export type OrgPermissions = Partial<Record<RoleKey, RolePermissions>>

export const FEATURES: Record<FeatureKey, { label: string; href: string; description: string }> = {
  MASTER_INVENTORY: { label: "Master Inventori", href: "/dashboard/inventory",     description: "Kelola daftar bahan baku & produk" },
  MASTER_MENU:      { label: "Master Menu",       href: "/dashboard/menu",          description: "Kelola menu & resep" },
  STOCK_LOCATION:   { label: "Stok per Lokasi",   href: "/dashboard/stok",          description: "Lihat saldo stok di tiap lokasi" },
  TRANSFER:         { label: "Transfer Barang",    href: "/dashboard/transfer",      description: "Pindah stok antar gudang & outlet" },
  GOODS_RECEIPT:    { label: "Barang Masuk",       href: "/dashboard/goods-receipt", description: "Catat penerimaan barang dari supplier" },
  OPNAME:           { label: "Opname Fisik",       href: "/dashboard/opname",        description: "Hitung & sesuaikan stok fisik" },
  ALERTS:           { label: "Peringatan",         href: "/dashboard/alerts",        description: "Stok menipis/habis & notifikasi transfer barang" },
}

export const ROLE_DEFAULTS: Record<RoleKey, RolePermissions> = {
  ADMIN_GUDANG: {
    GOODS_RECEIPT:    "EDIT",
    TRANSFER:         "EDIT",
    STOCK_LOCATION:   "VIEW",
    MASTER_INVENTORY: "VIEW",
    ALERTS:           "VIEW",
  },
  SUPERVISOR: {
    MASTER_MENU:      "VIEW",
    MASTER_INVENTORY: "VIEW",
    STOCK_LOCATION:   "VIEW",
    OPNAME:           "EDIT",
    ALERTS:           "VIEW",
  },
}

export function getEffectivePermissions(
  role: string,
  orgPermissions: OrgPermissions | null | undefined
): RolePermissions {
  if (role === "OWNER") {
    return Object.fromEntries(
      (Object.keys(FEATURES) as FeatureKey[]).map((k) => [k, "EDIT"])
    ) as RolePermissions
  }
  if (role !== "ADMIN_GUDANG" && role !== "SUPERVISOR") return {}
  return orgPermissions?.[role as RoleKey] ?? ROLE_DEFAULTS[role as RoleKey] ?? {}
}
