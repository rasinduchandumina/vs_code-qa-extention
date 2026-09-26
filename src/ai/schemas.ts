import { z } from "zod";

/**
 * Schema for an individual suggested test case scenario with traceability.
 */
export const TestCaseSchema = z.object({
  id: z.string().describe("Unique identifier for this test case (e.g., tc-1)"),
  title: z.string().describe("Short descriptive title of the test case"),
  type: z.enum(["positive", "negative", "edge", "security"]).describe("The category of test case"),
  priority: z.enum(["high", "medium", "low"]).describe("Priority for implementation"),
  description: z.string().describe("Detailed description of the test scenario and goal"),
  inputConditions: z.string().describe("Given inputs, mock data, or preconditions"),
  expectedResult: z.string().describe("Expected behavior, returned value, or assertion"),
  requirementId: z.string().optional().describe("Associated requirement ID for traceability (e.g., REQ-001)"),
  approved: z.boolean().default(false).describe("Whether the human developer has approved this test")
});

export type TestCase = z.infer<typeof TestCaseSchema>;

/**
 * Batch schema returned by the LLM when generating test cases for a target function/class.
 * Includes quality scoring metrics.
 */
export const TestCaseBatchSchema = z.object({
  targetFunction: z.string().describe("The name of the function or method analyzed"),
  targetFile: z.string().describe("The relative path of the file analyzed"),
  summary: z.string().describe("A concise summary of the functionality analyzed"),
  qualityScore: z.number().min(0).max(100).default(90).describe("Overall test quality score out of 100"),
  qualityGrade: z.enum(["A+", "A", "B", "C", "D"]).default("A").describe("Letter grade for test quality"),
  testCases: z.array(TestCaseSchema).describe("List of suggested test scenarios")
});

export type TestCaseBatch = z.infer<typeof TestCaseBatchSchema>;

/**
 * Schema for generated test code.
 */
export const GeneratedTestCodeSchema = z.object({
  framework: z.enum(["vitest", "jest", "playwright"]).describe("The test framework used"),
  targetFile: z.string().describe("Source file this test targets"),
  suggestedTestFilePath: z.string().describe("Suggested destination path for the test file"),
  code: z.string().describe("Executable test code implementation"),
  imports: z.array(z.string()).describe("Required imports for this test file")
});

export type GeneratedTestCode = z.infer<typeof GeneratedTestCodeSchema>;

/**
 * Schema for AI failure analysis with categorization.
 */
export const FailureAnalysisSchema = z.object({
  testName: z.string().describe("Name of the failing test"),
  failureCategory: z.enum([
    "AssertionError",
    "TimeoutError",
    "TypeError",
    "ReferenceError",
    "CompilationError",
    "RuntimeCrash"
  ]).default("AssertionError").describe("Classified category of test failure"),
  likelyCause: z.string().describe("Most probable root cause for the failure"),
  relevantSourceFile: z.string().describe("The source code file likely responsible for the bug"),
  relevantLine: z.number().nullable().optional().describe("Line number if identifiable"),
  evidence: z.string().describe("Evidence from stack trace, logs, or code pointing to this cause"),
  suggestedFix: z.string().describe("Concrete recommendation for how to fix or investigate"),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence level of this diagnosis")
});

export type FailureAnalysis = z.infer<typeof FailureAnalysisSchema>;

/**
 * Schema for AI automated test repair ("Self-Healing Tests").
 */
export const RepairedTestCodeSchema = z.object({
  testFile: z.string().describe("Relative path to the test file repaired"),
  explanation: z.string().describe("Clear summary of what was broken and how it was repaired"),
  repairedCode: z.string().describe("Complete repaired test file source code"),
  changesMade: z.array(z.string()).describe("List of specific changes made to repair the test")
});

export type RepairedTestCode = z.infer<typeof RepairedTestCodeSchema>;

/**
 * Standard defect record for defect creation and export.
 */
export interface DefectReport {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  testName: string;
  failingFile: string;
  relevantSourceFile: string;
  relevantLine?: number | null;
  likelyCause: string;
  evidence: string;
  suggestedFix: string;
  createdAt: string;
  environment: string;
}
