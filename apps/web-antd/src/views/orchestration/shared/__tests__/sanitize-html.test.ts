/**
 * HTML 净化测试。
 *
 * 断言的是**模块契约**而非第三方库的内部行为：
 * `sanitizeHtml()` 的输出在任何环境下都不得包含可执行构造
 * （危险标签 / `on*` 事件属性 / 危险协议 / `srcdoc` / `srcset`）。
 *
 * 注意：本仓库的 vitest 环境是 happy-dom。happy-dom 的节点增删/序列化与
 * DOMPurify 不完全兼容（会出现"该删的没删"），因此**还原度**类断言
 * 只在 `FAITHFUL` 为真时执行；而"输出安全"的契约断言在两种环境下都必须成立
 * ——这正是 `sanitize-html.ts` 里二次校验 + fail-closed 转义的价值。
 */
import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  isHtmlSanitizerSupported,
  isSafeSanitizedOutput,
  sanitizeHtml,
  stripTags,
} from '../sanitize-html';

const SUPPORTED = isHtmlSanitizerSupported();

/** 该环境能否忠实还原白名单净化（纯文本被改写即说明不能）。 */
const FAITHFUL = SUPPORTED && sanitizeHtml('<p>x</p>') === '<p>x</p>';

/** 断言字符串中不含任何可执行构造。 */
function expectNonExecutable(html: string): void {
  expect(isSafeSanitizedOutput(html)).toBe(true);
  expect(html).not.toMatch(/<\s*\/?\s*script/i);
  expect(html).not.toMatch(/<\s*\/?\s*svg/i);
  expect(html).not.toMatch(/<\s*\/?\s*iframe/i);
  expect(html).not.toMatch(/<\s*\/?\s*math/i);
  expect(html).not.toMatch(/<\s*\/?\s*object/i);
  expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/<[^>]*javascript:/i);
}

const DANGEROUS_INPUTS = [
  '<script>alert(1)</script>keep',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<iframe src="x"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<p onclick="alert(1)">x</p>',
  '<p onmouseover="alert(1)">x</p>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<style>body{display:none}</style>',
  '<math><mtext><script>alert(1)</script></mtext></math>',
  '<object data="data:text/html,<script>alert(1)</script>"></object>',
  '<form action="x"><input name="y"></form>',
  '<img src="x" srcset="data:text/html,<script>alert(1)</script>">',
  '<template><script>alert(1)</script></template>',
  '<base href="/">',
  '<meta http-equiv="refresh" content="0;url=/">',
];

describe('escapeHtml', () => {
  it('转义全部危险字符', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;',
    );
  });

  it('空值返回空串', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('isSafeSanitizedOutput（二次校验闸门）', () => {
  it('放行安全输出', () => {
    expect(isSafeSanitizedOutput('plain text')).toBe(true);
    expect(isSafeSanitizedOutput('<p>段落</p>')).toBe(true);
    expect(
      isSafeSanitizedOutput('<a href="https://example.com">链接</a>'),
    ).toBe(true);
    // 已转义的文本不是标签，天然安全
    expect(isSafeSanitizedOutput('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe(
      true,
    );
    expect(isSafeSanitizedOutput('')).toBe(true);
  });

  it('拦截可执行构造', () => {
    expect(isSafeSanitizedOutput('<script>x</script>')).toBe(false);
    expect(isSafeSanitizedOutput('<svg onload=1>')).toBe(false);
    expect(isSafeSanitizedOutput('<iframe src="x">')).toBe(false);
    expect(isSafeSanitizedOutput('<math></math>')).toBe(false);
    expect(isSafeSanitizedOutput('<img src=x onerror=1>')).toBe(false);
    expect(isSafeSanitizedOutput('<p onclick="x">')).toBe(false);
    expect(isSafeSanitizedOutput('<a href="javascript:x">')).toBe(false);
    expect(isSafeSanitizedOutput('<div style=x srcset=y>')).toBe(false);
    expect(isSafeSanitizedOutput('<iframe srcdoc="x">')).toBe(false);
  });

  it('测试环境应具备 DOM 净化能力', () => {
    expect(SUPPORTED).toBe(true);
  });
});

describe('sanitizeHtml 契约（任何环境都必须成立）', () => {
  it('空值与纯文本原样通过', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml('   ')).toBe('');
    expect(sanitizeHtml('plain text')).toBe('plain text');
    expect(sanitizeHtml('a & b')).toBe('a & b');
  });

  it.each(DANGEROUS_INPUTS)('危险输入不会产生可执行输出：%s', (raw) => {
    expect.hasAssertions();
    expectNonExecutable(sanitizeHtml(raw));
  });

  it('非字符串输入也被安全化', () => {
    expect(typeof sanitizeHtml(123)).toBe('string');
    expectNonExecutable(sanitizeHtml({ toString: () => '<b>x</b>' }));
  });

  it('净化是幂等的', () => {
    const once = sanitizeHtml('<p>a</p>');
    expect(sanitizeHtml(once)).toBe(once);
  });
});

describe('sanitizeHtml 还原度（需浏览器级 DOM）', () => {
  it.runIf(FAITHFUL)('保留安全的排版标签与表格', () => {
    expect(sanitizeHtml('<p><strong>加粗</strong></p>')).toBe(
      '<p><strong>加粗</strong></p>',
    );
    expect(
      sanitizeHtml('<table><tbody><tr><td>1</td></tr></tbody></table>'),
    ).toContain('<td>1</td>');
  });

  it.runIf(FAITHFUL)('外链自动补 target 与 rel', () => {
    const clean = sanitizeHtml('<a href="https://example.com">链接</a>');
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('noopener');
  });

  it.runIf(!FAITHFUL)('环境不忠实时降级为纯文本，而不是放过', () => {
    const clean = sanitizeHtml('<p>a</p><script>x</script>');
    expect.hasAssertions();
    expectNonExecutable(clean);
  });
});

describe('stripTags', () => {
  it('空值与纯文本', () => {
    expect(stripTags('')).toBe('');
    expect(stripTags(null)).toBe('');
    expect(stripTags('plain text')).toBe('plain text');
  });

  it('输出中一定不含标签', () => {
    const text = stripTags('<p>前<b>中</b>后</p>');
    expect(text).not.toContain('<');
    expect(text).toContain('前');
    expect(text).toContain('中');
    expect(text).toContain('后');
  });

  it.runIf(FAITHFUL)('精确剥离标签保留文本', () => {
    expect(stripTags('<p>前<b>中</b>后</p>')).toBe('前中后');
  });

  it.each(DANGEROUS_INPUTS)('不产生可执行输出：%s', (raw) => {
    const text = stripTags(raw);
    expect(text).not.toContain('<');
    expectNonExecutable(text);
  });
});
