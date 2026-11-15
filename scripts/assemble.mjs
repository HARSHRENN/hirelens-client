// Puts the landing site at / and the app at /app (and /admin via a rewrite) inside out/.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
rmSync('out', { recursive: true, force: true })
mkdirSync('out/app', { recursive: true })
cpSync('dist', 'out/app', { recursive: true })
const site = readFileSync('site/index.html', 'utf8').replaceAll('APP_URL', '/app/').replaceAll('ADMIN_URL', '/admin')
writeFileSync('out/index.html', site)
console.log('assembled out/: / (site), /app (app: /login /signup /u/<name> /admin /demo via rewrites)')
