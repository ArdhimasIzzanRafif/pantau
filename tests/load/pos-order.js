/**
 * k6 Load Test — Pantau POS
 *
 * Install k6: https://k6.io/docs/getting-started/installation/
 *   brew install k6
 *
 * Set environment before running:
 *   export BASE_URL=http://localhost:3000
 *   export SESSION_COOKIE="authjs.session-token=YOUR_COOKIE_HERE"
 *
 * Run stages:
 *   Smoke (sanity):   k6 run --env STAGE=smoke   tests/load/pos-order.js
 *   Load  (normal):   k6 run --env STAGE=load    tests/load/pos-order.js
 *   Stress (puncak):  k6 run --env STAGE=stress  tests/load/pos-order.js
 *
 * Cara dapat SESSION_COOKIE:
 *   1. Buka browser, login ke app
 *   2. DevTools → Application → Cookies → salin nilai authjs.session-token
 */

import http from "k6/http"
import { check, sleep } from "k6"
import { Rate, Trend } from "k6/metrics"

const BASE_URL      = __ENV.BASE_URL      || "http://localhost:3000"
const SESSION_COOKIE = __ENV.SESSION_COOKIE || ""

// Custom metrics
const errorRate     = new Rate("errors")
const orderDuration = new Trend("order_create_duration", true)
const dashDuration  = new Trend("dashboard_load_duration", true)

// Scenario presets
const STAGES = {
  smoke: [
    { duration: "30s", target: 2 },
    { duration: "30s", target: 0 },
  ],
  load: [
    { duration: "1m",  target: 10 },   // ramp up ke 10 user
    { duration: "3m",  target: 10 },   // tahan 3 menit
    { duration: "30s", target: 0 },    // ramp down
  ],
  stress: [
    { duration: "1m",  target: 20 },
    { duration: "2m",  target: 50 },   // 50 concurrent users
    { duration: "2m",  target: 50 },
    { duration: "1m",  target: 0 },
  ],
}

export const options = {
  stages: STAGES[__ENV.STAGE] || STAGES.smoke,

  thresholds: {
    // 95% request harus selesai di bawah 2 detik
    "http_req_duration": ["p(95)<2000"],
    // Error rate harus di bawah 1%
    "errors":            ["rate<0.01"],
    // Order creation harus di bawah 3 detik
    "order_create_duration": ["p(95)<3000"],
  },
}

const headers = {
  "Content-Type": "application/json",
  "Cookie":       SESSION_COOKIE,
}

// Data produk contoh — ganti dengan ID produk yang ada di DB kamu
// Cara: buka /api/menu, lihat id dari response
const SAMPLE_PRODUCTS = [
  { id: "MENU_ID_1", name: "Burger", price: 35000 },
  { id: "MENU_ID_2", name: "Fries",  price: 15000 },
  { id: "MENU_ID_3", name: "Cola",   price: 10000 },
]

const SAMPLE_LOCATION_ID = "LOC_ID_1" // ganti dengan locationId dari /api/locations
const SAMPLE_SHIFT_ID    = "SHIFT_ID" // ganti dengan shiftId aktif

export default function () {
  const scenario = Math.random()

  if (scenario < 0.4) {
    // 40% — buka halaman dashboard
    const start = Date.now()
    const res = http.get(`${BASE_URL}/api/dashboard/summary`, { headers })
    dashDuration.add(Date.now() - start)
    const ok = check(res, { "dashboard 200": (r) => r.status === 200 })
    errorRate.add(!ok)

  } else if (scenario < 0.7) {
    // 30% — ambil menu (kasir buka POS)
    const res = http.get(`${BASE_URL}/api/menu?active=true`, { headers })
    check(res, { "menu 200": (r) => r.status === 200 })
    errorRate.add(res.status !== 200)

  } else if (scenario < 0.9) {
    // 20% — buat order baru (operasi paling berat)
    const items = SAMPLE_PRODUCTS.slice(0, Math.floor(Math.random() * 3) + 1)
    const total = items.reduce((s, i) => s + i.price, 0)

    const payload = JSON.stringify({
      locationId:   SAMPLE_LOCATION_ID,
      shiftId:      SAMPLE_SHIFT_ID,
      orderType:    "DINE_IN",
      items:        items.map((p) => ({ menuItemId: p.id, name: p.name, price: p.price, qty: 1 })),
      subtotal:     total,
      total,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      payments:     [{ method: "CASH", amount: total, change: 0 }],
    })

    const start = Date.now()
    const res = http.post(`${BASE_URL}/api/pos/orders`, payload, { headers })
    orderDuration.add(Date.now() - start)
    const ok = check(res, { "order created 201": (r) => r.status === 201 })
    errorRate.add(!ok)

  } else {
    // 10% — cek stok
    const res = http.get(`${BASE_URL}/api/stock-balances`, { headers })
    check(res, { "stock 200": (r) => r.status === 200 })
    errorRate.add(res.status !== 200)
  }

  sleep(Math.random() * 2 + 0.5) // pause 0.5–2.5 detik antar request
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"]
  const errRate = data.metrics.errors?.values?.rate * 100

  return {
    stdout: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 HASIL LOAD TEST PANTAU
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total request  : ${data.metrics.http_reqs?.values?.count ?? 0}
Error rate     : ${errRate?.toFixed(2) ?? 0}%
Latency p95    : ${p95?.toFixed(0) ?? 0} ms

Order creation p95 : ${data.metrics.order_create_duration?.values?.["p(95)"]?.toFixed(0) ?? 0} ms
Dashboard p95      : ${data.metrics.dashboard_load_duration?.values?.["p(95)"]?.toFixed(0) ?? 0} ms

${(errRate ?? 0) < 1 && (p95 ?? 9999) < 2000 ? "✅ LULUS threshold" : "❌ GAGAL threshold — lihat detail di atas"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`,
  }
}
