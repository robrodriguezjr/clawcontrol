import { useState, useRef, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import type { AppContext } from "../App.js";
import type { Template, Provider } from "../types/index.js";
import {
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
  generateTemplateId,
} from "../services/templates.js";
import {
  SUPPORTED_PROVIDERS,
  PROVIDER_NAMES,
  AI_PROVIDERS,
} from "../providers/index.js";
import { t } from "../theme.js";

interface Props {
  context: AppContext;
}

type ViewState =
  | "listing"
  | "viewing"
  | "forking"
  | "fork_complete"
  | "delete_confirm";

type ForkStep =
  | "fork_name"
  | "fork_provider"
  | "fork_droplet_size"
  | "fork_ai_provider"
  | "fork_model"
  | "fork_confirm";

const DO_DROPLET_SIZES = [
  { slug: "s-1vcpu-2gb", label: "1 vCPU, 2GB RAM, 50GB SSD", price: "$12/mo" },
  { slug: "s-2vcpu-2gb", label: "2 vCPU, 2GB RAM, 60GB SSD", price: "$18/mo" },
  { slug: "s-2vcpu-4gb", label: "2 vCPU, 4GB RAM, 80GB SSD", price: "$24/mo" },
  { slug: "s-4vcpu-8gb", label: "4 vCPU, 8GB RAM, 160GB SSD", price: "$48/mo" },
  { slug: "s-8vcpu-16gb", label: "8 vCPU, 16GB RAM, 320GB SSD", price: "$96/mo" },
];

export function TemplatesView({ context }: Props) {
  const [viewState, setViewState] = useState<ViewState>("listing");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fork state
  const [forkStep, setForkStep] = useState<ForkStep>("fork_name");
  const [forkName, setForkName] = useState("");
  const [forkProvider, setForkProvider] = useState<Provider>("hetzner");
  const [forkProviderIndex, setForkProviderIndex] = useState(0);
  const [forkDropletSizeIndex, setForkDropletSizeIndex] = useState(0);
  const [forkAiProvider, setForkAiProvider] = useState("");
  const [forkAiProviderIndex, setForkAiProviderIndex] = useState(0);
  const [forkModel, setForkModel] = useState("");

  const stateRef = useRef({
    viewState, selectedIndex, selectedTemplate, forkStep,
    forkName, forkProvider, forkProviderIndex, forkDropletSizeIndex,
    forkAiProvider, forkAiProviderIndex, forkModel,
  });
  stateRef.current = {
    viewState, selectedIndex, selectedTemplate, forkStep,
    forkName, forkProvider, forkProviderIndex, forkDropletSizeIndex,
    forkAiProvider, forkAiProviderIndex, forkModel,
  };

  const refreshTemplates = () => {
    try {
      setTemplates(getAllTemplates());
    } catch {
      setTemplates([]);
    }
  };

  useEffect(() => {
    refreshTemplates();
  }, []);

  const startFork = (template: Template) => {
    setForkName(`${template.name} (copy)`);
    setForkProvider(template.provider);
    setForkProviderIndex(SUPPORTED_PROVIDERS.indexOf(template.provider));
    if (template.digitalocean) {
      const sizeIdx = DO_DROPLET_SIZES.findIndex((s) => s.slug === template.digitalocean!.size);
      setForkDropletSizeIndex(sizeIdx >= 0 ? sizeIdx : 0);
    } else {
      setForkDropletSizeIndex(0);
    }
    const aiIdx = AI_PROVIDERS.findIndex((p) => p.name === template.aiProvider);
    setForkAiProviderIndex(aiIdx >= 0 ? aiIdx : 0);
    setForkAiProvider(template.aiProvider);
    setForkModel(template.model);
    setForkStep("fork_name");
    setViewState("forking");
    setError(null);
  };

  const completeFork = () => {
    const s = stateRef.current;
    if (!s.forkName.trim()) {
      setError("Template name is required");
      return;
    }

    const id = generateTemplateId(s.forkName);
    const source = s.selectedTemplate;

    const newTemplate: Template = {
      id,
      name: s.forkName.trim(),
      description: `Forked from "${source?.name ?? "unknown"}"`,
      builtIn: false,
      createdAt: new Date().toISOString(),
      provider: s.forkProvider,
      hetzner: s.forkProvider === "hetzner"
        ? (source?.hetzner ?? { serverType: "cpx11", location: "ash", image: "ubuntu-24.04" })
        : undefined,
      digitalocean: s.forkProvider === "digitalocean"
        ? {
            size: DO_DROPLET_SIZES[s.forkDropletSizeIndex].slug,
            region: source?.digitalocean?.region ?? "nyc1",
            image: source?.digitalocean?.image ?? "ubuntu-24-04-x64",
          }
        : undefined,
      aiProvider: s.forkAiProvider,
      model: s.forkModel,
      channel: "telegram",
    };

    try {
      saveTemplate(newTemplate);
      refreshTemplates();
      setViewState("fork_complete");
      setError(null);
    } catch (err) {
      setError(`Failed to save template: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const getForkStepList = (): ForkStep[] => {
    const steps: ForkStep[] = ["fork_name", "fork_provider"];
    if (forkProvider === "digitalocean") {
      steps.push("fork_droplet_size");
    }
    steps.push("fork_ai_provider", "fork_model", "fork_confirm");
    return steps;
  };

  const advanceForkStep = () => {
    const steps = getForkStepList();
    const idx = steps.indexOf(forkStep);
    if (idx < steps.length - 1) {
      setForkStep(steps[idx + 1]);
      setError(null);
    }
  };

  const retreatForkStep = () => {
    const steps = getForkStepList();
    const idx = steps.indexOf(forkStep);
    if (idx > 0) {
      setForkStep(steps[idx - 1]);
      setError(null);
    } else {
      setViewState("viewing");
    }
  };

  useKeyboard((key) => {
    const s = stateRef.current;

    if (s.viewState === "listing") {
      if (key.name === "up") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.name === "down") {
        setSelectedIndex((prev) => Math.min(templates.length - 1, prev + 1));
      } else if (key.name === "return") {
        if (templates.length > 0) {
          setSelectedTemplate(templates[s.selectedIndex]);
          setViewState("viewing");
        }
      } else if (key.name === "escape") {
        context.navigateTo("home");
      }
    } else if (s.viewState === "viewing") {
      if (key.name === "f") {
        if (s.selectedTemplate) startFork(s.selectedTemplate);
      } else if (key.name === "u") {
        if (s.selectedTemplate) {
          context.setSelectedTemplate(s.selectedTemplate);
          context.navigateTo("new");
        }
      } else if (key.name === "d") {
        if (s.selectedTemplate && !s.selectedTemplate.builtIn) {
          setViewState("delete_confirm");
        }
      } else if (key.name === "escape") {
        setViewState("listing");
      }
    } else if (s.viewState === "delete_confirm") {
      if (key.name === "y") {
        if (s.selectedTemplate) {
          const result = deleteTemplate(s.selectedTemplate.id);
          if (result.success) {
            refreshTemplates();
            setSelectedTemplate(null);
            setSelectedIndex(0);
            setViewState("listing");
          } else {
            setError(result.error ?? "Failed to delete");
            setViewState("viewing");
          }
        }
      } else if (key.name === "n" || key.name === "escape") {
        setViewState("viewing");
      }
    } else if (s.viewState === "fork_complete") {
      setViewState("listing");
      setSelectedIndex(0);
    } else if (s.viewState === "forking") {
      if (s.forkStep === "fork_provider") {
        if (key.name === "up") {
          setForkProviderIndex((prev) => Math.max(0, prev - 1));
        } else if (key.name === "down") {
          setForkProviderIndex((prev) => Math.min(SUPPORTED_PROVIDERS.length - 1, prev + 1));
        } else if (key.name === "return") {
          setForkProvider(SUPPORTED_PROVIDERS[s.forkProviderIndex]);
          advanceForkStep();
        } else if (key.name === "escape") {
          retreatForkStep();
        }
      } else if (s.forkStep === "fork_droplet_size") {
        if (key.name === "up") {
          setForkDropletSizeIndex((prev) => Math.max(0, prev - 1));
        } else if (key.name === "down") {
          setForkDropletSizeIndex((prev) => Math.min(DO_DROPLET_SIZES.length - 1, prev + 1));
        } else if (key.name === "return") {
          advanceForkStep();
        } else if (key.name === "escape") {
          retreatForkStep();
        }
      } else if (s.forkStep === "fork_ai_provider") {
        if (key.name === "up") {
          setForkAiProviderIndex((prev) => Math.max(0, prev - 1));
        } else if (key.name === "down") {
          setForkAiProviderIndex((prev) => Math.min(AI_PROVIDERS.length - 1, prev + 1));
        } else if (key.name === "return") {
          setForkAiProvider(AI_PROVIDERS[s.forkAiProviderIndex].name);
          advanceForkStep();
        } else if (key.name === "escape") {
          retreatForkStep();
        }
      } else if (s.forkStep === "fork_confirm") {
        if (key.name === "y" || key.name === "return") {
          completeFork();
        } else if (key.name === "n" || key.name === "escape") {
          retreatForkStep();
        }
      }
    }
  });

  const renderListing = () => (
    <box flexDirection="column">
      <text fg={t.fg.secondary} marginBottom={1}>
        Select a template to view details. Use arrow keys and Enter.
      </text>
      <box
        flexDirection="column"
        borderStyle="single"
        borderColor={t.border.default}
        padding={1}
      >
        {templates.length === 0 ? (
          <text fg={t.fg.muted}>No templates found.</text>
        ) : (
          templates.map((tmpl, i) => {
            const isSelected = i === selectedIndex;
            const badge = tmpl.builtIn ? "[built-in]" : "[custom]";
            const badgeColor = tmpl.builtIn ? t.status.info : t.status.success;
            return (
              <box key={tmpl.id} flexDirection="row" backgroundColor={isSelected ? t.selection.bg : undefined}>
                <text fg={isSelected ? t.selection.indicator : t.fg.primary}>
                  {isSelected ? "> " : "  "}
                </text>
                <text fg={isSelected ? t.selection.fg : t.fg.primary}>{tmpl.name}</text>
                <text fg={badgeColor}>{" " + badge}</text>
                <text fg={t.fg.muted}>{" · " + tmpl.channel}</text>
              </box>
            );
          })
        )}
      </box>
      <text fg={t.fg.muted} marginTop={1}>Enter to view, Esc to go back</text>
    </box>
  );

  const renderViewing = () => {
    if (!selectedTemplate) return null;
    const tmpl = selectedTemplate;
    return (
      <box flexDirection="column">
        <text fg={t.accent} marginBottom={1}>{tmpl.name}</text>
        <text fg={t.fg.secondary} marginBottom={1}>{tmpl.description}</text>
        <box
          flexDirection="column"
          borderStyle="single"
          borderColor={t.border.default}
          padding={1}
          marginBottom={1}
        >
          <box flexDirection="row">
            <text fg={t.fg.secondary} width={20}>Type:</text>
            <text fg={tmpl.builtIn ? t.status.info : t.status.success}>
              {tmpl.builtIn ? "Built-in" : "Custom"}
            </text>
          </box>
          <box flexDirection="row">
            <text fg={t.fg.secondary} width={20}>Provider:</text>
            <text fg={t.fg.primary}>{PROVIDER_NAMES[tmpl.provider]}</text>
          </box>
          {tmpl.hetzner && (
            <>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Server Type:</text>
                <text fg={t.fg.primary}>{tmpl.hetzner.serverType}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Location:</text>
                <text fg={t.fg.primary}>{tmpl.hetzner.location}</text>
              </box>
            </>
          )}
          {tmpl.digitalocean && (
            <>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Droplet Size:</text>
                <text fg={t.fg.primary}>{tmpl.digitalocean.size}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Region:</text>
                <text fg={t.fg.primary}>{tmpl.digitalocean.region}</text>
              </box>
            </>
          )}
          <box flexDirection="row">
            <text fg={t.fg.secondary} width={20}>AI Provider:</text>
            <text fg={t.fg.primary}>{tmpl.aiProvider}</text>
          </box>
          <box flexDirection="row">
            <text fg={t.fg.secondary} width={20}>Model:</text>
            <text fg={t.fg.primary}>{tmpl.model}</text>
          </box>
          <box flexDirection="row">
            <text fg={t.fg.secondary} width={20}>Channel:</text>
            <text fg={t.fg.primary}>{tmpl.channel}</text>
          </box>
        </box>

        <box flexDirection="row">
          <text fg={t.accent}>[F]</text><text fg={t.fg.primary}>ork  </text>
          <text fg={t.accent}>[U]</text><text fg={t.fg.primary}>se  </text>
          {!tmpl.builtIn && (
            <>
              <text fg={t.status.error}>[D]</text><text fg={t.fg.primary}>elete  </text>
            </>
          )}
          <text fg={t.fg.muted}>[Esc] Back</text>
        </box>
        {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
      </box>
    );
  };

  const renderDeleteConfirm = () => (
    <box flexDirection="column">
      <text fg={t.status.error}>Delete Template</text>
      <text fg={t.fg.primary} marginTop={1}>
        Are you sure you want to delete "{selectedTemplate?.name}"?
      </text>
      <text fg={t.status.warning} marginTop={1}>This action cannot be undone.</text>
      <text fg={t.fg.muted} marginTop={2}>Press Y to confirm, N to cancel</text>
    </box>
  );

  const renderForkComplete = () => (
    <box flexDirection="column">
      <text fg={t.status.success}>Template Created!</text>
      <text fg={t.fg.primary} marginTop={1}>
        Your template "{forkName}" has been saved.
      </text>
      <text fg={t.fg.muted} marginTop={2}>Press any key to return to templates list</text>
    </box>
  );

  const renderForking = () => {
    switch (forkStep) {
      case "fork_name":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Fork Template - Name</text>
            <text fg={t.fg.secondary} marginTop={1}>Enter a name for the new template:</text>
            <input
              value={forkName}
              placeholder="My Template"
              focused
              onInput={(value) => {
                if (typeof value === "string" && stateRef.current.forkStep === "fork_name") {
                  setForkName(value);
                }
              }}
              onSubmit={() => {
                if (forkName.trim()) {
                  advanceForkStep();
                } else {
                  setError("Template name is required");
                }
              }}
              onKeyDown={(e) => {
                if (e.name === "escape") retreatForkStep();
              }}
            />
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={2}>Press Enter to continue, Esc to go back</text>
          </box>
        );

      case "fork_provider":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Fork Template - Provider</text>
            <text fg={t.fg.secondary} marginTop={1}>Select cloud provider:</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              marginTop={1}
              padding={1}
            >
              {SUPPORTED_PROVIDERS.map((p, i) => {
                const isSelected = i === forkProviderIndex;
                return (
                  <box key={p} flexDirection="row" backgroundColor={isSelected ? t.selection.bg : undefined}>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>
                      {isSelected ? "> " : "  "}
                    </text>
                    <text fg={isSelected ? t.selection.fg : t.fg.primary}>{PROVIDER_NAMES[p]}</text>
                  </box>
                );
              })}
            </box>
            <text fg={t.fg.muted} marginTop={1}>Enter to select, Esc to go back</text>
          </box>
        );

      case "fork_droplet_size":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Fork Template - Droplet Size</text>
            <text fg={t.fg.secondary} marginTop={1}>Select DigitalOcean droplet size:</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              marginTop={1}
              padding={1}
            >
              {DO_DROPLET_SIZES.map((size, i) => {
                const isSelected = i === forkDropletSizeIndex;
                return (
                  <box key={size.slug} flexDirection="row" backgroundColor={isSelected ? t.selection.bg : undefined}>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>
                      {isSelected ? "> " : "  "}
                    </text>
                    <text fg={isSelected ? t.selection.fg : t.fg.primary}>{size.slug}</text>
                    <text fg={isSelected ? t.fg.primary : t.fg.secondary}>{" - " + size.label + " - " + size.price}</text>
                  </box>
                );
              })}
            </box>
            <text fg={t.fg.muted} marginTop={1}>Enter to select, Esc to go back</text>
          </box>
        );

      case "fork_ai_provider":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Fork Template - AI Provider</text>
            <text fg={t.fg.secondary} marginTop={1}>Select AI provider:</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              marginTop={1}
              padding={1}
            >
              {AI_PROVIDERS.map((p, i) => {
                const isSelected = i === forkAiProviderIndex;
                return (
                  <box key={p.name} flexDirection="row" backgroundColor={isSelected ? t.selection.bg : undefined}>
                    <text fg={isSelected ? t.selection.indicator : t.fg.primary}>
                      {isSelected ? "> " : "  "}
                    </text>
                    <text fg={isSelected ? t.selection.fg : t.fg.primary}>{p.label}</text>
                    <text fg={isSelected ? t.fg.primary : t.fg.secondary}>{" - " + p.description}</text>
                  </box>
                );
              })}
            </box>
            <text fg={t.fg.muted} marginTop={1}>Enter to select, Esc to go back</text>
          </box>
        );

      case "fork_model":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Fork Template - Model</text>
            <text fg={t.fg.secondary} marginTop={1}>Enter the model identifier:</text>
            <input
              value={forkModel}
              placeholder="e.g. claude-sonnet-4-20250514"
              focused
              onInput={(value) => {
                if (typeof value === "string" && stateRef.current.forkStep === "fork_model") {
                  setForkModel(value);
                }
              }}
              onSubmit={() => {
                if (forkModel.trim()) {
                  advanceForkStep();
                } else {
                  setError("Model identifier is required");
                }
              }}
              onKeyDown={(e) => {
                if (e.name === "escape") retreatForkStep();
              }}
            />
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.fg.muted} marginTop={2}>Press Enter to continue, Esc to go back</text>
          </box>
        );

      case "fork_confirm":
        return (
          <box flexDirection="column">
            <text fg={t.accent}>Fork Template - Confirm</text>
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor={t.border.default}
              padding={1}
              marginTop={1}
            >
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Name:</text>
                <text fg={t.fg.primary}>{forkName}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Provider:</text>
                <text fg={t.fg.primary}>{PROVIDER_NAMES[forkProvider]}</text>
              </box>
              {forkProvider === "digitalocean" && (
                <box flexDirection="row">
                  <text fg={t.fg.secondary} width={20}>Droplet Size:</text>
                  <text fg={t.fg.primary}>{DO_DROPLET_SIZES[forkDropletSizeIndex].slug}</text>
                </box>
              )}
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>AI Provider:</text>
                <text fg={t.fg.primary}>{forkAiProvider}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Model:</text>
                <text fg={t.fg.primary}>{forkModel}</text>
              </box>
              <box flexDirection="row">
                <text fg={t.fg.secondary} width={20}>Channel:</text>
                <text fg={t.fg.primary}>telegram</text>
              </box>
            </box>
            {error && <text fg={t.status.error} marginTop={1}>{error}</text>}
            <text fg={t.status.warning} marginTop={2}>Press Y to confirm, N to go back</text>
          </box>
        );
    }
  };

  const renderContent = () => {
    switch (viewState) {
      case "listing": return renderListing();
      case "viewing": return renderViewing();
      case "delete_confirm": return renderDeleteConfirm();
      case "fork_complete": return renderForkComplete();
      case "forking": return renderForking();
    }
  };

  return (
    <box flexDirection="column" width="100%" padding={1}>
      <box flexDirection="row" marginBottom={2}>
        <text fg={t.accent}>/templates</text>
        <text fg={t.fg.secondary}> - Manage deployment templates</text>
      </box>
      {renderContent()}
    </box>
  );
}
