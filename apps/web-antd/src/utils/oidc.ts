const CLIENT_ID = import.meta.env.VITE_OPENID_CLIENT_ID || 'MetaDow_Vue';
const SCOPE =
  import.meta.env.VITE_OPENID_SCOPE ||
  'openid profile email offline_access MetaDowIdentityService MetaDowAdministration MetaDowSaaS';

/** AuthServer 必须用绝对地址，才能带上 7600 的登录 Cookie */
const AUTH_SERVER =
  import.meta.env.VITE_AUTH_SERVER_URL || 'https://localhost:7600';

const PKCE_VERIFIER_KEY = 'oidc.pkce_verifier';
const OIDC_STATE_KEY = 'oidc.state';
const OIDC_RETURN_KEY = 'oidc.return_url';

function getRedirectUri() {
  return `${window.location.origin}/auth/oidc-callback`;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = '';
  arr.forEach((b) => {
    str += String.fromCodePoint(b);
  });
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function sha256Base64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toBase64Url(digest);
}

/** 跳转到 AuthServer 授权页（已登录则直接回跳带 code） */
export async function beginAuthorizationCodeLogin(returnUrl?: string) {
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(32);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OIDC_STATE_KEY, state);
  if (returnUrl) {
    sessionStorage.setItem(OIDC_RETURN_KEY, returnUrl);
  } else {
    sessionStorage.removeItem(OIDC_RETURN_KEY);
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.assign(
    `${AUTH_SERVER.replace(/\/$/, '')}/connect/authorize?${params}`,
  );
}

export function takeOidcReturnUrl() {
  const value = sessionStorage.getItem(OIDC_RETURN_KEY);
  sessionStorage.removeItem(OIDC_RETURN_KEY);
  return value;
}

/**
 * 优先用前端 SSO 的 sessionStorage；
 * Visit 走 AuthServer /vue-sso 时，从 AuthServer 一次性取回 code_verifier。
 */
export async function resolvePkceVerifier(expectedState: null | string) {
  const savedState = sessionStorage.getItem(OIDC_STATE_KEY);
  const localVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OIDC_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  if (
    expectedState &&
    savedState &&
    expectedState === savedState &&
    localVerifier
  ) {
    return localVerifier;
  }

  if (!expectedState) {
    throw new Error('缺少 OIDC state，请重新发起登录。');
  }

  const authServer = AUTH_SERVER.replace(/\/$/, '');
  const resp = await fetch(
    `${authServer}/vue-sso/pkce?state=${encodeURIComponent(expectedState)}`,
    { credentials: 'omit' },
  );
  if (!resp.ok) {
    throw new Error(
      '无法获取 PKCE verifier。若从 7600 Visit 进入，请确认 AuthServer 已重启且 Redis 可用。',
    );
  }
  const data = (await resp.json()) as { code_verifier?: string };
  if (!data.code_verifier) {
    throw new Error('AuthServer 未返回 code_verifier。');
  }
  return data.code_verifier;
}

export function getOidcClientId() {
  return CLIENT_ID;
}

export function getOidcRedirectUri() {
  return getRedirectUri();
}

export function getAuthServerUrl() {
  return AUTH_SERVER.replace(/\/$/, '');
}
