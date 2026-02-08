import { useState } from "react";
import type { AppContext } from "../App.js";
import type { ViewName } from "../types/index.js";

interface Props {
  context: AppContext;
}

const LOGO = `
   _____ _                  _____            _             _
  / ____| |                / ____|          | |           | |
 | |    | | __ ___      __| |     ___  _ __ | |_ _ __ ___ | |
 | |    | |/ _\` \\ \\ /\\ / /| |    / _ \\| '_ \\| __| '__/ _ \\| |
 | |____| | (_| |\\ V  V / | |___| (_) | | | | |_| | | (_) | |
  \\_____|_|\\__,_| \\_/\\_/   \\_____\\___/|_| |_|\\__|_|  \\___/|_|
`;

const COMMANDS = [
  { name: "/new", description: "Initialize a new deployment" },
  { name: "/deploy", description: "Deploy an initialized configuration" },
  { name: "/status", description: "View deployment status" },
  { name: "/ssh", description: "SSH into a deployment" },
  { name: "/logs", description: "View deployment logs" },
  { name: "/destroy", description: "Destroy a deployment" },
  { name: "/help", description: "Show help" },
];

export function Home({ context }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCommand = (command: string) => {
    const cmd = command.trim().toLowerCase();
    setError(null);

    const viewMap: Record<string, ViewName> = {
      "/new": "new",
      "/deploy": "deploy",
      "/status": "status",
      "/ssh": "ssh",
      "/logs": "logs",
      "/destroy": "destroy",
      "/help": "help",
    };

    if (viewMap[cmd]) {
      context.navigateTo(viewMap[cmd]);
    } else if (cmd.startsWith("/")) {
      setError(`Unknown command: ${cmd}. Type /help for available commands.`);
    }
  };

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Scrollable Content */}
      <scrollbox
        width="100%"
        height="100%"
        scrollY={true}
        scrollX={false}
        focused={false}
        style={{
          flexGrow: 1,
          flexShrink: 1,
          width: "100%",
          height: "100%",
          backgroundColor: "#1e293b"
        }}
        verticalScrollbarOptions={{
          showArrows: false,
        }}
      >
        <box flexDirection="column" padding={1}>
          {/* Header */}
          <box flexDirection="column" marginBottom={1}>
            <text fg="cyan">{LOGO}</text>
            <text fg="gray">Deploy and manage OpenClaw instances with ease</text>
          </box>

          {/* Quick Start */}
          <box
            flexDirection="column"
            borderStyle="single"
            borderColor="blue"
            padding={1}
            marginBottom={1}
          >
            <text fg="cyan">Quick Start</text>
            <text fg="white" marginTop={1}>1. Type /new to initialize a new deployment</text>
            <text fg="white">2. Type /deploy to deploy your configuration</text>
            <text fg="white">3. Type /status to monitor your deployments</text>
          </box>

          {/* Available Commands */}
          <box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            padding={1}
            marginBottom={1}
          >
            <text fg="white">Available Commands</text>
            <box flexDirection="column" marginTop={1}>
              {COMMANDS.map((cmd) => (
                <box key={cmd.name} flexDirection="row">
                  <text fg="yellow" width={12}>{cmd.name}</text>
                  <text fg="gray">{cmd.description}</text>
                </box>
              ))}
            </box>
          </box>

          {/* Deployments Summary */}
          {context.deployments.length > 0 && (
            <box
              flexDirection="column"
              borderStyle="single"
              borderColor="green"
              padding={1}
              marginBottom={1}
            >
              <text fg="green">Your Deployments ({context.deployments.length})</text>
              <box flexDirection="column" marginTop={1}>
                {context.deployments.map((deployment) => (
                  <box key={deployment.config.name} flexDirection="row">
                    <text fg="white" width={20}>{deployment.config.name}</text>
                    <text
                      fg={
                        deployment.state.status === "deployed"
                          ? "green"
                          : deployment.state.status === "failed"
                            ? "red"
                            : "yellow"
                      }
                    >
                      {deployment.state.status}
                    </text>
                  </box>
                ))}
              </box>
            </box>
          )}
        </box>
      </scrollbox>

      {/* Sticky Command Input */}
      <box flexDirection="column" paddingLeft={0} paddingRight={0} paddingTop={0}>
        {error && (
          <box marginBottom={0}>
            <text fg="red">{error}</text>
          </box>
        )}
        {/* <text fg="cyan" marginBottom={0.5}>{"> Enter command:"}</text> */}
        <box
          // borderStyle="single"
          // borderColor="gray"
          backgroundColor="#16181D"
          marginTop={1}
          paddingTop={1}
        // paddingTop={0}
        // paddingBottom={1.1}
        // paddingLeft={2}
        // paddingRight={2}
        >
          <box width="100%" paddingTop={0}
            paddingBottom={1.3} paddingLeft={1}>
            <input
              value={inputValue}
              placeholder="Type a command (e.g., /new)..."
              focused
              width="100%"
              onInput={(value) => setInputValue(value)}
              onSubmit={(value) => {
                if (typeof value === "string" && typeof value.trim === "function" && value.trim()) {
                  handleCommand(value as string);
                  setInputValue("");
                }
              }}
            />
          </box>
        </box>
      </box>
    </box>
  );
}
