import { describe, expect, it } from 'vitest';
import {
  neutralizeAttributes,
  restoreStyles,
  STYLE_ATTRIBUTE,
} from '../../src/utils/html-attributes';

const n = neutralizeAttributes;

describe('neutralizeAttributes', () => {
  it('renames style and drops handlers, in any case and quoting', () => {
    expect(n('<p style="color:red" onclick="x()">a</p>')).toBe(
      `<p ${STYLE_ATTRIBUTE}="color:red" >a</p>`,
    );
    expect(n("<p STYLE='a:b' ONLOAD='x'>a</p>")).toBe(`<p ${STYLE_ATTRIBUTE}='a:b' >a</p>`);
    expect(n('<img src=x onerror=alert(1)>')).toBe('<img src=x >');
    expect(n('<p style = "a:b">x</p>')).toBe(`<p ${STYLE_ATTRIBUTE} = "a:b">x</p>`);
  });

  it('reads values the way the tokenizer does', () => {
    // `>` inside a quoted value does not end the tag.
    expect(n('<a title="a > b" onclick="x">t</a>')).toBe('<a title="a > b" >t</a>');
    // An attribute right after a quote, with no space, is still an attribute.
    expect(n('<p class="a"style="b">t</p>')).toBe(`<p class="a"${STYLE_ATTRIBUTE}="b">t</p>`);
    // A value that only looks like an attribute stays as it is.
    expect(n('<p title="style=x onclick=y">t</p>')).toBe('<p title="style=x onclick=y">t</p>');
    // Bare attributes.
    expect(n('<input disabled onfocus>')).toBe('<input disabled >');
  });

  it('leaves text, comments, end tags and raw text alone', () => {
    const text = '<p>set style="x" and onclick="y" here</p>';
    expect(n(text)).toBe(text);
    const comment = '<!-- <p style="x"> --><p>a</p>';
    expect(n(comment)).toBe(comment);
    expect(n('<textarea><p style="x"></textarea>')).toBe('<textarea><p style="x"></textarea>');
    expect(n('a < b and 1<2 <3')).toBe('a < b and 1<2 <3');
    expect(n('</p style="x">')).toBe('</p style="x">');
  });

  it('copies unterminated input without throwing', () => {
    expect(n('<p style="unterminated')).toBe(`<p ${STYLE_ATTRIBUTE}="unterminated`);
    expect(n('<p onclick')).toBe('<p ');
    expect(n('<!-- open')).toBe('<!-- open');
  });

  it('round-trips the style through the CSSOM', () => {
    const doc = new DOMParser().parseFromString(
      n('<p style="color: red; text-align: center" onclick="x">a</p>'),
      'text/html',
    );
    restoreStyles(doc);
    const p = doc.querySelector('p') as HTMLElement;
    expect(p.style.color).toBe('red');
    expect(p.style.textAlign).toBe('center');
    expect(p.hasAttribute(STYLE_ATTRIBUTE)).toBe(false);
    expect(p.hasAttribute('onclick')).toBe(false);
  });
});
