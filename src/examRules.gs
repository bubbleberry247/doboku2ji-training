// examRules.gs - year-specific written-exam section rules.

var DOBOKU_EXAM_RULE_SETS_ = {
  legacy: [
    { key: 'required', label: '必須問題', range: '問題1', noFrom: 1, noTo: 1, mode: 'ALL', required: 1, time: '60分目安', instruction: '問題1は必ず解答します。' },
    { key: 'selectionA', label: '選択問題(1)', range: '問題2〜6', noFrom: 2, noTo: 6, mode: 'PICK', required: 3, time: '60分目安', instruction: '問題2〜6の5問から3問を選んで解答します。' },
    { key: 'selectionB', label: '選択問題(2)', range: '問題7〜11', noFrom: 7, noTo: 11, mode: 'PICK', required: 3, time: '60分目安', instruction: '問題7〜11の5問から3問を選んで解答します。' }
  ],
  modern: [
    { key: 'required', label: '必須問題', range: '問題1〜3', noFrom: 1, noTo: 3, mode: 'ALL', required: 3, time: '70分目安', instruction: '問題1〜3は全問解答します。' },
    { key: 'selectionA', label: '選択問題(1)', range: '問題4〜7', noFrom: 4, noTo: 7, mode: 'PICK', required: 2, time: '50分目安', instruction: '問題4〜7の4問から2問を選んで解答します。' },
    { key: 'selectionB', label: '選択問題(2)', range: '問題8〜11', noFrom: 8, noTo: 11, mode: 'PICK', required: 2, time: '60分目安', instruction: '問題8〜11の4問から2問を選んで解答します。' }
  ]
};

var DOBOKU_EXAM_RULE_SET_BY_YEAR_ = {
  H28: 'legacy', H29: 'legacy', H30: 'legacy', R1: 'legacy', R2: 'legacy',
  R3: 'modern', R4: 'modern', R5: 'modern', R6: 'modern', R7: 'modern'
};

function cloneDobokuExamRules_(value) {
  return JSON.parse(JSON.stringify(value || []));
}

function getDobokuExamRuleSetKey_(year) {
  return DOBOKU_EXAM_RULE_SET_BY_YEAR_[String(year || '').trim().toUpperCase()] || 'modern';
}

function getDobokuExamSectionRules_(year) {
  return cloneDobokuExamRules_(DOBOKU_EXAM_RULE_SETS_[getDobokuExamRuleSetKey_(year)] || DOBOKU_EXAM_RULE_SETS_.modern);
}

function getDobokuExamSectionRuleForQuestion_(year, number) {
  var no = Number(number || 0);
  var rules = getDobokuExamSectionRules_(year);
  for (var i = 0; i < rules.length; i++) {
    if (no >= rules[i].noFrom && no <= rules[i].noTo) return rules[i];
  }
  return null;
}

function getDobokuExamSectionKeyForQuestion_(year, number) {
  var rule = getDobokuExamSectionRuleForQuestion_(year, number);
  return rule ? String(rule.key || '') : '';
}

function getDobokuExamRulesForClient_() {
  return {
    defaultRuleSet: 'modern',
    ruleSetByYear: DOBOKU_EXAM_RULE_SET_BY_YEAR_,
    ruleSets: DOBOKU_EXAM_RULE_SETS_
  };
}
