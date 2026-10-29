/**
 * F&L Studio — private analytics dashboard.
 *
 * Deployed as a Web App with access "Only myself": Google makes you sign in as the owner,
 * so nobody else can open it. It reads two sheets in the owner's Drive:
 *   "F&L Studio — Analytics" (filled by the collector) and "F&L Studio — Bookings" (the booking script).
 */

var ANALYTICS = 'F&L Studio — Analytics', BOOKINGS = 'F&L Studio — Bookings';
var SITE = 'https://frankiecampbellchicago-debug.github.io/two-desks/';

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
  return JSON.stringify({ views: list, bookings: bookings, now: Date.now(), days: days,
    sheets: { analytics: a ? a.getUrl() : '', bookings: b ? b.getUrl() : '' } });
}

function open(name) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty(name);
  if (id) try { return SpreadsheetApp.openById(id); } catch (e) {}
  var files = DriveApp.getFilesByName(name);
  if (!files.hasNext()) return null;
  var ss = SpreadsheetApp.open(files.next());
  props.setProperty(name, ss.getId());
  return ss;
}

/** Run once from the editor to grant access to the sheets. */
function setup() {
  Logger.log('Analytics sheet: ' + (open(ANALYTICS) ? open(ANALYTICS).getUrl() : 'not created yet (run the collector setup first)'));
  Logger.log('Bookings sheet: ' + (open(BOOKINGS) ? open(BOOKINGS).getUrl() : 'not found'));
}
