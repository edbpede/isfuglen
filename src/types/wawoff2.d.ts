/**
 * `wawoff2` ships no types. It is used by `scripts/build-pdf-fonts.ts` only,
 * at build time, to decode the Fontsource woff2 containers into the static TTFs
 * the PDF export embeds.
 */
declare module "wawoff2" {
  /** woff2 container to sfnt. A decode, not a conversion: no table is rebuilt. */
  export function decompress(buffer: Uint8Array): Promise<Uint8Array>;
  export function compress(buffer: Uint8Array): Promise<Uint8Array>;
}
