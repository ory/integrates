#!/usr/bin/env node
// One-shot migration: inject `protocol:` field into every registry.entry.yaml
// based on the per-integration mapping below. Idempotent: re-running on a file
// that already has a `protocol:` block leaves it untouched.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);

// Vocabulary:
//   oidc | oauth2 | saml2 | openid-2.0 | webauthn | scim2 |
//   smtp | rest-api | http-webhook | jwt | otlp | custom
const PROTOCOLS = {
  // --- agent-identity ---
  "agent-identity/skyfire": ["oauth2", "rest-api"],

  // --- api-gateways ---
  "api-gateways/apigee": ["jwt"],
  "api-gateways/aws-api-gateway": ["jwt"],
  "api-gateways/kong": ["jwt", "rest-api"],
  "api-gateways/traefik": ["rest-api"],

  // --- cdp-analytics ---
  "cdp-analytics/amplitude": ["rest-api"],
  "cdp-analytics/mailchimp": ["rest-api"],
  "cdp-analytics/mixpanel": ["rest-api"],
  "cdp-analytics/mparticle": ["rest-api"],
  "cdp-analytics/segment": ["rest-api"],

  // --- cloud-infrastructure ---
  "cloud-infrastructure/aws": ["rest-api"],
  "cloud-infrastructure/azure": ["rest-api"],
  "cloud-infrastructure/gcp": ["rest-api"],

  // --- compliance-audit ---
  "compliance-audit/drata": ["rest-api"],
  "compliance-audit/vanta": ["rest-api"],

  // --- consent-privacy ---
  "consent-privacy/didomi": ["rest-api", "http-webhook"],
  "consent-privacy/onetrust": ["rest-api", "http-webhook"],
  "consent-privacy/osano": ["rest-api", "http-webhook"],

  // --- containerization ---
  "containerization/docker": ["rest-api"],
  "containerization/kubernetes": ["rest-api"],

  // --- crm ---
  "crm/hubspot": ["rest-api", "http-webhook"],
  "crm/microsoft-dynamics-365": ["rest-api", "oauth2"],
  "crm/pipedrive": ["rest-api"],
  "crm/salesforce": ["rest-api", "oauth2"],
  "crm/zoho-crm": ["rest-api", "oauth2"],

  // --- data-persistence ---
  "data-persistence/cockroachdb": ["custom"],

  // --- directory-sync ---
  "directory-sync/bamboohr": ["rest-api"],
  "directory-sync/google-workspace-scim": ["scim2"],
  "directory-sync/jumpcloud-scim": ["scim2"],
  "directory-sync/microsoft-scim": ["scim2"],
  "directory-sync/okta-scim": ["scim2"],
  "directory-sync/onelogin-scim": ["scim2"],
  "directory-sync/workday-scim": ["scim2", "rest-api"],

  // --- edge-token-validation ---
  "edge-token-validation/akamai-edgeworkers": ["jwt", "rest-api"],
  "edge-token-validation/cloudflare-workers": ["jwt", "rest-api"],
  "edge-token-validation/fastly-compute": ["jwt", "rest-api"],

  // --- email-providers ---
  "email-providers/aws-ses": ["smtp"],
  "email-providers/brevo": ["smtp", "rest-api"],
  "email-providers/mailchimp-transactional": ["smtp"],
  "email-providers/mailgun": ["smtp"],
  "email-providers/postmark": ["smtp"],
  "email-providers/sendgrid": ["smtp", "rest-api"],
  "email-providers/sparkpost": ["smtp", "rest-api"],

  // --- enterprise-sso ---
  "enterprise-sso/auth0-saml": ["saml2"],
  "enterprise-sso/cyberark-identity": ["saml2", "oidc"],
  "enterprise-sso/forgerock-am": ["saml2", "oidc"],
  "enterprise-sso/generic-oidc": ["oidc"],
  "enterprise-sso/generic-saml": ["saml2"],
  "enterprise-sso/google-workspace": ["saml2"],
  "enterprise-sso/hid-global": ["saml2", "oidc"],
  "enterprise-sso/ibm-security-verify": ["saml2", "oidc"],
  "enterprise-sso/jumpcloud": ["saml2"],
  "enterprise-sso/keycloak": ["oidc", "saml2"],
  "enterprise-sso/microsoft-adfs": ["saml2"],
  "enterprise-sso/microsoft-entra-id": ["saml2"],
  "enterprise-sso/okta": ["saml2", "oidc"],
  "enterprise-sso/onelogin": ["saml2"],
  "enterprise-sso/pingone": ["saml2"],
  "enterprise-sso/rippling": ["saml2"],

  // --- feature-flags ---
  "feature-flags/launchdarkly": ["rest-api"],
  "feature-flags/split-io": ["rest-api"],

  // --- fraud-bot-protection ---
  "fraud-bot-protection/arkose-labs": ["rest-api"],
  "fraud-bot-protection/castle": ["rest-api"],
  "fraud-bot-protection/cloudflare-turnstile": ["rest-api"],
  "fraud-bot-protection/hcaptcha": ["rest-api"],
  "fraud-bot-protection/recaptcha": ["rest-api"],
  "fraud-bot-protection/sift": ["rest-api"],

  // --- generic-protocols ---
  "generic-protocols/generic-oidc": ["oidc"],
  "generic-protocols/generic-saml": ["saml2"],

  // --- government-identity ---
  "government-identity/aadhaar": ["rest-api"],
  "government-identity/bankid": ["oidc"],
  "government-identity/eidas": ["oidc"],
  "government-identity/idin": ["oidc"],

  // --- iac-devops ---
  "iac-devops/helm": ["rest-api"],
  "iac-devops/pulumi": ["rest-api"],
  "iac-devops/terraform": ["rest-api"],

  // --- identity-verification ---
  "identity-verification/equifax": ["rest-api", "oauth2"],
  "identity-verification/gbg-acuant": ["rest-api"],
  "identity-verification/id-me": ["oidc"],
  "identity-verification/jumio": ["rest-api", "oauth2", "http-webhook"],
  "identity-verification/lexisnexis": ["rest-api"],
  "identity-verification/onfido": ["rest-api", "http-webhook"],
  "identity-verification/persona": ["rest-api", "http-webhook"],
  "identity-verification/prove": ["rest-api", "oauth2"],
  "identity-verification/socure": ["rest-api", "http-webhook"],

  // --- mfa ---
  "mfa/duo-security": ["rest-api"],
  "mfa/okta-verify": ["rest-api"],
  "mfa/yubikey": ["webauthn"],

  // --- monitoring-observability ---
  "monitoring-observability/datadog": ["otlp", "rest-api"],
  "monitoring-observability/new-relic": ["otlp"],
  "monitoring-observability/opentelemetry": ["otlp"],
  "monitoring-observability/prometheus-grafana": ["rest-api"],

  // --- payment-billing ---
  "payment-billing/recurly": ["rest-api", "http-webhook"],
  "payment-billing/stripe": ["rest-api", "http-webhook"],

  // --- siem-security-analytics ---
  "siem-security-analytics/elastic-siem": ["rest-api"],
  "siem-security-analytics/microsoft-sentinel": ["rest-api"],
  "siem-security-analytics/splunk": ["rest-api"],
  "siem-security-analytics/sumo-logic": ["rest-api"],

  // --- sms-providers ---
  "sms-providers/messagebird": ["rest-api"],
  "sms-providers/plivo": ["rest-api"],
  "sms-providers/sinch": ["rest-api"],
  "sms-providers/twilio": ["rest-api"],
  "sms-providers/vonage": ["rest-api"],
  "sms-providers/whatsapp": ["rest-api"],

  // --- social-sign-in ---
  "social-sign-in/amazon-lwa": ["oauth2"],
  "social-sign-in/apple": ["oidc"],
  "social-sign-in/auth0": ["oidc"],
  "social-sign-in/battle-net": ["oauth2"],
  "social-sign-in/dingtalk": ["oidc"],
  "social-sign-in/discord": ["oidc"],
  "social-sign-in/epic-games": ["oauth2"],
  "social-sign-in/facebook": ["oidc"],
  "social-sign-in/github": ["oauth2"],
  "social-sign-in/github-app": ["oauth2"],
  "social-sign-in/gitlab": ["oidc"],
  "social-sign-in/google": ["oidc"],
  "social-sign-in/kakao": ["oauth2"],
  "social-sign-in/lark": ["oidc"],
  "social-sign-in/line": ["oidc"],
  "social-sign-in/linkedin": ["oidc"],
  "social-sign-in/microsoft": ["oidc"],
  "social-sign-in/naver": ["oauth2"],
  "social-sign-in/netid": ["oidc"],
  "social-sign-in/patreon": ["oauth2"],
  "social-sign-in/salesforce": ["oidc"],
  "social-sign-in/slack": ["oidc"],
  "social-sign-in/spotify": ["oauth2"],
  "social-sign-in/steam": ["openid-2.0"],
  "social-sign-in/telegram": ["custom"],
  "social-sign-in/tiktok": ["oauth2"],
  "social-sign-in/twitch": ["oidc"],
  "social-sign-in/uaepass": ["oidc"],
  "social-sign-in/vk": ["oauth2"],
  "social-sign-in/wechat": ["oauth2", "custom"],
  "social-sign-in/x-twitter": ["oauth2"],
  "social-sign-in/yandex": ["oauth2"],

  // --- support-helpdesk ---
  "support-helpdesk/freshdesk": ["rest-api"],
  "support-helpdesk/intercom": ["rest-api"],
  "support-helpdesk/zendesk": ["rest-api"],

  // --- user-enrichment ---
  "user-enrichment/clearbit": ["rest-api"],
  "user-enrichment/fullcontact": ["rest-api"],
  "user-enrichment/zoominfo": ["rest-api", "oauth2"],

  // --- webhook-infrastructure ---
  "webhook-infrastructure/hookdeck": ["http-webhook"],
  "webhook-infrastructure/svix": ["http-webhook"],
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "docs",
  "_examples",
  "scripts",
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (name === "registry.entry.yaml") {
      yield full;
    }
  }
}

function injectProtocol(full) {
  const rel = full.slice(repoRoot.length + 1).split(sep).join("/");
  const key = rel.replace(/\/registry\.entry\.yaml$/, "");
  const protocols = PROTOCOLS[key];
  if (!protocols) return { rel, status: "skipped-no-mapping" };

  const original = readFileSync(full, "utf8");
  if (/^protocol:\s*$/m.test(original)) {
    return { rel, status: "already-has-protocol" };
  }

  const lines = original.split("\n");
  const omIdx = lines.findIndex((l) => /^oryMechanism:\s*$/.test(l));
  if (omIdx === -1) return { rel, status: "no-oryMechanism" };
  let endIdx = omIdx + 1;
  while (endIdx < lines.length && /^  - /.test(lines[endIdx])) endIdx++;

  const insertion = ["protocol:", ...protocols.map((p) => `  - ${p}`)];
  const updated = [
    ...lines.slice(0, endIdx),
    ...insertion,
    ...lines.slice(endIdx),
  ].join("\n");

  writeFileSync(full, updated);
  return { rel, status: "updated", protocols };
}

const results = [...walk(repoRoot)].map(injectProtocol);
const updated = results.filter((r) => r.status === "updated").length;
const already = results.filter((r) => r.status === "already-has-protocol").length;
const skipped = results.filter((r) => r.status === "skipped-no-mapping");
const errors = results.filter((r) => r.status === "no-oryMechanism");

console.log(`Updated: ${updated}`);
console.log(`Already had protocol: ${already}`);
if (skipped.length) {
  console.log(`No mapping (${skipped.length}):`);
  for (const r of skipped) console.log(`  - ${r.rel}`);
}
if (errors.length) {
  console.log(`No oryMechanism block (${errors.length}):`);
  for (const r of errors) console.log(`  - ${r.rel}`);
}
