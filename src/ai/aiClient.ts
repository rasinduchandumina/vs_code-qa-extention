import * as vscode from "vscode";
import { TestCaseBatch, TestCaseBatchSchema, GeneratedTestCode, GeneratedTestCodeSchema, FailureAnalysis, FailureAnalysisSchema, TestCase } from "./schemas";
import { DiscoveredFunction } from "../scanner/workspaceScanner";

const SECRET_KEY_NAME = "aiTesting.geminiApiKey";

export class AIClient {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
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
   * Generates structured test cases for a target function.
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
5. Return ONLY a valid JSON object matching this exact schema:
{
  "targetFunction": "${func.name}",
  "targetFile": "${func.filePath}",
  "summary": "Short explanation of function behavior",
  "testCases": [
    {
      "id": "tc-1",
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

      const validation = TestCaseBatchSchema.safeParse(parsedData);
      if (!validation.success) {
        console.error("Schema validation errors:", validation.error.format());
        throw new Error("AI returned data that did not match the expected TestCase schema.");
      }

      return validation.data;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to generate test cases: ${err.message}`);
      return null;
    }
  }

  /**
   * Generates executable test code for approved test cases.
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
4. Output ONLY a valid JSON object matching:
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
      vscode.window.showErrorMessage(`Failed to generate test code: ${err.message}`);
      return null;
    }
  }

  /**
   * Analyzes test execution failure with stack trace and relevant source code.
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

    const prompt = `
You are an expert software debugging assistant. Analyze this test failure:

Test Name: ${testName}
Source File: ${sourceFilePath}

Stack Trace / Failure Output:
\`\`\`
${stackTrace}
\`\`\`

Relevant Source Code:
\`\`\`typescript
${sourceSnippet}
\`\`\`

Identify:
1. Likely root cause.
2. The specific file and line responsible.
3. Direct evidence from the stack trace and code.
4. Actionable fix or investigation step.
5. Confidence level (high, medium, low).

Output ONLY JSON matching:
{
  "testName": "${testName}",
  "likelyCause": "...",
  "relevantSourceFile": "${sourceFilePath}",
  "relevantLine": 42,
  "evidence": "...",
  "suggestedFix": "...",
  "confidence": "high" | "medium" | "low"
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
   * Direct REST call to Google Gemini generateContent API with JSON response format.
   */
  private async callGeminiApi(apiKey: string, model: string, promptText: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("No response text received from Gemini API.");
    }

    return text;
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
