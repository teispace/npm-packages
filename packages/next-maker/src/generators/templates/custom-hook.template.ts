export const customHookTemplate = (params: { hookName: string; isClient: boolean }): string => {
  const { hookName, isClient } = params;
  const lines: string[] = [];

  if (isClient) {
    lines.push("'use client';");
  }

  lines.push("import { useState, useCallback } from 'react';");
  lines.push('');
  lines.push(`export const ${hookName} = () => {`);
  lines.push('  const [loading, setLoading] = useState(false);');
  lines.push('  const [error, setError] = useState<string | null>(null);');
  lines.push('');
  lines.push('  const execute = useCallback(async () => {');
  lines.push('    setLoading(true);');
  lines.push('    setError(null);');
  lines.push('    try {');
  lines.push('      // Add your logic here');
  lines.push('    } catch (err) {');
  lines.push("      setError(err instanceof Error ? err.message : 'An error occurred');");
  lines.push('    } finally {');
  lines.push('      setLoading(false);');
  lines.push('    }');
  lines.push('  }, []);');
  lines.push('');
  lines.push('  return {');
  lines.push('    loading,');
  lines.push('    error,');
  lines.push('    execute,');
  lines.push('  } as const;');
  lines.push('};');
  lines.push('');

  return lines.join('\n');
};
