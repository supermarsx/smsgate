import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { clientConfig } from "../lib/config";
import { clearToken, getToken } from "../lib/token";
import { getWebSocketUrl, WsMessage } from "../lib/ws";
import { loadTranslations, Translations } from "../lib/lang";
import { MessageRecord } from "../server/types";

type ConnectionState = "connecting" | "connected" | "disconnected";

export default function MessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [keepMessages, setKeepMessages] = useState<number>(0);
  const [serverState, setServerState] = useState<ConnectionState>("connecting");
  const [phoneOnline, setPhoneOnline] = useState<boolean>(false);
  const [translations, setTranslations] = useState<Translations>({});
  const [syncHash, setSyncHash] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTranslations().then(setTranslations).catch(() => setTranslations({}));
  }, []);

  useEffect(() => {
    if (!clientConfig.management.notifications.enabled) return;
    if (!clientConfig.management.notifications.requestOnLoad) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  const t = useMemo(() => {
    return (key: string) => translations[key] ?? key;
  }, [translations]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }
    verifyToken(token).then((ok) => {
      if (!ok) {
        clearToken();
        router.replace("/");
      }
    });
  }, [router]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket(getWebSocketUrl());
    setServerState("connecting");

    ws.onopen = () => {
      setServerState("connected");
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as WsMessage;
      switch (data.type) {
        case "message":
          addMessage(data.payload);
          break;
        case "baseMessages":
          setMessages(data.payload);
          break;
        case "syncHash":
          setSyncHash(data.payload);
          break;
        case "keepMessages":
          setKeepMessages(data.payload);
          break;
        case "sourceStatus":
          setPhoneOnline(data.payload);
          break;
        case "error":
          setServerState("disconnected");
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      setServerState("disconnected");
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    if (serverState === "connected") return;
    if (!clientConfig.management.messages.enableHttpSync) return;
    let stopped = false;
    async function syncMessages() {
      try {
        const hashRes = await fetch("/api/messages/hash", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!hashRes.ok) return;
        const hashData = await hashRes.json();
        if (stopped) return;
        const nextHash = String(hashData?.hash ?? "");
        if (!nextHash || nextHash === syncHash) return;
        const res = await fetch("/api/messages/list", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setSyncHash(nextHash);
          reconcileMessages(data.messages);
        }
      } catch {
        // Ignore sync errors; WebSocket remains primary.
      }
    }

    const interval = window.setInterval(syncMessages, clientConfig.management.messages.syncIntervalMs);
    syncMessages();
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [syncHash, serverState]);

  useEffect(() => {
    if (!clientConfig.management.messages.showLatest) return;
    const element = scrollRef.current;
    if (!element) return;
    if (clientConfig.management.messages.invert) {
      element.scrollTop = 0;
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  function addMessage(message: MessageRecord): void {
    setMessages((prev) => {
      const next = clientConfig.management.messages.invert
        ? [message, ...prev]
        : [...prev, message];
      return trimMessages(next, keepMessages);
    });
    if (clientConfig.management.sound.enabled) {
      const audio = new Audio(
        `${clientConfig.management.sound.path}${clientConfig.management.sound.name}${clientConfig.management.sound.fileExt}`
      );
      audio.play().catch(() => undefined);
    }
    triggerNotification(message);
  }

  function triggerNotification(message: MessageRecord): void {
    if (!clientConfig.management.notifications.enabled) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (
      clientConfig.management.notifications.onlyWhenUnfocused &&
      typeof document !== "undefined" &&
      document.hasFocus()
    ) {
      return;
    }
    try {
      new Notification("New SMS", {
        body: `${message.number}: ${message.message}`,
        tag: "smsgate-message"
      });
    } catch {
      // Ignore notification errors.
    }
  }

  function messageKey(message: MessageRecord): string {
    return [
      message.number,
      message.date,
      message.message,
      message.receivedAtEpochMs ?? ""
    ].join("|");
  }

  function renderMetadata(message: MessageRecord): JSX.Element | null {
    const entries = message.extra ? Object.entries(message.extra) : [];
    if (!entries.length) return null;
    return (
      <p className="metadata">
        {entries.map(([key, value]) => (
          <span key={key}>
            {key}: {value}
            <br />
          </span>
        ))}
      </p>
    );
  }

  function reconcileMessages(serverMessages: MessageRecord[]): void {
    setMessages((prev) => {
      const map = new Map<string, MessageRecord>();
      for (const msg of prev) {
        map.set(messageKey(msg), msg);
      }
      for (const msg of serverMessages) {
        map.set(messageKey(msg), msg);
      }
      const merged = Array.from(map.values());
      const ordered = clientConfig.management.messages.invert
        ? [...merged].reverse()
        : merged;
      return trimMessages(ordered, keepMessages);
    });
  }

  function trimMessages(list: MessageRecord[], serverKeep: number): MessageRecord[] {
    const localKeep = clientConfig.management.messages.keep;
    const effectiveKeep =
      clientConfig.management.messages.keepFromServer && serverKeep > 0
        ? Math.min(serverKeep, localKeep)
        : localKeep;
    if (effectiveKeep <= 0) return list;
    return list.slice(-effectiveKeep);
  }

  async function verifyToken(token: string): Promise<boolean> {
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

  function closeSession(): void {
    clearToken();
    router.replace("/");
  }

  return (
    <>
      <Head>
        <title>{t("s_window")}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/css/device-mockups.min.css" />
        <link rel="stylesheet" href="/css/app/phone.css" />
        <link rel="stylesheet" href="/css/app/main.css" />
        <link rel="stylesheet" href="/css/bulma.min.css" />
      </Head>
      <div id="overlay" />
      <div className="brand-mark brand-mark--floating">smsrelay2</div>
      <div className="device-wrapper">
        <div className="device" data-device="iPhoneX" data-orientation="portrait" data-color="black">
          <div className="screen">
            <div className="status">
              <div className="contents noselect">
                <span
                  id="clientStatus"
                  title={t("s_serverconnected")}
                  className={serverState === "connected" ? "connected slow blink" : "disconnected slow blink"}
                >
                  {serverState === "connected" ? "✓" : "?"}
                </span>
                <span
                  id="sourceStatus"
                  title={phoneOnline ? t("s_phoneconnected") : t("s_phonewaiting")}
                  className={phoneOnline ? "connected slow blink" : "connecting normal blink"}
                >
                  {phoneOnline ? "✓" : "?"}
                </span>
              </div>
            </div>
            <div className="titlex noselect">
              <span>{t("s_receivedmessages")}</span>
            </div>
            <div className="containerx">
              <form className="chat">
                <div id="messagesx" className="messagesx" ref={scrollRef}>
                  {messages.map((msg, index) => (
                    <div key={`${msg.date}-${index}`} className="messagex">
                      <div className="fromThem">
                        <p className="origin noselect">
                          {msg.number}
                          <br />
                          {msg.date}
                        </p>
                        <p>{msg.message}</p>
                        {renderMetadata(msg)}
                      </div>
                    </div>
                  ))}
                </div>
                <div id="close" className="titlex noselect" onClick={closeSession}>
                  {t("s_closesession1")}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
