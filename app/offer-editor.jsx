"use client";
import React, { useState } from "react";
import { uid, today, safeUrl } from "../lib/core.mjs";
import {
  PAYMENT_FIELDS,
  normalizePayment,
  paymentErrors,
} from "../lib/payments.mjs";

const labels = {
  unknown: "Não confirmado",
  eligible: "Elegível: confirmei todas as regras",
  ineligible: "Não elegível",
  yes: "Sim, confirmado",
  no: "Não, são excludentes",
  BRL: "Pontos por R$ 1",
  USD: "Pontos por US$ 1",
};
export default function OfferEditor({ offer, seed, item, onSave, onClose }) {
  const [error, setError] = useState("");
  const p = normalizePayment((offer || seed)?.payment);
  function field([key, label, type, , options]) {
    return (
      <label
        className={"qc-field " + (type === "longtext" ? "qc-wide" : "")}
        key={key}
      >
        <span>{label}</span>
        {type === "enum" ? (
          <select aria-label={label} name={key} defaultValue={p[key]}>
            {options.map((v) => (
              <option key={v} value={v}>
                {labels[v] || v || "Não informado"}
              </option>
            ))}
          </select>
        ) : type === "boolean" ? (
          <select
            aria-label={label}
            name={key}
            defaultValue={p[key] ? "sim" : "nao"}
          >
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
          </select>
        ) : type === "longtext" ? (
          <textarea
            aria-label={label}
            name={key}
            defaultValue={p[key]}
            rows={3}
            maxLength={3000}
          />
        ) : (
          <input
            aria-label={label}
            name={key}
            type={
              ["number", "amount", "integer"].includes(type)
                ? "number"
                : type === "date"
                  ? "date"
                  : type === "url"
                    ? "url"
                    : "text"
            }
            min={type === "integer" ? 1 : 0}
            max={type === "integer" ? 120 : undefined}
            step={type === "integer" ? 1 : "any"}
            maxLength={type === "date" ? 10 : type === "url" ? 3000 : 300}
            defaultValue={p[key] ?? ""}
          />
        )}
      </label>
    );
  }
  function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payment = Object.fromEntries(
      PAYMENT_FIELDS.map(([key, , type]) => [
        key,
        type === "boolean"
          ? f.get(key) === "sim"
          : ["number", "amount", "integer"].includes(type)
            ? f.get(key) === ""
              ? type === "number"
                ? null
                : type === "integer"
                  ? 1
                  : 0
              : Number(f.get(key))
            : String(f.get(key) || "").trim(),
      ]),
    );
    const value = offer
      ? { ...offer, payment }
      : {
          id: uid(),
          itemId: item.id,
          model: String(f.get("model")).trim(),
          store: String(f.get("store")).trim(),
          price: Number(f.get("price")),
          shipping: f.get("shipping") === "" ? null : Number(f.get("shipping")),
          url: safeUrl(f.get("url")),
          date: String(f.get("date")),
          rating: null,
          reviewCount: null,
          imageUrl: "",
          currency: "BRL",
          delivery: "",
          provider: "Cadastro manual",
          notes: "",
          source: "manual",
          payment,
        };
    const errors = paymentErrors(payment, value);
    if (
      !offer &&
      (!(value.price > 0) || !value.model || !value.url || !value.date)
    )
      errors.push("Informe produto, preço total, link e data da consulta.");
    if (errors.length) return setError(errors[0]);
    onSave(value);
    onClose();
  }
  return (
    <section
      className="qc-offer-editor"
      aria-label="Configurar oferta e pontos"
    >
      <h3>
        {offer ? "Pagamento e pontos desta opção" : "Cadastrar opção de compra"}
      </h3>
      <p>
        Cadastre uma opção para Pix e outra para cartão. Todos os valores são
        por unidade. O preço deve incluir juros; taxas são apenas custos
        adicionais. Não há taxas de pontos ou câmbio predefinidos.
      </p>
      <form onSubmit={submit}>
        {!offer && (
          <div className="qc-form-grid">
            <label className="qc-field qc-wide">
              <span>Produto / modelo</span>
              <input
                name="model"
                required
                maxLength={500}
                defaultValue={seed?.model || item.name}
              />
            </label>
            <label className="qc-field">
              <span>Loja</span>
              <input
                name="store"
                maxLength={300}
                defaultValue={seed?.store || ""}
              />
            </label>
            <label className="qc-field">
              <span>Preço unitário total (R$)</span>
              <input
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={seed?.price ?? ""}
              />
            </label>
            <label className="qc-field">
              <span>Frete por unidade (R$; vazio se desconhecido)</span>
              <input
                name="shipping"
                type="number"
                min="0"
                step="0.01"
                defaultValue={seed?.shipping ?? ""}
              />
            </label>
            <label className="qc-field">
              <span>Data da consulta</span>
              <input
                name="date"
                type="date"
                required
                defaultValue={today()}
                max={today()}
              />
            </label>
            <label className="qc-field qc-wide">
              <span>Link da oferta</span>
              <input
                name="url"
                type="url"
                required
                maxLength={3000}
                defaultValue={seed?.url || ""}
              />
            </label>
          </div>
        )}
        <div className="qc-form-grid">
          {PAYMENT_FIELDS.slice(0, 3).map(field)}
        </div>
        <details open={!!p.cardProgram}>
          <summary>Pontos do cartão</summary>
          <p>
            A taxa depende do cartão e da variante. Use as regras do emissor;
            para pontos por dólar, informe a cotação do emissor. Sem base
            explícita, usa-se só o preço do produto.
          </p>
          <div className="qc-form-grid">
            {PAYMENT_FIELDS.slice(3, 13).map(field)}
          </div>
        </details>
        <details open={!!p.partnerProgram}>
          <summary>Parceria da loja e clube de pontos</summary>
          <p>
            Confira a página oficial do parceiro e a taxa para seu perfil. Não
            marque assinatura se você não tem o clube. Base padrão: preço do
            produto, sem frete e taxas. Sem data final, a campanha precisa ser
            reconfirmada a cada dia.
          </p>
          <a
            href="https://www.livelo.com.br/juntar-pontos/todos-os-parceiros"
            target="_blank"
            rel="noopener noreferrer"
          >
            Consultar parceiros Livelo ↗
          </a>
          <div className="qc-form-grid">
            {PAYMENT_FIELDS.slice(13, 24).map(field)}
          </div>
        </details>
        <div className="qc-form-grid">
          {PAYMENT_FIELDS.slice(24).map(field)}
        </div>
        {error && (
          <p className="qc-error" role="alert">
            {error}
          </p>
        )}
        <div className="qc-form-footer">
          <button type="button" className="qc-button" onClick={onClose}>
            Cancelar condições
          </button>
          <button className="qc-button qc-primary">
            Salvar oferta e condições
          </button>
        </div>
      </form>
    </section>
  );
}
