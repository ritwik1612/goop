# GOOP

A personal Fitbit dashboard with a focused, wearable-style interface: sleep, recovery, strain, health trends, activities, a behaviour journal, food and weight logs, and minimal iOS widget layouts.

**Bring your own hosting and Google Cloud project.** This repository contains no hosted instance address, production credentials, personal health records, or account-specific deployment configuration. GOOP is independent of WHOOP, Fitbit and Google.

## What works

- An iPhone-first Home Screen web app with offline app assets.
- Consistent text and numeric typography, short content transitions with stable navigation, custom activity pickers, and an original flowing light-ribbon halo on Healthspan.
- Activities tab with a clear workout launcher, a 3–2–1 countdown, and live zone-level labels. Journal stays a compact Home tile.
- Saved display names personalise the Home heading. Steps open a full page with kilometre and activity details.
- Sleep, recovery, strain, health monitor, stress, and performance-assessment screens, including coloured recovery markers, a blue strain series, sleep-stage stacks, and multicolour heart-rate/stress charts.
- A searchable catalogue generated from Google Health's exercise types. This is a **logging catalogue**, not a promise that Fitbit Air automatically identifies every listed activity.
- Workout timer, pause/resume, session history, strength-set logging, and manual activity logging. Web workout heart rate is explicitly simulated; absent distance, calories and strain are not invented.
- Journal buttons with immediate sliding selection, automatic saving, optional quantities, a completion indicator, day history and customisable behaviours.
- Manual food logging, serving and meal selection, editable entries, and calorie/protein/carbohydrate/fat totals. Missing nutrients remain unknown.
- Manual weight logging in kilograms or pounds, history and trend plotting.
- Server-side Google Health OAuth, encrypted login cookies, read-only measurement sync, source labels, and a separate **My Data** mode that does not mix demonstration readings into actual health records.
- Optional Google food-log reading when Google's nutrition permission is available to the owner’s project.
- Native iOS companion source with home-screen rings, a transparent-style Lock Screen rings widget, a separate Sleep & Recovery widget, a workout widget, and a workout Live Activity/Dynamic Island view.

## Important boundaries

**Demo scores are not your measurements.** WHOOP's Recovery, Strain, Sleep Performance/Need, Stress, physiological age and Pace of Aging are proprietary or model-derived results. GOOP does not reproduce their algorithms. These are labelled illustrative values in Demo mode and remain unavailable in My Data mode. Recorded sleep duration, stages, efficiency and other measurements appear when the source provides them. ECG and Blood Pressure Insights cannot be inferred from missing hardware or API data.

The local guide called GOOP Coach is a transparent on-device feature explainer, **not an AI service or personalised medical coach**. Journal impact percentages are sample UI values, not causal findings about your habits. The menstrual calendar is a demonstration or manual journal; it is not fertility or contraception guidance. Goals and targets shown in Demo mode are examples.

The web app cannot connect to Fitbit Air through Bluetooth on iPhone. The native companion included here does not implement a Fitbit BLE sensor driver either. Workout Live Activity timers continue using the system clock; heart rate is the last reading supplied to the app, and simulated readings stay labelled. Cloud syncing is not a live wrist-sensor stream.

The **iOS companion is source code requiring an Xcode build and device testing**. It has not been compiled or installed in the Windows development environment. A Safari Home Screen app alone cannot install WidgetKit widgets or Live Activities.

## Run locally

Use Node.js 22 or newer; Node.js 24 is recommended for hosting.

```sh
npm ci
npm run dev
```

Open the local address printed by the server. No credentials are needed to explore Demo mode, the journal, local food/weight logs, or widget previews. Use **More → iOS widgets** to inspect the widget layouts. Community and Apple Health import are not part of this app.

```sh
npm run check
npm run build
```

The checks cover workout timing, escaping, Google measurement/nutrition/weight parsing, missing values, source priority, HRV method separation, OAuth state/PKCE, encryption, cookies and cross-origin disconnect rejection. Browser checks additionally exercised journal auto-saving and food/weight persistence. Live Google-account testing still requires your own credentials and consent.

`npm run build` copies only app assets into `public/`. Server code, tests, native source and environment files are not copied into the public site. The function under `api/` stays server-side.

## Live Fitbit Air workouts on iPhone

GOOP includes a direct Web Bluetooth Heart Rate Profile reader (service `0x180D`, characteristic `0x2A37`). This is separate from Google cloud sync. Google documents Fitbit Air [heart-rate sharing](https://support.google.com/googlehealth/answer/14236705?hl=en). A community [GitHub implementation](https://github.com/AyushSagar16/fitbit-air) and [Reddit example](https://www.reddit.com/r/FitbitAir/comments/1ve0b51/the_air_can_broadcast_live_heart_rate_so_i_built/) also describe this approach; they are research references, not bundled dependencies.

1. On iPhone, install [Bluefy](https://apps.apple.com/app/id1492822055), a browser that supplies Web Bluetooth. Safari and its Home Screen PWA cannot access this service. No Mac or developer membership is needed for Bluefy.
2. In Google Health, choose Connections → Fitbit Air → Share heart rate → Get started.
3. Open your own GOOP website in Bluefy. Choose Activities → Connect live heart rate and select your Air.
4. Choose the activity and start the countdown. Real BLE readings supply BPM, a chart, average/max heart rate and observed time in zones. Set your maximum heart rate in Profile; the initial 190 bpm is a sample threshold, not a personalised assessment.
5. For outdoor workouts, tap Enable phone GPS and grant location permission. Distance, speed and average pace use your phone, not the band. GPS fixes remain on this device; export currently includes distance rather than the raw route.

Keep GOOP visible. iOS may suspend Bluetooth/GPS while the browser is backgrounded or the phone is locked. Missing heart-rate intervals are not filled with synthetic values. Pairing and physical-device behaviour have not been verified with an actual Air in this development environment. The parser, GATT notification lifecycle, gap handling, GPS filtering and source provenance have automated checks.

Bluetooth carries heart rate, not sleep, steps, proprietary scores or the Google app's workout controls. Start/stop the GOOP timer separately. My Data without a sensor records a timer only; simulated heart rate is confined to Demo sessions. Calories and Strain are not invented from the sensor feed.

## Personal access and guests

The entry screen supports a personal six-digit PIN or a guest demo. Set GOOP_OWNER_NAME for the greeting, GOOP_OWNER_EMAIL for the only allowed Google account, and GOOP_PIN_HASH to a salted scrypt hash (hexadecimal salt:hash). No plaintext PIN or owner email is bundled in this repository.

Personal access uses a 12-hour HTTP-only cookie. Google login and sync require that cookie and a verified Google email matching GOOP_OWNER_EMAIL. Basic OpenID/email permissions identify the owner alongside the three read-only health scopes. More > Lock personal data clears access.

Guest logs, preferences and snapshots use separate browser storage. The PIN gates the app UI and server access; local browser snapshots are not encrypted at rest. Failed PIN attempts are throttled using an instance-local counter and a signed attempt cookie, rather than a global distributed rate limiter.

## Host your own copy

1. Fork this repository into your own GitHub account.
2. Import your fork into your own hosting account. For Vercel, use the **Other** framework preset. The included `vercel.json` configures the build command and `public` output directory; the root `api` directory supplies the server-side function.
3. Use Node.js 24 for the hosting project.
4. Configure the environment variables below in the hosting dashboard, then rebuild the project.
5. Configure Google OAuth against your own application's origin. Each independent installation needs its own configuration.

There is deliberately no Deploy button linked to an author's instance and no personal deployment URL in this repository.

Workouts recorded in Google Health are imported after syncing. My Data refreshes on reopening and every five minutes while visible. GOOP cannot remotely start or stop the Fitbit/Google Health tracker. Local GOOP timer sessions are not written to Google Health.

## Google Health connection — complete setup

Google Health API is the successor to the retired Fitbit Web API. Start with Google's [setup guide](https://developers.google.com/health/setup), [scope reference](https://developers.google.com/health/scopes) and [verification requirements](https://developers.google.com/health/app-verification).

### 1. Prepare your Google account and device

- Pair and sync Fitbit Air using the Google Health mobile app.
- Sign in to Google Health using the account you intend to authorise in GOOP. The account must already have a Google Health profile; ordinary Google sign-in alone is not sufficient.
- Confirm that the measurements you expect are visible in Google Health. GOOP can only read records Google makes available for that account, device, date and permission.

### 2. Create the Cloud project and OAuth client

1. Create a Google Cloud project and enable **Google Health API**.
2. Configure Google Auth Platform/OAuth consent, using your own app name, support contact and required consent/privacy information.
3. For personal testing, keep the application in Testing and add your own Google account as a test user. Google documents a seven-day lifetime for refresh tokens issued to Testing applications; reconnect when required.
4. Create an OAuth client of type **Web application**.
5. Add the origin you own as an authorised JavaScript origin if Google's console requests it.
6. Add the **exact authorised redirect URI**:

```text
YOUR_APP_ORIGIN/api/google?action=callback
```

For local development, use the loopback origin printed by `npm run dev`, followed by that same callback path and query string. For hosting, replace `YOUR_APP_ORIGIN` with your own HTTPS origin. Do not append a trailing slash or a hash fragment. Use a stable origin rather than a constantly changing preview address.

### 3. Set environment variables

Copy `.env.example` to `.env.local` for local development. Use your hosting provider's secret/environment settings for hosting. Never commit the populated file.

| Variable                   | Purpose                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`               | Your application origin, including `https://`, with no path or trailing slash. Local development defaults to loopback. |
| `GOOGLE_CLIENT_ID`         | Your Web application OAuth client ID.                                                                                  |
| `GOOGLE_CLIENT_SECRET`     | Your OAuth client secret; server-side only.                                                                            |
| `SESSION_SECRET`           | A random secret of at least 32 characters for AES-256-GCM cookie encryption. Use a different value per installation.   |
| `GOOGLE_NUTRITION_ENABLED` | `false` by default. Set `true` only after confirming that optional nutrition read access is available to your project. |

Generate a session secret on your own machine:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Paste that output directly into your local environment file or hosting secret settings. Do not put it in source, issue reports, screenshots or browser JavaScript. Restart the local server or rebuild the hosted app after changing environment variables. Changing `SESSION_SECRET` invalidates existing GOOP login cookies.

### 4. Required read-only permissions

The main connection requests only:

```text
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
```

GOOP never requests your Google password. It redirects you to Google's own OAuth page and uses an authorisation-code flow with a fresh state value and S256 PKCE. Refresh credentials are encrypted in an HTTP-only SameSite cookie; access tokens are not exposed to browser JavaScript. Google identity is checked before the app marks an account connected.

Public availability of restricted scopes may require Google's OAuth verification and applicable security assessment. Each self-hosting owner is responsible for the requirements of their Google project. The code cannot bypass Google's consent, verification or API-access rules.

### 5. Connect and sync in GOOP

1. Open **More → Google Health connection**.
2. Select **Connect Account**, sign in on Google's page and approve the data you want to share.
3. After returning, GOOP downloads the supported recent data and switches to **My Data**. You can also select **Sync Now**.
4. Explore Home, Health Monitor, Sleep, Food, Weight and Activity history. Unsupported or missing readings show `—`.

The web connection reads a recent **35-day window**. It fetches the required pages within explicit limits, and reports inaccessible or truncated collections instead of silently treating them as complete. Reconciled collections are used where appropriate to avoid double-counting overlapping Google data sources. GOOP retains source provenance and does not add a second provider's step count to the same measurement.

This version refreshes on successful connection and on **Sync Now**. It does not guarantee unattended background syncing while the web app is closed. Fitbit-to-Google processing may itself take time. Google's [device compatibility](https://developers.google.com/health/data-types/device-compatibility) determines which measurements a device can supply.

### 6. Food logged in Google Health

GOOP can normalise Google's `nutrition-log` records into the Food page, including food name, meal, serving, calories, protein, carbohydrate and fat when present. [Google's nutrition types](https://developers.google.com/health/data-types) document these records.

**Current API caveat:** Google's guides list `googlehealth.nutrition.readonly`, but the v4 discovery metadata inspected during development did not list that scope among accepted scopes. This is a service capability discrepancy, so food access is optional and separate from the working base permission flow.

If Google confirms nutrition read access for your project:

1. Add the optional read-only nutrition scope to your consent configuration.
2. Set `GOOGLE_NUTRITION_ENABLED=true` and rebuild/restart.
3. In GOOP's connection screen, request **Connect Food Access**. This uses a separate consent attempt and leaves the existing main connection intact if Google rejects the new scope.
4. Sync again. Google food records appear with a Google Health source label; a denied collection is reported as unavailable.

If Google returns `invalid_scope` or refuses access, leave nutrition disabled and use GOOP's manual food log. Do not enable a write-only scope as a substitute for permission to read personal food records. Manual entries in GOOP are saved locally and are **not written back to Google**. No food database, barcode service or AI calorie estimation is included; users enter known values themselves.

### 7. Weight and workouts

Google weight readings are converted from the API's grams to kilograms. GOOP's manual weight entry also accepts pounds, which are converted to kilograms for storage and charting. Source and date remain visible. Manual entries are not pushed to Google.

Synced workout summaries preserve their original type, duration, available heart-rate series, calories and distance. Missing values remain empty. The catalogue comes from Google Health's `ExerciseType` enum. Fitbit Air's [automatic detection guide](https://support.google.com/googlehealth/answer/14236510) describes recognition categories and personalisation; manually logging an activity in GOOP does not reconfigure the band or train Google's detection model.

### 8. Disconnect and local storage

- **Disconnect Google Health** revokes the refresh credential where possible and clears GOOP's login cookie.
- **Remove Local Health Snapshot** deletes the downloaded measurement snapshot from this browser. It does not delete Google's records.
- Journals, local workout logs, food, weight, preferences and optional cycle logs stay in browser storage until removed by the user or browser.
- **Export local data** downloads local logs as JSON. Do not commit that file to a public repository.
- IndexedDB holds the downloaded health snapshot; the offline service worker caches app files, not API responses.

## iOS widgets and Live Activities

The `ios/` directory contains an optional native app shell and WidgetKit extension. It includes:

1. **GOOP Rings:** app-style home-screen rings and system-tinted, transparent-style Lock Screen rings.
2. **Sleep & Recovery:** a separate compact snapshot showing recorded sleep duration and an available recovery score, if a valid scoring source is added. Real-data recovery remains `—` in this version.
3. **GOOP Workout:** a minimal home-screen workout card.
4. **Workout Live Activity:** elapsed timer and last supplied heart rate, including a compact Dynamic Island presentation.

The Lock Screen controls widget tint and appearance; it is not an arbitrary transparent overlay. Widget snapshots update when the native app receives current data, subject to WidgetKit's system scheduling. No widget silently guesses missing scores. A stale or missing heart-rate source is not a live sensor stream. Demo mode and simulated workouts are labelled.

### Build the companion with macOS/Xcode

You do not have to own a Mac to use the web app. Native widgets require an iOS app build, which can be produced on a Mac or a cloud macOS runner. Installing/distributing a signed widget companion through TestFlight requires an Apple Developer membership and your own signing setup. The browser widget page is a preview, not an installed iOS extension. Without signing access, use the web app and leave the optional companion uninstalled.

1. Install Xcode and XcodeGen. Use iOS 17 or newer on your test device.
2. Copy `ios/Config.xcconfig.example` to `ios/Config.xcconfig`. Supply your own bundle identifier, Apple signing team and Google **iOS** OAuth client ID plus its reversed URL scheme.
3. In the same Google Cloud project, enable Google Health API for the iOS client. The native app uses the official Google Sign-In SDK through Swift Package Manager; no client secret belongs in the iOS bundle.
4. Configure the same App Group for the app and widget extension, matching `GOOP_APP_GROUP` in the project. Register/enable that group for both identifiers with your Apple signing account.
5. Run `xcodegen generate` from `ios/`, open the generated project, resolve Swift packages, select your signing team and build to an iPhone.
6. In the native app, enter the HTTPS origin of your **own** GOOP installation. The source contains no author's deployment address.
7. Connect Google Health through the native sign-in flow, or explore Demo mode. The native Google SDK keeps its tokens outside the web page; normalised records are delivered to GOOP's UI and only the small display snapshot is shared with widgets.
8. Add GOOP widgets from the home-screen or Lock Screen widget picker. Start a workout timer from the native app to request the Live Activity. Live Activities must be allowed by iOS.

The companion source and native Google flow still require compilation and on-device validation. Continuous background BLE heart-rate capture, Apple Health integration, ActivityKit push updates and a native sensor service are not implemented. The included native Google sync focuses on the summary collections in `NativeGoogleHealth.swift`; it does not claim the same coverage as the web sync.

## Troubleshooting

| Symptom                               | Check                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup Needed                          | Set all four required environment variables and restart/rebuild.                                                                               |
| `redirect_uri_mismatch`               | The origin, callback path and `?action=callback` query must match Google's authorised redirect exactly.                                        |
| Sign-in works but identity fails      | First create/link the Google Health profile in the Google Health mobile app.                                                                   |
| Main sync returns missing collections | Check device support, granted scopes, account history and Google's processing delay. Partial failures remain visible.                          |
| Reconnect needed after seven days     | The Google consent app may still be in Testing. See Google's token and verification requirements.                                              |
| Food not syncing                      | Check the optional nutrition permission caveat above; the base Fitbit connection does not imply nutrition access.                              |
| Data disappears                       | Browser storage can be cleared or evicted; export local logs before clearing site data. This app does not provide cloud backup for local logs. |
| Widgets are absent in Safari          | Install/build the native companion. Safari cannot provide WidgetKit extensions.                                                                |
| Widget recovery is `—`                | The data connection has no WHOOP Recovery score and GOOP has no validated replacement model.                                                   |
| Web fonts differ from WHOOP           | Licensed Proxima Nova and DINPro assets are not included. See typography below.                                                                |

## Typography, motion and attribution

WHOOP's public design guide specifies Proxima Nova for text and DINPro for numbers. Those commercial assets have not been supplied or redistributed. GOOP consistently uses bundled Nunito Sans and D-DIN fallbacks, with optional local licensed-font detection. Font licences are in `fonts/`; third-party trademarks and font licences are not covered by GOOP's MIT licence.

Motion and illustrations are recreated from visual references, not copied application source. Identical animation timing has not been verified. User screenshots and walkthrough media are not bundled in the repository.

Public references: [WHOOP Home layout](https://www.whoop.com/in/en/thelocker/the-all-new-whoop-home-screen/), [walkthrough](https://www.youtube.com/watch?v=NrCpf_m75XM), [Google Health API](https://developers.google.com/health), [WidgetKit](https://developer.apple.com/documentation/widgetkit), [ActivityKit](https://developer.apple.com/documentation/activitykit).
