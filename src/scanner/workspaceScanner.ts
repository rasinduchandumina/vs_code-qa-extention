import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import * as ts from "typescript";

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
}

export interface DiscoveredFile {
  relativePath: string;
  absolutePath: string;
  functions: DiscoveredFunction[];
  isTestFile: boolean;
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
}

export class WorkspaceScanner {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Performs a full scan of the workspace.
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

    return {
      rootPath: this.workspaceRoot,
      framework: projectFramework.framework,
      testFramework: projectFramework.testFramework,
      sourceFilesCount: files.filter(f => !f.isTestFile).length,
      testFilesCount: existingTests.length,
      functionsCount,
      files,
      existingTests
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
