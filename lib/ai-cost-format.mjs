const usd = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 9,
});

export function formatAiCost(value) {
  return value == null ? "Indisponível" : usd.format(value);
}
