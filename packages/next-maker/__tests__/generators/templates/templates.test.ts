import { describe, expect, it } from 'vitest';
import {
  apiActionsTemplate,
  apiEndpointsTemplate,
  apiKeysTemplate,
  apiQueriesTemplate,
  apiSchemaTemplate,
  apiServerTemplate,
} from '../../../src/generators/templates/api.template';
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
import { sliceTemplate } from '../../../src/generators/templates/slice.template';
import {
  componentTestTemplate,
  sliceTestTemplate,
} from '../../../src/generators/templates/test.template';
import { zustandSliceTemplate } from '../../../src/generators/templates/zustand-slice.template';

const params = { kebabName: 'blog-post', camelName: 'blogPost', pascalName: 'BlogPost' };

describe('api templates', () => {
  it('schema infers types from zod', () => {
    const out = apiSchemaTemplate(params);
    expect(out).toContain('export const blogPostSchema = z.object({');
    expect(out).toContain('export type BlogPost = z.infer<typeof blogPostSchema>;');
    expect(out).toContain('export const createBlogPostInputSchema');
  });

  it('server DAL is server-only and uses the cookie-forwarding client with schema validation', () => {
    const out = apiServerTemplate(params);
    expect(out).toContain("import 'server-only';");
    expect(out).toContain('serverHttp.get(AppApis.blogPost.list, { schema: blogPostListSchema })');
    expect(out).toContain("export const BLOGPOST_TAG = 'blogPost';");
  });

  it('actions use authActionClient with input schemas and revalidate the tag', () => {
    const out = apiActionsTemplate(params);
    expect(out).toContain("'use server';");
    expect(out).toContain('authActionClient');
    expect(out).toContain('.inputSchema(createBlogPostInputSchema)');
    expect(out).toContain("revalidateTag(BLOGPOST_TAG, 'max')");
  });

  it('queries expose queryOptions and suspense hooks keyed by the feature', () => {
    const out = apiQueriesTemplate(params);
    expect(out).toContain('queryOptions({');
    expect(out).toContain('queryKey: blogPostKeys.list()');
    expect(out).toContain(
      'export const useBlogPostList = () => useSuspenseQuery(blogPostListQuery());',
    );
    expect(apiKeysTemplate(params)).toContain("all: ['blog-post'] as const");
  });

  it('endpoints are bare paths under the API prefix', () => {
    const out = apiEndpointsTemplate(params);
    expect(out).toContain("list: '/blog-post'");
    expect(out).toContain('detail: (id: string) => `/blog-post/${id}`');
  });
});

describe('store templates', () => {
  it('redux slice, selectors, and definePersistence entry', () => {
    const slice = sliceTemplate({
      componentName: 'Cart',
      camelName: 'cart',
      typesImportPath: './cart.types',
    });
    expect(slice).toContain("import { createSlice, type PayloadAction } from '@reduxjs/toolkit';");
    expect(slice).toContain('export const cartSlice = createSlice({');
    expect(slice).toContain('export const { started, failed, reset } = cartSlice.actions;');
    expect(
      selectorsTemplate({ componentName: 'Cart', camelName: 'cart', sliceName: 'cart' }),
    ).toContain('state.cart.status');
    const persist = persistTemplate({
      componentName: 'Cart',
      camelName: 'cart',
      typesImportPath: './cart.types',
    });
    expect(persist).toContain("import { definePersistence } from '@/store/persistence';");
    expect(persist).toContain('export const cartPersistence = definePersistence<CartState>({');
    expect(persist).not.toContain('redux-persist');
  });

  it('zustand slice creator', () => {
    const out = zustandSliceTemplate({
      componentName: 'Cart',
      camelName: 'cart',
      typesImportPath: './cart.types',
    });
    expect(out).toContain("import type { StateCreator } from 'zustand';");
    expect(out).toContain('export const createCartSlice: StateCreator<any, [], [], CartSlice>');
    expect(sliceBarrelTemplate({ sliceName: 'cart', withPersist: false, state: 'zustand' })).toBe(
      "export * from './cart.store';\n",
    );
  });

  it('barrels include persistence only when asked', () => {
    expect(sliceBarrelTemplate({ sliceName: 'cart', withPersist: true })).toContain(
      "export * from './persist';",
    );
    expect(sliceBarrelTemplate({ sliceName: 'cart', withPersist: false })).not.toContain('persist');
  });
});

describe('hooks and components', () => {
  it('redux and zustand store hooks', () => {
    const redux = hookWithStoreTemplate({
      hookName: 'useCart',
      componentName: 'Cart',
      featureName: 'cart',
      state: 'redux',
    });
    expect(redux).toContain("import { useAppDispatch, useAppSelector } from '@/store/hooks';");
    const zustand = hookWithStoreTemplate({
      hookName: 'useCart',
      componentName: 'Cart',
      featureName: 'cart',
      state: 'zustand',
    });
    expect(zustand).toContain("import { useAppStore } from '@/store/hooks';");
    expect(hookWithoutStoreTemplate({ hookName: 'useCart' })).toContain(
      'export const useCart = () => {',
    );
  });

  it('api-backed component reads the suspense hook; i18n adds translations', () => {
    const out = componentTemplate({
      componentName: 'CartList',
      hookName: 'useCart',
      withApi: true,
      pascalName: 'Cart',
      hasI18n: true,
    });
    expect(out).toContain("import { useCartList } from '../api/queries';");
    expect(out).toContain("useTranslations('Cart')");
    const plain = componentTemplate({
      componentName: 'Cart',
      hookName: 'useCart',
      withApi: false,
      pascalName: 'Cart',
      hasI18n: false,
    });
    expect(plain).toContain("import { useCart } from '../hooks/useCart';");
    expect(plain).not.toContain('next-intl');
  });

  it('feature barrel exports the api surface and the server barrel is server-only', () => {
    const out = featureBarrelTemplate({
      featureName: 'cart',
      componentName: 'CartList',
      hookName: 'useCart',
      pascalName: 'Cart',
      withStore: true,
      withApi: true,
    });
    expect(out).toContain("export { createCart, deleteCart, updateCart } from './api/actions';");
    expect(out).toContain(
      "export { cartListQuery, cartQuery, useCart, useCartList } from './api/queries';",
    );
    expect(out).toContain("export * from './store';");
  });
});

describe('test templates', () => {
  it('seeds hydrated query data for api components', () => {
    const out = componentTestTemplate({
      componentName: 'CartList',
      sourceImportPath: './CartList',
      testUtilsImportPath: '../../../../test/test-utils',
      hasState: true,
      hasI18n: true,
      withQueryData: { keysImport: '../api/keys', keys: 'cartKeys', key: 'list' },
    });
    expect(out).toContain('queryClient.setQueryData(cartKeys.list(), [');
    expect(out).toContain('{ queryClient, messages: {}, preloadedState: {} }');
  });

  it('slice test exercises the generated reducers', () => {
    const out = sliceTestTemplate({ camelName: 'cart', sourceImportPath: './cart.slice' });
    expect(out).toContain("import { failed, reset, cartSlice, started } from './cart.slice';");
  });
});
