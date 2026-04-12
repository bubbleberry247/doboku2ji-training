// db.gs — Spreadsheet DB layer for doboku2ji-training

var SHEETS = {
  Config: 'Config',
  Users: 'Users',
  QuestionBank: 'QuestionBank',
  Notes: 'Notes',
  SelfScores: 'SelfScores'
};

var HEADERS = {};
HEADERS[SHEETS.Config] = ['key', 'value'];
HEADERS[SHEETS.Users] = ['userKey', 'email', 'displayName', 'createdAt', 'recoveryCode'];
HEADERS[SHEETS.QuestionBank] = [
  'qId', 'year', 'number', 'questionType',
  'stem', 'modelAnswer', 'tags', 'status', 'updatedAt'
];
HEADERS[SHEETS.Notes] = [
  'noteId', 'userKey', 'qId', 'noteText', 'updatedAt'
];
HEADERS[SHEETS.SelfScores] = [
  'scoreId', 'userKey', 'qId', 'score', 'updatedAt'
];

// ============================================================
// DB ID management
// ============================================================
function getScriptProps_() {
  return PropertiesService.getScriptProperties();
}

function getDbId_() {
  return getScriptProps_().getProperty('DB_SPREADSHEET_ID') || '';
}

function setDbId_(id) {
  getScriptProps_().setProperty('DB_SPREADSHEET_ID', id);
}

var _dbInstance = null;
var _dbId = null;
function getDb_() {
  var id = getDbId_();
  if (!id) {
    throw new Error('DBが未設定です。setup_()を実行してください。');
  }
  if (_dbInstance && _dbId === id) return _dbInstance;
  _dbId = id;
  _dbInstance = SpreadsheetApp.openById(id);
  return _dbInstance;
}

function getSheet_(name) {
  var ss = getDb_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    throw new Error('シートが見つかりません: ' + name);
  }
  return sh;
}

function ensureSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function setHeaders_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

// ============================================================
// Generic CRUD helpers
// ============================================================

/**
 * Normalize header: trim, remove BOM, lowercase first char if needed.
 */
function normalizeHeader_(h, i) {
  var s = String(h || '').trim().replace(/^\uFEFF/, '');
  return s;
}

/**
 * Read all rows from a sheet as objects keyed by header names.
 */
function readRecords_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0].map(function(h, i) { return normalizeHeader_(h, i); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Append a 2D array of rows to a sheet.
 */
function appendRows_(sheet, rows) {
  if (!rows || rows.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
    .setValues(rows);
}

// ============================================================
// Config helpers
// ============================================================

function getConfigMap_() {
  return getCachedConfig_();
}

function getConfigValue_(map, key, defVal) {
  return map.hasOwnProperty(key) ? map[key] : defVal;
}

var _configCache = null;
var _configCacheTs = 0;
var CONFIG_CACHE_TTL = 300000; // 5 minutes in ms

function getCachedConfig_() {
  var now = Date.now();
  if (_configCache && (now - _configCacheTs) < CONFIG_CACHE_TTL) {
    return _configCache;
  }
  var sh = getSheet_(SHEETS.Config);
  var values = sh.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var key = normalizeHeader_(values[i][0], 0);
    if (key) map[key] = values[i][1];
  }
  _configCache = map;
  _configCacheTs = now;
  return map;
}

// ============================================================
// User helpers
// ============================================================

function findUserByKey_(userKey) {
  var sh = getSheet_(SHEETS.Users);
  var records = readRecords_(sh);
  for (var i = 0; i < records.length; i++) {
    if (String(records[i].userKey) === String(userKey)) return records[i];
  }
  return null;
}

function findUserByRecoveryCode_(code) {
  var sh = getSheet_(SHEETS.Users);
  var records = readRecords_(sh);
  var upper = String(code || '').trim().toUpperCase();
  for (var i = 0; i < records.length; i++) {
    if (String(records[i].recoveryCode || '').toUpperCase() === upper) return records[i];
  }
  return null;
}

function ensureUser_(userKey, email, displayName) {
  var existing = findUserByKey_(userKey);
  if (existing) return existing;
  var now = new Date().toISOString();
  var code = generateRecoveryCode_();
  var sh = getSheet_(SHEETS.Users);
  appendRows_(sh, [[userKey, email || '', displayName || '', now, code]]);
  return { userKey: userKey, email: email || '', displayName: displayName || '', createdAt: now, recoveryCode: code };
}

var RECOVERY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRecoveryCode_() {
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += RECOVERY_CODE_CHARS.charAt(Math.floor(Math.random() * RECOVERY_CODE_CHARS.length));
  }
  // Check uniqueness
  if (findUserByRecoveryCode_(code)) return generateRecoveryCode_();
  return code;
}

// ============================================================
// QuestionBank helpers
// ============================================================

var _questionsCache = null;
var _questionsCacheTs = 0;
var QUESTIONS_CACHE_TTL = 3600000; // 1 hour

function getCachedQuestions_() {
  var now = Date.now();
  if (_questionsCache && (now - _questionsCacheTs) < QUESTIONS_CACHE_TTL) {
    return _questionsCache;
  }
  var sh = getSheet_(SHEETS.QuestionBank);
  var values = sh.getDataRange().getValues();
  if (values.length <= 1) {
    _questionsCache = [];
    _questionsCacheTs = now;
    return [];
  }
  var headers = values[0].map(function(h, i) { return normalizeHeader_(h, i); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    if (String(obj.status || '').trim() !== 'published') continue;
    rows.push(obj);
  }
  _questionsCache = rows;
  _questionsCacheTs = now;
  return rows;
}

function clearQuestionsCache_() {
  _questionsCache = null;
  _questionsCacheTs = 0;
}

// ============================================================
// Notes helpers
// ============================================================

function getNoteByUserAndQ_(userKey, qId) {
  var sh = getSheet_(SHEETS.Notes);
  var records = readRecords_(sh);
  for (var i = 0; i < records.length; i++) {
    if (String(records[i].userKey) === String(userKey) &&
        String(records[i].qId) === String(qId)) {
      return records[i];
    }
  }
  return null;
}

function upsertNote_(userKey, qId, noteText) {
  var sh = getSheet_(SHEETS.Notes);
  var values = sh.getDataRange().getValues();
  if (values.length > 1) {
    var headers = values[0].map(function(h, i) { return normalizeHeader_(h, i); });
    var ukIdx = headers.indexOf('userKey');
    var qIdx = headers.indexOf('qId');
    var txtIdx = headers.indexOf('noteText');
    var tsIdx = headers.indexOf('updatedAt');
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][ukIdx]) === String(userKey) &&
          String(values[i][qIdx]) === String(qId)) {
        sh.getRange(i + 1, txtIdx + 1).setValue(noteText);
        sh.getRange(i + 1, tsIdx + 1).setValue(new Date().toISOString());
        return;
      }
    }
  }
  // Insert new
  var noteId = 'N_' + userKey + '_' + qId + '_' + Date.now();
  var now = new Date().toISOString();
  appendRows_(sh, [[noteId, userKey, qId, noteText, now]]);
}

// ============================================================
// SelfScore helpers
// ============================================================

function getSelfScoreByUserAndQ_(userKey, qId) {
  var sh = getSheet_(SHEETS.SelfScores);
  var records = readRecords_(sh);
  for (var i = 0; i < records.length; i++) {
    if (String(records[i].userKey) === String(userKey) &&
        String(records[i].qId) === String(qId)) {
      return records[i];
    }
  }
  return null;
}

function upsertSelfScore_(userKey, qId, score) {
  var sh = getSheet_(SHEETS.SelfScores);
  var values = sh.getDataRange().getValues();
  if (values.length > 1) {
    var headers = values[0].map(function(h, i) { return normalizeHeader_(h, i); });
    var ukIdx = headers.indexOf('userKey');
    var qIdx = headers.indexOf('qId');
    var scIdx = headers.indexOf('score');
    var tsIdx = headers.indexOf('updatedAt');
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][ukIdx]) === String(userKey) &&
          String(values[i][qIdx]) === String(qId)) {
        sh.getRange(i + 1, scIdx + 1).setValue(score);
        sh.getRange(i + 1, tsIdx + 1).setValue(new Date().toISOString());
        return;
      }
    }
  }
  var scoreId = 'S_' + userKey + '_' + qId + '_' + Date.now();
  var now = new Date().toISOString();
  appendRows_(sh, [[scoreId, userKey, qId, score, now]]);
}
