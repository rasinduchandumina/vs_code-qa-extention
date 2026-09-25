import * as vscode from "vscode";
import { DiscoveredFunction, DiscoveredFile, ProjectAnalysis } from "../scanner/workspaceScanner";
import { TestCase, TestCaseBatch } from "../ai/schemas";

export type TreeItemData = 
  | { kind: "projectInfo"; title: string; subtitle: string }
  | { kind: "file"; file: DiscoveredFile }
  | { kind: "function"; func: DiscoveredFunction }
  | { kind: "testCase"; testCase: TestCase; batch: TestCaseBatch }
  | { kind: "testFile"; relativePath: string };

export class TestTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data: TreeItemData
  ) {
    super(label, collapsibleState);

    switch (data.kind) {
      case "projectInfo":
        this.description = data.subtitle;
        this.iconPath = new vscode.ThemeIcon("info");
        break;

      case "file":
        this.description = `${data.file.functions.length} functions`;
        this.iconPath = vscode.ThemeIcon.File;
        this.tooltip = data.file.relativePath;
        break;

      case "function":
        this.description = `L${data.func.startLine}-${data.func.endLine} (${data.func.parameters.join(", ") || "void"})`;
        this.iconPath = new vscode.ThemeIcon("symbol-function");
        this.contextValue = "discoveredFunction";
        this.command = {
          command: "vscode.open",
          title: "Open File",
          arguments: [
            vscode.Uri.file(data.func.absolutePath || data.func.filePath),
            { selection: new vscode.Range(data.func.startLine - 1, 0, data.func.startLine - 1, 0) }
          ]
        };
        break;

      case "testCase":
        const iconName = data.testCase.approved ? "pass-filled" : "circle-large-outline";
        this.iconPath = new vscode.ThemeIcon(iconName);
        this.description = `[${data.testCase.type.toUpperCase()}] Priority: ${data.testCase.priority}`;
        this.tooltip = `${data.testCase.description}\n\nInputs: ${data.testCase.inputConditions}\nExpected: ${data.testCase.expectedResult}`;
        this.contextValue = "aiTestCase";
        break;

      case "testFile":
        this.iconPath = new vscode.ThemeIcon("beaker");
        this.tooltip = `Existing test: ${data.relativePath}`;
        break;
    }
  }
}

export class WorkspaceTreeProvider implements vscode.TreeDataProvider<TestTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TestTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private analysis: ProjectAnalysis | null = null;

  public refresh(analysis: ProjectAnalysis | null): void {
    this.analysis = analysis;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TestTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TestTreeItem): Promise<TestTreeItem[]> {
    if (!this.analysis) {
      return [
        new TestTreeItem("Run 'AI Testing: Scan Project' to start", vscode.TreeItemCollapsibleState.None, {
          kind: "projectInfo",
          title: "Not scanned",
          subtitle: "No data"
        })
      ];
    }

    if (!element) {
      // Root level items
      const items: TestTreeItem[] = [];

      items.push(
        new TestTreeItem(
          `Project (${this.analysis.framework || "Standard TS/JS"})`,
          vscode.TreeItemCollapsibleState.None,
          {
            kind: "projectInfo",
            title: "Framework",
            subtitle: `Test Runner: ${this.analysis.testFramework || "none detected"}`
          }
        )
      );

      items.push(
        new TestTreeItem(
          `Scanned Source Files (${this.analysis.sourceFilesCount})`,
          vscode.TreeItemCollapsibleState.Expanded,
          {
            kind: "projectInfo",
            title: "Sources",
            subtitle: `${this.analysis.functionsCount} total functions detected`
          }
        )
      );

      if (this.analysis.existingTests.length > 0) {
        items.push(
          new TestTreeItem(
            `Existing Tests (${this.analysis.existingTests.length})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            {
              kind: "projectInfo",
              title: "Existing Tests",
              subtitle: ""
            }
          )
        );
      }

      return items;
    }

    if (element.label.startsWith("Scanned Source Files")) {
      return this.analysis.files
        .filter(f => !f.isTestFile && f.functions.length > 0)
        .map(f => new TestTreeItem(f.relativePath, vscode.TreeItemCollapsibleState.Collapsed, {
          kind: "file",
          file: f
        }));
    }

    if (element.data.kind === "file") {
      return element.data.file.functions.map(fn => 
        new TestTreeItem(fn.name, vscode.TreeItemCollapsibleState.None, {
          kind: "function",
          func: fn
        })
      );
    }

    if (element.label.startsWith("Existing Tests")) {
      return this.analysis.existingTests.map(t => 
        new TestTreeItem(t, vscode.TreeItemCollapsibleState.None, {
          kind: "testFile",
          relativePath: t
        })
      );
    }

    return [];
  }
}

export class SuggestedCasesTreeProvider implements vscode.TreeDataProvider<TestTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TestTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentBatch: TestCaseBatch | null = null;

  public setBatch(batch: TestCaseBatch | null): void {
    this.currentBatch = batch;
    this._onDidChangeTreeData.fire();
  }

  public getBatch(): TestCaseBatch | null {
    return this.currentBatch;
  }

  public toggleApproval(testCaseId: string): void {
    if (!this.currentBatch) return;
    const tc = this.currentBatch.testCases.find(t => t.id === testCaseId);
    if (tc) {
      tc.approved = !tc.approved;
      this._onDidChangeTreeData.fire();
    }
  }

  public approveAll(): void {
    if (!this.currentBatch) return;
    this.currentBatch.testCases.forEach(t => (t.approved = true));
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TestTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TestTreeItem): Promise<TestTreeItem[]> {
    if (!this.currentBatch) {
      return [
        new TestTreeItem("No test cases generated yet", vscode.TreeItemCollapsibleState.None, {
          kind: "projectInfo",
          title: "Empty",
          subtitle: "Select a function to analyze"
        })
      ];
    }

    if (!element) {
      const header = new TestTreeItem(
        `Function: ${this.currentBatch.targetFunction}`,
        vscode.TreeItemCollapsibleState.None,
        {
          kind: "projectInfo",
          title: this.currentBatch.targetFunction,
          subtitle: this.currentBatch.summary
        }
      );

      const caseItems = this.currentBatch.testCases.map(tc => 
        new TestTreeItem(tc.title, vscode.TreeItemCollapsibleState.None, {
          kind: "testCase",
          testCase: tc,
          batch: this.currentBatch!
        })
      );

      return [header, ...caseItems];
    }

    return [];
  }
}
