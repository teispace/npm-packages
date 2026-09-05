import { describe, expect, it } from 'vitest';
import {
  addImportStatement,
  addToAppApis,
  addToCombineSlices,
  addToPersistenceEntries,
} from '../../src/modifiers/helpers';

describe('addImportStatement', () => {
  it('should append after the last import', () => {
    const content = `import { combineReducers } from '@reduxjs/toolkit';
import { persistReducer } from 'redux-persist';

const rootReducer = combineReducers({});
`;
    const result = addImportStatement(
      content,
      "import { authReducer } from '@/features/auth/store';",
    );

    expect(result).toContain("import { persistReducer } from 'redux-persist';");
    expect(result).toContain("import { authReducer } from '@/features/auth/store';");
    // New import should be after the last existing import
    const persistIndex = result.indexOf("from 'redux-persist'");
    const authIndex = result.indexOf("from '@/features/auth/store'");
    expect(authIndex).toBeGreaterThan(persistIndex);
  });

  it('should prepend when no imports exist', () => {
    const content = `const rootReducer = combineReducers({});\n`;
    const result = addImportStatement(
      content,
      "import { authReducer } from '@/features/auth/store';",
    );

    expect(result).toMatch(/^import \{ authReducer \}/);
  });

  it('should handle single import in file', () => {
    const content = `import { combineReducers } from '@reduxjs/toolkit';

export const rootReducer = combineReducers({});
`;
    const result = addImportStatement(content, "import { fooReducer } from '@/features/foo';");

    expect(result).toContain("import { fooReducer } from '@/features/foo';");
    const combineIndex = result.indexOf("from '@reduxjs/toolkit'");
    const fooIndex = result.indexOf("from '@/features/foo'");
    expect(fooIndex).toBeGreaterThan(combineIndex);
  });
});

describe('addToCombineSlices', () => {
  it('inserts the slice before persistSlice', () => {
    const content = 'export const rootReducer = combineSlices(counterSlice, persistSlice);\n';
    const out = addToCombineSlices(content, 'cartSlice');
    expect(out).toContain('combineSlices(counterSlice, cartSlice, persistSlice)');
  });

  it('is idempotent and appends when persistSlice is absent', () => {
    const once = addToCombineSlices('combineSlices(a)', 'b');
    expect(once).toBe('combineSlices(a, b)');
    expect(addToCombineSlices(once, 'b')).toBe(once);
  });

  it('handles the multi-line form and throws when the call is missing', () => {
    const multi = 'combineSlices(\n  counterSlice,\n  wsSlice,\n  persistSlice,\n)';
    expect(addToCombineSlices(multi, 'cartSlice')).toContain(
      'combineSlices(counterSlice, wsSlice, cartSlice, persistSlice)',
    );
    expect(() => addToCombineSlices('nothing here', 'x')).toThrow(/combineSlices/);
  });
});

describe('addToPersistenceEntries', () => {
  it('appends an entry once', () => {
    const content = 'createPersistence({ entries: [countPersistence], prefix: "app" })';
    const out = addToPersistenceEntries(content, 'cartPersistence');
    expect(out).toContain('entries: [countPersistence, cartPersistence]');
    expect(addToPersistenceEntries(out, 'cartPersistence')).toBe(out);
  });
});

describe('addToAppApis', () => {
  it('should insert endpoint before closing brace', () => {
    const content = `export const AppApis = {
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh',
  },
} as const;
`;
    const endpoint = `  users: {
    base: '/users',
    getAll: '/users',
  },`;

    const result = addToAppApis(content, endpoint);

    expect(result).toContain('users:');
    expect(result).toContain('} as const;');
    // endpoint should be before the closing
    const usersIndex = result.indexOf('users:');
    const closingIndex = result.indexOf('} as const;');
    expect(usersIndex).toBeLessThan(closingIndex);
  });

  it('should throw when closing brace not found', () => {
    const content = `export const AppApis = {};`;
    expect(() => addToAppApis(content, 'test')).toThrow('Could not find closing brace');
  });
});
