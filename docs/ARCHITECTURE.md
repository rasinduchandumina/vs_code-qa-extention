# System Architecture & Technical Design

This document details the internal design, component interactions, AST parsing mechanisms, AI prompt engineering, and process management models of the **AI Codebase-Aware Testing Assistant** VS Code extension.

---

## 1. High-Level Subsystem Architecture

The extension is partitioned into five decoupled subsystems:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VS Code Extension Host                          │
│                                                                        │
│  ┌───────────────────────┐                  ┌───────────────────────┐  │
│  │ WorkspaceTreeProvider │                  │SuggestedCasesProvider │  │
│  │ (Project & Impact)    │                  │(Approval & Scoring)   │  │
│  └───────────▲───────────┘                  └───────────▲───────────┘  │
│              │                                          │              │
│  ┌───────────┴──────────────────────────────────────────┴───────────┐  │
│  │                    Extension Controller                          │  │
│  │                     (src/extension.ts)                           │  │
│  └───────┬───────────────────┬──────────────────┬─────────────────┬─┘  │
└──────────┼───────────────────┼──────────────────┼─────────────────┼────┘
           │                   │                  │                 │
           ▼                   ▼                  ▼                 ▼
 ┌───────────────────┐ ┌───────────────┐ ┌────────────────┐ ┌───────────────┐
 │ Workspace Scanner │ │   AI Client   │ │  Test Runner   │ │ SecretStorage │
 │ (AST & Impact)    │ │(REST & Heal)  │ │ (Selective)    │ │ (OS Keychain) │
 └─────────┬─────────┘ └───────┬───────┘ └────────┬───────┘ └───────────────┘
           │                   │                  │
           ▼                   ▼                  ▼
     Source Files         Google Gemini       vitest/jest/
    (.ts/.tsx/.js)       (Flash API/Heal)      playwright
```

---

## 2. Component Design & Code Mechanics

### 2.1 Extension Controller (`src/extension.ts`)

The controller acts as the central mediator:
- Manages command registrations, UI tree data bindings, and user interactions.
- Coordinates data flow between the scanner, AI engine, test runner, and the editor.
- **State Management**: Maintains reference to `currentAnalysis`, `activeSelectedFunction`, `lastFailureAnalysis`, `lastFailingTestFile`, and `lastFailureSnippet`.
- **Safe File Writing Pipeline**:
  When generating test code:
  1. Strips any AI-generated Windows drive letters: `cleanRelativePath.replace(/^[a-zA-Z]:[/\\]*/, "")`.
  2. Strips leading slashes: `cleanRelativePath.replace(/^[\/\\]+/, "")`.
  3. Ensures `.test.ts` or `.test.js` file extension.
  4. Resolves path against `workspaceRoot` and verifies that normalized target path begins with normalized workspace root path.
  5. Recursively generates parent folders (`fs.mkdir(..., { recursive: true })`) and writes UTF-8 code.
  6. Opens the newly created document inside the active VS Code editor tab.

---

### 2.2 Workspace Scanner & Impact Analysis (`src/scanner/workspaceScanner.ts`)

Instead of relying on crude regex search, the scanner leverages the official **TypeScript Compiler API** (`typescript` package) to parse and traverse the source Abstract Syntax Tree.

#### AST Traversal Strategy
1. **Source File Parsing**:
   ```typescript
   const sourceFile = ts.createSourceFile(
     path.basename(filePath),
     sourceText,
     ts.ScriptTarget.Latest,
     true
   );
   ```
2. **Function Declarations & Methods**:
   - Matches: `function calculateTotal(items: CartItem[]): number { ... }`
   - Detects `ts.isFunctionDeclaration(node) && node.name`.
   - Detects `ts.isVariableStatement(node)` containing arrow functions.
   - Detects `ts.isMethodDeclaration(node)` on classes.
3. **Changed-Code Impact Analysis (`analyzeImpact`)**:
   - Queries `git status --porcelain` to identify files modified in the working tree.
   - Maps modified source files to discovered functions.
   - Cross-references functions with existing test files to calculate `impactedTestFiles`.
   - Highlights impacted files in the sidebar and supports **Automatic Test Selection**.
4. **Existing-Test Analysis (`analyzeExistingTests`)**:
   - Inspects test files for imported symbols, test suite count, and target modules.
5. **Requirement Traceability Generator (`generateTraceabilityMatrix`)**:
   - Automatically builds a Markdown Traceability Matrix (`docs/TRACEABILITY_MATRIX.md`) mapping requirements (`REQ-001`, `REQ-002`) to target functions, source files, and test coverage status.

---

### 2.3 AI Engine, Quality Scoring & Self-Healing (`src/ai/aiClient.ts` & `src/ai/schemas.ts`)

The AI subsystem interfaces directly with Google's Gemini models through native HTTPS REST queries.

#### Key Mechanics:
1. **Test Quality Scoring**:
   - Scores test suites from 0 to 100 based on positive, negative, edge, and security scenario coverage, awarding letter grades (`A+`, `A`, `B`, `C`).
2. **Self-Healing Test Repair (`repairFailingTest`)**:
   - When a test fails, extracts the failing code, error output, and source snippet.
   - Prompts Gemini to diagnose whether the test assertion, mock, or signature was outdated.
   - Directly synthesizes the corrected test file and updates the file on disk.
3. **Defect Export Engine (`createDefectMarkdown`)**:
   - Transforms failure analyses into standardized GitHub/Jira-ready defect markdown files (`defects/BUG-<timestamp>.md`).
4. **Resilient Retry & Fallback Cascade**:
   - Catches 503 and 429 errors, applying exponential backoff retries.
   - Automatically switches through candidate fallback models (`gemini-3.8-flash` -> `gemini-3.5-flash-lite` -> `gemini-2.5-flash` -> `gemini-1.5-flash`).

---

### 2.4 Test Execution & Failure Classification (`src/tests/testRunner.ts`)

The test runner spawns an asynchronous child process using Node's `child_process.exec`.

#### Key Mechanics:
1. **Drive Letter Canonicalization**:
   - Converts Windows drive letters to uppercase (`G:\...`) using `fs.realpathSync.native` to prevent Vitest module graph discovery mismatches.
2. **Failure Classification Engine (`classifyFailure`)**:
   - Categorizes failures into distinct types:
     - `AssertionError` (Expected vs Actual mismatch)
     - `TimeoutError` (Timeout exceeded)
     - `TypeError` (Cannot read property of undefined)
     - `ReferenceError` (Variable is not defined)
     - `CompilationError` (Syntax or module import error)
     - `RuntimeCrash` (Uncaught exception or segmentation fault)
3. **Automatic Test Selection**:
   - Accepts an optional `specificTestFiles` array to selectively execute *only* the test suites covering changed code.

---

### 2.5 Failure Diagnostic Webview Panel

When tests fail, the interactive Webview provides:
- **Failure Category Badge**: Visual category indicator (`AssertionError`, `TimeoutError`, etc.).
- **Likely Root Cause & Evidence**: Detailed diagnostic breakdown.
- **✨ Auto-Repair Test with AI**: 1-click button triggering self-healing test repair.
- **🐛 Export Defect Report (.md)**: 1-click button creating a formatted defect report file.

---

## 3. Security, Privacy & Integrity Model

1. **Zero Secret Leakage**:
   Gemini API keys are stored exclusively in VS Code's `SecretStorage` keychain. Keys are never written to disk or logs.
2. **Selective AST Scope**:
   Only target function snippets and signatures are sent to the AI API.
3. **Workspace Path Containment**:
   All file paths returned by AI models are sanitized to strip drive letters (`C:`, `D:`) and leading slashes, strictly preventing directory traversal.
