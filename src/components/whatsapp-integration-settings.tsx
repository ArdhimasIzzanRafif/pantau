"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronDown, Copy, KeyRound, Loader2, MessageCircle, RefreshCw, Send, Unplug } from "lucide-react"
import { useConfirm } from "@/components/ui/use-confirm"

type Device = {
  configured: boolean
  connected: boolean
  senderPhone?: string | null
  error?: string | null
  webhookConfigured?: boolean
  webhookConfiguredAt?: string | null
  webhookUrl?: string | null
  messageStatusWebhookUrl?: string | null
}

export function WhatsAppIntegrationSettings() {
  const [device, setDevice] = useState<Device | null>(null)
  const [senderPhone, setSenderPhone] = useState("")
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [testPhone, setTestPhone] = useState("")
  const [testBusy, setTestBusy] = useState(false)
  const [testResult, setTestResult] = useState("")
  const { ask, dialog } = useConfirm()

  useEffect(() => {
    let cancelled = false
    void fetch("/api/whatsapp/integration").then(async (response) => {
      if (!response.ok) throw new Error("Pengaturan WhatsApp belum dapat dimuat")
      const data = await response.json() as Device
      if (!cancelled) {
        setDevice(data)
        setSenderPhone(data.senderPhone ? `+${data.senderPhone}` : "")
      }
    }).catch(() => { if (!cancelled) setError("Pengaturan WhatsApp belum dapat dimuat. Coba periksa koneksi lagi.") })
    return () => { cancelled = true }
  }, [])

  async function update(method: "GET" | "PUT" | "DELETE") {
    setBusy(true)
    setError("")
    setNotice("")
    setTestResult("")
    try {
      const response = await fetch("/api/whatsapp/integration", {
        method,
        ...(method === "PUT" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senderPhone, token }) } : {}),
      })
      const data = await response.json() as Device
      if (!response.ok) throw new Error(data.error || "Pengaturan tidak dapat disimpan")
      setDevice(data)
      if (method !== "GET") setToken("")
      if (data.senderPhone) setSenderPhone(`+${data.senderPhone}`)
      if (method === "DELETE") setSenderPhone("")
      setNotice(method === "PUT"
        ? data.connected ? "WhatsApp bisnis tersimpan dan terhubung. Pesan yang sebelumnya gagal dapat dikirim ulang." : "Token tersimpan. Sambungkan perangkat di Fonnte, lalu klik Periksa koneksi."
        : method === "DELETE" ? "Integrasi WhatsApp bisnis dihapus dari Pantau." : data.connected ? "Perangkat WhatsApp terhubung." : "Perangkat belum terhubung. Periksa perangkat di dashboard Fonnte.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Koneksi gagal")
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setTestBusy(true)
    setTestResult("")
    try {
      const response = await fetch("/api/whatsapp/test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: testPhone }),
      })
      const data = await response.json()
      setTestResult(response.ok ? data.message : `Gagal: ${data.error ?? "Pesan uji belum dapat dikirim"}`)
    } catch {
      setTestResult("Koneksi gagal. Periksa WhatsApp atau riwayat Fonnte sebelum mencoba lagi.")
    } finally {
      setTestBusy(false)
    }
  }

  async function prepareWebhook(rotate = false) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/whatsapp/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: rotate ? "ROTATE" : "SHOW" }),
      })
      const data = await response.json() as Device & { error?: string }
      if (!response.ok || !data.webhookUrl) throw new Error(data.error || "Webhook tidak dapat disiapkan")
      setDevice((current) => ({ ...current, ...data, configured: current?.configured ?? true, connected: current?.connected ?? false }))
      setNotice(rotate
        ? "Kunci webhook diganti. Salin kedua URL baru ke Fonnte; URL lama sudah tidak berlaku."
        : "URL aktif ditampilkan. Salin kedua URL ke Fonnte.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Webhook tidak dapat disiapkan")
    } finally {
      setBusy(false)
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    setNotice(`${label} disalin.`)
  }

  return (
    <section id="whatsapp" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 p-4 sm:px-6 sm:py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><MessageCircle className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Integrasi WhatsApp</h2>
          <p className="mt-1 text-xs text-slate-500">Kirim notifikasi gudang dan pesanan supplier.</p>
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className={`h-2 w-2 shrink-0 rounded-full ${!device ? "animate-pulse bg-slate-300" : device.connected ? "bg-emerald-500" : "bg-amber-500"}`} />
              {!device ? "Memuat status…" : !device.configured ? "Belum diatur" : device.connected ? "Terhubung" : "Belum terhubung"}
            </p>
            <p className="mt-1.5 break-words text-xs text-slate-500">{device?.senderPhone ? `Pengirim +${device.senderPhone}` : "Atur nomor pengirim di bawah ini."}</p>
          </div>
          <button type="button" disabled={busy} onClick={() => void update("GET")} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />Periksa koneksi</button>
        </div>

        {error && <p role="alert" className="break-words rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="break-words rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{notice}</p>}
        {device?.configured && device.error && !error && <p role="status" className="break-words rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">{device.error}</p>}

        <form onSubmit={(event) => { event.preventDefault(); void update("PUT") }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="wa-sender" className="mb-2 block text-sm font-medium text-slate-700">Nomor pengirim</label>
              <input id="wa-sender" type="tel" inputMode="tel" autoComplete="tel" required value={senderPhone} onChange={(event) => setSenderPhone(event.target.value)} placeholder="Contoh: 0812xxxxxxxx" className="h-11 w-full min-w-0 rounded-xl border border-slate-200 px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
            </div>
            <div className="min-w-0">
              <label htmlFor="wa-token" className="mb-2 block text-sm font-medium text-slate-700">Token Fonnte</label>
              <input id="wa-token" type="password" autoComplete="new-password" required maxLength={512} value={token} onChange={(event) => setToken(event.target.value)} aria-describedby="wa-token-help" placeholder={device?.configured ? "Tempel token untuk mengganti koneksi" : "Tempel token perangkat"} className="h-11 w-full min-w-0 rounded-xl border border-slate-200 px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p id="wa-token-help" className="text-xs leading-5 text-slate-400">Token tersimpan terenkripsi dan tidak ditampilkan kembali.</p>
            <button type="submit" disabled={busy || !token.trim() || !senderPhone.trim()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Simpan koneksi</button>
          </div>
        </form>

        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {device?.configured && <details className="group/test">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2.5 text-sm font-medium text-slate-800"><Send className="h-4 w-4 text-slate-400" />Kirim pesan uji</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open/test:rotate-180" />
            </summary>
            <form onSubmit={(event) => { event.preventDefault(); void sendTest() }} className="space-y-3 pb-5">
              <label htmlFor="wa-test-phone" className="block text-xs font-medium text-slate-600">Nomor penerima</label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input id="wa-test-phone" type="tel" inputMode="tel" required value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="Contoh: 0812xxxxxxxx" className="h-11 w-full min-w-0 flex-1 rounded-xl border border-slate-200 px-4 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                <button type="submit" disabled={busy || testBusy || !testPhone.trim()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50">{testBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Kirim pesan</button>
              </div>
              {testResult && <p role="status" className="break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{testResult}</p>}
            </form>
          </details>}

          {device?.configured && <details className="group/webhook">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 [&::-webkit-details-marker]:hidden">
              <span className="flex flex-wrap items-center gap-2.5 text-sm font-medium text-slate-800"><MessageCircle className="h-4 w-4 text-slate-400" />Balasan supplier<span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${device.webhookConfigured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{device.webhookConfigured ? "URL disiapkan" : "Belum diatur"}</span></span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open/webhook:rotate-180" />
            </summary>
            <div className="space-y-4 pb-5">
              <p className="text-xs leading-5 text-slate-500">Hubungkan webhook agar balasan supplier masuk ke Pantau.</p>
              <button type="button" disabled={busy} onClick={() => void prepareWebhook(false)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto"><KeyRound className="h-4 w-4" />{device.webhookConfigured ? "Tampilkan URL webhook" : "Siapkan webhook"}</button>
              {(device.webhookUrl || device.messageStatusWebhookUrl) && <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                {([
                  { id: "wa-webhook-reply", label: "① Webhook", value: device.webhookUrl },
                  { id: "wa-webhook-status", label: "② Webhook Message Status", value: device.messageStatusWebhookUrl },
                ] as const).map(({ id, label, value }) => value && <div key={id}>
                  <label htmlFor={id} className="mb-2 block text-xs font-medium text-slate-600">{label}</label>
                  <div className="flex gap-2">
                    <input id={id} readOnly value={value} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700" />
                    <button type="button" onClick={() => void copy(value, label)} aria-label={`Salin ${label}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:text-blue-600"><Copy className="h-4 w-4" /></button>
                  </div>
                </div>)}
                <p className="text-xs text-slate-500">Tempel masing-masing URL ke kolom dengan nama yang sama di Fonnte.</p>
              </div>}

              <details className="group/guide rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-blue-600 [&::-webkit-details-marker]:hidden">Panduan pengaturan Fonnte<ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open/guide:rotate-180" /></summary>
                <div className="space-y-4 border-t border-slate-100 p-4 text-xs leading-5 text-slate-600">
                  <ol className="list-decimal space-y-2 pl-4">
                    <li>Buka <b>Fonnte → Device → Edit</b> pada nomor pengirim.</li>
                    <li>Ganti seluruh isi <b>Webhook</b> dengan URL ①, dan <b>Webhook Message Status</b> dengan URL ②. Satu URL per kolom.</li>
                    <li>Atur pilihan berikut, lalu simpan.</li>
                  </ol>
                  <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 px-3">
                    {[
                      ["Response Source", "Webhook"],
                      ["Personal · Autoread", "On"],
                      ["Group · Inbox · Forward attachment", "Off"],
                      ["Webhook Connect · Webhook Chaining", "Bawaan Fonnte"],
                      ["Autoreply", "Kosong"],
                    ].map(([label, value]) => <div key={label} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5"><dt className="min-w-0 text-slate-500">{label}</dt><dd className="font-medium text-slate-800">{value}</dd></div>)}
                  </dl>
                  <p>Uji dengan membalas pesanan dari nomor supplier. Balasan hanya memperbarui pesanan; stok bertambah melalui <b>Barang Masuk</b>.</p>
                </div>
              </details>
              {device.webhookConfigured && <details className="group/key">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-medium text-slate-500 [&::-webkit-details-marker]:hidden">Ganti kunci webhook<ChevronDown className="h-3.5 w-3.5 transition group-open/key:rotate-180" /></summary>
                <div className="mt-2 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs leading-5 text-amber-800">Kunci baru membatalkan kedua URL lama. Setelah diganti, perbarui kedua URL di Fonnte.</p>
                  <button type="button" disabled={busy} onClick={() => ask({ title: "Ganti kunci webhook?", message: "Kedua URL lama di Fonnte akan langsung berhenti bekerja. Setelah mengganti kunci, Anda wajib menempelkan kedua URL baru ke Fonnte.", confirmLabel: "Ganti kunci", danger: true, onConfirm: () => prepareWebhook(true) })} className="min-h-10 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50">Ganti kunci</button>
                </div>
              </details>}
            </div>
          </details>}

          <details className="group/help">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">Bantuan pengaturan<ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open/help:rotate-180" /></summary>
            <div className="space-y-4 pb-4 text-xs leading-5 text-slate-500">
              <ol className="list-decimal space-y-2 pl-4">
                <li>Tambahkan nomor pengirim di Fonnte, lalu pindai QR untuk menghubungkan WhatsApp.</li>
                <li>Salin token dari tombol <b>Token</b> perangkat. Tempel di atas, lalu pilih <b>Simpan koneksi</b>.</li>
                <li>Buka <b>Balasan supplier</b> untuk menyiapkan webhook.</li>
              </ol>
              <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
                <Link href="/dashboard/team" className="font-medium text-blue-600 hover:underline">Atur penerima gudang</Link>
                <Link href="/dashboard/suppliers" className="font-medium text-blue-600 hover:underline">Atur nomor supplier</Link>
              </div>
              <p>Pesan yang sebelumnya gagal perlu dikirim ulang dari daftar pesanan.</p>
            </div>
          </details>
        </div>
        {device?.configured && <div className="flex justify-end border-t border-slate-100 pt-3">
          <button type="button" disabled={busy} onClick={() => ask({ title: "Hapus integrasi WhatsApp?", message: "Pesan otomatis bisnis ini akan berhenti dikirim sampai token diatur kembali. Perangkat di Fonnte tidak dihapus.", confirmLabel: "Hapus integrasi", danger: true, onConfirm: () => update("DELETE") })} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"><Unplug className="h-3.5 w-3.5" />Hapus integrasi</button>
        </div>}
      </div>
      {dialog}
    </section>
  )
}
