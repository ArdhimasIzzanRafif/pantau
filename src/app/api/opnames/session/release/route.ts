import { NextRequest } from "next/server"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { getOpnameAccess } from "@/lib/opname-access"
import { releaseOpnameDraft } from "@/lib/opname-session"

// sendBeacon hanya mengirim POST; endpoint ini melepas draft saat tab ditutup.
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (await getOpnameAccess(user) !== "EDIT") return err("Tidak memiliki izin melakukan opname", 403)

  const { draftId } = await req.json() as { draftId?: string }
  if (!draftId) return err("Sesi opname tidak valid")

  return ok({ released: await releaseOpnameDraft(user, draftId) })
}
