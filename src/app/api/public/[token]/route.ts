import { NextRequest } from "next/server"
import { ok, err } from "@/lib/api-helpers"
import { getPublicMenu } from "@/lib/public-menu"

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const menu = await getPublicMenu(token, req.nextUrl.searchParams.get("meja"))
  return menu ? ok(menu) : err("Outlet tidak ditemukan", 404)
}
