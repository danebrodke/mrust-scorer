"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "email" | "code";

export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
    return data;
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await post("/api/auth/request", { email });
      setDevCode(data.devCode ?? null);
      setDemo(Boolean(data.demo));
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await post("/api/auth/verify", { email, code });
      router.replace(data.admin ? "/admin" : "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={requestCode} className="login-form">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@institution.edu"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send passcode"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="login-form">
      <p className="muted">
        {demo ? (
          <>
            <strong>{email}</strong> is the demo account. Enter the demo passcode.
          </>
        ) : (
          <>
            A 6-digit passcode was sent to <strong>{email}</strong>.
          </>
        )}
      </p>
      {devCode && (
        <p className="devcode">
          Local preview (no email configured). Your code is <strong>{devCode}</strong>
        </p>
      )}
      <label htmlFor="code">Passcode</label>
      <input
        id="code"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        autoFocus
        required
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="123456"
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6}>
        {busy ? "Verifying…" : "Sign in"}
      </button>
      <button
        type="button"
        className="link"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
      >
        Use a different email
      </button>
    </form>
  );
}
