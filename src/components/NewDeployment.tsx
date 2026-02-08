import { useState, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { appendFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { AppContext } from "../App.js";
import type { Provider, DeploymentConfig } from "../types/index.js";
import {
  createDeployment,
  validateDeploymentName,
} from "../services/config.js";
import { createHetznerClient } from "../providers/hetzner/api.js";
import { createDigitalOceanClient } from "../providers/digitalocean/api.js";
import { SUPPORTED_PROVIDERS, PROVIDER_NAMES } from "../providers/index.js";
import { t } from "../theme.js";

// Debug logging to file
const DEBUG_FILE = join(homedir(), ".clawcontrol", "debug.log");
function debugLog(msg: string) {
  try {
    appendFileSync(DEBUG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // Ignore errors
  }
}

interface Props {
  context: AppContext;
}

type Step =
  | "name"
  | "provider"
  | "api_key"
  | "droplet_size"
  | "ai_provider"
  | "ai_api_key"
  | "model"
  | "telegram_bot_token"
  | "telegram_allow_from"
  | "confirm"
  | "complete";

const DO_DROPLET_SIZES = [
  //NOTE: Minimum size for running OpenClaw without heap out of memory errors is 2GB RAM
  // { slug: "s-1vcpu-512mb", label: "1 vCPU, 512MB RAM, 10GB SSD", price: "$4/mo" },
  // { slug: "s-1vcpu-1gb", label: "1 vCPU, 1GB RAM, 25GB SSD", price: "$6/mo" },
  { slug: "s-1vcpu-2gb", label: "1 vCPU, 2GB RAM, 50GB SSD", price: "$12/mo" },
  { slug: "s-2vcpu-2gb", label: "2 vCPU, 2GB RAM, 60GB SSD", price: "$18/mo" },
  { slug: "s-2vcpu-4gb", label: "2 vCPU, 4GB RAM, 80GB SSD", price: "$24/mo" },
  { slug: "s-4vcpu-8gb", label: "4 vCPU, 8GB RAM, 160GB SSD", price: "$48/mo" },
  { slug: "s-8vcpu-16gb", label: "8 vCPU, 16GB RAM, 320GB SSD", price: "$96/mo" },
];

function getStepList(provider: Provider): Step[] {
  const base: Step[] = [
    "name",
    "provider",
    "api_key",
  ];
  if (provider === "digitalocean") {
    base.push("droplet_size");
  }
  base.push(
    "ai_provider",
    "ai_api_key",
    "model",
    "telegram_bot_token",
    "telegram_allow_from",
    "confirm",
  );
  return base;
}

const AI_PROVIDERS = [
  { name: "anthropic", label: "Anthropic", description: "Claude models (Recommended)" },
  { name: "openai", label: "OpenAI", description: "GPT-4o, o1, and more" },
  { name: "openrouter", label: "OpenRouter", description: "Access multiple providers via one API" },
  { name: "google", label: "Google", description: "Gemini models" },
  { name: "groq", label: "Groq", description: "Fast inference for open models" },
];

export function NewDeployment({ context }: Props) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("hetzner");
  const [apiKey, setApiKey] = useState("");
  const [selectedDropletSizeIndex, setSelectedDropletSizeIndex] = useState(0); // default s-1vcpu-1gb
  const [aiProvider, setAiProvider] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [model, setModel] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramAllowFrom, setTelegramAllowFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const [selectedAiProviderIndex, setSelectedAiProviderIndex] = useState(0);

  // Use refs to avoid stale closures in useKeyboard callback
  const stateRef = useRef({
    name, provider, apiKey, aiProvider, aiApiKey, model, telegramBotToken, telegramAllowFrom, step,
    selectedDropletSizeIndex,
  });
  stateRef.current = {
    name, provider, apiKey, aiProvider, aiApiKey, model, telegramBotToken, telegramAllowFrom, step,
    selectedDropletSizeIndex,
  };

  debugLog(`RENDER: step=${step}, apiKey.length=${apiKey?.length ?? "null"}`);

  const stepList = getStepList(provider);

  const handleConfirmFromRef = () => {
    const s = stateRef.current;

    debugLog(`handleConfirmFromRef CALLED: apiKey.length=${s.apiKey?.length ?? "null"}`);

    if (!s.apiKey.trim()) {
      setError("API key is missing. Please go back and re-enter your API key.");
      setStep("api_key");
      return;
    }

    if (!s.aiProvider.trim()) {
      setError("AI provider is required.");
      setStep("ai_provider");
      return;
    }

    if (!s.aiApiKey.trim()) {
      setError("AI provider API key is required.");
      setStep("ai_api_key");
      return;
    }

    if (!s.model.trim()) {
      setError("Model is required.");
      setStep("model");
      return;
    }

    if (!s.telegramBotToken.trim()) {
      setError("Telegram bot token is required.");
      setStep("telegram_bot_token");
      return;
    }

    if (!s.telegramAllowFrom.trim()) {
      setError("Telegram user ID is required for access control.");
      setStep("telegram_allow_from");
      return;
    }

    try {
      const config: DeploymentConfig = {
        name: s.name,
        provider: s.provider,
        createdAt: new Date().toISOString(),
        hetzner: s.provider === "hetzner" ? {
          apiKey: s.apiKey,
          serverType: "cpx11",
          location: "ash",
          image: "ubuntu-24.04",
        } : undefined,
        digitalocean: s.provider === "digitalocean" ? {
          apiKey: s.apiKey,
          size: DO_DROPLET_SIZES[s.selectedDropletSizeIndex].slug,
          region: "nyc1",
          image: "ubuntu-24-04-x64",
        } : undefined,
        openclawConfig: undefined,
        openclawAgent: {
          aiProvider: s.aiProvider,
          aiApiKey: s.aiApiKey,
          model: s.model,
          channel: "telegram",
          telegramBotToken: s.telegramBotToken,
          telegramAllowFrom: s.telegramAllowFrom,
        },
      };

      createDeployment(config);
      context.refreshDeployments();
      setStep("complete");
    } catch (err) {
      setError(`Failed to create deployment: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle keyboard for provider selection, droplet size, confirm, and complete steps
  useKeyboard((key) => {
    const currentState = stateRef.current;
    debugLog(`useKeyboard: key=${key.name}, step=${currentState.step}`);
    if (currentState.step === "provider") {
      if (key.name === "up") {
        setSelectedProviderIndex((prev) => Math.max(0, prev - 1));
      } else if (key.name === "down") {
        setSelectedProviderIndex((prev) => Math.min(SUPPORTED_PROVIDERS.length - 1, prev + 1));
      } else if (key.name === "return") {
        handleProviderSubmit();
      } else if (key.name === "escape") {
        setStep("name");
      }
    } else if (currentState.step === "droplet_size") {
      if (key.name === "up") {
        setSelectedDropletSizeIndex((prev) => Math.max(0, prev - 1));
      } else if (key.name === "down") {
        setSelectedDropletSizeIndex((prev) => Math.min(DO_DROPLET_SIZES.length - 1, prev + 1));
      } else if (key.name === "return") {
        setError(null);
        setStep("ai_provider");
      } else if (key.name === "escape") {
        setStep("api_key");
      }
    } else if (currentState.step === "ai_provider") {
      if (key.name === "up") {
        setSelectedAiProviderIndex((prev) => Math.max(0, prev - 1));
      } else if (key.name === "down") {
        setSelectedAiProviderIndex((prev) => Math.min(AI_PROVIDERS.length - 1, prev + 1));
      } else if (key.name === "return") {
        handleAiProviderSubmit();
      } else if (key.name === "escape") {
        if (currentState.provider === "digitalocean") {
          setStep("droplet_size");
        } else {
          setStep("api_key");
        }
      }
    } else if (currentState.step === "confirm") {
      if (key.name === "y" || key.name === "return") {
        handleConfirmFromRef();
      } else if (key.name === "n" || key.name === "escape") {
        setStep("telegram_allow_from");
      }
    } else if (currentState.step === "complete") {
      context.navigateTo("home");
    }
  });

  const handleNameSubmit = () => {
    const validation = validateDeploymentName(name);
    if (!validation.valid) {
      setError(validation.error || "Invalid name");
      return;
    }
    setError(null);
    setStep("provider");
  };

  const handleProviderSubmit = () => {
    setProvider(SUPPORTED_PROVIDERS[selectedProviderIndex]);
    setStep("api_key");
  };

  const handleApiKeySubmit = async () => {
    debugLog(`handleApiKeySubmit CALLED: apiKey.length=${apiKey?.length ?? "null"}`);

    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      let isValid: boolean;
      if (provider === "digitalocean") {
        const client = createDigitalOceanClient(apiKey);
        isValid = await client.validateAPIKey();
      } else {
        const client = createHetznerClient(apiKey);
        isValid = await client.validateAPIKey();
      }

      if (!isValid) {
        setError("Invalid API key. Please check and try again.");
        setIsValidating(false);
        return;
      }

      debugLog(`  SUCCESS: Moving to next step`);
      if (provider === "digitalocean") {
        setStep("droplet_size");
      } else {
        setStep("ai_provider");
      }
    } catch (err) {
      setError(`Failed to validate API key: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleAiProviderSubmit = () => {
    const selected = AI_PROVIDERS[selectedAiProviderIndex];
    setAiProvider(selected.name);
    setError(null);
    setStep("ai_api_key");
  };

  const handleAiApiKeySubmit = () => {
    if (!aiApiKey.trim()) {
      setError("AI provider API key is required");
      return;
    }
    setError(null);
    setStep("model");
  };

  const handleModelSubmit = () => {
    if (!model.trim()) {
      setError("Model identifier is required");
      return;
    }
    setError(null);
    setStep("telegram_bot_token");
  };

  const handleTelegramBotTokenSubmit = () => {
    if (!telegramBotToken.trim()) {
      setError("Telegram bot token is required");
      return;
    }
    setError(null);
    setStep("telegram_allow_from");
  };

  const handleTelegramAllowFromSubmit = () => {
    if (!telegramAllowFrom.trim()) {
      setError("Telegram user ID is required for access control");
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const getAiProviderHint = (): string => {
    const p = aiProvider.trim().toLowerCase();
    if (p === "anthropic") return "ANTHROPIC_API_KEY";
    if (p === "openai") return "OPENAI_API_KEY";
    if (p === "openrouter") return "OPENROUTER_API_KEY";
    if (p === "google") return "GOOGLE_API_KEY";
    if (p === "groq") return "GROQ_API_KEY";
    return "API Key";
  };

  const getModelHint = (): string => {
    const p = aiProvider.trim().toLowerCase();
    if (p === "anthropic") return "e.g. claude-sonnet-4-20250514, claude-3-5-haiku-20241022";
    if (p === "openai") return "e.g. gpt-4o, gpt-4o-mini, o1-preview";
    if (p === "openrouter") return "e.g. anthropic/claude-sonnet-4-20250514, openai/gpt-4o";
    if (p === "google") return "e.g. gemini-2.0-flash, gemini-1.5-pro";
    if (p === "groq") return "e.g. llama-3.3-70b-versatile";
    return "e.g. claude-sonnet-4-20250514";
  };

  const getApiKeyLabel = (): string => {
    if (provider === "digitalocean") return "DigitalOcean API Token";
    return "Hetzner API Key";
  };

  const getApiKeyHelpUrl = (): string => {
    if (provider === "digitalocean") {
      return "https://docs.digitalocean.com/reference/api/create-personal-access-token/";
    }
    return "https://docs.hetzner.com/cloud/api/getting-started/generating-api-token";
  };

  const getServerSpecsLabel = (): string => {
    if (provider === "digitalocean") {
      const size = DO_DROPLET_SIZES[selectedDropletSizeIndex];
      return `${size.slug} (${size.label})`;
    }
    return "CPX11 (2 vCPU, 2GB RAM, 40GB SSD)";
  };

  const getLocationLabel = (): string => {
    if (provider === "digitalocean") return "NYC1 (New York 1)";
    return "Ashburn, VA (US East)";
  };

  const currentStepNumber = (s: Step): number => {
    const idx = stepList.indexOf(s);
    return idx >= 0 ? idx + 1 : 0;
  };

  const renderStep = () => {
    switch (step) {
      case "name":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("name")}: Deployment Name</text>
            <text fg={t.fg.secondary} marginTop={1}>
              Enter a unique name for this deployment (lowercase, alphanumeric, hyphens allowed):
            </text>
            <text fg={t.fg.primary} marginTop={1}>Name:</text>
            <input
              value={name}
              placeholder="my-openclaw-server"
              focused
              onInput={(value) => {
                if (typeof value === "string" && stateRef.current.step === "name") {
                  setName(value);
                }
              }}
              onSubmit={() => handleNameSubmit()}
              onKeyDown={(e) => {
                if (e.name === "escape") {
                  context.navigateTo("home");
                }
              }}
            />
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={2}>Press Enter to continue, or Esc to go back</text>
          </box>
        );

      case "provider":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("provider")}: Cloud Provider</text>
            <text fg={t.fg.secondary} marginTop={1}>Select where to deploy (use arrow keys and Enter):</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              marginTop={1}
              padding={1}
            >
              {SUPPORTED_PROVIDERS.map((p, i) => {
                const isSelected = i === selectedProviderIndex;
                const desc = p === "hetzner" ? "Recommended - US East" : "NYC1 - New York";
                return (
                  <box key={p} flexDirection="row" backgroundColor={isSelected ? t.selection.bg : undefined}>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>{isSelected ? ">" : " "} </text>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>{PROVIDER_NAMES[p]}</text>
                    <text fg={isSelected ? t.fg.primary : t.fg.secondary}>{" - " + desc}</text>
                  </box>
                );
              })}
            </box>
            <text fg={t.fg.muted} marginTop={1}>Press Enter to select, Esc to go back</text>
          </box>
        );

      case "api_key":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("api_key")}: {getApiKeyLabel()}</text>
            <text fg={t.fg.secondary} marginTop={1}>Enter your {getApiKeyLabel()}.</text>
            <text fg={t.fg.secondary} marginTop={1}>
              Get one at: {getApiKeyHelpUrl()}
            </text>
            <text fg={t.fg.primary} marginTop={2}>API Key:</text>
            <input
              value={apiKey}
              placeholder={`Enter your ${getApiKeyLabel()}...`}
              focused
              onInput={(value) => {
                debugLog(`API_KEY onInput: value.type=${typeof value}, currentStep=${stateRef.current.step}`);
                if (typeof value === "string" && stateRef.current.step === "api_key") {
                  setApiKey(value);
                }
              }}
              onSubmit={() => {
                if (!isValidating) {
                  handleApiKeySubmit();
                }
              }}
              onKeyDown={(e) => {
                if (e.name === "escape") {
                  setStep("provider");
                }
              }}
            />
            {isValidating && <text fg={t.status.warning} marginTop={1}>Validating API key...</text>}
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
          </box>
        );

      case "droplet_size":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("droplet_size")}: Droplet Size</text>
            <text fg={t.fg.secondary} marginTop={1}>Select your DigitalOcean droplet size (use arrow keys and Enter):</text>
            <text fg={t.fg.muted} marginTop={1}>NOTE: Minimum size for running OpenClaw without heap out of memory errors is 2GB RAM</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              marginTop={1}
              padding={1}
            >
              {DO_DROPLET_SIZES.map((size, i) => {
                const isSelected = i === selectedDropletSizeIndex;
                return (
                  <box key={size.slug} flexDirection="row" backgroundColor={isSelected ? t.selection.bg : undefined}>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>{isSelected ? ">" : " "} </text>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>{size.slug}</text>
                    <text fg={isSelected ? t.fg.primary : t.fg.secondary}>{" - " + size.label + " - " + size.price}</text>
                  </box>
                );
              })}
            </box>
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={1}>Press Enter to select, Esc to go back</text>
          </box>
        );

      case "ai_provider":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("ai_provider")}: AI Provider</text>
            <text fg={t.fg.secondary} marginTop={1}>Select your AI model provider (use arrow keys and Enter):</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              marginTop={1}
              padding={1}
            >
              {AI_PROVIDERS.map((p, i) => {
                const isSelected = i === selectedAiProviderIndex;
                return (
                  <box key={p.name} flexDirection="row" backgroundColor={isSelected ? t.selection.bg : undefined}>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>{isSelected ? ">" : " "} </text>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>{p.label}</text>
                    <text fg={isSelected ? t.fg.primary : t.fg.secondary}>{" - " + p.description}</text>
                  </box>
                );
              })}
            </box>
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={1}>Press Enter to select, Esc to go back</text>
          </box>
        );

      case "ai_api_key":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("ai_api_key")}: AI Provider API Key</text>
            <text fg={t.fg.secondary} marginTop={1}>
              Enter your {aiProvider || "AI provider"} API key ({getAiProviderHint()}).
            </text>
            <text fg={t.fg.primary} marginTop={2}>{getAiProviderHint()}:</text>
            <input
              value={aiApiKey}
              placeholder={`Enter your ${aiProvider || "AI provider"} API key...`}
              focused
              onInput={(value) => {
                if (typeof value === "string" && stateRef.current.step === "ai_api_key") {
                  setAiApiKey(value);
                }
              }}
              onSubmit={() => handleAiApiKeySubmit()}
              onKeyDown={(e) => {
                if (e.name === "escape") {
                  setStep("ai_provider");
                }
              }}
            />
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={2}>Press Enter to continue, Esc to go back</text>
          </box>
        );

      case "model":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("model")}: Default Model</text>
            <text fg={t.fg.secondary} marginTop={1}>
              Enter the model identifier for {aiProvider || "your AI provider"}.
            </text>
            <text fg={t.fg.secondary} marginTop={1}>
              {getModelHint()}
            </text>
            <text fg={t.fg.primary} marginTop={2}>Model:</text>
            <input
              value={model}
              placeholder="claude-sonnet-4-20250514"
              focused
              onInput={(value) => {
                if (typeof value === "string" && stateRef.current.step === "model") {
                  setModel(value);
                }
              }}
              onSubmit={() => handleModelSubmit()}
              onKeyDown={(e) => {
                if (e.name === "escape") {
                  setStep("ai_api_key");
                }
              }}
            />
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={2}>Press Enter to continue, Esc to go back</text>
          </box>
        );

      case "telegram_bot_token":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("telegram_bot_token")}: Telegram Bot Token</text>
            <text fg={t.fg.secondary} marginTop={1}>
              Enter your Telegram bot token. Create one via @BotFather on Telegram.
            </text>
            <text fg={t.fg.secondary} marginTop={1}>
              Open Telegram, search for @BotFather, send /newbot and follow the steps.
            </text>
            <text fg={t.fg.primary} marginTop={2}>Bot Token:</text>
            <input
              value={telegramBotToken}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
              focused
              onInput={(value) => {
                if (typeof value === "string" && stateRef.current.step === "telegram_bot_token") {
                  setTelegramBotToken(value);
                }
              }}
              onSubmit={() => handleTelegramBotTokenSubmit()}
              onKeyDown={(e) => {
                if (e.name === "escape") {
                  setStep("model");
                }
              }}
            />
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={2}>Press Enter to continue, Esc to go back</text>
          </box>
        );

      case "telegram_allow_from":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("telegram_allow_from")}: Telegram Access Control</text>
            <text fg={t.fg.secondary} marginTop={1}>
              Enter your Telegram user ID or @username to restrict bot access.
            </text>
            <text fg={t.fg.secondary}>
              Only messages from this user will be processed by the agent.
            </text>
            <text fg={t.fg.secondary} marginTop={1}>
              Find your user ID: https://docs.openclaw.ai/channels/telegram#finding-your-telegram-user-id
            </text>
            <text fg={t.fg.secondary}>
              Learn more: https://docs.openclaw.ai/channels/telegram#access-control-dms-+-groups
            </text>
            <text fg={t.fg.primary} marginTop={2}>User ID or @username:</text>
            <input
              value={telegramAllowFrom}
              placeholder="123456789 or @yourusername"
              focused
              onInput={(value) => {
                if (typeof value === "string" && stateRef.current.step === "telegram_allow_from") {
                  setTelegramAllowFrom(value);
                }
              }}
              onSubmit={() => handleTelegramAllowFromSubmit()}
              onKeyDown={(e) => {
                if (e.name === "escape") {
                  setStep("telegram_bot_token");
                }
              }}
            />
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={2}>Press Enter to continue, Esc to go back</text>
          </box>
        );

      case "confirm":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Step {currentStepNumber("confirm")}: Confirm Configuration</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              padding={1}
              marginTop={1}
            >
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Name:</text>
                <text fg={t.fg.primary}>{name}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Cloud Provider:</text>
                <text fg={t.fg.primary}>{PROVIDER_NAMES[provider]}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Server Type:</text>
                <text fg={t.fg.primary}>{getServerSpecsLabel()}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Location:</text>
                <text fg={t.fg.primary}>{getLocationLabel()}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>OS:</text>
                <text fg={t.fg.primary}>Ubuntu 24.04 LTS</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>AI Provider:</text>
                <text fg={t.fg.primary}>{aiProvider}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>AI API Key:</text>
                <text fg={t.fg.primary}>{aiApiKey ? `${aiApiKey.substring(0, 8)}...` : "N/A"}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Model:</text>
                <text fg={t.fg.primary}>{model}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Channel:</text>
                <text fg={t.fg.primary}>Telegram</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Bot Token:</text>
                <text fg={t.fg.primary}>{telegramBotToken ? `${telegramBotToken.substring(0, 12)}...` : "N/A"}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Allow From:</text>
                <text fg={t.fg.primary}>{telegramAllowFrom || "N/A"}</text>
              </box>
            </box>
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.status.warning} marginTop={2}>Press Y to confirm, N to go back</text>
          </box>
        );

      case "complete":
        return (
          <box flexDirection="column">
            <text fg={t.status.success}>Deployment Configuration Created!</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              padding={1}
              marginTop={1}
            >
              <text fg={t.fg.primary}>Your deployment "{name}" has been initialized.</text>
              <text fg={t.fg.secondary} marginTop={1}>
                Configuration saved to: ~/.clawcontrol/deployments/{name}/
              </text>
              <text fg={t.fg.secondary} marginTop={1}>
                AI: {aiProvider} / {model}
              </text>
              <text fg={t.fg.secondary}>
                Channel: Telegram (allowed: {telegramAllowFrom})
              </text>
            </box>
            <text fg={t.accent} marginTop={2}>Next step: Run /deploy to deploy this configuration</text>
            <text fg={t.fg.muted} marginTop={2}>Press any key to return to home</text>
          </box>
        );
    }
  };

  return (
    <box flexDirection="column" width="100%" padding={1}>
      {/* Header */}
      <box flexDirection="row" marginBottom={2}>
        <text fg={t.accent}>/new</text>
        <text fg={t.fg.secondary}> - Initialize a new deployment</text>
      </box>

      {/* Progress indicator */}
      <box flexDirection="row" marginBottom={2}>
        {stepList.map((s, i) => {
          const currentIdx = stepList.indexOf(step);
          const stepColor = step === s ? t.accent : currentIdx > i ? t.status.success : t.fg.muted;
          return (
            <box key={s} flexDirection="row">
              <text fg={stepColor}>{i + 1}</text>
              {i < stepList.length - 1 && <text fg={t.fg.muted}> → </text>}
            </box>
          );
        })}
      </box>

      {/* Step content */}
      {renderStep()}
    </box>
  );
}
