import { describe, expect, it } from 'vitest';
import {
  addImportStatement,
  addToAppApis,
  addToCombineReducers,
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

describe('addToCombineReducers', () => {
  it('should add a reducer entry to combineReducers', () => {
    const content = `const rootReducer = combineReducers({
  auth: authReducer,
})`;
    const result = addToCombineReducers(content, 'counter', 'counterReducer');

    expect(result).toContain('counter: counterReducer,');
    expect(result).toContain('auth: authReducer,');
  });

  it('should add to empty combineReducers', () => {
    const content = `const rootReducer = combineReducers({})`;
    const result = addToCombineReducers(content, 'auth', 'authReducer');

    expect(result).toContain('auth: authReducer,');
  });

  it('should add persistReducer entry', () => {
    const content = `const rootReducer = combineReducers({
  auth: authReducer,
})`;
    const result = addToCombineReducers(
      content,
      'counter',
      'persistReducer(counterPersistConfig, counterReducer)',
    );

    expect(result).toContain('counter: persistReducer(counterPersistConfig, counterReducer),');
  });

  it('should throw when combineReducers not found', () => {
    const content = `const rootReducer = {};`;
    expect(() => addToCombineReducers(content, 'auth', 'authReducer')).toThrow(
      'Could not find combineReducers',
    );
  });
});

describe('addToAppApis', () => {
  it('should insert endpoint before closing brace', () => {
    const content = `export const AppApis = {
  auth: {
    base: \`\${API_PREFIX}/auth\`,
    login: \`\${API_PREFIX}/auth/login\`,
  },
} as const;
`;
    const endpoint = `  users: {
    base: \`\${API_PREFIX}/users\`,
    getAll: \`\${API_PREFIX}/users\`,
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
