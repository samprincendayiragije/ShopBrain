// src/lib/whatsappDocument.ts
//
// Sends a FILE (like the CSV backup) to a WhatsApp user.
// WhatsApp needs two steps: 1) upload the file, 2) send a message that points to it.
//
// It reads your WhatsApp credentials from environment variables. It tries the
// names below in order, so it should work with whatever you already use:
//   access token:    WHATSAPP_ACCESS_TOKEN, WHATSAPP_TOKEN, META_ACCESS_TOKEN
//   phone number id: WHATSAPP_PHONE_NUMBER_ID, PHONE_NUMBER_ID
// If yours are named differently, add one of the names above in your secrets.

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super("WhatsApp access token or phone number id is missing");
    this.name = "WhatsAppNotConfiguredError";
  }
}

function credentials(): { token: string; phoneId: string; version: string } {
  const env = process.env;
  const token = env["WHATSAPP_ACCESS_TOKEN"] ?? env["WHATSAPP_TOKEN"] ?? env["META_ACCESS_TOKEN"];
  const phoneId = env["WHATSAPP_PHONE_NUMBER_ID"] ?? env["PHONE_NUMBER_ID"];
  if (!token || !phoneId) throw new WhatsAppNotConfiguredError();
  return { token, phoneId, version: env["WHATSAPP_GRAPH_VERSION"] ?? "v21.0" };
}

export async function sendWhatsAppDocument(
  to: string,
  content: string | Uint8Array,
  filename: string,
  caption: string,
  mimeType = "text/csv",
): Promise<void> {
  const { token, phoneId, version } = credentials();
  const base = `https://graph.facebook.com/${version}/${phoneId}`;
  // fetch, FormData and Blob are built into Node 18+. They are read from globalThis
  // so this file compiles whether or not your TypeScript setup knows about them.
  const web = globalThis as unknown as {
    fetch: (url: string, init?: Record<string, unknown>) => Promise<{
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }>;
    FormData: new () => { append: (...args: unknown[]) => void };
    Blob: new (parts: Array<string | Uint8Array>, options?: { type?: string }) => unknown;
  };

  // Step 1: upload the file and get a media id back.
  const form = new web.FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new web.Blob([content], { type: mimeType }), filename);
  const uploadRes = await web.fetch(`${base}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploaded = (await uploadRes.json()) as { id?: string; error?: { message?: string } };
  if (!uploadRes.ok || !uploaded.id) {
    throw new Error(`WhatsApp media upload failed: ${uploaded.error?.message ?? uploadRes.status}`);
  }

  // Step 2: send a document message that uses that media id.
  const sendRes = await web.fetch(`${base}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { id: uploaded.id, filename, caption },
    }),
  });
  if (!sendRes.ok) {
    const err = (await sendRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`WhatsApp document send failed: ${err.error?.message ?? sendRes.status}`);
  }
}