import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { clientConfig } from "../lib/config";
import { hashToken, setToken, getToken } from "../lib/token";
import { loadTranslations, Translations } from "../lib/lang";

type Status = "idle" | "checking" | "valid" | "invalid" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [translations, setTranslations] = useState<Translations>({});

  useEffect(() => {
    loadTranslations().then(setTranslations).catch(() => setTranslations({}));
  }, []);

  const t = useMemo(() => {
    return (key: string) => translations[key] ?? key;
  }, [translations]);

  useEffect(() => {
    if (!clientConfig.authorization.sendLogin) return;
    const token = getToken();
    if (!token) return;
    setStatus("checking");
    checkToken(token).then((ok) => {
      if (ok) {
        setStatus("valid");
        router.replace("/messages");
      } else {
        setStatus("invalid");
      }
    }).catch(() => setStatus("error"));
  }, [router]);

  async function checkToken(token: string): Promise<boolean> {
    const res = await fetch("/api/token/check", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    const text = await res.text();
    return text === "Valid token";
  }

  async function handleLogin(): Promise<void> {
    setStatus("checking");
    try {
      const token = await hashToken(password);
      setToken(token);
      const ok = await checkToken(token);
      if (ok) {
        setStatus("valid");
        router.replace("/messages");
      } else {
        setStatus("invalid");
      }
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
            <div className="py-5">
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
              {status === "error" && (
                <div className="notification is-danger is-light">{t("s_errorcode")}</div>
              )}
              <div className="control">
                <input
                  id="password"
                  className="input has-background-grey-darker has-text-white-bis"
                  type="password"
                  placeholder={t("s_accesscode")}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleLogin();
                    }
                  }}
                />
              </div>
              <div className="control">
                <button
                  id="login"
                  className="button has-background-grey-lighter"
                  onClick={handleLogin}
                >
                  {t("s_login")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
