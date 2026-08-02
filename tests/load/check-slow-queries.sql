-- ========================================================
-- Pantau DB Health Check — jalankan di psql atau pgAdmin
-- setelah seed-load selesai dan load test berjalan
-- ========================================================

-- 1. Cek index usage — index yang tidak pernah dipakai
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan   AS "kali dipakai",
  idx_tup_read AS "baris dibaca"
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND tablename NOT LIKE 'pg_%'
ORDER BY tablename;

-- 2. Cek 10 query paling lambat (butuh pg_stat_statements extension)
-- Aktifkan dulu di postgres: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT
  LEFT(query, 120)        AS query,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS avg_ms,
  ROUND(total_exec_time::numeric, 2) AS total_ms
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 3. EXPLAIN ANALYZE query paling kritis — ambil order per shift
-- Ganti 'SHIFT_ID_CONTOH' dengan shift ID yang ada di DB kamu
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.id, o.total, o.createdAt, o.status
FROM "POSOrder" o
WHERE o."shiftId" = 'SHIFT_ID_CONTOH'
ORDER BY o."createdAt" DESC;

-- 4. Ukuran tabel — tabel terbesar
SELECT
  relname                                    AS tabel,
  pg_size_pretty(pg_relation_size(oid))      AS ukuran,
  pg_size_pretty(pg_indexes_size(oid))       AS ukuran_index,
  n_live_tup                                 AS baris_aktif
FROM pg_stat_user_tables
ORDER BY pg_relation_size(oid) DESC
LIMIT 10;

-- 5. Koneksi aktif
SELECT
  COUNT(*)            AS total_koneksi,
  state,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type, wait_event
ORDER BY total_koneksi DESC;
