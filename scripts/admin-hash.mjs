// Prints a value for the ADMIN_PASSWORD_HASH environment variable:
//   node scripts/admin-hash.mjs 'your new password'
import { randomBytes, scryptSync } from 'node:crypto'
const pw = process.argv[2]
if (!pw || pw.length < 8) { console.error('Give a password of at least 8 characters.'); process.exit(1) }
const salt = randomBytes(16).toString('hex')
console.log(`scrypt$${salt}$${scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex')}`)
