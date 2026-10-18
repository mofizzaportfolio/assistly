# Customer access setup

Set `ASSISTLY_CUSTOMER_SECRET` in Development, Preview, and Production to a random high-entropy value. Customer ticket creation is intentionally unavailable when this value is missing; the API never falls back to a client-supplied customer ID, email, or ticket ID.

Customers start at `/customer`. A successful creation returns a ticket ID and sets an HttpOnly browser cookie containing a signed ticket-scoped access token. Ticket reads and public replies require that token. Event history filters out internal notes and technical findings for customer requests.

The token is bearer access for the browser that created the ticket. For production, add a verified email challenge or customer identity provider before exposing long-lived cross-device ticket lookup.
