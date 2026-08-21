import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, '..');
const SRC = path.join(ROOT, 'src');
const CANONICAL_ROOT = path.resolve(
  process.env.DOBOKU_CANONICAL_ROOT || path.join(ROOT, '..', 'doboku2ji-training'),
);
const CSV_PATH = path.join(CANONICAL_ROOT, 'data', 'doboku2ji_questions.csv');
const RUBRIC_PATH = path.join(CANONICAL_ROOT, 'data', 'scoring_rubrics.json');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.length === 0) {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeNewlines(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function loadSeedContext() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(read('src/seedQuestions.gs'), context, { filename: 'src/seedQuestions.gs' });
  return context;
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function findingIds(rows, field, patterns) {
  const findings = [];
  rows.forEach((row) => {
    const text = String(row[field] || '');
    patterns.forEach(([rule, pattern]) => {
      if (pattern.test(text)) findings.push({ qId: row.qId, field, rule });
    });
  });
  return findings;
}

const expectedHeaders = [
  'qId', 'year', 'number', 'questionType', 'stem', 'modelAnswer',
  'tags', 'status', 'imageRequired', 'imageUrls',
];
const csvRowsWithHeader = parseCsv(fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, ''));
assert.ok(csvRowsWithHeader.length > 0, `canonical CSV is empty: ${CSV_PATH}`);
const headers = csvRowsWithHeader[0];
const csvRows = csvRowsWithHeader.slice(1).map((values) =>
  Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
);
assert.deepEqual(headers, expectedHeaders, 'canonical QuestionBank headers changed');
assert.equal(csvRows.length, 110, 'canonical QuestionBank row count');

const seedContext = loadSeedContext();
const seedRows = seedContext.DOBOKU2JI_QUESTION_SEED_ROWS_;
assert.ok(Array.isArray(seedRows), 'production seed rows are not an array');
assert.equal(seedRows.length, 110, 'production v91 bundled seed row count');
const canonicalById = new Map(csvRows.map((row) => [row.qId.trim(), row]));
const seedById = new Map(seedRows.map((row) => [String(row[0] || '').trim(), row]));
const fieldNames = expectedHeaders;
const seedDiffs = [];
seedRows.forEach((seedRow, rowIndex) => {
  assert.equal(seedRow.length, fieldNames.length, `seed row ${rowIndex + 1} column count`);
  const qId = String(seedRow[0] || '').trim();
  const canonical = canonicalById.get(qId);
  assert.ok(canonical, `seed qId missing from canonical CSV: ${qId}`);
  fieldNames.forEach((field, fieldIndex) => {
    if (normalizeNewlines(seedRow[fieldIndex]) !== normalizeNewlines(canonical[field])) {
      seedDiffs.push({ qId, field });
    }
  });
});
assert.equal(seedDiffs.length, 0, 'production seed differs from canonical CSV');
assert.equal(seedById.size, csvRows.length, 'production seed qId uniqueness');

const years = ['H28', 'H29', 'H30', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];
const seenQids = new Set();
const structuralFindings = [];
csvRows.forEach((row) => {
  const qId = row.qId.trim();
  if (seenQids.has(qId)) structuralFindings.push({ qId, rule: 'duplicate_qId' });
  seenQids.add(qId);
  assert.match(qId, /^Q_(?:H28|H29|H30|R[1-7])_\d{2}$/, `qId format: ${qId}`);
  assert.ok(years.includes(row.year.trim()), `unknown year for ${qId}`);
  const number = Number(row.number);
  assert.ok(Number.isInteger(number) && number >= 1 && number <= 11, `number range: ${qId}`);
  ['qId', 'year', 'number', 'questionType', 'stem', 'modelAnswer', 'status'].forEach((field) => {
    if (!String(row[field] || '').trim()) structuralFindings.push({ qId, field, rule: 'blank_required_value' });
  });
  if (String(row.status).trim() !== 'published') structuralFindings.push({ qId, rule: 'non_published' });
  const required = String(row.imageRequired || '').trim().toLowerCase();
  const imageText = String(row.imageUrls || '').trim();
  if (required && required !== 'true' && required !== 'false') structuralFindings.push({ qId, rule: 'invalid_imageRequired' });
  if (required === 'true' && !imageText) structuralFindings.push({ qId, rule: 'required_image_missing' });
  if (imageText) {
    let urls;
    try { urls = JSON.parse(imageText); } catch { urls = null; }
    if (!Array.isArray(urls) || urls.length === 0 || urls.some((url) => typeof url !== 'string' || !/^https?:\/\//.test(url))) {
      structuralFindings.push({ qId, rule: 'invalid_imageUrls' });
    }
  }
});
assert.equal(structuralFindings.length, 0, 'QuestionBank structural findings');
assert.equal(seenQids.size, 110, 'canonical qId uniqueness');
years.forEach((year) => {
  const numbers = csvRows.filter((row) => row.year.trim() === year).map((row) => Number(row.number)).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 11 }, (_, index) => index + 1), `${year} must contain questions 1..11`);
});

const imageRequiredQids = csvRows.filter((row) => String(row.imageRequired).trim().toLowerCase() === 'true').map((row) => row.qId);
const imageUrlQids = csvRows.filter((row) => String(row.imageUrls).trim()).map((row) => row.qId);
assert.equal(imageRequiredQids.length, 12, 'image-required count');
assert.equal(imageUrlQids.length, 13, 'image URL count');
assert.deepEqual(
  Object.keys(seedContext.DOBOKU2JI_IMAGE_REQUIRED_QIDS_).sort(),
  [...imageRequiredQids].sort(),
  'bundled figure-required map differs from canonical imageRequired flags',
);

const expectedSectionTag = (year, number) => {
  const legacy = ['H28', 'H29', 'H30', 'R1', 'R2'].includes(year);
  if (legacy ? number === 1 : number <= 3) return '必須問題';
  if (legacy ? number <= 6 : number <= 7) return '選択問題(1)';
  return '選択問題(2)';
};
const sectionInstructionFindings = [];
csvRows.forEach((row) => {
  const tags = String(row.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
  const expected = expectedSectionTag(row.year.trim(), Number(row.number));
  if (!tags.includes(expected)) sectionInstructionFindings.push({ qId: row.qId, rule: 'section_tag_mismatch' });
});
assert.equal(sectionInstructionFindings.length, 0, 'multiple-answer/section tag consistency');

const rubricRows = JSON.parse(fs.readFileSync(RUBRIC_PATH, 'utf8'));
assert.ok(Array.isArray(rubricRows), `rubric source is not an array: ${RUBRIC_PATH}`);
assert.equal(rubricRows.length, 110, 'canonical rubric row count');
const rubricIds = new Set();
rubricRows.forEach((row) => {
  const qId = String(row.qId || '').trim();
  assert.ok(qId, 'rubric qId is blank');
  assert.ok(!rubricIds.has(qId), `duplicate rubric qId: ${qId}`);
  rubricIds.add(qId);
  ['responseType', 'sourceQuality', 'scoreMode', 'reviewStatus', 'maxScore'].forEach((field) => {
    assert.ok(String(row[field] ?? '').trim() !== '', `rubric field ${field} blank: ${qId}`);
  });
  assert.ok(Number(row.maxScore) > 0, `rubric maxScore invalid: ${qId}`);
  assert.ok(row.rubricJson && typeof row.rubricJson === 'object', `rubricJson missing: ${qId}`);
  assert.ok(Object.keys(row.rubricJson).length > 0, `rubricJson empty: ${qId}`);
});
assert.deepEqual([...rubricIds].sort(), [...seenQids].sort(), 'rubric qId set differs from QuestionBank');

const textPatterns = [
  ['control_character', /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/],
  ['replacement_character', /\uFFFD/],
  ['duplicate_ascii_token', /\b([A-Za-z0-9]{2,})[ \t]+\1\b/i],
  ['duplicate_japanese_token', /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{2,})[ \t]+\1/u],
  ['placeholder_R_S_T_U_B_C', /(?:^|[\s([【「（])(?:R|S|T|U|B)(?:[ \t]*[,、][ \t]*C)?(?=$|[\s)\]】」,、:：）])/],
  ['bang_degree', /![ \t]*(?:℃|°)/],
  ['digit_letter_confusion', /\b(?:[ILO]\d{1,4}|\d{1,4}[ILO])\b/],
  ['ascii_word_split_by_linebreak', /[A-Za-z0-9]\r?\n[A-Za-z0-9]/],
  ['figure_ocr_tail', /(?:図|表|写真|画像)[ \t]*[:：]?[A-Za-z]{1,4}[ \t]*$/],
  ['blank_answer_choice', /(?:\[\s*\]|\(\s*\)|（\s*）|[,、][ \t]*[,、])/],
  ['known_r7_ocr_pattern', /主[ \t]*事|単[ \t]*王|留[ \t]+意|\\\(/],
];
const textCandidates = [
  ...findingIds(csvRows, 'stem', textPatterns),
  ...findingIds(csvRows, 'modelAnswer', textPatterns),
];
const duplicateCandidates = textCandidates.filter((finding) => finding.rule === 'duplicate_ascii_token');
const highConfidenceCandidates = textCandidates.filter((finding) =>
  ['control_character', 'replacement_character', 'bang_degree'].includes(finding.rule)
);

const api = read('src/api.gs');
const html = read('src/index.html');
const dashboardApi = extractFunction(api, 'apiAdminDashboard');
assert.doesNotMatch(dashboardApi, /requireManager_\(clientUserKey\)/, 'regular learner dashboard remains manager-only');
assert.match(dashboardApi, /getUserContextByKey_\(clientUserKey\)/);
assert.match(dashboardApi, /if \(!ctx\.userKey \|\| !ctx\.active\)/);
assert.match(dashboardApi, /var canViewAllDashboardUsers = ctx\.isManager === true/);
assert.match(dashboardApi, /var forceSelfVisibility = !canViewAllDashboardUsers && isSelf/);
assert.match(dashboardApi, /if \(!canViewAllDashboardUsers && !isSelf\) return/);
assert.match(dashboardApi, /dashboardScope: canViewAllDashboardUsers \? .*'self'/s);

const dashboardContext = {
  console,
  __clientUserKey: '',
  SHEETS: { Users: 'Users', Notes: 'Notes' },
  getDobokuMiniCompletionLegacyCutoffMs_: () => 0,
  getUserContextByKey_: (key) => key === 'self-key'
    ? { userKey: 'self-key', email: 'self@example.test', role: 'user', active: true, isAdmin: false, isManager: false }
    : { userKey: 'manager-key', email: 'manager@example.test', role: 'manager', active: true, isAdmin: false, isManager: true },
  getCachedQuestions_: () => [{ qId: 'Q_R7_01', year: 'R7', number: 1 }],
  getDobokuAdminTypeLabel_: () => '必須問題',
  getYearSummary_: () => [{ year: 'R7', count: 1 }],
  buildDobokuAdminMiniMeta_: () => ({ columns: [] }),
  getDobokuMiniCompletionTrackingByUser_: () => ({}),
  getSheet_: (name) => name,
  readRecords_: (sheet) => sheet === 'Users'
    ? [{ email: 'self@example.test', userKey: 'self-key', displayName: 'self' }, { email: 'other@example.test', userKey: 'other-key', displayName: 'other' }]
    : [],
  readRecordsFromSheet_: () => [
    { email: 'self@example.test', active: 'true', showInDashboard: 'false', displayName: 'self', role: 'user' },
    { email: 'other@example.test', active: 'true', showInDashboard: 'true', displayName: 'other', role: 'user', managerEmail: 'manager@example.test' },
  ],
  getUserAccessSheet_: () => 'UserAccess',
  normalizeUserAccessBoolean_: (value, fallback) => value === undefined || value === null || value === '' ? fallback : String(value).toLowerCase(),
  formatAdminDate_: () => '',
  isAdminWithinLast7Days_: () => false,
  buildDobokuMiniCompletionCounts_: () => ({ byTest: {}, totalCompletions: 0 }),
  buildAdminTypeStats_: () => [],
  toSerializable_: (value) => value,
  getCurrentAuthInfo_: (key) => ({ userKey: key, isAdmin: false, isManager: key === 'manager-key' }),
};
vm.createContext(dashboardContext);
vm.runInContext(dashboardApi, dashboardContext, { filename: 'apiAdminDashboard' });
const selfDashboard = dashboardContext.apiAdminDashboard('self-key');
assert.equal(selfDashboard.dashboardScope, 'self');
assert.deepEqual(Array.from(selfDashboard.users, (user) => user.email), ['self@example.test'], 'regular learner must receive only self row');
const managerDashboard = dashboardContext.apiAdminDashboard('manager-key');
assert.equal(managerDashboard.dashboardScope, 'team');
assert.deepEqual(Array.from(managerDashboard.users, (user) => user.email), ['other@example.test'], 'manager fixture must receive assigned team row');

assert.match(html, /var canDashboard = !!USER_KEY/);
assert.match(extractFunction(html, 'showAdmin'), /if \(!USER_KEY\)/);
assert.match(html, /var canManageDashboard = !!\(data\.auth && \(data\.auth\.isAdmin \|\| data\.auth\.isManager\)\)/);
assert.match(html, /canManageDashboard \? .*syncRoster_\(\)/s);
assert.match(html, /あなたの学習ダッシュボード/);
assert.match(html, /class="dashboard-status-help"/);
assert.match(html, /進捗率 ≥ 80%/);
assert.match(html, /直近7日以内の活動 &gt; 0 かつ進捗率 &lt; 80%/);
assert.match(html, /進捗率 &gt; 0% かつ &lt; 30%/);
assert.match(html, /進捗率 = 0% または直近7日以内の活動 = 0/);

const statusCards = extractFunction(html, 'buildAdminStatusCards_');
const statusContext = {
  console,
  getAdminProgressPct_: (member) => Number(member.pct || 0),
  getAdminRecentCount_: (member) => Number(member.recent || 0),
};
vm.createContext(statusContext);
vm.runInContext(statusCards, statusContext, { filename: 'buildAdminStatusCards_' });
const renderedStatusCards = statusContext.buildAdminStatusCards_([
  { pct: 80, recent: 0 },
  { pct: 50, recent: 1 },
  { pct: 20, recent: 1 },
  { pct: 0, recent: 0 },
], 110);
['優秀', '急成長', '要サポート', '停滞中', '進捗率 ≥ 80%', '直近7日以内の活動 &gt; 0 かつ進捗率 &lt; 80%', '進捗率 &gt; 0% かつ &lt; 30%', '進捗率 = 0% または直近7日以内の活動 = 0'].forEach((label) => {
  assert.match(renderedStatusCards, new RegExp(label));
});

const drawAdmin = extractFunction(html, 'drawAdmin');
const drawContext = {
  console,
  state: {},
  renderHomeNav_: () => '',
  buildMiniCompletionMatrix_: () => '',
  buildCompletionMatrix_: () => '',
  buildAdminInsights_: () => '',
  shouldShowDashboardMember_: (member) => !!member,
  getAdminDisplayName_: (member) => member.displayName || '氏名未設定',
  escapeHtml: (value) => String(value ?? ''),
  document: { getElementById: () => drawContext.main },
  main: { innerHTML: '' },
};
vm.createContext(drawContext);
vm.runInContext(drawAdmin, drawContext, { filename: 'drawAdmin' });
drawContext.drawAdmin({
  auth: { isAdmin: false, isManager: false },
  dashboardScope: 'self',
  totalQuestions: 110,
  users: [{ displayName: 'self', answeredCount: 1, totalQuestions: 110, progressPct: 0 }],
});
assert.match(drawContext.main.innerHTML, /あなたの学習ダッシュボード/);
assert.doesNotMatch(drawContext.main.innerHTML, /名簿を同期/);
drawContext.main.innerHTML = '';
drawContext.drawAdmin({
  auth: { isAdmin: true, isManager: true },
  dashboardScope: 'all',
  totalQuestions: 110,
  users: [{ displayName: 'admin-view', answeredCount: 1, totalQuestions: 110, progressPct: 0 }],
});
assert.match(drawContext.main.innerHTML, /名簿を同期/);

for (const file of fs.readdirSync(SRC).filter((name) => name.endsWith('.js'))) {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(SRC, file), 'utf8'), { filename: file }), `syntax: ${file}`);
}
for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
  const script = match[1].replace(/<\?(?:!=|=)?[\s\S]*?\?>/g, '');
  if (script.trim()) assert.doesNotThrow(() => new vm.Script(script, { filename: 'index.html:inline-script' }));
}

console.log(JSON.stringify({
  status: 'passed',
  scope: 'doboku2ji-v91-dashboard-and-questionbank-machine-qa',
  canonicalCsvPath: CSV_PATH,
  canonicalRubricPath: RUBRIC_PATH,
  canonicalQuestionCount: csvRows.length,
  productionSeedQuestionCount: seedRows.length,
  canonicalToProductionSeedDiffCount: seedDiffs.length,
  qIdUniqueCount: seenQids.size,
  sectionInstructionFindingCount: sectionInstructionFindings.length,
  imageRequiredCount: imageRequiredQids.length,
  imageUrlCount: imageUrlQids.length,
  rubricCount: rubricRows.length,
  textCandidateCount: textCandidates.length,
  duplicateTokenCandidateCount: duplicateCandidates.length,
  highConfidenceTextCandidateCount: highConfidenceCandidates.length,
  textCandidateQIds: [...new Set(textCandidates.map((finding) => `${finding.qId}:${finding.field}:${finding.rule}`))].sort(),
  officialOriginalSourceChecked: false,
  liveQuestionBankChecked: false,
  note: 'Text candidates are heuristic/manual-review signals only; no full question text is emitted.',
}, null, 2));
