export type ComponentTestParams = {
  componentName: string;
  /** Import path from the test file to the component, without extension. */
  sourceImportPath: string;
  /** Import path from the test file to `test/test-utils`, without extension. */
  testUtilsImportPath: string;
  /** Whether a client store (Redux or Zustand) is present. */
  hasState: boolean;
  hasI18n: boolean;
  /** For components that read a hydrated query: seed the cache instead of mocking HTTP. */
  withQueryData?: { keysImport: string; keys: string; key: string };
};

export const componentTestTemplate = (params: ComponentTestParams): string => {
  const { componentName, sourceImportPath, testUtilsImportPath, hasState, hasI18n, withQueryData } =
    params;

  const options: string[] = [];
  if (hasI18n) options.push('messages: {}');
  if (hasState) options.push('preloadedState: {}');

  if (withQueryData) {
    return `import { describe, expect, it } from 'vitest';

import { makeTestQueryClient, renderWithProviders, screen } from '${testUtilsImportPath}';
import { ${withQueryData.keys} } from '${withQueryData.keysImport}';
import { ${componentName} } from '${sourceImportPath}';

describe('${componentName}', () => {
  it('renders hydrated data', () => {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(${withQueryData.keys}.${withQueryData.key}(), [
      { id: '1', title: 'First', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    renderWithProviders(<${componentName} />, { queryClient${options.length ? `, ${options.join(', ')}` : ''} });
    expect(screen.getByText('First')).toBeInTheDocument();
  });
});
`;
  }

  const optionsBlock = options.length ? `, { ${options.join(', ')} }` : '';
  return `import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '${testUtilsImportPath}';
import { ${componentName} } from '${sourceImportPath}';

describe('${componentName}', () => {
  it('renders', () => {
    renderWithProviders(<${componentName} />${optionsBlock});
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });
});
`;
};

export type HookTestParams = {
  hookName: string;
  sourceImportPath: string;
  /** When the hook reads from the store, wrap `renderHook` in TestProviders. */
  withStore: boolean;
  /** Only used when withStore is true. */
  testUtilsImportPath?: string;
};

export const hookTestTemplate = (params: HookTestParams): string => {
  const { hookName, sourceImportPath, withStore, testUtilsImportPath } = params;

  if (withStore) {
    return `// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TestProviders } from '${testUtilsImportPath}';
import { ${hookName} } from '${sourceImportPath}';

describe('${hookName}', () => {
  it('returns a defined value', () => {
    const { result } = renderHook(() => ${hookName}(), { wrapper: TestProviders });
    expect(result.current).toBeDefined();
  });
});
`;
  }

  return `// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ${hookName} } from '${sourceImportPath}';

describe('${hookName}', () => {
  it('returns a defined value', () => {
    const { result } = renderHook(() => ${hookName}());
    expect(result.current).toBeDefined();
  });
});
`;
};

export type SliceTestParams = {
  /** e.g. `counter` */
  camelName: string;
  /** Import path from the test file to the `.slice` file, without extension. */
  sourceImportPath: string;
};

export const sliceTestTemplate = (params: SliceTestParams): string => {
  const { camelName, sourceImportPath } = params;
  const sliceRef = `${camelName}Slice`;

  return `import { describe, expect, it } from 'vitest';

import { failed, reset, ${sliceRef}, started } from '${sourceImportPath}';

describe('${sliceRef}', () => {
  const initialState = { status: 'idle', error: null } as const;

  it('returns the initial state', () => {
    expect(${sliceRef}.reducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  it('tracks a start and a failure', () => {
    const loading = ${sliceRef}.reducer(initialState, started());
    expect(loading.status).toBe('loading');
    const errored = ${sliceRef}.reducer(loading, failed('boom'));
    expect(errored).toEqual({ status: 'error', error: 'boom' });
  });

  it('resets', () => {
    expect(${sliceRef}.reducer({ status: 'error', error: 'boom' }, reset())).toEqual(initialState);
  });
});
`;
};
