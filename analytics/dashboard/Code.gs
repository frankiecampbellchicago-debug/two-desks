/**
 * F&L Studio — private analytics dashboard.
 *
 * Deployed as a Web App on the studio account that runs as the person viewing it: sign in as
 * frankandleilastudio@gmail.com (Frank and Leila both use it) to see the studio's two sheets:
 *   "F&L Studio — Analytics" (filled by the collector) and "F&L Studio — Bookings" (the booking script).
 */

var ANALYTICS = 'F&L Studio — Analytics', BOOKINGS = 'F&L Studio — Bookings';
var SITE = 'https://www.frankandleilastudio.com/';
var SEARCH_PROPERTY = 'sc-domain:frankandleilastudio.com';   // the Search Console property (a Domain property)

function doGet() {
  var t = HtmlService.createTemplateFromFile('Dashboard');
  t.site = SITE;
  return t.evaluate().setTitle('F&L Studio · Analytics').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Page views and bookings from the last 2 × days (the extra half is for "vs previous period"); days 0 = all. */
function getData(days) {
  days = Number(days) || 0;
  var since = days ? Date.now() - 2 * days * 864e5 : 0, views = {}, list = [], bookings = [];

  var a = open(ANALYTICS);
  if (a) {
    var vals = a.getSheets()[0].getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      var r = vals[i], t = r[0] instanceof Date ? r[0].getTime() : 0;
      if (!t || t < since) continue;
      var id = String(r[2]), copy = Number(r[3]) || 0, old = views[id];
      if (old && old.f > copy) continue;
      var d; try { d = JSON.parse(r[14]); } catch (e) { continue; }
      d.t = old ? old.t : t;
      views[id] = d;
    }
    for (var k in views) list.push(views[k]);
  }

  var b = open(BOOKINGS);
  if (b) {
    var bv = b.getSheets()[0].getDataRange().getValues();
    for (var j = 1; j < bv.length; j++) {
      var x = bv[j], rt = x[0] instanceof Date ? x[0].getTime() : 0;
      if (!rt || rt < since) continue;
      bookings.push({ t: rt, status: String(x[2]), business: String(x[6]), country: String(x[8]), services: String(x[10]),
        budget: String(x[11]), lang: String(x[13]), tz: String(x[14]), start: Number(x[15]) || 0,
        src: String(x[19] || ''), med: String(x[20] || ''), camp: String(x[21] || ''), visit: String(x[22] || '') });
    }
  }
  if (!a && !b) return JSON.stringify({ denied: true, who: Session.getActiveUser().getEmail() });
  return JSON.stringify({ views: list, bookings: bookings, now: Date.now(), days: days,
    sheets: { analytics: a ? a.getUrl() : '', bookings: b ? b.getUrl() : '' } });
}

/** Google searches from Search Console (needs the site added and verified there). days 0 = everything Google keeps (16 months). */
function getSearch(days) {
  days = Number(days) || 480;
  var day = function (n) { return Utilities.formatDate(new Date(Date.now() - n * 864e5), 'UTC', 'yyyy-MM-dd'); };
  var range = { startDate: day(days), endDate: day(0) }, prev = { startDate: day(2 * days), endDate: day(days + 1) };
  var url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(SEARCH_PROPERTY) + '/searchAnalytics/query';
  function q(r, dims, limit) {
    var body = { startDate: r.startDate, endDate: r.endDate, dimensions: dims, rowLimit: limit || 250, dataState: 'all' };
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    var j = JSON.parse(res.getContentText() || '{}');
    if (res.getResponseCode() !== 200) throw new Error((j.error && j.error.message) || ('HTTP ' + res.getResponseCode()));
    return j.rows || [];
  }
  try {
    return JSON.stringify({ ok: true, days: days,
      total: q(range, [], 1), prevTotal: q(prev, [], 1),
      dates: q(range, ['date'], 500), queries: q(range, ['query'], 250), pages: q(range, ['page'], 50),
      countries: q(range, ['country'], 50), devices: q(range, ['device'], 5),
      queryPages: q(range, ['query', 'page'], 250) });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e.message || e) });
  }
}

/** The two sheets, found by name in the Drive of whoever is signed in (the studio account) and remembered. */
function open(name) {
  var props = PropertiesService.getUserProperties(), key = 'id_' + name, id = props.getProperty(key);
  if (id) try { return SpreadsheetApp.openById(id); } catch (e) { props.deleteProperty(key); }
  try {
    var files = DriveApp.getFilesByName(name), best = null;
    while (files.hasNext()) { var f = files.next(); if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f; }
    if (!best) return null;
    props.setProperty(key, best.getId());
    return SpreadsheetApp.openById(best.getId());
  } catch (e) { return null; }
}

/** Run once from the editor to grant access to the sheets. */
function setup() {
  Logger.log('Analytics sheet: ' + (open(ANALYTICS) ? open(ANALYTICS).getUrl() : 'not created yet (run the collector setup first)'));
  Logger.log('Bookings sheet: ' + (open(BOOKINGS) ? open(BOOKINGS).getUrl() : 'not found'));
}
