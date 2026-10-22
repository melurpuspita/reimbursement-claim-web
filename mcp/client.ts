// Klien HTTP tipis ke Worker ops-finance. Tanpa akses file system supaya bisa dites di mana saja.
export class OpsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ClaimFields {
  merchant: string;
  amount_idr: number;
  spent_on: string;
  category: string;
  description?: string;
}
export interface Receipt {
  bytes: Uint8Array;
  contentType: string;
}

export class OpsClient {
  constructor(
    private baseUrl: string,
    private token: string,
    private fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(new URL(path, this.baseUrl).toString(), {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...(init.headers as Record<string, string> | undefined) },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new OpsApiError(res.status, data?.error ?? `HTTP ${res.status}`);
    return data as T;
  }

  whoami() {
    return this.call<{ user: { id: number; name: string; role: string } }>("/api/me");
  }
  async listClaims(status?: string) {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return (await this.call<{ claims: any[] }>(`/api/claims${q}`)).claims;
  }
  async getClaim(id: number) {
    return (await this.call<{ claim: any }>(`/api/claims/${id}`)).claim;
  }
  async submitClaim(fields: ClaimFields, receipt?: Receipt) {
    const created = await this.call<{ claim: any }>("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!receipt) return created.claim;
    try {
      const up = await this.call<{ claim: any }>(`/api/claims/${created.claim.id}/receipt`, {
        method: "PUT",
        headers: { "Content-Type": receipt.contentType },
        body: receipt.bytes as unknown as BodyInit,
      });
      return up.claim;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new OpsApiError(0, `Klaim #${created.claim.id} sudah dibuat tapi upload struk gagal: ${msg}`);
    }
  }
}
