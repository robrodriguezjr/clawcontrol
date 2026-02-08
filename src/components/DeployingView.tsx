import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import open from "open";
import type { AppContext } from "../App.js";
import {
  startDeployment,
  type DeploymentProgress,
} from "../services/deployment.js";
import { readDeploymentState, getSSHKeyPath } from "../services/config.js";
import { openTerminalWithCommand, detectTerminal, getTerminalDisplayName } from "../utils/terminal.js";

interface Props {
  context: AppContext;
}

type DeployState = "deploying" | "confirming" | "waiting_terminal" | "success" | "failed";

interface ConfirmPrompt {
  message: string;
  resolve: (value: boolean) => void;
}

export function DeployingView({ context }: Props) {
  const [deployState, setDeployState] = useState<DeployState>("deploying");
  const [progress, setProgress] = useState<DeploymentProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPrompt | null>(null);
  const [terminalResolve, setTerminalResolve] = useState<(() => void) | null>(null);

  const deploymentName = context.selectedDeployment;

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [...prev.slice(-20), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  const handleProgress = useCallback((p: DeploymentProgress) => {
    setProgress(p);
    addLog(p.message);
  }, [addLog]);

  const handleConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmPrompt({ message, resolve });
      setDeployState("confirming");
    });
  }, []);

  const handleOpenUrl = useCallback(async (url: string): Promise<void> => {
    await open(url);
    addLog(`Opened browser: ${url}`);
  }, [addLog]);

  const handleSpawnTerminal = useCallback(async (deploymentName: string, serverIp: string, command: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const terminal = detectTerminal();
        const terminalName = getTerminalDisplayName(terminal.app);
        addLog(`Opening ${terminalName} for interactive setup...`);
        setDeployState("waiting_terminal");
        setTerminalResolve(() => resolve);

        const sshKeyPath = getSSHKeyPath(deploymentName);
        const sshCommand = `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@${serverIp} -t '${command}; echo ""; echo "=== Setup complete! You can close this terminal window. ==="; read -p "Press Enter to close..."'`;

        const result = openTerminalWithCommand(sshCommand);

        if (result.success) {
          addLog(`${terminalName} opened. Complete the setup there.`);
        } else {
          reject(new Error(result.error || "Failed to open terminal"));
        }
      } catch (err) {
        reject(err);
      }
    });
  }, [addLog]);

  const confirmTerminalComplete = useCallback(() => {
    if (terminalResolve) {
      terminalResolve();
      setTerminalResolve(null);
    }
    setDeployState("deploying");
    addLog("Terminal session confirmed complete, continuing deployment...");
  }, [terminalResolve, addLog]);

  // Ref for state to avoid stale closures
  const stateRef = useRef({ deployState, terminalResolve });
  stateRef.current = { deployState, terminalResolve };

  // Handle keyboard events
  useKeyboard((key) => {
    const currentState = stateRef.current;

    if (currentState.deployState === "waiting_terminal") {
      // User presses Enter to confirm terminal setup is complete
      if (key.name === "return") {
        confirmTerminalComplete();
      }
    } else if (currentState.deployState === "confirming" && confirmPrompt) {
      if (key.name === "y" || key.name === "return") {
        confirmPrompt.resolve(true);
        setConfirmPrompt(null);
        setDeployState("deploying");
      } else if (key.name === "n" || key.name === "escape") {
        confirmPrompt.resolve(false);
        setConfirmPrompt(null);
        setDeployState("deploying");
      }
    } else if (currentState.deployState === "success" || currentState.deployState === "failed") {
      context.navigateTo("home");
    }
  });

  useEffect(() => {
    if (!deploymentName) {
      context.navigateTo("home");
      return;
    }

    const runDeployment = async () => {
      try {
        addLog(`Starting deployment: ${deploymentName}`);

        await startDeployment(
          deploymentName,
          handleProgress,
          handleConfirm,
          handleOpenUrl,
          handleSpawnTerminal
        );

        setDeployState("success");
        addLog("Deployment completed successfully!");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setDeployState("failed");
        addLog(`Deployment failed: ${errorMessage}`);

        // Also log the checkpoint if available from DeploymentError
        if (err && typeof err === "object" && "checkpoint" in err) {
          addLog(`Failed at checkpoint: ${(err as { checkpoint: string }).checkpoint}`);
        }
      }
    };

    runDeployment();
  }, [deploymentName, addLog, handleConfirm, handleOpenUrl, handleProgress, handleSpawnTerminal, context]);

  const renderProgressBar = () => {
    if (!progress) return null;

    const width = 40;
    const filled = Math.round((progress.progress / 100) * width);
    const empty = width - filled;

    return (
      <box flexDirection="column" marginBottom={1}>
        <box flexDirection="row">
          <text fg="cyan">[</text>
          <text fg="green">{"█".repeat(filled)}</text>
          <text fg="gray">{"░".repeat(empty)}</text>
          <text fg="cyan">]</text>
          <text fg="white"> {Math.round(progress.progress)}%</text>
        </box>
        <text fg="yellow" marginTop={1}>Current: {progress.message}</text>
      </box>
    );
  };

  const renderConfirmDialog = () => {
    if (!confirmPrompt) return null;

    // Split message into lines and render each separately to avoid overlap
    const lines = confirmPrompt.message.split("\n");

    return (
      <box
        flexDirection="column"
        borderStyle="double"
        borderColor="yellow"
        padding={1}
        marginBottom={1}
      >
        <text fg="yellow">Confirmation Required</text>
        <box flexDirection="column" marginTop={1}>
          {lines.map((line, i) => (
            <text key={i} fg="white">{line}</text>
          ))}
        </box>
        <text fg="yellow" marginTop={1}>Press Y for Yes, N for No</text>
      </box>
    );
  };

  const renderWaitingTerminal = () => {
    return (
      <box flexDirection="column" flexGrow={1}>
        <box
          flexDirection="column"
          borderStyle="double"
          borderColor="cyan"
          padding={1}
          marginBottom={1}
        >
          <text fg="cyan">Interactive Setup</text>
          <text fg="white" marginTop={1}>A terminal window has been opened.</text>
        </box>

        <box
          flexDirection="column"
          borderStyle="single"
          borderColor="yellow"
          padding={1}
          marginBottom={1}
        >
          <text fg="yellow">Instructions:</text>
          <box flexDirection="column" marginTop={1}>
            <text fg="white">1. Complete the setup in the terminal window</text>
            <text fg="white">2. Follow the prompts shown in the terminal</text>
            <text fg="white">3. When done, close the terminal window</text>
            <text fg="white">4. Press Enter here to continue</text>
          </box>
        </box>

        <box
          flexDirection="column"
          borderStyle="single"
          borderColor="green"
          padding={1}
        >
          <text fg="green">Press Enter when you have completed the setup in the terminal</text>
        </box>
      </box>
    );
  };

  const renderSuccess = () => {
    const state = readDeploymentState(deploymentName!);

    return (
      <box flexDirection="column">
        <box
          flexDirection="column"
          borderStyle="double"
          borderColor="green"
          padding={1}
          marginBottom={1}
        >
          <text fg="green">Deployment Successful!</text>
          <text fg="green" marginTop={1}>Your OpenClaw instance is now running.</text>
        </box>

        <box
          flexDirection="column"
          borderStyle="single"
          borderColor="green"
          padding={1}
          marginBottom={1}
        >
          <text fg="green">Connection Details</text>
          <box flexDirection="row" marginTop={1}>
            <text fg="white" width={15}>Server IP:</text>
            <text fg="cyan">{state.serverIp || "N/A"}</text>
          </box>
          <box flexDirection="row">
            <text fg="white" width={15}>Tailscale IP:</text>
            <text fg="cyan">{state.tailscaleIp || "N/A"}</text>
          </box>
          <box flexDirection="row">
            <text fg="white" width={15}>Gateway Port:</text>
            <text fg="cyan">18789</text>
          </box>
        </box>

        <text fg="green">Next steps:</text>
        <text fg="white">  /ssh  - Connect to your server</text>
        <text fg="white">  /logs - View OpenClaw logs</text>
        <text fg="white">  Gateway: http://{state.tailscaleIp || state.serverIp}:18789/</text>

        <text fg="yellow" marginTop={2}>Press any key to return to home</text>
      </box>
    );
  };

  const renderFailed = () => {
    return (
      <box flexDirection="column">
        <box
          flexDirection="column"
          borderStyle="double"
          borderColor="red"
          padding={1}
          marginBottom={1}
        >
          <text fg="red">Deployment Failed</text>
          <text fg="white" marginTop={1}>Something went wrong during deployment.</text>
          <text fg="red" marginTop={1}>Error: {error}</text>
        </box>

        <box flexDirection="column" marginBottom={1}>
          <text fg="white">What you can do:</text>
          <text fg="gray">  1. Run /deploy again - it will resume from the last successful step</text>
          <text fg="gray">  2. Run /status to check the current state of your deployment</text>
          <text fg="gray">  3. Run /destroy and /new to start fresh if the issue persists</text>
        </box>

        <text fg="yellow" marginTop={1}>Press any key to return to home</text>
      </box>
    );
  };

  return (
    <box flexDirection="column" width="100%" padding={1}>
      {/* Header */}
      <box flexDirection="row" marginBottom={2}>
        <text fg="cyan">Deploying: {deploymentName}</text>
      </box>

      {/* Progress */}
      {deployState === "deploying" && renderProgressBar()}

      {/* Confirm Dialog */}
      {deployState === "confirming" && renderConfirmDialog()}

      {/* Waiting for Terminal */}
      {deployState === "waiting_terminal" && renderWaitingTerminal()}

      {/* Success */}
      {deployState === "success" && renderSuccess()}

      {/* Failed */}
      {deployState === "failed" && renderFailed()}

      {/* Logs */}
      <box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        padding={1}
      >
        <text fg="gray">Deployment Log</text>
        <box flexDirection="column" marginTop={1}>
          {logs.map((log, i) => (
            <text key={i} fg="gray">{log}</text>
          ))}
        </box>
      </box>
    </box>
  );
}
