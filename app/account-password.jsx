"use client";
import React, { useState } from "react";
import { authClient } from "../lib/auth-client.mjs";
export default function AccountPassword() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    if (values.get("newPassword") !== values.get("confirm")) {
      setMessage("As novas senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.changePassword({
        currentPassword: String(values.get("currentPassword")),
        newPassword: String(values.get("newPassword")),
        revokeOtherSessions: true,
      });
      if (result.error)
        throw new Error(
          "Não foi possível trocar a senha. Confira a senha atual.",
        );
      form.reset();
      setMessage("Senha atualizada. As outras sessões foram encerradas.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="qc-password">
      <summary>Trocar senha</summary>
      <form onSubmit={submit}>
        <label className="qc-field">
          <span>Senha atual</span>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label className="qc-field">
          <span>Nova senha (mínimo de 10 caracteres)</span>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            required
          />
        </label>
        <label className="qc-field">
          <span>Repita a nova senha</span>
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            required
          />
        </label>
        <button className="qc-button qc-primary" disabled={busy}>
          {busy ? "Salvando…" : "Atualizar senha"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
