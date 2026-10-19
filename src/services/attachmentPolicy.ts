/** File names and declared MIME are untrusted, including files already in IndexedDB. */
const ACTIVE_EXT = /\.(?:html?|shtml|xhtml|svgz?|xml|xsl|xslt|[cm]?js)$/i;
// Anchored: "application/vnd.openxmlformats-…" (docx/xlsx/pptx) must stay allowed.
const ACTIVE_MIME = /^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml|(?:application|text)\/(?:x-)?(?:javascript|ecmascript|xml))\b/i;
export function validateAttachmentUpload(file: Pick<File, "name" | "type" | "size">) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Gli allegati devono essere di massimo 10 MB.");
  if (ACTIVE_EXT.test(file.name.trim()) || ACTIVE_MIME.test(file.type)) throw new Error("HTML, SVG e contenuti eseguibili non sono ammessi come nuovi allegati.");
}

/** Only a matching raster signature + MIME + extension may become a navigable URL.
 * Documents (including PDF), unknown formats and all legacy active files are
 * preserved and downloaded as opaque bytes. No stored object is rewritten.
 */
export async function attachmentPresentation(blob: Blob, filename: string, requestedDownload: boolean) {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const begins = (...signature: number[]) => signature.every((n, i) => bytes[i] === n);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const raster = begins(137,80,78,71,13,10,26,10) ? { type: "image/png", ext: /\.png$/i }
    : begins(255,216,255) ? { type: "image/jpeg", ext: /\.jpe?g$/i }
    : ["GIF87a", "GIF89a"].includes(ascii(0,6)) ? { type: "image/gif", ext: /\.gif$/i }
    : ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP" ? { type: "image/webp", ext: /\.webp$/i }
    : null;
  const preview = !requestedDownload && !!raster && raster.type === blob.type.toLowerCase() && raster.ext.test(filename.trim());
  return { blob: new Blob([blob], { type: preview ? raster!.type : "application/octet-stream" }), download: !preview };
}
