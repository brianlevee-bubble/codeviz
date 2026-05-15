export type TestRunner = 'jest' | 'vitest' | 'playwright' | 'cypress' | 'none';

export type TestCategory = 'unit' | 'component' | 'api' | 'integration' | 'e2e';
export type TestPriority = 'high' | 'medium' | 'low';

export interface ExistingTestFile {
  relativePath: string;
  absPath: string;
  sizeBytes: number;
}

export interface TestSuggestion {
  id: string;
  title: string;
  description: string;
  /** suggested file path relative to project root, e.g. __tests__/api/users.test.ts */
  file: string;
  code: string;
  category: TestCategory;
  targetFile?: string;
  priority: TestPriority;
}

export interface TestsAnalysis {
  runner: TestRunner;
  /** e.g. "npx vitest run" or "npx jest --testPathPattern=" */
  runAllCommand: string;
  /** test script from package.json scripts.test, if any */
  packageTestScript: string | null;
  existingTests: ExistingTestFile[];
  suggestions: TestSuggestion[];
}

export type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error';

export interface TestRunEvent {
  type: 'line' | 'done' | 'error';
  text?: string;
  exitCode?: number;
}
