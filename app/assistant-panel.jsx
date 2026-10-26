"use client";
import React, { useState, useRef, useEffect } from "react";
import { api } from "../lib/api-client.mjs";
export default function AssistantPanel({ projectId, cloud }) {
  const [message, setMessage] = useState(""),
    [replies, setReplies] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function ask(event) {
    event.preventDefault();
    if (!cloud || busy || !message.trim()) return;
    const question = message.trim();
    setBusy(true);
    setError("");
    try {
      await cloud.flush();
      const history = replies.flatMap((r) => [
        { role: "user", content: r.question },
        { role: "assistant", content: r.answer },
      ]);
      const result = await api("/api/assistant", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          message: question,
          history: history.slice(-6),
        }),
      });
      if (active.current) {
        setReplies((r) => [...r, { question, answer: result.answer }]);
        setMessage("");
      }
    } catch (e) {
      if (active.current) setError(e.message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="qc-assistant">
      <span className="qc-ai-orb">✧</span>
      <div className="qc-eyebrow">ASSISTENTE DE COMPRAS</div>
      <h2>
        Boas escolhas começam
        <br />
        com as perguntas certas.
      </h2>
      <p>
        Revise o planejamento, descubra o que falta e organize prioridades com o
        contexto deste projeto.
      </p>
      {!cloud && (
        <p className="qc-demo-note">
          O assistente estará disponível quando as contas e a conexão de IA
          forem configuradas. As importações e o checklist continuam
          disponíveis.
        </p>
      )}
      <div className="qc-ai-starters">
        {[
          "O que pode estar faltando na minha lista?",
          "Quais compras devo priorizar?",
          "Como posso ajustar o planejamento ao orçamento?",
        ].map((question) => (
          <button
            className="qc-button"
            key={question}
            onClick={() => setMessage(question)}
          >
            {question}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {replies.map((reply, index) => (
          <article className="qc-ai-reply" key={index}>
            <strong>{reply.question}</strong>
            <p style={{ whiteSpace: "pre-wrap" }}>{reply.answer}</p>
          </article>
        ))}
      </div>
      <form className="qc-chat-form" onSubmit={ask}>
        <label className="qc-field">
          <span>Sua pergunta</span>
          <textarea
            aria-label="Pergunta ao assistente"
            value={message}
            maxLength={2000}
            rows={3}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ex.: O que devo conferir antes de comprar os eletrodomésticos?"
            required
          />
        </label>
        <button
          className="qc-button qc-primary"
          disabled={!cloud || busy || !message.trim()}
        >
          {busy ? "Pensando…" : "Perguntar à IA"}
        </button>
      </form>
      {error && (
        <p className="qc-error" role="alert">
          {error}
        </p>
      )}
      <small>
        O assistente analisa seu projeto. Use Buscar opções em um item para
        consultar preços e ofertas reais.
      </small>
    </section>
  );
}
