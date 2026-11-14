import type { Details } from './offer.ts';

const MAX_DESCRIPTION = 400;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Texte brut : balises retirées, entités décodées, longueur bornée. */
export function cleanDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  const plain = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === '#') {
        const value = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    // Pas \s : les espaces insécables de la typographie française (« ! », « : ») sont gardées.
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/ ?  ?/g, ' ')
    .trim();
  if (!plain) return null;
  return plain.length > MAX_DESCRIPTION ? `${plain.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : plain;
}

/**
 * Détails d'une nouvelle lecture, complétés champ par champ par ceux déjà connus :
 * une source momentanément indisponible (recherche Steam, GetItems) n'efface rien.
 */
export function mergeDetails(known: Details | undefined, fresh: Details | undefined): Details | undefined {
  if (!fresh) return known;
  if (!known) return fresh;
  return {
    tags: fresh.tags.length > 0 ? fresh.tags : known.tags,
    description: fresh.description ?? known.description,
    screenshots: fresh.screenshots.length > 0 ? fresh.screenshots : known.screenshots,
    video: fresh.video ?? known.video,
  };
}
