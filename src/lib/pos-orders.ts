import type { Prisma } from "@prisma/client"
import Decimal from "decimal.js-light"
import { consumeStock, addStock, StockError } from "@/lib/stock-ledger"
import { getDiscountScheduleStatus } from "@/lib/discount-schedule"
import { posStockMovementNote } from "@/lib/stock-movement-presentation"

type Tx = Prisma.TransactionClient

export type RawModifier = { optionId?: unknown }
export type RawOrderItem = {
  menuItemId?: unknown
  qty?: unknown
  notes?: unknown
  discount?: unknown
  modifiers?: unknown
}

export type PricedModifier = {
  optionId: string
  groupId: string
  groupName: string
  optionName: string
  price: number
}

export type PricedOrderItem = {
  menuItemId: string
  name: string
  basePrice: number
  unitPrice: number
  qty: number
  discount: number
  subtotal: number
  notes: string | null
  modifiers: PricedModifier[]
}

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderValidationError"
  }
}

export async function priceOrderItems(
  tx: Tx,
  organizationId: string,
  rawItems: unknown,
  options: { qrOnly?: boolean; allowItemDiscount?: boolean } = {},
) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new OrderValidationError("Pesanan harus memiliki item")
  }
  if (rawItems.length > 100) throw new OrderValidationError("Terlalu banyak item dalam satu pesanan")

  const parsed = rawItems.map((raw) => {
    const item = raw as RawOrderItem
    const menuItemId = typeof item.menuItemId === "string" ? item.menuItemId : ""
    const qty = Number(item.qty)
    if (!menuItemId || !Number.isInteger(qty) || qty <= 0 || qty > 999) {
      throw new OrderValidationError("Item atau jumlah pesanan tidak valid")
    }
    const modifiers = Array.isArray(item.modifiers) ? item.modifiers as RawModifier[] : []
    return { ...item, menuItemId, qty, modifiers }
  })

  const ids = [...new Set(parsed.map((item) => item.menuItemId))]
  const menuItems = await tx.inventoryItem.findMany({
    where: { id: { in: ids }, organizationId, isMenuItem: true },
    include: {
      modifierGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          group: {
            include: { options: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  })
  if (menuItems.length !== ids.length) throw new OrderValidationError("Ada menu yang tidak ditemukan")
  const menuMap = new Map(menuItems.map((item) => [item.id, item]))

  const priced: PricedOrderItem[] = []
  for (const raw of parsed) {
    const menu = menuMap.get(raw.menuItemId)
    if (!menu || !menu.isActive || (options.qrOnly && !menu.isAvailableForQr)) {
      throw new OrderValidationError(`Menu ${menu?.name ?? raw.menuItemId} sedang tidak tersedia`)
    }

    const selectedIds = raw.modifiers.map((modifier) =>
      typeof modifier.optionId === "string" ? modifier.optionId : ""
    )
    if (selectedIds.some((id) => !id) || new Set(selectedIds).size !== selectedIds.length) {
      throw new OrderValidationError(`Pilihan modifier untuk ${menu.name} tidak valid`)
    }

    const selected: PricedModifier[] = []
    for (const assignment of menu.modifierGroups) {
      const group = assignment.group
      const chosen = group.options.filter((option) => selectedIds.includes(option.id))
      if (group.isRequired && chosen.length === 0) {
        throw new OrderValidationError(`Modifier ${group.name} wajib dipilih untuk ${menu.name}`)
      }
      if (chosen.length > group.maxSelect) {
        throw new OrderValidationError(`Pilihan ${group.name} melebihi batas untuk ${menu.name}`)
      }
      selected.push(...chosen.map((option) => ({
        optionId: option.id,
        groupId: group.id,
        groupName: group.name,
        optionName: option.name,
        price: Number(option.price),
      })))
    }
    if (selected.length !== selectedIds.length) {
      throw new OrderValidationError(`Ada modifier yang bukan milik menu ${menu.name}`)
    }

    const basePrice = Number(menu.sellPrice ?? 0)
    if (basePrice < 0) throw new OrderValidationError(`Harga ${menu.name} tidak valid`)
    const modifierTotal = selected.reduce((sum, modifier) => sum + modifier.price, 0)
    const lineGross = (basePrice + modifierTotal) * raw.qty
    const requestedDiscount = Number(raw.discount ?? 0)
    const discount = options.allowItemDiscount && Number.isFinite(requestedDiscount)
      ? Math.min(Math.max(0, requestedDiscount), lineGross)
      : 0
    const notes = typeof raw.notes === "string" && raw.notes.trim()
      ? raw.notes.trim().slice(0, 500)
      : null

    priced.push({
      menuItemId: menu.id,
      name: menu.name,
      basePrice,
      unitPrice: basePrice + modifierTotal,
      qty: raw.qty,
      discount,
      subtotal: lineGross - discount,
      notes,
      modifiers: selected,
    })
  }

  return {
    items: priced,
    subtotal: priced.reduce((sum, item) => sum + item.subtotal, 0),
  }
}

type DiscountInput = {
  discountRuleId?: unknown
  discountType?: unknown
  discountValue?: unknown
  discountLabel?: unknown
}

export async function resolveOrderDiscount(
  tx: Tx,
  organizationId: string,
  locationId: string,
  subtotal: number,
  role: string,
  input: DiscountInput,
  items: PricedOrderItem[] = [],
) {
  const now = new Date()
  const ruleId = typeof input.discountRuleId === "string" ? input.discountRuleId : null

  if (ruleId) {
    const rule = await tx.discountRule.findFirst({
      where: {
        id: ruleId,
        organizationId,
        OR: [
          { locations: { none: {} } },
          { locations: { some: { locationId } } },
        ],
      },
      include: { items: { select: { menuItemId: true } } },
    })
    if (!rule) throw new OrderValidationError("Diskon tidak berlaku di outlet ini")
    const scheduleStatus = getDiscountScheduleStatus(rule, now)
    if (scheduleStatus === "INACTIVE") throw new OrderValidationError("Diskon sudah tidak aktif")
    if (scheduleStatus === "UPCOMING") throw new OrderValidationError("Diskon belum mulai berlaku")
    if (scheduleStatus === "EXPIRED") throw new OrderValidationError("Masa berlaku diskon sudah berakhir")
    if (scheduleStatus !== "ACTIVE") throw new OrderValidationError("Diskon tidak berlaku pada hari atau jam ini")

    // Diskon per-item: hanya berlaku ke subtotal menu yang tercantum di aturan.
    // Aturan tanpa item = berlaku ke seluruh belanja (perilaku lama).
    const scopedItemIds = new Set(rule.items.map((i) => i.menuItemId))
    const base = scopedItemIds.size > 0
      ? items.filter((i) => scopedItemIds.has(i.menuItemId)).reduce((sum, i) => sum + i.subtotal, 0)
      : subtotal
    if (scopedItemIds.size > 0 && base <= 0) {
      throw new OrderValidationError("Menu yang didiskon tidak ada di pesanan")
    }
    if (Number(rule.minPurchase) > base) {
      throw new OrderValidationError(`Minimal pembelian diskon adalah Rp ${Number(rule.minPurchase).toLocaleString("id-ID")}`)
    }

    const type = rule.type === "AMOUNT" ? "AMOUNT" : "PERCENT"
    const value = Number(rule.value)
    const amount = type === "PERCENT" ? Math.round(base * value / 100) : value
    return {
      discountRuleId: rule.id,
      discountType: type,
      discountValue: value,
      discountLabel: rule.name,
      discountAmount: Math.min(base, Math.max(0, amount)),
    }
  }

  const requestedValue = Number(input.discountValue ?? 0)
  if (!Number.isFinite(requestedValue) || requestedValue <= 0) {
    return {
      discountRuleId: null,
      discountType: null,
      discountValue: 0,
      discountLabel: null,
      discountAmount: 0,
    }
  }

  if (!["OWNER", "SUPERVISOR"].includes(role)) {
    throw new OrderValidationError("Diskon manual hanya dapat diberikan owner atau supervisor")
  }
  const type = input.discountType === "AMOUNT" ? "AMOUNT" : input.discountType === "PERCENT" ? "PERCENT" : null
  if (!type) throw new OrderValidationError("Tipe diskon tidak valid")
  if (type === "PERCENT" && requestedValue > 100) {
    throw new OrderValidationError("Diskon persen tidak boleh melebihi 100%")
  }
  const amount = type === "PERCENT" ? Math.round(subtotal * requestedValue / 100) : requestedValue
  const label = typeof input.discountLabel === "string" && input.discountLabel.trim()
    ? input.discountLabel.trim().slice(0, 100)
    : "Diskon manual"

  return {
    discountRuleId: null,
    discountType: type,
    discountValue: requestedValue,
    discountLabel: label,
    discountAmount: Math.min(subtotal, Math.max(0, amount)),
  }
}

export function resolveTaxPercent(value: unknown) {
  const tax = Number(value ?? 0)
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
    throw new OrderValidationError("Persentase pajak tidak valid")
  }
  return tax
}

export async function assertPricedStockAvailable(
  tx: Tx,
  input: { organizationId: string; locationId: string; items: PricedOrderItem[] },
) {
  const menuItemIds = [...new Set(input.items.map((item) => item.menuItemId))]
  const optionIds = [...new Set(input.items.flatMap((item) => item.modifiers.map((modifier) => modifier.optionId)))]
  const [menus, recipes, modifierRecipes] = await Promise.all([
    tx.inventoryItem.findMany({
      where: { id: { in: menuItemIds }, organizationId: input.organizationId },
      select: { id: true, isTrackable: true },
    }),
    tx.recipeItem.findMany({
      where: {
        parentItemId: { in: menuItemIds },
        childItem: { organizationId: input.organizationId, isTrackable: true },
      },
    }),
    tx.modifierRecipeItem.findMany({
      where: {
        optionId: { in: optionIds },
        item: { organizationId: input.organizationId, isTrackable: true },
      },
    }),
  ])
  const menuMap = new Map(menus.map((menu) => [menu.id, menu]))
  const recipesByMenu = new Map<string, typeof recipes>()
  for (const recipe of recipes) recipesByMenu.set(recipe.parentItemId, [...(recipesByMenu.get(recipe.parentItemId) ?? []), recipe])
  const recipesByOption = new Map<string, typeof modifierRecipes>()
  for (const recipe of modifierRecipes) recipesByOption.set(recipe.optionId, [...(recipesByOption.get(recipe.optionId) ?? []), recipe])

  const requirements = new Map<string, number>()
  for (const orderItem of input.items) {
    const baseRecipes = recipesByMenu.get(orderItem.menuItemId) ?? []
    if (baseRecipes.length > 0) {
      for (const recipe of baseRecipes) {
        requirements.set(recipe.childItemId, new Decimal(recipe.quantity.toString()).mul(orderItem.qty).add(requirements.get(recipe.childItemId) ?? 0).toNumber())
      }
    } else if (menuMap.get(orderItem.menuItemId)?.isTrackable) {
      requirements.set(orderItem.menuItemId, (requirements.get(orderItem.menuItemId) ?? 0) + orderItem.qty)
    }
    for (const modifier of orderItem.modifiers) {
      for (const recipe of recipesByOption.get(modifier.optionId) ?? []) {
        requirements.set(recipe.itemId, new Decimal(recipe.quantity.toString()).mul(orderItem.qty).add(requirements.get(recipe.itemId) ?? 0).toNumber())
      }
    }
  }

  if (requirements.size === 0) return
  const balances = await tx.stockBalance.findMany({
    where: { locationId: input.locationId, itemId: { in: [...requirements.keys()] } },
    include: { item: { select: { name: true } } },
  })
  const balanceMap = new Map(balances.map((balance) => [balance.itemId, balance]))
  for (const [itemId, needed] of requirements) {
    const balance = balanceMap.get(itemId)
    const available = Number(balance?.quantity ?? 0)
    if (available < needed) {
      throw new OrderValidationError(`Stok ${balance?.item.name ?? "bahan"} tidak cukup. Tersedia ${available}, dibutuhkan ${needed}.`)
    }
  }
}

export async function deductOrderStock(
  tx: Tx,
  input: {
    organizationId: string
    orderId: string
    orderNumber: string
    locationId: string
    createdById?: string | null
  },
) {
  const orderItems = await tx.pOSOrderItem.findMany({
    where: { orderId: input.orderId },
    include: { modifiers: { select: { optionId: true } } },
  })
  const menuItemIds = [...new Set(orderItems.flatMap((item) => item.menuItemId ? [item.menuItemId] : []))]
  const optionIds = [...new Set(orderItems.flatMap((item) =>
    item.modifiers.flatMap((modifier) => modifier.optionId ? [modifier.optionId] : [])
  ))]

  const [menus, recipes, modifierRecipes] = await Promise.all([
    tx.inventoryItem.findMany({
      where: { id: { in: menuItemIds }, organizationId: input.organizationId },
      select: { id: true, isTrackable: true, costPrice: true },
    }),
    tx.recipeItem.findMany({
      where: {
        parentItemId: { in: menuItemIds },
        childItem: { organizationId: input.organizationId },
      },
      include: { childItem: { select: { isTrackable: true, costPrice: true } } },
    }),
    tx.modifierRecipeItem.findMany({
      where: {
        optionId: { in: optionIds },
        item: { organizationId: input.organizationId },
      },
      include: { item: { select: { isTrackable: true, costPrice: true } } },
    }),
  ])
  const menuMap = new Map(menus.map((menu) => [menu.id, menu]))
  const baseByMenu = new Map<string, typeof recipes>()
  for (const recipe of recipes) {
    const list = baseByMenu.get(recipe.parentItemId) ?? []
    list.push(recipe)
    baseByMenu.set(recipe.parentItemId, list)
  }
  const modifierByOption = new Map<string, typeof modifierRecipes>()
  for (const recipe of modifierRecipes) {
    const list = modifierByOption.get(recipe.optionId) ?? []
    list.push(recipe)
    modifierByOption.set(recipe.optionId, list)
  }

  type Requirement = { quantity: number; isTrackable: boolean; costPrice: number | null; includesModifier: boolean }
  const requirements = new Map<string, Requirement>()
  const addRequirement = (
    itemId: string,
    quantity: number,
    isTrackable: boolean,
    costPrice: Prisma.Decimal | number | null,
    fromModifier = false,
  ) => {
    const existing = requirements.get(itemId)
    requirements.set(itemId, {
      quantity: new Decimal(existing?.quantity ?? 0).add(quantity).toNumber(),
      isTrackable,
      costPrice: costPrice == null ? null : Number(costPrice),
      includesModifier: Boolean(existing?.includesModifier || (fromModifier && quantity > 0)),
    })
  }

  for (const orderItem of orderItems) {
    if (!orderItem.menuItemId) continue
    const baseRecipes = baseByMenu.get(orderItem.menuItemId) ?? []
    if (baseRecipes.length > 0) {
      for (const recipe of baseRecipes) {
        addRequirement(
          recipe.childItemId,
          new Decimal(recipe.quantity.toString()).mul(orderItem.qty).toNumber(),
          recipe.childItem.isTrackable,
          recipe.childItem.costPrice,
        )
      }
    } else {
      const menu = menuMap.get(orderItem.menuItemId)
      if (menu) addRequirement(
        orderItem.menuItemId,
        orderItem.qty,
        menu.isTrackable,
        menu.costPrice,
      )
    }

    for (const modifier of orderItem.modifiers) {
      if (!modifier.optionId) continue
      for (const recipe of modifierByOption.get(modifier.optionId) ?? []) {
        addRequirement(
          recipe.itemId,
          new Decimal(recipe.quantity.toString()).mul(orderItem.qty).toNumber(),
          recipe.item.isTrackable,
          recipe.item.costPrice,
          true,
        )
      }
    }
  }

  let cogsAmount = 0
  let cogsComplete = requirements.size > 0

  for (const [itemId, requirement] of requirements) {
    if (!requirement.isTrackable) {
      if (requirement.costPrice == null) cogsComplete = false
      else cogsAmount += requirement.quantity * requirement.costPrice
      continue
    }

    const consumed = await consumeStock(tx, {
      organizationId: input.organizationId,
      itemId,
      locationId: input.locationId,
      type: "POS_SALE",
      quantity: requirement.quantity,
      note: posStockMovementNote(input.orderNumber, requirement.includesModifier),
      referenceId: input.orderId,
      createdById: input.createdById ?? null,
      // Penjualan tidak boleh gagal hanya karena catatan stok belum sesuai.
      // Kekurangan tetap dibukukan sebagai saldo minus agar terlihat di opname
      // dan dapat ditelusuri owner setelah transaksi selesai.
      allowNegative: true,
      ignoreReservation: true,
    })

    for (const portion of consumed) {
      const unitCost = portion.costPrice ?? requirement.costPrice
      if (unitCost == null) cogsComplete = false
      else cogsAmount += portion.quantity * unitCost
    }
  }

  return {
    amount: Math.round(cogsAmount * 100) / 100,
    complete: cogsComplete,
  }
}

export async function restoreOrderStock(
  tx: Tx,
  input: {
    organizationId: string
    orderId: string
    locationId: string
    createdById?: string | null
    reason?: string | null
  },
) {
  const movements = await tx.stockMovement.findMany({
    where: {
      organizationId: input.organizationId,
      referenceId: input.orderId,
      type: "POS_SALE",
      affectsBalance: true,
      quantity: { lt: 0 },
    },
  })
  if (movements.length === 0) return

  for (const movement of movements) {
    await addStock(tx, {
      organizationId: input.organizationId,
      itemId: movement.itemId,
      locationId: input.locationId,
      type: "POS_SALE",
      quantity: Math.abs(Number(movement.quantity)),
      note: `VOID${input.reason ? `: ${input.reason}` : ""}`,
      referenceId: input.orderId,
      createdById: input.createdById ?? null,
      existingBatchId: movement.batchId,
    })
  }
}

export function asOrderError(error: unknown) {
  if (error instanceof OrderValidationError || error instanceof StockError) return error.message
  return null
}
