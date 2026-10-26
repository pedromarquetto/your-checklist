export async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(
      payload.message || "Não foi possível concluir a operação.",
    );
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}
