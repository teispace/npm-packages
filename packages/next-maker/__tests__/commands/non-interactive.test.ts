import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { registerCommands } from '../../src/commands';

/**
 * Every question a generator can ask must be answerable by a flag, both
 * ways. A boolean prompt with only the positive flag makes the command
 * unusable from a script: with no answer on stdin it waits forever, which
 * is how `locale` used to hang a CI run.
 */
const BOOLEAN_PROMPTS: Record<string, string[]> = {
  component: ['client', 'test'],
  feature: ['api', 'store', 'persist'],
  hook: ['test'],
  locale: ['copy-translations'],
  page: ['loading', 'error'],
  slice: ['persist', 'test'],
};

/** Commands that ask before doing something destructive or slow. */
const CONFIRMATION_COMMANDS: Record<string, string> = {
  init: '--yes',
  setup: '--yes',
  remove: '--yes',
  upgrade: '--yes',
};

const program = new Command();
registerCommands(program);
const commands = new Map(program.commands.map((c) => [c.name(), c]));
const flagsOf = (name: string): string[] => {
  const command = commands.get(name);
  if (!command) throw new Error(`command ${name} is not registered`);
  return command.options.flatMap((o) => [o.short, o.long].filter(Boolean) as string[]);
};

describe('generators can run without a terminal', () => {
  it.each(Object.entries(BOOLEAN_PROMPTS))('%s pairs every boolean flag', (name, booleans) => {
    const flags = flagsOf(name);
    for (const bool of booleans) {
      expect(flags, `${name} --${bool}`).toContain(`--${bool}`);
      expect(flags, `${name} --no-${bool}`).toContain(`--no-${bool}`);
    }
  });

  it.each(Object.entries(CONFIRMATION_COMMANDS))('%s can skip its confirmation', (name, flag) => {
    expect(flagsOf(name)).toContain(flag);
  });

  it('registers every documented command', () => {
    for (const name of [
      'init',
      'workspace',
      'setup',
      'remove',
      'upgrade',
      'doctor',
      'options',
      'feature',
      'api',
      'slice',
      'page',
      'layout',
      'component',
      'hook',
      'provider',
      'env',
      'locale',
      'test',
      'favicon',
    ]) {
      expect(commands.has(name), name).toBe(true);
    }
    // `service` stays available as the pre-5.0 name for `api`.
    expect(commands.get('api')?.aliases()).toContain('service');
  });
});
