import { describe, expect, it } from 'vitest';
import { sanitizeCss, sanitizeOps } from '../src/host.js';
import { POLICY } from './harness.js';

function clean(tree: unknown) {
  const problems: string[] = [];
  const [op] = sanitizeOps([{ op: 'set', id: 'u1', tree }], POLICY, (p) => problems.push(p));
  return { tree: op && op.op === 'set' ? op.tree : [], problems };
}

describe('checking what a theme sends', () => {
  it('keeps allowed elements, attributes, images and app components', () => {
    const tree = [
      { t: 'e', tag: 'p', props: { className: 'note', 'aria-label': 'Note' }, c: ['Hello'] },
      { t: 'e', tag: 'img', props: { src: '/media/abc', alt: '' }, c: [] },
      { t: 'h', name: 'Button', props: { label: 'Go', onPress: { $fn: 3 } }, c: [] },
      { t: 'u', id: 'u2' }
    ];
    expect(clean(tree)).toEqual({ tree, problems: [] });
  });

  it('drops elements, attributes and app components that are not allowed', () => {
    const { tree, problems } = clean([
      { t: 'e', tag: 'script', props: {}, c: ['alert(1)'] },
      { t: 'e', tag: 'iframe', props: { src: 'https://evil.example' }, c: [] },
      { t: 'e', tag: 'p', props: { onClick: { $fn: 1 }, href: 'javascript:alert(1)' }, c: [] },
      { t: 'h', name: 'Keylogger', props: {}, c: [] }
    ]);
    expect(tree).toEqual([{ t: 'e', tag: 'p', props: {}, c: [] }]);
    expect(problems).toEqual([
      "The element <script> isn't allowed.",
      "The element <iframe> isn't allowed.",
      "The attribute onClick isn't allowed.",
      "The attribute href isn't allowed.",
      "The app component Keylogger isn't available."
    ]);
  });

  it('refuses images and style addresses outside the policy', () => {
    const { tree } = clean([
      { t: 'e', tag: 'img', props: { src: 'https://tracker.example/pixel.gif' }, c: [] },
      { t: 'e', tag: 'div', props: { style: { color: 'red', background: 'url(https://tracker.example/x)', width: 10 } }, c: [] }
    ]);
    expect(tree).toEqual([
      { t: 'e', tag: 'img', props: {}, c: [] },
      { t: 'e', tag: 'div', props: { style: { color: 'red', width: 10 } }, c: [] }
    ]);
  });

  it('keeps only plain data and function references in app component props', () => {
    const { tree } = clean([{ t: 'h', name: 'Button', props: { label: 'Go', onPress: { $fn: 'x' }, extra: { $fn: 1, more: 2 } }, c: [] }]);
    expect(tree).toEqual([{ t: 'h', name: 'Button', props: { label: 'Go' }, c: [] }]);
  });

  it('cleans stylesheets', () => {
    const problems: string[] = [];
    const css = sanitizeCss(
      "@import url(https://evil.example/x.css);\n.a { background: url('/media/ok.png'); }\n.b { background: url(https://evil.example/y.png); width: expression(alert(1)); }",
      POLICY,
      (p) => problems.push(p)
    );
    expect(css).toBe("\n.a { background: url('/media/ok.png'); }\n.b { background: none; width: ; }");
    expect(problems).toHaveLength(3);
  });

  it('catches CSS escapes, comments, stitched keywords, mismatched quotes and unclosed url()', () => {
    const problems: string[] = [];
    const css = sanitizeCss(
      [
        '\\40 import url(/media/x.css);',
        '@im@import;port url(/media/y.css);',
        '.a { background: \\75\\72\\6c(https://evil.example/escaped.png); }',
        '.b { background: u/*comment*/rl("https://evil.example/mismatched\'); }',
        '.c { width: expr/**/ession(alert(1)); }',
        '.d { background: url(https://evil.example/unclosed'
      ].join('\n'),
      POLICY,
      (p) => problems.push(p)
    );
    expect(css).toBe('\n\n.a { background: none; }\n.b { background: none; }\n.c { width: ; }\n.d { background: none');
    expect(problems).toEqual([
      'An @import was removed from the styles.',
      'An @import was removed from the styles.',
      'A script-like value was removed from the styles.',
      'An @import was removed from the styles.',
      'The address https://evil.example/escaped.png was removed from the styles.',
      'The address "https://evil.example/mismatched\' was removed from the styles.',
      'The address https://evil.example/unclosed was removed from the styles.'
    ]);

    const { tree } = clean([
      {
        t: 'e',
        tag: 'div',
        props: {
          style: {
            background: '\\75rl(https://evil.example/x)',
            backgroundImage: 'url(https://evil.example/unclosed',
            width: 'expr/*x*/ession(1)',
            color: 'green'
          }
        },
        c: []
      }
    ]);
    expect(tree).toEqual([{ t: 'e', tag: 'div', props: { style: { color: 'green' } }, c: [] }]);
  });

  it('keeps keys that are short text or numbers', () => {
    const { tree } = clean([
      { t: 'e', tag: 'p', props: {}, c: [], k: 'spa' },
      { t: 'e', tag: 'p', props: {}, c: [], k: { evil: true } },
      { t: 'h', name: 'Button', props: {}, c: [], k: 3 }
    ]);
    expect(tree).toEqual([
      { t: 'e', tag: 'p', props: {}, c: [], k: 'spa' },
      { t: 'e', tag: 'p', props: {}, c: [] },
      { t: 'h', name: 'Button', props: {}, c: [], k: 3 }
    ]);
  });

  it('drops malformed updates', () => {
    const problems: string[] = [];
    expect(sanitizeOps('nope', POLICY, (p) => problems.push(p))).toEqual([]);
    expect(sanitizeOps([{ op: 'set' }, { op: 'boom', id: 'x' }], POLICY, (p) => problems.push(p))).toEqual([]);
    expect(problems).toHaveLength(3);
  });
});
