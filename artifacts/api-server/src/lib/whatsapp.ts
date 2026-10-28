import {
  templateName,
  templateLanguageCode,
  findTemplate,
  TEMPLATE_MAX_PARAMS,
  type TemplateKind,
  type TemplateLang,
} from "./templateSettings";

const PHONE_NUMBER_ID = process.env["WHATSAPP_PHONE_NUMBER_ID"];
const ACCESS_TOKEN = process.env["WHATSAPP_ACCESS_TOKEN"];
if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
  throw new Error(
    "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required",
  );
}
export async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<string> {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${body}`);
  }
  const data = await res.json() as { messages: Array<{ id: string }> };
  return data.messages[0].id;
}
export async function sendWhatsAppInteractiveMessage(
  to: string,
  interactive: object,
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${body}`);
  }
}

/**
 * Marks an incoming message as read (blue checkmarks) and shows the
 * "typing..." indicator to the sender while the bot works on its reply.
 * `messageId` is the WhatsApp message id of the incoming message (msg.id
 * from the webhook payload) — NOT the reply we're about to send.
 *
 * Fire-and-forget by design: callers should not await-block their reply on
 * this, and a failure here should never stop the bot from actually
 * responding. Swallow errors internally rather than throwing.
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  try {
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
    });
  } catch {
    // Never let a failed read-receipt/typing-indicator call block or crash
    // message handling — this is a UX nicety, not a critical path.
  }
}

/**
 * Downloads an image the sender attached (msg.image.id from the webhook).
 * Two steps, both needed: ask Meta for the temporary file URL, then fetch
 * that URL with the same access token. Returns base64 + mime type, ready to
 * hand to a vision model. Throws on any failure, so callers can tell the
 * owner to try again.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ base64: string; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!metaRes.ok) {
    throw new Error(`WhatsApp media lookup failed ${metaRes.status}: ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("WhatsApp media lookup returned no url");

  const mimeType = meta.mime_type ?? "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!fileRes.ok) {
    throw new Error(`WhatsApp media download failed ${fileRes.status}`);
  }
  const buf = Buffer.from(await fileRes.arrayBuffer());
  // The vision API rejects images over 5 MB; WhatsApp photos are normally well under.
  if (buf.length > 4_500_000) throw new Error("Image too large");

  return { base64: buf.toString("base64"), mimeType };
}

/**
 * Meta rejects a template variable (error 132018 / 132000) when it:
 *   - contains a new line or tab
 *   - contains 4 or more spaces in a row
 *   - is empty
 *   - is longer than 1024 characters
 * Every template param goes through this, so callers don't have to care.
 *   "sugar 2000\nbread 500"  ->  "sugar 2000 | bread 500"
 */
function cleanTemplateParam(value: unknown): string {
  let s = String(value ?? "")
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\t/g, " ").trim())
    .filter((line) => line.length > 0)
    .join(" | ");
  s = s.replace(/ {2,}/g, " ").trim();
  if (s.length > 1000) s = s.slice(0, 997) + "...";
  return s.length > 0 ? s : "-";
}

/**
 * Meta error 132001 = "template does not exist in this language". It means the
 * language code we sent is not the one the template is registered under.
 * Nothing is sent when this happens, so it is safe to retry once with the
 * sibling code. Safety net only: templateSettings.ts should already be right.
 */
const ALTERNATE_LANGUAGE_CODE: Record<string, string> = {
  rw: "rw_RW",
  rw_RW: "rw",
  en: "en_US",
  en_US: "en",
};

/** Remembers which language code actually worked for a template (by name). */
const workingLanguageCode = new Map<string, string>();

/** Remembers how many variables Meta said a template takes (by name). */
const learnedMaxParams = new Map<string, number>();

/** Reads N out of "...does not match the expected number of params (N)". */
function expectedParamCount(body: string): number | null {
  const m = body.match(/expected number of params \((\d+)\)/);
  return m ? parseInt(m[1] as string, 10) : null;
}

interface TemplateAttempt {
  ok: boolean;
  status: number;
  body: string;
  metaCode?: number;
  messageId?: string;
}

/** One raw call to Meta. Never throws on an HTTP error, it reports it. */
async function postTemplate(
  to: string,
  name: string,
  languageCode: string,
  params: string[],
): Promise<TemplateAttempt> {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  const template: {
    name: string;
    language: { code: string };
    components?: object[];
  } = {
    name,
    language: { code: languageCode },
  };
  if (params.length > 0) {
    template.components = [
      {
        type: "body",
        parameters: params.map((p) => ({
          type: "text",
          text: cleanTemplateParam(p),
        })),
      },
    ];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template,
    }),
  });

  const body = await res.text();

  if (!res.ok) {
    let metaCode: number | undefined;
    try {
      metaCode = (JSON.parse(body) as { error?: { code?: number } }).error?.code;
    } catch {
      // body wasn't JSON, leave metaCode undefined
    }
    return { ok: false, status: res.status, body, metaCode };
  }

  let messageId: string | undefined;
  try {
    messageId = (JSON.parse(body) as { messages?: Array<{ id: string }> }).messages?.[0]?.id;
  } catch {
    // fall through
  }
  if (!messageId) {
    return { ok: false, status: res.status, body: `No message id in response: ${body}` };
  }
  return { ok: true, status: res.status, body, messageId };
}

/**
 * Sends a pre-approved WhatsApp message template.
 * Required for messaging customers outside the 24h customer service window
 * (i.e. anyone who hasn't messaged the bot recently, or ever).
 *
 * For any template listed in templateSettings.ts, THAT FILE decides the
 * language code and the maximum number of variables, whatever the caller
 * passes in. (Callers that still pass their own language code, like the
 * receipt and Monday messages, are corrected here, e.g. "receipt" is
 * registered as English even though its text is Kinyarwanda.)
 * Variables beyond the configured count are dropped from the END of the list.
 *
 * Fallbacks, each logged so you can fix the settings file:
 *   132001 (wrong language code)  -> retry once with the sibling code
 *   132000 (too many variables)   -> read Meta's expected count, trim, retry once
 * Neither can send twice: Meta sends nothing when it answers with those errors.
 *
 * Returns the WhatsApp message id (wamid). The sent / delivered / read
 * status callbacks that arrive on the webhook carry this same id, so store it
 * against the reminder when you log it.
 */
export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  params: string[],
): Promise<string> {
  const known = findTemplate(templateName);

  let code =
    workingLanguageCode.get(templateName) ??
    (known ? templateLanguageCode(known.kind, known.lang) : languageCode);

  let vars = params;
  const configuredMax = known ? TEMPLATE_MAX_PARAMS[known.kind][known.lang] : null;
  const max = learnedMaxParams.get(templateName) ?? configuredMax;
  if (max !== null && max !== undefined && vars.length > max) {
    vars = vars.slice(0, max);
  }

  let attempt = await postTemplate(to, templateName, code, vars);
  let triedLanguage = false;
  let triedTrim = false;

  while (!attempt.ok) {
    if (attempt.metaCode === 132001 && !triedLanguage && ALTERNATE_LANGUAGE_CODE[code]) {
      triedLanguage = true;
      const alt = ALTERNATE_LANGUAGE_CODE[code] as string;
      console.warn(
        `[template] "${templateName}" has no "${code}" version (132001). Retrying with "${alt}".`,
      );
      const retry = await postTemplate(to, templateName, alt, vars);
      // If the retry also says 132001, the first error is the more useful one to report.
      if (!retry.ok && retry.metaCode === 132001) break;
      code = alt;
      attempt = retry;
      if (retry.ok) {
        workingLanguageCode.set(templateName, alt);
        console.warn(
          `[template] "${templateName}" worked with language code "${alt}". Put that code in templateSettings.ts.`,
        );
      }
      continue;
    }

    if (attempt.metaCode === 132000 && !triedTrim) {
      triedTrim = true;
      const expected = expectedParamCount(attempt.body);
      if (expected !== null && expected > 0 && expected < vars.length) {
        console.warn(
          `[template] "${templateName}" takes ${expected} variables, not ${vars.length} (132000). Dropping the last ${vars.length - expected} and retrying.`,
        );
        vars = vars.slice(0, expected);
        const retry = await postTemplate(to, templateName, code, vars);
        attempt = retry;
        if (retry.ok) {
          learnedMaxParams.set(templateName, expected);
          console.warn(
            `[template] "${templateName}" worked with ${expected} variables. Set that number in TEMPLATE_MAX_PARAMS in templateSettings.ts.`,
          );
        }
        continue;
      }
    }

    break;
  }

  if (!attempt.ok) {
    // Logged here too, in case a caller swallows the thrown error. The Meta
    // error code in this line (132000, 132001, 132018, 131042, 131047...)
    // tells you exactly what is wrong.
    console.error(
      `[template] "${templateName}" (${code}) to ${to} failed, ${attempt.status}, ${vars.length} params: ${attempt.body}`,
    );
    throw new Error(
      `WhatsApp template "${templateName}" (${code}) failed, ${attempt.status}: ${attempt.body}`,
    );
  }

  return attempt.messageId as string;
}

/**
 * Sends a template by kind ("reminder" | "receipt" | "weekly") and language
 * ("en" | "rw"). The template name AND its language code both come from
 * templateSettings.ts, so changing a template only ever means editing that file.
 *
 * Example: sendWhatsAppTemplateByKind(phone, "receipt", "rw", [a, b, c, d])
 */
export async function sendWhatsAppTemplateByKind(
  to: string,
  kind: TemplateKind,
  lang: TemplateLang,
  params: string[],
): Promise<string> {
  return sendWhatsAppTemplateMessage(
    to,
    templateName(kind, lang),
    templateLanguageCode(kind, lang),
    params,
  );
}