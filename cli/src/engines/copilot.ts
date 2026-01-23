import {
	BaseAIEngine,
	checkForErrors,
	detectStepFromOutput,
	execCommand,
	execCommandStreaming,
	formatCommandError,
} from "./base.ts";
import type { AIResult, EngineOptions, ProgressCallback } from "./types.ts";

/**
 * GitHub Copilot CLI AI Engine
 */
export class CopilotEngine extends BaseAIEngine {
	name = "GitHub Copilot";
	cliCommand = "copilot";

	/**
	 * Build command arguments for Copilot CLI
	 */
	private buildArgs(
		prompt: string,
		options?: EngineOptions,
	): { args: string[] } {
		const args: string[] = [];

		// Required for non-interactive mode: allow all tools to run without confirmation
		args.push("--allow-all-tools");

		// Pass prompt directly as argument (Copilot CLI requires -p with value, not stdin)
		args.push("-p", prompt);

		if (options?.modelOverride) {
			args.push("--model", options.modelOverride);
		}
		// Add any additional engine-specific arguments
		if (options?.engineArgs && options.engineArgs.length > 0) {
			args.push(...options.engineArgs);
		}
		return { args };
	}

	async execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult> {
		const { args } = this.buildArgs(prompt, options);

		const startTime = Date.now();
		const { stdout, stderr, exitCode } = await execCommand(
			this.cliCommand,
			args,
			workDir,
		);
		const durationMs = Date.now() - startTime;

		const output = stdout + stderr;

		// Check for JSON errors (from base)
		const jsonError = checkForErrors(output);
		if (jsonError) {
			return {
				success: false,
				response: "",
				inputTokens: 0,
				outputTokens: 0,
				error: jsonError,
			};
		}

		// Check for Copilot-specific errors (plain text)
		const copilotError = this.checkCopilotErrors(output);
		if (copilotError) {
			return {
				success: false,
				response: "",
				inputTokens: 0,
				outputTokens: 0,
				error: copilotError,
			};
		}

		// Parse Copilot output - extract response from output
		const response = this.parseOutput(output);

		// If command failed with non-zero exit code, provide a meaningful error
		if (exitCode !== 0) {
			return {
				success: false,
				response,
				inputTokens: 0,
				outputTokens: 0,
				error: formatCommandError(exitCode, output),
			};
		}

		return {
			success: true,
			response,
			inputTokens: 0, // Copilot CLI doesn't expose token counts in programmatic mode
			outputTokens: 0,
			cost: durationMs > 0 ? `duration:${durationMs}` : undefined,
		};
	}

	/**
	 * Check for Copilot-specific errors in output
	 * Copilot CLI outputs plain text errors (not JSON) and may return exit code 0
	 */
	private checkCopilotErrors(output: string): string | null {
		const lower = output.toLowerCase();
		const trimmed = output.trim();

		// Authentication errors
		if (lower.includes("no authentication") || lower.includes("not authenticated")) {
			return "GitHub Copilot CLI is not authenticated. Run 'copilot' and use '/login' to authenticate, or set COPILOT_GITHUB_TOKEN environment variable.";
		}

		// Rate limiting
		if (lower.includes("rate limit") || lower.includes("too many requests")) {
			return "GitHub Copilot rate limit exceeded. Please wait and try again.";
		}

		// Network errors
		if (lower.includes("network error") || lower.includes("connection refused")) {
			return "Network error connecting to GitHub Copilot. Check your internet connection.";
		}

		// Generic error detection - check trimmed output and case-insensitive
		if (trimmed.toLowerCase().startsWith("error:") || lower.includes("\nerror:")) {
			// Extract the error message
			const match = output.match(/error:\s*(.+?)(?:\n|$)/i);
			if (match) {
				return match[1].trim();
			}
			return "GitHub Copilot CLI returned an error";
		}

		return null;
	}

	private parseOutput(output: string): string {
		// Copilot CLI may output text responses
		// Extract the meaningful response, filtering out control characters and prompts
		// Note: These filter patterns are specific to current Copilot CLI behavior
		// and may need updates if the CLI output format changes
		const lines = output.split("\n").filter(Boolean);

		// Filter out empty lines and common CLI artifacts
		const meaningfulLines = lines.filter((line) => {
			const trimmed = line.trim();
			return (
				trimmed &&
				!trimmed.startsWith("?") && // Interactive prompts
				!trimmed.startsWith("❯") && // Command prompts
				!trimmed.includes("Thinking...") && // Status messages
				!trimmed.includes("Working on it...") // Status messages
			);
		});

		return meaningfulLines.join("\n") || "Task completed";
	}

	async executeStreaming(
		prompt: string,
		workDir: string,
		onProgress: ProgressCallback,
		options?: EngineOptions,
	): Promise<AIResult> {
		const { args } = this.buildArgs(prompt, options);

		const outputLines: string[] = [];
		const startTime = Date.now();

		const { exitCode } = await execCommandStreaming(
			this.cliCommand,
			args,
			workDir,
			(line) => {
				outputLines.push(line);

				// Detect and report step changes
				const step = detectStepFromOutput(line);
				if (step) {
					onProgress(step);
				}
			},
		);

		const durationMs = Date.now() - startTime;
		const output = outputLines.join("\n");

		// Check for JSON errors (from base)
		const jsonError = checkForErrors(output);
		if (jsonError) {
			return {
				success: false,
				response: "",
				inputTokens: 0,
				outputTokens: 0,
				error: jsonError,
			};
		}

		// Check for Copilot-specific errors (plain text)
		const copilotError = this.checkCopilotErrors(output);
		if (copilotError) {
			return {
				success: false,
				response: "",
				inputTokens: 0,
				outputTokens: 0,
				error: copilotError,
			};
		}

		// Parse Copilot output
		const response = this.parseOutput(output);

		// If command failed with non-zero exit code, provide a meaningful error
		if (exitCode !== 0) {
			return {
				success: false,
				response,
				inputTokens: 0,
				outputTokens: 0,
				error: formatCommandError(exitCode, output),
			};
		}

		return {
			success: true,
			response,
			inputTokens: 0,
			outputTokens: 0,
			cost: durationMs > 0 ? `duration:${durationMs}` : undefined,
		};
	}
}
