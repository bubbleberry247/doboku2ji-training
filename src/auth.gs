// auth.gs — simple anonymous/name-based auth (no Google OAuth required)
//
// Auth flow:
//   1. User opens the app — localStorage has userKey? → auto-login
//   2. No userKey → prompt for display name → server creates user + recovery code
//   3. On another device → enter 6-char recovery code → link same user
//
// Server-side user context is resolved via __clientUserKey (set per request)

var __clientUserKey = '';

function getActiveEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

/**
 * Register a new user with a display name.
 * Returns { ok, userKey, displayName, recoveryCode } or { _error, message }
 */
function apiRegister(displayName, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    if (!displayName || String(displayName).trim() === '') {
      return { _error: true, message: '名前を入力してください' };
    }
    var name = String(displayName).trim().substring(0, 40);
    var email = getActiveEmail_();
    var userKey = email || ('U_' + Utilities.getUuid().replace(/-/g, '').substring(0, 16));
    var user = ensureUser_(userKey, email, name);
    return { ok: true, userKey: user.userKey, displayName: user.displayName, recoveryCode: user.recoveryCode };
  } catch (e) {
    return { _error: true, message: '登録エラー: ' + String(e.message || e) };
  }
}

/**
 * Restore session from recovery code.
 * Returns { ok, userKey, displayName, recoveryCode } or { _error, message }
 */
function apiRestoreByCode(code, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    if (!code || String(code).trim() === '') {
      return { _error: true, message: '復元コードを入力してください' };
    }
    var user = findUserByRecoveryCode_(String(code).trim());
    if (!user) {
      return { _error: true, message: '復元コードが見つかりません' };
    }
    return { ok: true, userKey: user.userKey, displayName: user.displayName, recoveryCode: user.recoveryCode };
  } catch (e) {
    return { _error: true, message: '復元エラー: ' + String(e.message || e) };
  }
}
