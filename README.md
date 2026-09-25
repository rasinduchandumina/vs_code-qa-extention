# AI Codebase-Aware Testing IDE Extension

An AI-assisted VS Code extension that analyzes software projects, identifies testable functionality using AST analysis, suggests structured test cases, generates automated tests (Vitest, Jest, Playwright), executes them, and performs automated root-cause failure analysis.

---

## 🏗️ Architecture Overview

```
                      ┌──────────────────────┐  
                      │     VS Code IDE      │  
                      │                      │  
                      │  AI Testing Extension│  
                      └──────────┬───────────┘  
                                 │  
                  ┌──────────────┼──────────────┐  
                  ↓              ↓              ↓  
           Code Scanner    Test Manager    AI Assistant  
                  │              │              │  
                  └──────────────┼──────────────┘  
                                 ↓  
                        AI Testing Engine  
                                 │  
          ┌──────────────────────┼─────────────────────┐  
          ↓                      ↓                     ↓  
    Test Suggestions       Test Generation       Failure Analysis  
          │                      │                     │  
          ↓                      ↓                     ↓  
    Test Cases            Test Code (.spec)       Defects  
                                 │  
                                 ↓  
                         ┌───────────────┐  
                         │ Test Execution│  
                         └───────┬───────┘  
                                 │  
                      ┌──────────┴──────────┐  
                      ↓                     ↓  
                 Playwright             Vitest/Jest  
```

---

## 📁 Repository Structure

```
├── .vscode/
│   ├── launch.json              # F5 Extension Debugging configuration
│   └── tasks.json               # Background TypeScript build task
├── media/
│   └── icon.svg                 # Activity bar view icon
├── src/
│   ├── extension.ts             # Main entry point & command registrations
│   ├── scanner/
│   │   └── workspaceScanner.ts  # AST parser, function extraction & framework detection
│   ├── ai/
│   │   ├── schemas.ts           # Zod schemas for structured AI input/output
│   │   └── aiClient.ts          # Gemini API client with SecretStorage
│   ├── tests/
│   │   └── testRunner.ts        # Child-process test execution & log parser
│   └── ui/
│       └── testTreeProvider.ts  # Interactive sidebar TreeDataProviders
├── .ai-testing.json             # Codebase awareness & directory inclusion rules
├── package.json                 # Extension manifest & command declarations
├── tsconfig.json                # TypeScript compiler configuration
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Install Dependencies
Run the following in the project root:
```bash
npm install
```

### 2. Compile TypeScript
To compile once:
```bash
npm run compile
```
Or start the continuous watcher:
```bash
npm run watch
```

### 3. Launch & Debug (F5)
1. Open this repository in VS Code.
2. Press **`F5`** (or go to **Run and Debug** -> **Run Extension**).
3. A new **Extension Development Host** window will open with the extension loaded.

### 4. How to Use the Extension
1. In the Extension Development Host, open any TypeScript or JavaScript project.
2. Open the **AI Testing** tab from the Activity Bar on the left.
3. Click **AI Testing: Set LLM API Key** to securely store your Google Gemini API key.
4. Click **AI Testing: Scan Project Structure**:
   - The scanner extracts exported functions, class methods, and existing tests using TypeScript AST.
5. Select a function from the explorer tree or run **AI Testing: Analyze Current File**:
   - The AI generates structured test scenarios (positive, negative, edge, and security cases).
6. In the **AI Suggested Test Cases** sidebar:
   - Click individual test cases to toggle approval.
   - Run **AI Testing: Approve & Generate Test Code**.
   - The extension writes the test file into `tests/ai-generated/` and opens it.
7. Click **AI Testing: Run Automated Tests**:
   - The test runner executes `vitest` or `playwright`.
   - If tests fail, click **Analyze Failure** to launch the AI root-cause diagnostic webview.

---

## 🛡️ Security & Privacy
- **API Keys**: Stored in VS Code's native `SecretStorage` keychain, never committed or exposed in code.
- **Selective Context**: Only the specific target function AST, types, and dependencies are transmitted to the LLM. The extension never dumps the entire repository into AI prompts.
- **Repository Exclusions**: Configured via `.ai-testing.json` to automatically ignore `.env*`, `node_modules`, `dist`, and credentials.

---

## 🔬 Research & Evaluation Metrics
When evaluating this system for academic or thesis research:
1. **Test Generation Efficiency**: Measure test creation time (manual vs. AI-assisted).
2. **Defect Detection Rate**: Number of actual bugs discovered by generated edge/negative test cases.
3. **Acceptance Rate**: Percentage of AI-suggested test scenarios accepted by human engineers without manual revision.
4. **False Positive Rate**: Frequency of non-reproducible test failures or improper mocks generated by the LLM.
