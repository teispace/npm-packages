import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock every setup service so the handlers are observable spies and nothing
// touches the filesystem.
const spies = {
  setupHttpClient: vi.fn(async () => {}),
  setupDarkTheme: vi.fn(async () => {}),
  setupRedux: vi.fn(async () => {}),
  setupWs: vi.fn(async () => {}),
  setupI18n: vi.fn(async () => {}),
  setupTests: vi.fn(async () => {}),
  setupReactCompiler: vi.fn(async () => {}),
  setupBundleAnalyzer: vi.fn(async () => {}),
  setupSecurityHeaders: vi.fn(async () => {}),
  setupValidationScripts: vi.fn(async () => {}),
  setupCommitizen: vi.fn(async () => {}),
};

vi.mock('../../src/services/setup/http-client', () => ({ setupHttpClient: spies.setupHttpClient }));
vi.mock('../../src/services/setup/dark-theme', () => ({ setupDarkTheme: spies.setupDarkTheme }));
vi.mock('../../src/services/setup/redux', () => ({ setupRedux: spies.setupRedux }));
vi.mock('../../src/services/setup/ws', () => ({ setupWs: spies.setupWs }));
vi.mock('../../src/services/setup/i18n', () => ({ setupI18n: spies.setupI18n }));
vi.mock('../../src/services/setup/tests', () => ({ setupTests: spies.setupTests }));
vi.mock('../../src/services/setup/react-compiler', () => ({
  setupReactCompiler: spies.setupReactCompiler,
}));
vi.mock('../../src/services/setup/bundle-analyzer', () => ({
  setupBundleAnalyzer: spies.setupBundleAnalyzer,
}));
vi.mock('../../src/services/setup/security-headers', () => ({
  setupSecurityHeaders: spies.setupSecurityHeaders,
}));
vi.mock('../../src/services/setup/validate-scripts', () => ({
  setupValidationScripts: spies.setupValidationScripts,
}));
vi.mock('../../src/services/setup/commitizen', () => ({ setupCommitizen: spies.setupCommitizen }));

// Silence the wizard's console output.
vi.mock('../../src/config', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  spinner: { fail: vi.fn(), succeed: vi.fn(), start: vi.fn(), stop: vi.fn() },
}));

const { runSetup, SETUP_FEATURES } = await import('../../src/commands/setup');

// Map each feature key to the spy that backs its handler. Keyed explicitly
// rather than via fn.name, since the mocked handlers are anonymous vi.fns.
const SPY_BY_KEY: Record<string, ReturnType<typeof vi.fn>> = {
  'http-client': spies.setupHttpClient,
  'dark-theme': spies.setupDarkTheme,
  redux: spies.setupRedux,
  ws: spies.setupWs,
  i18n: spies.setupI18n,
  tests: spies.setupTests,
  'react-compiler': spies.setupReactCompiler,
  'bundle-analyzer': spies.setupBundleAnalyzer,
  'security-headers': spies.setupSecurityHeaders,
  'validate-scripts': spies.setupValidationScripts,
  commitizen: spies.setupCommitizen,
};
const handlerFor = (key: string) => SPY_BY_KEY[key];

beforeEach(() => {
  for (const spy of Object.values(spies)) spy.mockClear();
});

describe('runSetup interactive dispatch', () => {
  it('has a spy registered for every feature (test stays in sync with SETUP_FEATURES)', () => {
    for (const f of SETUP_FEATURES) expect(SPY_BY_KEY[f.key]).toBeTypeOf('function');
  });

  // The original bug: choices returned the human label but the handler map was
  // keyed by machine values, so every selection fell through to "not
  // implemented yet". This test fails on that regression for every feature.
  it.each(
    SETUP_FEATURES.map((f) => f.key),
  )('dispatches the handler when "%s" is selected', async (key) => {
    const promptFn = vi.fn(async () => ({ feature: key })) as never;
    const result = await runSetup({}, { promptFn, cwd: () => '/proj' });

    expect(result).toBe(key);
    expect(handlerFor(key)).toHaveBeenCalledExactlyOnceWith('/proj');
    // No other handler should fire.
    for (const f of SETUP_FEATURES) {
      if (f.key !== key) expect(handlerFor(f.key)).not.toHaveBeenCalled();
    }
  });

  it('offers a choice for every feature plus cancel, with name = machine key', async () => {
    const promptFn = vi.fn(async () => ({ feature: 'cancel' })) as never;
    await runSetup({}, { promptFn });

    const question = (promptFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    const choiceNames = question.choices.map((c: { name: string }) => c.name);
    expect(choiceNames).toEqual([...SETUP_FEATURES.map((f) => f.key), 'cancel']);
  });

  it('returns null and runs nothing on cancel', async () => {
    const promptFn = vi.fn(async () => ({ feature: 'cancel' })) as never;
    const result = await runSetup({}, { promptFn });
    expect(result).toBeNull();
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });
});

describe('runSetup flag dispatch', () => {
  it('runs a single flagged feature without prompting', async () => {
    const promptFn = vi.fn() as never;
    const result = await runSetup({ darkTheme: true }, { promptFn, cwd: () => '/proj' });

    expect(result).toBe('dark-theme');
    expect(spies.setupDarkTheme).toHaveBeenCalledExactlyOnceWith('/proj');
    expect(promptFn).not.toHaveBeenCalled();
  });

  it('runs redux before ws when both flags are passed', async () => {
    const order: string[] = [];
    spies.setupRedux.mockImplementationOnce(async () => {
      order.push('redux');
    });
    spies.setupWs.mockImplementationOnce(async () => {
      order.push('ws');
    });

    await runSetup({ ws: true, redux: true }, { cwd: () => '/proj' });
    expect(order).toEqual(['redux', 'ws']);
  });
});
