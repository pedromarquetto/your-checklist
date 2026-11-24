"use client";
import React, { useState, useRef, useEffect } from "react";
import { money, safeUrl, offerResearchPrompt } from "../lib/core.mjs";
import OfferImage from "./offer-image.jsx";
import PaymentDetails from "./payment-details.jsx";
import OfferEditor from "./offer-editor.jsx";
import { filterOffers, totalPrice, latestOffers } from "../lib/offers.mjs";
import { formatAiCost } from "../lib/ai-cost-format.mjs";
import {
  searchOffers,
  researchOffers,
  isInlinePreview,
} from "../lib/shopping-client.mjs";

export default function OffersPanel({
  item,
  importedOffers,
  onChoose,
  onSaveOffer,
  onImport,
  onTemplate,
  onExport,
  initialMode = "imported",
  cloud = null,
  onResults = () => {},
}) {
  const [editing, setEditing] = useState(null);
  const [mode, setMode] = useState(initialMode),
    [query, setQuery] = useState(item.name),
    [live, setLive] = useState([]),
    [observedAt, setObservedAt] = useState(""),
    [usage, setUsage] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [copyNotice, setCopyNotice] = useState("");
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    minRating: 0,
    minReviews: 0,
    freeShipping: false,
    withinBudget: false,
    sort: "price",
  });
  const abort = useRef(null),
    requestId = useRef(0);
  useEffect(() => () => abort.current?.abort(), []);
  const change = (name, value) => setFilters((f) => ({ ...f, [name]: value }));
  const base = latestOffers(
    mode === "imported"
      ? importedOffers.filter((o) => o.source !== "demo")
      : live.map((o) => importedOffers.find((saved) => saved.id === o.id) || o),
  );
  const offers = filterOffers(base, { ...filters, budget: item.unitBudget });
  const cheapest = [...offers]
    .filter((o) => totalPrice(o) !== null)
    .sort((a, b) => totalPrice(a) - totalPrice(b))[0]?.id;
  async function search(e) {
    e.preventDefault();
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++requestId.current;
    setError("");
    setLoading(true);
    setLive([]);
    setObservedAt("");
    setUsage(null);
    try {
      await cloud?.flush();
      const result = await (
        mode === "research" ? researchOffers : searchOffers
      )(query, item.id, controller.signal);
      if (id === requestId.current) {
        setLive(result.offers);
        setObservedAt(result.observedAt);
        setUsage(result.usage ?? null);
        onResults(result.offers);
        if (mode === "research")
          setCopyNotice(
            result.offers.length
              ? "Pesquisa salva. Confira as fontes e complete as condições pessoais para comparar pontos."
              : "Nenhuma oferta com fonte verificável foi encontrada. Tente uma busca mais específica.",
          );
        if (result.warnings?.length)
          setCopyNotice((result.warnings || []).join(" "));
      }
    } catch (err) {
      if (err.name !== "AbortError" && id === requestId.current)
        setError(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  function changeMode(next) {
    abort.current?.abort();
    requestId.current++;
    setMode(next);
    setLive([]);
    setObservedAt("");
    setUsage(null);
    setCopyNotice("");
    setError("");
    setLoading(false);
  }
  const webUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query || item.name)}`;
  return (
    <div className="qc-detail-content qc-shopping-panel">
      <div className="qc-shopping-heading">
        <div className="qc-eyebrow">ENCONTRE A MELHOR OPÇÃO PARA ESTE ITEM</div>
        <h3>Preço é só parte da escolha.</h3>
        <p>Compare custo, avaliações e condições antes de comprar.</p>
      </div>
      <section className="qc-research-import">
        <strong>Traga as opções que você pesquisou.</strong>
        <p>
          Cadastre uma opção ou importe a pesquisa em CSV, incluindo pagamento e
          pontos.
        </p>
        <div>
          <button
            className="qc-button qc-primary"
            onClick={() => setEditing({ new: true })}
          >
            ＋ Cadastrar opção
          </button>
          <button className="qc-button" onClick={onImport}>
            ↥ Importar opções para este item
          </button>
          <button className="qc-button" onClick={() => onTemplate("csv")}>
            ↧ Template CSV
          </button>
          <button className="qc-button" onClick={() => onTemplate("xlsx")}>
            ↧ Excel
          </button>
          <button
            className="qc-button"
            disabled={!importedOffers.length}
            onClick={onExport}
          >
            Exportar opções
          </button>
        </div>
        <details>
          <summary>Pedido pronto para pesquisar com IA</summary>
          <textarea
            aria-label="Pedido de pesquisa para IA"
            readOnly
            rows="7"
            value={offerResearchPrompt(item)}
          />
          <button
            className="qc-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(offerResearchPrompt(item));
                setCopyNotice("Pedido copiado.");
              } catch {
                setCopyNotice("Selecione e copie o pedido acima.");
              }
            }}
          >
            Copiar pedido de pesquisa
          </button>
          <span role="status">{copyNotice}</span>
        </details>
      </section>
      {editing && (
        <OfferEditor
          offer={editing.new ? null : editing}
          seed={editing.seed}
          item={item}
          onClose={() => setEditing(null)}
          onSave={(offer) => {
            onSaveOffer(offer);
            setMode("imported");
          }}
        />
      )}
      <div className="qc-shopping-modes" aria-label="Fonte de ofertas">
        {[
          ["imported", "Salvas"],
          ["live", "Busca ao vivo"],
          ["research", "Pesquisar preços e pontos com IA"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={mode === id}
            onClick={() => changeMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "imported" && (
        <div className="qc-demo-note">
          Uma opção atual por produto e condição de pagamento. Pix, cartão,
          parcelas e programas podem coexistir. Consultas anteriores ficam na
          aba Histórico. Avaliações e frete desconhecidos permanecem sem
          informação.
        </div>
      )}
      {["live", "research"].includes(mode) && (
        <div className="qc-live-area">
          {mode === "research" && (
            <p className="qc-muted">
              A IA pesquisa produtos e regras de parceiros na web. Confira os
              regulamentos; cartão, assinatura e valor dos seus pontos precisam
              da sua confirmação. A função requer conexão OpenAI.
            </p>
          )}
          <form className="qc-product-query" onSubmit={search}>
            <label className="qc-field">
              <span>Qual produto você está procurando?</span>
              <input
                aria-label="Busca de produto"
                value={query}
                maxLength={200}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Marca, modelo, tamanho, voltagem..."
              />
            </label>
            <button
              className="qc-button qc-primary"
              disabled={
                loading || query.trim().length < 3 || isInlinePreview || !cloud
              }
            >
              {loading
                ? "Consultando..."
                : mode === "research"
                  ? "Pesquisar com IA"
                  : "Buscar ofertas"}
            </button>
          </form>
          {(isInlinePreview || !cloud) && (
            <div className="qc-demo-note">
              Entre na conta para usar a busca ao vivo quando o provedor estiver
              configurado. Você pode importar pesquisas ou abrir a busca
              externa.
            </div>
          )}
          {error && (
            <p className="qc-error" role="alert">
              {error}
            </p>
          )}
          {observedAt && (
            <p className="qc-source-time">
              Consulta realizada em{" "}
              {new Date(observedAt).toLocaleString("pt-BR")} · dados da fonte,
              sujeitos a alteração na loja.
            </p>
          )}
          {usage && (
            <p className="qc-source-time">
              Custo estimado da pesquisa ·{" "}
              {formatAiCost(usage.estimatedCostUsd)}
              {" · "}
              {usage.model}
            </p>
          )}
        </div>
      )}
      <div className="qc-shopping-filters">
        <label className="qc-field">
          <span>Preço mínimo (R$)</span>
          <input
            aria-label="Preço mínimo"
            type="number"
            min="0"
            step="0.01"
            value={filters.minPrice}
            onChange={(e) => change("minPrice", e.target.value)}
            placeholder="Sem mínimo"
          />
        </label>
        <label className="qc-field">
          <span>Preço máximo (R$)</span>
          <input
            aria-label="Preço máximo"
            type="number"
            min="0"
            step="0.01"
            value={filters.maxPrice}
            onChange={(e) => change("maxPrice", e.target.value)}
            placeholder="Sem limite"
          />
        </label>
        <label className="qc-field">
          <span>Avaliação mínima</span>
          <select
            aria-label="Avaliação mínima"
            value={filters.minRating}
            onChange={(e) => change("minRating", Number(e.target.value))}
          >
            <option value="0">Todas as notas</option>
            <option value="4">4 estrelas ou mais</option>
            <option value="4.5">4,5 estrelas ou mais</option>
            <option value="4.8">4,8 estrelas ou mais</option>
          </select>
        </label>
        <label className="qc-field">
          <span>Quantidade de avaliações</span>
          <select
            aria-label="Quantidade mínima de avaliações"
            value={filters.minReviews}
            onChange={(e) => change("minReviews", Number(e.target.value))}
          >
            <option value="0">Qualquer quantidade</option>
            <option value="50">50 avaliações ou mais</option>
            <option value="100">100 avaliações ou mais</option>
            <option value="500">500 avaliações ou mais</option>
          </select>
        </label>
        <label className="qc-field qc-wide">
          <span>Ordenar resultados</span>
          <select
            aria-label="Ordenar ofertas"
            value={filters.sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="price">Menor desembolso total informado</option>
            <option value="effective">
              Menor custo com pontos confirmados e valorados
            </option>
            <option value="expensive">Maior preço do produto</option>
            <option value="rating">Melhor avaliação</option>
            <option value="reviews">Mais avaliações</option>
          </select>
        </label>
        <label className="qc-shopping-check">
          <input
            type="checkbox"
            checked={filters.freeShipping}
            onChange={(e) => change("freeShipping", e.target.checked)}
          />{" "}
          Apenas frete grátis
        </label>
        <label className="qc-shopping-check">
          <input
            type="checkbox"
            checked={filters.withinBudget}
            onChange={(e) => change("withinBudget", e.target.checked)}
          />{" "}
          Total dentro do previsto
        </label>
      </div>
      {copyNotice && (
        <p role="status" className="qc-muted">
          {copyNotice}
        </p>
      )}
      <div className="qc-offer-results">
        <span aria-live="polite">
          {offers.length} de {base.length} opções
        </span>
        <button
          className="qc-text-button"
          onClick={() =>
            setFilters({
              minPrice: "",
              maxPrice: "",
              minRating: 0,
              minReviews: 0,
              freeShipping: false,
              withinBudget: false,
              sort: "price",
            })
          }
        >
          Limpar filtros
        </button>
      </div>
      {offers.map((o) => (
        <article
          key={o.id}
          className={"qc-offer " + (o.id === cheapest ? "best" : "")}
        >
          <div className="qc-offer-layout">
            <OfferImage src={o.imageUrl} name={o.model} />
            <div className="qc-offer-body">
              <div className="qc-offer-title">
                <strong>{o.store}</strong>
                <small>
                  {o.source === "live"
                    ? "CONSULTADO"
                    : o.source === "manual"
                      ? "CADASTRADO"
                      : "IMPORTADO"}
                  {o.id === cheapest ? " · MENOR TOTAL INFORMADO" : ""}
                </small>
              </div>
              <p>{o.model}</p>
              <div className="qc-offer-rating">
                {Number.isFinite(o.rating) ? (
                  <>
                    <strong>
                      ★{" "}
                      {o.rating.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                      })}
                    </strong>
                    <span>
                      {" "}
                      / 5 ·{" "}
                      {o.reviewCount?.toLocaleString("pt-BR") ??
                        "Sem total de"}{" "}
                      avaliações
                    </span>
                  </>
                ) : (
                  <span>Avaliação não informada pela fonte</span>
                )}
              </div>
              <div className="qc-offer-price">
                <span>
                  {totalPrice(o) !== null
                    ? "Desembolso total por unidade"
                    : "Preço unitário; total ainda incompleto"}
                </span>
                <strong>{money(totalPrice(o) ?? o.price)}</strong>
                <span>
                  {o.shipping === 0
                    ? "Frete grátis"
                    : Number.isFinite(o.shipping)
                      ? `${money(o.price)} + ${money(o.shipping)} de frete`
                      : "Preço do produto · frete a confirmar"}
                </span>
              </div>
              <PaymentDetails offer={o} />
              <button className="qc-text-button" onClick={() => setEditing(o)}>
                Pagamento e pontos
              </button>
              <button
                className="qc-text-button"
                onClick={() => setEditing({ new: true, seed: o })}
              >
                Cadastrar outra condição
              </button>
              <div className="qc-offer-provenance">
                <span>
                  Consulta:{" "}
                  {o.observedAt
                    ? new Date(o.observedAt).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })
                    : o.date?.split("-").reverse().join("/")}
                </span>
                {o.provider && <span>Fonte: {o.provider}</span>}
                {o.notes && <p>{o.notes}</p>}
              </div>
              <div className="qc-offer-footer">
                <span>{o.delivery || "Prazo não informado"}</span>
                <button className="qc-button" onClick={() => onChoose(o)}>
                  Escolher opção
                </button>
              </div>
              {o.url && (
                <a
                  className="qc-text-button"
                  href={safeUrl(o.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver oferta ↗
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
      {!offers.length && (
        <div className="qc-shopping-empty">
          <strong>
            {base.length
              ? "Nenhuma opção com esses filtros"
              : ["live", "research"].includes(mode)
                ? "Sua busca começa aqui"
                : "Importe suas primeiras opções"}
          </strong>
          <p>
            {base.length
              ? "Tente ampliar a faixa de preço ou reduzir a nota mínima."
              : ["live", "research"].includes(mode)
                ? "Informe marca, modelo e características para encontrar opções mais próximas do que você precisa."
                : "Use o botão Importar opções para este item. O template aceita nome, preço, link, data, avaliações e imagem_url."}
          </p>
        </div>
      )}
      <a
        className="qc-button qc-full"
        href={webUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Pesquisar este item na web ↗
      </a>
      <p className="qc-muted">
        Filtros de preço usam o valor do produto. O desembolso inclui frete,
        taxas e custo adicional de clube quando informados. O custo com pontos
        só é ordenado quando as regras e a avaliação pessoal estão completas.
        Notas são agregadas; os textos individuais dos reviews não estão nesta
        v1.
      </p>
      <button className="qc-text-button" onClick={onImport}>
        ↥ Importar ofertas e histórico
      </button>
    </div>
  );
}
