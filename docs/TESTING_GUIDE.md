# Comprehensive Testing & Verification Guide

This guide provides end-to-end, step-by-step instructions for testing, validating, and verifying every capability of the **AI Codebase-Aware Testing Assistant** extension on Windows, macOS, and Linux. Every test suite documents the **exact user actions**, **expected inputs**, and **concrete outputs/results** at each step.

---

## 1. Test Matrix & Environment Verification

| Parameter | Minimum Requirement | Verified Environment |
|---|---|---|
| **Node.js** | v18.0.0 | v24.17.0 / v20.11.0 |
| **npm** | v9.0.0 | v11.13.0 |
| **VS Code** | v1.85.0 | Latest stable |
| **Operating Systems** | Windows 10/11, macOS 12+, Ubuntu 20.04+ | Windows 11 (PowerShell 5.1 / 7+) |
| **LLM Backend** | Google Gemini REST API | Active Google AI Studio API Key |

---

## 2. Automated & Compilation Verification

### Step 2.1: Clean Build & Dependency Check
From the project root directory (`g:\vs_code-qa-extention`), execute:

```powershell
npm install
npm run compile
npm run lint
```

#### Expected Results & Output:
```
> ai-testing-assistant@0.1.0 compile
> tsc -p ./

> ai-testing-assistant@0.1.0 lint
> tsc --noEmit
```
- **Exit Code**: `0`
- **Output**: 0 compile errors, 0 lint warnings.
- **File System Changes**: `out/` directory generated containing:
  - `out/extension.js`, `out/extension.js.map`
  - `out/scanner/workspaceScanner.js`
  - `out/ai/aiClient.js`, `out/ai/schemas.js`
  - `out/tests/testRunner.js`
  - `out/ui/testTreeProvider.js`

---

### Step 2.2: CLI Sanity Check on Sample App
Verify that the test runner executes cleanly in the sample application:

```powershell
cd examples/sample-app
npm test
```

#### Expected Results & Output:
```
> sample-shop-app@1.0.0 test
> vitest run

 RUN  v1.6.1 G:/vs_code-qa-extention/examples/sample-app

 ✓ tests/cart.test.ts  (1 test) 3ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  10:16:23
   Duration  616ms
```
- **Exit Code**: `0`
- **Status**: `1 passed (1)`

---

## 3. Manual QA Test Procedures (Extension Development Host)

Launch the testing environment by pressing **`F5`** in VS Code (or choosing **Run and Debug** -> **Run Extension**). A new window labeled `[Extension Development Host]` will open.

---

### Test Suite 1: Launch & Activation

#### Objective:
Verify extension activates properly and registers the activity bar view container.

#### Steps:
1. In the `[Extension Development Host]` window, open the **Output** panel via **View > Output** (or `Ctrl+Shift+U`).
2. In the dropdown at the top-right of the Output panel, select **`AI Testing Assistant`**.

#### Expected Results & Output:
```
[AI Testing Assistant] Extension activated.
```
- The **AI Testing** beaker icon appears on the left Activity Bar.
- Clicking the beaker icon displays two panels:
  - **Testing Workspace Explorer**
  - **AI Suggested Test Cases**

---

### Test Suite 2: API Key Configuration & Model Selection

#### Objective:
Verify secure storage of the Gemini API key in `SecretStorage` and dynamic model switching.

#### Steps:
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the Command Palette.
2. Type and select: **`AI Testing: Configure Gemini API Key`**.
3. In the input box, paste your Google Gemini API key and press `Enter`.
4. Open the Command Palette again and select: **`AI Testing: Switch Gemini Model`**.
5. Select **`gemini-3.5-flash-lite`** from the quick-pick list.

#### Expected Results & Output:
- **Notification**: `Gemini API Key configured successfully.`
- **Notification**: `Switched AI Testing model to: gemini-3.5-flash-lite`
- **Output Channel**:
  ```
  [AI Testing Assistant] Switched active model to: gemini-3.5-flash-lite
  ```
- **Security Verification**: The API key is securely stored in VS Code's `SecretStorage` keychain and is never displayed in plaintext or saved to any configuration file.

---

### Test Suite 3: Project Scanning & AST Function Discovery

#### Objective:
Verify TypeScript AST scanning, framework detection, and interactive sidebar navigation.

#### Steps:
1. In the Extension Host window, click **File > Open Folder...** and select:
   `g:\vs_code-qa-extention\examples\sample-app`
2. Open the **AI Testing** sidebar from the Activity Bar.
3. Click the **Scan Project** button in the title bar (or run `AI Testing: Scan Project Structure` from the Command Palette).

#### Expected Results & Output:
- **Notification**:
  ```
  Scanned 2 source files. Found 3 functions and 1 existing tests.
  ```
- **Testing Workspace Explorer Tree View**:
  ```
  ▼ Project (Standard TS/JS)
      Test Runner: vitest
  ▼ Scanned Source Files (2)
    ▼ src/cart.ts
        calculateTotal (L17-L31)
        applyDiscount (L36-L42)
    ▼ src/auth.ts
        loginUser (L17-L40)
  ▼ Existing Tests (1)
      tests/cart.test.ts
  ```
- **Interactive Navigation Verification**:
  - Click on `calculateTotal`: Editor opens [cart.ts](file:///g:/vs_code-qa-extention/examples/sample-app/src/cart.ts) with cursor on line 17.
  - Click on `loginUser`: Editor opens [auth.ts](file:///g:/vs_code-qa-extention/examples/sample-app/src/auth.ts) with cursor on line 17.
  - Click on `tests/cart.test.ts`: Editor opens [cart.test.ts](file:///g:/vs_code-qa-extention/examples/sample-app/tests/cart.test.ts).

---

### Test Suite 4: Single File Function Analysis

#### Objective:
Verify quick-pick function selection from an open editor tab.

#### Steps:
1. Open `examples/sample-app/src/cart.ts` in the editor.
2. Press `Ctrl+Shift+P` and execute: **`AI Testing: Analyze Current File`**.
3. A Quick Pick dropdown appears listing all discovered functions:
   - `$(symbol-function) calculateTotal - Lines 17-31 (items, taxRate)`
   - `$(symbol-function) applyDiscount - Lines 36-42 (subtotal, discount)`
4. Select **`calculateTotal`**.

#### Expected Results & Output:
- **Progress Notification**: `AI Testing: Generating test scenarios for "calculateTotal"...`
- Proceed to Test Suite 5.

---

### Test Suite 5: AI Test Case Generation, Quality Scoring & Review

#### Objective:
Verify structured scenario generation, quality grading, and interactive approval toggling.

#### Steps:
1. Inspect the **AI Suggested Test Cases** panel in the sidebar.
2. Observe the header item and scenario list:

#### Expected Results & Output:
- **Header Item**:
  ```
  Function: calculateTotal • Quality: 95/100 (A+)
  Subtitle: Calculates the total cost of items in a cart, applying sales tax.
  ```
- **Generated Scenario Items**:
  - `[REQ-001] [POSITIVE] Priority: high` - *Standard items with default tax*
  - `[REQ-002] [EDGE] Priority: medium` - *Empty cart array returns 0*
  - `[REQ-003] [NEGATIVE] Priority: high` - *Negative item price throws validation error*
  - `[REQ-004] [NEGATIVE] Priority: high` - *Negative item quantity throws error*
  - `[REQ-005] [SECURITY] Priority: low` - *Custom tax rate precision check*
- **Interactive Approval Toggling**:
  - Click any scenario item: The icon toggles between `circle-large-outline` (unapproved) and `pass-filled` (approved).
  - Hover over a scenario: Tooltip displays full description, input conditions, and expected results.

---

### Test Suite 6: Test Code Generation & Automatic File Writing

#### Objective:
Verify AI test code synthesis and safe file writing into `tests/ai-generated/`.

#### Steps:
1. Ensure at least 2 scenarios are approved.
2. Click the checkmark icon in the **AI Suggested Test Cases** toolbar (or run `AI Testing: Approve & Generate Test Code`).

#### Expected Results & Output:
- **Progress Notification**: `AI Testing: Writing vitest test code...`
- **Notification**: `Generated test file saved to: tests/ai-generated/calculateTotal.test.ts`
- **File System Changes**:
  - A new file is created at `examples/sample-app/tests/ai-generated/calculateTotal.test.ts`.
- **Editor Window**: The generated test file opens automatically in the editor with syntax-highlighted Vitest code:
  ```typescript
  import { describe, it, expect } from "vitest";
  import { calculateTotal } from "../../src/cart";

  /**
   * @requirement REQ-001, REQ-002, REQ-003
   * AI Quality Score: 95/100 (A+)
   */
  describe("calculateTotal", () => {
    it("should calculate total for standard items with default tax (8%)", () => {
      const items = [{ id: "1", name: "Item", price: 10, quantity: 2 }];
      expect(calculateTotal(items)).toBe(21.6);
    });

    it("should return 0 when cart is empty", () => {
      expect(calculateTotal([])).toBe(0);
    });

    it("should throw an error for negative item price", () => {
      const items = [{ id: "2", name: "Bad Item", price: -5, quantity: 1 }];
      expect(() => calculateTotal(items)).toThrow();
    });
  });
  ```

---

### Test Suite 7: Automated Test Execution via Child Process

#### Objective:
Verify test execution in an isolated child process and output log streaming.

#### Steps:
1. In the sidebar or Command Palette, execute: **`AI Testing: Run Automated Tests`**.
2. Observe the output channel and notifications.

#### Expected Results & Output:
- **Notification**: `All 2 tests passed successfully!`
- **Output Channel (`AI Testing Assistant`)**:
  ```
  [AI Testing Assistant] Executing: npx.cmd vitest run
  [AI Testing Assistant] Working directory: G:\vs_code-qa-extention\examples\sample-app

   RUN  v1.6.1 G:/vs_code-qa-extention/examples/sample-app

   ✓ tests/cart.test.ts (1 test) 3ms
   ✓ tests/ai-generated/calculateTotal.test.ts (3 tests) 4ms

   Test Files  2 passed (2)
        Tests  4 passed (4)
     Duration  580ms

  [AI Testing Assistant] Completed in 2.45s
  Status: ALL TESTS PASSED (4 passed, 0 failed)
  ```

---

### Test Suite 8: Defect Injection, Failure Diagnostics & Webview

#### Objective:
Verify error interception, failure categorization, and interactive diagnostics Webview.

#### Steps:
1. Open `examples/sample-app/src/cart.ts`.
2. Introduce an intentional bug on line 30:
   ```typescript
   // Change from:
   return Number((subtotal + tax).toFixed(2));
   // To:
   return -999;
   ```
3. Save the file (`Ctrl+S`).
4. Execute: **`AI Testing: Run Automated Tests`**.
5. Observe the error notification dialog:
   `Tests failed (2 failures) [AssertionError]. Would you like AI Failure Analysis?`
   Buttons: `[Analyze Failure]`, `[Auto-Repair Test]`, `[Dismiss]`.
6. Click **`Analyze Failure`**.

#### Expected Results & Output:
- **Progress Notification**: `AI Testing: Diagnosing test failure...`
- **Output Channel**:
  ```
  [AI Testing Assistant] Completed in 2.10s
  Status: TESTS FAILED (0 passed, 2 failed) [Category: AssertionError]
  ```
- **AI Failure Analysis Webview Panel**:
  An interactive panel opens beside the code rendering:
  - **Category Badge**: `AssertionError` (Blue badge)
  - **Root Cause Badge**: `Root Cause` (Red badge)
  - **Likely Cause**: `Function calculateTotal returned -999 instead of expected positive subtotal and tax calculation.`
  - **Relevant File**: `src/cart.ts (Line 30)`
  - **Confidence**: `HIGH` (Green text)
  - **Suggested Fix / Action**: `Revert line 30 to return Number((subtotal + tax).toFixed(2));`
  - **Evidence**: Stack trace showing `expected 27, received -999`.
  - **Action Buttons**:
    - `[✨ Auto-Repair Test with AI]`
    - `[🐛 Export Defect Report (.md)]`

---

### Test Suite 9: Defect Report Export (.md)

#### Objective:
Verify generation of standardized GitHub/Jira-ready markdown defect reports.

#### Steps:
1. With the AI Failure Analysis Webview open from Test Suite 8, click the **`🐛 Export Defect Report (.md)`** button (or run `AI Testing: Export Defect Report` from Command Palette).

#### Expected Results & Output:
- **Notification**: `Defect Report exported successfully to: defects/BUG-XXXXXX.md`
- **File System Changes**:
  - A new file `defects/BUG-XXXXXX.md` is generated.
- **Editor Window**: The file opens in an editor tab formatted as:
  ```markdown
  # 🐛 Defect Report: calculateTotal: Function calculateTotal returned -999 instead of... (BUG-749102)

  - **Status**: `OPEN`
  - **Severity**: **HIGH**
  - **Category**: `AssertionError`
  - **Reported On**: 2026-09-26T17:30:00.000Z
  - **Environment**: win32 (x64) Node v24.17.0

  ---

  ### 1. Failure Details
  - **Test Name**: `calculateTotal`
  - **Failing Test File**: `tests/cart.test.ts`
  - **Target Source File**: `src/cart.ts` (Line 30)

  ### 2. Root Cause Analysis
  Function calculateTotal returned -999 instead of expected calculated amount.

  ### 3. Stack Trace & Evidence
  ```
  AssertionError: expected -999 to be 27 // Object.is equality
  ```

  ### 4. Recommended Fix / Action
  Revert line 30 to return Number((subtotal + tax).toFixed(2));
  ```

---

### Test Suite 10: Changed-Code Impact Analysis & Automatic Test Selection

#### Objective:
Verify Git status change detection, function impact mapping, and selective test execution.

#### Steps:
1. Revert the intentional bug in `examples/sample-app/src/cart.ts` so the calculation is valid:
   ```typescript
   return Number((subtotal + tax).toFixed(2));
   ```
2. In `cart.ts`, add a harmless comment or modify line 36:
   ```typescript
   // Modified discount calculation for testing impact
   ```
3. Save the file.
4. Execute: **`AI Testing: Analyze Changed Code Impact`**.
5. Observe the notification and the sidebar explorer tree.
6. Execute: **`AI Testing: Run Impacted Tests Only`**.

#### Expected Results & Output:
- **Notification**:
  ```
  Impact Analysis: 1 modified file(s), 2 function(s), and 2 impacted test suite(s).
  ```
- **Testing Workspace Explorer Sidebar**:
  A new top section appears with a flame badge:
  ```
  ▼ Impacted Tests (2)
      ⚡ tests/cart.test.ts [IMPACTED]
      ⚡ tests/ai-generated/calculateTotal.test.ts [IMPACTED]
  ▼ Scanned Source Files (2)
  ...
  ```
- **Output Channel on `Run Impacted Tests Only`**:
  ```
  [AI Testing Assistant] Executing: npx.cmd vitest run "tests/cart.test.ts" "tests/ai-generated/calculateTotal.test.ts"
  ...
  Status: ALL TESTS PASSED (4 passed, 0 failed)
  ```
- **Verification**: Only the test suites covering modified code are executed, skipping unaffected files.

---

### Test Suite 11: Requirement Traceability Matrix Generation

#### Objective:
Verify generation of `docs/TRACEABILITY_MATRIX.md` with requirement IDs and test coverage mappings.

#### Steps:
1. Open the Command Palette (`Ctrl+Shift+P`).
2. Run: **`AI Testing: Generate Traceability Matrix`**.

#### Expected Results & Output:
- **Notification**: `Traceability Matrix generated and saved to docs/TRACEABILITY_MATRIX.md`
- **File System Changes**: `docs/TRACEABILITY_MATRIX.md` created.
- **Editor Window**: The matrix document opens:
  ```markdown
  # Requirement & Test Traceability Matrix

  *Generated automatically by AI Codebase-Aware Testing Assistant*

  | Req ID | Target Function | Source File | Kind | Test Coverage Status | Associated Test Suites |
  | :--- | :--- | :--- | :---: | :---: | :--- |
  | **REQ-001** | `calculateTotal` | `src/cart.ts` | function | ✅ **Covered** | `tests/cart.test.ts`<br>`tests/ai-generated/calculateTotal.test.ts` |
  | **REQ-002** | `applyDiscount` | `src/cart.ts` | arrow | ⚠️ *Untested* | *No tests yet* |
  | **REQ-003** | `loginUser` | `src/auth.ts` | function | ⚠️ *Untested* | *No tests yet* |

  ---

  ### Summary Metrics
  - **Total Functions Detected**: 3
  - **Existing Test Files**: 2
  - **Framework**: Standard TS/JS
  - **Test Runner**: vitest
  ```

---

### Test Suite 12: Self-Healing Test Auto-Repair

#### Objective:
Verify automated AI patching of outdated test assertions and immediate file updates.

#### Steps:
1. Open `examples/sample-app/tests/cart.test.ts`.
2. Deliberately modify an expectation to create an outdated assertion:
   ```typescript
   // Change from:
   expect(calculateTotal(items)).toBe(27);
   // To:
   expect(calculateTotal(items)).toBe(9999);
   ```
3. Run `AI Testing: Run Automated Tests`.
4. Tests fail with an `AssertionError`.
5. On the error dialog or inside the Failure Analysis Webview, click:
   **`Auto-Repair Test with AI`** (or run `AI Testing: Auto-Repair Failing Test`).

#### Expected Results & Output:
- **Progress Notification**: `AI Testing: Auto-healing "tests/cart.test.ts"...`
- **File System Updates**:
  `tests/cart.test.ts` is automatically repaired and rewritten on disk with the corrected assertion (`toBe(27)`).
- **Notification**:
  ```
  ✨ Test repaired! Updated expected total calculation assertion from 9999 to 27. Run automated tests to verify.
  ```
- **Verification**: Run `AI Testing: Run Automated Tests` -> All tests now pass cleanly!

---

### Test Suite 13: Edge Case & Resilience: Gemini 503 Spike & Fallback Cascade

#### Objective:
Verify exponential backoff retries and automatic candidate fallback model switching when Gemini experiences high demand.

#### Steps:
1. In the Command Palette, run `AI Testing: Switch Gemini Model` and select `gemini-3.8-flash`.
2. If a `503 Unavailable` response is returned by the upstream API, observe the extension behavior.

#### Expected Results & Output:
- **Retry Mechanism**: The extension automatically applies exponential backoff delays (1s, 2s, 4s).
- **Automatic Fallback**: If 3 retries fail, the extension switches to `gemini-3.5-flash-lite`, then `gemini-2.5-flash`, and finally `gemini-1.5-flash`.
- **Output Channel Log**:
  ```
  [AI Testing Assistant] Model gemini-3.8-flash unavailable (503). Retrying with backoff...
  [AI Testing Assistant] Switched active model to: gemini-3.5-flash-lite
  ```
- **User Prompt**: If all candidate models encounter issues, a clear prompt is shown offering a **Switch Model** button.

---

### Test Suite 14: Batch Scenario Approval & Empty Selection Fallback

#### Objective:
Verify user prompt safety when no test scenarios are explicitly approved prior to code generation.

#### Steps:
1. Generate test cases for a function (`loginUser` in `src/auth.ts`).
2. Leave all test scenarios unapproved (do not click any checkmarks).
3. Click the checkmark icon in the **AI Suggested Test Cases** toolbar.

#### Expected Results & Output:
- **Information Dialog**:
  `No test cases were explicitly approved. Would you like to approve and generate all 5 test cases?`
  Buttons: `[Approve All & Generate]`, `[Cancel]`.
- Clicking `[Approve All & Generate]`:
  - Automatically marks all 5 scenarios as approved (`pass-filled` icon).
  - Generates `tests/ai-generated/loginUser.test.ts`.

---

### Test Suite 15: Cross-Framework Detection (Vitest, Playwright, Jest)

#### Objective:
Verify that the scanner dynamically detects installed test frameworks from `package.json`.

#### Steps:
1. Inspect `examples/sample-app/package.json`.
2. Notice `vitest` in `devDependencies`.
3. Run `AI Testing: Scan Project Structure`.

#### Expected Results & Output:
- **Sidebar Header**:
  ```
  ▼ Project (Standard TS/JS)
      Test Runner: vitest
  ```
- **Runner Command**: The test runner executes `npx.cmd vitest run`.
- If `@playwright/test` is detected, the runner switches to `npx.cmd playwright test`.
- If `jest` is detected, the runner switches to `npx.cmd jest`.

---

## 4. Windows Compatibility QA Checklist

| Test Item | Verification Check | Status |
|---|---|:---:|
| **PowerShell ExecutionPolicy** | `npm` commands run without `PSSecurityException` error | **PASS** |
| **Child Process Shell** | Tests execute through `cmd.exe` / `npx.cmd` without blocking | **PASS** |
| **Path Slashing** | Tree views render `src/cart.ts` rather than `src\cart.ts` | **PASS** |
| **Drive Letter Sanitization** | Paths with `G:` or `C:` are safely resolved to workspace root | **PASS** |
| **Drive Letter Casing** | Canonical uppercase drive letter (`G:`) ensures Vitest module graph discovers test suites | **PASS** |
| **File Permissions** | Windows file lock errors (`EPERM`, `EBUSY`) produce clean notifications | **PASS** |
| **AI Prompt Backslashes** | Prompts use POSIX paths to avoid invalid JSON escapes | **PASS** |
