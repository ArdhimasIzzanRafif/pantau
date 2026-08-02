import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "Rp 0"
  const num = typeof amount === "string" ? parseFloat(amount) : amount
  if (isNaN(num)) return "Rp 0"
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return "0"
  const n = typeof num === "string" ? parseFloat(num) : num
  if (isNaN(n)) return "0"
  return new Intl.NumberFormat("id-ID").format(n)
}

export function getRoleName(role: string): string {
  const map: Record<string, string> = {
    OWNER: "Owner",
    ADMIN_GUDANG: "Admin Gudang",
    SUPERVISOR: "Supervisor",
    EMPLOYEE: "Karyawan",
  }
  return map[role] ?? role
}

export function getRoleColor(role: string): string {
  const map: Record<string, string> = {
    OWNER: "bg-purple-100 text-purple-700",
    ADMIN_GUDANG: "bg-blue-100 text-blue-700",
    SUPERVISOR: "bg-green-100 text-green-700",
    EMPLOYEE: "bg-gray-100 text-gray-700",
  }
  return map[role] ?? "bg-gray-100 text-gray-700"
}
