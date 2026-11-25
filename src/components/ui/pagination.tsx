"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode, RefObject } from "react"

/**
 * Daftar nomor halaman dengan elipsis: halaman pertama, terakhir, dan tetangga
 * halaman aktif selalu tampil. Contoh untuk 12 halaman di halaman 6:
 * 1 … 5 6 7 … 12
 */
function buildPageList(page: number, pages: number, neighbours: number): (number | "gap")[] {
  // Cukup pendek untuk ditampilkan seluruhnya.
  const maxVisible = neighbours * 2 + 5
  if (pages <= maxVisible) {
    return Array.from({ length: pages }, (_, index) => index + 1)
  }

  const list: (number | "gap")[] = [1]
  const start = Math.max(2, page - neighbours)
  const end = Math.min(pages - 1, page + neighbours)

  if (start > 2) list.push("gap")
  for (let index = start; index <= end; index++) list.push(index)
  if (end < pages - 1) list.push("gap")
  list.push(pages)

  return list
}

export function Pagination({
  page,
  pages,
  total,
  perPage,
  label = "data",
  loading = false,
  scrollToRef,
  trailing,
  onPageChange,
}: {
  page: number
  pages: number
  /** Total baris yang cocok dengan filter — dipakai untuk teks "x–y dari z". */
  total?: number
  perPage?: number
  label?: string
  loading?: boolean
  /** Digulirkan ke atas saat halaman berganti, supaya tidak tertinggal di bawah. */
  scrollToRef?: RefObject<HTMLElement | null>
  /** Kontrol tambahan di ujung bar, mis. tombol "Tampilkan semua". */
  trailing?: ReactNode
  onPageChange: (page: number) => void
}) {
  if (pages <= 1) return null

  function goTo(next: number) {
    if (next < 1 || next > pages || next === page || loading) return
    onPageChange(next)
    scrollToRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const first = perPage ? (page - 1) * perPage + 1 : null
  const last = perPage && total ? Math.min(page * perPage, total) : null

  const arrowClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs text-slate-400">
        {first !== null && last !== null && total !== undefined
          ? <>Menampilkan <span className="font-medium text-slate-600">{first}–{last}</span> dari {total} {label}</>
          : <>Halaman <span className="font-medium text-slate-600">{page}</span> dari {pages}</>}
      </p>

      <div className="flex items-center gap-1.5 self-end sm:self-auto">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page === 1 || loading}
          aria-label="Halaman sebelumnya"
          className={arrowClass}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Di layar sempit hanya halaman aktif dan tetangga terdekat yang muat. */}
        <div className="flex items-center gap-1.5 sm:hidden">
          {buildPageList(page, pages, 0).map((entry, index) =>
            entry === "gap" ? (
              <span key={`gap-${index}`} className="px-0.5 text-xs text-slate-300">…</span>
            ) : (
              <PageButton key={entry} value={entry} active={entry === page} loading={loading} onClick={goTo} />
            ),
          )}
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          {buildPageList(page, pages, 1).map((entry, index) =>
            entry === "gap" ? (
              <span key={`gap-${index}`} className="px-0.5 text-xs text-slate-300">…</span>
            ) : (
              <PageButton key={entry} value={entry} active={entry === page} loading={loading} onClick={goTo} />
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={page === pages || loading}
          aria-label="Halaman berikutnya"
          className={arrowClass}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {trailing}
      </div>
    </div>
  )
}

function PageButton({ value, active, loading, onClick }: {
  value: number
  active: boolean
  loading: boolean
  onClick: (page: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      disabled={loading}
      aria-current={active ? "page" : undefined}
      className={`h-9 min-w-9 shrink-0 rounded-lg px-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        active
          ? "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {value}
    </button>
  )
}
