/**
 * Les photos de plats viennent d'Unsplash avec un `w=1200` : bien trop lourd
 * pour une vignette. On réécrit la largeur demandée, et on passe par `/media`
 * (proxy de notre domaine) pour que les images soient mises en cache par le
 * service worker et restent disponibles hors ligne.
 */
const UNSPLASH_HOST = "images.unsplash.com";

export function imageUrl(source: string, width: number): string {
  if (!source || !source.includes(UNSPLASH_HOST)) return source;
  const match = source.match(/^https?:\/\/images\.unsplash\.com\/(.+)$/);
  if (!match) return source;
  const [path, query] = match[1].split("?");
  const params = new URLSearchParams(query ?? "");
  params.set("auto", "format");
  params.set("fit", "crop");
  params.set("w", String(width));
  params.set("q", "72");
  return `/media/${path}?${params.toString()}`;
}

/** Jeu de largeurs pour `srcset` : le navigateur choisit la plus juste. */
export function imageSet(source: string, widths: number[]): string {
  if (!source || !source.includes(UNSPLASH_HOST)) return "";
  return widths.map((width) => `${imageUrl(source, width)} ${width}w`).join(", ");
}
