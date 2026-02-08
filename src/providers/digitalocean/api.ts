import type {
  DODroplet,
  DOSSHKey,
  DOSize,
  DORegion,
} from "../../types/index.js";

const DO_API_BASE = "https://api.digitalocean.com/v2";

export class DigitalOceanAPIError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number = 0) {
    super(message);
    this.name = "DigitalOceanAPIError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class DigitalOceanClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${DO_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // DELETE returns 204 with no body
    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const errId = (data as any)?.id || "unknown";
      const errMsg = (data as any)?.message || "Unknown DigitalOcean API error";
      throw new DigitalOceanAPIError(errId, errMsg, response.status);
    }

    return data as T;
  }

  // ============ SSH Keys ============

  async listSSHKeys(): Promise<DOSSHKey[]> {
    const response = await this.request<{ ssh_keys: DOSSHKey[] }>(
      "GET",
      "/account/keys"
    );
    return response.ssh_keys;
  }

  async createSSHKey(name: string, publicKey: string): Promise<DOSSHKey> {
    const response = await this.request<{ ssh_key: DOSSHKey }>(
      "POST",
      "/account/keys",
      { name, public_key: publicKey }
    );
    return response.ssh_key;
  }

  async deleteSSHKey(idOrFingerprint: number | string): Promise<void> {
    await this.request("DELETE", `/account/keys/${idOrFingerprint}`);
  }

  async getSSHKey(idOrFingerprint: number | string): Promise<DOSSHKey> {
    const response = await this.request<{ ssh_key: DOSSHKey }>(
      "GET",
      `/account/keys/${idOrFingerprint}`
    );
    return response.ssh_key;
  }

  // ============ Droplets ============

  async listDroplets(): Promise<DODroplet[]> {
    const response = await this.request<{ droplets: DODroplet[] }>(
      "GET",
      "/droplets"
    );
    return response.droplets;
  }

  async getDroplet(id: number): Promise<DODroplet> {
    const response = await this.request<{ droplet: DODroplet }>(
      "GET",
      `/droplets/${id}`
    );
    return response.droplet;
  }

  async createDroplet(params: {
    name: string;
    region: string;
    size: string;
    image: string;
    ssh_keys: (number | string)[];
    backups?: boolean;
    ipv6?: boolean;
    user_data?: string;
    tags?: string[];
  }): Promise<{ droplet: DODroplet; links: { actions: { id: number; rel: string; href: string }[] } }> {
    return await this.request("POST", "/droplets", params);
  }

  async deleteDroplet(id: number): Promise<void> {
    await this.request("DELETE", `/droplets/${id}`);
  }

  async powerOnDroplet(id: number): Promise<void> {
    await this.request("POST", `/droplets/${id}/actions`, { type: "power_on" });
  }

  async powerOffDroplet(id: number): Promise<void> {
    await this.request("POST", `/droplets/${id}/actions`, { type: "power_off" });
  }

  async rebootDroplet(id: number): Promise<void> {
    await this.request("POST", `/droplets/${id}/actions`, { type: "reboot" });
  }

  async shutdownDroplet(id: number): Promise<void> {
    await this.request("POST", `/droplets/${id}/actions`, { type: "shutdown" });
  }

  async waitForDropletActive(
    id: number,
    timeoutMs: number = 120000,
    pollIntervalMs: number = 3000
  ): Promise<DODroplet> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const droplet = await this.getDroplet(id);

      if (droplet.status === "active") {
        return droplet;
      }

      if (droplet.status === "off" || droplet.status === "archive") {
        throw new DigitalOceanAPIError(
          "droplet_not_active",
          `Droplet entered unexpected state: ${droplet.status}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new DigitalOceanAPIError(
      "timeout",
      `Droplet did not become active within ${timeoutMs / 1000} seconds`
    );
  }

  // ============ Sizes & Regions ============

  async listSizes(): Promise<DOSize[]> {
    const response = await this.request<{ sizes: DOSize[] }>(
      "GET",
      "/sizes"
    );
    return response.sizes;
  }

  async listRegions(): Promise<DORegion[]> {
    const response = await this.request<{ regions: DORegion[] }>(
      "GET",
      "/regions"
    );
    return response.regions;
  }

  // ============ Actions ============

  async getAction(id: number): Promise<{ id: number; status: string; type: string }> {
    const response = await this.request<{
      action: { id: number; status: string; type: string };
    }>("GET", `/actions/${id}`);
    return response.action;
  }

  async waitForAction(
    actionId: number,
    timeoutMs: number = 300000,
    pollIntervalMs: number = 2000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const action = await this.getAction(actionId);

      if (action.status === "completed") {
        return;
      }

      if (action.status === "errored") {
        throw new DigitalOceanAPIError("action_failed", "Action failed");
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new DigitalOceanAPIError(
      "timeout",
      `Action did not complete within ${timeoutMs / 1000} seconds`
    );
  }

  // ============ Validation ============

  async validateAPIKey(): Promise<boolean> {
    try {
      await this.request("GET", "/account");
      return true;
    } catch (error) {
      if (error instanceof DigitalOceanAPIError && error.code === "unauthorized") {
        return false;
      }
      throw error;
    }
  }
}

export function createDigitalOceanClient(apiKey: string): DigitalOceanClient {
  return new DigitalOceanClient(apiKey);
}
