/**
 * F&L Studio — analytics collector.
 *
 * analytics.js on the website sends one small JSON record per page view (re-sent with a higher
 * copy number while the visitor is still on the page). This script appends each copy to the
 * "F&L Studio — Analytics" sheet; compact() runs nightly and keeps only the latest copy of each.
 * Nothing here identifies a person: no IP addresses (Apps Script never sees them), no cookies.
 *
 * Deployed as a Web App (execute as: me, access: anyone) on the studio account. Opening the /exec URL once
 * while signed in as the studio asks for permission and then runs setup() by itself.
 */

var SHEET_NAME = 'F&L Studio — Analytics';
var HEAD = ['Time', 'Visit', 'Page view', 'Copy', 'Page', 'Source', 'Medium', 'Campaign', 'Device', 'Time zone',
  'Language', 'Engaged (s)', 'Scroll %', 'Booked', 'Data'];

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (!raw || raw.length > 20000) return done();
    var d = JSON.parse(raw);
    if (!d || typeof d.v !== 'string' || typeof d.p !== 'string' || !/^[a-z0-9]{6,24}$/.test(d.p)) return done();
    sheet().appendRow([new Date(), cell(d.v, 24), cell(d.p, 24), Number(d.f) || 0, cell(d.path, 120), cell(d.s), cell(d.m, 20),
      cell(d.c), cell(d.dev, 10), cell(d.tz, 40), cell(d.lang, 5), Number(d.eng) || 0, Number(d.sc) || 0, d.cv ? 1 : 0, raw]);
  } catch (err) {
    console.error(err);
  }
  return done();
}

function doGet() {
  if (PropertiesService.getScriptProperties().getProperty('READY')) return done();
  setup();
  return HtmlService.createHtmlOutput('<p style="font:16px sans-serif">Analytics collector is set up. Sheet: <a href="' +
    sheet().getParent().getUrl() + '" target="_blank">F&amp;L Studio — Analytics</a></p>');
}

/** Nightly: keep only the newest copy of each page view, so the sheet stays small. */
function compact() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sh = sheet(), vals = sh.getDataRange().getValues();
    if (vals.length < 3) return;
    var best = {}, keep = [];
    for (var i = 1; i < vals.length; i++) {
      var id = vals[i][2], b = best[id];
      if (!b) best[id] = { i: i, first: vals[i][0] };
      else if (Number(vals[i][3]) >= Number(vals[b.i][3])) b.i = i;
    }
    Object.keys(best).forEach(function (id) {
      var row = vals[best[id].i].slice(); row[0] = best[id].first; keep.push(row);   // keep when the view started
    });
    keep.sort(function (a, b) { return a[0] - b[0]; });
    if (keep.length === vals.length - 1) return;
    sh.getRange(2, 1, vals.length - 1, HEAD.length).clearContent();
    sh.getRange(2, 1, keep.length, HEAD.length).setValues(keep);
    if (sh.getMaxRows() > keep.length + 500) sh.deleteRows(keep.length + 2, sh.getMaxRows() - keep.length - 501);
  } finally {
    lock.releaseLock();
  }
}

function setup() {
  var ss = sheet().getParent();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'compact') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('compact').timeBased().everyDays(1).atHour(3).create();
  importOld();
  PropertiesService.getScriptProperties().setProperty('READY', '1');
  Logger.log('Analytics sheet: ' + ss.getUrl());
}

function sheet() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID'), ss = null;
  if (id) try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  if (!ss) {
    var files = DriveApp.getFilesByName(SHEET_NAME);
    ss = files.hasNext() ? SpreadsheetApp.open(files.next()) : SpreadsheetApp.create(SHEET_NAME);
    props.setProperty('SHEET_ID', ss.getId());
    var sh = ss.getSheets()[0];
    if (sh.getLastRow() === 0) {
      sh.setName('Page views').appendRow(HEAD);
      sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold').setBackground('#160f20').setFontColor('#cfae72');
      sh.setFrozenRows(1);
    }
  }
  return ss.getSheets()[0];
}

/** Copies in the page views recorded before the move (OldData.gs), once, ahead of anything new. */
function importOld() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('IMPORTED') || typeof OLD_ROWS === 'undefined' || !OLD_ROWS.length) return;
  var rows = OLD_ROWS.map(function (r) {
    var row = r.slice(0, HEAD.length);
    row[0] = Utilities.parseDate(r[0], 'America/Chicago', 'MM/dd/yyyy HH:mm:ss');
    for (var i = 3; i < 14; i++) if (i === 3 || i >= 11) row[i] = Number(row[i]) || 0;
    return row.map(function (v, i) { return i === 0 || typeof v === 'number' ? v : cell(v, i === 14 ? 20000 : 120); });
  });
  var sh = sheet();
  sh.insertRowsAfter(1, rows.length);
  sh.getRange(2, 1, rows.length, HEAD.length).setValues(rows);
  props.setProperty('IMPORTED', '1');
}

// text that starts like a formula is stored as plain text, so nobody can plant a formula in the sheet
function cell(v, n) { var s = String(v == null ? '' : v).slice(0, n || 80); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function done() { return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT); }
