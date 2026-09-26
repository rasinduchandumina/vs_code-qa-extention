import * as vscode from "vscode";
import {
  TestCaseBatch,
  TestCaseBatchSchema,
  GeneratedTestCode,
  GeneratedTestCodeSchema,
  FailureAnalysis,
  FailureAnalysisSchema,
  TestCase,
  RepairedTestCode,
  RepairedTestCodeSchema,
  DefectReport
} from "./schemas";
import { DiscoveredFunction } from "../scanner/workspaceScanner";

const SECRET_KEY_NAME = "aiTesting.geminiApiKey";

export const AVAILABLE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

export class AIClient {
  private context: vscode.ExtensionContext;
  private outputChannel?: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
  }

  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[AI Testing] ${message}`);
    } else {
      console.log(`[AI Testing] ${message}`);
    }
  }

  /**
   * Stores the Gemini API Key securely in VS Code's SecretStorage.
   */
  public async setApiKey(apiKey: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEY_NAME, apiKey.trim());
  }

  /**
   * Retrieves the Gemini API Key.
   */
  public async getApiKey(): Promise<string | undefined> {
    return await this.context.secrets.get(SECRET_KEY_NAME);
  }

  /**
   * Prompts the user to input their Gemini API key if not yet set.
   */
  public async ensureApiKey(): Promise<string | null> {
    let key = await this.getApiKey();
    if (!key) {
      key = await vscode.window.showInputBox({
        title: "AI Testing Assistant: Configure API Key",
        prompt: "Enter your Google Gemini API Key (stored securely in VS Code SecretStorage)",
        password: true,
        ignoreFocusOut: true
      });

      if (key) {
        await this.setApiKey(key);
        vscode.window.showInformationMessage("Gemini API key saved securely.");
      } else {
        vscode.window.showErrorMessage("Gemini API key is required to use AI test generation.");
        return null;
      }
    }
    return key;
  }

  /**
   * Generates structured test cases with quality scoring and requirement traceability tags.
   */
  public async generateTestCases(func: DiscoveredFunction): Promise<TestCaseBatch | null> {
    const apiKey = await this.ensureApiKey();
    if (!apiKey) return null;

    const config = vscode.workspace.getConfiguration("aiTesting");
    const model = config.get<string>("model") || "gemini-3.8-flash";
    const posixFilePath = func.filePath.replace(/\\/g, "/");

    const prompt = `
You are a senior software quality and test automation engineer.
Analyze the following source code function and produce high-quality, comprehensive test scenarios.

File: ${posixFilePath}
Function Name: ${func.name}
Parameters: ${func.parameters.join(", ") || "none"}
Return Type: ${func.returnType || "unspecified"}

Source Snippet:
\`\`\`typescript
${func.snippet}
\`\`\`

Requirements:
1. Cover positive scenarios (happy path, typical inputs).
2. Cover negative scenarios (invalid inputs, null/undefined, error throws).
3. Cover edge cases (boundaries, empty collections, unexpected types).
4. Cover security or validation issues where applicable.
5. Assign a requirement ID (e.g. "REQ-001", "REQ-002") to each scenario for traceability.
6. Evaluate your own scenario quality and award a qualityScore (0-100) and qualityGrade ("A+", "A", "B", "C").
7. Return ONLY a valid JSON object matching this exact schema:
{
  "targetFunction": "${func.name}",
  "targetFile": "${posixFilePath}",
  "summary": "Short explanation of function behavior",
  "qualityScore": 92,
  "qualityGrade": "A+",
  "testCases": [
    {
      "id": "tc-1",
      "requirementId": "REQ-001",
      "title": "Short title",
      "type": "positive" | "negative" | "edge" | "security",
      "priority": "high" | "medium" | "low",
      "description": "Scenario description",
      "inputConditions": "Inputs or mock setups",
      "expectedResult": "Expected output or assertion",
      "approved": false
    }
  ]
}

DO NOT output any markdown backticks or explanations outside the JSON object.
`;

    try {
      const responseText = await this.callGeminiApi(apiKey, model, prompt);
      const cleanedJson = this.extractJsonString(responseText);
      const parsedData = JSON.parse(cleanedJson);

      // Augment quality scoring if missing
      if (!parsedData.qualityScore) {
        parsedData.qualityScore = this.computeQualityScore(parsedData.testCases || []);
        parsedData.qualityGrade = parsedData.qualityScore >= 90 ? "A+" : parsedData.qualityScore >= 80 ? "A" : "B";
      }

      const validation = TestCaseBatchSchema.safeParse(parsedData);
      if (!validation.success) {
        console.error("Schema validation errors:", validation.error.format());
        throw new Error("AI returned data that did not match the expected TestCase schema.");
      }

      return validation.data;
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE")) {
        const choice = await vscode.window.showErrorMessage(
          `Gemini API is currently experiencing high demand (503). Would you like to switch to an alternative model?`,
          "Switch Model",
          "Dismiss"
        );
        if (choice === "Switch Model") {
          vscode.commands.executeCommand("aiTesting.selectModel");
        }
      } else {
        vscode.window.showErrorMessage(`Failed to generate test cases: ${msg}`);
      }
      return null;
    }
  }

  /**
   * Generates executable test code for approved test cases with quality headers.
   */
  public async generateTestCode(
    func: DiscoveredFunction,
    approvedCases: TestCase[],
    framework: "vitest" | "playwright" | "jest"
  ): Promise<GeneratedTestCode | null> {
    const apiKey = await this.ensureApiKey();
    if (!apiKey) return null;

    const config = vscode.workspace.getConfiguration("aiTesting");
    const model = config.get<string>("model") || "gemini-3.8-flash";
    const posixFilePath = func.filePath.replace(/\\/g, "/");

    const prompt = `
Generate executable automated test code using "${framework}" for the following function and approved test cases.

Target File: ${posixFilePath}
Target Function: ${func.name}

Function Source:
\`\`\`typescript
${func.snippet}
\`\`\`

Approved Test Cases:
${JSON.stringify(approvedCases, null, 2)}

Requirements:
1. Use modern ${framework} syntax.
2. Properly import the function from "${posixFilePath}".
3. Provide isolated, reproducible tests with clean assertions.
4. Add JSDoc comment headers with requirement traceability tags (e.g. "@requirement REQ-001").
5. Output ONLY a valid JSON object matching:
{
  "framework": "${framework}",
  "targetFile": "${posixFilePath}",
  "suggestedTestFilePath": "tests/ai-generated/${func.name}.test.ts",
  "code": "complete test code file content as string",
  "imports": ["list of external package imports"]
}
`;

    try {
      const responseText = await this.callGeminiApi(apiKey, model, prompt);
      const cleanedJson = this.extractJsonString(responseText);
      const parsed = JSON.parse(cleanedJson);
      const validation = GeneratedTestCodeSchema.safeParse(parsed);
      if (!validation.success) {
        throw new Error("AI generated code format invalid.");
      }
      return validation.data;
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE")) {
        const choice = await vscode.window.showErrorMessage(
          `Gemini API is currently experiencing high demand (503). Would you like to switch to an alternative model?`,
          "Switch Model",
          "Dismiss"
        );
        if (choice === "Switch Model") {
          vscode.commands.executeCommand("aiTesting.selectModel");
        }
      } else {
        vscode.window.showErrorMessage(`Failed to generate test code: ${msg}`);
      }
      return null;
    }
  }

  /**
   * Analyzes test execution failure with stack trace, category classification, and source code.
   */
  public async analyzeFailure(
    testName: string,
    stackTrace: string,
    sourceSnippet: string,
    sourceFilePath: string
  ): Promise<FailureAnalysis | null> {
    const apiKey = await this.ensureApiKey();
    if (!apiKey) return null;

    const config = vscode.workspace.getConfiguration("aiTesting");
    const model = config.get<string>("model") || "gemini-3.8-flash";
    const posixSourcePath = sourceFilePath.replace(/\\/g, "/");

    const prompt = `
You are an expert software debugging assistant. Analyze this test failure:

Test Name: ${testName}
Source File: ${posixSourcePath}

Stack Trace / Failure Output:
\`\`\`
${stackTrace}
\`\`\`

Relevant Source Code:
\`\`\`typescript
${sourceSnippet}
\`\`\`

Identify:
1. Failure category (must be one of: "AssertionError", "TimeoutError", "TypeError", "ReferenceError", "CompilationError", "RuntimeCrash").
2. Likely root cause.
3. The specific file and line responsible.
4. Direct evidence from the stack trace and code.
5. Actionable fix or investigation step.
6. Confidence level (high, medium, low).

Output ONLY JSON matching:
{
  "testName": "${testName}",
  "failureCategory": "AssertionError",
  "likelyCause": "...",
  "relevantSourceFile": "${posixSourcePath}",
  "relevantLine": 42,
  "evidence": "...",
  "suggestedFix": "...",
  "confidence": "high"
}
`;

    try {
      const responseText = await this.callGeminiApi(apiKey, model, prompt);
      const cleaned = this.extractJsonString(responseText);
      const parsed = JSON.parse(cleaned);
      const validation = FailureAnalysisSchema.safeParse(parsed);
      if (!validation.success) {
        throw new Error("Invalid failure analysis format from AI.");
      }
      return validation.data;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failure analysis error: ${err.message}`);
      return null;
    }
  }

  /**
   * Automatic repair of failed tests ("Self-Healing Tests").
   */
  public async repairFailingTest(
    failingTestCode: string,
    testFilePath: string,
    failureSnippet: string,
    sourceSnippet: string
  ): Promise<RepairedTestCode | null> {
    const apiKey = await this.ensureApiKey();
    if (!apiKey) return null;

    const config = vscode.workspace.getConfiguration("aiTesting");
    const model = config.get<string>("model") || "gemini-3.8-flash";
    const posixTestPath = testFilePath.replace(/\\/g, "/");

    const prompt = `
You are an expert automated test healing assistant. A test is failing and must be repaired.

Test File: ${posixTestPath}

Failing Error / Stack Trace:
\`\`\`
${failureSnippet}
\`\`\`

Failing Test Code:
\`\`\`typescript
${failingTestCode}
\`\`\`

Target Function Source Code:
\`\`\`typescript
${sourceSnippet}
\`\`\`

Instructions:
1. Diagnose why the test is failing (e.g. outdated assertion, incorrect mock, wrong function signature, or improper expectation).
2. Repair the test code so that it compiles and passes cleanly against the target function.
3. Return ONLY a valid JSON object matching:
{
  "testFile": "${posixTestPath}",
  "explanation": "Summary of what was repaired and why",
  "repairedCode": "Complete fixed test file content",
  "changesMade": ["Specific change 1", "Specific change 2"]
}
`;

    try {
      const responseText = await this.callGeminiApi(apiKey, model, prompt);
      const cleaned = this.extractJsonString(responseText);
      const parsed = JSON.parse(cleaned);
      const validation = RepairedTestCodeSchema.safeParse(parsed);
      if (!validation.success) {
        throw new Error("Invalid repaired test format returned from AI.");
      }
      return validation.data;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to repair test: ${err.message}`);
      return null;
    }
  }

  /**
   * Converts a DefectReport object into a GitHub-flavored Markdown report.
   */
  public createDefectMarkdown(defect: DefectReport): string {
    return `# 🐛 Defect Report: ${defect.title} (${defect.id})

- **Status**: \`OPEN\`
- **Severity**: **${defect.severity.toUpperCase()}**
- **Category**: \`${defect.category}\`
- **Reported On**: ${defect.createdAt}
- **Environment**: ${defect.environment}

---

### 1. Failure Details
- **Test Name**: \`${defect.testName}\`
- **Failing Test File**: \`${defect.failingFile}\`
- **Target Source File**: \`${defect.relevantSourceFile}\`${defect.relevantLine ? ` (Line ${defect.relevantLine})` : ""}

### 2. Root Cause Analysis
${defect.likelyCause}

### 3. Stack Trace & Evidence
\`\`\`
${defect.evidence}
\`\`\`

### 4. Recommended Fix / Action
${defect.suggestedFix}

---
*Report automatically generated by AI Codebase-Aware Testing Assistant.*
`;
  }

  /**
   * Computes an algorithmic quality score (0-100) based on test scenario coverage.
   */
  private computeQualityScore(cases: any[]): number {
    if (!cases || cases.length === 0) return 0;
    let score = 50;

    const types = new Set(cases.map(c => c.type));
    if (types.has("positive")) score += 15;
    if (types.has("negative")) score += 15;
    if (types.has("edge")) score += 10;
    if (types.has("security")) score += 10;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Direct REST call to Google Gemini generateContent API with JSON response format,
   * automatic exponential backoff retry on 503/429, and automatic model fallback.
   */
  private async callGeminiApi(apiKey: string, requestedModel: string, promptText: string): Promise<string> {
    const candidateModels = [
      requestedModel,
      ...AVAILABLE_MODELS.filter(m => m !== requestedModel)
    ];

    const maxRetriesPerModel = 3;
    let lastError: Error | null = null;

    for (let modelIdx = 0; modelIdx < candidateModels.length; modelIdx++) {
      const currentModel = candidateModels[modelIdx];
      const isFallback = modelIdx > 0;

      if (isFallback) {
        this.log(`Primary model busy or unavailable. Trying fallback model: ${currentModel}...`);
      }

      for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

          const requestBody = {
            contents: [
              {
                parts: [{ text: promptText }]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json"
            }
          };

          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
          });

          if (response.ok) {
            const data: any = await response.json();
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text;

            if (!text) {
              throw new Error(`No response text received from Gemini API (${currentModel}).`);
            }

            if (isFallback) {
              this.log(`Successfully received response using fallback model: ${currentModel}`);
            }
            return text;
          }

          const errText = await response.text();
          const status = response.status;
          lastError = new Error(`Gemini API error (${status}): ${errText}`);

          if (status === 503 || status === 429) {
            if (attempt < maxRetriesPerModel) {
              const backoffMs = attempt * 1500 + Math.random() * 500;
              this.log(
                `Model ${currentModel} returned ${status} (${status === 503 ? "high demand" : "rate limit"}). Retrying in ${(backoffMs / 1000).toFixed(1)}s (attempt ${attempt}/${maxRetriesPerModel})...`
              );
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              continue;
            } else {
              this.log(`Model ${currentModel} exhausted ${maxRetriesPerModel} retries (status ${status}).`);
              break;
            }
          } else if (status === 404) {
            this.log(`Model ${currentModel} returned 404 (not found).`);
            break;
          } else {
            throw lastError;
          }
        } catch (fetchErr: any) {
          lastError = fetchErr;
          if (fetchErr.name === "FetchError" || fetchErr.code === "ECONNRESET") {
            if (attempt < maxRetriesPerModel) {
              const backoffMs = attempt * 1500;
              this.log(`Network error: ${fetchErr.message}. Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              continue;
            }
          } else {
            throw fetchErr;
          }
        }
      }
    }

    throw lastError || new Error("Failed to receive response from any Gemini model.");
  }

  /**
   * Sanitizes markdown fences if the model wraps JSON in ```json ... ```
   */
  private extractJsonString(raw: string): string {
    let clean = raw.trim();
    if (clean.startsWith("```json")) {
      clean = clean.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (clean.startsWith("```")) {
      clean = clean.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    return clean.trim();
  }
}
