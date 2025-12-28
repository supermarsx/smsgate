"use client";

import { useState } from "react";
import { appConfig, wsUrl } from "../lib/config";
import {
  buildOAuthAuthorizeUrl,
  exchangeOAuthCode,
  loginDomain,
  loginSimple,
  saveSession,
  type Session
} from "../lib/auth";

type Mode = "oauth" | "simple_signin" | "domain_signin";

type Props = {
  onLogin: (session: Session) => void;
};

export function LoginPanel({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    domain: "",
    mfaCode: ""
  });

  function handleSelect(next: Mode) {
    setMode(next);
    setError(null);
    setRequires2fa(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return;
    setPending(true);
    setError(null);

    try {
      if (mode === "oauth") {
        const redirectUri = window.location.origin + "/login/oauth/callback";
        const url = buildOAuthAuthorizeUrl(redirectUri);
        window.location.href = url;
        return;
      }

      const fn = mode === "simple_signin" ? loginSimple : loginDomain;
      const result = await fn(form.username, form.password, mode === "domain_signin" ? form.domain : undefined, form.mfaCode);

      if (result.error) {
        setError(result.error);
        setRequires2fa(!!result.requires2fa);
        setPending(false);
        return;
      }
      if (result.requires2fa) {
        setRequires2fa(true);
        setPending(false);
        return;
      }
      if (result.session) {
        onLogin(result.session);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-panel">
      <div className="login-panel__modes">
        {appConfig.authModes.oauth && (
          <button
            type="button"
            className={`login-mode ${mode === "oauth" ? "is-active" : ""}`}
            onClick={() => handleSelect("oauth")}
          >
            Sign in with SSO
          </button>
        )}
        {appConfig.authModes.simpleSignin && (
          <button
            type="button"
            className={`login-mode ${mode === "simple_signin" ? "is-active" : ""}`}
            onClick={() => handleSelect("simple_signin")}
          >
            Username / Password
          </button>
        )}
        {appConfig.authModes.domainSignin && (
          <button
            type="button"
            className={`login-mode ${mode === "domain_signin" ? "is-active" : ""}`}
            onClick={() => handleSelect("domain_signin")}
          >
            Domain Login
          </button>
        )}
      </div>

      {mode && mode !== "oauth" && (
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          {mode === "domain_signin" && (
            <div className="form-row">
              <label htmlFor="domain">Domain (optional)</label>
              <input
                id="domain"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                placeholder="corp.local"
              />
            </div>
          )}
          <div className="form-row">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {requires2fa && (
            <div className="form-row">
              <label htmlFor="mfa">MFA code</label>
              <input
                id="mfa"
                required
                value={form.mfaCode}
                onChange={(e) => setForm({ ...form, mfaCode: e.target.value })}
              />
            </div>
          )}
          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}

      {mode === "oauth" && (
        <div className="login-help">
          Redirecting to identity provider. If nothing happens, ensure API base is reachable:
          <div className="gg-value">{appConfig.apiBaseUrl}</div>
        </div>
      )}

      <div className="login-foot">
        <span>WS Endpoint: {wsUrl()}</span>
        <span className="muted">Tokens stored locally; logout clears them.</span>
      </div>
      {error && <div className="login-error">Error: {error}</div>}
    </div>
  );
}
