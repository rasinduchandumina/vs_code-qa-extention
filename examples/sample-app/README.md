# Sample Shop Application (Extension Testbed)

A lightweight TypeScript project designed specifically for testing, demonstrating, and evaluating the **AI Codebase-Aware Testing Assistant** VS Code extension.

---

## 📂 Project Structure

```
examples/sample-app/
├── package.json          # Project manifest configured with Vitest
├── src/
│   ├── cart.ts           # Shopping cart calculation & discount logic
│   └── auth.ts           # User authentication & credential validation
└── tests/
    └── cart.test.ts      # Existing unit test suite for calculateTotal
```

---

## 🔍 Modules & Functions for Testing

### 1. `src/cart.ts`
- **`calculateTotal(items: CartItem[], taxRate: number = 0.08): number`**:
  Calculates the total cost of items in a shopping cart with sales tax. Throws errors on negative item prices or quantities.
  - *Ideal for generating*: Happy path totals, empty cart boundary tests, negative quantity rejection, precision rounding tests.
- **`applyDiscount(subtotal: number, discount: DiscountCode): number`**:
  Applies percentage discounts subject to minimum spend conditions.
  - *Ideal for generating*: Subtotal below minimum spend, percentage discount application, zero subtotal edge cases.

### 2. `src/auth.ts`
- **`loginUser(email?: string, password?: string, userDb?: Map<string, User>): Promise<LoginResult>`**:
  Validates credentials and account status, returning authentication tokens.
  - *Ideal for generating*: Missing credential checks, unknown user errors, disabled account rejection, successful authentication tokens.

---

## 🚀 How to Test with the AI Testing Assistant Extension

1. In your primary VS Code window (running `vs_code-qa-extention`), press **`F5`** to launch the **Extension Development Host**.
2. In the new Extension Host window, click **File > Open Folder...** and select this directory:
   `examples/sample-app`
3. Click the **AI Testing** icon on the Activity Bar.
4. Click **Scan Project Structure**:
   - The extension detects the `vitest` test runner.
   - Discovers `calculateTotal`, `applyDiscount`, and `loginUser`.
5. Select a function and click **Generate Test Cases**:
   - Review the positive, negative, edge, and security scenarios in the sidebar.
6. Click **Approve & Generate Test Code**:
   - The synthesized test suite is written to `tests/ai-generated/<functionName>.test.ts`.
7. Click **Run Automated Tests**:
   - Vitest runs all tests and outputs execution metrics directly to the output channel.

---

## 💻 Running Tests Locally (CLI)

You can also run the test suite directly from your terminal:

```bash
# Install dependencies (if not already installed)
npm install

# Run the Vitest test runner
npm test
```

### Windows Tip
On Windows PowerShell, if scripts are restricted, run commands using:
```powershell
npm.cmd test
```
or update your execution policy:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
```
