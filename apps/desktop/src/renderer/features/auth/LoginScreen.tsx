import { useState } from "react";
import { useProfileStore, useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import "./LoginScreen.css";

const SERVER_NAME = "JLUMCNS-MEC";
const SERVER_URL = "https://notes.jlu-mcns.site";

type IpcResult<T> = {
  ok: boolean;
  data?: T;
  error?: { message: string };
};

type Step = "email" | "link";

export default function LoginScreen({
  notice = "",
}: {
  notice?: string;
}): React.ReactElement {
  const api = useElectronAPI();
  const addProfile = useProfileStore((s) => s.addProfile);
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(notice);

  const saveProfile = async (token: string) => {
    setStatus("正在保存登录信息…");
    const createResult = (await api.profiles.create({
      name: SERVER_NAME,
      serverUrl: SERVER_URL,
      apiKey: token,
    })) as IpcResult<{ id: string }>;

    if (createResult.ok && createResult.data) {
      addProfile({
        id: createResult.data.id,
        name: SERVER_NAME,
        serverUrl: SERVER_URL,
        createdAt: new Date().toISOString(),
      });
      setActiveProfileId(createResult.data.id);
    } else {
      setError(createResult.error?.message || "保存登录信息失败");
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError("");
    setStatus("正在发送登录邮件…");

    try {
      const result = (await api.auth.requestEmailLogin(
        email.trim(),
      )) as IpcResult<{ sent: boolean }>;

      if (result.ok) {
        setStep("link");
      } else {
        setError(result.error?.message || "发送失败，请重试");
      }
    } catch {
      setError("发生意外错误，请重试");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const handleCompleteLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link.trim() || busy) return;
    setBusy(true);
    setError("");
    setStatus("正在验证登录链接…");

    try {
      const result = (await api.auth.completeEmailLogin(
        link.trim(),
        email.trim(),
      )) as IpcResult<{ token: string }>;

      if (result.ok && result.data?.token) {
        await saveProfile(result.data.token);
      } else {
        setError(result.error?.message || "登录失败，请重试");
      }
    } catch {
      setError("发生意外错误，请重试");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const handleBrowserLogin = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("已打开登录窗口，请在窗口中完成登录…");

    try {
      const result = (await api.auth.loginWithBrowser()) as IpcResult<{
        token: string;
      }>;

      if (result.ok && result.data?.token) {
        await saveProfile(result.data.token);
      } else {
        setError(result.error?.message || "登录失败");
      }
    } catch {
      setError("发生意外错误，请重试");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#4c6ef5" />
            <path d="M14 16h20v2H14v-2zm0 6h20v2H14v-2zm0 6h14v2H14v-2z" fill="white" />
          </svg>
        </div>

        <h1 className="login-title">Outline Desktop</h1>
        <p className="login-subtitle">JLUMCNS-MEC 知识库</p>

        <div className="login-server-badge">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.5 5h-1.687a5.993 5.993 0 00-1.22-3.368A5.508 5.508 0 0111.5 6zm-7 0h1.687a5.993 5.993 0 011.22-3.368A5.508 5.508 0 014.5 6zM8 2.158A4.508 4.508 0 019.198 4.5H6.802A4.508 4.508 0 018 2.158z" />
          </svg>
          <span>{SERVER_URL}</span>
        </div>

        {(error || status) && (
          <p className={error ? "login-error" : "login-status"}>
            {error || status}
          </p>
        )}

        {step === "email" ? (
          <form className="login-form" onSubmit={handleSendEmail}>
            <p className="login-description">
              输入你的邮箱，我们会发送一封包含登录链接的邮件。
            </p>

            <input
              className="login-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              disabled={busy}
            />

            <button
              className="login-button"
              type="submit"
              disabled={busy || !email.trim()}
            >
              {busy ? (
                <>
                  <span className="login-spinner" />
                  发送中…
                </>
              ) : (
                "发送登录邮件"
              )}
            </button>

            <button
              type="button"
              className="login-button login-button-secondary"
              onClick={handleBrowserLogin}
              disabled={busy}
            >
              使用浏览器窗口登录
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleCompleteLogin}>
            <p className="login-description">
              验证邮件已发送至 <strong>{email}</strong>。
              <br />
              请输入邮件中的 <strong>6 位验证码</strong>
              ；如果邮件里是登录链接，也可以复制链接粘贴到这里（不要点击链接）。
            </p>

            <input
              className="login-input"
              type="text"
              placeholder="6 位验证码，或粘贴登录链接"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              autoFocus
              disabled={busy}
              spellCheck={false}
              autoComplete="one-time-code"
            />

            <button
              className="login-button"
              type="submit"
              disabled={busy || !link.trim()}
            >
              {busy ? (
                <>
                  <span className="login-spinner" />
                  验证中…
                </>
              ) : (
                "完成登录"
              )}
            </button>

            <button
              type="button"
              className="login-link-button"
              onClick={() => {
                setStep("email");
                setLink("");
                setError("");
              }}
              disabled={busy}
            >
              ← 换个邮箱 / 重新发送
            </button>

            <p className="login-hint">
              验证码/链接 10 分钟内有效，且只能使用一次。失效请返回上一步重新发送。
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
