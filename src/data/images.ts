/**
 * Les photos de plats viennent d'Unsplash avec un `w=1200` : bien trop lourd
 * pour une vignette de carte. On réécrit la largeur demandée selon l'usage.
 */
const UNSPLASH = "images.unsplash.com";

export function imageUrl(source: string, width: number): string {
  if (!source || !source.includes(UNSPLASH)) return source;
  return source
    .replace(/([?&])w=\d+/, `$1w=${width}`)
    .replace(/([?&])q=\d+/, "$1q=72");
}

/** Jeu de largeurs pour `srcset` : le navigateur choisit la plus juste. */
export function imageSet(source: string, widths: number[]): string {
  if (!source || !source.includes(UNSPLASH)) return "";
  return widths.map((width) => `${imageUrl(source, width)} ${width}w`).join(", ");
}
