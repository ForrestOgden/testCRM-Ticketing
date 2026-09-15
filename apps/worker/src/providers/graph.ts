type GraphMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  internetMessageHeaders?: Array<{ name?: string; value?: string }>;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Microsoft Graph integration.`);
  return value;
}

export class GraphClient {
  private token?: { value: string; expiresAt: number };
  private readonly tenantId = required("ENTRA_TENANT_ID");
  private readonly clientId = required("GRAPH_CLIENT_ID");
  private readonly clientSecret = required("GRAPH_CLIENT_SECRET");
  readonly mailbox = required("GRAPH_SUPPORT_MAILBOX");

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Microsoft identity token request failed (${response.status}).`);
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("Microsoft identity token response did not include access_token.");
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(300, Number(data.expires_in ?? 3600)) * 1000,
    };
    return this.token.value;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.accessToken();
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (response.status === 401) this.token = undefined;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph request failed (${response.status}): ${text.slice(0, 500)}`);
    }
    if (response.status === 202 || response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  getMessage(messageId: string) {
    const select = [
      "id", "internetMessageId", "conversationId", "subject", "body", "bodyPreview",
      "receivedDateTime", "sentDateTime", "from", "toRecipients", "ccRecipients", "internetMessageHeaders",
    ].join(",");
    return this.request<GraphMessage>(`/users/${encodeURIComponent(this.mailbox)}/messages/${encodeURIComponent(messageId)}?$select=${select}`);
  }

  async sendMail(input: { to: string[]; cc?: string[]; subject: string; text: string; html?: string }) {
    const contentType = input.html ? "HTML" : "Text";
    const content = input.html ?? input.text;
    await this.request<void>(`/users/${encodeURIComponent(this.mailbox)}/sendMail`, {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType, content },
          toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (input.cc ?? []).map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    });
  }

  async createMessageSubscription(notificationUrl: string, clientState: string) {
    const expirationDateTime = new Date(Date.now() + 60 * 60 * 1000 * 48).toISOString();
    return this.request<{ id: string; expirationDateTime: string }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        changeType: "created",
        notificationUrl,
        resource: `/users/${this.mailbox}/mailFolders('Inbox')/messages`,
        expirationDateTime,
        clientState,
      }),
    });
  }

  async renewSubscription(subscriptionId: string) {
    const expirationDateTime = new Date(Date.now() + 60 * 60 * 1000 * 48).toISOString();
    return this.request<{ id: string; expirationDateTime: string }>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ expirationDateTime }),
    });
  }
}

export type { GraphMessage };
