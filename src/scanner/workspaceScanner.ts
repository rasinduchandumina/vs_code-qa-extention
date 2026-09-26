import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import * as syncFs from "fs";
import * as ts from "typescript";
import { exec } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);

export interface DiscoveredFunction {
  name: string;
  kind: "function" | "method" | "arrow";
  fileName: string;
  filePath: string;
  absolutePath?: string;
  startLine: number;
  endLine: number;
  parameters: string[];
  returnType?: string;
  isExported: boolean;
  snippet: string;
  requirementId?: string;
}

export interface DiscoveredFile {
  relativePath: string;
  absolutePath: string;
  functions: DiscoveredFunction[];
  isTestFile: boolean;
}

export interface ExistingTestInfo {
  testFilePath: string;
  testedFunctions: string[];
  testedModules: string[];
  testCount: number;
}

export interface ImpactAnalysis {
  changedFiles: string[];
  changedFunctions: DiscoveredFunction[];
  impactedTestFiles: string[];
  untestedChangedFunctions: DiscoveredFunction[];
  summary: string;
}

export interface ProjectAnalysis {
  rootPath: string;
  framework?: string;
  testFramework?: "playwright" | "vitest" | "jest" | "unknown";
  sourceFilesCount: number;
  testFilesCount: number;
  functionsCount: number;
  files: DiscoveredFile[];
  existingTests: string[];
  existingTestDetails?: ExistingTestInfo[];
  impactAnalysis?: ImpactAnalysis;
}

export class WorkspaceScanner {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    let canonicalRoot = workspaceRoot;
    try {
      canonicalRoot = syncFs.realpathSync.native(workspaceRoot);
    } catch {
      if (process.platform === "win32") {
        canonicalRoot = canonicalRoot.replace(/^[a-z]:/i, (m) => m.toUpperCase());
      }
    }
    this.workspaceRoot = canonicalRoot;
  }

  /**
   * Performs a full scan of the workspace including AST analysis and existing test inspection.
   */
  public async scanProject(): Promise<ProjectAnalysis> {
    const projectFramework = await this.detectFrameworks();
    const sourceFiles = await vscode.workspace.findFiles(
      "**/*.{ts,tsx,js,jsx}",
      "**/{node_modules,.git,dist,out,build,.next,coverage}/**"
    );

    const files: DiscoveredFile[] = [];
    const existingTests: string[] = [];
    let functionsCount = 0;

    for (const fileUri of sourceFiles) {
      const filePath = fileUri.fsPath;
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const isTest = this.isTestFile(relativePath);

      if (isTest) {
        existingTests.push(relativePath);
      }

      try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        const functions = this.extractFunctionsFromSource(relativePath, filePath, fileContent);
        functionsCount += functions.length;

        files.push({
          relativePath,
          absolutePath: filePath,
          functions,
          isTestFile: isTest
        });
      } catch (err) {
        console.error(`Error reading ${relativePath}:`, err);
      }
    }

    // Inspect existing test suites to discover what functions they test
    const existingTestDetails = await this.analyzeExistingTests(existingTests);

    // Perform changed-code impact analysis via git
    const impactAnalysis = await this.analyzeImpact(files, existingTests);

    return {
      rootPath: this.workspaceRoot,
      framework: projectFramework.framework,
      testFramework: projectFramework.testFramework,
      sourceFilesCount: files.filter(f => !f.isTestFile).length,
      testFilesCount: existingTests.length,
      functionsCount,
      files,
      existingTests,
      existingTestDetails,
      impactAnalysis
    };
  }

  /**
   * Analyzes a single file's AST and extracts functions.
   */
  public async analyzeSingleFile(filePath: string): Promise<DiscoveredFile | null> {
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const isTest = this.isTestFile(relativePath);
      const functions = this.extractFunctionsFromSource(relativePath, filePath, fileContent);

      return {
        relativePath,
        absolutePath: filePath,
        functions,
        isTestFile: isTest
      };
    } catch {
      return null;
    }
  }

  /**
   * Changed-Code Impact Analysis: Identifies git modifications and matches them against functions and tests.
   */
  public async analyzeImpact(discoveredFiles: DiscoveredFile[], existingTests: string[]): Promise<ImpactAnalysis> {
    const changedFiles: string[] = [];
    const isWindows = process.platform === "win32";

    try {
      // Check git status
      const { stdout } = await execAsync("git status --porcelain", {
        cwd: this.workspaceRoot,
        windowsHide: true,
        shell: isWindows ? (process.env.ComSpec || "cmd.exe") : undefined
      });

      const lines = stdout.split(/\r?\n/).filter(line => line.trim().length > 0);
      for (const line of lines) {
        // e.g. " M src/cart.ts" or "?? src/new.ts"
        const filePath = line.substring(3).trim();
        if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
          changedFiles.push(filePath.replace(/\\/g, "/"));
        }
      }
    } catch {
      // If not a git repo or git is unavailable, impact analysis is empty
    }

    const changedFunctions: DiscoveredFunction[] = [];
    const impactedTestFilesSet = new Set<string>();
    const sourceFiles = discoveredFiles.filter(f => !f.isTestFile);

    for (const changedFile of changedFiles) {
      const matched = sourceFiles.find(f => f.relativePath.replace(/\\/g, "/") === changedFile);
      if (matched) {
        changedFunctions.push(...matched.functions);
        const baseName = path.basename(changedFile, path.extname(changedFile));

        // Find tests that correspond to this changed file
        for (const testPath of existingTests) {
          const normalizedTest = testPath.replace(/\\/g, "/");
          if (
            normalizedTest.includes(baseName) ||
            matched.functions.some(fn => normalizedTest.includes(fn.name))
          ) {
            impactedTestFilesSet.add(normalizedTest);
          }
        }
      }
    }

    const impactedTestFiles = Array.from(impactedTestFilesSet);
    const untestedChangedFunctions = changedFunctions.filter(fn => {
      return !impactedTestFiles.some(t => t.includes(fn.name));
    });

    const summary = changedFiles.length > 0
      ? `Detected ${changedFiles.length} modified file(s), ${changedFunctions.length} function(s), and ${impactedTestFiles.length} impacted test suite(s).`
      : "Working tree is clean. No changed code impact detected.";

    return {
      changedFiles,
      changedFunctions,
      impactedTestFiles,
      untestedChangedFunctions,
      summary
    };
  }

  /**
   * Existing-Test Analysis: Parses test files to identify tested functions and assertions.
   */
  public async analyzeExistingTests(testFilePaths: string[]): Promise<ExistingTestInfo[]> {
    const results: ExistingTestInfo[] = [];

    for (const relPath of testFilePaths) {
      try {
        const absPath = path.resolve(this.workspaceRoot, relPath);
        const content = await fs.readFile(absPath, "utf-8");
        const testedFunctions: string[] = [];
        const testedModules: string[] = [];

        // Simple regex heuristic to find imports and test suite descriptions
        const importMatches = content.matchAll(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g);
        for (const m of importMatches) {
          const symbols = m[1].split(",").map(s => s.trim().replace(/^type\s+/, ""));
          testedFunctions.push(...symbols.filter(s => !["describe", "it", "test", "expect", "beforeEach", "afterEach"].includes(s)));
          testedModules.push(m[2]);
        }

        // Count it() / test() blocks
        const testCaseMatches = content.match(/\b(it|test)\s*\(/g) || [];

        results.push({
          testFilePath: relPath.replace(/\\/g, "/"),
          testedFunctions,
          testedModules,
          testCount: testCaseMatches.length
        });
      } catch {
        // Skip unreadable files
      }
    }

    return results;
  }

  /**
   * Generates a comprehensive Requirement -> Function -> Test Traceability Matrix.
   */
  public generateTraceabilityMatrix(analysis: ProjectAnalysis): string {
    let md = `# Requirement & Test Traceability Matrix\n\n`;
    md += `*Generated automatically by AI Codebase-Aware Testing Assistant on ${new Date().toISOString()}*\n\n`;
    md += `| Req ID | Target Function | Source File | Kind | Test Coverage Status | Associated Test Suites |\n`;
    md += `| :--- | :--- | :--- | :---: | :---: | :--- |\n`;

    let reqCounter = 1;
    for (const file of analysis.files.filter(f => !f.isTestFile)) {
      for (const fn of file.functions) {
        const reqId = fn.requirementId || `REQ-${String(reqCounter++).padStart(3, "0")}`;
        const associatedTests = analysis.existingTests.filter(t => {
          const norm = t.replace(/\\/g, "/");
          return norm.includes(fn.name) || norm.includes(path.basename(file.relativePath, path.extname(file.relativePath)));
        });

        const status = associatedTests.length > 0 ? "✅ **Covered**" : "⚠️ *Untested*";
        const testList = associatedTests.length > 0
          ? associatedTests.map(t => `\`${t.replace(/\\/g, "/")}\``).join("<br>")
          : "*No tests yet*";

        md += `| **${reqId}** | \`${fn.name}\` | \`${file.relativePath.replace(/\\/g, "/")}\` | ${fn.kind} | ${status} | ${testList} |\n`;
      }
    }

    md += `\n---\n\n### Summary Metrics\n`;
    md += `- **Total Functions Detected**: ${analysis.functionsCount}\n`;
    md += `- **Existing Test Files**: ${analysis.testFilesCount}\n`;
    md += `- **Framework**: ${analysis.framework || "Standard TS/JS"}\n`;
    md += `- **Test Runner**: ${analysis.testFramework || "vitest"}\n`;

    return md;
  }

  /**
   * Checks package.json to detect existing web & test frameworks.
   */
  private async detectFrameworks(): Promise<{ framework?: string; testFramework: "playwright" | "vitest" | "jest" | "unknown" }> {
    const pkgPath = path.join(this.workspaceRoot, "package.json");
    try {
      const content = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      let framework: string | undefined;
      if (deps["next"]) framework = "Next.js";
      else if (deps["react"]) framework = "React";
      else if (deps["express"]) framework = "Express";
      else if (deps["@nestjs/core"]) framework = "NestJS";
      else if (deps["vue"]) framework = "Vue";

      let testFramework: "playwright" | "vitest" | "jest" | "unknown" = "unknown";
      if (deps["@playwright/test"]) testFramework = "playwright";
      else if (deps["vitest"]) testFramework = "vitest";
      else if (deps["jest"]) testFramework = "jest";

      return { framework, testFramework };
    } catch {
      return { testFramework: "unknown" };
    }
  }

  /**
   * Uses TypeScript AST parser to extract function declarations, arrow functions, and methods.
   */
  private extractFunctionsFromSource(relativePath: string, filePath: string, sourceText: string): DiscoveredFunction[] {
    const sourceFile = ts.createSourceFile(
      path.basename(filePath),
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const functions: DiscoveredFunction[] = [];

    const visit = (node: ts.Node) => {
      // 1. Standard function declaration: function foo(...)
      if (ts.isFunctionDeclaration(node) && node.name) {
        const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const params = node.parameters.map(p => p.name.getText(sourceFile));
        const isExported = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;

        functions.push({
          name: node.name.text,
          kind: "function",
          fileName: path.basename(filePath),
          filePath: relativePath,
          absolutePath: filePath,
          startLine: startLine + 1,
          endLine: endLine + 1,
          parameters: params,
          returnType: node.type ? node.type.getText(sourceFile) : undefined,
          isExported,
          snippet: sourceText.substring(node.getStart(), node.getEnd())
        });
      }

      // 2. Variable statement with arrow function: const foo = (...) => ...
      if (ts.isVariableStatement(node)) {
        const isExported = Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            const funcName = decl.name.getText(sourceFile);
            const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
            const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(decl.getEnd());
            const params = decl.initializer.parameters.map(p => p.name.getText(sourceFile));

            functions.push({
              name: funcName,
              kind: "arrow",
              fileName: path.basename(filePath),
              filePath: relativePath,
              absolutePath: filePath,
              startLine: startLine + 1,
              endLine: endLine + 1,
              parameters: params,
              returnType: decl.initializer.type ? decl.initializer.type.getText(sourceFile) : undefined,
              isExported,
              snippet: sourceText.substring(node.getStart(), node.getEnd())
            });
          }
        }
      }

      // 3. Class methods: class Foo { bar(...) {} }
      if (ts.isMethodDeclaration(node) && node.name) {
        const methodName = node.name.getText(sourceFile);
        const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const params = node.parameters.map(p => p.name.getText(sourceFile));

        functions.push({
          name: methodName,
          kind: "method",
          fileName: path.basename(filePath),
          filePath: relativePath,
          absolutePath: filePath,
          startLine: startLine + 1,
          endLine: endLine + 1,
          parameters: params,
          returnType: node.type ? node.type.getText(sourceFile) : undefined,
          isExported: true,
          snippet: sourceText.substring(node.getStart(), node.getEnd())
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return functions;
  }

  private isTestFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    return (
      normalized.includes(".test.") ||
      normalized.includes(".spec.") ||
      normalized.startsWith("test/") ||
      normalized.startsWith("tests/") ||
      normalized.includes("/__tests__/") ||
      normalized.includes("/tests/") ||
      normalized.includes("/test/")
    );
  }
}
