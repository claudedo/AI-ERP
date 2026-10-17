# Customer journey regression

Run `npm test` for the domain, atomic Smart Entry, migrations, formulas and permission tests. Run `npm run build` for browser and Functions type checks plus production bundling.

The real Chrome test is `scripts/customer-journey-qa.mjs`. It uses the Chrome DevTools Protocol, without an additional browser dependency. It is restricted to the local app on port 5177. **The records and smart scenarios replace fixture data in that browser origin: use an isolated profile, never your daily browser profile.**

On macOS, in separate terminals:

```sh
npm run dev -- --host 127.0.0.1 --port 5177
```

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-first-run --no-default-browser-check \
  --user-data-dir=/private/tmp/nodus-customer-qa-isolated \
  --remote-debugging-port=9227 --window-size=1440,900 \
  http://127.0.0.1:5177/
```

Use a fresh test profile for onboarding; then run these scenarios in order:

```sh
node scripts/customer-journey-qa.mjs onboarding
node scripts/customer-journey-qa.mjs records
node scripts/customer-journey-qa.mjs smart
node scripts/customer-journey-qa.mjs edgecases
```

Results and screenshots are saved under `/private/tmp/nodus-v2-*`. Fixtures are recognizable as QA. The tests observe runtime exceptions and failed requests while each scenario runs. Chrome display-link warnings in headless macOS do not indicate an application exception.

Verified on 17 October 2026: Italian consulting, confirmed fashion and ambiguous-sector onboarding; draft refresh; company validation and customer/supplier views; linked contact/site; Kanban unassigned; dirty-form continue/discard/save; history back/forward and refresh; Viewer UI; company+site+contact Smart Entry; two priced orders; relative date converted to visible absolute date; chat routing; duplicate VAT; missing data; ambiguity selection; double submission; persistence; 390×844 page and dialog width. Backend/LLM live integration and Netlify deployment require separate verification.

Source-of-truth files: `src/services/customerJourney.test.ts`, `src/services/smartEntry.ts`, `src/services/companies.ts`. The schema-4 JSON is backed up before local migration to schema 5; old companies' statuses and raw values are retained as legacy data, and legacy status conditions are remapped.
