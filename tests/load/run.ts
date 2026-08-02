/**
 * Pantau Load Test Runner
 * Tidak perlu install apapun — jalankan langsung:
 *
 *   npm run test:load
 *
 * Opsi (env):
 *   USERS=20 DURATION=60 npm run test:load
 */

import "dotenv/config"

const BASE_URL  = (process.env.BASE_URL  || "http://localhost:3000").replace(/\/$/, "")
const USERS     = parseInt(process.env.USERS    || "10")   // concurrent virtual users
const DURATION  = parseInt(process.env.DURATION || "30")   // detik

// Demo credentials dari seed
const EMAIL    = process.env.TEST_EMAIL    || "owner@demo.com"
const PASSWORD = process.env.TEST_PASSWORD || "demo123"

// ── Warna terminal ──────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  blue: "\x1b[34m", cyan: "\x1b[36m", dim: "\x1b[2m",
}

// ── Stats collector ─────────────────────────────────────────────────────────
type StatBucket = { durations: number[]; errors: number; name: string }
const buckets: Record<string, StatBucket> = {}

function record(name: string, ms: number, isError = false) {
  if (!buckets[name]) buckets[name] = { durations: [], errors: 0, name }
  buckets[name].durations.push(ms)
  if (isError) buckets[name].errors++
}

function percentile(arr: number[], p: number) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.ceil((p / 100) * sorted.length) - 1]
}

// ── Login helper ─────────────────────────────────────────────────────────────
async function login(): Promise<string> {
  // Step 1: get CSRF token
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json() as { csrfToken: string }
  const csrfCookie  = csrfRes.headers.get("set-cookie") || ""

  // Step 2: POST credentials
  const body = new URLSearchParams({ email: EMAIL, password: PASSWORD, csrfToken, redirect: "false", json: "true" })
  const signIn = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": csrfCookie,
    },
    body: body.toString(),
    redirect: "manual",
  })

  // Kumpulkan semua cookie dari response
  const rawCookies: string[] = []
  signIn.headers.forEach((val, key) => {
    if (key.toLowerCase() === "set-cookie") rawCookies.push(val)
  })
  if (csrfCookie) rawCookies.push(csrfCookie)

  const sessionCookie = rawCookies
    .flatMap((h) => h.split(",").map((s) => s.trim()))
    .filter((c) => c.startsWith("authjs.session-token") || c.startsWith("__Secure-authjs.session-token"))
    .map((c) => c.split(";")[0])
    .join("; ")

  if (!sessionCookie) throw new Error("Login gagal — cek email/password atau pastikan app berjalan")
  return sessionCookie
}

// ── Discover data nyata dari DB ───────────────────────────────────────────────
async function discoverData(cookie: string) {
  const headers = { Cookie: cookie }

  const [locRes, menuRes] = await Promise.all([
    fetch(`${BASE_URL}/api/locations`, { headers }),
    fetch(`${BASE_URL}/api/menu`,      { headers }),
  ])

  const locations: any[] = locRes.ok ? await locRes.json() : []
  const menus: any[]     = menuRes.ok ? await menuRes.json() : []

  const outlets = locations.filter((l: any) => l.type === "OUTLET")
  const activeMenus = menus.filter((m: any) => m.isActive && Number(m.sellPrice) > 0)

  if (!outlets.length)      throw new Error("Tidak ada outlet — jalankan npm run seed dulu")
  if (!activeMenus.length)  throw new Error("Tidak ada menu aktif — jalankan npm run seed dulu")

  // Cari shift yang sedang OPEN (untuk simulasi kasir)
  const shiftRes = await fetch(`${BASE_URL}/api/pos/shifts?status=OPEN`, { headers })
  const shiftData = shiftRes.ok ? await shiftRes.json() : { items: [] }
  const openShift = shiftData.items?.[0] ?? null

  return { outlets, menus: activeMenus, openShift }
}

// ── Virtual user — satu siklus request ───────────────────────────────────────
async function virtualUser(
  cookie: string,
  data: Awaited<ReturnType<typeof discoverData>>,
  stopAt: number,
  userId: number,
): Promise<void> {
  const headers = { Cookie: cookie, "Content-Type": "application/json" }
  const outlet  = data.outlets[userId % data.outlets.length]
  let   reqCount = 0

  while (Date.now() < stopAt) {
    const roll = Math.random()
    const t0   = performance.now()
    let   ok   = false

    try {
      if (roll < 0.30) {
        // 30% — buka dashboard (query berat, aggregate)
        const res = await fetch(`${BASE_URL}/api/dashboard/stats`, { headers })
        ok = res.ok
        record("GET dashboard", performance.now() - t0, !ok)

      } else if (roll < 0.55) {
        // 25% — ambil menu (kasir buka POS)
        const res = await fetch(`${BASE_URL}/api/menu?active=true`, { headers })
        ok = res.ok
        record("GET menu", performance.now() - t0, !ok)

      } else if (roll < 0.75) {
        // 20% — lihat stok
        const res = await fetch(`${BASE_URL}/api/stock-balances`, { headers })
        ok = res.ok
        record("GET stok", performance.now() - t0, !ok)

      } else if (roll < 0.90 && data.openShift) {
        // 15% — buat order baru (paling berat — tulis ke DB)
        const items = data.menus
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.floor(Math.random() * 3) + 1)
        const total = items.reduce((s: number, i: any) => s + Number(i.sellPrice), 0)

        const res = await fetch(`${BASE_URL}/api/pos/orders`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            locationId:   outlet.id,
            shiftId:      data.openShift.id,
            orderType:    "DINE_IN",
            items:        items.map((i: any) => ({ menuItemId: i.id, name: i.name, price: Number(i.sellPrice ?? 0), qty: 1 })),
            subtotal:     total,
            total,
            discountType:  null,
            discountValue: 0,
            payment:      { method: "CASH", amount: total },
          }),
        })
        ok = res.ok || res.status === 201
        record("POST order", performance.now() - t0, !ok)

      } else {
        // 10% — list transaksi (riwayat audit)
        const res = await fetch(`${BASE_URL}/api/transfers`, { headers })
        ok = res.ok
        record("GET transfers", performance.now() - t0, !ok)
      }

    } catch (e: any) {
      record("network error", performance.now() - t0, true)
    }

    reqCount++
    // Jeda realistis antar request (0.5–2 detik)
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500))
  }
}

// ── Render hasil ─────────────────────────────────────────────────────────────
function printResults(elapsed: number) {
  const all = Object.values(buckets)
  const totalReqs  = all.reduce((s, b) => s + b.durations.length, 0)
  const totalErrors = all.reduce((s, b) => s + b.errors, 0)
  const errorPct   = totalReqs ? (totalErrors / totalReqs * 100).toFixed(1) : "0.0"
  const rps        = (totalReqs / elapsed).toFixed(1)

  console.log(`\n${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`)
  console.log(`${c.bold}  📊 HASIL LOAD TEST PANTAU${c.reset}`)
  console.log(`${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`)
  console.log(`  Users      : ${c.cyan}${USERS} concurrent${c.reset}`)
  console.log(`  Durasi     : ${c.cyan}${DURATION}s${c.reset}`)
  console.log(`  Total req  : ${c.bold}${totalReqs}${c.reset}  (${rps} req/s)`)
  console.log(`  Error rate : ${Number(errorPct) > 1 ? c.red : c.green}${errorPct}%${c.reset}`)
  console.log()

  console.log(`  ${"Endpoint".padEnd(22)} ${"Reqs".padStart(6)}  ${"p50".padStart(7)}  ${"p95".padStart(7)}  ${"p99".padStart(7)}  ${"Err".padStart(5)}`)
  console.log(`  ${"─".repeat(65)}`)

  for (const b of all.sort((a, z) => z.durations.length - a.durations.length)) {
    const p50  = percentile(b.durations, 50)
    const p95  = percentile(b.durations, 95)
    const p99  = percentile(b.durations, 99)
    const slow = p95 > 2000

    const p95str = `${slow ? c.red : c.green}${p95.toFixed(0)}ms${c.reset}`
    console.log(
      `  ${b.name.padEnd(22)} ${String(b.durations.length).padStart(6)}  ${String(p50.toFixed(0)+"ms").padStart(7)}  ${p95str.padStart(7 + (slow ? c.red.length + c.reset.length : c.green.length + c.reset.length))}  ${String(p99.toFixed(0)+"ms").padStart(7)}  ${b.errors > 0 ? c.red : ""}${String(b.errors).padStart(5)}${b.errors > 0 ? c.reset : ""}`
    )
  }

  console.log()

  // Verdict
  const p95All = percentile(all.flatMap((b) => b.durations), 95)
  const passed = p95All < 2000 && Number(errorPct) < 1

  if (passed) {
    console.log(`  ${c.green}${c.bold}✅ LULUS — p95 ${p95All.toFixed(0)}ms, error ${errorPct}%${c.reset}`)
    console.log(`  ${c.dim}Aplikasi aman untuk ${USERS} concurrent users.${c.reset}`)
  } else {
    console.log(`  ${c.red}${c.bold}❌ PERLU PERHATIAN${c.reset}`)
    if (p95All >= 2000) console.log(`  ${c.red}• p95 ${p95All.toFixed(0)}ms — melebihi 2000ms${c.reset}`)
    if (Number(errorPct) >= 1) console.log(`  ${c.red}• Error rate ${errorPct}% — melebihi 1%${c.reset}`)
  }
  console.log(`${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`)
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}🔧 Pantau Load Test${c.reset}  ${c.dim}${USERS} users × ${DURATION}s${c.reset}`)
  console.log(`${c.dim}   Target: ${BASE_URL}${c.reset}\n`)

  // 1. Login
  process.stdout.write("  🔐 Login sebagai demo user...")
  let cookie: string
  try {
    cookie = await login()
    console.log(`  ${c.green}✓${c.reset}`)
  } catch (e: any) {
    console.log(`\n  ${c.red}✗ ${e.message}${c.reset}`)
    console.log(`\n  Pastikan app berjalan: ${c.cyan}npm run dev${c.reset}`)
    process.exit(1)
  }

  // 2. Discover data
  process.stdout.write("  🔍 Cari data dari DB...")
  let data: Awaited<ReturnType<typeof discoverData>>
  try {
    data = await discoverData(cookie)
    console.log(`  ${c.green}✓${c.reset}  (${data.outlets.length} outlet, ${data.menus.length} menu, shift: ${data.openShift ? "ada" : c.yellow + "tidak ada — order test dilewati" + c.reset})`)
  } catch (e: any) {
    console.log(`\n  ${c.red}✗ ${e.message}${c.reset}`)
    process.exit(1)
  }

  // 3. Jalankan virtual users
  const stopAt = Date.now() + DURATION * 1000
  console.log(`\n  🚀 Menjalankan ${c.cyan}${USERS} virtual users${c.reset} selama ${c.cyan}${DURATION} detik${c.reset}...\n`)

  const workers = Array.from({ length: USERS }, (_, i) =>
    virtualUser(cookie, data, stopAt, i).catch((e) => console.error(`Worker ${i} error:`, e.message))
  )

  // Progress bar sederhana
  const tick = setInterval(() => {
    const elapsed = DURATION - Math.ceil((stopAt - Date.now()) / 1000)
    const bar = "█".repeat(Math.floor(elapsed / DURATION * 20)).padEnd(20, "░")
    const total = Object.values(buckets).reduce((s, b) => s + b.durations.length, 0)
    process.stdout.write(`\r  [${bar}] ${elapsed}s / ${DURATION}s  —  ${total} req`)
  }, 500)

  const startedAt = Date.now()
  await Promise.all(workers)
  clearInterval(tick)
  process.stdout.write("\n")

  printResults((Date.now() - startedAt) / 1000)
}

main().catch((e) => { console.error(e); process.exit(1) })
