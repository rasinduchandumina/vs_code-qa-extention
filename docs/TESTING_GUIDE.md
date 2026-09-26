 # Comprehensive Testing & Verification Guide

This guide provides end-to-end instructions for testing, validating, and verifying the **AI Codebase-Aware Testing Assistant** extension on Windows, macOS, and Linux.

---

## 1. Test Matrix & Environment Verification

| Parameter | Minimum Requirement | Recommended |
|-----------|---------------------|-------------|
| **Node.js** | v18.0.0 | v20.11.0 or v24.17.0+ |
| **npm** | v9.0.0 | v10.0.0 or v11.13.0+ |
| **VS Code** | v1.85.0 | Latest stable |
| **Operating Systems** | Windows 10/11, macOS 12+, Ubuntu 20.04+ | Windows 11 (PowerShell 5.1 / 7+) |
| **LLM Backend** | Google Gemini API (gemini-3.8-flash) | Active Google AI Studio API Key |

---

## 2. Automated & Compilation Verification

### 2.1 Clean Build & Dependency Check
From the project root (`g:\vs_code-qa-extention`), run:

```bash
# 1. Verify dependencies are cleanly installed
npm install

# 2. Check TypeScript compilation
npm run compile

# 3. Perform static lint analysis
npm run lint
```
**Expected Result**: Both `compile` and `lint` should exit with code `0` and 0 errors.

### 2.2 Verify Sample Project Tests
Before launching the extension, verify that the sample test framework works directly:

```bash
cd examples/sample-app
npm test
```
**Expected Result**:
```
✓ tests/cart.test.ts (1 test)
Test Files  1 passed (1)
     Tests  1 passed (1)
```

---

## 3. Manual QA Test Procedures (Extension Host)

Follow these step-by-step test suites using the VS Code **Extension Development Host**.

### Test Suite 1: Launch & Activation
1. Open `vs_code-qa-extention` in VS Code.
2. Press **`F5`** (or select **Run and Debug** -> **Run Extension**).
3. Observe that a new window opens with title `[Extension Development Host]`.
4. Open the **Output** panel (`Ctrl+Shift+U` or `Cmd+Shift+U`) and select **AI Testing Assistant** from the channel dropdown.

**Pass Criteria**:
- Output channel displays: `[AI Testing Assistant] Extension activated.`
- The **AI Testing** beaker icon appears on the Activity Bar.

---

### Test Suite 2: API Key Configuration & SecretStorage
1. In the Extension Host, open the Command Palette (`Ctrl+Shift+P`).
2. Run `AI Testing: Configure Gemini API Key`.
3. Enter your Gemini API key in the secure password input box and press Enter.

**Pass Criteria**:
- Information message appears: `Gemini API Key configured successfully.`
- Key is stored in VS Code `SecretStorage` (keychain) without any plain-text logging.

---

### Test Suite 3: Project Scanning & AST Function Discovery
1. In the Extension Host, click **File > Open Folder...** and select `examples/sample-app`.
2. Click the **AI Testing** icon in the Activity Bar.
3. Click the refresh/scan button or run `AI Testing: Scan Project Structure`.
4. Observe the notification: `Scanned 2 source files. Found 3 functions and 1 existing tests.`
5. Inspect the **Testing Workspace Explorer** tree:
   - Root: `Project (Standard TS/JS)` with subtitle `Test Runner: vitest`
   - `Scanned Source Files (2)`:
     - `src/cart.ts` (2 functions)
       - `calculateTotal` (L17-L31)
       - `applyDiscount` (L36-L42)
     - `src/auth.ts` (1 function)
       - `loginUser` (L17-L40)
   - `Existing Tests (1)`:
     - `tests/cart.test.ts`
6. Click on `calculateTotal`:
   - VS Code should immediately open `src/cart.ts` with cursor placed at Line 17.
7. Click on `tests/cart.test.ts`:
   - VS Code should open `tests/cart.test.ts`.

**Pass Criteria**:
- All functions and existing test files are extracted and displayed with normalized forward slashes.
- Clicking any function or test file jumps to the correct editor location.

---

### Test Suite 4: Single File Function Analysis
1. Open `examples/sample-app/src/auth.ts` in the editor.
2. Run command: `AI Testing: Analyze Current File`.
3. A quick-pick dropdown displays discovered functions in the file:
   - `$(symbol-function) loginUser`
4. Select `loginUser`.

**Pass Criteria**:
- Progress notification appears: `AI Testing: Generating test scenarios for "loginUser"...`.
- AI generates structured scenarios under **AI Suggested Test Cases**.

---

### Test Suite 5: Review & Toggle Test Case Approvals
1. In the **AI Suggested Test Cases** sidebar view:
   - Header shows: `Function: loginUser` with AI summary.
   - List contains categorized test cases (Positive, Negative, Edge, Security).
2. Click on a test case item in the tree:
   - Notice the icon toggles between `circle-large-outline` (unapproved) and `pass-filled` (approved).
3. Hover over a test case to inspect tooltip:
   - Contains description, input conditions, and expected results.

**Pass Criteria**:
- Tree items toggle approval states smoothly.
- Tooltips render full scenario metadata.

---

### Test Suite 6: Test Code Synthesis & File Generation
1. In the **AI Suggested Test Cases** panel, click the checkmark button (or run `AI Testing: Approve & Generate Test Code`).
2. Progress notification displays: `AI Testing: Writing vitest test code...`.
3. Once completed:
   - Information message displays: `Generated test file saved to: tests/ai-generated/loginUser.test.ts`.
   - The generated test file opens automatically in an editor tab.
   - The file contains valid Vitest code importing `loginUser` from `../../src/auth`.

**Pass Criteria**:
- Code compiles without syntax errors.
- Imports correctly map to the target source file.
- Path stays strictly inside `examples/sample-app/tests/ai-generated/`.

---

### Test Suite 7: Automated Test Execution via TestRunner
1. Run command `AI Testing: Run Automated Tests`.
2. The **AI Testing Assistant** output channel opens automatically.
3. Observe output:
   ```
   [AI Testing Assistant] Executing: npx.cmd vitest run
   [AI Testing Assistant] Working directory: G:\vs_code-qa-extention\examples\sample-app
   ...
   Status: ALL TESTS PASSED (X passed, 0 failed)
   ```
4. Notification appears: `All X tests passed successfully!`.

**Pass Criteria**:
- Test runner executes `npx.cmd vitest run` on Windows (or `npx vitest run` on Unix).
- Results are parsed and reported accurately.

---

### Test Suite 8: Automated Failure Diagnostics & Webview Display
1. In `examples/sample-app/src/cart.ts`, modify line 30 to introduce an intentional bug:
   ```typescript
   // Change from:
   return Number((subtotal + tax).toFixed(2));
   // To:
   return -999;
   ```
2. Save the file and run `AI Testing: Run Automated Tests`.
3. Observe:
   - Output channel displays failing Vitest logs.
   - Error notification appears: `Tests failed (1 failures). Would you like AI Failure Analysis?` with buttons `[Analyze Failure]` and `[Dismiss]`.
4. Click **Analyze Failure**.
5. Progress notification shows: `AI Testing: Diagnosing test failure...`.
6. An **AI Failure Analysis** Webview panel opens beside your code showing:
   - **Likely Root Cause**: Explanation that `calculateTotal` returned negative total.
   - **Relevant File**: `src/cart.ts` at line 30.
   - **Confidence Level**: HIGH.
   - **Suggested Fix / Action**: Revert calculation to sum subtotal and tax.
   - **Evidence**: Stack trace showing expected vs received discrepancy.

**Pass Criteria**:
- Diagnostic Webview loads cleanly, matches editor theme colors, and pinpoints the defect.
- Webview includes category badge (`AssertionError`) and action buttons (`Export Defect Report` and `Auto-Repair Test with AI`).

---

### Test Suite 9: Changed-Code Impact Analysis & Automatic Test Selection
1. Modify a function in `examples/sample-app/src/cart.ts` (e.g. add a console.log or change a return).
2. Run command `AI Testing: Analyze Changed Code Impact`.
3. Observe:
   - Notification shows: `Impact Analysis: 1 modified file(s), 2 function(s), and 1 impacted test suite(s).`
   - In the sidebar explorer, an **Impacted Tests (1)** section appears with flame icon `$(flame)` listing `tests/cart.test.ts`.
4. Run command `AI Testing: Run Impacted Tests Only`.
5. Output channel demonstrates that only the impacted test suite (`tests/cart.test.ts`) is executed!

**Pass Criteria**:
- Changes are detected from git status and accurately mapped to impacted test files.
- `Run Impacted Tests Only` runs only the target test suite.

---

### Test Suite 10: Requirement Traceability Matrix Generation
1. In the Extension Host, run `AI Testing: Generate Traceability Matrix`.
2. Notice progress notification and opening of `docs/TRACEABILITY_MATRIX.md`.
3. Inspect the file:
   - Contains a table listing Requirement IDs (`REQ-001`, `REQ-002`), Target Functions (`calculateTotal`, `applyDiscount`, `loginUser`), Source Files, and Test Coverage Status (`Covered` vs `Untested`).

**Pass Criteria**:
- Matrix is synthesized into markdown format and opened in editor.

---

### Test Suite 11: Defect Report Export (.md)
1. After a test fails and failure analysis is completed, click the **Export Defect Report (.md)** button inside the Webview (or run `AI Testing: Export Defect Report`).
2. Observe:
   - A new file `defects/BUG-XXXXXX.md` is created and opened in an editor tab.
   - Contains Title, Severity, Category (`AssertionError`), Failing Test, Root Cause, Stack Trace Evidence, and Suggested Fix.

**Pass Criteria**:
- Formatted markdown report is created and saved under `defects/`.

---

### Test Suite 12: Self-Healing Test Auto-Repair
1. When a test failure occurs, click **Auto-Repair Test with AI** inside the Failure Analysis Webview (or run `AI Testing: Auto-Repair Failing Test`).
2. Observe:
   - Progress notification shows: `AI Testing: Auto-healing "<test-file>"...`.
   - The test file is repaired on disk with updated assertions or expectations.
   - Information message displays: `✨ Test repaired! ... Run automated tests to verify.`
3. Re-run `AI Testing: Run Automated Tests`.
4. Tests now pass successfully!

**Pass Criteria**:
- Failing test file is repaired by AI and re-execution passes cleanly.

---

## 4. Windows Compatibility QA Checklist

| Test Item | Verification Check | Status |
|-----------|--------------------|--------|
| **PowerShell ExecutionPolicy** | `npm` commands run without `PSSecurityException` error | Verified |
| **Child Process Shell** | Tests run through `cmd.exe` / `npx.cmd` without blocking | Verified |
| **Path Slashing** | Tree views render `src/cart.ts` rather than `src\cart.ts` | Verified |
| **Drive Letter Sanitization** | Paths with `G:` or `C:` are safely resolved to workspace root | Verified |
| **Drive Letter Casing** | Canonical uppercase drive letter (`G:`) ensures Vitest module graph discovers test suites | Verified |
| **File Permissions** | Windows file lock errors (`EPERM`, `EBUSY`) produce clean notifications | Verified |
| **AI Prompt Backslashes** | Prompts use POSIX paths to avoid invalid JSON escapes | Verified |
