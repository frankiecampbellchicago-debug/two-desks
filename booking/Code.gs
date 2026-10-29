/**
 * F&L Studio — call booking.
 *
 * The "Get a quote" form on the website posts here. This script:
 *   1. logs the request in the "F&L Studio — Bookings" Google Sheet,
 *   2. emails the visitor: "we've got your request, it's being reviewed",
 *   3. emails us the request with Approve / Decline buttons,
 *   4. on Approve: adds the call to our Google Calendar (with a Meet link and
 *      the visitor as a guest), emails the visitor "confirmed", emails us a receipt,
 *   5. on Decline: emails the visitor, inviting them to pick another time,
 *   6. every morning at REMINDER_HOUR: emails us the list of today's calls.
 *
 * Deployed as a Web App (execute as: me, access: anyone). Run setup() once.
 */

// ---- settings ---------------------------------------------------------------
var TZ = 'America/Chicago';          // our time zone: emails to us and the calendar use it
var CALENDAR_ID = 'primary';          // the calendar calls go into ('primary' = your main one)
var EXTRA_NOTIFY = '';                // more inboxes for our emails, comma separated (e.g. Leila)
var CALL_MINUTES = 30;                // how long a call is
var REMINDER_HOUR = 7;                // morning email with the day's calls (in TZ)
var OPEN_DAYS = [1, 2, 3, 4, 5];       // days calls can be booked, 1 = Monday ... 7 = Sunday (in TZ)
var FIRST_CALL = '08:00', LAST_CALL = '17:30';   // earliest and latest start time (in TZ); keep in sync with HOURS in index.html
var SITE = 'https://frankiecampbellchicago-debug.github.io/two-desks/';
var WEBAPP_URL = '';                  // the /exec URL; left blank, the script works it out

// ---- the form posts here ----------------------------------------------------
function doPost(e) {
  try {
    var d = (e && e.parameter) || {};
    if (d._honey) return json({ ok: true });                 // bots fill the hidden field

    var name = clip(d.name, 120), email = clip(d.email, 200).toLowerCase();
    var start = new Date(d.start);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'missing fields' });
    var now = Date.now();
    if (isNaN(start) || start.getTime() < now + 60 * 60 * 1000 || start.getTime() > now + 180 * 864e5)
      return json({ ok: false, error: 'bad time' });
    if (!isOpen(start)) return json({ ok: false, error: 'outside hours' });

    // at most 3 requests per email address per day
    var props = PropertiesService.getScriptProperties(), key = 'n_' + email.replace(/[^a-z0-9]/g, '');
    var seen = JSON.parse(props.getProperty(key) || '[]').filter(function (t) { return now - t < 864e5; });
    if (seen.length >= 3) return json({ ok: true, limited: true });
    seen.push(now); props.setProperty(key, JSON.stringify(seen));

    var b = {
      id: 'B' + Utilities.getUuid().slice(0, 7).toUpperCase(), key: Utilities.getUuid(),
      name: name, email: email, business: clip(d.business, 160), country: clip(d.country, 80),
      website: clip(d.website, 300), details: clip(d.details, 4000), services: clip(d.services, 300),
      budget: clip(d.budget, 120), lang: /^(es|pt|sv)/.test(d.lang) ? d.lang.slice(0, 2) : 'en',
      tz: validTz(d.tz) || TZ, start: start
    };

    var sh = sheet();
    sh.appendRow([new Date(), b.id, 'Pending', when(start, TZ, 'en'), when(start, b.tz, 'en') + ' (' + b.tz + ')',
      b.name, b.business, b.email, b.country, b.website, b.services, b.budget, b.details, b.lang, b.tz,
      start.getTime(), '', '', b.key]);

    tellVisitor('received', b);
    tellUsNew(b);
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

// ---- the Approve / Decline links from our email open this page --------------
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.id) return json({ ok: true, status: 'F&L Studio booking is live' });
  var r = find(p.id);
  if (!r || r.b.key !== p.k) return page('Not found', '<p>This link doesn\'t match a booking.</p>');
  var b = r.b, approve = p.a === 'approve';
  var info = '<table>' + rowsFor(b).map(function (x) {
    return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]).replace(/\n/g, '<br>') + '</td></tr>';
  }).join('') + '</table>';
  if (b.status !== 'Pending')
    return page('Already ' + b.status.toLowerCase(), '<p>This request was already <b>' + esc(b.status.toLowerCase()) + '</b>.</p>' + info);

  var form = approve
    ? '<button id="go" class="yes">Approve and add to calendar</button>'
    : '<label>Note to ' + esc(b.name) + ' (optional, goes in the email)<textarea id="note" maxlength="600" placeholder="e.g. We\'re away that week. Could you pick a day next week?"></textarea></label>' +
      '<button id="go" class="no">Decline and email them</button>';
  var js = '<script>document.getElementById("go").onclick=function(){var b=this;b.disabled=true;b.textContent="Working…";' +
    'var n=document.getElementById("note");google.script.run.withSuccessHandler(function(m){document.getElementById("box").innerHTML=m})' +
    '.withFailureHandler(function(e){b.disabled=false;b.textContent="Try again";alert(e.message)})' +
    '.act(' + JSON.stringify(b.id) + ',' + JSON.stringify(p.k) + ',' + JSON.stringify(approve ? 'approve' : 'decline') + ',n?n.value:"")}</script>';
  return page(approve ? 'Approve this call?' : 'Decline this call?', info + '<div id="box">' + form + '</div>' + js);
}

/** Called from the approve/decline page. Returns the HTML to show when done. */
function act(id, k, action, note) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r = find(id);
    if (!r || r.b.key !== k) throw new Error('This link doesn\'t match a booking.');
    var b = r.b, sh = sheet();
    if (b.status !== 'Pending') return '<p>Already <b>' + esc(b.status.toLowerCase()) + '</b>.</p>';

    if (action === 'decline') {
      b.note = clip(note, 600);
      sh.getRange(r.row, 3).setValue('Declined');
      tellVisitor('declined', b);
      return '<p class="ok">Declined. ' + esc(b.name) + ' has been emailed' + (b.note ? ' with your note' : '') + '.</p>';
    }

    if (b.start.getTime() < Date.now()) throw new Error('That time has already passed. Decline it instead.');
    var end = new Date(b.start.getTime() + CALL_MINUTES * 60000);
    var ev = Calendar.Events.insert({
      summary: 'F&L call: ' + b.name + (b.business ? ' (' + b.business + ')' : ''),
      description: rowsFor(b).map(function (x) { return x[0] + ': ' + x[1]; }).join('\n') + '\n\nBooked through the F&L Studio website.',
      start: { dateTime: b.start.toISOString(), timeZone: TZ },
      end: { dateTime: end.toISOString(), timeZone: TZ },
      attendees: [{ email: b.email, displayName: b.name }],
      conferenceData: { createRequest: { requestId: b.id + '-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'popup', minutes: 5 }] }
    }, CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: 'all' });

    b.meet = ev.hangoutLink || '';
    sh.getRange(r.row, 3).setValue('Approved');
    sh.getRange(r.row, 17, 1, 2).setValues([[ev.htmlLink || '', b.meet]]);
    tellVisitor('accepted', b);
    tellUs('Confirmed: ' + b.name + ', ' + when(b.start, TZ, 'en'),
      '<p>Your call is in the calendar. ' + esc(b.name) + ' got the confirmation email and a calendar invite.</p>' +
      table(rowsFor(b)) + (ev.htmlLink ? btn(ev.htmlLink, 'Open in Google Calendar', GOLD) : ''));
    return '<p class="ok">Approved. It\'s in your calendar, and ' + esc(b.name) + ' has been emailed.</p>' +
      (ev.htmlLink ? '<p><a href="' + esc(ev.htmlLink) + '" target="_blank">Open in Google Calendar</a></p>' : '');
  } finally {
    lock.releaseLock();
  }
}

// ---- morning email: today's calls ------------------------------------------
function dailyDigest() {
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var calls = all().filter(function (b) {
    return b.status === 'Approved' && Utilities.formatDate(b.start, TZ, 'yyyy-MM-dd') === today;
  }).sort(function (x, y) { return x.start - y.start; });
  if (!calls.length) return;
  var list = calls.map(function (b) {
    return '<div style="border-top:1px solid #e1d6c4;padding:14px 0">' +
      '<div style="font-size:20px;color:#1d1428"><b>' + Utilities.formatDate(b.start, TZ, 'h:mm a') + '</b> &nbsp;' + esc(b.name) +
      (b.business ? ' · ' + esc(b.business) : '') + '</div>' +
      '<div style="color:#625a6c;margin-top:4px">' + esc(b.services || '') + (b.country ? ' · ' + esc(b.country) : '') + '</div>' +
      '<div style="margin-top:4px">' + esc(b.email) + (b.meet ? ' · <a href="' + esc(b.meet) + '">Join Meet</a>' : '') + '</div></div>';
  }).join('');
  tellUs('Today: ' + calls.length + ' call' + (calls.length > 1 ? 's' : '') + ', first at ' + Utilities.formatDate(calls[0].start, TZ, 'h:mm a'),
    '<p>Here\'s who you\'re talking to today (' + esc(TZ.replace('_', ' ')) + ' time).</p>' + list);
}

// ---- run once from the editor: creates the sheet, the morning trigger, and asks for permissions
function setup() {
  var ss = sheet().getParent();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(REMINDER_HOUR).inTimezone(TZ).create();
  CalendarApp.getDefaultCalendar();
  Logger.log('Bookings sheet: ' + ss.getUrl());
  Logger.log('Emails go to: ' + us());
  Logger.log('Mail quota left today: ' + MailApp.getRemainingDailyQuota());
}

// ---- emails -----------------------------------------------------------------
var GOLD = '#cfae72', NIGHT = '#160f20';

function tellUsNew(b) {
  var base = webAppUrl() + '?id=' + b.id + '&k=' + b.key + '&a=';
  var clash = conflicts(b.start);
  var warn = clash.length
    ? '<p style="background:#fff3cd;border:1px solid #e6c463;padding:10px 14px">Heads up: you already have <b>' +
      clash.map(esc).join('</b>, <b>') + '</b> at this time.</p>' : '';
  tellUs('New call request: ' + (b.business || b.name) + ', ' + when(b.start, TZ, 'en'),
    '<p style="font-size:18px;margin:0 0 6px"><b>' + esc(b.name) + '</b>' + (b.business ? ' from <b>' + esc(b.business) + '</b>' : '') +
    ' wants a call.</p><p style="margin:0 0 16px;color:#625a6c">' + esc(when(b.start, TZ, 'en')) + ' your time · ' +
    esc(when(b.start, b.tz, 'en')) + ' their time (' + esc(b.tz) + ')</p>' + warn + table(rowsFor(b)) +
    '<p style="margin-top:22px">' + btn(base + 'approve', 'Approve', GOLD) + ' &nbsp; ' + btn(base + 'decline', 'Decline', '#e9e2d6') + '</p>' +
    '<p style="color:#625a6c;font-size:13px">Reply to this email to write to ' + esc(b.name) + ' directly.</p>',
    b.email);
}

function tellUs(subject, inner, replyTo) {
  MailApp.sendEmail({ to: us(), subject: subject, htmlBody: wrap(inner), name: 'F&L Studio bookings', replyTo: replyTo || us() });
}

function tellVisitor(kind, b) {
  var L = TEXT[b.lang] || TEXT.en, w = when(b.start, b.tz, b.lang);
  var v = { name: b.name, when: w, tz: b.tz.split('/').pop().replace(/_/g, ' '), meet: b.meet || L.noMeet, site: SITE + '#quote',
    note: b.note ? '\n\n' + L.note + b.note : '' };
  var subject = fill(L[kind + 'Subj'], v), body = fill(L[kind], v);
  var html = esc(body).replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  MailApp.sendEmail({ to: b.email, subject: subject, body: body, htmlBody: wrap('<p>' + html + '</p>'), name: 'F&L Studio', replyTo: us() });
}

var TEXT = {
  en: {
    receivedSubj: 'We\'ve got your request',
    received: 'Hi {name},\n\nThanks for getting in touch with F&L Studio. We\'ve received your request for a call on {when} ({tz} time).\n\nYour booking is being reviewed. We\'ll email you again as soon as it\'s confirmed.\n\nFrank & Leila\nF&L Studio',
    acceptedSubj: 'Your call is confirmed: {when}',
    accepted: 'Hi {name},\n\nGood news: your call with F&L Studio is confirmed.\n\nWhen: {when} ({tz} time)\nVideo call: {meet}\n\nWe\'ve also sent you a calendar invite. If you need to change the time, just reply to this email.\n\nTalk soon,\nFrank & Leila\nF&L Studio',
    declinedSubj: 'About your call request',
    declined: 'Hi {name},\n\nThanks for your request. Unfortunately the time you picked ({when}, {tz} time) doesn\'t work for us.{note}\n\nYou\'re welcome to pick another time here: {site}\nOr just reply to this email and we\'ll find a time that works.\n\nFrank & Leila\nF&L Studio',
    note: 'A note from us: ', noMeet: 'we\'ll send you the link before the call'
  },
  es: {
    receivedSubj: 'Hemos recibido tu solicitud',
    received: 'Hola, {name}:\n\nGracias por contactar con F&L Studio. Hemos recibido tu solicitud de llamada para el {when} (hora de {tz}).\n\nTu reserva está en revisión. Te escribiremos de nuevo en cuanto esté confirmada.\n\nFrank y Leila\nF&L Studio',
    acceptedSubj: 'Tu llamada está confirmada: {when}',
    accepted: 'Hola, {name}:\n\nBuenas noticias: tu llamada con F&L Studio está confirmada.\n\nCuándo: {when} (hora de {tz})\nVideollamada: {meet}\n\nTambién te hemos enviado una invitación de calendario. Si necesitas cambiar la hora, responde a este correo.\n\nHasta pronto,\nFrank y Leila\nF&L Studio',
    declinedSubj: 'Sobre tu solicitud de llamada',
    declined: 'Hola, {name}:\n\nGracias por tu solicitud. Lamentablemente, la hora que elegiste ({when}, hora de {tz}) no nos va bien.{note}\n\nPuedes elegir otra hora aquí: {site}\nO responde a este correo y buscamos un momento que te venga bien.\n\nFrank y Leila\nF&L Studio',
    note: 'Una nota nuestra: ', noMeet: 'te enviaremos el enlace antes de la llamada'
  },
  pt: {
    receivedSubj: 'Recebemos o seu pedido',
    received: 'Olá, {name},\n\nObrigado por contactar a F&L Studio. Recebemos o seu pedido de chamada para {when} (hora de {tz}).\n\nA sua marcação está a ser analisada. Voltamos a escrever-lhe assim que estiver confirmada.\n\nFrank e Leila\nF&L Studio',
    acceptedSubj: 'A sua chamada está confirmada: {when}',
    accepted: 'Olá, {name},\n\nBoas notícias: a sua chamada com a F&L Studio está confirmada.\n\nQuando: {when} (hora de {tz})\nVideochamada: {meet}\n\nTambém lhe enviámos um convite de calendário. Se precisar de mudar a hora, basta responder a este e-mail.\n\nAté breve,\nFrank e Leila\nF&L Studio',
    declinedSubj: 'Sobre o seu pedido de chamada',
    declined: 'Olá, {name},\n\nObrigado pelo seu pedido. Infelizmente, a hora que escolheu ({when}, hora de {tz}) não nos é possível.{note}\n\nPode escolher outra hora aqui: {site}\nOu responda a este e-mail e encontramos um horário que lhe dê jeito.\n\nFrank e Leila\nF&L Studio',
    note: 'Uma nota nossa: ', noMeet: 'enviamos-lhe o link antes da chamada'
  },
  sv: {
    receivedSubj: 'Vi har fått din förfrågan',
    received: 'Hej {name},\n\nTack för att du hörde av dig till F&L Studio. Vi har tagit emot din förfrågan om ett samtal {when} ({tz}-tid).\n\nDin bokning granskas nu. Vi mejlar dig igen så snart den är bekräftad.\n\nFrank och Leila\nF&L Studio',
    acceptedSubj: 'Ditt samtal är bekräftat: {when}',
    accepted: 'Hej {name},\n\nGoda nyheter: ditt samtal med F&L Studio är bekräftat.\n\nNär: {when} ({tz}-tid)\nVideosamtal: {meet}\n\nVi har också skickat en kalenderinbjudan. Om du behöver byta tid, svara bara på det här mejlet.\n\nHörs snart,\nFrank och Leila\nF&L Studio',
    declinedSubj: 'Angående din samtalsförfrågan',
    declined: 'Hej {name},\n\nTack för din förfrågan. Tyvärr passar inte tiden du valde ({when}, {tz}-tid) för oss.{note}\n\nDu får gärna välja en annan tid här: {site}\nEller svara på det här mejlet så hittar vi en tid som passar.\n\nFrank och Leila\nF&L Studio',
    note: 'En kommentar från oss: ', noMeet: 'vi skickar länken före samtalet'
  }
};

var DAYS = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
  pt: ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'],
  sv: ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']
};
var MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  sv: ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
};

/** "Tuesday, November 3, 2026 at 2:00 PM" in the given time zone and language. */
function when(date, tz, lang) {
  var p = Utilities.formatDate(date, tz, 'u|d|M|yyyy|HH:mm|h:mm a').split('|');
  var day = DAYS[lang][p[0] - 1], d = p[1], mon = MONTHS[lang][p[2] - 1], y = p[3];
  if (lang === 'es') return day + ' ' + d + ' de ' + mon + ' de ' + y + ', a las ' + p[4];
  if (lang === 'pt') return day + ', ' + d + ' de ' + mon + ' de ' + y + ', às ' + p[4];
  if (lang === 'sv') return day + ' ' + d + ' ' + mon + ' ' + y + ' kl. ' + p[4];
  return day + ', ' + mon + ' ' + d + ', ' + y + ' at ' + p[5];
}

function rowsFor(b) {
  return [['Name', b.name], ['Business', b.business], ['Email', b.email], ['Country', b.country],
    ['Call time', when(b.start, TZ, 'en') + ' (' + TZ + ')'], ['Their time', when(b.start, b.tz, 'en') + ' (' + b.tz + ')'],
    ['Wants help with', b.services], ['Budget', b.budget], ['Current website', b.website], ['What they need', b.details]]
    .filter(function (x) { return x[1]; });
}

function wrap(inner) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d1428;max-width:640px">' +
    '<div style="background:' + NIGHT + ';color:' + GOLD + ';padding:14px 20px;font-size:13px;letter-spacing:3px">F&amp;L STUDIO</div>' +
    '<div style="padding:22px 20px;background:#fffdf8;border:1px solid #e1d6c4;border-top:0">' + inner + '</div></div>';
}
function table(rows) {
  return '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">' + rows.map(function (r) {
    return '<tr><td style="background:#f7f2ea;border:1px solid #e1d6c4;font-weight:bold;white-space:nowrap;vertical-align:top">' + esc(r[0]) +
      '</td><td style="border:1px solid #e1d6c4">' + esc(r[1]).replace(/\n/g, '<br>') + '</td></tr>';
  }).join('') + '</table>';
}
function btn(href, label, bg) {
  return '<a href="' + esc(href) + '" style="display:inline-block;background:' + bg + ';color:' + NIGHT +
    ';padding:12px 26px;text-decoration:none;font-weight:bold;letter-spacing:1px">' + esc(label) + '</a>';
}
function page(title, inner) {
  return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    'body{font:16px/1.55 Arial,Helvetica,sans-serif;background:#f7f2ea;color:#1d1428;margin:0;padding:24px 16px}' +
    'main{max-width:640px;margin:auto;background:#fffdf8;border:1px solid #e1d6c4;padding:24px}' +
    'header{background:#160f20;color:#cfae72;letter-spacing:3px;font-size:13px;padding:14px 24px;max-width:640px;margin:auto;box-sizing:border-box}' +
    'h1{font-size:24px;margin:0 0 16px}table{border-collapse:collapse;width:100%;margin-bottom:20px}' +
    'th,td{border:1px solid #e1d6c4;padding:8px;text-align:left;vertical-align:top}th{background:#f7f2ea;white-space:nowrap}' +
    'button{font:bold 15px Arial;padding:14px 26px;border:0;cursor:pointer}.yes{background:#cfae72}.no{background:#1d1428;color:#fff}' +
    'textarea{display:block;width:100%;box-sizing:border-box;min-height:90px;margin:6px 0 14px;font:15px Arial;padding:8px}' +
    '.ok{font-size:18px;background:#eef6ea;border:1px solid #b9d8aa;padding:12px 14px}</style>' +
    '<header>F&amp;L STUDIO</header><main><h1>' + esc(title) + '</h1>' + inner + '</main>')
    .setTitle('F&L Studio · ' + title);
}

// ---- the bookings sheet ------------------------------------------------------
var HEAD = ['Received', 'ID', 'Status', 'Call time (ours)', 'Their time', 'Name', 'Business', 'Email', 'Country', 'Website',
  'Services', 'Budget', 'Details', 'Language', 'Their time zone', 'Start (ms)', 'Calendar event', 'Meet link', 'Key'];

function sheet() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID'), ss = null;
  if (id) try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  if (!ss) {
    ss = SpreadsheetApp.create('F&L Studio — Bookings');
    props.setProperty('SHEET_ID', ss.getId());
    var sh = ss.getSheets()[0];
    sh.setName('Bookings').appendRow(HEAD);
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold').setBackground(NIGHT).setFontColor(GOLD);
    sh.setFrozenRows(1);
    sh.hideColumns(HEAD.length);                      // the secret key behind the approve links
  }
  return ss.getSheets()[0];
}
function all() {
  var v = sheet().getDataRange().getValues();
  return v.slice(1).map(function (r, i) { return toBooking(r, i + 2); });
}
function find(id) {
  var v = sheet().getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][1]) === String(id)) return { row: i + 1, b: toBooking(v[i]) };
  return null;
}
function toBooking(r) {
  return { id: String(r[1]), status: r[2], name: r[5], business: r[6], email: r[7], country: r[8], website: r[9],
    services: r[10], budget: r[11], details: r[12], lang: r[13] || 'en', tz: r[14] || TZ, start: new Date(Number(r[15])),
    meet: r[17], key: r[18] };
}

// ---- helpers -------------------------------------------------------------------
function us() { return [Session.getEffectiveUser().getEmail()].concat(EXTRA_NOTIFY ? EXTRA_NOTIFY.split(',') : []).join(','); }
function webAppUrl() { return WEBAPP_URL || ScriptApp.getService().getUrl(); }
function conflicts(start) {
  var cal = CALENDAR_ID === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CALENDAR_ID);
  return cal.getEvents(start, new Date(start.getTime() + CALL_MINUTES * 60000)).map(function (e) { return e.getTitle() || 'an event'; });
}
function isOpen(date) {
  var p = Utilities.formatDate(date, TZ, 'u|HH:mm').split('|');
  return OPEN_DAYS.indexOf(Number(p[0])) > -1 && p[1] >= FIRST_CALL && p[1] <= LAST_CALL;
}
function validTz(tz) {
  try { Utilities.formatDate(new Date(), String(tz), 'z'); return /^[A-Za-z_]+\/[A-Za-z_\/+-]+$|^UTC$/.test(tz) ? String(tz) : ''; }
  catch (e) { return ''; }
}
function fill(s, v) { return s.replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? '' : v[k]; }); }
function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
