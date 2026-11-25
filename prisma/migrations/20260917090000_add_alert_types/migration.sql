-- Jenis peringatan baru untuk pencatatan aktivitas (severity INFO).
-- Aditif: tidak mengubah atau menghapus nilai yang sudah ada.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'GOODS_RECEIVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'OPNAME_COMPLETED';
