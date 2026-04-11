// Code.gs — entry point for doboku2ji-training GAS webapp

function doGet(e) {
  // Auto-setup on first access
  if (!getDbId_()) { setup_(); }

  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

  // Admin/diagnostic endpoints
  if (action === 'setup') {
    setup_();
    return ContentService.createTextOutput(JSON.stringify({ ok: true, dbId: getDbId_() }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'setupDb') {
    var dbId = e.parameter.dbId || '';
    if (dbId) {
      setDbId_(dbId);
      return HtmlService.createHtmlOutput(
        '<pre>DB linked: ' + dbId + '</pre>'
      ).setTitle('Setup');
    }
    return HtmlService.createHtmlOutput(
      '<pre>ERROR: dbId parameter required. Usage: ?action=setupDb&dbId=SPREADSHEET_ID</pre>'
    ).setTitle('Setup');
  }

  if (action === 'diag') {
    var props = PropertiesService.getScriptProperties();
    var dbIdVal = props.getProperty('DB_SPREADSHEET_ID') || 'NOT SET';
    return HtmlService.createHtmlOutput(
      '<pre>' + JSON.stringify({ DB_SPREADSHEET_ID: dbIdVal.substring(0, 12) + '...' }, null, 2) + '</pre>'
    ).setTitle('Diagnostics');
  }

  // Default: serve SPA
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('土木2次 過去問学習')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Run this function once from the Apps Script editor to initialize the database
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
  // Ensure all sheets exist
  var db = getDb_();
  Object.keys(SHEETS).forEach(function(k) {
    var name = SHEETS[k];
    var sh = db.getSheetByName(name);
    if (!sh) {
      sh = db.insertSheet(name);
      setHeaders_(sh, HEADERS[name]);
      Logger.log('Created sheet: ' + name);
    }
  });
  Logger.log('Setup complete');
}
