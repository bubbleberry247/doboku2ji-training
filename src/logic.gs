// logic.gs — business logic helpers

var SCRIPT_OWNER_EMAIL = 'kalimistk@gmail.com';
var SCRIPT_OWNER_DISPLAY_NAME = '開発者';

function getConfigMap_() {
  return getCachedConfig_();
}

function getConfigValue_(map, key, defVal) {
  if (map && map.hasOwnProperty(key)) return map[key];
  return defVal;
}

/**
 * Return all distinct years from the QuestionBank (published questions only).
 * Each year entry: { year, count }
 */
function getYearSummary_() {
  var questions = getCachedQuestions_();
  var map = {};
  for (var i = 0; i < questions.length; i++) {
    var y = String(questions[i].year || '').trim();
    if (!y) continue;
    map[y] = (map[y] || 0) + 1;
  }
  // Sort years: H28 < H29 < ... < R1 < R2 < ... (era-aware)
  var years = Object.keys(map);
  years.sort(function(a, b) {
    return eraToSeinen_(a) - eraToSeinen_(b);
  });
  return years.map(function(y) { return { year: y, count: map[y] }; });
}

/**
 * Convert Japanese era year string to approximate Gregorian year for sorting.
 * H28 → 2016, R1 → 2019, R7 → 2025, etc.
 */
function eraToSeinen_(str) {
  var m = str.match(/^([HR])(\d+)$/);
  if (!m) return 0;
  var era = m[1];
  var y = parseInt(m[2], 10);
  if (era === 'H') return 1988 + y; // Heisei: H1=1989
  if (era === 'R') return 2018 + y; // Reiwa: R1=2019
  return 0;
}

/**
 * Return questions for a specific year.
 * Each question: { qId, year, number, questionType, stem, modelAnswer, tags }
 * Note: stem/modelAnswer may be long — truncate stem for list view.
 */
function getQuestionsByYear_(year) {
  var questions = getCachedQuestions_();
  var result = [];
  for (var i = 0; i < questions.length; i++) {
    if (String(questions[i].year || '').trim() === String(year).trim()) {
      result.push(questions[i]);
    }
  }
  // Sort by question number
  result.sort(function(a, b) {
    return parseInt(String(a.number || '0'), 10) - parseInt(String(b.number || '0'), 10);
  });
  return result;
}

/**
 * Return a single question by qId.
 */
function getQuestionById_(qId) {
  var questions = getCachedQuestions_();
  for (var i = 0; i < questions.length; i++) {
    if (String(questions[i].qId) === String(qId)) return questions[i];
  }
  return null;
}

function getUserAccessSheet_() {
  var db = getDb_();
  var sh = db.getSheetByName(SHEETS.UserAccess);
  if (!sh) sh = db.insertSheet(SHEETS.UserAccess);
  ensureUserAccessDashboardSchema_(sh);
  return sh;
}

function getUserAccessByEmail_(email) {
  var target = String(email || '').trim().toLowerCase();
  var isOwner = target === SCRIPT_OWNER_EMAIL;
  var rows = readRecordsFromSheet_(getUserAccessSheet_());
  for (var i = 0; i < rows.length; i++) {
    var rowEmail = String(rows[i].email || '').trim().toLowerCase();
    if (rowEmail !== target) continue;
    var access = {
      email: target,
      role: String(rows[i].role || 'user').trim().toLowerCase(),
      managerEmail: String(rows[i].managerEmail || '').trim().toLowerCase(),
      active: normalizeUserAccessBoolean_(rows[i].active, true) !== 'false',
      displayName: String(rows[i].displayName || '').trim(),
      showInDashboard: normalizeUserAccessBoolean_(rows[i].showInDashboard, true) !== 'false'
    };
    if (isOwner) {
      access.role = 'admin';
      access.active = true;
      access.displayName = access.displayName || SCRIPT_OWNER_DISPLAY_NAME;
      access.showInDashboard = false;
    }
    return access;
  }
  if (isOwner) {
    return {
      email: target,
      role: 'admin',
      managerEmail: '',
      active: true,
      displayName: SCRIPT_OWNER_DISPLAY_NAME,
      showInDashboard: false
    };
  }
  return { email: target, role: 'user', managerEmail: '', active: false, displayName: '', showInDashboard: false };
}

function ensureScriptOwnerInUserAccess_() {
  var sh = getUserAccessSheet_();
  var rows = readRecordsFromSheet_(sh);
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].email || '').trim().toLowerCase() === SCRIPT_OWNER_EMAIL) {
      var rowNo = i + 2;
      sh.getRange(rowNo, 2).setValue('admin');
      sh.getRange(rowNo, 4).setValue('true');
      sh.getRange(rowNo, 5).setValue(now);
      sh.getRange(rowNo, 6).setValue(SCRIPT_OWNER_DISPLAY_NAME);
      sh.getRange(rowNo, 7).setValue('false');
      return;
    }
  }
  sh.appendRow([SCRIPT_OWNER_EMAIL, 'admin', '', 'true', now, SCRIPT_OWNER_DISPLAY_NAME, 'false']);
}

function getUserContextByKey_(clientUserKey) {
  var user = findUserByKey_(clientUserKey);
  if (!user) return { userKey: '', email: '', displayName: '', role: 'guest', active: false, isAdmin: false, isManager: false };
  var access = getUserAccessByEmail_(user.email || user.userKey);
  var role = access && access.active ? access.role : 'user';
  return {
    userKey: user.userKey,
    email: String(user.email || '').trim().toLowerCase(),
    displayName: access.displayName || user.displayName || '',
    role: role,
    active: access ? access.active : true,
    isAdmin: role === 'admin',
    isManager: role === 'admin' || role === 'manager'
  };
}

function getCurrentAuthInfo_(clientUserKey) {
  var ctx = getUserContextByKey_(clientUserKey);
  return {
    userKey: ctx.userKey,
    email: ctx.email,
    displayName: ctx.displayName,
    role: ctx.role,
    isAdmin: ctx.isAdmin,
    isManager: ctx.isManager
  };
}

function requireAdmin_(clientUserKey) {
  var ctx = getUserContextByKey_(clientUserKey);
  if (!ctx.isAdmin) throw new Error('管理者権限が必要です');
  return ctx;
}

function requireManager_(clientUserKey) {
  var ctx = getUserContextByKey_(clientUserKey);
  if (!ctx.isManager) throw new Error('管理者権限が必要です');
  return ctx;
}
