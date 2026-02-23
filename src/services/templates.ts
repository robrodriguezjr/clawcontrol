import { homedir } from "os";
import { join } from "path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "fs";
import { type Template, TemplateSchema } from "../types/index.js";

const CLAWCONTROL_DIR = join(homedir(), ".clawcontrol");
const TEMPLATES_DIR = join(CLAWCONTROL_DIR, "templates");

const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: "hetzner-telegram-openrouter-kimi",
    name: "Hetzner + OpenRouter Kimi K2.5",
    description:
      "Deploy OpenClaw on Hetzner Cloud (US East) with OpenRouter using Moonshotai Kimi K2.5 model via Telegram",
    builtIn: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    provider: "hetzner",
    hetzner: {
      serverType: "cpx11",
      location: "ash",
      image: "ubuntu-24.04",
    },
    aiProvider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    channel: "telegram",
  },
  {
    id: "digitalocean-telegram-openrouter-kimi",
    name: "DigitalOcean + OpenRouter Kimi K2.5",
    description:
      "Deploy OpenClaw on DigitalOcean (NYC1) with OpenRouter using Moonshotai Kimi K2.5 model via Telegram",
    builtIn: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    provider: "digitalocean",
    digitalocean: {
      size: "s-1vcpu-2gb",
      region: "nyc1",
      image: "ubuntu-24-04-x64",
    },
    aiProvider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    channel: "telegram",
  },
  {
    id: "beacon24-concierge-hetzner",
    name: "Beacon24 Concierge (Hetzner)",
    description:
      "Deploy a Beacon24 Concierge personal AI on Hetzner Cloud with OpenRouter. Pre-configured for 1:1 client assistants.",
    builtIn: true,
    createdAt: "2026-02-22T00:00:00.000Z",
    provider: "hetzner",
    hetzner: {
      serverType: "cpx11",
      location: "ash",
      image: "ubuntu-24.04",
    },
    aiProvider: "openrouter",
    model: "openrouter/anthropic/claude-haiku-4-5",
    channel: "telegram",
  },
];

export function ensureTemplatesDir(): void {
  if (!existsSync(TEMPLATES_DIR)) {
    mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
}

function getTemplatePath(id: string): string {
  return join(TEMPLATES_DIR, `${id}.json`);
}

function seedBuiltInTemplates(): void {
  ensureTemplatesDir();
  for (const template of BUILT_IN_TEMPLATES) {
    const path = getTemplatePath(template.id);
    if (!existsSync(path)) {
      writeFileSync(path, JSON.stringify(template, null, 2));
    }
  }
}

export function getAllTemplates(): Template[] {
  seedBuiltInTemplates();

  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".json"));
  const templates: Template[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(TEMPLATES_DIR, file), "utf-8");
      const parsed = TemplateSchema.parse(JSON.parse(raw));
      templates.push(parsed);
    } catch {
      // Skip invalid template files
    }
  }

  // Sort: built-in first, then by name
  return templates.sort((a, b) => {
    if (a.builtIn && !b.builtIn) return -1;
    if (!a.builtIn && b.builtIn) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function getTemplate(id: string): Template | null {
  const path = getTemplatePath(id);
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, "utf-8");
    return TemplateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveTemplate(template: Template): void {
  ensureTemplatesDir();
  const validated = TemplateSchema.parse(template);
  writeFileSync(getTemplatePath(validated.id), JSON.stringify(validated, null, 2));
}

export function deleteTemplate(id: string): { success: boolean; error?: string } {
  const template = getTemplate(id);
  if (!template) {
    return { success: false, error: "Template not found" };
  }
  if (template.builtIn) {
    return { success: false, error: "Cannot delete built-in templates" };
  }

  const path = getTemplatePath(id);
  rmSync(path, { force: true });
  return { success: true };
}

export function templateExists(id: string): boolean {
  return existsSync(getTemplatePath(id));
}

export function generateTemplateId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  let id = base;
  let counter = 1;
  while (templateExists(id)) {
    id = `${base}-${counter}`;
    counter++;
  }
  return id;
}
