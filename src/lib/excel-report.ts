import ExcelJS from "exceljs"

type ExcelRow = Record<string, string | number>

type ExcelReportOptions = {
  title: string
  sheetName: string
  rows: ExcelRow[]
  headers: string[]
  widths: number[]
  currencyHeaders?: string[]
  integerHeaders?: string[]
  centeredHeaders?: string[]
  reportLayout?: boolean
  freezeColumns?: number
}

const COLORS = {
  border: "FFD1D5DB",
  white: "FFFFFFFF",
  text: "FF1E293B",
}

export async function createStyledExcelReport({
  title,
  sheetName,
  rows,
  headers,
  widths,
  currencyHeaders = [],
  integerHeaders = [],
  centeredHeaders = [],
  reportLayout = false,
  freezeColumns = 0,
}: ExcelReportOptions) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Pantau"
  workbook.company = "Pantau"
  workbook.title = title
  workbook.subject = title
  workbook.created = new Date()
  workbook.modified = new Date()

  const headerRowNumber = 1
  const dataStartRow = headerRowNumber + 1

  const worksheet = workbook.addWorksheet(sheetName, {
    properties: {
      defaultRowHeight: 24,
    },
    views: [{
      state: "frozen",
      ySplit: headerRowNumber,
      xSplit: reportLayout ? freezeColumns : 0,
      showGridLines: false,
    }],
  })

  // Definisikan sebagai Tabel Excel asli (ListObject/tableParts), bukan sekadar
  // sel lepas, agar filter dan batas data tetap konsisten di Excel dan Numbers.
  const tableName = (sheetName || "Laporan").replace(/[^A-Za-z0-9]/g, "") || "Laporan"
  worksheet.addTable({
    name: tableName,
    ref: `A${headerRowNumber}`,
    headerRow: true,
    style: {
      theme: "TableStyleLight1",
      showRowStripes: false,
      showColumnStripes: false,
      showFirstColumn: false,
      showLastColumn: false,
    },
    columns: headers.map((header) => ({ name: header, filterButton: reportLayout })),
    rows: rows.map((item) => headers.map((header) => item[header] ?? "")),
  })

  headers.forEach((_, index) => {
    const header = headers[index]
    const contentWidth = rows.reduce((longest, row) => {
      const value = row[header]
      const length = typeof value === "string"
        ? Math.max(...value.split(/\r?\n/).map((line) => line.length))
        : String(value ?? "").length + (currencyHeaders.includes(header) ? 5 : 0)
      return Math.max(longest, Math.min(length + 4, 48))
    }, 0)
    worksheet.getColumn(index + 1).width = Math.max(widths[index] ?? 16, header.length + 6, contentWidth)
  })

  const headerRow = worksheet.getRow(headerRowNumber)
  headerRow.height = 38
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.white } }
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: COLORS.text } }
    cell.alignment = { horizontal: "left", vertical: "middle", indent: 1, wrapText: false }
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      left: { style: "thin", color: { argb: COLORS.border } },
      right: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
    }
  })

  const currencyColumns = new Set(currencyHeaders.map((header) => headers.indexOf(header) + 1))
  const integerColumns = new Set(integerHeaders.map((header) => headers.indexOf(header) + 1))
  const centeredColumns = new Set(centeredHeaders.map((header) => headers.indexOf(header) + 1))

  for (let rowNumber = dataStartRow; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const isBlank = headers.every((_, index) => {
      const value = row.getCell(index + 1).value
      return value === null || value === undefined || value === ""
    })
    const isTotal = headers.some((_, index) => row.getCell(index + 1).value === "TOTAL")

    if (isBlank) {
      row.height = 8
      continue
    }

    row.height = 26
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.font = { name: "Arial", size: 10, color: { argb: COLORS.text }, bold: isTotal }
      cell.alignment = {
        horizontal: centeredColumns.has(columnNumber)
          ? "center"
          : typeof cell.value === "number" ? "right" : "left",
        vertical: "middle",
        indent: centeredColumns.has(columnNumber) ? 0 : 1,
      }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.white } }
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.border } },
        left: { style: "thin", color: { argb: COLORS.border } },
        bottom: { style: "thin", color: { argb: COLORS.border } },
        right: { style: "thin", color: { argb: COLORS.border } },
      }
      if (currencyColumns.has(columnNumber) && typeof cell.value === "number") {
        cell.numFmt = '"Rp" #,##0'
      } else if (integerColumns.has(columnNumber) && typeof cell.value === "number") {
        cell.numFmt = "#,##0"
      }
    })

    if (isTotal) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          ...cell.border,
          top: { style: "medium", color: { argb: COLORS.border } },
          bottom: { style: "medium", color: { argb: COLORS.border } },
        }
      })
    }
  }

  const contentLastRow = Math.max(worksheet.rowCount, headerRowNumber)

  const lastColumn = worksheet.getColumn(headers.length).letter
  worksheet.autoFilter = undefined
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:${lastColumn}${contentLastRow}`,
    printTitlesRow: `${headerRowNumber}:${headerRowNumber}`,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
