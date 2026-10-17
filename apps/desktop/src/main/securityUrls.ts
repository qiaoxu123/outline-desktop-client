/** Exact-origin comparisons; URL string prefix matching is unsafe for tokens. */
export function sameServerOrigin(requestUrl: string, serverUrl: string): boolean {
  try {
    const request = new URL(requestUrl);
    const server = new URL(serverUrl);
    return request.origin === server.origin && request.protocol === server.protocol &&
      ["https:", "http:"].includes(request.protocol);
  } catch {
    return false;
  }
}

export function safeExternalUrl(url: string): boolean {
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Images/attachments need Bearer headers; ordinary web pages must not get one. */
export function shouldAttachOutlineToken(requestUrl: string, serverUrl: string): boolean {
  if (!sameServerOrigin(requestUrl, serverUrl)) return false;
  try {
    const pathname = new URL(requestUrl).pathname;
    return pathname === "/api/attachments.redirect";
  } catch {
    return false;
  }
}
