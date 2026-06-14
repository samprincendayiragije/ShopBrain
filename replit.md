# ShopBrain

A WhatsApp Business webhook that replies to customer messages with a guided menu for common topics and AI-powered answers for open-ended questions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- AI: OpenAI (`gpt-4o-mini`) for AI replies

## Where things live

- `artifacts/api-server/src/routes/webhook.ts` — WhatsApp webhook (verify + message handler)
- `artifacts/api-server/src/lib/openai.ts` — OpenAI client singleton
- `artifacts/api-server/src/lib/whatsapp.ts` — WhatsApp message sender (Graph API)

## Architecture decisions

- Webhook immediately responds `200 OK` to Meta, then processes messages async — required by Meta's 20s timeout rule.
- Menu replies (1–5) bypass AI entirely for speed and cost; AI is only called for free-form messages.
- `WHATSAPP_VERIFY_TOKEN` is stored as an env var; fallback to the literal token string for local dev.
- OpenAI replies are capped at 300 tokens and stripped of markdown (plain text for WhatsApp).

## Product

- Customers message your WhatsApp number and get instant replies.
- Typing `hi`, `hello`, or `menu` shows the main menu (products, orders, pricing, support, open question).
- Selecting a menu option (1–5) returns a fixed, instant reply.
- Any other text is answered by GPT-4o-mini acting as a shopping assistant.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The webhook URL to register in Meta Developer Portal is: `https://<your-replit-domain>/api/webhook`
- Verify token: `ShopBrain_kigali_2026` (or whatever is in `WHATSAPP_VERIFY_TOKEN`)
- `WHATSAPP_ACCESS_TOKEN` expires after 24h in sandbox mode; use a System User token for production.
- Always respond `200 OK` to Meta before doing async work, or Meta will retry the delivery.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
