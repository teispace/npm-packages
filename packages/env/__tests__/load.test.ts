import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv, parseEnv, resolveCascade } from '../src/load';
import type { RawEnv } from '../src/types';

let dir: string;

/** Write a fixture file relative to the temp cwd. */
function write(name: string, contents: string): void {
  writeFileSync(join(dir, name), contents, 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'teis-env-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseEnv', () => {
  it('parses KEY=value, export prefix, and = inside values', () => {
    const r = parseEnv('FOO=bar\nexport BAZ=qux\nURL=postgres://u:p@h/db?x=1');
    expect(r).toEqual({ FOO: 'bar', BAZ: 'qux', URL: 'postgres://u:p@h/db?x=1' });
  });

  it('trims trailing whitespace on unquoted values but preserves it inside quotes', () => {
    const r = parseEnv('A=  spaced   \nB="  kept  "');
    expect(r.A).toBe('spaced'); // leading space after = dropped, trailing trimmed
    expect(r.B).toBe('  kept  ');
  });

  it('handles single, double, and backtick quotes', () => {
    const r = parseEnv(`A='single val'\nB="double val"\nC=\`tick val\``);
    expect(r).toEqual({ A: 'single val', B: 'double val', C: 'tick val' });
  });

  it('strips full-line and inline comments but not # inside quotes', () => {
    const r = parseEnv('# comment line\nA=val # trailing\nB="has # hash"\nC=#empty');
    expect(r.A).toBe('val');
    expect(r.B).toBe('has # hash');
    expect(r.C).toBe('');
  });

  it('expands \\n and \\t escapes inside double quotes only', () => {
    const r = parseEnv('A="line1\\nline2\\ttab"\nB=\'raw\\nraw\'');
    expect(r.A).toBe('line1\nline2\ttab');
    expect(r.B).toBe('raw\\nraw'); // single quotes are literal
  });

  it('supports multiline double-quoted values', () => {
    const r = parseEnv('KEY="first\nsecond\nthird"\nNEXT=after');
    expect(r.KEY).toBe('first\nsecond\nthird');
    expect(r.NEXT).toBe('after');
  });

  it('ignores blank lines and malformed lines without throwing', () => {
    const r = parseEnv('\n\nnot a pair\n   \nGOOD=1\n123BAD=x');
    expect(r).toEqual({ GOOD: '1' });
  });
});

describe('resolveCascade precedence', () => {
  it('orders .env < .env.local < .env.[mode] < .env.[mode].local', () => {
    expect(resolveCascade('development')).toEqual([
      '.env',
      '.env.local',
      '.env.development',
      '.env.development.local',
    ]);
  });

  it('skips .env.local in test mode (Vite convention)', () => {
    expect(resolveCascade('test')).toEqual(['.env', '.env.test', '.env.test.local']);
  });

  it('omits mode files when mode is undefined', () => {
    expect(resolveCascade(undefined)).toEqual(['.env', '.env.local']);
  });
});

describe('loadEnv cascade', () => {
  it('local overrides base, and mode overrides local + base', () => {
    write('.env', 'A=base\nB=base\nC=base');
    write('.env.local', 'B=local\nC=local');
    write('.env.development', 'C=mode');
    const target: RawEnv = {};
    const out = loadEnv({ cwd: dir, mode: 'development', processEnv: target });
    expect(out.A).toBe('base'); // only in .env
    expect(out.B).toBe('local'); // .env.local wins over .env
    expect(out.C).toBe('mode'); // .env.development wins over both
    // Written into the target env too.
    expect(target.C).toBe('mode');
  });

  it('.env.[mode].local has the highest precedence', () => {
    write('.env', 'X=1');
    write('.env.development', 'X=2');
    write('.env.development.local', 'X=3');
    const out = loadEnv({ cwd: dir, mode: 'development', processEnv: {} });
    expect(out.X).toBe('3');
  });

  it('test mode skips .env.local', () => {
    write('.env', 'A=base');
    write('.env.local', 'A=local-should-be-ignored');
    write('.env.test', 'B=test');
    const out = loadEnv({ cwd: dir, mode: 'test', processEnv: {} });
    expect(out.A).toBe('base'); // .env.local skipped, so base value stands
    expect(out.B).toBe('test');
  });

  it('honors an explicit files override', () => {
    write('.env', 'A=fromenv');
    write('custom.env', 'A=fromcustom');
    const out = loadEnv({ cwd: dir, files: ['custom.env'], processEnv: {} });
    expect(out.A).toBe('fromcustom');
  });
});

describe('loadEnv ${VAR} expansion', () => {
  it('expands ${VAR} and $VAR from earlier files and target env', () => {
    write('.env', 'HOST=example.com\nURL=https://${HOST}/api\nBARE=$HOST');
    const out = loadEnv({ cwd: dir, processEnv: { PREEXISTING: 'p' } });
    expect(out.URL).toBe('https://example.com/api');
    expect(out.BARE).toBe('example.com');
  });

  it('references values already present in the target env', () => {
    write('.env', 'GREETING=hi-${NAME}');
    const out = loadEnv({ cwd: dir, processEnv: { NAME: 'krishna' } });
    expect(out.GREETING).toBe('hi-krishna');
  });

  it('supports ${VAR:-default} when unset or empty', () => {
    write('.env', 'A=${MISSING:-fallback}\nEMPTY=\nB=${EMPTY:-used}');
    const out = loadEnv({ cwd: dir, processEnv: {} });
    expect(out.A).toBe('fallback');
    expect(out.B).toBe('used');
  });

  it('honors the \\$ escape for a literal dollar sign', () => {
    write('.env', 'PRICE="\\$5.00"\nLIT=cost-\\$X');
    const out = loadEnv({ cwd: dir, processEnv: {} });
    expect(out.PRICE).toBe('$5.00');
    expect(out.LIT).toBe('cost-$X');
  });

  it('does not expand when expand:false', () => {
    write('.env', 'HOST=h\nURL=${HOST}');
    const out = loadEnv({ cwd: dir, expand: false, processEnv: {} });
    expect(out.URL).toBe('${HOST}');
  });
});

describe('loadEnv override behavior', () => {
  it('does NOT override existing target keys by default', () => {
    write('.env', 'A=fromfile\nB=fromfile');
    const target: RawEnv = { A: 'preexisting' };
    const out = loadEnv({ cwd: dir, processEnv: target });
    // Returned merged value reflects the file...
    expect(out.A).toBe('fromfile');
    // ...but the target keeps its pre-existing value (dotenv default).
    expect(target.A).toBe('preexisting');
    expect(target.B).toBe('fromfile'); // missing key was filled
  });

  it('overrides existing target keys when override:true', () => {
    write('.env', 'A=fromfile');
    const target: RawEnv = { A: 'preexisting' };
    loadEnv({ cwd: dir, override: true, processEnv: target });
    expect(target.A).toBe('fromfile');
  });
});

describe('loadEnv robustness', () => {
  it('does not crash when cascade files are missing', () => {
    // Empty temp dir: nothing to read.
    expect(existsSync(join(dir, '.env'))).toBe(false);
    let out: RawEnv = { sentinel: '1' };
    expect(() => {
      out = loadEnv({ cwd: dir, processEnv: {} });
    }).not.toThrow();
    expect(out).toEqual({});
  });

  it('does not crash when the target env is frozen', () => {
    write('.env', 'A=1');
    const frozen = Object.freeze({} as RawEnv);
    let out: RawEnv = {};
    expect(() => {
      out = loadEnv({ cwd: dir, processEnv: frozen });
    }).not.toThrow();
    // Values are still returned even though the frozen target can't be written.
    expect(out.A).toBe('1');
  });

  it('defaults mode from processEnv.NODE_ENV', () => {
    write('.env', 'A=base');
    write('.env.production', 'A=prod');
    const out = loadEnv({ cwd: dir, processEnv: { NODE_ENV: 'production' } });
    expect(out.A).toBe('prod');
  });
});
