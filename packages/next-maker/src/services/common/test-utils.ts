import path from 'node:path';
import { writeFile } from '../../core/files';

export type TestUtilsFeatures = {
  redux: boolean;
  i18n: boolean;
};

/**
 * Emit `test/test-utils.tsx` tailored to the currently-enabled features.
 * Selected between four pre-baked variants so the output stays readable and
 * the cross-feature edge cases (redux-only / i18n-only / neither) produce
 * a file that actually type-checks.
 */
export const writeTestUtils = async (
  projectPath: string,
  features: TestUtilsFeatures,
): Promise<void> => {
  const content = pickTemplate(features);
  await writeFile(path.join(projectPath, 'test/test-utils.tsx'), content);
};

const pickTemplate = ({ redux, i18n }: TestUtilsFeatures): string => {
  if (redux && i18n) return BOTH;
  if (redux) return REDUX_ONLY;
  if (i18n) return I18N_ONLY;
  return MINIMAL;
};

const BOTH = `import { type RenderOptions, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { type AppState, type AppStore, makeStore } from '@/store';
import type { SupportedLocale } from '@/types/i18n';

type TestProvidersProps = {
  children: ReactNode;
  store?: AppStore;
  preloadedState?: Partial<AppState>;
  messages?: Record<string, unknown>;
  locale?: SupportedLocale;
};

export function TestProviders({
  children,
  store,
  preloadedState,
  messages = {},
  locale = 'en',
}: TestProvidersProps) {
  const testStore = store ?? makeStore(preloadedState);

  return (
    <Provider store={testStore}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </Provider>
  );
}

type ExtendedRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  store?: AppStore;
  preloadedState?: Partial<AppState>;
  messages?: Record<string, unknown>;
  locale?: SupportedLocale;
};

export function renderWithProviders(
  ui: ReactElement,
  { store, preloadedState, messages, locale, ...renderOptions }: ExtendedRenderOptions = {},
) {
  const testStore = store ?? makeStore(preloadedState);

  return {
    store: testStore,
    ...render(ui, {
      wrapper: ({ children }) => (
        <TestProviders store={testStore} messages={messages} locale={locale}>
          {children}
        </TestProviders>
      ),
      ...renderOptions,
    }),
  };
}

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
`;

const REDUX_ONLY = `import { type RenderOptions, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { type AppState, type AppStore, makeStore } from '@/store';

type TestProvidersProps = {
  children: ReactNode;
  store?: AppStore;
  preloadedState?: Partial<AppState>;
};

export function TestProviders({ children, store, preloadedState }: TestProvidersProps) {
  const testStore = store ?? makeStore(preloadedState);

  return <Provider store={testStore}>{children}</Provider>;
}

type ExtendedRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  store?: AppStore;
  preloadedState?: Partial<AppState>;
};

export function renderWithProviders(
  ui: ReactElement,
  { store, preloadedState, ...renderOptions }: ExtendedRenderOptions = {},
) {
  const testStore = store ?? makeStore(preloadedState);

  return {
    store: testStore,
    ...render(ui, {
      wrapper: ({ children }) => <TestProviders store={testStore}>{children}</TestProviders>,
      ...renderOptions,
    }),
  };
}

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
`;

const I18N_ONLY = `import { type RenderOptions, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import type { SupportedLocale } from '@/types/i18n';

type TestProvidersProps = {
  children: ReactNode;
  messages?: Record<string, unknown>;
  locale?: SupportedLocale;
};

export function TestProviders({ children, messages = {}, locale = 'en' }: TestProvidersProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

type ExtendedRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  messages?: Record<string, unknown>;
  locale?: SupportedLocale;
};

export function renderWithProviders(
  ui: ReactElement,
  { messages, locale, ...renderOptions }: ExtendedRenderOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders messages={messages} locale={locale}>
        {children}
      </TestProviders>
    ),
    ...renderOptions,
  });
}

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
`;

const MINIMAL = `import { type RenderOptions, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

type TestProvidersProps = {
  children: ReactNode;
};

export function TestProviders({ children }: TestProvidersProps) {
  return <>{children}</>;
}

type ExtendedRenderOptions = Omit<RenderOptions, 'wrapper'>;

export function renderWithProviders(ui: ReactElement, options: ExtendedRenderOptions = {}) {
  return render(ui, {
    wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    ...options,
  });
}

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
`;
