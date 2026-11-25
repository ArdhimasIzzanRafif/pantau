"use client"

import type { RefObject } from "react"
import { ChevronDown } from "lucide-react"
import { Pagination } from "./pagination"

/**
 * Varian pagination untuk daftar yang dipotong di sisi klien dan masih
 * menyediakan tombol "Tampilkan semua". Nomor halamannya memakai `Pagination`
 * yang sama dengan daftar lain, supaya bentuknya tidak berbeda antar halaman.
 */
export function ListPagination({
  label,
  total,
  page,
  showAll,
  pageSize = 5,
  scrollToRef,
  onPageChange,
  onShowAllChange,
  onPageSizeChange,
}: {
  label: string
  total: number
  page: number
  showAll: boolean
  pageSize?: number
  scrollToRef?: RefObject<HTMLElement | null>
  onPageChange: (page: number) => void
  onShowAllChange: (showAll: boolean) => void
  onPageSizeChange?: (pageSize: number) => void
}) {
  if (total <= pageSize && !onPageSizeChange) return null

  const toggle = (
    <button
      type="button"
      onClick={() => onShowAllChange(!showAll)}
      className="ml-1 h-9 shrink-0 whitespace-nowrap rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50"
    >
      {showAll ? "Tampilkan per halaman" : "Lihat Semua"}
    </button>
  )

  const controls = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!showAll && onPageSizeChange && <label className="flex items-center gap-2 text-xs text-slate-500">
        Per halaman
        <span className="relative">
          <select aria-label={`Jumlah ${label} per halaman`} value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-50">
            {[5, 10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </span>
      </label>}
      {toggle}
    </div>
  )

  // Saat "Semua" aktif tidak ada nomor halaman, tapi tombol kembalinya tetap perlu tampil.
  if (showAll || total <= pageSize) {
    return (
      <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-slate-400">Menampilkan {showAll ? "semua " : ""}{total} {label}</p>
        <div className="self-end sm:self-auto">{controls}</div>
      </div>
    )
  }

  return (
    <Pagination
      page={page}
      pages={Math.ceil(total / pageSize)}
      total={total}
      perPage={pageSize}
      label={label}
      scrollToRef={scrollToRef}
      onPageChange={onPageChange}
      trailing={controls}
    />
  )
}
