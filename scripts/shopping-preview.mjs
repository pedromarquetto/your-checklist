// Inline conversation previews have no API/network access. Never pretend a live
// query succeeded and never substitute example prices for an actual API result.
export const isInlinePreview=true;
export async function searchOffers(){throw new Error('A busca ao vivo não está conectada nesta prévia. Abra a pesquisa na web ou importe suas ofertas por CSV.');}

export const researchOffers=searchOffers;
