// Partagé entre la page (navigateur) et le collecteur (Node) : ne dépend de rien.

/** @typedef {'upcoming' | 'active' | 'expired'} OfferStatus */

/**
 * Statut d'une offre à un instant donné, calculé à partir de ses dates.
 * Sans date de début : déjà commencée. Sans date de fin : en cours.
 *
 * @param {{ startDate: string | null, endDate: string | null }} offer
 * @param {number} [now] horodatage en millisecondes
 * @returns {OfferStatus}
 */
export function offerStatus(offer, now = Date.now()) {
  const start = offer.startDate ? Date.parse(offer.startDate) : null;
  const end = offer.endDate ? Date.parse(offer.endDate) : null;
  if (start !== null && now < start) return 'upcoming';
  if (end !== null && now >= end) return 'expired';
  return 'active';
}
