/**
 * @file Login page with invisible bot traps, browser-side proof, and rate-limit aware UX.
 */

import Head from "next/head";
import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/router";
import { clientConfig } from "../lib/config";
import { hashToken, setToken, getToken } from "../lib/token";
import { loadTranslations, Translations } from "../lib/lang";

type Status = "idle" | "checking" | "valid" | "invalid" | "blocked" | "bot" | "error";

type CheckResult = {
  ok: boolean;
  blocked?: boolean;
  retryAfterMs?: number;
  botDetected?: boolean;
};

/**
 * Produces a hex digest using SHA-256 with a browser or JS fallback.
 * @param value Input string to hash.
 * @returns Hex-encoded SHA-256 digest.
 */
async function sha256Hex(value: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const data = new TextEncoder().encode(value);
    const buf = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }

  const cryptoJs = await import("crypto-js");
  return cryptoJs.SHA256(value).toString();
}

/**
 * Creates a lightweight browser proof tying attempts to a UA and timestamp.
 * @returns Serialized proof string consumed by the server.
 */
async function createBrowserProof(): Promise<string> {
  const ts = Date.now();
  const payload = `${navigator.userAgent}:${ts}`;
  const digest = await sha256Hex(payload);
  return `v1:${ts}:${digest}`;
}

/**
 * Renders the login view with invisible anti-bot controls and rate-limit feedback.
 * @returns Login React component.
 */
export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [honeypot, setHoneypot] = useState("");
  const [browserProof, setBrowserProof] = useState("");
  const [retryAfterMs, setRetryAfterMs] = useState<number | null>(null);
  const [translations, setTranslations] = useState<Translations>({});
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    loadTranslations().then(setTranslations).catch(() => setTranslations({}));
  }, []);

  useEffect(() => {
    createBrowserProof()
      .then(setBrowserProof)
      .catch(() => setBrowserProof(""));
  }, []);

  const t = useMemo(() => {
    return (key: string) => translations[key] ?? key;
  }, [translations]);

  useEffect(() => {
    if (!clientConfig.authorization.sendLogin) return;
    if (!browserProof) return;
    const token = getToken();
    if (!token) return;
    setStatus("checking");
    checkToken(token, "", browserProof).then((result) => {
      if (result.ok) {
        setStatus("valid");
        router.replace("/messages");
        return;
      }
      if (result.blocked) {
        setRetryAfterMs(result.retryAfterMs ?? null);
        setStatus("blocked");
        return;
      }
      if (result.botDetected) {
        setStatus("bot");
        return;
      }
      setStatus("invalid");
    }).catch(() => setStatus("error"));
  }, [browserProof, router]);

  /**
   * Sends a token for server verification alongside bot traps.
   * @param token Hashed token derived from user input.
   * @param botField Honeypot field value (expected empty).
   * @param proof Browser-generated proof string.
    * @returns Outcome describing whether access is allowed or blocked.
   */
  async function checkToken(token: string, botField = "", proof = ""): Promise<CheckResult> {
    const res = await fetch("/api/token/check", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ botField, browserProof: proof })
    });

    const text = await res.text();

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retrySeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      return {
        ok: false,
        blocked: true,
        retryAfterMs: retrySeconds && Number.isFinite(retrySeconds) ? retrySeconds * 1000 : undefined
      };
    }

    if (res.status === 400 && text === "Bot detected") {
      return { ok: false, botDetected: true };
    }

    if (!res.ok) {
      return { ok: false };
    }

    return { ok: text === "Valid token" };
  }

  /**
   * Handles login submission with native form validation.
    * @returns Promise that resolves after submission processing.
   */
  async function handleLogin(event?: FormEvent<HTMLFormElement | HTMLButtonElement>): Promise<void> {
    event?.preventDefault();

    if (formRef.current && !formRef.current.reportValidity()) {
      return;
    }

    if (!browserProof) {
      setStatus("bot");
      return;
    }

    setStatus("checking");
    setRetryAfterMs(null);
    try {
      const token = await hashToken(password);
      setToken(token);
      const result = await checkToken(token, honeypot, browserProof);
      if (result.ok) {
        setStatus("valid");
        router.replace("/messages");
        return;
      }
      if (result.blocked) {
        setRetryAfterMs(result.retryAfterMs ?? null);
        setStatus("blocked");
        return;
      }
      if (result.botDetected) {
        setStatus("bot");
        return;
      }
      setStatus("invalid");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <Head>
        <title>{t("s_window")}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/css/bulma.min.css" />
        <link rel="stylesheet" href="/css/app/login.css" />
      </Head>
      <div id="overlay" />
      <section className="hero is-dark is-fullheight">
        <div className="hero-body">
          <div className="container">
            <div className="glass-panel">
              <div className="brand-mark">smsgate</div>
              <div className="py-4">
                <h2 className="is-size-2">{t("s_title")}</h2>
              </div>
              <div className="field has-addons centered">
                {status === "checking" && (
                  <div className="notification is-light">{t("s_wait")}</div>
                )}
                {status === "valid" && (
                  <div className="notification is-success is-light">{t("s_validcode")}</div>
                )}
                {status === "invalid" && (
                  <div className="notification is-danger is-light">
                    <strong>{t("s_invalidcode1")}</strong>
                    <small>{t("s_invalidcode2")}</small>
                  </div>
                )}
                {status === "blocked" && (
                  <div className="notification is-warning is-light">
                    <strong>{t("s_blocked")}</strong>
                    {retryAfterMs !== null && (
                      <small>{t("s_blockedwait")}{" "}{Math.max(1, Math.ceil(retryAfterMs / 1000))}s</small>
                    )}
                  </div>
                )}
                {status === "bot" && (
                  <div className="notification is-danger is-light">{t("s_bot")}</div>
                )}
                {status === "error" && (
                  <div className="notification is-danger is-light">{t("s_errorcode")}</div>
                )}
                <form ref={formRef} onSubmit={handleLogin} style={{ display: "contents" }}>
                  <input
                    id="contact"
                    className="input"
                    type="text"
                    name="contact"
                    autoComplete="off"
                    tabIndex={-1}
                    aria-hidden="true"
                    value={honeypot}
                    onChange={(event) => setHoneypot(event.target.value)}
                    style={{ position: "absolute", left: "-5000px", opacity: 0 }}
                  />
                  <input
                    id="browserProof"
                    className="input"
                    type="text"
                    name="browserProof"
                    autoComplete="off"
                    tabIndex={-1}
                    aria-hidden="true"
                    value={browserProof}
                    readOnly
                    style={{ position: "absolute", left: "-5000px", opacity: 0 }}
                  />
                  <div className="control">
                    <input
                      id="password"
                      className="input has-background-grey-darker has-text-white-bis"
                      type="password"
                      placeholder={t("s_accesscode")}
                      value={password}
                      required
                      minLength={4}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                  <div className="control">
                    <button
                      id="login"
                      className="button has-background-grey-lighter"
                      type="submit"
                      disabled={status === "checking"}
                    >
                      {t("s_login")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
