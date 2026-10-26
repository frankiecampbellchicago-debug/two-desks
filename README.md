# F&L Studio

Website for Frank and Leila's web design studio. Plain HTML/CSS/JS, no build step:
`index.html` (home), `services.html`, shared `style.css` and `site.js`. Hosted on GitHub Pages.

The name F&L Studio appears in `index.html` in the title, nav logo, about section, and footer.

## Before launch

- **Quote form inbox:** set `INBOX` in the script at the bottom of
  `index.html` to the email address that should receive quote requests. Requests
  go through [FormSubmit](https://formsubmit.co) (free, no account). The first
  request sends an "Activate Form" email to that inbox; click it once and
  requests start arriving. Until `INBOX` is set, the form only shows a preview
  message and sends nothing.
- **Screenshots** in `images/` are of the live sites as of October 2026. Retake
  them if those sites change.

## Languages

English, Spanish, and European Portuguese. English is written in the HTML; the Spanish and Portuguese
text lives in `i18n.js`, keyed by the English sentence. When you change or add English text,
add the same sentence to both lists in `i18n.js`, or it stays in English for everyone.
Link straight to a language with `?lang=es` or `?lang=pt`.
