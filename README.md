# ShopBrain

WhatsApp-based debt tracking and customer communication for small shop owners in Kigali. Shop owners manage customers and debts by chatting with a WhatsApp number, with no app to install. Supports English and Kinyarwanda.

## Stack

- Node.js webhook server (Express) hosted on Replit
- Supabase (PostgreSQL) for data
- Meta WhatsApp Business API for messaging
- React + Vite website with a password-gated /admin dashboard

## Main files (webhook)

- `src/index.ts`: server entry
- `src/routes/webhook.ts`: incoming WhatsApp messages, menus, buttons
- `src/routes/admin.ts`: admin API for the dashboard
- `src/lib/whatsapp.ts`: sending messages and templates
- `src/lib/supabase.ts`: database client

## Secrets

Never commit these. Set them in Replit Secrets (or a local `.env` that is gitignored):

- `SUPABASE_URL`, `SUPABASE_KEY`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
- `ADMIN_PASSWORD`

## Working on this repo

- Work on a branch and open a pull request. Do not push straight to `admin`.
- Do not change message templates in code without checking the approved template names and languages in WhatsApp Manager. A mismatch breaks reminders.
- Use test keys and a test WhatsApp number, never production data.
