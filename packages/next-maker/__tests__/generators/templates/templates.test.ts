import { describe, expect, it } from 'vitest';
import {
  featureBarrelTemplate,
  sliceBarrelTemplate,
} from '../../../src/generators/templates/barrel.template';
import { componentTemplate } from '../../../src/generators/templates/component.template';
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
