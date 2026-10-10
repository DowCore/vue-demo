/**
 * 统一的富文本净化入口。
 *
 * 背景：编排平台存在两处把「库中存储的 HTML 字符串」直接 `v-html` 渲染的地方
 * （表单 `html-text` 组件、列表列 `renderFn` 输出）。原先各自用正则删 `script`，
 * 可被 `<svg/onload>`、`<img onerror>`、`data:` URI、实体编码等轻易绕过。
 *
 * 本模块统一改用 DOMPurify（业界标准净化库）+ 严格白名单：
 * - 只允许基础排版标签，禁用 `svg`/`math`/`style`/`iframe`/`form` 等；
 * - 只允许 http/https/mailto/tel 与相对地址，禁止 `javascript:`、`data:`；
 * - 禁止全部 `on*` 事件属性与 `srcdoc`/`srcset`；
 * - 链接统一补 `target=_blank` + `rel="noopener noreferrer nofollow"`。
 *
 * 失败兜底（fail-closed）：DOMPurify 不可用、抛错、**或净化结果未通过二次校验**时，
 * 一律**转义输出纯文本**，绝不回退成"原样渲染"。
 *
 * 为什么需要二次校验：净化库的正确性依赖宿主 DOM 实现的完整性
 * （部分非浏览器 DOM 实现的节点迭代/增删不完整，会出现"该删的没删、该留的没留"）。
 * 该函数是安全边界，因此不把"安全"完全托付给第三方：净化后再跑一遍
 * {@link isSafeOutput} 结构校验，任何可疑输出直接整体转义——**宁可降级为纯文本，不可漏过**。
 */
import type { Config } from 'dompurify';

import DOMPurify from 'dompurify';

/** 允许的标签：仅基础排版与表格，不含任何可执行/可加载资源的标签。 */
const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'cite',
  'code',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'var',
];

/** 允许的属性：不含任何 `on*`、`srcdoc`、`srcset`。 */
const ALLOWED_ATTR = [
  'align',
  'alt',
  'class',
  'colspan',
  'data-tone',
  'data-value',
  'height',
  'href',
  'rel',
  'rowspan',
  'span',
  'style',
  'target',
  'title',
  'valign',
  'width',
];

/**
 * 仅允许 http/https/mailto/tel 以及相对地址。
 * 该表达式取自 DOMPurify 默认策略并显式排除 `data:` 与其余自定义协议。
 */
const ALLOWED_URI =
  /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;

const PURIFY_CONFIG: Config = {
  ADD_ATTR: ['target'],
  ALLOWED_ATTR,
  ALLOWED_TAGS,
  ALLOWED_URI_REGEXP: ALLOWED_URI,
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: ['autofocus', 'formaction', 'srcdoc', 'srcset', 'xlink:href'],
  FORBID_CONTENTS: ['script', 'style'],
  FORBID_TAGS: [
    'embed',
    'form',
    'iframe',
    'input',
    'link',
    'math',
    'meta',
    'object',
    'script',
    'style',
    'svg',
    'template',
    'textarea',
    'video',
    'audio',
    'source',
    'base',
  ],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  SAFE_FOR_TEMPLATES: true,
};

/**
 * 输出侧的"可执行构造"黑名单，用于对净化结果做二次校验。
 * 只做结构判定，不重建净化逻辑。
 */
const UNSAFE_OUTPUT_RULES = [
  /<\s*\/?\s*(?:applet|base|embed|form|frame|frameset|iframe|input|link|math|meta|object|script|source|style|svg|template|textarea|video|audio)\b/i,
  /<[a-z][^>]*\son[a-z]+\s*=/i,
  /<[^>]*(?:javascript:|vbscript:|data:text\/html)/i,
  /\ssrcdoc\s*=/i,
  /\ssrcset\s*=/i,
];

const CAN_SANITIZE = (() => {
  try {
    return Boolean(DOMPurify.isSupported);
  } catch {
    return false;
  }
})();

/** 当前环境是否能真正执行白名单净化（无 DOM 时为 false，此时走转义兜底）。 */
export function isHtmlSanitizerSupported(): boolean {
  return CAN_SANITIZE;
}

let hooked = false;

function ensureHooks(): void {
  if (hooked || !CAN_SANITIZE) return;
  hooked = true;
  try {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName !== 'A') return;
      if (!node.hasAttribute('href')) return;
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    });
  } catch {
    // 钩子注册失败不影响净化本身（仍有白名单兜底）
  }
}

/** HTML 转义，用于无法净化时的安全兜底。 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * 净化结果的二次结构校验（fail-closed 闸门）。
 *
 * 只要输出里出现"可执行构造"就判定不安全：危险标签、`on*` 事件属性、
 * 危险协议、`srcdoc`/`srcset`。不含 `<` 的输出（全转义纯文本）天然安全。
 */
export function isSafeSanitizedOutput(html: string): boolean {
  if (!html.includes('<')) return true;
  return !UNSAFE_OUTPUT_RULES.some((rule) => rule.test(html));
}

/**
 * 净化富文本。始终返回可安全 `v-html` 的字符串。
 *
 * 三道闸门：① 无 `<` 的纯文本直接放行（无可净化内容，避免被库改写）；
 * ② DOMPurify 白名单净化；③ 结果二次校验，不通过则整体转义。
 */
export function sanitizeHtml(value: unknown): string {
  let source = '';
  if (typeof value === 'string') {
    source = value;
  } else if (value !== null && value !== undefined) {
    source = String(value);
  }
  if (!source.trim()) return '';
  // 不含 `<` 即不可能构成标签，无需送进库（也避免非浏览器 DOM 实现把纯文本弄丢）
  if (!source.includes('<')) return source;
  if (!CAN_SANITIZE) return escapeHtml(source);
  ensureHooks();
  try {
    const clean = DOMPurify.sanitize(source, PURIFY_CONFIG);
    if (typeof clean !== 'string') return escapeHtml(source);
    return isSafeSanitizedOutput(clean) ? clean : escapeHtml(source);
  } catch {
    return escapeHtml(source);
  }
}

/** 剥离标签，得到纯文本。同样 fail-closed：拿不到"确实无标签"的结果就整体转义。 */
export function stripTags(value: unknown): string {
  const source = typeof value === 'string' ? value : String(value ?? '');
  if (!source) return '';
  if (!source.includes('<')) return source;
  if (!CAN_SANITIZE) return escapeHtml(source);
  const safe = sanitizeHtml(source);
  if (!safe.includes('<')) return safe;
  try {
    const text = DOMPurify.sanitize(safe, {
      ...PURIFY_CONFIG,
      ALLOWED_TAGS: [],
      KEEP_CONTENT: true,
    });
    return typeof text === 'string' && !text.includes('<')
      ? text
      : escapeHtml(safe);
  } catch {
    return escapeHtml(safe);
  }
}
