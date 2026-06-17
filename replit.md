# ShopBrain

A WhatsApp Business webhook for shop owners. Send commands from your WhatsApp number to look up customers, record items owed, and mark debts as paid — all stored in Supabase.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: Supabase (Postgres)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/webhook.ts` — WhatsApp webhook (verify + command handler)
- `artifacts/api-server/src/lib/supabase.ts` — Supabase client singleton
- `artifacts/api-server/src/lib/whatsapp.ts` — WhatsApp message sender (Graph API)

## Architecture decisions

- Webhook immediately responds `200 OK` to Meta, then processes messages async — required by Meta's 20s timeout rule.
- Only the owner's WhatsApp number(s) can use ShopBrain commands — all other senders get a rejection message.
- No AI — all replies are deterministic based on commands.

## Product

ShopBrain is a simple database lookup tool for shop owners. Commands:

- `MENU` / `HELP` — show available commands
- Send a phone number → look up customer record and total owed
- `ADD <phone> <name> <item> <amount>` → record a new item/debt
- `PAID <phone>` → mark all unpaid transactions for that customer as paid

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The webhook URL to register in Meta Developer Portal is: `https://<your-replit-domain>/api/webhook`
- Verify token: `ShopBrain_kigali_2026` (or whatever is in `WHATSAPP_VERIFY_TOKEN`)
- `WHATSAPP_ACCESS_TOKEN` expires after 24h in sandbox mode; use a System User token for production.
- Always respond `200 OK` to Meta before doing async work, or Meta will retry the delivery.
- Owner phone numbers are hardcoded in `webhook.ts` → `OWNER_NUMBERS` array.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
