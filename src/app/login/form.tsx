"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="login-form">
      {error && <p className="banner banner-error">{error}</p>}
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Lösenord"
        aria-label="Lösenord"
        required
        autoFocus
      />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Loggar in…" : "Logga in"}
      </button>
    </form>
  );
}
