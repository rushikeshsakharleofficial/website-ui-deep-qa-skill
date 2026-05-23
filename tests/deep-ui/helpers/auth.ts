import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type AuthFinding = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type AuthReport = {
  route: string;
  isLoginPage: boolean;
  hasLogoutButton: boolean;
  hasAuthIndicator: boolean;
  findings: AuthFinding[];
};

export async function auditAuthSurface(page: Page, route: string): Promise<AuthReport> {
  const routeName = normalizeRoute(route);
  const findings: AuthFinding[] = [];

  await screenshotStep(page, route, 'auth-surface');

  const domResults = await page.evaluate(() => {
    const result = {
      isLoginPage: false,
      hasLogoutButton: false,
      hasAuthIndicator: false,
      passwordFieldType: null as string | null,
      passwordFieldAutocomplete: null as string | null,
      formAction: null as string | null,
      formHasOnsubmit: false,
      hasRememberMe: false,
      hasForgotPassword: false,
      localStorageAuthKeys: [] as string[],
      sessionStorageAuthKeys: [] as string[],
      authCookiesVisible: [] as string[],
    };

    // 1. Detect login page
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
    for (const form of forms) {
      const passwordField = form.querySelector<HTMLInputElement>('input[type="password"]');
      const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
      if (passwordField && submitButton) {
        result.isLoginPage = true;
        result.passwordFieldType = passwordField.getAttribute('type');
        result.passwordFieldAutocomplete = passwordField.getAttribute('autocomplete');
        result.formAction = form.getAttribute('action') || '';
        result.formHasOnsubmit = !!(form.onsubmit || form.getAttribute('onsubmit'));

        // 2d. Remember me checkbox
        const rememberMe = form.querySelector('input[type="checkbox"]');
        if (rememberMe) {
          const label = rememberMe.closest('label') || document.querySelector(`label[for="${rememberMe.id}"]`);
          const labelText = (label?.textContent || rememberMe.getAttribute('name') || '').toLowerCase();
          if (labelText.includes('remember')) {
            result.hasRememberMe = true;
          }
        }

        // 2e. Forgot password link
        const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
        result.hasForgotPassword = allLinks.some(a => {
          const text = (a.textContent || '').toLowerCase();
          const href = (a.getAttribute('href') || '').toLowerCase();
          return text.includes('forgot') || text.includes('reset') || href.includes('forgot') || href.includes('reset');
        });

        break;
      }
    }

    // 3. Auth indicators
    const logoutPatterns = /logout|sign.?out|log.?out/i;
    const allButtons = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'));
    for (const el of allButtons) {
      const text = (el.textContent || '').trim();
      if (logoutPatterns.test(text)) {
        result.hasLogoutButton = true;
        result.hasAuthIndicator = true;
        break;
      }
    }

    if (!result.hasAuthIndicator) {
      const avatarSelectors = [
        '[class*="avatar" i]',
        '[class*="user-menu" i]',
        '[class*="usermenu" i]',
        '[aria-label*="user" i]',
        '[aria-label*="account" i]',
        '[class*="profile-pic" i]',
      ];
      for (const sel of avatarSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            const style = getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              result.hasAuthIndicator = true;
              break;
            }
          }
        } catch (_) {}
      }
    }

    // 4a. localStorage token scan
    try {
      const authKeyPattern = /token|access_token|id_token|jwt|auth/i;
      for (const key of Object.keys(localStorage)) {
        if (authKeyPattern.test(key)) {
          result.localStorageAuthKeys.push(key);
        }
      }
    } catch (_) {}

    // 4b. sessionStorage token scan
    try {
      const authKeyPattern = /token|access_token|id_token|jwt|auth/i;
      for (const key of Object.keys(sessionStorage)) {
        if (authKeyPattern.test(key)) {
          result.sessionStorageAuthKeys.push(key);
        }
      }
    } catch (_) {}

    // 4c. Visible (non-HttpOnly) auth cookies
    try {
      const authCookiePattern = /token|auth|session|jwt|sid/i;
      const cookies = document.cookie.split(';').map(c => c.trim());
      for (const cookie of cookies) {
        const name = cookie.split('=')[0].trim();
        if (name && authCookiePattern.test(name)) {
          result.authCookiesVisible.push(name);
        }
      }
    } catch (_) {}

    return result;
  });

  // Build findings from domResults

  // 2a. Password field exposed as text
  if (domResults.isLoginPage && domResults.passwordFieldType !== 'password') {
    findings.push({
      severity: 'critical',
      type: 'password-field-exposed',
      message: `Password field has type="${domResults.passwordFieldType}" instead of "password"`,
      selector: 'input[type="password"]',
    });
  }

  // 2b. Missing autocomplete on password field
  if (domResults.isLoginPage) {
    const ac = (domResults.passwordFieldAutocomplete || '').toLowerCase();
    if (ac !== 'current-password' && ac !== 'new-password') {
      findings.push({
        severity: 'low',
        type: 'password-no-autocomplete',
        message: `Password field missing autocomplete="current-password" or "new-password" (found: "${domResults.passwordFieldAutocomplete || 'none'}")`,
        selector: 'input[type="password"]',
      });
    }
  }

  // 2c. Form action placeholder with no JS handler
  if (domResults.isLoginPage) {
    const action = (domResults.formAction || '').trim();
    if ((action === '#' || action === '') && !domResults.formHasOnsubmit) {
      findings.push({
        severity: 'medium',
        type: 'form-action-placeholder',
        message: 'Login form action is "#" or empty and no detectable onsubmit handler found (React handlers not DOM-detectable)',
        selector: 'form',
      });
    }
  }

  // 2d. Remember me info
  if (domResults.isLoginPage && domResults.hasRememberMe) {
    findings.push({
      severity: 'info',
      type: 'remember-me-present',
      message: '"Remember me" checkbox found — verify token persistence policy (localStorage vs httpOnly cookie)',
      selector: 'input[type="checkbox"]',
    });
  }

  // 2e. No forgot password link
  if (domResults.isLoginPage && !domResults.hasForgotPassword) {
    findings.push({
      severity: 'low',
      type: 'no-forgot-password-link',
      message: 'Login form has no visible "forgot password" or "reset password" link',
      selector: 'form',
    });
  }

  // 4a. Tokens in localStorage
  for (const key of domResults.localStorageAuthKeys) {
    findings.push({
      severity: 'high',
      type: 'token-in-localstorage',
      message: `Auth token found in localStorage key "${key}" — tokens should be stored in httpOnly cookies`,
    });
  }

  // 4b. Tokens in sessionStorage
  for (const key of domResults.sessionStorageAuthKeys) {
    findings.push({
      severity: 'medium',
      type: 'token-in-sessionstorage',
      message: `Auth token found in sessionStorage key "${key}" — prefer httpOnly cookies over sessionStorage`,
    });
  }

  // 4c. Auth cookies visible to JS (not httpOnly)
  for (const name of domResults.authCookiesVisible) {
    findings.push({
      severity: 'medium',
      type: 'auth-cookie-not-httponly',
      message: `Auth-related cookie "${name}" is readable by JS — it is not HttpOnly. Set HttpOnly flag to prevent XSS token theft`,
    });
  }

  // 5. Protected route unauthenticated
  const protectedPatterns = /\/(dashboard|admin|settings|profile|account)(\/|$)/i;
  if (protectedPatterns.test(route) && !domResults.hasAuthIndicator) {
    findings.push({
      severity: 'info',
      type: 'protected-route-unauthenticated',
      message: `Route "${route}" looks like a protected page but no auth indicator detected — may indicate broken auth gate or unauthenticated state`,
    });
  }

  const report: AuthReport = {
    route,
    isLoginPage: domResults.isLoginPage,
    hasLogoutButton: domResults.hasLogoutButton,
    hasAuthIndicator: domResults.hasAuthIndicator,
    findings,
  };

  writeJsonArtifact('auth', `${routeName}-auth.json`, report);
  return report;
}
