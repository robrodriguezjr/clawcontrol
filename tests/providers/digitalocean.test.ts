import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DigitalOceanClient,
  DigitalOceanAPIError,
} from "../../src/providers/digitalocean/api.js";

const TEST_API_KEY = "test-do-api-key-1234567890";

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

describe("DigitalOceanClient", () => {
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
      globalThis.fetch = mockFetch({
        account: { email: "test@example.com", status: "active" },
      });

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.validateAPIKey();

      expect(result).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.digitalocean.com/v2/account",
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
        { id: "unauthorized", message: "Unable to authenticate you." },
        401
      );

      const client = new DigitalOceanClient("bad-key");
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

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.listSSHKeys();

      expect(result).toEqual(keys);
    });

    it("should create an SSH key", async () => {
      const newKey = { id: 3, name: "new-key", fingerprint: "11:22:33", public_key: "ssh-rsa CCC" };
      globalThis.fetch = mockFetch({ ssh_key: newKey }, 201);

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.createSSHKey("new-key", "ssh-rsa CCC");

      expect(result).toEqual(newKey);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.digitalocean.com/v2/account/keys",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "new-key", public_key: "ssh-rsa CCC" }),
        })
      );
    });

    it("should delete an SSH key", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.resolve(undefined),
      });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(client.deleteSSHKey(1)).resolves.toBeUndefined();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.digitalocean.com/v2/account/keys/1",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("should get an SSH key by ID", async () => {
      const key = { id: 1, name: "key-1", fingerprint: "aa:bb:cc", public_key: "ssh-rsa AAA" };
      globalThis.fetch = mockFetch({ ssh_key: key });

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.getSSHKey(1);

      expect(result).toEqual(key);
    });
  });

  describe("Droplets", () => {
    const sampleDroplet = {
      id: 123,
      name: "test-droplet",
      status: "active",
      networks: {
        v4: [{ ip_address: "1.2.3.4", type: "public" }],
        v6: [],
      },
      size_slug: "s-1vcpu-1gb",
      region: { slug: "nyc1", name: "New York 1" },
      image: { slug: "ubuntu-24-04-x64", name: "Ubuntu 24.04" },
      created_at: "2024-01-01T00:00:00Z",
    };

    it("should list droplets", async () => {
      globalThis.fetch = mockFetch({ droplets: [sampleDroplet] });

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.listDroplets();

      expect(result).toEqual([sampleDroplet]);
    });

    it("should get a droplet by ID", async () => {
      globalThis.fetch = mockFetch({ droplet: sampleDroplet });

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.getDroplet(123);

      expect(result).toEqual(sampleDroplet);
    });

    it("should create a droplet with SSH keys", async () => {
      const createResponse = {
        droplet: { ...sampleDroplet, status: "new" },
        links: { actions: [{ id: 1, rel: "create", href: "https://api.digitalocean.com/v2/actions/1" }] },
      };
      globalThis.fetch = mockFetch(createResponse, 202);

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.createDroplet({
        name: "test-droplet",
        region: "nyc1",
        size: "s-1vcpu-1gb",
        image: "ubuntu-24-04-x64",
        ssh_keys: [1, 2],
      });

      expect(result.droplet.name).toBe("test-droplet");
      expect(result.links.actions).toHaveLength(1);
    });

    it("should delete a droplet", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.resolve(undefined),
      });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(client.deleteDroplet(123)).resolves.toBeUndefined();
    });

    it("should wait for droplet to become active", async () => {
      const newDroplet = { ...sampleDroplet, status: "new" };
      const activeDroplet = { ...sampleDroplet, status: "active" };

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const droplet = callCount <= 2 ? newDroplet : activeDroplet;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ droplet }),
        });
      });

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.waitForDropletActive(123, 10000, 10);

      expect(result.status).toBe("active");
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("should throw on timeout waiting for droplet", async () => {
      const newDroplet = { ...sampleDroplet, status: "new" };
      globalThis.fetch = mockFetch({ droplet: newDroplet });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(
        client.waitForDropletActive(123, 50, 10)
      ).rejects.toThrow("Droplet did not become active");
    });

    it("should throw when droplet enters unexpected state", async () => {
      const offDroplet = { ...sampleDroplet, status: "off" };
      globalThis.fetch = mockFetch({ droplet: offDroplet });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(
        client.waitForDropletActive(123)
      ).rejects.toThrow("Droplet entered unexpected state: off");
    });
  });

  describe("Power Actions", () => {
    it("should power on a droplet", async () => {
      globalThis.fetch = mockFetch({ action: { id: 1, status: "in-progress", type: "power_on" } });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await client.powerOnDroplet(123);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.digitalocean.com/v2/droplets/123/actions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: "power_on" }),
        })
      );
    });

    it("should power off a droplet", async () => {
      globalThis.fetch = mockFetch({ action: { id: 2, status: "in-progress", type: "power_off" } });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await client.powerOffDroplet(123);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.digitalocean.com/v2/droplets/123/actions",
        expect.objectContaining({
          body: JSON.stringify({ type: "power_off" }),
        })
      );
    });

    it("should reboot a droplet", async () => {
      globalThis.fetch = mockFetch({ action: { id: 3, status: "in-progress", type: "reboot" } });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await client.rebootDroplet(123);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.digitalocean.com/v2/droplets/123/actions",
        expect.objectContaining({
          body: JSON.stringify({ type: "reboot" }),
        })
      );
    });

    it("should shutdown a droplet", async () => {
      globalThis.fetch = mockFetch({ action: { id: 4, status: "in-progress", type: "shutdown" } });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await client.shutdownDroplet(123);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.digitalocean.com/v2/droplets/123/actions",
        expect.objectContaining({
          body: JSON.stringify({ type: "shutdown" }),
        })
      );
    });
  });

  describe("Error Handling", () => {
    it("should throw DigitalOceanAPIError on 401", async () => {
      globalThis.fetch = mockFetch(
        { id: "unauthorized", message: "Unable to authenticate you." },
        401
      );

      const client = new DigitalOceanClient("bad-key");
      await expect(client.listDroplets()).rejects.toThrow(DigitalOceanAPIError);
      await expect(client.listDroplets()).rejects.toThrow("Unable to authenticate you.");
    });

    it("should throw DigitalOceanAPIError on 404", async () => {
      globalThis.fetch = mockFetch(
        { id: "not_found", message: "The resource you requested could not be found." },
        404
      );

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(client.getDroplet(999)).rejects.toThrow(DigitalOceanAPIError);
    });

    it("should throw DigitalOceanAPIError on 422", async () => {
      globalThis.fetch = mockFetch(
        { id: "unprocessable_entity", message: "Name has already been taken." },
        422
      );

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(
        client.createSSHKey("dup-key", "ssh-rsa AAA")
      ).rejects.toThrow("Name has already been taken.");
    });

    it("should throw DigitalOceanAPIError on 429", async () => {
      globalThis.fetch = mockFetch(
        { id: "too_many_requests", message: "API Rate limit exceeded." },
        429
      );

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(client.listDroplets()).rejects.toThrow("API Rate limit exceeded.");
    });

    it("should include status code in error", async () => {
      globalThis.fetch = mockFetch(
        { id: "server_error", message: "Server Error" },
        500
      );

      const client = new DigitalOceanClient(TEST_API_KEY);
      try {
        await client.listDroplets();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DigitalOceanAPIError);
        expect((err as DigitalOceanAPIError).statusCode).toBe(500);
        expect((err as DigitalOceanAPIError).code).toBe("server_error");
      }
    });
  });

  describe("Actions", () => {
    it("should get an action", async () => {
      globalThis.fetch = mockFetch({
        action: { id: 1, status: "completed", type: "create" },
      });

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.getAction(1);

      expect(result).toEqual({ id: 1, status: "completed", type: "create" });
    });

    it("should wait for action to complete", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        const status = callCount <= 2 ? "in-progress" : "completed";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              action: { id: 1, status, type: "create" },
            }),
        });
      });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(client.waitForAction(1, 10000, 10)).resolves.toBeUndefined();
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("should throw on errored action", async () => {
      globalThis.fetch = mockFetch({
        action: { id: 1, status: "errored", type: "create" },
      });

      const client = new DigitalOceanClient(TEST_API_KEY);
      await expect(client.waitForAction(1)).rejects.toThrow("Action failed");
    });
  });

  describe("Sizes and Regions", () => {
    it("should list sizes", async () => {
      const sizes = [
        {
          slug: "s-1vcpu-1gb",
          memory: 1024,
          vcpus: 1,
          disk: 25,
          transfer: 1,
          price_monthly: 6,
          available: true,
          regions: ["nyc1"],
        },
      ];
      globalThis.fetch = mockFetch({ sizes });

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.listSizes();

      expect(result).toEqual(sizes);
    });

    it("should list regions", async () => {
      const regions = [
        { slug: "nyc1", name: "New York 1", available: true, sizes: ["s-1vcpu-1gb"] },
      ];
      globalThis.fetch = mockFetch({ regions });

      const client = new DigitalOceanClient(TEST_API_KEY);
      const result = await client.listRegions();

      expect(result).toEqual(regions);
    });
  });
});
