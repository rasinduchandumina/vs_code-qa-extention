# Sample Shop Application (Extension Testbed)

A lightweight TypeScript application designed specifically for demonstrating, testing, and evaluating the **AI Codebase-Aware Testing Assistant** VS Code extension.

---

## 📂 Project Structure

```
examples/sample-app/
├── package.json                   # Project manifest configured with Vitest
├── vitest.config.ts               # Canonical Vitest configuration
├── docs/
│   └── TRACEABILITY_MATRIX.md     # Auto-generated Requirement Traceability Matrix
├── src/
│   ├── cart.ts                    # Shopping cart calculation & discount logic
│   └── auth.ts                    # User authentication & credential validation
└── tests/
    └── cart.test.ts               # Existing unit test suite for calculateTotal
```

---

## 🔍 Modules & Functions Available for Testing

### 1. `src/cart.ts`
- **`calculateTotal(items: CartItem[], taxRate: number = 0.08): number`**:
  Calculates the total cost of items in a shopping cart with sales tax. Throws errors on negative item prices or quantities.
- **`applyDiscount(subtotal: number, discount: DiscountCode): number`**:
  Applies percentage discounts subject to minimum spend conditions.

### 2. `src/auth.ts`
- **`loginUser(email?: string, password?: string, userDb?: Map<string, User>): Promise<LoginResult>`**:
  Validates credentials and account status, returning authentication session tokens.

---

## 🚀 Complete Step-by-Step Walkthrough (With Exact Results)

### Step 1: Open the Project in Extension Development Host
1. In your primary VS Code window, press **`F5`** to launch the `[Extension Development Host]`.
2. In the Extension Host window, click **File > Open Folder...** and select `g:\vs_code-qa-extention\examples\sample-app`.
3. Open the **AI Testing** sidebar by clicking the beaker icon on the left Activity Bar.

---

### Step 2: Configure Gemini API Key & Select Model
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and run:
   **`AI Testing: Configure Gemini API Key`**.
2. Paste your Google Gemini API key and press `Enter`.
   - **Notification**: `Gemini API Key configured successfully.`
3. Open the Command Palette and run:
   **`AI Testing: Switch Gemini Model`**.
4. Select **`gemini-3.5-flash-lite`** from the list.
   - **Notification**: `Switched AI Testing model to: gemini-3.5-flash-lite`

---

### Step 3: Scan Project Structure (TypeScript AST Discovery)
1. In the sidebar title bar, click the **Scan Project** button (or run `AI Testing: Scan Project Structure`).
2. **Expected Notification**:
   ```
   Scanned 2 source files. Found 3 functions and 1 existing tests.
   ```
3. **Expected Sidebar Tree (`Testing Workspace Explorer`)**:
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

---

### Step 4: Navigate Code Directly from Sidebar
- Click on **`calculateTotal`** in the sidebar tree.
- **Result**: The editor immediately opens `src/cart.ts` and positions your cursor on line 17 (`export function calculateTotal(...)`).

---

### Step 5: Generate AI Test Cases for `calculateTotal`
1. Right-click `calculateTotal` in the sidebar and choose **Generate Test Cases for Function** (or run `AI Testing: Generate Test Cases for Function`).
2. **Expected Notification**:
   ```
   Generated 5 test scenarios for "calculateTotal" [Quality: 95/100]. Review and approve them in the sidebar.
   ```
3. **Expected Sidebar Tree (`AI Suggested Test Cases`)**:
   - **Header**: `Function: calculateTotal • Quality: 95/100 (A+)`
   - **Scenarios**:
     - `[REQ-001] [POSITIVE] Priority: high` - *Standard items with default tax*
     - `[REQ-002] [EDGE] Priority: medium` - *Empty cart array returns 0*
     - `[REQ-003] [NEGATIVE] Priority: high` - *Negative item price throws validation error*
     - `[REQ-004] [NEGATIVE] Priority: high` - *Negative item quantity throws error*
     - `[REQ-005] [SECURITY] Priority: low` - *Custom tax rate precision check*

---

### Step 6: Review, Inspect Tooltips & Toggle Approvals
1. Hover your cursor over `[REQ-001] [POSITIVE]`.
   - **Tooltip Displays**:
     ```
     Calculates total for standard items applying 8% tax rate.

     Inputs: [{ id: "1", name: "Shirt", price: 20, quantity: 2 }]
     Expected: 43.20
     ```
2. Click individual scenarios to toggle their approval status.
   - Unapproved scenarios show `circle-large-outline`.
   - Approved scenarios show `pass-filled` (green checkmark).

---

### Step 7: Synthesize & Save Executable Test Code
1. Click the checkmark icon in the **AI Suggested Test Cases** toolbar (or run `AI Testing: Approve & Generate Test Code`).
2. **Expected Notification**:
   ```
   Generated test file saved to: tests/ai-generated/calculateTotal.test.ts
   ```
3. **Expected Result**:
   - The file `tests/ai-generated/calculateTotal.test.ts` is created on disk.
   - The file automatically opens in an editor tab with complete Vitest imports, test suites, and assertions.

---

### Step 8: Run Automated Tests (Passing Flow)
1. Run `AI Testing: Run Automated Tests` from the Command Palette or click the Play icon in the sidebar.
2. **Expected Notification**: `All 2 tests passed successfully!`
3. **Expected Output Channel Log (`AI Testing Assistant`)**:
   ```
   [AI Testing Assistant] Executing: npx.cmd vitest run
   [AI Testing Assistant] Working directory: G:\vs_code-qa-extention\examples\sample-app

    RUN  v1.6.1 G:/vs_code-qa-extention/examples/sample-app

    ✓ tests/cart.test.ts (1 test) 3ms
    ✓ tests/ai-generated/calculateTotal.test.ts (3 tests) 4ms

    Test Files  2 passed (2)
         Tests  4 passed (4)
      Duration  610ms

   [AI Testing Assistant] Completed in 2.30s
   Status: ALL TESTS PASSED (4 passed, 0 failed)
   ```

---

### Step 9: Changed-Code Impact Analysis
1. Open `src/cart.ts` and modify line 36 (e.g., add a comment: `// Updated discount logic`).
2. Save the file (`Ctrl+S`).
3. Run: **`AI Testing: Analyze Changed Code Impact`**.
4. **Expected Notification**:
   ```
   Impact Analysis: 1 modified file(s), 2 function(s), and 2 impacted test suite(s).
   ```
5. **Expected Sidebar Result**:
   A top-level **Impacted Tests (2)** section appears with flame icon `$(flame)`:
   ```
   ▼ Impacted Tests (2)
       ⚡ tests/cart.test.ts [IMPACTED]
       ⚡ tests/ai-generated/calculateTotal.test.ts [IMPACTED]
   ```

---

### Step 10: Automatic Test Selection (`Run Impacted Tests Only`)
1. Run: **`AI Testing: Run Impacted Tests Only`**.
2. **Expected Output Log**:
   ```
   [AI Testing Assistant] Executing: npx.cmd vitest run "tests/cart.test.ts" "tests/ai-generated/calculateTotal.test.ts"
   ```
3. **Verification**: Only the 2 test files covering the changed code are executed.

---

### Step 11: Defect Injection & Failure Diagnostics
1. In `src/cart.ts`, introduce an intentional bug on line 30:
   ```typescript
   // Change:
   return Number((subtotal + tax).toFixed(2));
   // To:
   return -999;
   ```
2. Save the file.
3. Run `AI Testing: Run Automated Tests`.
4. **Expected Error Dialog**:
   `Tests failed (2 failures) [AssertionError]. Would you like AI Failure Analysis?`
   Buttons: `[Analyze Failure]`, `[Auto-Repair Test]`, `[Dismiss]`.
5. Click **`Analyze Failure`**.

---

### Step 12: Interactive AI Failure Analysis Webview
1. A dedicated diagnostic panel opens beside the code rendering:
   - **Category Badge**: `AssertionError`
   - **Root Cause**: `Function calculateTotal returned -999 instead of expected positive subtotal and tax calculation.`
   - **Responsible File**: `src/cart.ts (Line 30)`
   - **Confidence**: `HIGH`
   - **Remediation**: `Revert line 30 to return Number((subtotal + tax).toFixed(2));`
   - **Action Buttons**: `[✨ Auto-Repair Test with AI]` and `[🐛 Export Defect Report (.md)]`

---

### Step 13: 1-Click Defect Report Export (`defects/BUG-XXXXXX.md`)
1. In the Webview panel, click **`🐛 Export Defect Report (.md)`**.
2. **Expected Notification**:
   ```
   Defect Report exported successfully to: defects/BUG-XXXXXX.md
   ```
3. **Expected Result**:
   A formatted defect report is created at `defects/BUG-XXXXXX.md` and opened in the editor with status, severity, stack trace, and suggested fix ready to copy into GitHub Issues or Jira.

---

### Step 14: Self-Healing Test Auto-Repair
1. Revert line 30 in `src/cart.ts` back to:
   ```typescript
   return Number((subtotal + tax).toFixed(2));
   ```
2. In `tests/cart.test.ts`, introduce an outdated expectation:
   ```typescript
   // Change:
   expect(calculateTotal(items)).toBe(27);
   // To:
   expect(calculateTotal(items)).toBe(9999);
   ```
3. Save and run `AI Testing: Run Automated Tests`.
4. On the failure prompt, click **`Auto-Repair Test`** (or run `AI Testing: Auto-Repair Failing Test`).
5. **Expected Notification**:
   ```
   ✨ Test repaired! Updated expected total calculation assertion from 9999 to 27. Run automated tests to verify.
   ```
6. **Expected Result**:
   `tests/cart.test.ts` is automatically repaired and rewritten on disk with `toBe(27)`.
7. Re-run `AI Testing: Run Automated Tests` -> All tests now pass cleanly!

---

### Step 15: Generate Requirement Traceability Matrix
1. Run: **`AI Testing: Generate Traceability Matrix`**.
2. **Expected Notification**:
   ```
   Traceability Matrix generated and saved to docs/TRACEABILITY_MATRIX.md
   ```
3. **Expected Result**:
   File `docs/TRACEABILITY_MATRIX.md` opens in the editor displaying the full Requirement ID -> Function -> Test Coverage table.

---

## 💻 Running Tests via Terminal CLI

```powershell
# Run using npm in PowerShell:
cd examples/sample-app
npm test

# Direct npx execution:
npx vitest run
```

#### Expected Output:
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
