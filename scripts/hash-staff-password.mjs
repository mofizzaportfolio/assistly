import { randomBytes, scryptSync } from 'node:crypto'

const password = process.env.ASSISTLY_PASSWORD
if (!password) {
  process.stderr.write('Set ASSISTLY_PASSWORD for this one process; it is never stored by this script.\n')
  process.exit(1)
}
const salt = randomBytes(16).toString('hex')
process.stdout.write(`scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}\n`)
