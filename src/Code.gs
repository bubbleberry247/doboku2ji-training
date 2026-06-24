// Code.gs — entry point for doboku2ji-training GAS webapp

var DOBOKU2JI_BUILD_VERSION_ = '2026-06-24-practice-summary-v1';

function doGet(e) {
  // Auto-setup on first access
  if (!getDbId_()) { setup_(); }
  try {
    ensureDoboku2jiScheduleConfig_();
    ensureDoboku2jiQuestionSeed_();
  } catch (seedErr) {
    Logger.log('Question seed sync skipped: ' + String(seedErr && seedErr.message || seedErr));
  }

  // OAuth error
  var oauthError = (e && e.parameter) ? e.parameter.error : '';
  if (oauthError) {
    var msgs = {
      'access_denied': 'ログインがキャンセルされました',
      'invalid_request': 'リクエストが無効です',
      'server_error': 'Googleサーバーエラーが発生しました'
    };
    return errorPage_(msgs[oauthError] || 'Google認証エラーが発生しました');
  }

  // OAuth callback (code + state)
  var code = (e && e.parameter) ? e.parameter.code : '';
  var state = (e && e.parameter) ? e.parameter.state : '';
  if (code && state) {
    return handleOAuthCallback_(code, state);
  }

  // OAuth start
  var oauthStart = (e && e.parameter) ? e.parameter.oauthStart : '';
  if (oauthStart === '1') {
    return generateOAuthStartPage_();
  }

  // Admin actions
  var action = (e && e.parameter) ? e.parameter.action : '';
  if (action === 'setup') {
    var setupAuthError = requireMaintenanceToken_(e);
    if (setupAuthError) return setupAuthError;
    setup_();
    return ContentService.createTextOutput(JSON.stringify({ ok: true, dbId: getDbId_() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'syncRoster') {
    var syncAuthError = requireMaintenanceToken_(e);
    if (syncAuthError) return syncAuthError;
    return ContentService.createTextOutput(JSON.stringify(syncDashboardRosterForCurrentApp_()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'diag') {
    var config = getConfigMap_();
    var qDiag = getQuestionDiag_();
    var uaDiag = getUserAccessDiag_();
    var props = PropertiesService.getScriptProperties();
    var configuredOpenAIModel = String(props.getProperty('OPENAI_MODEL') || '');
    var configuredOpenAIReasoningEffort = String(props.getProperty('OPENAI_REASONING_EFFORT') || '');
    var configuredOpenAIMaxOutputTokens = String(props.getProperty('OPENAI_MAX_OUTPUT_TOKENS') || '');
    return ContentService.createTextOutput(JSON.stringify({
      dbId: getDbId_() ? 'SET' : 'MISSING',
      googleClientId: getConfigValue_(config, 'GOOGLE_CLIENT_ID', '') ? 'SET' : 'MISSING',
      appExecUrl: getAppExecUrl_(),
      buildVersion: DOBOKU2JI_BUILD_VERSION_,
      openaiApiKey: props.getProperty('OPENAI_API_KEY') ? 'SET' : 'MISSING',
      openaiModel: configuredOpenAIModel || 'gpt-5.4-mini',
      openaiModelConfigured: configuredOpenAIModel,
      openaiReasoningEffort: configuredOpenAIReasoningEffort || 'low',
      openaiReasoningEffortConfigured: configuredOpenAIReasoningEffort,
      openaiMaxOutputTokens: configuredOpenAIMaxOutputTokens || '1800',
      openaiMaxOutputTokensConfigured: configuredOpenAIMaxOutputTokens,
      questionSeedVersion: getConfigValue_(config, 'QUESTION_SEED_VERSION', ''),
      questionCount: qDiag.questionCount,
      totalQuestionRows: qDiag.totalQuestionRows,
      excludedQuestionCount: qDiag.excludedQuestionCount,
      needsModelAnswerCount: qDiag.needsModelAnswerCount,
      imageRequiredCount: qDiag.imageRequiredCount,
      imageMissingCount: qDiag.imageMissingCount,
      allImageRequiredCount: qDiag.allImageRequiredCount,
      allImageMissingCount: qDiag.allImageMissingCount,
      excludedImageRequiredCount: qDiag.excludedImageRequiredCount,
      rubricCount: qDiag.rubricCount,
      aiGradingCount: qDiag.aiGradingCount,
      yearCounts: qDiag.yearCounts,
      r7q1StemHead: qDiag.r7q1StemHead,
      r7q1BadStem: qDiag.r7q1BadStem,
      userAccessCount: uaDiag.userAccessCount,
      adminCount: uaDiag.adminCount
    })).setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'selftest') {
    return ContentService.createTextOutput(JSON.stringify(getDoboku2jiSelfTest_()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'initImportToken') {
    var tokenAuthError = requireMaintenanceToken_(e);
    if (tokenAuthError) return tokenAuthError;
    var props = PropertiesService.getScriptProperties();
    var existing = props.getProperty('IMPORT_TOKEN');
    if (!existing) {
      var tok = Utilities.getUuid();
      props.setProperty('IMPORT_TOKEN', tok);
      return ContentService.createTextOutput(JSON.stringify({ token: tok }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ token: existing }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Serve SPA
  return serveSpa_('');
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('IMPORT_TOKEN');
    if (!token || params.token !== token) {
      return ContentService.createTextOutput(JSON.stringify({ _error: true, message: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var action = params.action || '';
    if (action === 'importQuestions') {
      var result = apiImportQuestions(params.rows, '');
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'updateModelAnswers') {
      var updateResult = apiUpdateModelAnswers(params.answers || [], '');
      return ContentService.createTextOutput(JSON.stringify(updateResult))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'importRubrics') {
      var rubricResult = apiImportRubrics(params.rubrics || params.rows || [], '');
      return ContentService.createTextOutput(JSON.stringify(rubricResult))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'importQuestionImages') {
      var imageResult = apiImportQuestionImages(params.images || params.rows || [], '', params.replaceExisting);
      return ContentService.createTextOutput(JSON.stringify(imageResult))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ _error: true, message: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ _error: true, message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function requireMaintenanceToken_(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('MAINTENANCE_TOKEN') || '';
  var supplied = '';
  if (e && e.parameter) {
    supplied = String(e.parameter.maintenanceToken || e.parameter.adminToken || '').trim();
  }
  if (!expected || supplied !== expected) {
    return ContentService.createTextOutput(JSON.stringify({ _error: true, message: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return null;
}

function setup_() {
  var id = getDbId_();
  if (!id) {
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
    var ss = SpreadsheetApp.create('Doboku2ji_DB_' + today);
    setDbId_(ss.getId());
    Logger.log('Database created: ' + ss.getName() + ' ' + ss.getUrl());
  } else {
    Logger.log('Database already linked: ' + id);
  }
  var db = getDb_();
  Object.keys(SHEETS).forEach(function(k) {
    var name = SHEETS[k];
    var sh = db.getSheetByName(name);
    if (!sh) {
      sh = db.insertSheet(name);
      setHeaders_(sh, HEADERS[name]);
      Logger.log('Created sheet: ' + name);
    } else {
      ensureSheetColumns_(sh, HEADERS[name]);
    }
  });
  ensureDoboku2jiScheduleConfig_();
  ensureDoboku2jiQuestionSeed_();
  syncDashboardRosterForCurrentApp_();
  Logger.log('Setup complete');
}

function getQuestionDiag_() {
  var sh = getSheet_(SHEETS.QuestionBank);
  ensureSheetColumns_(sh, HEADERS[SHEETS.QuestionBank]);
  var values = sh.getDataRange().getValues();
  var headers = values.length ? values[0].map(function(h, i) { return normalizeHeader_(h, i); }) : [];
  var qIdCol = headers.indexOf('qId');
  var yearCol = headers.indexOf('year');
  var numberCol = headers.indexOf('number');
  var stemCol = headers.indexOf('stem');
  var statusCol = headers.indexOf('status');
  var imageRequiredCol = headers.indexOf('imageRequired');
  var imageUrlsCol = headers.indexOf('imageUrls');
  var years = {};
  var r7q1StemHead = '';
  var r7q1BadStem = false;
  var totalRows = 0;
  var published = 0;
  var excluded = 0;
  var needsModelAnswer = 0;
  var imageRequiredCount = 0;
  var imageMissingCount = 0;
  var allImageRequiredCount = 0;
  var allImageMissingCount = 0;
  var excludedImageRequiredCount = 0;
  var rubricCount = 0;
  var aiGradingCount = 0;
  try {
    rubricCount = Math.max(readRecords_(getSheet_(SHEETS.ScoringRubrics)).length, 0);
  } catch (e0) {}
  try {
    aiGradingCount = Math.max(readRecords_(getSheet_(SHEETS.AiGradings)).length, 0);
  } catch (e1) {}
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var qId = qIdCol >= 0 ? String(row[qIdCol] || '').trim() : '';
    if (!qId) continue;
    totalRows += 1;
    var status = statusCol >= 0 ? String(row[statusCol] || '').trim() : 'published';
    var isPublished = status === 'published';
    var isImageRequired = imageRequiredCol >= 0 && String(row[imageRequiredCol] || '').trim().toLowerCase() === 'true';
    var hasImage = imageUrlsCol >= 0 && String(row[imageUrlsCol] || '').trim() !== '';
    if (isImageRequired) {
      allImageRequiredCount += 1;
      if (!hasImage) allImageMissingCount += 1;
    }
    if (!isPublished) {
      excluded += 1;
      if (status === 'needs_model_answer') needsModelAnswer += 1;
      if (isImageRequired) excludedImageRequiredCount += 1;
      continue;
    }
    published += 1;
    if (isImageRequired) {
      imageRequiredCount += 1;
      if (!hasImage) imageMissingCount += 1;
    }
    var y = yearCol >= 0 ? String(row[yearCol] || '') : '';
    if (y) years[y] = (years[y] || 0) + 1;
    var number = numberCol >= 0 ? String(row[numberCol] || '') : '';
    if (qId === 'Q_R7_01' || (y === 'R7' && number === '1')) {
      var stem = stemCol >= 0 ? String(row[stemCol] || '') : '';
      r7q1StemHead = stem.substring(0, 120);
      r7q1BadStem = /主\s*事|単\s*王|留\s+意|\\\(|\u0002|\u0003/.test(stem) || stem.length < 120;
    }
  }
  return {
    questionCount: published,
    totalQuestionRows: totalRows,
    excludedQuestionCount: excluded,
    needsModelAnswerCount: needsModelAnswer,
    imageRequiredCount: imageRequiredCount,
    imageMissingCount: imageMissingCount,
    allImageRequiredCount: allImageRequiredCount,
    allImageMissingCount: allImageMissingCount,
    excludedImageRequiredCount: excludedImageRequiredCount,
    rubricCount: rubricCount,
    aiGradingCount: aiGradingCount,
    yearCounts: years,
    r7q1StemHead: r7q1StemHead,
    r7q1BadStem: r7q1BadStem
  };
}

function getUserAccessDiag_() {
  var rows = readRecordsFromSheet_(getUserAccessSheet_());
  var adminCount = 0;
  rows.forEach(function(r) {
    if (String(r.role || '').trim().toLowerCase() === 'admin') adminCount += 1;
  });
  return { userAccessCount: rows.length, adminCount: adminCount };
}
