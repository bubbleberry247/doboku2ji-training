import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const server = { console, JSON };
vm.createContext(server);
vm.runInContext(fs.readFileSync(new URL('../src/examRules.gs', import.meta.url), 'utf8'), server);
vm.runInContext(fs.readFileSync(new URL('../src/api.gs', import.meta.url), 'utf8'), server);
const seedSource = fs.readFileSync(new URL('../src/seedQuestions.gs', import.meta.url), 'utf8');
vm.runInContext(seedSource, server);

function sectionSummary(year) {
  return server.getDobokuExamSectionRules_(year).map((rule) =>
    [rule.key, rule.noFrom, rule.noTo, rule.mode, rule.required].join(':')
  );
}

assert.deepEqual(sectionSummary('H28'), [
  'required:1:1:ALL:1',
  'selectionA:2:6:PICK:3',
  'selectionB:7:11:PICK:3'
]);
assert.deepEqual(sectionSummary('R2'), sectionSummary('H28'));
assert.deepEqual(sectionSummary('R3'), [
  'required:1:3:ALL:3',
  'selectionA:4:7:PICK:2',
  'selectionB:8:11:PICK:2'
]);
assert.deepEqual(sectionSummary('R7'), sectionSummary('R3'));

assert.equal(server.getDobokuExamSectionKeyForQuestion_('H28', 2), 'selectionA');
assert.equal(server.getDobokuExamSectionKeyForQuestion_('H28', 7), 'selectionB');
assert.equal(server.getDobokuExamSectionKeyForQuestion_('R7', 2), 'required');
assert.equal(server.getDobokuExamSectionKeyForQuestion_('R7', 7), 'selectionA');
assert.equal(server.matchesDobokuPractice_({ year: 'H28', number: 7 }, 'selectionB'), true);
assert.equal(server.matchesDobokuPractice_({ year: 'H28', number: 7 }, 'selectionA'), false);
assert.equal(server.matchesDobokuPractice_({ year: 'H28', number: 7 }, 'management'), true);
assert.equal(server.matchesDobokuPractice_({ year: 'H28', number: 2 }, 'civil'), true);
assert.equal(server.getDobokuAdminTypeLabel_({ year: 'H28', number: 2 }), '選択(1)');
assert.equal(server.getDobokuAdminTypeLabel_({ year: 'R7', number: 2 }), '必須問題');
assert.equal(
  server.getDobokuSeedTagsForQuestion_('H28', 2, '記述式,必須問題', 'published', false),
  '記述式,選択問題(1)'
);
assert.equal(
  server.getDobokuSeedTagsForQuestion_('R7', 2, '記述式,選択問題(1)', 'published', false),
  '記述式,必須問題'
);
assert.equal(
  server.getDobokuSeedStem_('Q_R7_02', 'R7', '2', '設置、届に関する事項'),
  '設置届に関する事項'
);
assert.match(server.getDobokuSeedImageUrls_('Q_R7_10', ''), /Q_R7_10_reference\.png/);
assert.match(seedSource, /DOBOKU2JI_QUESTION_SEED_VERSION_ = "canonical-csv-[0-9a-f]{12}"/);
const seedColumns = { stem: 4, tags: 6, imageRequired: 9, imageUrls: 10 };
const seedDesired = { stem: 'corrected', tags: 'retagged', imageRequired: '', imageUrls: '["new"]' };
assert.equal(
  JSON.stringify(server.getDobokuExistingSeedUpdatePairs_('Q_H28_02', seedColumns, seedDesired)),
  JSON.stringify([[6, 'retagged']])
);
assert.equal(
  JSON.stringify(server.getDobokuExistingSeedUpdatePairs_('Q_R7_02', seedColumns, seedDesired)),
  JSON.stringify([[6, 'retagged'], [4, 'corrected']])
);
assert.equal(
  JSON.stringify(server.getDobokuExistingSeedUpdatePairs_('Q_R7_10', seedColumns, seedDesired)),
  JSON.stringify([[6, 'retagged'], [9, ''], [10, '["new"]']])
);

const seedVm = { console, JSON };
vm.createContext(seedVm);
vm.runInContext(fs.readFileSync(new URL('../src/examRules.gs', import.meta.url), 'utf8'), seedVm);
vm.runInContext(seedSource, seedVm);
const seedHeaders = ['qId', 'year', 'number', 'questionType', 'stem', 'modelAnswer', 'tags', 'status', 'updatedAt', 'imageRequired', 'imageUrls'];
const seedValues = [
  seedHeaders.slice(),
  ['Q_H28_02', 'H28', 2, 'custom_type', '既存の設問本文', '既存の模範解答', '記述式,必須問題,独自タグ', 'published', 'old', true, '["https://example.com/original.png"]'],
  ['Q_R7_02', 'R7', 2, 'custom_type', '設置、届に関する既存本文', 'R7既存解答', '記述式,選択問題(1)', 'published', 'old', '', ''],
  ['Q_R7_10', 'R7', 10, 'custom_type', '既存のR7問10本文', 'R7問10既存解答', '記述式,選択問題(2)', 'published', 'old', true, '["https://example.com/old.png"]']
];
const seedSheet = {
  getDataRange: () => ({ getValues: () => seedValues.map((row) => row.slice()) }),
  getRange: (row) => ({ setValues: (rows) => { seedValues[row - 1] = rows[0].slice(); } })
};
seedVm.SHEETS = { QuestionBank: 'QuestionBank' };
seedVm.HEADERS = { QuestionBank: seedHeaders };
seedVm.getConfigMap_ = () => ({ QUESTION_SEED_VERSION: 'old-version' });
seedVm.getConfigValue_ = (map, key, fallback) => Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback;
seedVm.getSheet_ = () => seedSheet;
seedVm.ensureSheetColumns_ = () => {};
seedVm.normalizeHeader_ = (value) => String(value);
seedVm.appendRows_ = (_sheet, rows) => rows.forEach((row) => seedValues.push(row.slice()));
seedVm.clearQuestionsCache_ = () => {};
seedVm.setConfigValue_ = () => {};
const seedRun = seedVm.ensureDoboku2jiQuestionSeed_();
const seededByQid = new Map(seedValues.slice(1).map((row) => [String(row[0]), row]));
const seededH28 = seededByQid.get('Q_H28_02');
assert.match(seedRun.version, /^canonical-csv-[0-9a-f]{12}$/);
assert.equal(seededH28[3], 'custom_type');
assert.equal(seededH28[4], '既存の設問本文');
assert.equal(seededH28[5], '既存の模範解答');
assert.equal(seededH28[7], 'published');
assert.equal(seededH28[9], true);
assert.equal(seededH28[10], '["https://example.com/original.png"]');
assert.match(seededH28[6], /独自タグ/);
assert.match(seededH28[6], /選択問題\(1\)/);
assert.doesNotMatch(seededH28[6], /必須問題/);
assert.equal(seededByQid.get('Q_R7_02')[4], '設置届に関する既存本文');
assert.equal(seededByQid.get('Q_R7_02')[5], 'R7既存解答');
assert.equal(seededByQid.get('Q_R7_10')[7], 'published');
assert.equal(seededByQid.get('Q_R7_10')[9], '');
assert.match(seededByQid.get('Q_R7_10')[10], /Q_R7_10_reference\.png/);

const imageWrites = [];
const imageSheet = {
  getDataRange: () => ({ getValues: () => [
    ['qId', 'imageRequired', 'imageUrls', 'updatedAt'],
    ['Q_R7_10', 'true', '[]', 'old']
  ] }),
  getRange: (row, col) => ({ setValue: (value) => imageWrites.push({ row, col, value }) })
};
server.SHEETS = { QuestionBank: 'QuestionBank' };
server.HEADERS = { QuestionBank: ['qId', 'imageRequired', 'imageUrls', 'updatedAt'] };
server.getSheet_ = () => imageSheet;
server.ensureSheetColumns_ = () => {};
server.normalizeHeader_ = (value) => String(value);
assert.equal(server.updateDobokuQuestionImageUrls_('Q_R7_10', ['https://example.invalid/reference.png'], false), true);
assert.equal(imageWrites.find((write) => write.col === 2).value, '');
assert.match(imageWrites.find((write) => write.col === 3).value, /reference\.png/);

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing client function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated client function ${name}`);
}

const client = {
  console,
  _examRules: JSON.parse(JSON.stringify(server.getDobokuExamRulesForClient_())),
  state: {},
  isMockPractice_: () => true,
  captureCurrentAnswer_: () => {}
};
vm.createContext(client);
[
  'getQuestionNumber_',
  'getDobokuExamSectionRulesForClient_',
  'getMockSectionRules_',
  'getMockQuestionsForRule_',
  'getMockRequiredCount_',
  'getMockAnsweredCount_',
  'getMockAnsweredQIds_',
  'validateMockCompletion_'
].forEach((name) => vm.runInContext(extractFunction(html, name), client));

function questions(year) {
  return Array.from({ length: 11 }, (_, index) => ({
    qId: `Q_${year}_${String(index + 1).padStart(2, '0')}`,
    year,
    number: index + 1
  }));
}

function validate(year, answeredNumbers) {
  const sessionAnswers = {};
  answeredNumbers.forEach((number) => {
    sessionAnswers[`Q_${year}_${String(number).padStart(2, '0')}`] = '答案';
  });
  client.state = {
    currentYear: year,
    practiceKind: 'mock',
    questions: questions(year),
    sessionAnswers
  };
  return client.validateMockCompletion_();
}

assert.equal(validate('H28', [1, 2, 4, 6, 7, 8, 11]).ok, true);
assert.equal(validate('H28', [1, 2, 3, 4, 5, 8, 9]).ok, false);
assert.equal(validate('R7', [1, 2, 3, 4, 6, 8, 10]).ok, true);
assert.equal(validate('R7', [1, 2, 3, 4, 5, 6, 8, 10]).ok, false);

const auth = fs.readFileSync(new URL('../src/auth.gs', import.meta.url), 'utf8');
assert.match(auth, /template\.examRulesJson = toSafeTemplateJson_\(getDobokuExamRulesForClient_\(\)\)/);
assert.match(html, /getDobokuExamSectionRulesForClient_\(state\.currentYear\)/);
assert.match(html, /if \(q && Array\.isArray\(q\.imageUrls\)\)/);

console.log('doboku exam rules, preservation, and optional image handling: 49 assertions passed');
