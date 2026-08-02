import os from "os"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { isResponse, ok } from "@/lib/api-helpers"

export async function GET() {
  const admin = await requireAdmin()
  if (isResponse(admin)) return admin

  // Memory
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem

  // CPU load (1m, 5m, 15m averages)
  const loadAvg = os.loadavg()
  const cpuCount = os.cpus().length

  // Node process memory
  const procMem = process.memoryUsage()

  // DB size + connections
  const [dbSizeResult, connResult] = await Promise.all([
    prisma.$queryRaw<{ size: bigint }[]>`
      SELECT pg_database_size(current_database()) AS size
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_stat_activity WHERE state = 'active'
    `,
  ])

  // Table row counts
  const tableCounts = await prisma.$queryRaw<{ table_name: string; row_count: bigint }[]>`
    SELECT relname AS table_name, n_live_tup AS row_count
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC
    LIMIT 10
  `

  return ok({
    server: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      hostname: os.hostname(),
    },
    memory: {
      totalMb: Math.round(totalMem / 1024 / 1024),
      usedMb: Math.round(usedMem / 1024 / 1024),
      freeMb: Math.round(freeMem / 1024 / 1024),
      percentUsed: Math.round((usedMem / totalMem) * 100),
      nodeHeapMb: Math.round(procMem.heapUsed / 1024 / 1024),
      nodeHeapTotalMb: Math.round(procMem.heapTotal / 1024 / 1024),
      nodeRssMb: Math.round(procMem.rss / 1024 / 1024),
    },
    cpu: {
      count: cpuCount,
      model: os.cpus()[0]?.model ?? "Unknown",
      load1m: Math.round((loadAvg[0] / cpuCount) * 100),
      load5m: Math.round((loadAvg[1] / cpuCount) * 100),
      load15m: Math.round((loadAvg[2] / cpuCount) * 100),
    },
    database: {
      sizeMb: Math.round(Number(dbSizeResult[0]?.size ?? 0) / 1024 / 1024 * 10) / 10,
      activeConnections: Number(connResult[0]?.count ?? 0),
      tables: tableCounts.map((t) => ({
        name: t.table_name,
        rows: Number(t.row_count),
      })),
    },
  })
}
