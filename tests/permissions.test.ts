import assert from "node:assert/strict"
import test from "node:test"
import {
  areOrgPermissionsEqual, featureForDashboardPath, getEffectivePermissions,
  normalizeOrgPermissions, ROLE_FEATURES,
} from "../src/lib/permissions"

test("Stok per Lokasi selalu hanya memberi akses lihat", () => {
  const normalized = normalizeOrgPermissions({
    ADMIN_GUDANG: { STOCK_LOCATION: "EDIT", TRANSFER: "EDIT" },
  })
  assert.equal(normalized.ADMIN_GUDANG?.STOCK_LOCATION, "VIEW")
  assert.equal(normalized.ADMIN_GUDANG?.TRANSFER, "EDIT")
  assert.equal(getEffectivePermissions("ADMIN_GUDANG", normalized).STOCK_LOCATION, "VIEW")
  assert.equal(getEffectivePermissions("OWNER", null).STOCK_LOCATION, "VIEW")
})

test("fitur bawaan yang dimatikan tidak muncul kembali", () => {
  const configured = normalizeOrgPermissions({ ADMIN_GUDANG: { GOODS_RECEIPT: "EDIT" } })
  const effective = getEffectivePermissions("ADMIN_GUDANG", configured)
  assert.equal(effective.GOODS_RECEIPT, "EDIT")
  assert.equal(effective.STOCK_LOCATION, undefined)
  assert.equal(effective.TRANSFER, undefined)
  assert.equal(getEffectivePermissions("ADMIN_GUDANG", null).STOCK_LOCATION, "VIEW")
})

test("nilai izin tak dikenal tidak tersimpan", () => {
  assert.deepEqual(normalizeOrgPermissions({
    ADMIN_GUDANG: { STOCK_LOCATION: "DELETE", MASTER_MENU: "EDIT", UNKNOWN: "EDIT" },
  }), { ADMIN_GUDANG: { MASTER_MENU: "EDIT" } })
})

test("Supplier aktif untuk pengelola operasional, tetapi tidak untuk Kasir", () => {
  assert.equal(getEffectivePermissions("ADMIN_GUDANG", null).SUPPLIERS, "EDIT")
  assert.equal(getEffectivePermissions("SUPERVISOR", null).SUPPLIERS, "EDIT")
  assert.equal(getEffectivePermissions("KASIR", null).SUPPLIERS, undefined)
  assert.equal(getEffectivePermissions("OWNER", null).SUPPLIERS, "EDIT")
})

test("default Admin Gudang berisi tujuh fitur operasional gudang", () => {
  assert.deepEqual(getEffectivePermissions("ADMIN_GUDANG", null), {
    SUPPLIERS: "EDIT",
    STOCK_LOCATION: "VIEW",
    TRANSFER: "EDIT",
    GOODS_RECEIPT: "EDIT",
    OPNAME: "EDIT",
    ALERTS: "VIEW",
    HISTORY: "VIEW",
  })
  // Master Inventori, Master Menu, dan Waste & Penyesuaian tetap bisa
  // dinyalakan Owner dari Manajemen — hanya bawaannya yang mati.
  assert.equal(ROLE_FEATURES.ADMIN_GUDANG.length, 10)
})

test("akses Supplier dapat diatur per role", () => {
  const configured = normalizeOrgPermissions({
    ADMIN_GUDANG: { SUPPLIERS: "EDIT" },
    SUPERVISOR: { SUPPLIERS: "VIEW" },
    KASIR: { SUPPLIERS: "VIEW" },
  })
  assert.equal(getEffectivePermissions("ADMIN_GUDANG", configured).SUPPLIERS, "EDIT")
  assert.equal(getEffectivePermissions("SUPERVISOR", configured).SUPPLIERS, "VIEW")
  assert.equal(getEffectivePermissions("KASIR", configured).SUPPLIERS, undefined)
})

test("default Supervisor berisi sembilan fitur yang siap dipakai", () => {
  assert.deepEqual(ROLE_FEATURES.SUPERVISOR, [
    "MASTER_INVENTORY", "MASTER_MENU", "SUPPLIERS", "STOCK_LOCATION", "TRANSFER", "GOODS_RECEIPT",
    "OPNAME", "ALERTS", "HISTORY",
  ])
  assert.deepEqual(getEffectivePermissions("SUPERVISOR", null), {
    MASTER_INVENTORY: "EDIT",
    MASTER_MENU: "EDIT",
    SUPPLIERS: "EDIT",
    STOCK_LOCATION: "VIEW",
    TRANSFER: "EDIT",
    GOODS_RECEIPT: "EDIT",
    OPNAME: "EDIT",
    ALERTS: "VIEW",
    HISTORY: "VIEW",
  })
  assert.equal(featureForDashboardPath("/dashboard/inventory"), "MASTER_INVENTORY")
  assert.equal(featureForDashboardPath("/dashboard/menu/modifiers"), "MASTER_MENU")
  assert.equal(featureForDashboardPath("/dashboard/stock-card"), "STOCK_LOCATION")
  assert.equal(featureForDashboardPath("/dashboard/audit"), "HISTORY")
  // Detail riwayat juga dipakai tautan dari Peringatan dan modul operasional.
  assert.equal(featureForDashboardPath("/dashboard/audit/opname/contoh"), null)
})

test("Riwayat selalu hanya memberi akses lihat", () => {
  const configured = normalizeOrgPermissions({ SUPERVISOR: { HISTORY: "EDIT" } })
  assert.equal(configured.SUPERVISOR?.HISTORY, "VIEW")
  assert.equal(getEffectivePermissions("OWNER", null).HISTORY, "VIEW")
})

test("Kasir tidak mendapat fitur backoffice karena hanya memakai POS", () => {
  assert.deepEqual(ROLE_FEATURES.KASIR, [])
  assert.deepEqual(getEffectivePermissions("KASIR", null), {})
  assert.deepEqual(normalizeOrgPermissions({ KASIR: { SUPPLIERS: "EDIT" } }), { KASIR: {} })
})

test("draft izin yang dibatalkan kembali sama dengan nilai tersimpan", () => {
  const saved = { SUPERVISOR: { MASTER_INVENTORY: "EDIT" as const, OPNAME: "EDIT" as const } }
  const disabled = { SUPERVISOR: { OPNAME: "EDIT" as const } }
  const restored = { SUPERVISOR: { OPNAME: "EDIT" as const, MASTER_INVENTORY: "EDIT" as const } }

  assert.equal(areOrgPermissionsEqual(saved, disabled), false)
  assert.equal(areOrgPermissionsEqual(saved, restored), true)
  assert.equal(getEffectivePermissions("SUPERVISOR", saved).MASTER_INVENTORY, "EDIT")
})
