import { describe, expect, it } from 'vitest';
import { BaseExtension } from '../../src/core/extension.js';
import type { ExtensionConfig } from '../../src/core/types.js';

// Test extension
interface TestConfig extends ExtensionConfig {
  color: string;
  size: number;
}

class TestExtension extends BaseExtension<TestConfig> {
  readonly name = 'test';
  protected readonly defaults: TestConfig = { color: 'red', size: 16 };
}

describe('BaseExtension', () => {
  it('has a name', () => {
    const ext = new TestExtension();
    expect(ext.name).toBe('test');
  });

  it('provides default config', () => {
    const ext = new TestExtension();
    expect(ext.config).toEqual({ color: 'red', size: 16 });
  });

  it('configure() returns a new instance', () => {
    const ext = new TestExtension();
    const configured = ext.configure({ color: 'blue' });

    expect(configured).not.toBe(ext);
    expect(configured.config.color).toBe('blue');
    expect(configured.config.size).toBe(16); // default preserved
  });

  it('configure() does not mutate the original', () => {
    const ext = new TestExtension();
    ext.configure({ color: 'blue' });

    expect(ext.config.color).toBe('red'); // original unchanged
  });

  it('configure() can be chained', () => {
    const ext = new TestExtension();
    const result = ext.configure({ color: 'blue' }).configure({ size: 24 });

    expect(result.config.color).toBe('blue');
    expect(result.config.size).toBe(24);
  });

  it('configure() merges partial config', () => {
    const ext = new TestExtension();
    const configured = ext.configure({ color: 'green' });

    expect(configured.config).toEqual({ color: 'green', size: 16 });
  });

  it('preserves the extension name after configure', () => {
    const ext = new TestExtension();
    const configured = ext.configure({ color: 'blue' });

    expect(configured.name).toBe('test');
  });

  it('getNodes returns undefined by default', () => {
    const ext = new TestExtension();
    expect(ext.getNodes).toBeUndefined();
  });

  it('getPlugins returns undefined by default', () => {
    const ext = new TestExtension();
    expect(ext.getPlugins).toBeUndefined();
  });

  it('getKeyBindings returns undefined by default', () => {
    const ext = new TestExtension();
    expect(ext.getKeyBindings).toBeUndefined();
  });
});
