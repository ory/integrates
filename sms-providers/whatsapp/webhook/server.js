// SPDX-License-Identifier: Apache-2.0
//
// Reference handler that delivers Ory Kratos verification / recovery / MFA OTPs
// via WhatsApp Business Cloud API instead of a traditional SMS provider.
//
// Kratos's HTTP courier POSTs each outbound message to /whatsapp/send. We extract
// the OTP digits from the rendered Kratos body, then call the Cloud API with a
// pre-approved AUTHENTICATION-category template that has a single body variable.

const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const OTP_TEMPLATE = process.env.WHATSAPP_OTP_TEMPLATE || "ory_otp";
const OTP_TEMPLATE_LANG = process.env.WHATSAPP_OTP_TEMPLATE_LANG || "en_US";

if (!ORY_WEBHOOK_SECRET || !PHONE_NUMBER_ID || !ACCESS_TOKEN) {
  console.error("ORY_WEBHOOK_SECRET, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN must be set");
  process.exit(1);
}

const app = express();
app.use(express.json());

function verifyWebhookSecret(req, res, next) {
  const provided = req.header("x-webhook-secret") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ORY_WEBHOOK_SECRET);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "invalid webhook secret" });
  }
  return next();
}

// Match a 4-10 digit run preceded by typical OTP framing words. Tighten if your
// Kratos templates produce a different layout. We bias toward stricter framing
// so we do not lift any random number out of a longer message.
const OTP_RE = /\b(?:code|pin|otp)[^\d]{0,16}(\d{4,10})\b/i;

function extractOtp(body) {
  const match = String(body || "").match(OTP_RE);
  return match ? match[1] : null;
}

// E.164 expected by WhatsApp Cloud API: leading "+" then digits.
function normalizeRecipient(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (/^\+\d{6,15}$/.test(trimmed)) return trimmed;
  // Best-effort: strip non-digits and prepend "+". The customer should configure
  // Kratos to emit E.164 directly when possible.
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/whatsapp/send", verifyWebhookSecret, async (req, res) => {
  const recipient = normalizeRecipient(req.body?.recipient);
  const body = req.body?.body;

  if (!recipient || !body) {
    return res.status(400).json({ error: "recipient and body are required" });
  }

  const otp = extractOtp(body);
  if (!otp) {
    // We could fall back to a regular text message here, but Cloud API's text type
    // requires a 24-hour customer-initiated session. OTPs go via templates only.
    console.error("Could not extract OTP from Kratos body — refusing to send.");
    return res.status(422).json({ error: "otp_extract_failed" });
  }

  const wa = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: OTP_TEMPLATE,
      language: { code: OTP_TEMPLATE_LANG },
      components: [
        { type: "body", parameters: [{ type: "text", text: otp }] },
        // Approved authentication templates also include a copy-code button that
        // takes the same OTP as a parameter. If your template doesn't have one,
        // remove the button component below.
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: otp }],
        },
      ],
    },
  };

  try {
    const waRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(wa),
      signal: AbortSignal.timeout(10000),
    });

    if (!waRes.ok) {
      console.error(`WhatsApp ${waRes.status}: ${await waRes.text()}`);
      return res.status(502).json({ error: "whatsapp_send_failed" });
    }

    const data = await waRes.json();
    return res.json({ ok: true, message_id: data?.messages?.[0]?.id ?? null });
  } catch (err) {
    console.error("WhatsApp send error:", err.message);
    return res.status(502).json({ error: "whatsapp_send_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp OTP courier listening on port ${PORT}`);
});
