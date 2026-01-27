import {
	BaseAIEngine,
	checkForErrors,
	execCommand,
	formatCommandError,
} from "./base.ts";
import { logDebug } from "../ui/logger.ts";
import type { AIResult, EngineOptions } from "./types.ts";

const isWindows = process.platform === "win32";

/**
 * GitHub Copilot CLI AI Engine
 * 
 * Note: executeStreaming is intentionally not implemented for Copilot
 * because the streaming function can hang on Windows due to how
 * Bun handles cmd.exe stream completion. The non-streaming execute()
 * method works reliably.
 *
 * Note: All engine output is captured internally for parsing and not displayed
 * to the end user. This is by design - the spinner shows step progress while
 * the actual CLI output is processed silently.
 */
export class CopilotEngine extends BaseAIEngine {
	name = "GitHub Copilot";
	cliCommand = "copilot";

	/**
	 * Sanitize prompt for command line.
	 * On Windows, newlines cause issues with cmd.exe argument parsing.
	 * We flatten the prompt to a single line.
	 *
	 * Note: When Bun spawns via cmd.exe /c, arguments containing spaces are
	 * automatically wrapped in double quotes. Inside quoted strings, cmd.exe
	 * does NOT interpret &, |, <, >, ^ as special characters. Only double
	 * quotes need escaping (by doubling them).
	 */
	private sanitizePrompt(prompt: string): string {
		// Replace all newlines with spaces, collapse multiple spaces
		let sanitized = prompt.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();

		if (isWindows) {
			// Inside double-quoted strings, only double quotes need escaping
			// cmd.exe interprets "" as a literal " within quoted arguments
			sanitized = sanitized.replace(/"/g, '""');
		}

		return sanitized;
	}

	/**
	 * Build command arguments for Copilot CLI
	 */
	private buildArgs(prompt: string, options?: EngineOptions): { args: string[] } {
		const args: string[] = [];

		// Use --yolo for non-interactive mode (allows all tools and paths)
		args.push("--yolo");

		// Sanitize and pass prompt as argument
		const sanitizedPrompt = this.sanitizePrompt(prompt);
		args.push("-p", sanitizedPrompt);

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

		// Debug logging
		logDebug(`[Copilot] Working directory: ${workDir}`);
		logDebug(`[Copilot] Prompt length: ${prompt.length} chars`);
		logDebug(`[Copilot] Prompt preview: ${prompt.substring(0, 200)}...`);
		logDebug(`[Copilot] Command: ${this.cliCommand} ${args.join(" ").substring(0, 300)}...`);

		const startTime = Date.now();
		const { stdout, stderr, exitCode } = await execCommand(this.cliCommand, args, workDir);
		const durationMs = Date.now() - startTime;

		const output = stdout + stderr;

		// Debug logging
		logDebug(`[Copilot] Exit code: ${exitCode}`);
		logDebug(`[Copilot] Duration: ${durationMs}ms`);
		logDebug(`[Copilot] Output length: ${output.length} chars`);
		logDebug(`[Copilot] Output preview: ${output.substring(0, 500)}...`);

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

		// Parse Copilot output - extract response and token counts
		const { response, inputTokens, outputTokens } = this.parseOutput(output);

		// If command failed with non-zero exit code, provide a meaningful error
		if (exitCode !== 0) {
			return {
				success: false,
				response,
				inputTokens,
				outputTokens,
				error: formatCommandError(exitCode, output),
			};
		}

		return {
			success: true,
			response,
			inputTokens,
			outputTokens,
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

	/**
	 * Parse a token count string like "17.5k" or "73" into a number
	 */
	private parseTokenCount(str: string): number {
		const trimmed = str.trim().toLowerCase();
		if (trimmed.endsWith("k")) {
			const value = Number.parseFloat(trimmed.slice(0, -1));
			return isNaN(value) ? 0 : Math.round(value * 1000);
		}
		if (trimmed.endsWith("m")) {
			const value = Number.parseFloat(trimmed.slice(0, -1));
			return isNaN(value) ? 0 : Math.round(value * 1000000);
		}
		const value = Number.parseFloat(trimmed);
		return isNaN(value) ? 0 : Math.round(value);
	}

	/**
	 * Extract token counts from Copilot CLI output
	 * Format: "model-name       17.5k in, 73 out, 11.8k cached (Est. 1 Premium request)"
	 */
	private parseTokenCounts(output: string): { inputTokens: number; outputTokens: number } {
		// Look for the token count line in the "Breakdown by AI model" section
		// Pattern: number followed by "in," and number followed by "out,"
		const tokenMatch = output.match(/(\d+(?:\.\d+)?[km]?)\s+in,\s+(\d+(?:\.\d+)?[km]?)\s+out/i);
		
		if (tokenMatch) {
			const inputTokens = this.parseTokenCount(tokenMatch[1]);
			const outputTokens = this.parseTokenCount(tokenMatch[2]);
			logDebug(`[Copilot] Parsed tokens: ${inputTokens} in, ${outputTokens} out`);
			return { inputTokens, outputTokens };
		}

		return { inputTokens: 0, outputTokens: 0 };
	}

	private parseOutput(output: string): { response: string; inputTokens: number; outputTokens: number } {
		// Extract token counts first
		const { inputTokens, outputTokens } = this.parseTokenCounts(output);

		// Copilot CLI may output text responses
		// Extract the meaningful response, filtering out control characters and prompts
		// Note: These filter patterns are specific to current Copilot CLI behavior
		// and may need updates if the CLI output format changes
		const lines = output.split("\n").filter(Boolean);

		// Filter out empty lines, CLI artifacts, and stats section
		const meaningfulLines = lines.filter((line) => {
			const trimmed = line.trim();
			return (
				trimmed &&
				!trimmed.startsWith("?") && // Interactive prompts
				!trimmed.startsWith("❯") && // Command prompts
				!trimmed.includes("Thinking...") && // Status messages
				!trimmed.includes("Working on it...") && // Status messages
				!trimmed.startsWith("Total usage") && // Stats section
				!trimmed.startsWith("API time") && // Stats section
				!trimmed.startsWith("Total session") && // Stats section
				!trimmed.startsWith("Total code") && // Stats section
				!trimmed.startsWith("Breakdown by") && // Stats section header
				!trimmed.match(/^\s*\S+\s+\d+(?:\.\d+)?[km]?\s+in,/) // Token count lines
			);
		});

		const response = meaningfulLines.join("\n").trim() || "Task completed";
		return { response, inputTokens, outputTokens };
	}
}
