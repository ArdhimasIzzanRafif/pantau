/*
  Warnings:

  - You are about to drop the `MappingTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `POSSalesData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `POSUpload` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "MappingTemplate" DROP CONSTRAINT "MappingTemplate_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "POSSalesData" DROP CONSTRAINT "POSSalesData_uploadId_fkey";

-- DropForeignKey
ALTER TABLE "POSUpload" DROP CONSTRAINT "POSUpload_organizationId_fkey";

-- DropTable
DROP TABLE "MappingTemplate";

-- DropTable
DROP TABLE "POSSalesData";

-- DropTable
DROP TABLE "POSUpload";

-- DropEnum
DROP TYPE "UploadStatus";
