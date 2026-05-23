import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type UserLifecycleFinding = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type UserLifecycleReport = {
  route: string;
  userManagementDetected: boolean;
  createUserFormDetected: boolean;
  permissionUIDetected: boolean;
  loginPageDetected: boolean;
  sessionChecked: boolean;
  findings: UserLifecycleFinding[];
};

export async function auditUserLifecycle(
  page: Page,
  route: string
): Promise<UserLifecycleReport> {
  const routeName = normalizeRoute(route);

  const report: UserLifecycleReport = {
    route,
    userManagementDetected: false,
    createUserFormDetected: false,
    permissionUIDetected: false,
    loginPageDetected: false,
    sessionChecked: false,
    findings: [],
  };

  // Early exit — check if any user management surface exists
  let hasSurface = false;
  try {
    hasSurface = await page.evaluate(() => {
      const keywords = /user|member|account|role|permission|admin|staff|invite|team/i;
      const text = document.body?.innerText ?? '';
      const hasForm = document.querySelector('form') !== null;
      const hasTable =
        document.querySelector('table, [role="grid"], [role="table"]') !== null;
      return keywords.test(text) && (hasForm || hasTable);
    });
  } catch {
    // can't evaluate — skip entire audit
    return report;
  }

  if (!hasSurface) {
    return report;
  }

  let screenshotCount = 0;

  const pushFinding = (f: UserLifecycleFinding) => {
    report.findings.push(f);
  };

  // CHECK 1: User management surface detection
  try {
    const surfaceResult = await page.evaluate(() => {
      const createUserBtnPattern =
        /create\s+user|add\s+user|invite\s+user|new\s+user/i;

      const allButtons = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a, [role="button"]'
        )
      );
      const createUserBtn = allButtons.find((el) =>
        createUserBtnPattern.test(el.textContent ?? '')
      );

      const userTable =
        document.querySelector('table, [role="grid"], [role="table"]') !== null;

      const hasAvatarEmailRow = (() => {
        const cells = Array.from(document.querySelectorAll('td, [role="cell"]'));
        return cells.some((cell) => /@[a-z0-9.-]+\.[a-z]{2,}/i.test(cell.textContent ?? ''));
      })();

      const roleHeadings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).some(
        (h) => /role|permission|access/i.test(h.textContent ?? '')
      );

      const roleClassEl =
        document.querySelector('[class*="role" i], [class*="permission" i]') !== null;

      const permissionUIDetected = roleHeadings || roleClassEl;

      const userManagementDetected = userTable && (hasAvatarEmailRow || !!createUserBtn);

      const createUserFormNearby =
        !!createUserBtn && document.querySelector('form') !== null;

      return {
        userManagementDetected,
        createUserFormDetected: createUserFormNearby,
        permissionUIDetected,
        createUserBtnFound: !!createUserBtn,
        hasForm: document.querySelector('form') !== null,
      };
    });

    report.userManagementDetected = surfaceResult.userManagementDetected;
    report.createUserFormDetected = surfaceResult.createUserFormDetected;
    report.permissionUIDetected = surfaceResult.permissionUIDetected;

    if (surfaceResult.createUserBtnFound && !surfaceResult.hasForm) {
      pushFinding({
        severity: 'medium',
        type: 'create-user-btn-no-form',
        message: 'Create/Invite user button found but no <form> element present on page',
      });
    }

    if (report.userManagementDetected && screenshotCount < 2) {
      try {
        await screenshotStep(page, route, 'user-management-surface');
        screenshotCount++;
      } catch {
        // screenshot failed — continue
      }
    }
  } catch {
    // CHECK 1 failed — continue
  }

  // CHECK 2: Create user form field audit
  let emailSelector: string | null = null;
  try {
    const formAudit = await page.evaluate(() => {
      const findings: Array<{ severity: string; type: string; message: string; selector?: string }> = [];
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));

      const isCreateUserForm = (form: HTMLFormElement): boolean => {
        const labels = Array.from(form.querySelectorAll('label, [placeholder], input, select, textarea'));
        const text = labels.map((el) => (el.textContent ?? '') + (el.getAttribute('placeholder') ?? '') + (el.getAttribute('name') ?? '')).join(' ');
        return /email|name|password|role/i.test(text);
      };

      let emailSel: string | null = null;

      for (const form of forms) {
        if (!isCreateUserForm(form)) continue;

        const emailInput = form.querySelector<HTMLInputElement>(
          'input[type="email"], input[name*="email" i], input[placeholder*="email" i]'
        );
        const passwordInputs = Array.from(
          form.querySelectorAll<HTMLInputElement>('input[type="password"]')
        );
        const roleInput = form.querySelector<HTMLElement>(
          'select[name*="role" i], [aria-label*="role" i], input[name*="role" i]'
        );
        const nameInput = form.querySelector<HTMLInputElement>(
          'input[name*="name" i], input[placeholder*="name" i]'
        );

        if (!emailInput) {
          findings.push({ severity: 'high', type: 'create-user-no-email-field', message: 'Create user form missing email field' });
        } else {
          // build a stable selector for CHECK 3
          emailSel =
            emailInput.id
              ? `#${emailInput.id}`
              : emailInput.name
              ? `input[name="${emailInput.name}"]`
              : 'input[type="email"]';
        }

        if (passwordInputs.length === 0) {
          findings.push({ severity: 'high', type: 'create-user-no-password-field', message: 'Create user form missing password field' });
        } else {
          for (const pw of passwordInputs) {
            if (pw.type !== 'password') {
              const sel = pw.id ? `#${pw.id}` : pw.name ? `input[name="${pw.name}"]` : 'input';
              findings.push({
                severity: 'critical',
                type: 'create-user-password-exposed',
                message: `Password field is not type="password" — value may be visible`,
                selector: sel,
              });
            }
          }

          if (passwordInputs.length < 2) {
            findings.push({ severity: 'medium', type: 'create-user-no-password-confirm', message: 'Create user form has no password confirmation field' });
          }

          const pwField = passwordInputs[0];
          const describedBy = pwField.getAttribute('aria-describedby');
          const hintNearby = pwField.parentElement?.querySelector('[class*="hint" i], [class*="help" i], [class*="strength" i]');
          if (!describedBy && !hintNearby) {
            findings.push({ severity: 'low', type: 'create-user-no-password-hint', message: 'No password strength indicator or hint near password field' });
          }
        }

        if (!roleInput) {
          findings.push({ severity: 'medium', type: 'create-user-no-role-field', message: 'Create user form missing role/permission selector' });
        }

        if (!nameInput) {
          findings.push({ severity: 'low', type: 'create-user-no-name-field', message: 'Create user form missing name field' });
        }

        break; // audit first matching form only
      }

      return { findings, emailSel };
    });

    for (const f of formAudit.findings) {
      pushFinding(f as UserLifecycleFinding);
    }
    emailSelector = formAudit.emailSel;
  } catch {
    // CHECK 2 failed — continue
  }

  // CHECK 3: Email validation interaction (fill only, no submit)
  if (report.createUserFormDetected && emailSelector) {
    try {
      const locator = page.locator(emailSelector).first();
      const isVisible = await locator.isVisible().catch(() => false);
      if (isVisible) {
        await locator.fill('notanemail');
        await page.waitForTimeout(300);

        const hasValidationError = await page.evaluate((sel) => {
          const input = document.querySelector<HTMLInputElement>(sel);
          if (!input) return false;
          if (input.getAttribute('aria-invalid') === 'true') return true;
          const parent = input.closest('div, fieldset, li') ?? input.parentElement;
          if (!parent) return false;
          return parent.querySelector('[class*="error" i], [class*="invalid" i]') !== null;
        }, emailSelector);

        if (!hasValidationError) {
          pushFinding({
            severity: 'high',
            type: 'create-user-no-email-validation',
            message: 'Invalid email value triggered no inline validation error on create user form',
            selector: emailSelector,
          });
        }

        await locator.fill('').catch(() => undefined);
      }
    } catch {
      // CHECK 3 failed — continue
    }
  }

  // CHECK 4: Permission / role UI audit
  try {
    const roleAudit = await page.evaluate(() => {
      const findings: Array<{ severity: string; type: string; message: string; selector?: string }> = [];

      const roleSelect = document.querySelector<HTMLSelectElement>(
        'select[name*="role" i], [aria-label*="role" i] select, [class*="role" i] select'
      );

      const permCheckboxes = Array.from(
        document.querySelectorAll<HTMLInputElement>('[class*="permission" i] input[type="checkbox"]')
      );

      if (roleSelect) {
        const options = Array.from(roleSelect.options);
        if (options.length <= 1) {
          findings.push({ severity: 'low', type: 'single-role-option', message: 'Role selector has only one option — no meaningful role choice' });
        }

        const hasAdminOption = options.some((o) =>
          /super\s*admin|owner/i.test(o.textContent ?? '')
        );
        if (hasAdminOption) {
          const confirmEl = document.querySelector('[aria-label*="confirm" i], [class*="confirm" i], [role="dialog"]');
          if (!confirmEl) {
            findings.push({ severity: 'medium', type: 'admin-role-no-confirmation', message: 'Super admin/Owner role assignable without visible confirmation dialog' });
          }
        }

        const hasDescriptions = options.some((o) => {
          const opt = o as HTMLOptionElement;
          return (opt.title ?? '') !== '' || (opt.getAttribute('data-description') ?? '') !== '';
        });
        const tooltipNearby = roleSelect.closest('[class*="role" i]')?.querySelector('[class*="tooltip" i], [class*="help" i]');
        if (!hasDescriptions && !tooltipNearby) {
          findings.push({ severity: 'low', type: 'role-no-description', message: 'Role options have no visible descriptions or tooltips' });
        }
      }

      if (permCheckboxes.length > 0) {
        findings.push({ severity: 'info', type: 'granular-permissions-found', message: `Granular permission checkboxes found (${permCheckboxes.length} items)` });
      }

      return findings;
    });

    for (const f of roleAudit) {
      pushFinding(f as UserLifecycleFinding);
    }
  } catch {
    // CHECK 4 failed — continue
  }

  // CHECK 5: User list table audit
  try {
    const tableAudit = await page.evaluate(() => {
      const findings: Array<{ severity: string; type: string; message: string; selector?: string }> = [];

      const table = document.querySelector<HTMLElement>('table, [role="grid"], [role="table"]');
      if (!table) return findings;

      // search/filter
      const searchInput = document.querySelector<HTMLInputElement>(
        'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]'
      );
      if (!searchInput) {
        findings.push({ severity: 'low', type: 'user-list-no-search', message: 'User list table has no search or filter input' });
      }

      // pagination + row count
      const rows = Array.from(table.querySelectorAll('tr, [role="row"]')).filter((r) => {
        const role = r.getAttribute('role');
        return role === 'row' || r.tagName === 'TR';
      });
      const dataRows = rows.length > 0 ? rows.length - 1 : 0; // subtract header row estimate
      const hasPagination = document.querySelector(
        '[aria-label*="pagination" i], [class*="pagination" i], nav[aria-label*="page" i]'
      ) !== null;
      if (!hasPagination && dataRows > 20) {
        findings.push({ severity: 'medium', type: 'user-list-no-pagination', message: `User list has ${dataRows} rows but no pagination control` });
      }

      // delete buttons without aria-label
      const deleteButtons = Array.from(
        document.querySelectorAll<HTMLElement>('button, [role="button"]')
      ).filter((btn) =>
        /delete|remove|deactivate/i.test(btn.textContent ?? '') ||
        /delete|remove/i.test(btn.getAttribute('aria-label') ?? '')
      );
      for (const btn of deleteButtons) {
        if (!btn.getAttribute('aria-label') && !btn.getAttribute('aria-labelledby')) {
          const sel = btn.id ? `#${btn.id}` : btn.className ? `.${btn.className.split(' ')[0]}` : 'button';
          findings.push({ severity: 'medium', type: 'user-delete-no-label', message: 'Delete/remove button lacks aria-label — screen reader cannot identify target', selector: sel });
        }
      }

      // bulk action without confirmation
      const bulkAction = document.querySelector<HTMLElement>(
        '[class*="bulk" i], [aria-label*="bulk" i]'
      );
      if (bulkAction) {
        const hasConfirm = !!document.querySelector('[role="dialog"], [class*="confirm" i]');
        if (!hasConfirm) {
          findings.push({ severity: 'medium', type: 'bulk-action-no-confirm', message: 'Bulk action UI present without visible confirmation dialog element' });
        }
      }

      // last login column
      const headers = Array.from(table.querySelectorAll('th, [role="columnheader"]'));
      const hasLastLogin = headers.some((h) =>
        /last\s*(login|active|seen)|activity/i.test(h.textContent ?? '')
      );
      if (!hasLastLogin) {
        findings.push({ severity: 'info', type: 'user-list-no-last-login', message: 'User list has no "Last login" or activity column' });
      }

      // email column
      const hasEmailCol = headers.some((h) => /email/i.test(h.textContent ?? ''));
      if (!hasEmailCol) {
        findings.push({ severity: 'low', type: 'user-list-no-email-column', message: 'User list table has no email column' });
      }

      return findings;
    });

    for (const f of tableAudit) {
      pushFinding(f as UserLifecycleFinding);
    }
  } catch {
    // CHECK 5 failed — continue
  }

  // CHECK 6: Session management surface
  try {
    report.sessionChecked = true;
    const sessionAudit = await page.evaluate(() => {
      const findings: Array<{ severity: string; type: string; message: string; selector?: string }> = [];

      // JS-readable cookies (HttpOnly cookies are not visible here)
      const cookieStr = document.cookie;
      if (cookieStr) {
        const cookieNames = cookieStr.split(';').map((c) => c.trim().split('=')[0]);
        for (const name of cookieNames) {
          if (/session|auth|token|jwt|sid/i.test(name)) {
            findings.push({
              severity: 'info',
              type: 'session-cookie-detected',
              message: `Session/auth cookie detected via JS (name: "${name}"). HttpOnly status unknown from JS — verify server sets HttpOnly flag.`,
            });
          }
        }
      }

      // localStorage auth tokens
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) ?? '';
          if (/auth|token|session|jwt/i.test(key)) {
            findings.push({
              severity: 'high',
              type: 'auth-token-in-localstorage',
              message: `Auth/session token stored in localStorage (key: "${key}") — accessible to XSS`,
            });
          }
        }
      } catch {
        // localStorage blocked
      }

      // sessionStorage auth tokens
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i) ?? '';
          if (/auth|token|session|jwt/i.test(key)) {
            findings.push({
              severity: 'medium',
              type: 'auth-token-in-sessionstorage',
              message: `Auth/session token stored in sessionStorage (key: "${key}") — accessible to XSS`,
            });
          }
        }
      } catch {
        // sessionStorage blocked
      }

      // Active sessions / devices / security link
      const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
      const sessionLink = allLinks.find((a) =>
        /active\s+sessions?|connected\s+devices?|security/i.test(a.textContent ?? '')
      );
      if (sessionLink) {
        findings.push({ severity: 'info', type: 'active-sessions-ui-found', message: 'Link to active sessions/devices/security section found' });
      }

      // Logout all devices
      const allButtons = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'));
      const logoutAll = allButtons.find((el) =>
        /log\s*out\s*(all|every|everywhere)|sign\s*out\s*(all|every|everywhere)/i.test(el.textContent ?? '')
      );
      if (logoutAll) {
        findings.push({ severity: 'info', type: 'logout-all-sessions-found', message: '"Log out all devices/sessions" control found' });
      } else {
        findings.push({ severity: 'low', type: 'no-logout-all-sessions', message: 'No "Log out all devices/sessions" control found' });
      }

      return findings;
    });

    for (const f of sessionAudit) {
      pushFinding(f as UserLifecycleFinding);
    }
  } catch {
    // CHECK 6 failed — continue
  }

  // CHECK 7: Login page checks
  try {
    const loginAudit = await page.evaluate(() => {
      const findings: Array<{ severity: string; type: string; message: string; selector?: string }> = [];

      const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
      let loginFormFound = false;

      for (const form of forms) {
        const emailInput = form.querySelector<HTMLInputElement>(
          'input[type="email"], input[name*="email" i], input[name*="username" i]'
        );
        const passwordInput = form.querySelector<HTMLInputElement>('input[type="password"]');
        if (!emailInput || !passwordInput) continue;

        loginFormFound = true;

        const captchaEl = document.querySelector(
          '[class*="captcha" i], [id*="captcha" i], [class*="recaptcha" i], iframe[src*="recaptcha"]'
        );
        const rateLimitMsg = document.querySelector('[class*="rate" i], [class*="limit" i]');
        if (!captchaEl && !rateLimitMsg) {
          findings.push({ severity: 'low', type: 'login-no-rate-limit-indicator', message: 'No CAPTCHA or rate-limit messaging visible on login form' });
        }

        const forgotLink = document.querySelector<HTMLAnchorElement>(
          'a[href*="forgot" i], a[href*="reset" i], a'
        );
        const hasForgot = Array.from(document.querySelectorAll<HTMLElement>('a')).some((a) =>
          /forgot\s+password|reset\s+password/i.test(a.textContent ?? '')
        );
        if (!hasForgot) {
          findings.push({ severity: 'medium', type: 'login-no-forgot-password', message: 'No "Forgot password" link found on login form' });
        }

        const rememberMe = form.querySelector<HTMLInputElement>(
          'input[type="checkbox"][name*="remember" i], input[type="checkbox"][id*="remember" i]'
        );
        if (!rememberMe) {
          findings.push({ severity: 'info', type: 'login-no-remember-me', message: 'Login form has no "Remember me" option' });
        }

        const pwAc = passwordInput.getAttribute('autocomplete') ?? '';
        if (!pwAc.includes('current-password')) {
          findings.push({
            severity: 'low',
            type: 'login-password-no-autocomplete',
            message: 'Login password field missing autocomplete="current-password"',
            selector: passwordInput.id ? `#${passwordInput.id}` : 'input[type=password]',
          });
        }

        const emailAc = emailInput.getAttribute('autocomplete') ?? '';
        if (!emailAc.includes('email') && !emailAc.includes('username')) {
          findings.push({
            severity: 'low',
            type: 'login-username-no-autocomplete',
            message: 'Login email/username field missing autocomplete="email" or "username"',
            selector: emailInput.id ? `#${emailInput.id}` : 'input[type=email]',
          });
        }

        findings.push({ severity: 'info', type: 'login-lockout-not-testable', message: 'Account lockout after failed attempts cannot be tested without form submission' });
        findings.push({ severity: 'info', type: 'login-form-standard-structure', message: 'Login form has standard structure (email + password in same <form>)' });

        break;
      }

      return { findings, loginFormFound };
    });

    report.loginPageDetected = loginAudit.loginFormFound;
    for (const f of loginAudit.findings) {
      pushFinding(f as UserLifecycleFinding);
    }
  } catch {
    // CHECK 7 failed — continue
  }

  // CHECK 8: Logout surface checks
  try {
    const logoutAudit = await page.evaluate(() => {
      const findings: Array<{ severity: string; type: string; message: string; selector?: string }> = [];

      const allEls = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'));
      const logoutEl = allEls.find((el) =>
        /log\s*out|sign\s*out|logout|signout/i.test(el.textContent ?? '') ||
        /log\s*out|sign\s*out|logout|signout/i.test(el.getAttribute('aria-label') ?? '')
      );

      const isAuthenticatedLooking = (() => {
        const hasAvatar = document.querySelector('[class*="avatar" i], [class*="user-menu" i], [class*="profile-pic" i]') !== null;
        const hasDashboard = /dashboard|settings|profile/i.test(document.title);
        return hasAvatar || hasDashboard;
      })();

      if (!logoutEl) {
        if (isAuthenticatedLooking) {
          findings.push({ severity: 'high', type: 'no-logout-button', message: 'No logout/sign-out button found on what appears to be an authenticated page' });
        }
      } else {
        const tagName = logoutEl.tagName.toLowerCase();
        if (tagName === 'a') {
          const href = (logoutEl as HTMLAnchorElement).href ?? '';
          const isGetLogout = /logout|signout|sign-out|log-out/i.test(href);
          const hasPostForm = !!document.querySelector('form[action*="logout" i], form[action*="sign-out" i]');
          if (isGetLogout && !hasPostForm) {
            findings.push({
              severity: 'medium',
              type: 'logout-via-get',
              message: `Logout is a GET link (href="${href.slice(0, 80)}") without a POST form — potential CSRF risk`,
              selector: href,
            });
          }
        }

        const tabindex = logoutEl.getAttribute('tabindex');
        if (tabindex === '-1') {
          findings.push({
            severity: 'medium',
            type: 'logout-not-keyboard-accessible',
            message: 'Logout element has tabindex="-1" — not reachable by keyboard (WCAG 2.1.1)',
          });
        }
      }

      return findings;
    });

    for (const f of logoutAudit) {
      pushFinding(f as UserLifecycleFinding);
    }
  } catch {
    // CHECK 8 failed — continue
  }

  // CHECK 9: Multi-session & concurrent session management
  try {
    const sessionMgmtAudit = await page.evaluate(() => {
      const findings: Array<{ severity: string; type: string; message: string }> = [];

      const sessionSection = document.querySelector<HTMLElement>(
        '[class*="session" i], [class*="device" i], [aria-label*="session" i], [aria-label*="device" i]'
      );
      if (!sessionSection) return findings;

      const hasCurrentLabel = /current|this\s+session|this\s+device/i.test(sessionSection.textContent ?? '');
      if (!hasCurrentLabel) {
        // session list present but current session not highlighted — informational only, not a finding
      }

      const revokeBtn = sessionSection.querySelector<HTMLElement>(
        'button, [role="button"]'
      );
      const revokeText = revokeBtn
        ? /revoke|remove|end\s+session|sign\s+out/i.test(revokeBtn.textContent ?? '')
        : false;
      if (!revokeText) {
        findings.push({ severity: 'medium', type: 'session-no-revoke-button', message: 'Session list found but no per-session revoke/end button' });
      }

      const hasMetadata =
        /ip\s*address|\d{1,3}\.\d{1,3}\.\d{1,3}|chrome|firefox|safari|last\s*active/i.test(
          sessionSection.textContent ?? ''
        );
      if (!hasMetadata) {
        findings.push({ severity: 'low', type: 'session-no-metadata', message: 'Session list does not show IP, browser, or last active metadata' });
      }

      return findings;
    });

    for (const f of sessionMgmtAudit) {
      pushFinding(f as UserLifecycleFinding);
    }
  } catch {
    // CHECK 9 failed — continue
  }

  // CHECK 10: Password reset / account recovery surface
  try {
    const recoveryAudit = await page.evaluate(() => {
      const findings: Array<{ severity: string; type: string; message: string }> = [];

      const allLinks = Array.from(document.querySelectorAll<HTMLElement>('a'));
      const forgotLink = allLinks.find((a) =>
        /forgot\s+password|reset\s+password/i.test(a.textContent ?? '')
      );
      if (forgotLink) {
        findings.push({ severity: 'info', type: 'forgot-password-link-found', message: 'Forgot/reset password link found' });
      }

      const securityQuestions = document.querySelector<HTMLElement>(
        '[class*="security-question" i], [name*="security_question" i], label'
      );
      const hasSecQuestion = Array.from(document.querySelectorAll('label')).some((l) =>
        /security\s+question|secret\s+question/i.test(l.textContent ?? '')
      );
      if (hasSecQuestion) {
        findings.push({ severity: 'low', type: 'security-questions-found', message: 'Security questions detected — weak account recovery method' });
      }

      const mfaOption = document.querySelector<HTMLElement>(
        '[class*="mfa" i], [class*="2fa" i], [class*="two-factor" i], [aria-label*="two-factor" i], [aria-label*="2fa" i]'
      );
      const hasMfaText = /two.factor|2fa|multi.factor|authenticator/i.test(document.body?.innerText ?? '');
      if (mfaOption || hasMfaText) {
        findings.push({ severity: 'info', type: 'mfa-option-found', message: 'MFA/2FA setup option detected on page' });
      }

      return findings;
    });

    for (const f of recoveryAudit) {
      pushFinding(f as UserLifecycleFinding);
    }
  } catch {
    // CHECK 10 failed — continue
  }

  // Screenshot if any CRITICAL/HIGH finding
  const hasSevereFinding = report.findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high'
  );
  if (hasSevereFinding && screenshotCount < 2) {
    try {
      await screenshotStep(page, route, 'user-lifecycle-findings');
      screenshotCount++;
    } catch {
      // screenshot failed — continue
    }
  }

  writeJsonArtifact('user-lifecycle', `${routeName}-user-lifecycle.json`, report);
  return report;
}
