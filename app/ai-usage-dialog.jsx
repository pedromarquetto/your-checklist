"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api-client.mjs";
import { formatAiCost } from "../lib/ai-cost-format.mjs";

const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const number = new Intl.NumberFormat("pt-BR");
const statuses = {
  pending: "Em andamento",
  completed: "Concluída",
  empty: "Sem ofertas verificáveis",
  failed: "Falhou",
};
const tokens = (count) => (count == null ? "—" : number.format(count));

export default function AiUsageDialog({ onClose }) {
  const dialog = useRef(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(`/api/ai-usage?offset=${offset}`, { signal: controller.signal })
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, refresh]);

  const summary = data?.summary;
  return (
    <dialog
      className="qc-usage-dialog"
      ref={dialog}
      onClose={onClose}
      aria-labelledby="qc-usage-title"
    >
      <header>
        <h2 id="qc-usage-title">Uso da IA</h2>
        <form method="dialog">
          <button>Fechar</button>
        </form>
      </header>
      <p>
        Histórico da sua conta. Os valores em dólares são estimativas baseadas
        no uso informado pelo provedor.
      </p>
      {summary && (
        <dl className="qc-usage-totals">
          <div>
            <dt>Total estimado</dt>
            <dd>
              {summary.requests
                ? formatAiCost(summary.estimatedCostUsd)
                : formatAiCost(0)}
            </dd>
          </div>
          <div>
            <dt>Pesquisas com IA</dt>
            <dd>{number.format(summary.researches)}</dd>
          </div>
          <div>
            <dt>Perguntas ao assistente</dt>
            <dd>{number.format(summary.requests - summary.researches)}</dd>
          </div>
        </dl>
      )}
      {summary?.withoutEstimate > 0 && (
        <p>
          {number.format(summary.withoutEstimate)}{" "}
          {summary.withoutEstimate === 1
            ? "consulta ainda sem estimativa"
            : "consultas ainda sem estimativa"}
          .
        </p>
      )}
      {loading && <p role="status">Carregando histórico…</p>}
      {error && <p role="alert">{error}</p>}
      {summary?.requests === 0 && (
        <p>As próximas chamadas de IA vão aparecer aqui.</p>
      )}
      {data?.entries.length > 0 && (
        <div
          className="qc-usage-table"
          role="region"
          aria-label="Histórico de chamadas de IA"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Consulta</th>
                <th scope="col">Custo estimado</th>
                <th scope="col">Modelo</th>
                <th scope="col">Tokens entrada / saída</th>
                <th scope="col">Chamadas web</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row">
                    {entry.query || "Assistente IA"}
                    <small>{date.format(new Date(entry.createdAt))}</small>
                  </th>
                  <td>{formatAiCost(entry.estimatedCostUsd)}</td>
                  <td>
                    {entry.model}
                    <small>{entry.provider}</small>
                  </td>
                  <td>
                    {tokens(entry.inputTokens)} / {tokens(entry.outputTokens)}
                    {entry.cachedInputTokens > 0 && (
                      <small>{tokens(entry.cachedInputTokens)} em cache</small>
                    )}
                  </td>
                  <td>{tokens(entry.webCalls)}</td>
                  <td>{statuses[entry.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setOffset(0);
            setRefresh((value) => value + 1);
          }}
        >
          Atualizar histórico
        </button>
        {summary?.requests > data?.limit && (
          <div>
            <button
              type="button"
              disabled={loading || offset === 0}
              onClick={() => setOffset(offset - data.limit)}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={loading || offset + data.limit >= summary.requests}
              onClick={() => setOffset(offset + data.limit)}
            >
              Próxima
            </button>
          </div>
        )}
      </footer>
    </dialog>
  );
}
