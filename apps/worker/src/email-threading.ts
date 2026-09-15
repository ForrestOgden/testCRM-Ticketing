export function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value;
}

export function extractTicketNumber(subject: string | undefined) {
  if (!subject) return undefined;
  const match = subject.match(/\bTKT[-\s#:]?0*(\d{1,12})\b/i);
  return match?.[1] ? BigInt(match[1]) : undefined;
}

export function normalizeAddress(address: string | null | undefined) {
  return address?.trim().toLowerCase() || undefined;
}

export function domainFromAddress(address: string | null | undefined) {
  const normalized = normalizeAddress(address);
  if (!normalized) return undefined;
  const at = normalized.lastIndexOf("@");
  return at > 0 && at < normalized.length - 1 ? normalized.slice(at + 1) : undefined;
}

export function stripQuotedText(text: string) {
  const markers = [
    /^On .+ wrote:$/im,
    /^From:\s.+$/im,
    /^-----Original Message-----$/im,
    /^________________________________$/im,
  ];
  let end = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match?.index !== undefined) end = Math.min(end, match.index);
  }
  return text.slice(0, end).trim();
}

export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
