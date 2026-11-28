import { Prisma } from "@prisma/client"

// Penerimaan dan pembayaran mencatat beberapa tabel secara atomik. Latensi
// database hosting dapat melewati default Prisma 5 detik bahkan untuk satu item.
export const STOCK_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 }

export function isStockTransactionTimeout(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028"
}
