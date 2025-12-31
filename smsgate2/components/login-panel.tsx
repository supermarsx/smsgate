"use client";

import { useMemo, useState } from "react";
import { appConfig, wsUrl } from "../lib/config";
import {
  buildOAuthAuthorizeUrl,
  changePassword,
  loginDomain,
  loginSimple,
  requestPasswordReset,
  type Session
} from "../lib/auth";
import { getInitialLocale, getTranslations } from "../lib/i18n";

type Mode = "oauth" | "simple_signin" | "domain_signin";

type Props = {
  onLogin: (session: Session) => void;
};

export function LoginPanel({ onLogin }: Props) {
  const locale = getInitialLocale();
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);
  const defaultAdminUser = appConfig.offlineReset?.defaultAdminUsername ?? "admin";
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [passwordChange, setPasswordChange] = useState<{ token?: string; username: string; mfaCode?: string } | null>(
    null
  );
  const [form, setForm] = useState({
    username: defaultAdminUser,
    password: "",
    domain: "",
    mfaCode: ""
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [offlineReset, setOfflineReset] = useState({ token: "", password: "", confirm: "" });
  const offlineResetEnabled = appConfig.offlineReset?.enabled ?? false;

  function handleSelect(next: Mode) {
    setMode(next);
    setError(null);
    setRequires2fa(false);
    setPasswordChange(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return;
    setPending(true);
    setError(null);

    try {
      if (mode === "oauth") {
        const redirectUri = window.location.origin + "/login/oauth/callback";
        const url = await buildOAuthAuthorizeUrl(redirectUri);
        window.location.href = url;
        return;
      }

      const fn = mode === "simple_signin" ? loginSimple : loginDomain;
      const result = await fn(
        form.username,
        form.password,
        mode === "domain_signin" ? form.domain : undefined,
        form.mfaCode
      );

      if (result.error) {
        setError(result.error);
        setRequires2fa(!!result.requires2fa);
        setPending(false);
        return;
      }
      if ((result as any).requiresPasswordChange) {
        setPasswordChange({
          token: (result as any).passwordChangeToken,
          username: form.username,
          mfaCode: form.mfaCode || undefined
        });
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

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordChange) return;
    if (newPassword !== confirmPassword) {
      setError(t("passwordsMismatch", "Passwords do not match"));
      return;
    }
    setPending(true);
    setError(null);
    const payload = {
      token: passwordChange.token,
      username: passwordChange.username,
      currentPassword: form.password,
      newPassword,
      mfaCode: passwordChange.mfaCode
    };
    try {
      const res = await changePassword(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.requiresPasswordChange) {
        setError(t("passwordChangeStillRequired", "Password change still required"));
        return;
      }
      if (res.session) {
        onLogin(res.session);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function handleOfflineReset(e: React.FormEvent) {
    e.preventDefault();
    if (!offlineReset.token || !offlineReset.password) {
      setError(t("offlineResetRequired", "Reset token and new password are required"));
      return;
    }
    if (offlineReset.password !== offlineReset.confirm) {
      setError(t("passwordsMismatch", "Passwords do not match"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await changePassword({
        token: offlineReset.token,
        username: form.username || defaultAdminUser,
        newPassword: offlineReset.password,
        mfaCode: form.mfaCode || undefined
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.session) onLogin(res.session);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-panel">
      <div className="muted small">{t("loginChooseMode", "Select a sign-in option available for your tenant.")}</div>
      <div className="login-panel__modes">
        {appConfig.authModes.oauth && (
          <button
            type="button"
            className={`login-mode ${mode === "oauth" ? "is-active" : ""}`}
            onClick={() => handleSelect("oauth")}
          >
            {t("loginSsoCta", "Sign in with SSO")}
          </button>
        )}
        {appConfig.authModes.simpleSignin && (
          <button
            type="button"
            className={`login-mode ${mode === "simple_signin" ? "is-active" : ""}`}
            onClick={() => handleSelect("simple_signin")}
          >
            {t("loginPasswordCta", "Username / Password")}
          </button>
        )}
        {appConfig.authModes.domainSignin && (
          <button
            type="button"
            className={`login-mode ${mode === "domain_signin" ? "is-active" : ""}`}
            onClick={() => handleSelect("domain_signin")}
          >
            {t("loginDomainCta", "Domain Login")}
          </button>
        )}
      </div>

      {passwordChange && (
        <form className="login-form" onSubmit={handlePasswordChange}>
          <div className="form-row">
            <label htmlFor="new-password">{t("loginNewPassword", "New password")}</label>
            <input
              id="new-password"
              required
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("loginUpdateDefault", "Update default/admin password")}
            />
          </div>
          <div className="form-row">
            <label htmlFor="confirm-password">{t("loginConfirmPassword", "Confirm password")}</label>
            <input
              id="confirm-password"
              required
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? t("saving", "Saving...") : t("loginSavePassword", "Save new password")}
          </button>
          <div className="muted small">
            {t("loginResetNote", "Required on first login or when policy forces a reset.")}
          </div>
        </form>
      )}

      {!passwordChange && mode && mode !== "oauth" && (
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="username">{t("loginUsername", "Username")}</label>
            <input
              id="username"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          {mode === "domain_signin" && (
            <div className="form-row">
              <label htmlFor="domain">{t("loginDomainOptional", "Domain (optional)")}</label>
              <input id="domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
              <div className="muted small">
                {t("loginDomainPlaceholder", "Enter your AD/LDAP domain (e.g., corp.local)")}
              </div>
            </div>
          )}
          <div className="form-row">
            <label htmlFor="password">{t("loginPassword", "Password")}</label>
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
              <label htmlFor="mfa">{t("loginMfa", "MFA code")}</label>
              <input
                id="mfa"
                required
                value={form.mfaCode}
                onChange={(e) => setForm({ ...form, mfaCode: e.target.value })}
              />
            </div>
          )}
          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? t("loginSubmitting", "Signing in...") : t("loginSubmit", "Sign in")}
          </button>
          <div className="form-row">
            <label htmlFor="reset-email">{t("loginResetEmail", "Password reset email")}</label>
            <div className="reset-row">
              <input
                id="reset-email"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <button
                type="button"
                className="ghost"
                disabled={pending}
                onClick={async () => {
                  setResetStatus(null);
                  setPending(true);
                  const res = await requestPasswordReset(form.username);
                  setResetStatus(
                    res.ok ? t("resetLinkSent", "Reset link sent") : (res.message ?? t("resetFailed", "Reset failed"))
                  );
                  setPending(false);
                }}
              >
                {t("sendResetLink", "Send reset link")}
              </button>
            </div>
            {resetStatus && <div className="muted small">{resetStatus}</div>}
          </div>
          {offlineResetEnabled && (
            <div className="form-row">
              <label htmlFor="offline-reset">{t("loginOfflineReset", "Offline reset (token)")}</label>
              <input
                id="offline-reset"
                value={offlineReset.token}
                onChange={(e) => setOfflineReset((prev) => ({ ...prev, token: e.target.value }))}
              />
              <input
                type="password"
                value={offlineReset.password}
                onChange={(e) => setOfflineReset((prev) => ({ ...prev, password: e.target.value }))}
              />
              <input
                type="password"
                value={offlineReset.confirm}
                onChange={(e) => setOfflineReset((prev) => ({ ...prev, confirm: e.target.value }))}
              />
              <button type="button" className="ghost" disabled={pending} onClick={handleOfflineReset}>
                {t("offlineResetCta", "Reset without email")}
              </button>
              <div className="muted small">
                {t(
                  "offlineResetHelp",
                  "Use when SMTP is unavailable. Token can come from admin CLI or manual backend reset. New password must meet your policy."
                )}
              </div>
            </div>
          )}
        </form>
      )}

      {mode === "oauth" && (
        <div className="login-help">
          Redirecting to identity provider. If nothing happens, ensure API base is reachable:
          <div className="gg-value">{appConfig.apiBaseUrl}</div>
        </div>
      )}

      <div className="login-foot">
        <span>
          {t("loginWsEndpoint", "WS Endpoint")}: {wsUrl()}
        </span>
        <span className="muted">{t("loginTokensStored", "Tokens stored locally; logout clears them.")}</span>
      </div>
      {error && (
        <div className="login-error">
          {t("errorPrefix", "Error")}: {error}
        </div>
      )}
    </div>
  );
}
