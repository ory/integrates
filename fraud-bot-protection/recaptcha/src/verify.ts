/**
 * Core reCAPTCHA verification logic — extracted for testability.
 *
 * Calls Google's siteverify API and applies v2/v3 validation rules.
 */

import type {
  RecaptchaConfig,
  RecaptchaVerifyResponse,
  VerificationResult,
} from "./types";

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/**
 * Verify a reCAPTCHA token against Google's siteverify API.
 *
 * @param token - The reCAPTCHA response token from the client
 * @param secretKey - Your reCAPTCHA secret key (from secret manager)
 * @param remoteIp - The end user's IP address (optional but recommended)
 * @param config - reCAPTCHA version and threshold configuration
 */
export async function verifyRecaptchaToken(
  token: string,
  secretKey: string,
  remoteIp: string | undefined,
  config: RecaptchaConfig,
): Promise<VerificationResult> {
  const params = new URLSearchParams({
    secret: secretKey,
    response: token,
  });
  if (remoteIp) {
    params.set("remoteip", remoteIp);
  }

  let googleResponse: RecaptchaVerifyResponse;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      return {
        success: false,
        failureReason: `Google API returned HTTP ${res.status}`,
      };
    }

    googleResponse = (await res.json()) as RecaptchaVerifyResponse;
  } catch (err) {
    return {
      success: false,
      failureReason: `Google API request failed: ${(err as Error).message}`,
    };
  }

  // v2: just check success
  if (config.version === "v2") {
    return {
      success: googleResponse.success,
      errorCodes: googleResponse["error-codes"],
      failureReason: googleResponse.success
        ? undefined
        : "CAPTCHA verification failed",
    };
  }

  // v3: check success + score threshold + optional action match
  if (!googleResponse.success) {
    return {
      success: false,
      score: googleResponse.score,
      action: googleResponse.action,
      errorCodes: googleResponse["error-codes"],
      failureReason: "reCAPTCHA verification failed",
    };
  }

  const score = googleResponse.score ?? 0;
  if (score < config.scoreThreshold) {
    // NEVER log the secret key. Score is safe to log for debugging.
    return {
      success: false,
      score,
      action: googleResponse.action,
      failureReason: `Score ${score} is below threshold ${config.scoreThreshold}`,
    };
  }

  if (
    config.expectedAction &&
    googleResponse.action !== config.expectedAction
  ) {
    return {
      success: false,
      score,
      action: googleResponse.action,
      failureReason: `Action mismatch: expected "${config.expectedAction}", got "${googleResponse.action}"`,
    };
  }

  return {
    success: true,
    score,
    action: googleResponse.action,
  };
}
