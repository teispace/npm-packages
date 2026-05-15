import { describe, expect, it } from 'vitest';
import {
  featureBarrelTemplate,
  sliceBarrelTemplate,
} from '../../../src/generators/templates/barrel.template';
import { componentTemplate } from '../../../src/generators/templates/component.template';
import {
  crudApiConfigTemplate,
  crudServiceTemplate,
} from '../../../src/generators/templates/crud-service.template';
import {
  hookWithoutStoreTemplate,
  hookWithStoreTemplate,
} from '../../../src/generators/templates/hook.template';
import { persistTemplate } from '../../../src/generators/templates/persist.template';
import { selectorsTemplate } from '../../../src/generators/templates/selectors.template';
import { serviceTemplate } from '../../../src/generators/templates/service.template';
import { sliceTemplate } from '../../../src/generators/templates/slice.template';
import { stateTypesTemplate } from '../../../src/generators/templates/types.template';

describe('sliceTemplate', () => {
  it('should generate a valid Redux slice', () => {
    const result = sliceTemplate({
      componentName: 'UserDashboard',
      camelName: 'userDashboard',
      sliceName: 'user-dashboard',
      typesImportPath: './user-dashboard.types',
    });

    expect(result).toContain("import { createSlice, type PayloadAction } from '@reduxjs/toolkit'");
    expect(result).toContain("import type { UserDashboardState } from './user-dashboard.types'");
    expect(result).toContain('export const userDashboardSlice = createSlice');
    expect(result).toContain("name: 'userDashboard'");
    expect(result).toContain('export const userDashboardReducer');
  });

  it('should use custom types import path for feature-embedded slices', () => {
    const result = sliceTemplate({
      componentName: 'Auth',
      camelName: 'auth',
      sliceName: 'auth',
      typesImportPath: '../types/auth.types',
    });

    expect(result).toContain("import type { AuthState } from '../types/auth.types'");
  });
});

describe('selectorsTemplate', () => {
  it('should generate selectors with correct state accessor', () => {
    const result = selectorsTemplate({
      componentName: 'Auth',
      camelName: 'auth',
      sliceName: 'auth',
    });

    expect(result).toContain('export const selectAuthState');
    expect(result).toContain('state.auth');
    expect(result).toContain("from './auth.slice'");
  });
});

describe('persistTemplate', () => {
  it('should generate persist config', () => {
    const result = persistTemplate({
      componentName: 'Counter',
      camelName: 'counter',
      sliceName: 'counter',
      typesImportPath: './counter.types',
    });

    expect(result).toContain('PersistConfig<CounterState>');
    expect(result).toContain("key: 'counter'");
    expect(result).toContain('export const counterPersistConfig');
  });
});

describe('serviceTemplate', () => {
  it('should generate axios service', () => {
    const result = serviceTemplate({ camelName: 'userProfile', httpClient: 'axios' });

    expect(result).toContain('axiosClient');
    expect(result).toContain('userProfileService');
    expect(result).toContain('AppApis.userProfile.getAll');
    expect(result).not.toContain('fetchClient');
  });

  it('should generate fetch service', () => {
    const result = serviceTemplate({ camelName: 'userProfile', httpClient: 'fetch' });

    expect(result).toContain('fetchClient');
    expect(result).not.toContain('axiosClient');
  });
});

describe('componentTemplate', () => {
  it('should generate component with hook import', () => {
    const result = componentTemplate({
      componentName: 'UserDashboard',
      hookName: 'useUserDashboard',
    });

    expect(result).toContain("'use client'");
    expect(result).toContain('useUserDashboard');
    expect(result).toContain('function UserDashboard()');
    expect(result).toContain('export default UserDashboard');
  });
});

describe('hookWithStoreTemplate / hookWithoutStoreTemplate', () => {
  it('should generate hook with Redux store', () => {
    const result = hookWithStoreTemplate({
      hookName: 'useAuth',
      componentName: 'Auth',
      featureName: 'auth',
    });

    expect(result).toContain('useAppDispatch');
    expect(result).toContain('useAppSelector');
    expect(result).toContain('selectAuthState');
    expect(result).toContain("from '../store/auth.selectors'");
  });

  it('should generate hook without store', () => {
    const result = hookWithoutStoreTemplate({ hookName: 'useAuth' });

    expect(result).toContain('useState');
    expect(result).not.toContain('useAppDispatch');
  });
});

describe('stateTypesTemplate', () => {
  it('should generate types with store fields', () => {
    const result = stateTypesTemplate({ componentName: 'Auth', withStore: true });

    expect(result).toContain('interface AuthState');
    expect(result).toContain('loading: boolean');
    expect(result).toContain('error: string | null');
  });

  it('should generate empty types without store', () => {
    const result = stateTypesTemplate({ componentName: 'Auth', withStore: false });

    expect(result).toContain('interface AuthState');
    expect(result).not.toContain('loading');
  });
});

describe('barrelTemplates', () => {
  it('should generate slice barrel with persist', () => {
    const result = sliceBarrelTemplate({ sliceName: 'auth', withPersist: true });

    expect(result).toContain("from './auth.slice'");
    expect(result).toContain("from './auth.selectors'");
    expect(result).toContain("from './persist'");
  });

  it('should generate slice barrel without persist', () => {
    const result = sliceBarrelTemplate({ sliceName: 'auth', withPersist: false });

    expect(result).not.toContain('persist');
  });

  it('should generate feature barrel with all options', () => {
    const result = featureBarrelTemplate({
      featureName: 'auth',
      componentName: 'Auth',
      hookName: 'useAuth',
      withStore: true,
      withService: true,
    });

    expect(result).toContain("from './components/Auth'");
    expect(result).toContain("from './hooks/useAuth'");
    expect(result).toContain("from './store'");
    expect(result).toContain("from './services/auth.service'");
  });

  it('should generate minimal feature barrel', () => {
    const result = featureBarrelTemplate({
      featureName: 'auth',
      componentName: 'Auth',
      hookName: 'useAuth',
      withStore: false,
      withService: false,
    });

    expect(result).not.toContain('store');
    expect(result).not.toContain('services');
  });
});

describe('crudApiConfigTemplate', () => {
  it('emits bare-path endpoints — no API_PREFIX interpolation', () => {
    const result = crudApiConfigTemplate({ camelName: 'users', kebabName: 'users' });

    // The /api/v{n} prefix is owned by getApiBaseUrl(), so endpoints are
    // relative to the API base. Interpolating API_PREFIX would double-prefix.
    expect(result).not.toContain('API_PREFIX');
    expect(result).toContain("base: '/users',");
    expect(result).toContain("getAll: '/users',");
    expect(result).toContain("create: '/users',");
  });

  it('emits template literals for id-parameterised endpoints', () => {
    const result = crudApiConfigTemplate({ camelName: 'orders', kebabName: 'orders' });

    // Use `${'$'}` so the test source itself isn't a template-string
    // placeholder — Biome's `noTemplateCurlyInString` otherwise warns.
    const idInterp = `${'$'}{id}`;
    expect(result).toContain(`getById: (id: string) => \`/orders/${idInterp}\`,`);
    expect(result).toContain(`update: (id: string) => \`/orders/${idInterp}\`,`);
    expect(result).toContain(`delete: (id: string) => \`/orders/${idInterp}\`,`);
  });

  it('honours different camelName and kebabName', () => {
    const result = crudApiConfigTemplate({
      camelName: 'orderItems',
      kebabName: 'order-items',
    });

    const idInterp = `${'$'}{id}`;
    // The object key uses camelName; the URL path uses kebabName.
    expect(result).toContain('orderItems: {');
    expect(result).toContain("base: '/order-items',");
    expect(result).toContain(`getById: (id: string) => \`/order-items/${idInterp}\`,`);
  });
});

describe('crudServiceTemplate', () => {
  it('wires the axios client variant', () => {
    const result = crudServiceTemplate({
      camelName: 'users',
      pascalName: 'User',
      httpClient: 'axios',
    });

    expect(result).toContain("import { axiosClient } from '@/lib/utils/http';");
    expect(result).toContain('axiosClient.get<UserSummary[]>(AppApis.users.getAll)');
  });

  it('wires the fetch client variant', () => {
    const result = crudServiceTemplate({
      camelName: 'users',
      pascalName: 'User',
      httpClient: 'fetch',
    });

    expect(result).toContain("import { fetchClient } from '@/lib/utils/http';");
    expect(result).toContain('fetchClient.get<UserSummary[]>(AppApis.users.getAll)');
  });

  it('generates Summary, Detail, Create, and Update types', () => {
    const result = crudServiceTemplate({
      camelName: 'orders',
      pascalName: 'Order',
      httpClient: 'fetch',
    });

    expect(result).toContain('export interface OrderSummary');
    expect(result).toContain('export interface OrderDetail extends OrderSummary');
    expect(result).toContain('export interface CreateOrderDto');
    expect(result).toContain('export interface UpdateOrderDto');
  });
});
