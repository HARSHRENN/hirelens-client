// Browser-side XLSX writer using the existing JSZip dependency. Text uses inline
// strings, so candidate text beginning with '=' cannot execute spreadsheet formulas.
export type ExcelCell = string | number | boolean | null | undefined
export interface ExcelSheet { name: string; rows: ExcelCell[][] }
// XML 1.0 forbids these control characters.
// oxlint-disable-next-line no-control-regex
const xml = (value: unknown) => String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
const column = (n: number): string => n < 26 ? String.fromCharCode(65 + n) : column(Math.floor(n / 26) - 1) + column(n % 26)
export async function excelWorkbook(sheets: ExcelSheet[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const names = new Set<string>()
  for (const s of sheets) {
    if (!s.name || s.name.length > 31 || /[\\/?*\[\]:]/.test(s.name) || names.has(s.name)) throw new Error('Invalid or duplicate workbook sheet name.')
    names.add(s.name)
    if (s.rows.length > 1048576 || s.rows.some(r => r.length > 16384)) throw new Error('Report exceeds Excel worksheet limits.')
    if (s.rows.some(r => r.some(v => String(v ?? '').length > 32767))) throw new Error('A report cell exceeds Excel’s text limit.')
  }
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  zip.file('xl/styles.xml', '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173355"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>')
  sheets.forEach((s, i) => {
    const width = s.rows.reduce((max, row) => Math.max(max, row.length), 1)
    const rows = s.rows.map((row, n) => `<row r="${n + 1}">${row.map((v, c) => {
      const ref = `${column(c)}${n + 1}`, style = n === 0 ? ' s="1"' : ''
      return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${style}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(v)}</t></is></c>`
    }).join('')}</row>`).join('')
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${width}" width="24" customWidth="1"/></cols><sheetData>${rows}</sheetData>${s.rows.length > 1 ? `<autoFilter ref="A1:${column(width - 1)}${s.rows.length}"/>` : ''}</worksheet>`)
  })
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' })
}

/** Preserve every JSON field, including nested arrays and long resume text. */
export function recordSheet(name: string, records: Record<string, unknown>[]): ExcelSheet {
  const expanded = records.map(record => {
    const out: Record<string, ExcelCell> = {}
    const flatten = (key: string, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) { for (const [k, v] of Object.entries(value)) flatten(key ? `${key}.${k}` : k, v); return }
      const cell = Array.isArray(value) ? JSON.stringify(value) : value
      if (typeof cell === 'string' && cell.length > 32700) {
        let start = 0, part = 1
        while (start < cell.length) {
          let end = Math.min(cell.length, start + 32700)
          if (end < cell.length && /[\uD800-\uDBFF]/.test(cell[end - 1]!)) end--
          out[`${key} (part ${part++})`] = cell.slice(start, end); start = end
        }
      } else out[key] = cell as ExcelCell
    }
    for (const [key, value] of Object.entries(record)) flatten(key, value)
    return out
  })
  const keys = [...new Set(expanded.flatMap(Object.keys))]
  return { name, rows: [keys.length ? keys : ['No records'], ...expanded.map(record => keys.map(k => record[k] ?? ''))] }
}
