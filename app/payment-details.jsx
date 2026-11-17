"use client";
import React from "react";
import { money, safeUrl } from "../lib/core.mjs";
import {
  evaluatePayment,
  normalizePayment,
  paymentLabel,
} from "../lib/payments.mjs";

export default function PaymentDetails({ offer }) {
  const p = normalizePayment(offer.payment),
    result = evaluatePayment(offer);
  return (
    <section
      className="qc-payment-summary"
      aria-label="Análise de pagamento e pontos"
    >
      <strong>{paymentLabel(p)}</strong>
      <p>
        Valores por unidade. Preço anunciado total: {money(offer.price)}
        {p.installments > 1
          ? ` (${p.installments}x de ${money(offer.price / p.installments)}, antes de frete e taxas)`
          : ""}
        .
      </p>
      {(p.fees > 0 || p.clubCost > 0) && (
        <p>
          Taxas extras: {money(p.fees)} · custo adicional do clube:{" "}
          {money(p.clubCost)}.
        </p>
      )}
      {result.rewards
        .filter((r) => r.status !== "none")
        .map((r) => (
          <div key={r.kind} className="qc-reward">
            <span>
              {r.kind === "card" ? "Cartão" : "Parceiro da loja"} ·{" "}
              {r.program || "Programa não informado"}
            </span>
            <b>
              {r.status === "eligible"
                ? `${r.points.toLocaleString("pt-BR")} pontos estimados`
                : r.status === "ineligible"
                  ? "Não elegível nesta condição"
                  : "Pontuação pendente de confirmação"}
            </b>
            {r.status === "eligible" && r.value !== null && (
              <span>
                Benefício estimado: {money(r.value)}
                {!result.applied.includes(r.kind) ? " · não somado" : ""}
              </span>
            )}
            {p[r.kind + "Source"] && (
              <a
                href={safeUrl(p[r.kind + "Source"])}
                target="_blank"
                rel="noopener noreferrer"
              >
                Regras verificadas em{" "}
                {p[r.kind + "VerifiedAt"] || "data não informada"} ↗
              </a>
            )}
            {p[r.kind + "ExpiresAt"] && (
              <span>Válido até {p[r.kind + "ExpiresAt"]}</span>
            )}
          </div>
        ))}
      {!result.rewards.some((r) => r.status !== "none") && (
        <p>
          Nenhuma pontuação informada. Verifique as regras do cartão e da loja
          para esta compra.
        </p>
      )}
      {result.effective !== null && result.benefit > 0 && (
        <p>
          <strong>
            Custo após benefício estimado: {money(result.effective)}
          </strong>
        </p>
      )}
      {result.warnings.length > 0 && (
        <ul>
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {p.conditions && <p>{p.conditions}</p>}
      <small>
        Pontos não reduzem o valor da compra nem são dinheiro disponível. A
        estimativa depende da sua avaliação por mil pontos e das regras
        confirmadas. Resgate, prazo e arredondamento do emissor podem variar.
      </small>
    </section>
  );
}
