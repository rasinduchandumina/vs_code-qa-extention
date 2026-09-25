import * as vscode from "vscode";
import { exec } from "child_process";
import * as path from "path";

export interface TestExecutionResult {
  passed: boolean;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  firstFailureSnippet?: string;
}

export class TestRunner {
  private workspaceRoot: string;
  private outputChannel: vscode.OutputChannel;

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
  }

  /**
   * Executes the test command based on the detected or configured framework.
   */
  public async runTests(framework: "vitest" | "playwright" | "jest" = "vitest"): Promise<TestExecutionResult> {
    let command = "npx vitest run";
    if (framework === "playwright") {
      command = "npx playwright test";
    } else if (framework === "jest") {
      command = "npx jest";
    }

    this.outputChannel.show(true);
    this.outputChannel.appendLine(`\n[AI Testing Assistant] Executing: ${command}`);
    this.outputChannel.appendLine(`[AI Testing Assistant] Working directory: ${this.workspaceRoot}\n`);

    const startTime = Date.now();

    return new Promise((resolve) => {
      exec(command, { cwd: this.workspaceRoot, windowsHide: true }, (error, stdout, stderr) => {
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
        if (!isSuccess) {
          // Extract the first failure block or stack trace
          const failIndex = stdout.indexOf("FAIL");
          if (failIndex !== -1) {
            firstFailureSnippet = stdout.substring(failIndex, failIndex + 800);
          } else {
            firstFailureSnippet = stderr || stdout.slice(-800);
          }
        }

        this.outputChannel.appendLine(`\n[AI Testing Assistant] Completed in ${(durationMs / 1000).toFixed(2)}s`);
        this.outputChannel.appendLine(`Status: ${isSuccess ? "ALL TESTS PASSED" : "TESTS FAILED"} (${passedCount} passed, ${failedCount} failed)`);

        resolve({
          passed: isSuccess,
          totalTests,
          passedCount,
          failedCount,
          stdout,
          stderr,
          durationMs,
          firstFailureSnippet
        });
      });
    });
  }
}
