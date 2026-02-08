import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HetznerClient,
  HetznerAPIError,
} from "../../src/providers/hetzner/api.js";

const TEST_API_KEY = "test-hetzner-api-key-1234567890";

function mockFetch(
  response: object | null,
  status: number = 200
) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  });
}

describe("HetznerClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("validateAPIKey", () => {
    it("should return true for a valid API key", async () => {
      globalThis.fetch = mockFetch({ servers: [] });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.validateAPIKey();

      expect(result).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.hetzner.cloud/v1/servers",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_API_KEY}`,
          }),
        })
      );
    });

    it("should return false for an invalid API key", async () => {
      globalThis.fetch = mockFetch(
        { error: { code: "unauthorized", message: "unauthorized" } },
        403
      );

      const client = new HetznerClient("bad-key");
      const result = await client.validateAPIKey();

      expect(result).toBe(false);
    });
  });

  describe("SSH Keys", () => {
    it("should list SSH keys", async () => {
      const keys = [
        { id: 1, name: "key-1", fingerprint: "aa:bb:cc", public_key: "ssh-rsa AAA" },
        { id: 2, name: "key-2", fingerprint: "dd:ee:ff", public_key: "ssh-rsa BBB" },
      ];
      globalThis.fetch = mockFetch({ ssh_keys: keys });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.listSSHKeys();

      expect(result).toEqual(keys);
    });

    it("should create an SSH key", async () => {
      const newKey = { id: 3, name: "new-key", fingerprint: "11:22:33", public_key: "ssh-rsa CCC" };
      globalThis.fetch = mockFetch({ ssh_key: newKey }, 201);

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.createSSHKey("new-key", "ssh-rsa CCC");

      expect(result).toEqual(newKey);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.hetzner.cloud/v1/ssh_keys",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "new-key", public_key: "ssh-rsa CCC" }),
        })
      );
    });

    it("should delete an SSH key", async () => {
      globalThis.fetch = mockFetch({});

      const client = new HetznerClient(TEST_API_KEY);
      await client.deleteSSHKey(1);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.hetzner.cloud/v1/ssh_keys/1",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("should get an SSH key by ID", async () => {
      const key = { id: 1, name: "key-1", fingerprint: "aa:bb:cc", public_key: "ssh-rsa AAA" };
      globalThis.fetch = mockFetch({ ssh_key: key });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.getSSHKey(1);

      expect(result).toEqual(key);
    });
  });

  describe("Servers", () => {
    const sampleServer = {
      id: 123,
      name: "test-server",
      status: "running",
      public_net: {
        ipv4: { ip: "1.2.3.4" },
        ipv6: { ip: "2001:db8::1" },
      },
      server_type: { name: "cpx11", description: "CPX 11" },
      datacenter: {
        name: "ash-dc1",
        location: { name: "ash", city: "Ashburn", country: "US" },
      },
      created: "2024-01-01T00:00:00+00:00",
    };

    it("should list servers", async () => {
      globalThis.fetch = mockFetch({ servers: [sampleServer] });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.listServers();

      expect(result).toEqual([sampleServer]);
    });

    it("should get a server by ID", async () => {
      globalThis.fetch = mockFetch({ server: sampleServer });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.getServer(123);

      expect(result).toEqual(sampleServer);
    });

    it("should create a server", async () => {
      const createResponse = {
        server: sampleServer,
        action: { id: 1, status: "running" },
      };
      globalThis.fetch = mockFetch(createResponse, 201);

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.createServer({
        name: "test-server",
        server_type: "cpx11",
        image: "ubuntu-24.04",
        location: "ash",
        ssh_keys: [1],
      });

      expect(result.server.name).toBe("test-server");
      expect(result.action.id).toBe(1);
    });

    it("should delete a server", async () => {
      globalThis.fetch = mockFetch({});

      const client = new HetznerClient(TEST_API_KEY);
      await client.deleteServer(123);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.hetzner.cloud/v1/servers/123",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("should wait for server to be running", async () => {
      const startingServer = { ...sampleServer, status: "initializing" };
      const runningServer = { ...sampleServer, status: "running" };

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const server = callCount <= 2 ? startingServer : runningServer;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ server }),
        });
      });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.waitForServerRunning(123, 10000, 10);

      expect(result.status).toBe("running");
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("should throw on timeout waiting for server", async () => {
      const startingServer = { ...sampleServer, status: "initializing" };
      globalThis.fetch = mockFetch({ server: startingServer });

      const client = new HetznerClient(TEST_API_KEY);
      await expect(
        client.waitForServerRunning(123, 50, 10)
      ).rejects.toThrow("Server did not start");
    });

    it("should throw when server enters unexpected state", async () => {
      const offServer = { ...sampleServer, status: "off" };
      globalThis.fetch = mockFetch({ server: offServer });

      const client = new HetznerClient(TEST_API_KEY);
      await expect(
        client.waitForServerRunning(123)
      ).rejects.toThrow("Server entered unexpected state: off");
    });
  });

  describe("Error Handling", () => {
    it("should throw HetznerAPIError on API error", async () => {
      globalThis.fetch = mockFetch(
        { error: { code: "unauthorized", message: "unauthorized" } },
        403
      );

      const client = new HetznerClient(TEST_API_KEY);
      await expect(client.listServers()).rejects.toThrow(HetznerAPIError);
      await expect(client.listServers()).rejects.toThrow("unauthorized");
    });

    it("should throw HetznerAPIError on 404", async () => {
      globalThis.fetch = mockFetch(
        { error: { code: "not_found", message: "resource not found" } },
        404
      );

      const client = new HetznerClient(TEST_API_KEY);
      await expect(client.getServer(999)).rejects.toThrow(HetznerAPIError);
    });

    it("should throw on 422", async () => {
      globalThis.fetch = mockFetch(
        { error: { code: "uniqueness_error", message: "SSH key already exists" } },
        422
      );

      const client = new HetznerClient(TEST_API_KEY);
      await expect(
        client.createSSHKey("dup-key", "ssh-rsa AAA")
      ).rejects.toThrow("SSH key already exists");
    });

    it("should include error code", async () => {
      globalThis.fetch = mockFetch(
        { error: { code: "rate_limit_exceeded", message: "Rate limit exceeded" } },
        429
      );

      const client = new HetznerClient(TEST_API_KEY);
      try {
        await client.listServers();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HetznerAPIError);
        expect((err as HetznerAPIError).code).toBe("rate_limit_exceeded");
      }
    });
  });

  describe("Actions", () => {
    it("should get an action", async () => {
      globalThis.fetch = mockFetch({
        action: { id: 1, status: "success", progress: 100 },
      });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.getAction(1);

      expect(result).toEqual({ id: 1, status: "success", progress: 100 });
    });

    it("should wait for action to complete", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const status = callCount <= 2 ? "running" : "success";
        const progress = callCount <= 2 ? 50 : 100;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              action: { id: 1, status, progress },
            }),
        });
      });

      const client = new HetznerClient(TEST_API_KEY);
      await expect(client.waitForAction(1, 10000, 10)).resolves.toBeUndefined();
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("should throw on errored action", async () => {
      globalThis.fetch = mockFetch({
        action: { id: 1, status: "error", progress: 0 },
      });

      const client = new HetznerClient(TEST_API_KEY);
      await expect(client.waitForAction(1)).rejects.toThrow("Action failed");
    });
  });

  describe("Server Types and Locations", () => {
    it("should list server types", async () => {
      const serverTypes = [
        {
          id: 1,
          name: "cpx11",
          description: "CPX 11",
          cores: 2,
          memory: 2,
          disk: 40,
          prices: [{ location: "ash", price_monthly: { gross: "4.99" } }],
        },
      ];
      globalThis.fetch = mockFetch({ server_types: serverTypes });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.listServerTypes();

      expect(result).toEqual(serverTypes);
    });

    it("should list locations", async () => {
      const locations = [
        {
          id: 1,
          name: "ash",
          description: "Ashburn, VA",
          country: "US",
          city: "Ashburn",
          network_zone: "us-east",
        },
      ];
      globalThis.fetch = mockFetch({ locations });

      const client = new HetznerClient(TEST_API_KEY);
      const result = await client.listLocations();

      expect(result).toEqual(locations);
    });
  });
});
