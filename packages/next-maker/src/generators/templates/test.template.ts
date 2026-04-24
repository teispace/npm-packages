export type ComponentTestParams = {
  componentName: string;
  /** Import path from the test file to the component, without extension. */
  sourceImportPath: string;
  /** Import path from the test file to `test/test-utils`, without extension. */
  testUtilsImportPath: string;
  hasRedux: boolean;
  hasI18n: boolean;
};

export const componentTestTemplate = (params: ComponentTestParams): string => {
  const { componentName, sourceImportPath, testUtilsImportPath, hasRedux, hasI18n } = params;

  const extraOptions: string[] = [];
  if (hasI18n) extraOptions.push('messages: {}');
  if (hasRedux) extraOptions.push('preloadedState: {}');
  const optionsBlock = extraOptions.length
    ? `, {\n      ${extraOptions.join(',\n      ')},\n    }`
    : '';

  return `import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '${testUtilsImportPath}';
import { ${componentName} } from '${sourceImportPath}';

describe('${componentName}', () => {
  it('renders without crashing', () => {
    renderWithProviders(<${componentName} />${optionsBlock});
    // TODO: assert something meaningful about the rendered output.
    expect(screen).toBeDefined();
  });
});
`;
};

export type HookTestParams = {
  hookName: string;
  sourceImportPath: string;
  /** When the hook reads from the Redux store, wrap `renderHook` in TestProviders. */
  withStore: boolean;
  /** Only used when withStore is true. */
  testUtilsImportPath?: string;
};

export const hookTestTemplate = (params: HookTestParams): string => {
  const { hookName, sourceImportPath, withStore, testUtilsImportPath } = params;

  if (withStore) {
    return `import { renderHook } from '@testing-library/react';
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

  return `import { renderHook } from '@testing-library/react';
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
import { ${sliceRef}, resetState, setError, setLoading } from '${sourceImportPath}';

describe('${sliceRef}', () => {
  const initialState = { loading: false, error: null } as const;

  it('returns the initial state', () => {
    expect(${sliceRef}.reducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  it('handles setLoading', () => {
    const next = ${sliceRef}.reducer(initialState, setLoading(true));
    expect(next.loading).toBe(true);
  });

  it('handles setError', () => {
    const next = ${sliceRef}.reducer(initialState, setError('boom'));
    expect(next.error).toBe('boom');
  });

  it('handles resetState', () => {
    const next = ${sliceRef}.reducer({ loading: true, error: 'boom' }, resetState());
    expect(next).toEqual(initialState);
  });
});
`;
};
