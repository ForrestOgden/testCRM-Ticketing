type JsonObject = Record<string, unknown>;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Datto RMM integration.`);
  return value;
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object") : [];
}

export class DattoRmmClient {
  private token?: { value: string; expiresAt: number };
  private readonly apiUrl = required("DATTO_API_URL").replace(/\/$/, "");
  private readonly apiKey = required("DATTO_API_KEY");
  private readonly apiSecret = required("DATTO_API_SECRET");

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const body = new URLSearchParams({
      grant_type: "password",
      username: this.apiKey,
      password: this.apiSecret,
    });
    const basic = Buffer.from("public-client:public").toString("base64");
    const response = await fetch(`${this.apiUrl}/auth/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Datto token request failed (${response.status}).`);
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("Datto token response did not include access_token.");
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(300, Number(data.expires_in ?? 360000)) * 1000,
    };
    return this.token.value;
  }

  private async request(pathOrUrl: string) {
    const token = await this.accessToken();
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.apiUrl}/api${pathOrUrl}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401) this.token = undefined;
    if (!response.ok) throw new Error(`Datto API request failed (${response.status}) for ${url}.`);
    return response.json() as Promise<JsonObject>;
  }

  private async paginated(path: string, collectionKey: string) {
    const items: JsonObject[] = [];
    let next: string | undefined = path;
    let pageCount = 0;
    while (next) {
      if (++pageCount > 500) throw new Error("Datto pagination exceeded safety limit.");
      const page = await this.request(next);
      items.push(...asArray(page[collectionKey]));
      const nextPageUrl = typeof page.nextPageUrl === "string" ? page.nextPageUrl : undefined;
      next = nextPageUrl || undefined;
    }
    return items;
  }

  listSites() {
    return this.paginated("/v2/account/sites?max=250", "sites");
  }

  listDevices() {
    return this.paginated("/v2/account/devices?max=250", "devices");
  }

  listOpenAlerts() {
    return this.paginated("/v2/account/alerts/open?max=250", "alerts");
  }

  async getDevice(deviceUid: string) {
    return this.request(`/v2/device/${encodeURIComponent(deviceUid)}`);
  }
}

export function dattoValue(record: JsonObject, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}
