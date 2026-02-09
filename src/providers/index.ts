export * from "./hetzner/index.js";
export * from "./digitalocean/index.js";

import type { Provider } from "../types/index.js";

export const SUPPORTED_PROVIDERS: Provider[] = ["hetzner", "digitalocean"];

export const PROVIDER_NAMES: Record<Provider, string> = {
  hetzner: "Hetzner Cloud",
  digitalocean: "DigitalOcean",
  vultr: "Vultr",
};

export function isProviderSupported(provider: Provider): boolean {
  return SUPPORTED_PROVIDERS.includes(provider);
}

export const AI_PROVIDERS = [
  { name: "anthropic", label: "Anthropic", description: "Claude models (Recommended)" },
  { name: "openai", label: "OpenAI", description: "GPT-4o, o1, and more" },
  { name: "openrouter", label: "OpenRouter", description: "Access multiple providers via one API" },
  { name: "google", label: "Google", description: "Gemini models" },
  { name: "groq", label: "Groq", description: "Fast inference for open models" },
];
