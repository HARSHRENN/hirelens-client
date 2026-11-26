import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { prepareJobDates, turnaroundDays } from '../src/lib/jobDates.ts'
import { screeningRemark, matchesProfileFilter } from '../src/lib/screening.ts'
import { excelWorkbook, recordSheet } from '../src/lib/excel.ts'
const opened = Date.UTC(2026, 0, 1, 12)
const job = { id: 'j', status: 'open', createdAt: opened }
test('vacancy dates, closure, admin correction, reopening and calendar-day TAT', () => {
 const created = prepareJobDates(job, undefined, true, opened)
 assert.equal(created.vacancyCreatedDate, '2026-01-01')
 const closed = prepareJobDates({ ...created, status: 'closed' }, created, false, opened + 10 * 864e5)
 assert.equal(turnaroundDays(closed), 10)
 assert.equal(turnaroundDays(prepareJobDates({ ...closed, positionClosedDate: '2026-01-20' }, closed, false)), 10)
 assert.equal(turnaroundDays(prepareJobDates({ ...closed, positionClosedDate: '2026-01-20' }, closed, true)), 19)
 assert.equal(prepareJobDates({ ...closed, status: 'open' }, closed, true).positionClosedDate, undefined)
 assert.equal(turnaroundDays({ ...job, status: 'closed' }), null)
 assert.throws(() => prepareJobDates({ ...closed, positionClosedDate: '2025-12-31' }, closed, true), /on or after/)
 assert.equal(turnaroundDays({ ...closed, vacancyCreatedDate: '2026-03-07', positionClosedDate: '2026-03-09' }),2)
})
test('screening badges use the relevant round; hold and rejection are distinct filters', () => {
 const c = { shortlisted: true, stage: 'l2', interviews: [{ round: 'l1', result: 'select', at: 1 }, { round: 'l2', result: 'reject', at: 2 }] }
 assert.equal(screeningRemark(c,'l1'),'Shortlisted'); assert.equal(screeningRemark(c,'l2'),'Rejected')
 assert.equal(screeningRemark({ ...c, shortlisted: false, interviews: [] },'l3'),'Pending feedback')
 assert.equal(matchesProfileFilter({ ...c, stage:'hold' },'hold'),true)
 assert.equal(matchesProfileFilter({ ...c, stage:'hold' },'short'),false)
 assert.equal(matchesProfileFilter({ ...c, stage:'rejected' },'rejected'),true)
})
test('real XLSX preserves unicode, nested details and long text without executing formulas', async () => {
 const text='x'.repeat(40000)
 const sheet=recordSheet('Candidates',[{name:'=HYPERLINK("bad")',resumeText:text,match:{score:75},remarks:[{text:'नमस्ते & <hello>'}]}])
 assert.ok(sheet.rows[0].includes('resumeText (part 2)'))
 const blob=await excelWorkbook([sheet,{name:'Dashboard',rows:[['Metric','Value'],['Candidates',1]]}])
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('xl/worksheets/sheet1.xml').async('string')
 assert.ok(xml.includes('t="inlineStr"')); assert.ok(!xml.includes('<f>')); assert.ok(xml.includes('नमस्ते &amp; &lt;hello&gt;'))
 assert.ok(zip.file('[Content_Types].xml')); assert.ok(zip.file('xl/workbook.xml'))
 assert.equal(sheet.rows[1][1] + sheet.rows[1][2],text)
})
