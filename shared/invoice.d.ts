export interface InvoiceParty { name?: string; address?: string; gstin?: string; email?: string }
export interface InvoiceDoc {
  id?: string; number: string; issuedAt: number | string; periodFrom: number | string; periodTo: number | string
  description: string; planName: string; amount: number; taxPct: number; status: 'due' | 'paid' | 'void'
  seller: InvoiceParty; buyer: InvoiceParty; emailedAt?: string | null
}
export function taxOf(i: { amount: number; taxPct: number }): number
export function totalOf(i: { amount: number; taxPct: number }): number
export function inr(n: number): string
export function fy(t: number | string): string
export function fmtDay(t: number | string): string
export function words(n: number): string
export function buildInvoicePdf(jsPDF: unknown, inv: InvoiceDoc): { output(type: 'blob'): Blob; output(type: 'arraybuffer'): ArrayBuffer }
export function fromRow(r: Record<string, any>): InvoiceDoc
