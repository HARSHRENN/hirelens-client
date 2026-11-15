import { jsPDF } from 'jspdf'
import { buildInvoicePdf, type InvoiceDoc } from '../../shared/invoice.js'

// Invoices are raised and numbered by the server (one series for the platform);
// the browser only renders them for download.
export { fmtDay, fromRow, inr, taxOf, totalOf, words, type InvoiceDoc } from '../../shared/invoice.js'
export const invoicePdf = (inv: InvoiceDoc): Blob => buildInvoicePdf(jsPDF, inv).output('blob')
export const blobToBase64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(b) })
