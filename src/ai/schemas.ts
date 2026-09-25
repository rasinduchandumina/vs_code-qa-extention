import { z } from "zod";

/**
 * Schema for an individual suggested test case scenario.
 */
export const TestCaseSchema = z.object({
  id: z.string().describe("Unique identifier for this test case (e.g., tc-1)"),
  title: z.string().describe("Short descriptive title of the test case"),
  type: z.enum(["positive", "negative", "edge", "security"]).describe("The category of test case"),
  priority: z.enum(["high", "medium", "low"]).describe("Priority for implementation"),
  description: z.string().describe("Detailed description of the test scenario and goal"),
  inputConditions: z.string().describe("Given inputs, mock data, or preconditions"),
  expectedResult: z.string().describe("Expected behavior, returned value, or assertion"),
  approved: z.boolean().default(false).describe("Whether the human developer has approved this test")
});

export type TestCase = z.infer<typeof TestCaseSchema>;

/**
 * Batch schema returned by the LLM when generating test cases for a target function/class.
 */
export const TestCaseBatchSchema = z.object({
  targetFunction: z.string().describe("The name of the function or method analyzed"),
  targetFile: z.string().describe("The relative path of the file analyzed"),
  summary: z.string().describe("A concise summary of the functionality analyzed"),
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
 * Schema for AI failure analysis.
 */
export const FailureAnalysisSchema = z.object({
  testName: z.string().describe("Name of the failing test"),
  likelyCause: z.string().describe("Most probable root cause for the failure"),
  relevantSourceFile: z.string().describe("The source code file likely responsible for the bug"),
  relevantLine: z.number().nullable().optional().describe("Line number if identifiable"),
  evidence: z.string().describe("Evidence from stack trace, logs, or code pointing to this cause"),
  suggestedFix: z.string().describe("Concrete recommendation for how to fix or investigate"),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence level of this diagnosis")
});

export type FailureAnalysis = z.infer<typeof FailureAnalysisSchema>;
