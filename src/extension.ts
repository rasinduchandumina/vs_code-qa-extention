import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { WorkspaceScanner, DiscoveredFunction, ProjectAnalysis } from "./scanner/workspaceScanner";
import { AIClient } from "./ai/aiClient";
import { WorkspaceTreeProvider, SuggestedCasesTreeProvider, TestTreeItem } from "./ui/testTreeProvider";
import { TestRunner } from "./tests/testRunner";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("AI Testing Assistant");
  outputChannel.appendLine("[AI Testing Assistant] Extension activated.");

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage("Please open a workspace to use the AI Testing Assistant.");
    return;
  }

  const scanner = new WorkspaceScanner(workspaceRoot);
  const aiClient = new AIClient(context);
  const testRunner = new TestRunner(workspaceRoot, outputChannel);

  const workspaceTreeProvider = new WorkspaceTreeProvider();
  const suggestedCasesTreeProvider = new SuggestedCasesTreeProvider();

  vscode.window.registerTreeDataProvider("aiTestingExplorer", workspaceTreeProvider);
  vscode.window.registerTreeDataProvider("aiTestingSuggestedCases", suggestedCasesTreeProvider);

  let currentAnalysis: ProjectAnalysis | null = null;
  let activeSelectedFunction: DiscoveredFunction | null = null;

  // Command: Set API Key
  const setApiKeyCmd = vscode.commands.registerCommand("aiTesting.setApiKey", async () => {
    const key = await vscode.window.showInputBox({
      title: "Configure Gemini API Key",
      prompt: "Enter your Google Gemini API Key",
      password: true,
      ignoreFocusOut: true
    });
    if (key) {
      await aiClient.setApiKey(key);
      vscode.window.showInformationMessage("Gemini API Key configured successfully.");
    }
  });

  // Command: Scan Project
  const scanProjectCmd = vscode.commands.registerCommand("aiTesting.scanProject", async () => {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AI Testing: Scanning project codebase...",
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 20, message: "Analyzing files..." });
        currentAnalysis = await scanner.scanProject();
        workspaceTreeProvider.refresh(currentAnalysis);
        progress.report({ increment: 80, message: "Done!" });
      }
    );

    if (currentAnalysis) {
      vscode.window.showInformationMessage(
        `Scanned ${currentAnalysis.sourceFilesCount} source files. Found ${currentAnalysis.functionsCount} functions and ${currentAnalysis.testFilesCount} existing tests.`
      );
    }
  });

  // Command: Analyze Current File
  const analyzeCurrentFileCmd = vscode.commands.registerCommand("aiTesting.analyzeCurrentFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("Open a TypeScript/JavaScript file first.");
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const fileAnalysis = await scanner.analyzeSingleFile(filePath);

    if (!fileAnalysis || fileAnalysis.functions.length === 0) {
      vscode.window.showInformationMessage("No functions or methods found in this file.");
      return;
    }

    const items = fileAnalysis.functions.map(fn => ({
      label: `$(symbol-function) ${fn.name}`,
      description: `Lines ${fn.startLine}-${fn.endLine} (${fn.parameters.join(", ") || "void"})`,
      func: fn
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a function to generate AI test cases for"
    });

    if (picked) {
      activeSelectedFunction = picked.func;
      await generateTestCasesForFunction(picked.func);
    }
  });

  // Helper function to trigger AI test case generation
  async function generateTestCasesForFunction(func: DiscoveredFunction) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `AI Testing: Generating test scenarios for "${func.name}"...`,
        cancellable: false
      },
      async () => {
        const batch = await aiClient.generateTestCases(func);
        if (batch) {
          suggestedCasesTreeProvider.setBatch(batch);
          vscode.window.showInformationMessage(
            `Generated ${batch.testCases.length} test scenarios for "${func.name}". Review and approve them in the sidebar.`
          );
        }
      }
    );
  }

  // Command: Generate Test Cases for Function
  const generateTestCasesCmd = vscode.commands.registerCommand("aiTesting.generateTestCases", async (item?: TestTreeItem) => {
    if (item && item.data.kind === "function") {
      activeSelectedFunction = item.data.func;
      await generateTestCasesForFunction(item.data.func);
      return;
    }
    // Fallback to analyzing active file
    await vscode.commands.executeCommand("aiTesting.analyzeCurrentFile");
  });

  // Command: Toggle Approval of a Test Case
  const toggleApprovalCmd = vscode.commands.registerCommand("aiTesting.toggleApproval", (item: TestTreeItem) => {
    if (item && item.data.kind === "testCase") {
      suggestedCasesTreeProvider.toggleApproval(item.data.testCase.id);
    }
  });

  // Command: Approve All & Generate Test Code
  const approveAndGenerateCodeCmd = vscode.commands.registerCommand("aiTesting.approveAndGenerateCode", async () => {
    const batch = suggestedCasesTreeProvider.getBatch();
    if (!batch || !activeSelectedFunction) {
      vscode.window.showWarningMessage("No active test case batch found.");
      return;
    }

    // By default, approve all if none selected
    let approved = batch.testCases.filter(t => t.approved);
    if (approved.length === 0) {
      const pick = await vscode.window.showQuickPick(["Approve All Cases", "Cancel"], {
        placeHolder: "No individual cases were checked. Approve all?"
      });
      if (pick !== "Approve All Cases") return;
      suggestedCasesTreeProvider.approveAll();
      approved = batch.testCases;
    }

    const config = vscode.workspace.getConfiguration("aiTesting");
    const framework = config.get<"vitest" | "playwright" | "jest">("testFramework") || "vitest";

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `AI Testing: Writing ${framework} test code...`,
        cancellable: false
      },
      async () => {
        const generated = await aiClient.generateTestCode(activeSelectedFunction!, approved, framework);
        if (!generated) return;

        try {
          // Normalize configured test directory
          const rawTestDir = (config.get<string>("testDirectory") || "tests/ai-generated").replace(/^[\/\\]+/, "");
          const testDir = path.join(workspaceRoot, rawTestDir);
          await fs.mkdir(testDir, { recursive: true });

          // Sanitize generated path to prevent root-relative or absolute path resolution
          let cleanRelativePath = generated.suggestedTestFilePath.trim().replace(/^[\/\\]+/, "");
          if (!cleanRelativePath.endsWith(".ts") && !cleanRelativePath.endsWith(".js")) {
            cleanRelativePath += ".test.ts";
          }

          const targetTestFile = path.resolve(workspaceRoot, cleanRelativePath);
          await fs.mkdir(path.dirname(targetTestFile), { recursive: true });
          await fs.writeFile(targetTestFile, generated.code, "utf-8");

          const doc = await vscode.workspace.openTextDocument(targetTestFile);
          await vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage(`Generated test file saved to: ${cleanRelativePath}`);
        } catch (err: any) {
          console.error("Failed to write test file:", err);
          if (err.code === "EACCES" || err.message?.includes("permission denied")) {
            vscode.window.showErrorMessage(
              `Permission denied writing to ${workspaceRoot}. If using VS Code Snap on Linux, run: 'sudo snap connect code:removable-media'`
            );
          } else {
            vscode.window.showErrorMessage(`Failed to save test file: ${err.message}`);
          }
        }
      }
    );
  });

  // Command: Run Automated Tests
  const runTestsCmd = vscode.commands.registerCommand("aiTesting.runTests", async () => {
    const config = vscode.workspace.getConfiguration("aiTesting");
    const framework = config.get<"vitest" | "playwright" | "jest">("testFramework") || "vitest";

    const result = await testRunner.runTests(framework);

    if (result.passed) {
      vscode.window.showInformationMessage(`All ${result.passedCount} tests passed successfully!`);
    } else {
      const choice = await vscode.window.showErrorMessage(
        `Tests failed (${result.failedCount} failures). Would you like AI Failure Analysis?`,
        "Analyze Failure",
        "Dismiss"
      );

      if (choice === "Analyze Failure" && result.firstFailureSnippet) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "AI Testing: Diagnosing test failure...",
            cancellable: false
          },
          async () => {
            const analysis = await aiClient.analyzeFailure(
              "Failing Test",
              result.firstFailureSnippet!,
              activeSelectedFunction?.snippet || "Source not loaded",
              activeSelectedFunction?.filePath || "unknown"
            );

            if (analysis) {
              const panel = vscode.window.createWebviewPanel(
                "aiFailureReport",
                "AI Failure Analysis",
                vscode.ViewColumn.Beside,
                { enableScripts: true }
              );

              panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                  <style>
                    body { font-family: system-ui, sans-serif; padding: 20px; line-height: 1.6; color: var(--vscode-editor-foreground); }
                    .card { border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 16px; margin-bottom: 16px; background: var(--vscode-editor-inactiveSelectionBackground); }
                    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; text-transform: uppercase; font-size: 11px; background: #e06c75; color: #fff; }
                    .confidence { color: #98c379; font-weight: bold; }
                    pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; overflow-x: auto; }
                  </style>
                </head>
                <body>
                  <h2>AI Root Cause Failure Analysis</h2>
                  <div class="card">
                    <span class="tag">Likely Root Cause</span>
                    <p>${analysis.likelyCause}</p>
                    <p><strong>Relevant File:</strong> <code>${analysis.relevantSourceFile}</code> ${analysis.relevantLine ? `(Line ${analysis.relevantLine})` : ""}</p>
                    <p><strong>Confidence:</strong> <span class="confidence">${analysis.confidence.toUpperCase()}</span></p>
                  </div>
                  <div class="card">
                    <h3>Suggested Fix / Action</h3>
                    <p>${analysis.suggestedFix}</p>
                  </div>
                  <div class="card">
                    <h3>Evidence</h3>
                    <pre>${analysis.evidence}</pre>
                  </div>
                </body>
                </html>
              `;
            }
          }
        );
      }
    }
  });

  context.subscriptions.push(
    setApiKeyCmd,
    scanProjectCmd,
    analyzeCurrentFileCmd,
    generateTestCasesCmd,
    toggleApprovalCmd,
    approveAndGenerateCodeCmd,
    runTestsCmd
  );
}

export function deactivate() {}
