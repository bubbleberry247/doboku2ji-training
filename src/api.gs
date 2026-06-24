var __clientUserKey = '';
var DOBOKU2JI_PROGRAM_START_DATE_ = '2026-07-01';
var DOBOKU2JI_EXAM_DATE_ = '2026-10-04';

function parseDobokuMiniDateUtc_(value) {
  var m = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function getDobokuMiniTodayUtc_() {
  var now = new Date();
  var jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate());
}

function weeksSinceDobokuMiniStart_() {
  var startUtc = parseDobokuMiniDateUtc_(DOBOKU2JI_PROGRAM_START_DATE_);
  if (startUtc === null) return -1;
  var days = Math.floor((getDobokuMiniTodayUtc_() - startUtc) / 86400000);
  if (days < 0) return -1;
  return Math.floor(days / 7);
}

function formatDobokuMiniDateRange_(unlockWeek) {
  var startUtc = parseDobokuMiniDateUtc_(DOBOKU2JI_PROGRAM_START_DATE_);
  if (startUtc === null) return '';
  var weekStart = startUtc + Number(unlockWeek || 0) * 7 * 86400000;
  var weekEnd = weekStart + 6 * 86400000;
  var examUtc = parseDobokuMiniDateUtc_(DOBOKU2JI_EXAM_DATE_);
  if (examUtc !== null && weekEnd >= examUtc) weekEnd = examUtc - 86400000;
  var s = new Date(weekStart);
  var e = new Date(weekEnd);
  return (s.getUTCMonth() + 1) + '月' + s.getUTCDate() + '日〜' +
    (e.getUTCMonth() + 1) + '月' + e.getUTCDate() + '日';
}

function buildDobokuRangeParts_(refs) {
  var parts = [];
  var current = null;
  refs.forEach(function(ref) {
    if (!current || current.year !== ref.year || current.to + 1 !== ref.number) {
      if (current) parts.push(current);
      current = { year: ref.year, from: ref.number, to: ref.number };
    } else {
      current.to = ref.number;
    }
  });
  if (current) parts.push(current);
  return parts;
}

function formatDobokuRangePart_(part) {
  if (Number(part.from) === Number(part.to)) return part.year + ' 問' + part.from;
  return part.year + ' 問' + part.from + '〜' + part.to;
}

function buildDobokuMiniPlan_() {
  var years = ['R7', 'R6', 'R5', 'R4', 'R3'];
  var refs = [];
  years.forEach(function(year) {
    for (var no = 1; no <= 11; no++) refs.push({ year: year, number: no });
  });
  var chunkSizes = [5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
  var rows = [];
  var pos = 0;
  for (var i = 0; i < chunkSizes.length; i++) {
    var chunk = refs.slice(pos, pos + chunkSizes[i]);
    pos += chunkSizes[i];
    var parts = buildDobokuRangeParts_(chunk);
    var key = parts.map(function(part) {
      return 'range:' + part.year + ':' + part.from + '-' + part.to;
    }).join(',');
    var label = '第' + (i + 1) + '回 ' + parts.map(formatDobokuRangePart_).join('・');
    rows.push({
      testIndex: i + 1,
      label: label,
      key: key,
      questionsPerTest: chunk.length,
      unlockWeek: i,
      recommended: false,
      dateRange: formatDobokuMiniDateRange_(i)
    });
  }
  return rows;
}

function markDobokuMiniPlanForThisWeek_(plan) {
  var week = weeksSinceDobokuMiniStart_();
  var matched = false;
  plan.forEach(function(item) {
    item.recommended = Number(item.unlockWeek) === week;
    if (item.recommended) matched = true;
  });
  if (!matched && week < 0 && plan.length) plan[0].recommended = true;
  return plan;
}

function computeDobokuNextAction_(miniPlan) {
  var selected = null;
  for (var i = 0; i < miniPlan.length; i++) {
    if (miniPlan[i].recommended) {
      selected = miniPlan[i];
      break;
    }
  }
  if (!selected) {
    var week = weeksSinceDobokuMiniStart_();
    for (var j = 0; j < miniPlan.length; j++) {
      if (Number(miniPlan[j].unlockWeek) > week) {
        selected = miniPlan[j];
        break;
      }
    }
  }
  if (!selected && miniPlan.length) selected = miniPlan[miniPlan.length - 1];
  if (!selected) return null;
  return {
    type: selected.recommended ? 'mini' : 'upcoming',
    label: selected.label,
    key: selected.key,
    questionsPerTest: selected.questionsPerTest,
    unlockWeek: selected.unlockWeek,
    dateRange: selected.dateRange,
    reason: selected.recommended ? '今週のミニテストです' : '次回のミニテストです'
  };
}

function buildDobokuMiniPlanForQuestions_(questions) {
  var refs = (questions || []).map(function(q) {
    return { year: String(q.year || ''), number: Number(q.number || 0) };
  }).filter(function(ref) {
    return ref.year && ref.number > 0;
  });
  refs.sort(function(a, b) {
    var ay = yearOrderForDoboku_(a.year);
    var by = yearOrderForDoboku_(b.year);
    if (ay !== by) return by - ay;
    return a.number - b.number;
  });
  var chunkSize = refs.length <= 20 ? 2 : 5;
  var rows = [];
  for (var pos = 0; pos < refs.length; pos += chunkSize) {
    var chunk = refs.slice(pos, pos + chunkSize);
    var parts = buildDobokuRangeParts_(chunk);
    var key = parts.map(function(part) {
      return 'range:' + part.year + ':' + part.from + '-' + part.to;
    }).join(',');
    rows.push({
      testIndex: rows.length + 1,
      label: '第' + (rows.length + 1) + '回 ' + parts.map(formatDobokuRangePart_).join('・'),
      key: key,
      questionsPerTest: chunk.length,
      unlockWeek: rows.length,
      recommended: false,
      dateRange: formatDobokuMiniDateRange_(rows.length)
    });
  }
  return rows;
}

function getDobokuGradableQuestions_(questions) {
  var statusMap = getDobokuRubricStatusMap_();
  return (questions || []).filter(function(q) {
    var qId = String(q && q.qId || '').trim();
    if (!qId) return false;
    var status = statusMap[qId] || buildDobokuRubricStatus_(null);
    status = applyDobokuQuestionMediaStatus_(status, decorateDobokuQuestionMedia_(q));
    return status.canGrade === true && !isDobokuPracticeOnlyStatus_(status);
  });
}

function getDobokuYearSummaryForQuestions_(questions) {
  var counts = {};
  (questions || []).forEach(function(q) {
    var y = String(q.year || '').trim();
    if (y) counts[y] = (counts[y] || 0) + 1;
  });
  return Object.keys(counts).sort(function(a, b) {
    return yearOrderForDoboku_(b) - yearOrderForDoboku_(a);
  }).map(function(year) {
    return { year: year, count: counts[year] };
  });
}

function apiGetAuthInfo(clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    return getCurrentAuthInfo_(clientUserKey);
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

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

// Return year list with question counts + answered stats for the home screen
function apiGetHome(clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var publishedQuestions = getCachedQuestions_();
    var gradableQuestions = getDobokuGradableQuestions_(publishedQuestions);
    var years = getDobokuYearSummaryForQuestions_(gradableQuestions);

    // Per-year submitted count for this user (via Notes sheet)
    var userKey = String(clientUserKey || '').trim();
    if (userKey) {
      var qIdToYear = {};
      gradableQuestions.forEach(function(q) { qIdToYear[String(q.qId)] = String(q.year); });

      var answeredQidsByYear = {};
      readRecords_(getSheet_(SHEETS.Notes)).forEach(function(n) {
        var qId = String(n.qId || '');
        if (String(n.userKey) === userKey && String(n.noteText || '').trim()) {
          var y = qIdToYear[qId];
          if (y) {
            if (!answeredQidsByYear[y]) answeredQidsByYear[y] = {};
            answeredQidsByYear[y][qId] = true;
          }
        }
      });

      years = years.map(function(y) {
        var submitted = answeredQidsByYear[y.year] || {};
        return { year: y.year, count: y.count, answered: Object.keys(submitted).length };
      });
    }

    var miniPlan = markDobokuMiniPlanForThisWeek_(buildDobokuMiniPlanForQuestions_(gradableQuestions));
    return toSerializable_({
      auth: getCurrentAuthInfo_(clientUserKey),
      config: {
        PROGRAM_START_DATE: DOBOKU2JI_PROGRAM_START_DATE_,
        EXAM_DATE: DOBOKU2JI_EXAM_DATE_
      },
      miniPlan: miniPlan,
      nextAction: computeDobokuNextAction_(miniPlan),
      fieldStats: getDobokuFieldStats_(gradableQuestions),
      years: years
    });
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function getDoboku2jiSelfTest_() {
  var out = { buildVersion: DOBOKU2JI_BUILD_VERSION_ };
  try {
    var home = apiGetHome('');
    var miniPlan = home && home.miniPlan ? home.miniPlan : [];
    out.miniPlanCount = miniPlan.length;
    var firstMini = miniPlan.length ? miniPlan[0] : null;
    out.firstMiniLabel = firstMini ? String(firstMini.label || '') : '';
    out.firstMiniKey = firstMini ? String(firstMini.key || '') : '';

    var practice = firstMini
      ? apiGetPracticeQuestions('mini', firstMini.key, firstMini.label, '')
      : { questions: [] };
    var qs = practice && practice.questions ? practice.questions : [];
    out.practiceQuestionCount = qs.length;
    out.firstQId = qs.length ? String(qs[0].qId || '') : '';
    out.firstQuestionListStemHead = qs.length ? String(qs[0].stem || qs[0].stemShort || '').slice(0, 80) : '';

    var detail = out.firstQId ? apiGetQuestion(out.firstQId, '') : null;
    out.firstQuestionHasQuestion = !!(detail && detail.question);
    out.firstQuestionError = detail && detail._error ? String(detail.message || '') : '';
    out.firstQuestionRawKeys = detail ? Object.keys(detail) : [];
    out.firstQuestionYear = detail && detail.question ? String(detail.question.year || '') : '';
    out.firstQuestionNumber = detail && detail.question ? String(detail.question.number || '') : '';
    out.firstQuestionStemHead = detail && detail.question ? String(detail.question.stem || '').slice(0, 120) : '';
    out.firstQuestionRubricStatus = detail && detail.rubricStatus ? detail.rubricStatus : null;
  } catch (e) {
    out._error = true;
    out.message = String(e && e.message || e);
  }
  return toSerializable_(out);
}

// Return question list for a given year with submitted status per question
function apiGetQuestionsByYear(year, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var qs = getDobokuGradableQuestions_(getCachedQuestions_()).filter(function(q) {
      return String(q.year) === String(year);
    });
    qs.sort(function(a, b) { return Number(a.number) - Number(b.number); });

    // Build submitted map for this user (via Notes sheet)
    var submittedMap = {};
    var userKey = String(clientUserKey || '').trim();
    if (userKey && qs.length > 0) {
      var qIds = {};
      qs.forEach(function(q) { qIds[String(q.qId)] = true; });
      readRecords_(getSheet_(SHEETS.Notes)).forEach(function(n) {
        var qId = String(n.qId || '');
        if (String(n.userKey) === userKey && qIds[qId] && String(n.noteText || '').trim()) {
          submittedMap[qId] = true;
        }
      });
    }

    var statusMap = getDobokuRubricStatusMap_();
    return toSerializable_({ questions: qs.map(function(q) {
      return toDobokuQuestionListItem_(q, submittedMap, statusMap);
    })});
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

// Return cross-year question lists for mini tests, field practice, and weak review.
function apiGetPracticeQuestions(kind, key, title, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    var all = getDobokuGradableQuestions_(getCachedQuestions_()).slice();
    var allQids = {};
    all.forEach(function(q) { allQids[String(q.qId)] = true; });
    var submittedMap = getDobokuScoreMap_(userKey, allQids);
    var qs;

    if (String(kind) === 'weak') {
      qs = all.filter(function(q) {
        var submitted = !!submittedMap[String(q.qId)];
        if (String(key) === 'unanswered') return !submitted;
        return !submitted;
      });
      if (!qs.length && String(key) !== 'unanswered') {
        qs = all.filter(function(q) { return !submittedMap[String(q.qId)]; });
      }
    } else {
      qs = all.filter(function(q) {
        return matchesDobokuPractice_(q, key);
      });
    }

    qs.sort(sortDobokuPracticeQuestions_);
    var statusMap = getDobokuRubricStatusMap_();
    return toSerializable_({
      title: String(title || getDobokuPracticeTitle_(kind, key)),
      questions: qs.map(function(q) { return toDobokuQuestionListItem_(q, submittedMap, statusMap); })
    });
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function getDobokuFieldStats_(questions) {
  var keys = ['experience', 'required', 'selectionA', 'selectionB', 'management', 'civil'];
  var stats = {};
  keys.forEach(function(key) {
    stats[key] = (questions || []).filter(function(q) {
      return matchesDobokuPractice_(q, key);
    }).length;
  });
  return stats;
}

function getDobokuScoreMap_(userKey, qIds) {
  var submittedMap = {};
  if (!userKey) return submittedMap;
  readRecords_(getSheet_(SHEETS.Notes)).forEach(function(n) {
    var qId = String(n.qId || '');
    if (qIds && !qIds[qId]) return;
    if (String(n.userKey) === String(userKey) && String(n.noteText || '').trim()) {
      submittedMap[qId] = true;
    }
  });
  return submittedMap;
}

function toDobokuQuestionListItem_(q, submittedMap, statusMap) {
  q = decorateDobokuQuestionMedia_(q || {});
  var qId = String(q.qId || '').trim();
  var status = statusMap ? cloneDobokuStatus_(statusMap[qId] || buildDobokuRubricStatus_(null)) : buildDobokuRubricStatus_(getDobokuRubricByQId_(qId));
  status = applyDobokuQuestionMediaStatus_(status, q);
  return {
    qId: q.qId,
    year: q.year,
    number: q.number,
    questionType: q.questionType,
    stem: String(q.stem || ''),
    stemShort: String(q.stem || '').substring(0, 120),
    modelAnswer: String(q.modelAnswer || ''),
    tags: q.tags,
    imageRequired: q.imageRequired,
    imageUrls: q.imageUrls,
    imageMissing: q.imageMissing,
    rubricStatus: status,
    scoringDisabled: status.canGrade !== true || isDobokuPracticeOnlyStatus_(status),
    lastScore: '',
    submitted: !!submittedMap[String(q.qId)]
  };
}

function cloneDobokuStatus_(status) {
  var out = {};
  status = status || {};
  Object.keys(status).forEach(function(key) {
    out[key] = status[key];
  });
  return out;
}

function matchesDobokuPractice_(q, key) {
  var n = Number(q.number || 0);
  var text = [
    q.questionType || '',
    q.tags || '',
    q.stem || ''
  ].join(' ');
  key = String(key || '');
  var rangeMatch = matchesDobokuRangePractice_(q, key);
  if (rangeMatch !== null) return rangeMatch;
  if (key === 'experience') return n === 1 || text.indexOf('経験') >= 0;
  if (key === 'required') return n >= 1 && n <= 3;
  if (key === 'selectionA') return n >= 4 && n <= 7;
  if (key === 'selectionB') return n >= 8 && n <= 11;
  if (key === 'management') return n === 2 || n === 3 || n >= 8 && n <= 11 || /安全|品質|工程|施工管理/.test(text);
  if (key === 'civil') return n >= 4 && n <= 7 || /土工|土木|コンクリート|基礎|舗装|河川/.test(text);
  return true;
}

function matchesDobokuRangePractice_(q, key) {
  var tokens = String(key || '').split(',');
  var hasRange = false;
  for (var i = 0; i < tokens.length; i++) {
    var token = String(tokens[i] || '').trim();
    var m = token.match(/^range:((?:H|R)\d+):(\d+)-(\d+)$/);
    if (!m) continue;
    hasRange = true;
    var from = Number(m[2]);
    var to = Number(m[3]);
    if (from > to) {
      var tmp = from;
      from = to;
      to = tmp;
    }
    var year = m[1].toUpperCase();
    var no = Number(q.number || 0);
    if (String(q.year || '').toUpperCase() === year && no >= from && no <= to) return true;
  }
  return hasRange ? false : null;
}

function getDobokuPracticeTitle_(kind, key) {
  var titles = {
    experience: '経験記述',
    required: '必須問題',
    selectionA: '選択(1)',
    selectionB: '選択(2)',
    management: '施工管理',
    civil: '土木一般',
    low: '未提出復習',
    unanswered: '未提出確認'
  };
  return titles[String(key || '')] || String(kind || '演習');
}

function sortDobokuPracticeQuestions_(a, b) {
  var ay = yearOrderForDoboku_(a.year);
  var by = yearOrderForDoboku_(b.year);
  if (ay !== by) return by - ay;
  return Number(a.number || 0) - Number(b.number || 0);
}

function yearOrderForDoboku_(year) {
  var m = String(year || '').match(/^([HR])(\d+)$/);
  if (!m) return 0;
  var n = Number(m[2] || 0);
  return m[1] === 'H' ? 1988 + n : 2018 + n;
}

// Return full question + latest saved answer for this user
function apiGetQuestion(qId, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var q = getCachedQuestions_().filter(function(r) { return String(r.qId) === String(qId); })[0];
    if (!q) return { _error: true, message: '問題が見つかりません: ' + qId };
    q = decorateDobokuQuestionMedia_(q);

    var userKey = String(clientUserKey || '').trim();
    var draft = getDobokuAnswerDraft_(userKey, qId);
    var submissionHistory = getDobokuSubmissionHistory_(userKey, qId, 10);
    var latestSubmission = submissionHistory.length ? submissionHistory[0] : null;
    var rubric = getDobokuRubricByQId_(qId);
    var rubricStatus = applyDobokuQuestionMediaStatus_(buildDobokuRubricStatus_(rubric), q);
    var latestAiGrading = getLatestDobokuAiGrading_(userKey, qId);

    return toSerializable_({
      question: {
        qId: q.qId,
        year: q.year,
        number: q.number,
        questionType: q.questionType,
        stem: q.stem,
        modelAnswer: q.modelAnswer,
        tags: q.tags,
        imageRequired: q.imageRequired,
        imageUrls: q.imageUrls,
        imageMissing: q.imageMissing
      },
      note: latestSubmission,
      draft: draft,
      latestSubmission: latestSubmission,
      submissionHistory: submissionHistory,
      rubricStatus: rubricStatus,
      latestAiGrading: latestAiGrading
    });
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

// Backward-compatible save endpoint. New UI uses apiSubmitAnswer.
function apiSaveNote(qId, noteText, clientUserKey) {
  return apiSubmitAnswer(qId, noteText, 0, clientUserKey);
}

// Backward-compatible legacy score endpoint.
function apiSaveSelfScore(qId, score, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    if (!userKey) return { _error: true, message: 'ログインが必要です' };
    upsertSelfScore_(userKey, qId, String(score || ''));
    return { ok: true };
  } catch (e) {
    return { _error: true, message: '保存エラー: ' + String(e.message || e) };
  }
}

function apiGetPracticeResult(qIds, title, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    var ids = Array.isArray(qIds) ? qIds.map(function(v) { return String(v || '').trim(); }).filter(String) : [];
    var idSet = {};
    ids.forEach(function(id) { idSet[id] = true; });
    var qById = {};
    getCachedQuestions_().forEach(function(q) {
      var qId = String(q.qId || '').trim();
      if (idSet[qId]) qById[qId] = q;
    });
    var statusMap = getDobokuRubricStatusMap_();
    var submissionById = {};
    if (userKey) {
      readRecords_(getSheet_(SHEETS.Notes)).forEach(function(n) {
        var qId = String(n.qId || '').trim();
        if (String(n.userKey || '') === userKey && idSet[qId] && String(n.noteText || '').trim()) {
          submissionById[qId] = toDobokuSubmission_(n);
        }
      });
    }
    var gradingById = {};
    if (userKey) {
      readRecords_(getSheet_(SHEETS.AiGradings)).forEach(function(g) {
        var qId = String(g.qId || '').trim();
        if (String(g.userKey || '') === userKey && idSet[qId]) gradingById[qId] = toPublicDobokuAiGrading_(g);
      });
    }
    var scoreSum = 0;
    var maxScoreSum = 0;
    var estimatedCostUsdSum = 0;
    var estimatedCostJpySum = 0;
    var submittedCount = 0;
    var aiGradedCount = 0;
    var excludedCount = 0;
    var rows = ids.map(function(qId) {
      var q = qById[qId] || { qId: qId };
      var status = statusMap[qId] || buildDobokuRubricStatus_(null);
      var excluded = isDobokuPracticeOnlyStatus_(status);
      if (excluded) excludedCount += 1;
      var submission = submissionById[qId] || null;
      var grading = gradingById[qId] || null;
      if (submission) submittedCount += 1;
      var includeAiScore = grading && !excluded && Number(grading.maxScore || 0) > 0;
      if (includeAiScore) {
        aiGradedCount += 1;
        scoreSum += Number(grading.score || 0);
        maxScoreSum += Number(grading.maxScore || 0);
        estimatedCostUsdSum += Number(grading.estimatedCostUsd || 0);
        estimatedCostJpySum += Number(grading.estimatedCostJpy || 0);
      }
      return {
        qId: qId,
        year: q.year || '',
        number: q.number || '',
        title: (q.year ? String(q.year) + ' ' : '') + '問' + String(q.number || ''),
        answerText: submission ? String(submission.note || '') : '',
        submittedAt: submission ? (submission.createdAt || '') : '',
        modelAnswer: String(q.modelAnswer || ''),
        scoringDisabled: excluded,
        scoreMode: status.scoreMode || '',
        submitted: !!submission,
        aiGrading: grading,
        includeAiScore: !!includeAiScore
      };
    });
    var practiceSummary = buildDobokuPracticeSummary_(rows, scoreSum, maxScoreSum, aiGradedCount);
    return toSerializable_({
      title: String(title || '演習結果'),
      total: ids.length,
      submittedCount: submittedCount,
      aiGradedCount: aiGradedCount,
      excludedCount: excludedCount,
      aiScore: Math.round(scoreSum * 10) / 10,
      aiMaxScore: Math.round(maxScoreSum * 10) / 10,
      aiScorePct: maxScoreSum > 0 ? Math.round(scoreSum / maxScoreSum * 1000) / 10 : 0,
      estimatedCostUsd: roundDobokuCost_(estimatedCostUsdSum, 6),
      estimatedCostJpy: roundDobokuCost_(estimatedCostJpySum, 2),
      practiceSummary: practiceSummary,
      rows: rows
    });
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function buildDobokuPracticeSummary_(rows, scoreSum, maxScoreSum, aiGradedCount) {
  var gradedRows = (rows || []).filter(function(row) {
    return row && row.includeAiScore && row.aiGrading;
  });
  if (!gradedRows.length) {
    return {
      headline: 'AI採点済みの答案がまだありません。',
      scoreComment: '結果を見る前に、各問題の答案を入力してAI採点してください。',
      weakTags: [],
      strengths: [],
      nextActions: []
    };
  }
  var pct = maxScoreSum > 0 ? Math.round(scoreSum / maxScoreSum * 1000) / 10 : 0;
  var headline = pct >= 90
    ? '高得点圏です。課題、対応処置、評価のつながりを保てています。'
    : (pct >= 75
      ? '合格圏に近い答案です。現場条件と評価の具体性をもう一段足しましょう。'
      : '骨子はあります。現場状況、技術的課題、検討項目、対応処置の対応を優先して補強しましょう。');

  var improvementTexts = [];
  var strengthTexts = [];
  gradedRows.forEach(function(row) {
    var grading = row.aiGrading || {};
    var flags = grading.flags || {};
    collectDobokuSummaryTexts_(strengthTexts, flags.strengths, 4);
    collectDobokuSummaryTexts_(strengthTexts, grading.overallComment ? [grading.overallComment] : [], 2);
    collectDobokuSummaryTexts_(improvementTexts, flags.improvements, 5);
    collectDobokuSummaryTexts_(improvementTexts, flags.fullScoreHints, 5);
    collectDobokuSummaryTexts_(improvementTexts, flags.addableExamples, 4);
    collectDobokuSummaryTexts_(improvementTexts, flags.warnings, 4);
    (grading.criteria || []).forEach(function(c) {
      if (Number(c.score || 0) < Number(c.maxScore || 0)) {
        collectDobokuSummaryTexts_(improvementTexts, [c.comment || c.name], 4);
      }
    });
  });

  var tags = buildDobokuPracticeWeakTags_(improvementTexts.join(' '));
  return {
    headline: headline,
    scoreComment: 'AI推定合計は ' + (Math.round(scoreSum * 10) / 10) + ' / ' + (Math.round(maxScoreSum * 10) / 10) + ' 点です。採点済み ' + aiGradedCount + ' 問をもとに整理しています。',
    weakTags: tags,
    strengths: uniqueDobokuSummaryTexts_(strengthTexts).slice(0, 3),
    nextActions: uniqueDobokuSummaryTexts_(improvementTexts).slice(0, 5)
  };
}

function collectDobokuSummaryTexts_(target, items, limit) {
  if (!Array.isArray(items)) return;
  items.forEach(function(item) {
    if (target.length >= limit) return;
    var text = String(item || '').trim();
    if (text) target.push(text);
  });
}

function uniqueDobokuSummaryTexts_(items) {
  var seen = {};
  var out = [];
  (items || []).forEach(function(item) {
    var text = String(item || '').trim();
    if (!text || seen[text]) return;
    seen[text] = true;
    out.push(text);
  });
  return out;
}

function buildDobokuPracticeWeakTags_(text) {
  var src = String(text || '');
  var defs = [
    { tag: '工事概要不足', words: ['工事概要', '立場', '施工量', '発注者', '工期'] },
    { tag: '現場条件不足', words: ['現場状況', '周辺', '条件', '制約', '具体'] },
    { tag: '技術的課題不足', words: ['技術的課題', '課題', '品質管理上', '環境対策上'] },
    { tag: '検討項目不足', words: ['検討項目', '検討した項目', '検討'] },
    { tag: '対応処置不足', words: ['対応処置', '処置', '対策', '管理方法'] },
    { tag: '評価不足', words: ['評価', '結果', '効果', '確認結果'] },
    { tag: '記録・基準不足', words: ['記録', '基準値', '試験値', '管理値', '頻度'] },
    { tag: '図表読み取り不足', words: ['図表', '施工手順', '番号', '工種名'] },
    { tag: '条件違反注意', words: ['条件違反', '除く', '不可', '安全管理'] }
  ];
  var tags = [];
  defs.forEach(function(def) {
    if (tags.length >= 4) return;
    var hit = def.words.some(function(w) { return src.indexOf(w) >= 0; });
    if (hit) tags.push(def.tag);
  });
  if (!tags.length) tags.push('具体性の追加');
  return tags;
}

function apiSaveDraft(qId, draftText, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    if (!userKey) return { _error: true, message: 'ログイン情報が見つかりません' };
    var text = String(draftText || '');
    if (!text.trim()) {
      clearDobokuAnswerDraft_(userKey, qId);
      return { success: true, cleared: true, draft: null };
    }
    var draft = upsertDobokuAnswerDraft_(userKey, qId, text);
    return toSerializable_({ success: true, draft: draft });
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function apiClearDraft(qId, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    if (!userKey) return { _error: true, message: 'ログイン情報が見つかりません' };
    var deleted = clearDobokuAnswerDraft_(userKey, qId);
    return { success: true, deleted: deleted };
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function apiSubmitAnswer(qId, answerText, selfScore, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    var answer = String(answerText || '').trim();
    if (!userKey) return { _error: true, message: 'ログイン情報が見つかりません' };
    if (!answer) return { _error: true, message: '答案を入力してください' };
    return toSerializable_({ success: true, submission: appendDobokuSubmission_(userKey, qId, answerText, selfScore, true) });
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function appendDobokuSubmission_(userKey, qId, answerText, selfScore, clearDraft) {
  var now = new Date().toISOString();
  var noteId = 'N_' + Date.now() + '_' + Utilities.getUuid();
  var row = [noteId, userKey, qId, answerText, Number(selfScore || 0) || 0, now, now];
  var sh = getSheet_(SHEETS.Notes);
  ensureSheetColumns_(sh, HEADERS[SHEETS.Notes]);
  appendRows_(sh, [row]);
  if (clearDraft) clearDobokuAnswerDraft_(userKey, qId);
  return toDobokuSubmission_({
    noteId: noteId,
    userKey: userKey,
    qId: qId,
    noteText: answerText,
    selfScore: Number(selfScore || 0) || 0,
    createdAt: now,
    updatedAt: now
  });
}

function getDobokuAnswerDraft_(userKey, qId) {
  if (!userKey) return null;
  var rows = readRecords_(getSheet_(SHEETS.AnswerDrafts));
  var latest = null;
  rows.forEach(function(r) {
    if (String(r.userKey || '') === String(userKey) && String(r.qId || '') === String(qId)) latest = r;
  });
  return latest ? {
    userKey: String(latest.userKey || ''),
    qId: String(latest.qId || ''),
    draftText: String(latest.draftText || ''),
    updatedAt: latest.updatedAt || ''
  } : null;
}

function upsertDobokuAnswerDraft_(userKey, qId, draftText) {
  var sh = getSheet_(SHEETS.AnswerDrafts);
  ensureSheetColumns_(sh, HEADERS[SHEETS.AnswerDrafts]);
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(function(h, i) { return normalizeHeader_(h, i); });
  var userCol = headers.indexOf('userKey');
  var qCol = headers.indexOf('qId');
  var now = new Date().toISOString();
  var row = [userKey, qId, draftText, now];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][userCol] || '') === String(userKey) && String(values[i][qCol] || '') === String(qId)) {
      sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return { userKey: userKey, qId: qId, draftText: draftText, updatedAt: now };
    }
  }
  appendRows_(sh, [row]);
  return { userKey: userKey, qId: qId, draftText: draftText, updatedAt: now };
}

function clearDobokuAnswerDraft_(userKey, qId) {
  var sh = getSheet_(SHEETS.AnswerDrafts);
  var values = sh.getDataRange().getValues();
  if (values.length <= 1) return 0;
  var headers = values[0].map(function(h, i) { return normalizeHeader_(h, i); });
  var userCol = headers.indexOf('userKey');
  var qCol = headers.indexOf('qId');
  var deleted = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][userCol] || '') === String(userKey) && String(values[i][qCol] || '') === String(qId)) {
      sh.deleteRow(i + 1);
      deleted += 1;
    }
  }
  return deleted;
}

function getDobokuSubmissionHistory_(userKey, qId, limit) {
  if (!userKey) return [];
  var rows = readRecords_(getSheet_(SHEETS.Notes)).filter(function(n) {
    return String(n.qId || '') === String(qId) && String(n.userKey || '') === String(userKey) && String(n.noteText || '').trim();
  }).map(toDobokuSubmission_);
  rows.sort(function(a, b) {
    return new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime();
  });
  if (limit && rows.length > limit) rows = rows.slice(0, limit);
  return rows;
}

function toDobokuSubmission_(n) {
  return {
    noteId: String(n.noteId || ''),
    userKey: String(n.userKey || ''),
    qId: String(n.qId || ''),
    note: String(n.noteText || n.note || ''),
    selfScore: Number(n.selfScore || 0),
    createdAt: n.createdAt || n.updatedAt || ''
  };
}

function apiImportRubrics(rubricsJson, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var items = typeof rubricsJson === 'string' ? JSON.parse(rubricsJson) : rubricsJson;
    if (!items || !Array.isArray(items)) return { _error: true, message: 'rubricsJson は配列JSONで指定してください' };
    var sh = getSheet_(SHEETS.ScoringRubrics);
    ensureSheetColumns_(sh, HEADERS[SHEETS.ScoringRubrics]);
    var values = sh.getDataRange().getValues();
    var rowById = {};
    for (var r = 1; r < values.length; r++) {
      var id = String(values[r][0] || '').trim();
      if (id) rowById[id] = r + 1;
    }
    var imported = 0;
    var updated = 0;
    var skipped = 0;
    var now = new Date().toISOString();
    items.forEach(function(item) {
      var qId = String(item && item.qId || '').trim();
      if (!qId) { skipped += 1; return; }
      var row = [
        qId,
        String(item.responseType || ''),
        String(item.sourceQuality || ''),
        String(item.scoreMode || ''),
        Number(item.maxScore || 10),
        JSON.stringify(item.rubricJson || {}),
        String(item.reviewStatus || ''),
        now
      ];
      var rowNo = rowById[qId];
      if (rowNo) {
        sh.getRange(rowNo, 1, 1, row.length).setValues([row]);
        updated += 1;
      } else {
        appendRows_(sh, [row]);
        imported += 1;
      }
    });
    return { success: true, imported: imported, updated: updated, skipped: skipped };
  } catch (e) {
    return { _error: true, message: '採点ルーブリック取り込みエラー: ' + String(e.message || e) };
  }
}

function apiImportQuestionImages(imagesJson, clientUserKey, replaceExisting) {
  __clientUserKey = clientUserKey || '';
  try {
    var items = typeof imagesJson === 'string' ? JSON.parse(imagesJson) : imagesJson;
    if (!items || !Array.isArray(items)) return { _error: true, message: 'imagesJson は配列JSONで指定してください' };
    var folder = getDobokuQuestionImageFolder_();
    var urlsByQid = {};
    var imported = 0;
    var skipped = 0;
    var errors = [];
    items.forEach(function(item) {
      var qId = String(item && item.qId || '').trim();
      var b64 = String(item && item.base64Data || '').trim();
      if (!qId || !b64) { skipped += 1; return; }
      try {
        var mimeType = normalizeDobokuImageMimeType_(item.mimeType);
        var filename = sanitizeDobokuImageFilename_(item.filename || (qId + '_' + Date.now() + '.png'));
        var blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, filename);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var url = getDobokuDriveImageUrl_(file.getId());
        if (!urlsByQid[qId]) urlsByQid[qId] = [];
        urlsByQid[qId].push(url);
        imported += 1;
      } catch (err) {
        skipped += 1;
        errors.push({ qId: qId, message: String(err.message || err) });
      }
    });
    var updated = 0;
    Object.keys(urlsByQid).forEach(function(qId) {
      var urls = urlsByQid[qId];
      if (replaceExisting === false || String(replaceExisting).toLowerCase() === 'false') {
        urls = mergeDobokuQuestionImageUrls_(getDobokuQuestionImageUrlsByQId_(qId), urls);
      }
      if (updateDobokuQuestionImageUrls_(qId, urls)) updated += 1;
    });
    clearQuestionsCache_();
    return { success: true, imported: imported, updated: updated, skipped: skipped, imageUrlsByQId: urlsByQid, errors: errors };
  } catch (e) {
    return { _error: true, message: '問題図表画像取り込みエラー: ' + String(e.message || e) };
  }
}

function apiGradeAnswer(qId, answerText, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var userKey = String(clientUserKey || '').trim();
    var answer = String(answerText || '').trim();
    if (!answer) return { _error: true, message: '答案を入力してください' };
    var q = getCachedQuestions_().filter(function(r) { return String(r.qId) === String(qId); })[0];
    if (!q) return { _error: true, message: '問題が見つかりません: ' + qId };
    q = decorateDobokuQuestionMedia_(q);
    var rubric = getDobokuRubricByQId_(qId);
    var status = applyDobokuQuestionMediaStatus_(buildDobokuRubricStatus_(rubric), q);
    if (!rubric) return { _error: true, message: '採点ルーブリックが未登録です' };
    if (!status.canGrade) {
      return { success: false, skipped: true, message: status.displayNotice || 'この問題は採点対象外です', rubricStatus: status };
    }
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty('OPENAI_API_KEY');
    if (!apiKey) return { _error: true, message: 'OPENAI_API_KEY が未設定です' };
    var model = String(props.getProperty('OPENAI_MODEL') || 'gpt-5.4-mini').trim();
    var result = gradeDobokuWithOpenAI_(q, rubric, answer, model, apiKey);
    result = applyDobokuAnswerComplianceGuardrails_(q, rubric, answer, result);
    var modelLabel = model;
    if (result && result.reasoningEffort) modelLabel += ' / effort:' + result.reasoningEffort;
    var saved = appendDobokuAiGrading_(userKey, qId, answer, rubric, result, modelLabel);
    var submission = userKey ? appendDobokuSubmission_(userKey, qId, answer, 0, true) : null;
    return toSerializable_({ success: true, rubricStatus: status, grading: saved, submission: submission, autoSubmitted: !!submission });
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function applyDobokuAnswerComplianceGuardrails_(question, rubric, answerText, result) {
  result = result || {};
  var scoreMode = String(rubric && rubric.scoreMode || '');
  if (scoreMode === 'deterministic') return result;
  var analysis = analyzeDobokuAnswerCompliance_(question, answerText);
  if (!analysis.hasIssue) return result;

  var maxScore = Number(result.maxScore || rubric && rubric.maxScore || 10);
  if (!isFinite(maxScore) || maxScore <= 0) maxScore = 10;
  var cap = maxScore;
  var warnings = Array.isArray(result.warnings) ? result.warnings.slice() : [];
  var improvements = Array.isArray(result.improvements) ? result.improvements.slice() : [];
  var hints = Array.isArray(result.fullScoreHints) ? result.fullScoreHints.slice() : [];
  var examples = Array.isArray(result.addableExamples) ? result.addableExamples.slice() : [];

  if (analysis.overSelection) {
    cap = Math.min(cap, maxScore * 0.9);
    warnings.push('設問は' + analysis.expectedCount + 'つ選択ですが、答案に' + analysis.detectedCount + '件の回答候補が含まれています。指定数を超える答案は満点にしません。');
    improvements.push('指定された数だけに絞り、余分な候補や比較メモを答案欄から削除してください。');
    hints.push('「' + analysis.expectedCount + 'つ選び」の設問では、採点対象として書く項目を' + analysis.expectedCount + '件に限定する。');
  }
  if (analysis.hasMetaComment) {
    cap = Math.min(cap, maxScore * 0.95);
    warnings.push('答案欄に学習メモ又は答案外コメントが含まれています。本試験答案では不要です。');
    improvements.push('「答案例として」「書きやすい組合せ」などの説明を削り、解答本文だけに整理してください。');
  }
  if (analysis.overSelection && analysis.hasMetaComment) {
    cap = Math.min(cap, maxScore * 0.85);
  }

  if (analysis.expectedCount > 0 && examples.length < 3) {
    examples.push('指定された' + analysis.expectedCount + '件だけを、番号・工種名・留意事項の組で記述する。');
  }

  var currentScore = Number(result.score || 0);
  if (!isFinite(currentScore)) currentScore = 0;
  if (currentScore > cap) result.score = Math.round(cap * 10) / 10;
  result.warnings = uniqueDobokuStrings_(warnings);
  result.improvements = uniqueDobokuStrings_(improvements);
  result.fullScoreHints = uniqueDobokuStrings_(hints);
  result.addableExamples = uniqueDobokuStrings_(examples);
  var prefix = '設問条件への適合性に注意が必要です。';
  if (analysis.overSelection) prefix = '指定数を超えて回答しているため、内容が良くても満点にはしません。';
  result.overallComment = prefix + (result.overallComment ? ' ' + String(result.overallComment) : '');
  if (result.overallComment.length > 220) result.overallComment = result.overallComment.substring(0, 220);
  var raw = result.rawJson || {};
  raw.guardrails = analysis;
  raw.scoreCapApplied = Math.round(cap * 10) / 10;
  result.rawJson = raw;
  return result;
}

function analyzeDobokuAnswerCompliance_(question, answerText) {
  var stem = String(question && question.stem || '');
  var answer = String(answerText || '');
  var selection = parseDobokuSelectionRequirement_(stem);
  var labels = selection ? extractDobokuAnswerItemLabels_(answer) : [];
  var detectedCount = labels.length;
  var metaPhrases = [
    '答案例として',
    '答案として',
    '2つだけ書くなら',
    '３つ示します',
    '3つ示します',
    '書きやすいのは',
    '次の組合せ',
    '理由・ポイント'
  ];
  var foundMeta = metaPhrases.filter(function(p) { return answer.indexOf(p) >= 0; });
  var overSelection = !!selection && detectedCount > Number(selection.count || 0);
  return {
    hasIssue: overSelection || foundMeta.length > 0,
    overSelection: overSelection,
    expectedCount: selection ? Number(selection.count || 0) : 0,
    detectedCount: detectedCount,
    detectedLabels: labels,
    hasMetaComment: foundMeta.length > 0,
    metaPhrases: foundMeta
  };
}

function parseDobokuSelectionRequirement_(stem) {
  var s = normalizeDobokuDigits_(String(stem || ''));
  var m = s.match(/うちから\s*(\d+)\s*つ\s*選/);
  if (!m) m = s.match(/から\s*(\d+)\s*つ\s*選/);
  if (!m) return null;
  return { count: Number(m[1]) };
}

function normalizeDobokuDigits_(value) {
  var full = '０１２３４５６７８９';
  var s = String(value || '').replace(/[０-９]/g, function(ch) { return String(full.indexOf(ch)); });
  var jp = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
  return s.replace(/[一二三四五六七八九十]/g, function(ch) { return jp[ch] || ch; });
}

function extractDobokuAnswerItemLabels_(answerText) {
  var circled = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10' };
  var labels = {};
  var lines = String(answerText || '').split(/\r?\n/);
  lines.forEach(function(line) {
    var s = String(line || '').trim();
    if (!s) return;
    var m = s.match(/^([①②③④⑤⑥⑦⑧⑨⑩])(?:\s|　|\.|．|、|:|：|\t|$)/);
    if (m) {
      labels[circled[m[1]] || m[1]] = true;
      return;
    }
    m = normalizeDobokuDigits_(s).match(/^(\d{1,2})(?:\s|\.|．|、|:|：|\t|$)/);
    if (m) labels[String(Number(m[1]))] = true;
  });
  return Object.keys(labels).sort(function(a, b) { return Number(a) - Number(b); });
}

function uniqueDobokuStrings_(items) {
  var seen = {};
  var out = [];
  (items || []).forEach(function(item) {
    var s = String(item || '').trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}

function getDobokuRubricByQId_(qId) {
  var rows = readRecords_(getSheet_(SHEETS.ScoringRubrics));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].qId || '').trim() === String(qId || '').trim()) {
      rows[i].rubricJson = parseDobokuJson_(rows[i].rubricJson, {});
      rows[i].maxScore = Number(rows[i].maxScore || 10);
      return rows[i];
    }
  }
  return null;
}

function getDobokuRubricStatusMap_() {
  var map = {};
  readRecords_(getSheet_(SHEETS.ScoringRubrics)).forEach(function(r) {
    map[String(r.qId || '').trim()] = buildDobokuRubricStatus_(r);
  });
  return map;
}

function buildDobokuRubricStatus_(rubric) {
  if (!rubric) {
    return { canGrade: false, scoreMode: 'missing', sourceQuality: '', reviewStatus: 'missing', displayNotice: '採点ルーブリックが未登録です。', excludeFromTotal: true };
  }
  var rj = parseDobokuJson_(rubric.rubricJson, {});
  var scoreMode = String(rubric.scoreMode || '').trim();
  var sourceQuality = String(rubric.sourceQuality || '').trim();
  var reviewStatus = String(rubric.reviewStatus || '').trim();
  var displayNotice = String(rj.displayNotice || '').trim();
  if (!displayNotice && sourceQuality === 'reference_only') displayNotice = 'AI推定点・公式採点ではありません。';
  var canGrade = scoreMode === 'rubric_ai' || scoreMode === 'ai_estimate' || scoreMode === 'deterministic';
  if (scoreMode === 'practice_only' || reviewStatus === 'needs_answer_key') {
    canGrade = false;
    displayNotice = '採点観点が未整備のため、AI採点・合計点の対象外です。復習用として使用してください。';
  }
  if (scoreMode === 'deterministic' && !rj.correctAnswers) {
    canGrade = false;
    displayNotice = '採点観点が未登録のため採点できません。';
  }
  return {
    canGrade: canGrade,
    scoreMode: scoreMode,
    sourceQuality: sourceQuality,
    reviewStatus: reviewStatus,
    displayNotice: displayNotice,
    excludeFromTotal: rj.excludeFromTotal === true,
    maxScore: Number(rubric.maxScore || 10)
  };
}

function isDobokuPracticeOnlyStatus_(status) {
  return !status || status.excludeFromTotal === true || status.scoreMode === 'practice_only' || status.reviewStatus === 'needs_answer_key';
}

function decorateDobokuQuestionMedia_(q) {
  q = q || {};
  q.imageRequired = isDobokuQuestionImageRequired_(q);
  q.imageUrls = getDobokuQuestionImageUrls_(q);
  q.imageMissing = q.imageRequired && q.imageUrls.length === 0;
  if (q.imageMissing) {
    var notice = getDobokuQuestionImageNotice_(q);
    var stem = String(q.stem || '');
    if (stem.indexOf(notice) < 0) q.stem = notice + '\n\n' + stem;
  }
  return q;
}

function applyDobokuQuestionMediaStatus_(status, q) {
  status = status || {};
  if (!q || !q.imageMissing) return status;
  var notice = getDobokuQuestionImageNotice_(q);
  status.displayNotice = String(status.displayNotice || '').trim()
    ? String(status.displayNotice || '').trim() + '\n' + notice
    : notice;
  status.canGrade = false;
  status.reviewStatus = 'needs_image';
  status.excludeFromTotal = true;
  return status;
}

function getDobokuQuestionImageNotice_(q) {
  var text = String(q && q.stem || '');
  var subject = /下図|図|表|施工手順/.test(text) ? '図表' : '図表';
  return '【注意】この問題は元PDFの' + subject + '画像が必要です。現在画像が未登録のため、本文だけでは解けない可能性があります。';
}

function isDobokuQuestionImageRequired_(q) {
  var explicit = parseDobokuBoolean_(q && q.imageRequired);
  if (explicit !== null) return explicit;
  var stem = String(q && q.stem || '');
  return /下図|右図|施工手順番号|図のような|図中/.test(stem);
}

function getDobokuQuestionImageUrls_(q) {
  var raw = q && (q.imageUrls || q.imageUrl || q.images || q.imageFileIds || q.imageFileId);
  if (!raw) return [];
  var parsed = parseDobokuJson_(raw, null);
  if (Array.isArray(parsed)) return normalizeDobokuQuestionImageUrlList_(parsed);
  if (parsed && typeof parsed === 'object') return normalizeDobokuQuestionImageUrlList_(Object.keys(parsed).map(function(k) { return parsed[k]; }));
  return normalizeDobokuQuestionImageUrlList_(String(raw).split(/\s*,\s*/));
}

function normalizeDobokuQuestionImageUrlList_(values) {
  var out = [];
  var seen = {};
  (values || []).forEach(function(value) {
    var s = normalizeDobokuQuestionImageUrl_(value);
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}

function normalizeDobokuQuestionImageUrl_(value) {
  var s = String(value || '').trim();
  if (!s) return '';
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s)) return s;
  var fileId = extractDobokuDriveFileId_(s);
  if (fileId) return getDobokuDriveImageUrl_(fileId);
  return /^https?:\/\//i.test(s) ? s : '';
}

function getDobokuDriveImageUrl_(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(String(fileId || '').trim()) + '&sz=w2000';
}

function extractDobokuDriveFileId_(url) {
  var s = String(url || '').trim();
  var m = s.match(/[?&]id=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  m = s.match(/\/file\/d\/([^/]+)/);
  if (m) return decodeURIComponent(m[1]);
  m = s.match(/\/d\/([^/=]+)(?:=|\/|$)/);
  if (m) return decodeURIComponent(m[1]);
  return '';
}

function getDobokuQuestionImageUrlsByQId_(qId) {
  var rows = readRecords_(getSheet_(SHEETS.QuestionBank));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].qId || '').trim() === String(qId || '').trim()) return getDobokuQuestionImageUrls_(rows[i]);
  }
  return [];
}

function mergeDobokuQuestionImageUrls_(existing, incoming) {
  return normalizeDobokuQuestionImageUrlList_((existing || []).concat(incoming || []));
}

function updateDobokuQuestionImageUrls_(qId, imageUrls) {
  var sh = getSheet_(SHEETS.QuestionBank);
  ensureSheetColumns_(sh, HEADERS[SHEETS.QuestionBank]);
  var values = sh.getDataRange().getValues();
  if (values.length <= 1) return false;
  var headers = values[0].map(function(h, i) { return normalizeHeader_(h, i); });
  var qIdCol = headers.indexOf('qId');
  var imageRequiredCol = headers.indexOf('imageRequired');
  var imageUrlsCol = headers.indexOf('imageUrls');
  var updatedCol = headers.indexOf('updatedAt');
  if (qIdCol < 0 || imageRequiredCol < 0 || imageUrlsCol < 0) throw new Error('QuestionBankに qId/imageRequired/imageUrls ヘッダーがありません');
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][qIdCol] || '').trim() !== String(qId || '').trim()) continue;
    sh.getRange(r + 1, imageRequiredCol + 1).setValue('true');
    sh.getRange(r + 1, imageUrlsCol + 1).setValue(JSON.stringify(imageUrls || []));
    if (updatedCol >= 0) sh.getRange(r + 1, updatedCol + 1).setValue(new Date().toISOString());
    return true;
  }
  return false;
}

function getDobokuQuestionImageFolder_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('DOBOKU_QUESTION_IMAGE_FOLDER_ID') || props.getProperty('QUESTION_IMAGE_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { props.deleteProperty('DOBOKU_QUESTION_IMAGE_FOLDER_ID'); }
  }
  var folder = DriveApp.createFolder('doboku2ji-question-images');
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty('DOBOKU_QUESTION_IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

function normalizeDobokuImageMimeType_(value) {
  var mimeType = String(value || 'image/png').trim().toLowerCase();
  var allowed = { 'image/png': true, 'image/jpeg': true, 'image/webp': true };
  return allowed[mimeType] ? mimeType : 'image/png';
}

function sanitizeDobokuImageFilename_(value) {
  var name = String(value || 'question-image.png').replace(/[\\/:*?"<>|]+/g, '_').trim();
  return name || 'question-image.png';
}

function getDobokuQuestionImageInputUrls_(q) {
  return getDobokuQuestionImageUrls_(q).filter(function(url) {
    return /^https?:\/\//i.test(String(url || '')) || /^data:image\/(png|jpe?g|webp);base64,/i.test(String(url || ''));
  });
}

function parseDobokuBoolean_(value) {
  if (value === true || value === false) return value;
  var s = String(value || '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

function getLatestDobokuAiGrading_(userKey, qId) {
  var rows = readRecords_(getSheet_(SHEETS.AiGradings));
  var latest = null;
  rows.forEach(function(row) {
    if (String(row.userKey || '') === String(userKey || '') && String(row.qId || '') === String(qId || '')) latest = row;
  });
  return latest ? toPublicDobokuAiGrading_(latest) : null;
}

function appendDobokuAiGrading_(userKey, qId, answerText, rubric, result, model) {
  var createdAt = new Date().toISOString();
  var usage = result.usage || {};
  var flags = {
    strengths: result.strengths || [],
    improvements: result.improvements || [],
    fullScoreHints: result.fullScoreHints || [],
    addableExamples: result.addableExamples || [],
    warnings: result.warnings || [],
    confidence: result.confidence,
    officialNotice: result.officialNotice || '',
    excludeFromTotal: result.excludeFromTotal === true
  };
  var row = [
    'G_' + Date.now() + '_' + Utilities.getUuid(),
    userKey,
    qId,
    answerText,
    sha256Hex_(answerText),
    Number(result.score || 0),
    Number(result.maxScore || rubric.maxScore || 10),
    String(rubric.scoreMode || '') === 'deterministic' && String(model || '') !== 'deterministic' ? 'ai_assisted_key' : String(rubric.scoreMode || ''),
    String(rubric.sourceQuality || ''),
    String(rubric.reviewStatus || ''),
    String(result.overallComment || ''),
    JSON.stringify(result.criteria || []),
    JSON.stringify(flags),
    JSON.stringify(result.rawJson || result),
    String(model || ''),
    createdAt,
    Number(usage.inputTokens || 0),
    Number(usage.outputTokens || 0),
    Number(usage.totalTokens || 0),
    Number(usage.cachedInputTokens || 0),
    Number(usage.reasoningTokens || 0),
    roundDobokuCost_(Number(usage.estimatedCostUsd || 0), 6),
    roundDobokuCost_(Number(usage.estimatedCostJpy || 0), 2),
    JSON.stringify(usage.pricing || {})
  ];
  var sh = getSheet_(SHEETS.AiGradings);
  ensureSheetColumns_(sh, HEADERS[SHEETS.AiGradings]);
  appendRows_(sh, [row]);
  var obj = {};
  HEADERS[SHEETS.AiGradings].forEach(function(h, i) { obj[h] = row[i]; });
  return toPublicDobokuAiGrading_(obj);
}

function toPublicDobokuAiGrading_(row) {
  var flags = parseDobokuJson_(row.flagsJson, {});
  var pricing = parseDobokuJson_(row.pricingJson, {});
  return {
    gradingId: row.gradingId,
    qId: row.qId,
    answerText: String(row.answerText || ''),
    answerHash: String(row.answerHash || ''),
    score: Number(row.score || 0),
    maxScore: Number(row.maxScore || 10),
    scoreMode: row.scoreMode,
    sourceQuality: row.sourceQuality,
    reviewStatus: row.reviewStatus,
    overallComment: row.overallComment,
    criteria: parseDobokuJson_(row.criteriaJson, []),
    flags: flags,
    model: row.model,
    inputTokens: Number(row.inputTokens || 0),
    outputTokens: Number(row.outputTokens || 0),
    totalTokens: Number(row.totalTokens || 0),
    cachedInputTokens: Number(row.cachedInputTokens || 0),
    reasoningTokens: Number(row.reasoningTokens || 0),
    estimatedCostUsd: Number(row.estimatedCostUsd || 0),
    estimatedCostJpy: Number(row.estimatedCostJpy || 0),
    pricing: pricing,
    createdAt: row.createdAt
  };
}

function gradeDobokuDeterministic_(answerText, rubric) {
  var rj = parseDobokuJson_(rubric.rubricJson, {});
  var correct = rj.correctAnswers;
  if (!correct) throw new Error('正答キーが未登録です');
  var accepted = rj.acceptedAnswers || {};
  var keys = [];
  var expected = {};
  if (Array.isArray(correct)) {
    for (var i = 0; i < correct.length; i++) {
      var k = String(i + 1);
      keys.push(k);
      expected[k] = String(correct[i]);
    }
  } else {
    keys = Object.keys(correct).sort(compareDobokuAnswerKeys_);
    keys.forEach(function(k) { expected[k] = String(correct[k]); });
  }
  var actual = parseDobokuAnswerMap_(answerText, keys);
  var correctCount = 0;
  var criteria = keys.map(function(k) {
    var ok = isDobokuExpectedAnswer_(actual[k], expected[k], accepted[k]);
    if (ok) correctCount += 1;
    return {
      name: '小問 ' + k,
      score: ok ? 1 : 0,
      maxScore: 1,
      comment: ok ? '正解' : '不正解（正答: ' + expected[k] + '、解答: ' + (actual[k] || '未入力') + '）'
    };
  });
  var maxScore = Number(rubric.maxScore || 10);
  var score = Math.round((correctCount / keys.length) * maxScore * 10) / 10;
  return {
    score: score,
    maxScore: maxScore,
    overallComment: correctCount + '/' + keys.length + '問正解です。',
    criteria: criteria,
    strengths: correctCount === keys.length ? ['全問正解です。'] : (correctCount > 0 ? ['正答キーと一致した小問があります。'] : []),
    improvements: correctCount < keys.length ? ['不正解又は未入力の小問を復習してください。'] : [],
    fullScoreHints: correctCount < keys.length ? ['満点にするには、不正解又は未入力の小問を正答キーと一致させてください。'] : [],
    addableExamples: [],
    warnings: [],
    confidence: 1,
    officialNotice: '正答キーに基づく採点です。',
    excludeFromTotal: rj.excludeFromTotal === true,
    rawJson: { correctAnswers: correct, userAnswers: actual, correctCount: correctCount, total: keys.length }
  };
}

function isDobokuExpectedAnswer_(actual, expected, accepted) {
  var a = normalizeDobokuAnswerText_(actual);
  if (!a) return false;
  var values = [];
  values.push(expected);
  if (Array.isArray(accepted)) values = values.concat(accepted);
  return values.some(function(v) { return a === normalizeDobokuAnswerText_(v); });
}

function parseDobokuAnswerMap_(answerText, keys) {
  var map = {};
  var lines = String(answerText || '').split(/\r?\n/);
  lines.forEach(function(line) {
    var clean = String(line || '').trim();
    if (!clean) return;
    keys.forEach(function(k) {
      if (map[k]) return;
      var keyPattern = escapeRegExp_(k);
      var re = new RegExp('(?:^|[\\s　\\|,、;；])(?:問|小問|空欄)?\\s*' + keyPattern + '\\s*[\\)）\\]】\\.．:：=＝、\\s]+([^\\s　,、;；\\|]+)');
      var m = clean.match(re);
      if (m) map[k] = m[1];
    });
  });
  if (Object.keys(map).length === 0) {
    var tokens = extractDobokuAnswerTokens_(answerText);
    if (tokens.length === keys.length) keys.forEach(function(k, i) { map[k] = tokens[i]; });
  }
  return map;
}

function extractDobokuAnswerTokens_(value) {
  var text = String(value || '').replace(/[：:=＝]/g, ' ');
  var chunks = text.split(/[\r\n\t ,、;；]+/).map(function(v) { return String(v || '').trim(); }).filter(String);
  return chunks.filter(function(v) {
    return !/^(問|小問|空欄|正答|解答|答え|イ|ロ|ハ|ニ|ホ|へ|ト|チ|リ|ヌ|ル|ヲ|ワ)$/.test(v);
  });
}

function normalizeDobokuAnswerText_(value) {
  return String(value || '').trim()
    .replace(/[０-９]/g, function(ch) { return String(ch.charCodeAt(0) - 0xFF10); })
    .replace(/[Ａ-Ｚａ-ｚ]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
    .replace(/[ 　\t\r\n・,、。\.．]/g, '')
    .replace(/メートル/g, 'm')
    .toLowerCase();
}

function gradeDobokuWithOpenAI_(question, rubric, answerText, model, apiKey) {
  var rj = parseDobokuJson_(rubric.rubricJson, {});
  var maxScore = Number(rubric.maxScore || rj.maxScore || 10);
  var payload = {
    question: {
      qId: question.qId,
      year: question.year,
      number: question.number,
      questionType: question.questionType,
      stem: question.stem,
      modelAnswer: question.modelAnswer,
      imageUrls: getDobokuQuestionImageInputUrls_(question)
    },
    rubric: {
      responseType: rubric.responseType,
      sourceQuality: rubric.sourceQuality,
      scoreMode: rubric.scoreMode,
      reviewStatus: rubric.reviewStatus,
      maxScore: maxScore,
      rubricJson: rj
    },
    answerText: answerText
  };
  var userContent = [{ type: 'input_text', text: JSON.stringify(payload) }];
  getDobokuQuestionImageInputUrls_(question).forEach(function(url) {
    userContent.push({ type: 'input_image', image_url: url, detail: getDobokuOpenAIImageDetail_() });
  });
  var body = {
    model: model,
    store: false,
    max_output_tokens: getDobokuOpenAIMaxOutputTokens_(),
    input: [
      {
        role: 'developer',
        content: [{
          type: 'input_text',
          text: [
            'あなたは1級土木施工管理技術検定 第二次検定の学習用採点者です。',
            '公式採点者ではありません。reference_onlyは必ずAI推定点として扱います。',
            '記述式の公式模範解答は公表されないため、参考答案との文字一致ではなく、設問要求、具体性、施工管理上の妥当性、因果関係、除外条件への適合で評価してください。',
            '経験記述は工事概要、現場状況、技術的課題、検討項目、対応処置、評価の対応関係を重視してください。',
            '図表画像が添付されている場合は、図表・施工手順・条件を画像から読み取って採点してください。画像が読めない場合はwarningsに明記し、確信度を下げてください。',
            '設問が「2つ選び」「3つ選び」など指定数を示している場合、答案が指定数を超えて回答していれば条件違反としてwarningsに明記し、内容が良くても満点にしないでください。',
            '答案欄に「答案例として」「2つだけ書くなら」「理由・ポイント」などの学習メモ・答案外コメントが含まれる場合は、改善点として指摘してください。',
            '10点は出し惜しみしないでください。設問要求を満たし、具体性と因果が十分なら10点を付けてください。',
            'scoreがmaxScore未満の場合、fullScoreHintsには満点を妨げている不足点を具体的に書き、addableExamplesには答案へ追記・差替えできる短い文例を書いてください。',
            '9点台の場合は、10点に近づくための最小限の追記を1〜2件に絞ってください。',
            '講評は簡潔にしてください。overallCommentは160字以内、criteria.commentは各80字以内を目安にしてください。',
            'rubricJsonにcorrectAnswersがある穴埋め・選択問題でも、単純な文字列一致ではなく、答案の表記ゆれ、番号付き回答、表形式回答、説明付き回答を読み取り、正答キーを根拠にAI採点してください。',
            '指定JSON schemaだけで返してください。'
          ].join('\n')
        }]
      },
      { role: 'user', content: userContent }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'doboku2ji_grading',
        strict: true,
        schema: getDobokuGradingSchema_()
      }
    }
  };
  var reasoningEffort = getDobokuOpenAIReasoningEffort_(model);
  if (reasoningEffort) body.reasoning = { effort: reasoningEffort };
  var resp = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  var data = parseDobokuJson_(text, {});
  if (code < 200 || code >= 300) {
    var msg = data && data.error && data.error.message ? data.error.message : text;
    throw new Error('OpenAI API error ' + code + ': ' + msg);
  }
  if (data && data.status === 'incomplete') {
    var reason = data.incomplete_details && data.incomplete_details.reason ? data.incomplete_details.reason : 'unknown';
    throw new Error('OpenAI APIの出力が途中で終了しました: ' + reason);
  }
  var outputText = extractOpenAIOutputText_(data);
  if (!outputText) throw new Error('OpenAI APIの出力が空です');
  var parsed = parseDobokuJsonOutput_(outputText);
  if (!parsed) throw new Error('OpenAI APIのJSON出力を解析できません: ' + summarizeDobokuOutput_(outputText));
  var result = normalizeDobokuAiResult_(parsed, rubric);
  result.reasoningEffort = reasoningEffort;
  result.usage = getDobokuOpenAIUsageMetrics_(data, model);
  return result;
}

function getDobokuOpenAIUsageMetrics_(responseData, model) {
  var usage = responseData && responseData.usage || {};
  var inputTokens = Number(usage.input_tokens || 0);
  var outputTokens = Number(usage.output_tokens || 0);
  var totalTokens = Number(usage.total_tokens || inputTokens + outputTokens || 0);
  var inputDetails = usage.input_tokens_details || usage.prompt_tokens_details || {};
  var outputDetails = usage.output_tokens_details || {};
  var cachedInputTokens = Number(inputDetails.cached_tokens || 0);
  var reasoningTokens = Number(outputDetails.reasoning_tokens || 0);
  var pricing = getDobokuOpenAIPricing_(model);
  var billableInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
  var costUsd =
    billableInputTokens / 1000000 * pricing.inputUsdPer1M +
    cachedInputTokens / 1000000 * pricing.cachedInputUsdPer1M +
    outputTokens / 1000000 * pricing.outputUsdPer1M;
  return {
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    totalTokens: totalTokens,
    cachedInputTokens: cachedInputTokens,
    reasoningTokens: reasoningTokens,
    estimatedCostUsd: roundDobokuCost_(costUsd, 6),
    estimatedCostJpy: roundDobokuCost_(costUsd * pricing.usdJpyRate, 2),
    pricing: pricing
  };
}

function getDobokuOpenAIPricing_(model) {
  var m = String(model || '').trim().toLowerCase();
  var table = {
    'gpt-5.5-pro': { inputUsdPer1M: 30, cachedInputUsdPer1M: 0, outputUsdPer1M: 180 },
    'gpt-5.5': { inputUsdPer1M: 5, cachedInputUsdPer1M: 0.5, outputUsdPer1M: 30 },
    'gpt-5.4-pro': { inputUsdPer1M: 30, cachedInputUsdPer1M: 0, outputUsdPer1M: 180 },
    'gpt-5.4-mini': { inputUsdPer1M: 0.75, cachedInputUsdPer1M: 0.075, outputUsdPer1M: 4.5 },
    'gpt-5.4-nano': { inputUsdPer1M: 0.2, cachedInputUsdPer1M: 0.02, outputUsdPer1M: 1.25 },
    'gpt-5.4': { inputUsdPer1M: 2.5, cachedInputUsdPer1M: 0.25, outputUsdPer1M: 15 }
  };
  var base = null;
  Object.keys(table).some(function(prefix) {
    if (m === prefix || m.indexOf(prefix + '-') === 0) { base = table[prefix]; return true; }
    return false;
  });
  if (!base) base = { inputUsdPer1M: 0, cachedInputUsdPer1M: 0, outputUsdPer1M: 0 };
  var props = PropertiesService.getScriptProperties();
  return {
    model: String(model || ''),
    inputUsdPer1M: getDobokuNumberProperty_(props, 'OPENAI_INPUT_PRICE_PER_1M_USD', base.inputUsdPer1M),
    cachedInputUsdPer1M: getDobokuNumberProperty_(props, 'OPENAI_CACHED_INPUT_PRICE_PER_1M_USD', base.cachedInputUsdPer1M),
    outputUsdPer1M: getDobokuNumberProperty_(props, 'OPENAI_OUTPUT_PRICE_PER_1M_USD', base.outputUsdPer1M),
    usdJpyRate: getDobokuNumberProperty_(props, 'OPENAI_USD_JPY_RATE', getDobokuNumberProperty_(props, 'USD_JPY_RATE', 160)),
    source: 'openai_api_pricing_2026_06_standard_or_script_properties'
  };
}

function getDobokuNumberProperty_(props, key, fallback) {
  var raw = props.getProperty(key);
  if (raw === null || raw === undefined || raw === '') return Number(fallback || 0);
  var n = Number(raw);
  return isFinite(n) ? n : Number(fallback || 0);
}

function roundDobokuCost_(value, digits) {
  var n = Number(value || 0);
  if (!isFinite(n)) return 0;
  var p = Math.pow(10, Number(digits || 0));
  return Math.round(n * p) / p;
}

function getDobokuOpenAIMaxOutputTokens_() {
  var value = Number(PropertiesService.getScriptProperties().getProperty('OPENAI_MAX_OUTPUT_TOKENS') || 1800);
  if (!isFinite(value) || value < 1200) return 1800;
  if (value > 4000) return 4000;
  return Math.floor(value);
}

function getDobokuOpenAIImageDetail_() {
  var detail = String(PropertiesService.getScriptProperties().getProperty('OPENAI_IMAGE_DETAIL') || 'high').trim().toLowerCase();
  var allowed = { low: true, high: true, auto: true };
  if (!allowed[detail]) throw new Error('OPENAI_IMAGE_DETAIL は low/high/auto のいずれかで指定してください');
  return detail;
}

function getDobokuOpenAIReasoningEffort_(model) {
  var configured = PropertiesService.getScriptProperties().getProperty('OPENAI_REASONING_EFFORT');
  var effort = String(configured || 'low').trim().toLowerCase();
  if (!effort || effort === 'default') return '';
  var allowed = { none: true, minimal: true, low: true, medium: true, high: true, xhigh: true };
  if (!allowed[effort]) throw new Error('OPENAI_REASONING_EFFORT は none/minimal/low/medium/high/xhigh/default のいずれかで指定してください');
  if (!supportsDobokuOpenAIReasoningEffort_(model)) {
    if (configured) throw new Error('OPENAI_REASONING_EFFORT は gpt-5系又はo-series系モデルでのみ使用してください');
    return '';
  }
  return effort;
}

function supportsDobokuOpenAIReasoningEffort_(model) {
  var m = String(model || '').trim().toLowerCase();
  return /^gpt-5(?:\.|-|$)/.test(m) || /^o\d/.test(m) || /^o-/.test(m);
}

function normalizeDobokuAiResult_(parsed, rubric) {
  var rj = parseDobokuJson_(rubric.rubricJson, {});
  var maxScore = Number(rubric.maxScore || parsed.maxScore || 10);
  var score = Number(parsed.score || 0);
  if (!isFinite(score)) score = 0;
  if (score < 0) score = 0;
  if (score > maxScore) score = maxScore;
  var criteria = Array.isArray(parsed.criteria) ? parsed.criteria : [];
  return {
    score: Math.round(score * 10) / 10,
    maxScore: maxScore,
    overallComment: String(parsed.overallComment || ''),
    criteria: criteria.map(function(c) {
      return { name: String(c.name || ''), score: Number(c.score || 0), maxScore: Number(c.maxScore || 0), comment: String(c.comment || '') };
    }),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    fullScoreHints: Array.isArray(parsed.fullScoreHints) ? parsed.fullScoreHints : [],
    addableExamples: Array.isArray(parsed.addableExamples) ? parsed.addableExamples : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    confidence: Number(parsed.confidence || 0),
    officialNotice: String(parsed.officialNotice || rj.displayNotice || 'AI推定点・公式採点ではありません。'),
    excludeFromTotal: rj.excludeFromTotal === true || parsed.excludeFromTotal === true,
    rawJson: parsed
  };
}

function getDobokuGradingSchema_() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['score', 'maxScore', 'overallComment', 'criteria', 'strengths', 'improvements', 'fullScoreHints', 'addableExamples', 'warnings', 'confidence', 'officialNotice', 'excludeFromTotal'],
    properties: {
      score: { type: 'number' },
      maxScore: { type: 'number' },
      overallComment: { type: 'string' },
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'score', 'maxScore', 'comment'],
          properties: { name: { type: 'string' }, score: { type: 'number' }, maxScore: { type: 'number' }, comment: { type: 'string' } }
        }
      },
      strengths: { type: 'array', items: { type: 'string' } },
      improvements: { type: 'array', items: { type: 'string' } },
      fullScoreHints: { type: 'array', items: { type: 'string' } },
      addableExamples: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
      officialNotice: { type: 'string' },
      excludeFromTotal: { type: 'boolean' }
    }
  };
}

function extractOpenAIOutputText_(data) {
  if (data && data.output_text) return String(data.output_text);
  var out = data && data.output;
  if (!out || !Array.isArray(out)) return '';
  var chunks = [];
  var structured = null;
  out.forEach(function(item) {
    var content = item && item.content;
    if (!content || !Array.isArray(content)) return;
    content.forEach(function(c) {
      if (!c) return;
      if (c.parsed !== undefined && c.parsed !== null) { structured = c.parsed; return; }
      if (c.json !== undefined && c.json !== null) { structured = c.json; return; }
      if (typeof c.text === 'string') chunks.push(c.text);
      else if (c.text && typeof c.text.value === 'string') chunks.push(c.text.value);
      else if (typeof c.refusal === 'string') chunks.push(c.refusal);
    });
  });
  if (structured !== null) return JSON.stringify(structured);
  return chunks.join('').trim();
}

function parseDobokuJsonOutput_(value) {
  var text = String(value || '').trim().replace(/^\uFEFF/, '');
  var parsed = parseDobokuJson_(text, null);
  if (typeof parsed === 'string') parsed = parseDobokuJson_(parsed, null);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  var fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) {
    parsed = parseDobokuJson_(String(fence[1] || '').trim(), null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    parsed = parseDobokuJson_(text.slice(start, end + 1), null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }
  return null;
}

function summarizeDobokuOutput_(value) {
  return String(value || '').replace(/\s+/g, ' ').slice(0, 220);
}

function compareDobokuAnswerKeys_(a, b) {
  var order = { 'イ': 1, 'ロ': 2, 'ハ': 3, 'ニ': 4, 'ホ': 5, 'ヘ': 6, 'ト': 7, 'チ': 8, 'リ': 9, 'ヌ': 10 };
  var aa = order[String(a)] || Number((String(a).match(/\d+/) || [999])[0]);
  var bb = order[String(b)] || Number((String(b).match(/\d+/) || [999])[0]);
  if (aa !== bb) return aa - bb;
  return String(a).localeCompare(String(b));
}

function escapeRegExp_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDobokuJson_(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (e) { return fallback; }
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  var out = [];
  for (var i = 0; i < bytes.length; i++) {
    var v = bytes[i];
    if (v < 0) v += 256;
    var h = v.toString(16);
    if (h.length < 2) h = '0' + h;
    out.push(h);
  }
  return out.join('');
}

function parseDobokuImageUrls_(value) {
  if (Array.isArray(value)) return value.filter(function(v) { return String(v || '').trim(); });
  var s = String(value || '').trim();
  if (!s) return [];
  try {
    var parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.filter(function(v) { return String(v || '').trim(); });
    }
  } catch (e) {}
  return s.split(/[\n,]/).map(function(v) { return String(v || '').trim(); }).filter(function(v) { return v; });
}

function normalizeDobokuImportBool_(value) {
  var s = String(value || '').trim().toLowerCase();
  return (s === 'true' || s === '1' || s === 'yes') ? 'true' : '';
}

function setDobokuQuestionField_(row, headers, key, value) {
  var idx = headers.indexOf(key);
  if (idx >= 0) row[idx] = value;
}

// Bulk upsert questions from a 2D array (rows without header)
// Each row: [qId, year, number, questionType, stem, modelAnswer, tags, status, imageRequired, imageUrls]
function apiImportQuestions(rows, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return { _error: true, message: 'データが空です' };
    }
    var sh = getSheet_(SHEETS.QuestionBank);
    ensureSheetColumns_(sh, HEADERS[SHEETS.QuestionBank]);
    var values = sh.getDataRange().getValues();
    var headers = values.length ? values[0].map(function(h, i) { return normalizeHeader_(h, i); }) : HEADERS[SHEETS.QuestionBank];
    var qIdCol = headers.indexOf('qId');
    var yearCol = headers.indexOf('year');
    var numberCol = headers.indexOf('number');
    var rowNoByQId = {};
    var rowNoByYearNumber = {};
    for (var existingRow = 1; existingRow < values.length; existingRow++) {
      var existingQId = String(values[existingRow][qIdCol] || '').trim();
      var existingYear = String(values[existingRow][yearCol] || '').trim();
      var existingNumber = String(values[existingRow][numberCol] || '').trim();
      if (existingQId) rowNoByQId[existingQId] = existingRow + 1;
      if (existingYear && existingNumber) rowNoByYearNumber[existingYear + ':' + existingNumber] = existingRow + 1;
    }

    var now = new Date().toISOString();
    var toInsert = [];
    var updated = 0;
    var unchanged = 0;
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var qId = String(r[0] || '').trim();
      if (!qId) { skipped++; continue; }
      var year = String(r[1] || '').trim();
      var number = String(r[2] || '').trim();
      var desired = {};
      desired.qId = qId;
      desired.year = year;
      desired.number = number;
      desired.questionType = String(r[3] || 'essay').trim();
      desired.stem = String(r[4] || '').trim();
      desired.modelAnswer = String(r[5] || '').trim();
      desired.tags = String(r[6] || '').trim();
      desired.status = String(r[7] || 'published').trim() || 'published';
      desired.imageRequired = normalizeDobokuImportBool_(r[8]);
      desired.imageUrls = Array.isArray(r[9]) ? JSON.stringify(r[9]) : String(r[9] || '').trim();
      desired.updatedAt = now;
      desired.hasImageUrlsInput = desired.imageUrls !== '';

      var rowNo = rowNoByQId[qId] || rowNoByYearNumber[year + ':' + number] || 0;
      if (rowNo) {
        var existing = values[rowNo - 1].slice(0, headers.length);
        while (existing.length < headers.length) existing.push('');
        var changed = false;
        ['qId', 'year', 'number', 'questionType', 'stem', 'modelAnswer', 'tags', 'status', 'imageRequired'].forEach(function(key) {
          var col = headers.indexOf(key);
          if (col < 0) return;
          if (String(existing[col] || '') !== String(desired[key] || '')) {
            existing[col] = desired[key];
            changed = true;
          }
        });
        if (desired.hasImageUrlsInput) {
          var imageUrlsCol = headers.indexOf('imageUrls');
          if (imageUrlsCol >= 0 && String(existing[imageUrlsCol] || '') !== String(desired.imageUrls || '')) {
            existing[imageUrlsCol] = desired.imageUrls;
            changed = true;
          }
        }
        if (changed) {
          setDobokuQuestionField_(existing, headers, 'updatedAt', now);
          sh.getRange(rowNo, 1, 1, headers.length).setValues([existing]);
          updated += 1;
        } else {
          unchanged += 1;
        }
        continue;
      }

      toInsert.push(headers.map(function(h) {
        return desired.hasOwnProperty(h) ? desired[h] : '';
      }));
    }
    appendRows_(sh, toInsert);
    clearQuestionsCache_();
    return { imported: toInsert.length, updated: updated, unchanged: unchanged, skipped: skipped };
  } catch (e) {
    return { _error: true, message: 'インポートエラー: ' + String(e.message || e) };
  }
}

// Update only modelAnswer for existing questions.
// Each item: { qId, modelAnswer }
function apiUpdateModelAnswers(items, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { _error: true, message: '更新データが空です' };
    }
    var sh = getSheet_(SHEETS.QuestionBank);
    var values = sh.getDataRange().getValues();
    if (values.length <= 1) return { updated: 0, unchanged: 0, notFound: items.length, blank: 0 };

    var headers = values[0].map(function(h, i) { return normalizeHeader_(h, i); });
    var qIdCol = headers.indexOf('qId');
    var answerCol = headers.indexOf('modelAnswer');
    var updatedCol = headers.indexOf('updatedAt');
    if (qIdCol < 0 || answerCol < 0) {
      return { _error: true, message: 'qId または modelAnswer ヘッダーが見つかりません' };
    }

    var rowById = {};
    for (var r = 1; r < values.length; r++) {
      rowById[String(values[r][qIdCol] || '').trim()] = r + 1;
    }

    var now = new Date().toISOString();
    var updated = 0;
    var unchanged = 0;
    var blank = 0;
    var notFound = [];

    items.forEach(function(item) {
      var qId = String(item && item.qId || '').trim();
      var modelAnswer = String(item && item.modelAnswer || '').trim();
      if (!qId || !modelAnswer) {
        blank += 1;
        return;
      }
      var rowNo = rowById[qId];
      if (!rowNo) {
        notFound.push(qId);
        return;
      }
      var current = String(values[rowNo - 1][answerCol] || '').trim();
      if (current === modelAnswer) {
        unchanged += 1;
        return;
      }
      sh.getRange(rowNo, answerCol + 1).setValue(modelAnswer);
      if (updatedCol >= 0) sh.getRange(rowNo, updatedCol + 1).setValue(now);
      updated += 1;
    });

    clearQuestionsCache_();
    return { updated: updated, unchanged: unchanged, notFound: notFound, blank: blank };
  } catch (e) {
    return { _error: true, message: '模範解答更新エラー: ' + String(e.message || e) };
  }
}

function apiAdminDashboard(clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    var ctx = requireManager_(clientUserKey);
    var questions = getCachedQuestions_();
    var questionMetaById = {};
    var typeTotals = {};
    questions.forEach(function(q) {
      var qId = String(q.qId || '').trim();
      if (!qId) return;
      questionMetaById[qId] = q;
      var typeLabel = getDobokuAdminTypeLabel_(q);
      typeTotals[typeLabel] = (typeTotals[typeLabel] || 0) + 1;
    });
    var completionColumns = getYearSummary_().map(function(y) {
      return { key: String(y.year || ''), label: String(y.year || ''), total: Number(y.count || 0) };
    });
    var users = readRecords_(getSheet_(SHEETS.Users));
    var usersByEmail = {};
    users.forEach(function(u) {
      var email = String(u.email || '').trim().toLowerCase();
      if (email) usersByEmail[email] = u;
    });

    var statsByUserKey = {};
    readRecords_(getSheet_(SHEETS.Notes)).forEach(function(n) {
      var key = String(n.userKey || '').trim();
      if (!key) return;
      if (!statsByUserKey[key]) statsByUserKey[key] = {
        noteCount: 0,
        answeredCount: 0,
        answeredQids: {},
        answeredByYear: {},
        lastActivity: '',
        scorePctSum: 0,
        scoreCount: 0,
        last7DaysCount: 0,
        typeStats: {}
      };
      var st = statsByUserKey[key];
      var hasAnswer = String(n.noteText || '').trim() !== '';
      if (hasAnswer) st.noteCount += 1;
      var qId = String(n.qId || '').trim();
      if (hasAnswer && qId && !st.answeredQids[qId]) {
        st.answeredQids[qId] = true;
        st.answeredCount += 1;
        var meta = questionMetaById[qId] || null;
        var year = meta ? String(meta.year || '').trim() : '';
        if (year) {
          if (!st.answeredByYear[year]) st.answeredByYear[year] = {};
          st.answeredByYear[year][qId] = true;
        }
        if (meta) {
          var typeLabel = getDobokuAdminTypeLabel_(meta);
          if (!st.typeStats[typeLabel]) st.typeStats[typeLabel] = { answered: 0, scorePctSum: 0, scoreCount: 0 };
          st.typeStats[typeLabel].answered += 1;
        }
      }
      var at = formatAdminDate_(n.updatedAt);
      if (at && at > st.lastActivity) st.lastActivity = at;
      if (isAdminWithinLast7Days_(n.updatedAt)) st.last7DaysCount += 1;
    });

    var accessRows = readRecordsFromSheet_(getUserAccessSheet_());
    var rows = [];
    accessRows.forEach(function(access) {
      var email = String(access.email || '').trim().toLowerCase();
      if (!email) return;
      var active = normalizeUserAccessBoolean_(access.active, true) !== 'false';
      var showInDashboard = normalizeUserAccessBoolean_(access.showInDashboard, true) !== 'false';
      if (!active || !showInDashboard) return;
      if (ctx.role === 'manager' && String(access.managerEmail || '').trim().toLowerCase() !== ctx.email) return;
      var u = usersByEmail[email] || {};
      var stats = statsByUserKey[String(u.userKey || '')] || {
        noteCount: 0,
        answeredCount: 0,
        answeredQids: {},
        answeredByYear: {},
        lastActivity: '',
        scorePctSum: 0,
        scoreCount: 0,
        last7DaysCount: 0,
        typeStats: {}
      };
      var completedByUnit = {};
      var unitProgress = {};
      completionColumns.forEach(function(col) {
        var key = String(col.key || '');
        var answeredMap = (stats.answeredByYear || {})[key] || {};
        var answered = Object.keys(answeredMap).length;
        var total = Number(col.total || 0);
        unitProgress[key] = { answered: answered, total: total };
        if (total > 0 && answered >= total) completedByUnit[key] = true;
      });
      rows.push({
        email: email,
        displayName: String(access.displayName || u.displayName || email).trim(),
        role: String(access.role || 'user').trim().toLowerCase(),
        userKey: String(u.userKey || ''),
        answeredCount: stats.answeredCount,
        noteCount: stats.noteCount,
        totalQuestions: questions.length,
        progressPct: questions.length ? Math.round(stats.answeredCount / questions.length * 1000) / 10 : 0,
        lastActivity: stats.lastActivity,
        avgScorePct: stats.scoreCount > 0 ? Math.round(stats.scorePctSum / stats.scoreCount * 10) / 10 : 0,
        last7DaysCount: stats.last7DaysCount || 0,
        typeStats: buildAdminTypeStats_(typeTotals, stats.typeStats),
        completedByUnit: completedByUnit,
        unitProgress: unitProgress
      });
    });

    return toSerializable_({ auth: getCurrentAuthInfo_(clientUserKey), totalQuestions: questions.length, completionColumns: completionColumns, users: rows });
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function getDobokuSelfScorePct_(score) {
  var s = String(score || '').trim();
  if (s === '◎') return 100;
  if (s === '○') return 75;
  if (s === '△') return 50;
  if (s === '×') return 0;
  return 0;
}

function getDobokuAdminTypeLabel_(q) {
  var n = Number(q && q.number || 0);
  var text = [
    q && q.questionType || '',
    q && q.tags || '',
    q && q.stem || ''
  ].join(' ');
  if (n === 1 || text.indexOf('経験') >= 0) return '経験記述';
  if (n >= 2 && n <= 3) return '必須問題';
  if (n >= 4 && n <= 7) return '選択(1)';
  if (n >= 8 && n <= 11) return '選択(2)';
  if (/安全|品質|工程|施工管理/.test(text)) return '施工管理';
  if (/土工|土木|コンクリート|基礎|舗装|河川/.test(text)) return '土木一般';
  return 'その他';
}

function buildAdminTypeStats_(typeTotals, userTypeStats) {
  return Object.keys(typeTotals || {}).sort().map(function(label) {
    var s = (userTypeStats || {})[label] || {};
    var answered = Number(s.answered || 0);
    var scoreCount = Number(s.scoreCount || 0);
    return {
      label: label,
      answered: answered,
      total: Number(typeTotals[label] || 0),
      avgScorePct: scoreCount > 0 ? Math.round(Number(s.scorePctSum || 0) / scoreCount * 10) / 10 : 0
    };
  });
}

function isAdminWithinLast7Days_(value) {
  if (!value) return false;
  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return false;
  return (new Date().getTime() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000;
}

function apiSyncDashboardRoster(clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    requireAdmin_(clientUserKey);
    return syncDashboardRosterForCurrentApp_();
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function apiAdminListUserAccess(clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    requireAdmin_(clientUserKey);
    return toSerializable_(readRecordsFromSheet_(getUserAccessSheet_()));
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function apiAdminUpsertUserAccess(payload, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    requireAdmin_(clientUserKey);
    var list = Array.isArray(payload) ? payload : [payload];
    var count = 0;
    list.forEach(function(item) {
      if (!item) return;
      var email = String(item.email || '').trim().toLowerCase();
      if (!email) return;
      upsertUserAccess_(item);
      count += 1;
    });
    return { ok: true, updated: count };
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function apiAdminImportUserAccessCsv(csvText, clientUserKey) {
  __clientUserKey = clientUserKey || '';
  try {
    requireAdmin_(clientUserKey);
    var parsed = Utilities.parseCsv(String(csvText || '').trim());
    if (!parsed || parsed.length < 2) return { ok: true, imported: 0 };
    var header = parsed[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
    var imported = 0;
    for (var r = 1; r < parsed.length; r++) {
      var row = {};
      for (var c = 0; c < header.length; c++) row[header[c]] = parsed[r][c];
      var email = String(row.email || '').trim().toLowerCase();
      if (!email) continue;
      upsertUserAccess_(row);
      imported += 1;
    }
    return { ok: true, imported: imported };
  } catch (e) {
    return { _error: true, message: String(e.message || e) };
  }
}

function upsertUserAccess_(item) {
  var sh = getUserAccessSheet_();
  var headers = HEADERS[SHEETS.UserAccess];
  var values = sh.getDataRange().getValues();
  var target = String(item.email || '').trim().toLowerCase();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var row = [
    target,
    String(item.role || 'user').trim().toLowerCase(),
    String(item.managerEmail || '').trim().toLowerCase(),
    normalizeUserAccessBoolean_(item.active, true),
    now,
    String(item.displayName || '').trim(),
    normalizeUserAccessBoolean_(item.showInDashboard, true)
  ];
  var emailCol = headers.indexOf('email');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][emailCol] || '').trim().toLowerCase() === target) {
      sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
  sh.appendRow(row);
}

function formatAdminDate_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var d = new Date(value);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  return String(value);
}
