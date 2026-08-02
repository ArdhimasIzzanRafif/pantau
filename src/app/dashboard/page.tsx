import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

export default async function DashboardRoot() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role

  if (role === "ADMIN_GUDANG") redirect("/dashboard/goods-receipt")
  if (role === "SUPERVISOR") redirect("/dashboard/opname")
  redirect("/dashboard/owner")
}
