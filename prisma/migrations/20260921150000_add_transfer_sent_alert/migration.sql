-- Persetujuan request transfer sebelumnya tidak menghasilkan peringatan apa pun,
-- sehingga lokasi tujuan tidak pernah tahu ada barang dalam perjalanan yang
-- menunggu konfirmasi penerimaan. Aditif: nilai lama tidak diubah.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TRANSFER_SENT';
