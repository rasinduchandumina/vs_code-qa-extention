import * as vscode from "vscode";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";

export type FailureCategory =
  | "AssertionError"
  | "TimeoutError"
  | "TypeError"
  | "ReferenceError"
  | "CompilationError"
  | "RuntimeCrash";

export interface TestExecutionResult {
  passed: boolean;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  firstFailureSnippet?: string;
  failureCategory?: FailureCategory;
  executedFiles?: string[];
}

export class TestRunner {
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
    let canonicalRoot = workspaceRoot;
    try {
      canonicalRoot = fs.realpathSync.native(workspaceRoot);
    } catch {
      if (process.platform === "win32") {
        canonicalRoot = canonicalRoot.replace(/^[a-z]:/i, (m) => m.toUpperCase());
      }
    }
    this.workspaceRoot = canonicalRoot;
    this.outputChannel = outputChannel;
  }

  /**
   * Classifies a failure based on output heuristics.
   */
  public classifyFailure(output: string): FailureCategory {
    if (/AssertionError|expected|toStrictEqual|toBe|toEqual|assert/i.test(output)) {
      return "AssertionError";
    }
    if (/timed?\s*out|TimeoutError|Exceeded timeout|waiting for selector/i.test(output)) {
      return "TimeoutError";
    }
    if (/TypeError|is not a function|Cannot read propert/i.test(output)) {
      return "TypeError";
    }
    if (/ReferenceError|is not defined/i.test(output)) {
      return "ReferenceError";
    }
    if (/SyntaxError|CompilationError|Unexpected token|Cannot find module/i.test(output)) {
      return "CompilationError";
    }
    return "RuntimeCrash";
  }

  /**
   * Executes the test command based on the detected or configured framework.
   * Supports automatic test selection by executing only specific files if provided.
   */
  public async runTests(
    framework: "vitest" | "playwright" | "jest" = "vitest",
    specificTestFiles?: string[]
  ): Promise<TestExecutionResult> {
    const isWindows = process.platform === "win32";
    const npxCmd = isWindows ? "npx.cmd" : "npx";

    let command = `${npxCmd} vitest run`;
    if (framework === "playwright") {
      command = `${npxCmd} playwright test`;
    } else if (framework === "jest") {
      command = `${npxCmd} jest`;
    }

    // Append specific files for automatic test selection
    if (specificTestFiles && specificTestFiles.length > 0) {
      const normalizedFiles = specificTestFiles.map(f => `"${f.replace(/\\/g, "/")}"`).join(" ");
      command += ` ${normalizedFiles}`;
    }

    this.outputChannel.show(true);
    this.outputChannel.appendLine(`\n[AI Testing Assistant] Executing: ${command}`);
    this.outputChannel.appendLine(`[AI Testing Assistant] Working directory: ${this.workspaceRoot}\n`);

    const startTime = Date.now();

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: this.workspaceRoot,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          shell: isWindows ? (process.env.ComSpec || "cmd.exe") : undefined
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          this.outputChannel.appendLine(stdout);
          if (stderr) {
            this.outputChannel.appendLine(stderr);
          }

          const isSuccess = !error;
          let passedCount = 0;
          let failedCount = 0;

          // Basic output parsing heuristics
          const passedMatch = stdout.match(/(\d+)\s+passed/i);
          const failedMatch = stdout.match(/(\d+)\s+failed/i);

          if (passedMatch) passedCount = parseInt(passedMatch[1], 10);
          if (failedMatch) failedCount = parseInt(failedMatch[1], 10);

          if (isSuccess && passedCount === 0 && failedCount === 0) {
            passedCount = 1; // Default fallback if parser couldn't find exact numbers
          }

          const totalTests = passedCount + failedCount;

          let firstFailureSnippet: string | undefined;
          let failureCategory: FailureCategory | undefined;

          if (!isSuccess) {
            // Extract the first failure block or stack trace
            const failIndex = stdout.indexOf("FAIL");
            if (failIndex !== -1) {
              firstFailureSnippet = stdout.substring(failIndex, failIndex + 800);
            } else {
              firstFailureSnippet = stderr || stdout.slice(-800);
            }
            failureCategory = this.classifyFailure(firstFailureSnippet + "\n" + stderr);
          }

          this.outputChannel.appendLine(`\n[AI Testing Assistant] Completed in ${(durationMs / 1000).toFixed(2)}s`);
          this.outputChannel.appendLine(
            `Status: ${isSuccess ? "ALL TESTS PASSED" : "TESTS FAILED"} (${passedCount} passed, ${failedCount} failed)${
              failureCategory ? ` [Category: ${failureCategory}]` : ""
            }`
          );

          resolve({
            passed: isSuccess,
            totalTests,
            passedCount,
            failedCount,
            stdout,
            stderr,
            durationMs,
            firstFailureSnippet,
            failureCategory,
            executedFiles: specificTestFiles
          });
        }
      );
    });
  }
}
