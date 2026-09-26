import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import * as syncFs from "fs";
import { WorkspaceScanner, DiscoveredFunction, ProjectAnalysis } from "./scanner/workspaceScanner";
import { AIClient } from "./ai/aiClient";
import { WorkspaceTreeProvider, SuggestedCasesTreeProvider, TestTreeItem } from "./ui/testTreeProvider";
import { TestRunner, FailureCategory } from "./tests/testRunner";
import { FailureAnalysis, DefectReport } from "./ai/schemas";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("AI Testing Assistant");
  outputChannel.appendLine("[AI Testing Assistant] Extension activated.");

  const rawWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!rawWorkspaceRoot) {
    vscode.window.showWarningMessage("Please open a workspace to use the AI Testing Assistant.");
    return;
  }

  // Canonicalize workspace path on Windows (e.g. g: -> G:)
  // Vitest and Vite's module graph require canonical drive letter casing to discover test suites
  let workspaceRoot = rawWorkspaceRoot;
  try {
    workspaceRoot = syncFs.realpathSync.native(rawWorkspaceRoot);
  } catch {
    if (process.platform === "win32") {
      workspaceRoot = workspaceRoot.replace(/^[a-z]:/i, (m) => m.toUpperCase());
    }
  }

  const scanner = new WorkspaceScanner(workspaceRoot);
  const aiClient = new AIClient(context, outputChannel);
  const testRunner = new TestRunner(workspaceRoot, outputChannel);

  const workspaceTreeProvider = new WorkspaceTreeProvider();
  const suggestedCasesTreeProvider = new SuggestedCasesTreeProvider();

  vscode.window.registerTreeDataProvider("aiTestingExplorer", workspaceTreeProvider);
  vscode.window.registerTreeDataProvider("aiTestingSuggestedCases", suggestedCasesTreeProvider);

  let currentAnalysis: ProjectAnalysis | null = null;
  let activeSelectedFunction: DiscoveredFunction | null = null;
  let lastFailureAnalysis: FailureAnalysis | null = null;
  let lastFailureSnippet: string | null = null;
  let lastFailingTestFile: string | null = null;
  let lastFailureCategory: FailureCategory = "AssertionError";

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
      const impactedMsg = currentAnalysis.impactAnalysis?.impactedTestFiles?.length
        ? ` 🔥 ${currentAnalysis.impactAnalysis.impactedTestFiles.length} impacted test(s) detected.`
        : "";
      vscode.window.showInformationMessage(
        `Scanned ${currentAnalysis.sourceFilesCount} source files. Found ${currentAnalysis.functionsCount} functions and ${currentAnalysis.testFilesCount} existing tests.${impactedMsg}`
      );
    }
  });

  // Command: Analyze Changed Code Impact
  const analyzeImpactCmd = vscode.commands.registerCommand("aiTesting.analyzeImpact", async () => {
    if (!currentAnalysis) {
      await vscode.commands.executeCommand("aiTesting.scanProject");
      return;
    }

    const impact = await scanner.analyzeImpact(currentAnalysis.files, currentAnalysis.existingTests);
    currentAnalysis.impactAnalysis = impact;
    workspaceTreeProvider.refresh(currentAnalysis);

    if (impact.changedFiles.length === 0) {
      vscode.window.showInformationMessage("No git changes detected. Working tree is clean.");
    } else {
      vscode.window.showInformationMessage(
        `Impact Analysis: ${impact.changedFiles.length} modified file(s), ${impact.changedFunctions.length} function(s), and ${impact.impactedTestFiles.length} impacted test suite(s).`
      );
    }
  });

  // Command: Run Impacted Tests Only (Automatic Test Selection)
  const runImpactedTestsCmd = vscode.commands.registerCommand("aiTesting.runImpactedTests", async () => {
    if (!currentAnalysis) {
      await vscode.commands.executeCommand("aiTesting.scanProject");
    }

    const impact = currentAnalysis?.impactAnalysis;
    if (!impact || impact.impactedTestFiles.length === 0) {
      vscode.window.showInformationMessage("No impacted tests detected from recent git changes.");
      return;
    }

    const config = vscode.workspace.getConfiguration("aiTesting");
    const framework = config.get<"vitest" | "playwright" | "jest">("testFramework") || "vitest";

    vscode.window.showInformationMessage(`Running ${impact.impactedTestFiles.length} impacted test suite(s)...`);
    const result = await testRunner.runTests(framework, impact.impactedTestFiles);
    handleTestExecutionResult(result);
  });

  // Command: Generate Requirement Traceability Matrix
  const generateTraceabilityMatrixCmd = vscode.commands.registerCommand("aiTesting.generateTraceabilityMatrix", async () => {
    if (!currentAnalysis) {
      await vscode.commands.executeCommand("aiTesting.scanProject");
    }

    if (!currentAnalysis) return;

    const matrixMd = scanner.generateTraceabilityMatrix(currentAnalysis);
    const targetPath = path.resolve(workspaceRoot, "docs/TRACEABILITY_MATRIX.md");

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, matrixMd, "utf-8");
      const doc = await vscode.workspace.openTextDocument(targetPath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage("Traceability Matrix generated and saved to docs/TRACEABILITY_MATRIX.md");
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to save Traceability Matrix: ${err.message}`);
    }
  });

  // Command: Export Defect Report
  const exportDefectReportCmd = vscode.commands.registerCommand("aiTesting.exportDefectReport", async () => {
    if (!lastFailureAnalysis) {
      vscode.window.showWarningMessage("No recent test failure analysis available to export.");
      return;
    }

    const defectId = `BUG-${Date.now().toString().slice(-6)}`;
    const defect: DefectReport = {
      id: defectId,
      title: `${lastFailureAnalysis.testName}: ${lastFailureAnalysis.likelyCause.slice(0, 60)}...`,
      severity: "high",
      category: lastFailureCategory,
      testName: lastFailureAnalysis.testName,
      failingFile: lastFailingTestFile || "Unknown test file",
      relevantSourceFile: lastFailureAnalysis.relevantSourceFile,
      relevantLine: lastFailureAnalysis.relevantLine,
      likelyCause: lastFailureAnalysis.likelyCause,
      evidence: lastFailureAnalysis.evidence,
      suggestedFix: lastFailureAnalysis.suggestedFix,
      createdAt: new Date().toISOString(),
      environment: `${process.platform} (${process.arch}) Node ${process.version}`
    };

    const defectMd = aiClient.createDefectMarkdown(defect);
    const defectsDir = path.resolve(workspaceRoot, "defects");
    const defectFilePath = path.join(defectsDir, `${defectId}.md`);

    try {
      await fs.mkdir(defectsDir, { recursive: true });
      await fs.writeFile(defectFilePath, defectMd, "utf-8");
      const doc = await vscode.workspace.openTextDocument(defectFilePath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(`Defect Report exported successfully to: defects/${defectId}.md`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to export Defect Report: ${err.message}`);
    }
  });

  // Command: Auto-Repair Failing Test ("Self-Healing Tests")
  const repairFailingTestCmd = vscode.commands.registerCommand("aiTesting.repairFailingTest", async () => {
    if (!lastFailingTestFile || !lastFailureSnippet) {
      vscode.window.showWarningMessage("No failing test details available to repair. Run automated tests first.");
      return;
    }

    const testFilePath = path.resolve(workspaceRoot, lastFailingTestFile);
    let failingCode: string;
    try {
      failingCode = await fs.readFile(testFilePath, "utf-8");
    } catch {
      vscode.window.showErrorMessage(`Cannot read failing test file: ${lastFailingTestFile}`);
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `AI Testing: Auto-healing "${lastFailingTestFile}"...`,
        cancellable: false
      },
      async () => {
        const repaired = await aiClient.repairFailingTest(
          failingCode,
          lastFailingTestFile!,
          lastFailureSnippet!,
          activeSelectedFunction?.snippet || "Source not loaded"
        );

        if (!repaired) return;

        // Write repaired code to test file
        await fs.writeFile(testFilePath, repaired.repairedCode, "utf-8");
        const doc = await vscode.workspace.openTextDocument(testFilePath);
        await vscode.window.showTextDocument(doc);

        vscode.window.showInformationMessage(
          `✨ Test repaired! ${repaired.explanation}. Run automated tests to verify.`
        );
      }
    );
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
          const scoreText = batch.qualityScore ? ` [Quality: ${batch.qualityScore}/100]` : "";
          vscode.window.showInformationMessage(
            `Generated ${batch.testCases.length} test scenarios for "${func.name}"${scoreText}. Review and approve them in the sidebar.`
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
  const toggleApprovalCmd = vscode.commands.registerCommand("aiTesting.toggleApproval", (item?: any) => {
    if (!item) return;
    if (typeof item === "string") {
      suggestedCasesTreeProvider.toggleApproval(item);
    } else if (item.data && item.data.kind === "testCase") {
      suggestedCasesTreeProvider.toggleApproval(item.data.testCase.id);
    } else if (item.testCase && item.testCase.id) {
      suggestedCasesTreeProvider.toggleApproval(item.testCase.id);
    }
  });

  // Command: Approve All & Generate Test Code
  const approveAndGenerateCodeCmd = vscode.commands.registerCommand("aiTesting.approveAndGenerateCode", async () => {
    const batch = suggestedCasesTreeProvider.getBatch();
    if (!batch || !activeSelectedFunction) {
      vscode.window.showWarningMessage("No active test case batch found.");
      return;
    }

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
          const rawTestDir = (config.get<string>("testDirectory") || "tests/ai-generated")
            .replace(/^[a-zA-Z]:[/\\]*/, "")
            .replace(/^[\/\\]+/, "");
          const testDir = path.join(workspaceRoot, rawTestDir);
          await fs.mkdir(testDir, { recursive: true });

          let cleanRelativePath = generated.suggestedTestFilePath.trim()
            .replace(/^[a-zA-Z]:[/\\]*/, "")
            .replace(/^[\/\\]+/, "");
          if (!cleanRelativePath.endsWith(".ts") && !cleanRelativePath.endsWith(".js")) {
            cleanRelativePath += ".test.ts";
          }

          let targetTestFile = path.resolve(workspaceRoot, cleanRelativePath);
          const normalizedRoot = path.normalize(workspaceRoot).toLowerCase();
          const normalizedTarget = path.normalize(targetTestFile).toLowerCase();
          if (!normalizedTarget.startsWith(normalizedRoot)) {
            targetTestFile = path.join(testDir, path.basename(cleanRelativePath));
            cleanRelativePath = path.relative(workspaceRoot, targetTestFile);
          }

          await fs.mkdir(path.dirname(targetTestFile), { recursive: true });
          await fs.writeFile(targetTestFile, generated.code, "utf-8");

          const doc = await vscode.workspace.openTextDocument(targetTestFile);
          await vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage(`Generated test file saved to: ${cleanRelativePath.replace(/\\/g, "/")}`);
        } catch (err: any) {
          console.error("Failed to write test file:", err);
          if (err.code === "EACCES" || err.code === "EPERM" || err.message?.includes("permission denied")) {
            vscode.window.showErrorMessage(
              `Permission denied writing test file to ${workspaceRoot}. Check file/folder permissions or ensure it is not locked by another process.`
            );
          } else {
            vscode.window.showErrorMessage(`Failed to save test file: ${err.message}`);
          }
        }
      }
    );
  });

  // Helper to handle test execution outcome and failure diagnosis
  async function handleTestExecutionResult(result: any) {
    if (result.passed) {
      vscode.window.showInformationMessage(`All ${result.passedCount} tests passed successfully!`);
      return;
    }

    lastFailureSnippet = result.firstFailureSnippet || null;
    lastFailureCategory = result.failureCategory || "AssertionError";

    // Attempt to extract failing test file path from output
    const fileMatch = (result.stdout + "\n" + result.stderr).match(/(tests[/\\][^\s:]+\.(test|spec)\.(ts|js))/i);
    lastFailingTestFile = fileMatch ? fileMatch[1].replace(/\\/g, "/") : "tests/cart.test.ts";

    const choice = await vscode.window.showErrorMessage(
      `Tests failed (${result.failedCount} failures) [${lastFailureCategory}]. Would you like AI Failure Analysis?`,
      "Analyze Failure",
      "Auto-Repair Test",
      "Dismiss"
    );

    if (choice === "Auto-Repair Test") {
      await vscode.commands.executeCommand("aiTesting.repairFailingTest");
      return;
    }

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
            lastFailureAnalysis = analysis;
            const panel = vscode.window.createWebviewPanel(
              "aiFailureReport",
              "AI Failure Analysis",
              vscode.ViewColumn.Beside,
              { enableScripts: true }
            );

            panel.webview.onDidReceiveMessage(async (message) => {
              if (message.command === "exportDefect") {
                await vscode.commands.executeCommand("aiTesting.exportDefectReport");
              } else if (message.command === "repairTest") {
                await vscode.commands.executeCommand("aiTesting.repairFailingTest");
              }
            });

            panel.webview.html = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: system-ui, sans-serif; padding: 20px; line-height: 1.6; color: var(--vscode-editor-foreground); }
                  .card { border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 16px; margin-bottom: 16px; background: var(--vscode-editor-inactiveSelectionBackground); }
                  .tag { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; text-transform: uppercase; font-size: 11px; margin-right: 6px; }
                  .tag-cause { background: #e06c75; color: #fff; }
                  .tag-category { background: #61afef; color: #fff; }
                  .confidence { color: #98c379; font-weight: bold; }
                  pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; overflow-x: auto; }
                  .btn-group { display: flex; gap: 10px; margin-top: 20px; }
                  .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; }
                  .btn:hover { background: var(--vscode-button-hoverBackground); }
                  .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                </style>
              </head>
              <body>
                <h2>AI Root Cause Failure Analysis</h2>
                <div class="card">
                  <span class="tag tag-cause">Root Cause</span>
                  <span class="tag tag-category">${analysis.failureCategory || lastFailureCategory}</span>
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
                <div class="btn-group">
                  <button class="btn" onclick="vscode.postMessage({ command: 'repairTest' })">✨ Auto-Repair Test with AI</button>
                  <button class="btn btn-secondary" onclick="vscode.postMessage({ command: 'exportDefect' })">🐛 Export Defect Report (.md)</button>
                </div>
                <script>
                  const vscode = acquireVsCodeApi();
                </script>
              </body>
              </html>
            `;
          }
        }
      );
    }
  }

  // Command: Run Automated Tests
  const runTestsCmd = vscode.commands.registerCommand("aiTesting.runTests", async () => {
    const config = vscode.workspace.getConfiguration("aiTesting");
    const framework = config.get<"vitest" | "playwright" | "jest">("testFramework") || "vitest";

    const result = await testRunner.runTests(framework);
    await handleTestExecutionResult(result);
  });

  // Command: Switch Gemini Model
  const selectModelCmd = vscode.commands.registerCommand("aiTesting.selectModel", async () => {
    const config = vscode.workspace.getConfiguration("aiTesting");
    const currentModel = config.get<string>("model") || "gemini-3.8-flash";

    const models = [
      {
        label: "gemini-3.8-flash",
        description: "(Default) Creative text & code generation",
        picked: currentModel === "gemini-3.8-flash"
      },
      {
        label: "gemini-3.5-flash-lite",
        description: "High-throughput, fast, cost-efficient model",
        picked: currentModel === "gemini-3.5-flash-lite"
      },
      {
        label: "gemini-3.7-flash",
        description: "Multimodal and deep reasoning model",
        picked: currentModel === "gemini-3.7-flash"
      },
      {
        label: "gemini-2.5-flash",
        description: "Standard production flash model",
        picked: currentModel === "gemini-2.5-flash"
      },
      {
        label: "gemini-2.0-flash",
        description: "Low-latency flash model",
        picked: currentModel === "gemini-2.0-flash"
      },
      {
        label: "gemini-1.5-flash",
        description: "High-availability legacy flash model",
        picked: currentModel === "gemini-1.5-flash"
      }
    ];

    const chosen = await vscode.window.showQuickPick(models, {
      placeHolder: `Select active Gemini model (current: ${currentModel})`
    });

    if (chosen) {
      await config.update("model", chosen.label, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Switched AI Testing model to: ${chosen.label}`);
      outputChannel.appendLine(`[AI Testing Assistant] Switched active model to: ${chosen.label}`);
    }
  });

  context.subscriptions.push(
    setApiKeyCmd,
    selectModelCmd,
    scanProjectCmd,
    analyzeImpactCmd,
    runImpactedTestsCmd,
    generateTraceabilityMatrixCmd,
    exportDefectReportCmd,
    repairFailingTestCmd,
    analyzeCurrentFileCmd,
    generateTestCasesCmd,
    toggleApprovalCmd,
    approveAndGenerateCodeCmd,
    runTestsCmd
  );
}

export function deactivate() {}
