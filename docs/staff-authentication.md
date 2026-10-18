# Assistly staff authentication

Assistly staff access uses two server-only environment variables:

- `ASSISTLY_STAFF_SECRET`: a long random signing secret used to authenticate the signed, HttpOnly `assistly_staff_session` cookie. Use at least 32 random bytes.
- `ASSISTLY_STAFF_PASSWORD_HASH`: an encoded scrypt verifier in the format `scrypt:<hex salt>:<128-character hex digest>`. It contains no plaintext password.

Generate a verifier locally without printing the password or committing the result:

```bash
read -r -s ASSISTLY_PASSWORD
printf '\n'
node --input-type=module -e "import { randomBytes, scryptSync } from 'node:crypto'; const password=process.env.ASSISTLY_PASSWORD; if (!password) process.exit(1); const salt=randomBytes(16).toString('hex'); process.stdout.write('scrypt:' + salt + ':' + scryptSync(password, salt, 64).toString('hex') + '\n')" \
  --env-file-if-exists=.env.local
unset ASSISTLY_PASSWORD
```

The command above expects `ASSISTLY_PASSWORD` to be exported only for the process. A safer equivalent is the repository helper:

```bash
pnpm staff:hash
```

For local development, put the generated values in `.env.local` (never commit it). For the authorized Vercel project, add both variables in Project Settings → Environment Variables for Development, Preview, and Production as appropriate. Do not place either value in `NEXT_PUBLIC_*` variables, client components, API responses, logs, or browser storage. Do not bypass Vercel SSO.

The login endpoint rejects missing or malformed configuration with a generic setup error, rejects incorrect passwords with a generic 401, and issues an eight-hour signed HttpOnly cookie. DELETE `/api/staff/session` logs out. Expired, modified, or incorrectly signed cookies are rejected server-side.

Verification checklist in a configured non-production environment:

1. GET `/api/staff/session` is unauthenticated before login.
2. Correct credentials return 200 and a session cookie.
3. Incorrect credentials return 401 without revealing which value failed.
4. Ticket mutation APIs reject unauthenticated requests.
5. DELETE session clears the cookie.
6. An expired or modified cookie is rejected.

`ASSISTLY_STAFF_PASSWORD_HASH` is intentionally not committed to this repository.
