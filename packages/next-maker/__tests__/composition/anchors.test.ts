import { describe, expect, it } from 'vitest';
import { stripAnchors, unwrapCall, unwrapJsx } from '../../src/composition/anchors';

const off = (...ids: string[]) => ({ off: new Set(ids) });

describe('stripAnchors', () => {
  it('drops an own-line anchor together with the line it annotates when the feature is off', () => {
    const input = [
      "import a from 'a';",
      '// @next-maker:ws',
      "import { ws } from './ws';",
      'run();',
    ].join('\n');
    expect(stripAnchors(input, off('ws'))).toBe(["import a from 'a';", 'run();'].join('\n'));
  });

  it('keeps the annotated line and removes only the comment when the feature is on', () => {
    const input = [
      '// @next-maker:ws',
      "import { ws } from './ws';",
      "export * from './x'; // @next-maker:i18n",
    ].join('\n');
    expect(stripAnchors(input, off())).toBe(
      ["import { ws } from './ws';", "export * from './x';"].join('\n'),
    );
  });

  it('drops a trailing anchor line when the feature is off', () => {
    const input = ['a();', 'b(); // @next-maker:axios', 'c();'].join('\n');
    expect(stripAnchors(input, off('axios'))).toBe(['a();', 'c();'].join('\n'));
  });

  it('removes whole blocks when off and only the markers when on', () => {
    const input = [
      'type P = {',
      '  /* @next-maker:i18n:start */',
      '  locale: string;',
      '  messages: M;',
      '  /* @next-maker:i18n:end */',
      '  children: R;',
      '};',
    ].join('\n');
    expect(stripAnchors(input, off('i18n'))).toBe(
      ['type P = {', '  children: R;', '};'].join('\n'),
    );
    expect(stripAnchors(input, off())).toBe(
      ['type P = {', '  locale: string;', '  messages: M;', '  children: R;', '};'].join('\n'),
    );
  });

  it('handles JSX, YAML, shell, and CSS comment syntaxes', () => {
    const jsx = [
      '<div>',
      '  {/* @next-maker:state */}',
      '  <Counter />',
      '  <Other />',
      '</div>',
    ].join('\n');
    expect(stripAnchors(jsx, off('state'))).toBe(['<div>', '  <Other />', '</div>'].join('\n'));
    const yaml = [
      'jobs:',
      '  # @next-maker:tests:start',
      '  test:',
      '    run: x',
      '  # @next-maker:tests:end',
      '  build:',
    ].join('\n');
    expect(stripAnchors(yaml, off('tests'))).toBe(['jobs:', '  build:'].join('\n'));
    const css = '@import "a"; /* @next-maker:darkMode */\n@import "b";';
    expect(stripAnchors(css, off('darkMode'))).toBe('@import "b";');
    expect(stripAnchors(css, off())).toBe('@import "a";\n@import "b";');
  });

  it('throws on an unbalanced block', () => {
    expect(() => stripAnchors('// @next-maker:x:start\nfoo', off('x'))).toThrow(/no matching :end/);
  });
});

describe('unwrapJsx', () => {
  it('removes the wrapper, outdents the body, and drops the import', () => {
    const input = [
      "import { StoreProvider } from './StoreProvider';",
      'export const R = () => (',
      '  <Query>',
      '    <StoreProvider preloadedState={p}>',
      '      <Intl>{children}</Intl>',
      '    </StoreProvider>',
      '  </Query>',
      ');',
    ].join('\n');
    expect(unwrapJsx(input, 'StoreProvider')).toBe(
      [
        'export const R = () => (',
        '  <Query>',
        '    <Intl>{children}</Intl>',
        '  </Query>',
        ');',
      ].join('\n'),
    );
  });

  it('handles multi-line opening tags and leaves self-closing tags alone', () => {
    const input = ['<A', '  x="1"', '>', '  <b />', '</A>'].join('\n');
    expect(unwrapJsx(input, 'A')).toBe('<b />');
    expect(unwrapJsx('<A x="1" />', 'A')).toBe('<A x="1" />');
  });

  it('returns the input when the tag is absent', () => {
    expect(unwrapJsx('<div />', 'Nope')).toBe('<div />');
  });
});

describe('unwrapCall', () => {
  it('replaces the call with its argument, honouring nesting', () => {
    expect(unwrapCall('export default a(b(c));', 'a')).toBe('export default b(c);');
    expect(unwrapCall('export default a(b(c));', 'b')).toBe('export default a(c);');
    expect(unwrapCall('x(y({ z: (1) }))', 'y')).toBe('x({ z: (1) })');
  });
});
