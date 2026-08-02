import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get("status")
  const locationId = searchParams.get("locationId")
  const from       = searchParams.get("from")
  const to         = searchParams.get("to")

  const transfers = await prisma.stockTransfer.findMany({
    where: {
      organizationId: user.organizationId,
      ...(status && { status: status as any }),
      ...(locationId && {
        OR: [{ fromLocationId: locationId }, { toLocationId: locationId }],
      }),
      ...(from || to ? {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to + "T23:59:59.999Z") }),
        },
      } : {}),
    },
    include: {
      fromLocation: true,
      toLocation: true,
      items: { include: { item: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return ok(transfers)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER" && user.role !== "ADMIN_GUDANG") return err("Tidak diizinkan", 403)

  const { fromLocationId, toLocationId, notes, items } = await req.json()

  if (!fromLocationId || !toLocationId || !items?.length) {
    return err("Lokasi asal, tujuan, dan item wajib diisi")
  }

  const transfer = await prisma.$transaction(async (tx) => {
    const tr = await tx.stockTransfer.create({
      data: {
        organizationId: user.organizationId,
        fromLocationId,
        toLocationId,
        notes,
        status: "SENT",
        sentAt: new Date(),
        createdById: user.id,
        items: {
          create: items.map((i: { itemId: string; quantity: number }) => ({
            itemId: i.itemId,
            quantity: i.quantity,
          })),
        },
      },
      include: { items: true },
    })

    for (const item of items as Array<{ itemId: string; quantity: number }>) {
      await tx.stockBalance.upsert({
        where: { itemId_locationId: { itemId: item.itemId, locationId: fromLocationId } },
        update: { quantity: { decrement: item.quantity } },
        create: {
          organizationId: user.organizationId,
          itemId: item.itemId,
          locationId: fromLocationId,
          quantity: -item.quantity,
        },
      })

      await tx.stockMovement.create({
        data: {
          organizationId: user.organizationId,
          itemId: item.itemId,
          locationId: fromLocationId,
          type: "TRANSFER_OUT",
          quantity: -item.quantity,
          referenceId: tr.id,
          createdById: user.id,
        },
      })

      // Auto low-stock alert if source balance dropped below minimum
      const bal = await tx.stockBalance.findUnique({
        where: { itemId_locationId: { itemId: item.itemId, locationId: fromLocationId } },
        include: { item: true, location: true },
      })
      if (bal && bal.item.minStock) {
        const qty = Number(bal.quantity)
        const min = Number(bal.item.minStock)
        if (qty < min) {
          const existing = await tx.alert.findFirst({
            where: {
              organizationId: user.organizationId,
              type: "LOW_STOCK",
              itemId: item.itemId,
              locationId: fromLocationId,
              isResolved: false,
            },
          })
          if (!existing) {
            await tx.alert.create({
              data: {
                organizationId: user.organizationId,
                type: "LOW_STOCK",
                severity: qty === 0 ? "CRITICAL" : "WARNING",
                title: `Stok ${bal.item.name} Di Bawah Minimum`,
                message: `Stok ${bal.item.name} di ${bal.location.name} saat ini ${qty} unit, di bawah batas minimum ${min} unit. Segera lakukan pengisian stok.`,
                locationId: fromLocationId,
                itemId: item.itemId,
                referenceId: tr.id,
              },
            })
          }
        }
      }
    }

    return tr
  })

  return ok(transfer, 201)
}
