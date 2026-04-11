// api.gs — public API functions called via google.script.run

// Global serializer: convert Date objects to ISO strings
function toSerializable_(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(toSerializable_);
  if (typeof obj === 'object') {
    var result = {};
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) result[k] = toSerializable_(obj[k]);
    }
    return result;
  }
  return obj;
}

// ============================================================
// Home screen: year list
// ============================================================

/**
 * Return home screen data: list of years with question counts.
 * @param {string} clientUserKey
 * @return {{ years: Array<{year,count}> }} or { _error, message }
 */
function apiGetHome(clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var years = getYearSummary_();
    return toSerializable_({ years: years });
  } catch (e) {
    return { _error: true, message: 'ホーム取得エラー: ' + String(e.message || e) };
  }
}

// ============================================================
// Question list by year
// ============================================================

/**
 * Return questions for a specific year (list view: stem truncated to 120 chars).
 * @param {string} year e.g. 'R7'
 * @param {string} clientUserKey
 * @return {{ questions: Array }} or { _error, message }
 */
function apiGetQuestionsByYear(year, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var qs = getQuestionsByYear_(year);
    var list = qs.map(function(q) {
      return {
        qId: q.qId,
        year: q.year,
        number: q.number,
        questionType: q.questionType,
        stem: String(q.stem || '').substring(0, 120),
        tags: q.tags
      };
    });
    return toSerializable_({ questions: list });
  } catch (e) {
    return { _error: true, message: '問題一覧取得エラー: ' + String(e.message || e) };
  }
}

// ============================================================
// Question detail (full stem + model answer + user note/score)
// ============================================================

/**
 * Return full question detail including user's saved note and self-score.
 * @param {string} qId
 * @param {string} clientUserKey
 * @return {{ question, note, selfScore }} or { _error, message }
 */
function apiGetQuestion(qId, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var q = getQuestionById_(qId);
    if (!q) return { _error: true, message: '問題が見つかりません: ' + qId };

    var note = '';
    var selfScore = '';
    var userKey = String(clientUserKey || '').trim();
    if (userKey) {
      var noteRec = getNoteByUserAndQ_(userKey, qId);
      note = noteRec ? String(noteRec.noteText || '') : '';
      var scoreRec = getSelfScoreByUserAndQ_(userKey, qId);
      selfScore = scoreRec ? String(scoreRec.score || '') : '';
    }

    return toSerializable_({
      question: {
        qId: q.qId,
        year: q.year,
        number: q.number,
        questionType: q.questionType,
        stem: q.stem,
        modelAnswer: q.modelAnswer,
        tags: q.tags
      },
      note: note,
      selfScore: selfScore
    });
  } catch (e) {
    return { _error: true, message: '問題取得エラー: ' + String(e.message || e) };
  }
}

// ============================================================
// Save note
// ============================================================

/**
 * Save or update a user's note for a question.
 * @param {string} qId
 * @param {string} noteText
 * @param {string} clientUserKey
 * @return {{ ok: true }} or { _error, message }
 */
function apiSaveNote(qId, noteText, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    if (!userKey) return { _error: true, message: 'ログインが必要です' };
    upsertNote_(userKey, qId, String(noteText || ''));
    return { ok: true };
  } catch (e) {
    return { _error: true, message: 'メモ保存エラー: ' + String(e.message || e) };
  }
}

// ============================================================
// Save self-score
// ============================================================

/**
 * Save or update a user's self-score for a question.
 * @param {string} qId
 * @param {string} score  e.g. '◎', '○', '△', '×'
 * @param {string} clientUserKey
 * @return {{ ok: true }} or { _error, message }
 */
function apiSaveSelfScore(qId, score, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    if (!userKey) return { _error: true, message: 'ログインが必要です' };
    upsertSelfScore_(userKey, qId, String(score || ''));
    return { ok: true };
  } catch (e) {
    return { _error: true, message: '自己採点保存エラー: ' + String(e.message || e) };
  }
}

// ============================================================
// Import questions from CSV data
// ============================================================

/**
 * Bulk import questions from a 2D array (rows without header).
 * Each row: [qId, year, number, questionType, stem, modelAnswer, tags]
 * Skips rows where qId already exists.
 * @param {Array<Array>} rows
 * @param {string} clientUserKey
 * @return {{ imported, skipped }} or { _error, message }
 */
function apiImportQuestions(rows, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return { _error: true, message: 'データが空です' };
    }
    var sh = getSheet_(SHEETS.QuestionBank);
    var existing = readRecords_(sh);
    var existingIds = {};
    existing.forEach(function(r) { existingIds[String(r.qId)] = true; });

    var now = new Date().toISOString();
    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var qId = String(r[0] || '').trim();
      if (!qId) { skipped++; continue; }
      if (existingIds[qId]) { skipped++; continue; }
      toInsert.push([
        qId,
        String(r[1] || '').trim(),   // year
        String(r[2] || '').trim(),   // number
        String(r[3] || 'essay').trim(), // questionType
        String(r[4] || '').trim(),   // stem
        String(r[5] || '').trim(),   // modelAnswer
        String(r[6] || '').trim(),   // tags
        'published',                 // status
        now                          // updatedAt
      ]);
    }
    appendRows_(sh, toInsert);
    clearQuestionsCache_();
    return { imported: toInsert.length, skipped: skipped };
  } catch (e) {
    return { _error: true, message: 'インポートエラー: ' + String(e.message || e) };
  }
}
