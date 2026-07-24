/**
 * Small interactive-prompt helpers for the CLI. Password input is masked.
 * These resolve (never reject) with the entered string so callers stay in the
 * Result style at the boundary.
 */

import * as readline from "node:readline";

/** Prompts for a line of visible input. */
export async function PromptLine(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await new Promise<string>((resolve) => {
            rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    } finally {
        rl.close();
    }
}

/**
 * Prompts for a secret, masking keystrokes. Falls back to visible input if
 * stdin is not a TTY (e.g. piped), so automation still works.
 */
export async function PromptHidden(question: string): Promise<string> {
    if (!process.stdin.isTTY) {
        return PromptLine(question);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Mute echoed characters while still writing the prompt itself once.
    let promptWritten = false;
    const rlAny = rl as unknown as { _writeToOutput: (chunk: string) => void };
    rlAny._writeToOutput = (chunk: string): void => {
        if (!promptWritten) {
            process.stdout.write(question);
            promptWritten = true;
            return;
        }
        // Swallow echoed input characters (but keep newlines for layout).
        if (chunk.includes("\n") || chunk.includes("\r")) {
            process.stdout.write("\n");
        }
    };

    try {
        return await new Promise<string>((resolve) => {
            rl.question(question, (answer) => {
                resolve(answer);
            });
        });
    } finally {
        rl.close();
    }
}
