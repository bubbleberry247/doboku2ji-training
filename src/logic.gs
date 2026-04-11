// logic.gs — business logic helpers

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
