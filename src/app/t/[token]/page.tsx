import { getPublicMenu } from "@/lib/public-menu"
import TableMenuContent from "./table-menu-client"

export default async function TableMenuPage({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ meja?: string | string[] }>
}) {
  const [{ token }, query] = await Promise.all([params, searchParams])
  const mejaToken = typeof query.meja === "string" ? query.meja : ""
  let initialData = null
  let initialError: string | null = null
  try {
    initialData = await getPublicMenu(token, mejaToken)
    if (!initialData) initialError = "Outlet tidak ditemukan. Coba scan ulang QR yang ada di meja."
  } catch {
    initialError = "Menu belum berhasil dimuat. Silakan coba lagi."
  }

  return <TableMenuContent key={`${token}:${mejaToken}`} token={token} mejaToken={mejaToken} initialData={initialData} initialError={initialError} />
}
