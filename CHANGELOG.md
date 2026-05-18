# WISE — Changelog

## v4.2 — 2026-05-18

### What changed
- **Two-pass analysis for photo + description** — When a user provides both a photo and a description, wise-analyse now makes two separate API calls instead of one. Pass 1 runs the description as a pure text analysis — every mentioned food and drink is extracted with authoritative weights (or standard estimates if no weight given). Pass 2 analyses the photo only to (a) confirm which described items are visible, and (b) spot any additional ingredients the user didn't mention. Results are merged: described items tagged `source:'described'` with `visibleInPhoto` set from pass 2, visual extras tagged `source:'visual'`. This eliminates the previous failure mode where unweighted items (e.g. "coconut flat white") were silently dropped because the photo model treated them as context/titles rather than ingredients.
- **Friendly 529 error message** — All three AI endpoints (analyse, fuel, shopping list) now show "WISE is very popular right now — the AI is temporarily busy. Give it a moment and try again." instead of raw "Anthropic API error: 529".
- **Home screen micro badge threshold raised 40%→60%** — Micronutrients card on home screen now appears when any nutrient is below 60% of RDA (previously 40%), matching the "LOW" threshold used in the gaps screen.
- **"What you should eat" subtitle removed** — The auto-generated "protein & carb & fibre gaps" subtitle under the home screen card was removed. The gap count badge on the right already conveys the same information more cleanly.
- **Two-tier ingredient breakdown** — Ingredient list now splits into described items (green "confirmed in photo" / blue "not in photo — you said so" badges) and a collapsed "WISE also spotted" section for visual-only additions. Spotted items can be dismissed with ✕ which removes them and updates saved totals. Yellow banner appears when spotted items are present.

## v4.0 — 2026-05-14

### What changed
- **Weekly shopping list feature** — New "Shopping List" screen (accessible from gaps screen when ≥5 meals logged). Aggregates ingredient frequency over last 14 days, computes weekly micronutrient deficit averages, and calls new `wise-shop` edge function. Returns 4 sections: **Staples** (buy-every-week items based on logged frequency), **Fix** (targeted at worst nutrient gaps), **Discover** (diversify existing staples — different food, same category), **Seasonal** (in-season produce for current location + date). Each item shows name, quantity, and a one-line reason. Includes copy-all button and loading/error states.
- **Location field in profile** — Added text input for city/region to profile screen. Saved to Supabase `profiles` table (`location` column). Passed to wise-shop for regional seasonality. Loaded at boot alongside other profile fields.
- **`wise-shop` edge function** — New Supabase Edge Function proxying to claude-haiku-4-5-20251001. Takes: ingredient frequency list (name, totalG, count), weekly deficit list (name, pct), goal, location, dateToday. Returns structured 4-section JSON. Deployed at `wise-shop`.
- **Fat breakdown — multiple subtypes expandable simultaneously** — `gapsExpandedFatSubtype` changed from single string to array. New `toggleFatSubtype()` helper. Previously tapping a second fat subtype would close the first; now all three (sat/mono/poly) can be open at once.
- **Fat breakdown — ingredient contributor key fix** — `fatSubtypeRow()` now maps state keys (`sat`/`mono`/`poly`) to `per100` keys (`sat_fat`/`mono_fat`/`poly_fat`) via a lookup object. Previously the mismatch caused "No meal data logged yet" on fat bar expand despite meals being present.
- **Meal name extraction improved** — `extractShortMealName()` regex now stops at "consisting", "made with/from/of", preventing long parenthetical phrases from leaking into card titles. Produces cleaner 3–5 word dish names.
- **Snack option added** — "snack" added as a loggable meal slot alongside breakfast/lunch/dinner. Appears as placeholder and in slot selectors.
- **Date headers — tappable for past day gaps** — Date group headers in meal history are split: the label (YESTERDAY / date) taps to open the gaps screen scoped to that day; the chevron still collapses/expands the meal list. "View stats →" pill shown next to the label. `state.gapsDate` (null = today, YYYY-MM-DD = past day) drives `renderGaps()` filtering. Past day gaps screen shows "Day total", correct date, hides "Plan my day" button, hides L2 micronutrient weekly pattern card, shows "← Today" return pill.
- **"Meals that day" label fix** — Past day gaps screen title changed from "Today's meals" → "Meals that day" to be contextually accurate.
- **Plan my day hidden on past days** — "Plan my day" / fuel button suppressed when viewing a past day's gaps (no point planning a day that's already happened).

## v3.9 — 2026-05-14

### What changed
- **Gaps screen — micronutrients moved above "What you should eat"** — Reordered cards so macros → micronutrients → gap recommendations. Micronutrient data is more actionable alongside the macro picture; gap recommendations are now the final summary.
- **Micronutrient rows — tap to expand ingredient contributors** — Each nutrient row in the gaps screen is now tappable. Expands to show top ingredient sources for that nutrient today, with per-ingredient values, % of total, and mini bars. Mirrors the existing macro bar expand pattern. State tracked via `gapsExpandedMicro`.
- **Past day gap analysis** — Tapping a date header (YESTERDAY, TUESDAY 12 MAY etc) in meal history now opens the gaps screen scoped to that date. Shows "Day total" instead of "Today so far", correct date label, and a "← Today" pill to return. Chevron on the same header still collapses/expands the meal list. `state.gapsDate` drives the filter; null = today.
- **Retry save button on results screen** — When a meal fails to save (e.g. mobile network blip), the error banner now shows a red "↺ Retry save" button that re-attempts the Supabase insert without re-analysing.
- **Edits now persist to Supabase** — Ingredient edits on the results screen (name, grams, delete, "Something's off" correction form) previously updated the UI only. Now fires a Supabase UPDATE on the stored record after every change, so home screen and gaps screen immediately reflect corrections. Works for both freshly analysed meals (`state.currentLogId`) and historical meals (`state.viewingLog.id`). Required adding UPDATE policy + GRANT in Supabase.

## v3.8 — 2026-05-13

### What changed
- **Removed "Today's Gap Analysis" box from results screen** — The per-meal gap analysis card (showing HIGH/MEDIUM/LOW protein, carb, fibre, fat gaps "based on this meal only") has been removed. The home dashboard and gaps screen both show the full day picture — this single-meal gap card was redundant and slightly misleading since it compared one meal against full daily targets.
- **Edge function — user-stated weights now authoritative** — Rewrote `userNoteClause` in `wise-analyse-edge-function.ts`. Previously the user note was treated as an ambiguity hint only, causing the model to override stated weights with its own visual estimates. The new instruction makes stated weights ground truth: if the user says "250g beef mince", `estimatedG` must be exactly 250g. Inferred ingredients not mentioned by the user (e.g. cooking oil in fried rice) are still permitted — this preserves the good inference behaviour while deferring to the user on everything they explicitly stated. Requires Supabase redeploy of wise-analyse.

## v3.2 — 2026-05-13

### What changed
- **Today's meals — "+ Log meal" button** — Added a small black pill button in the header of the Today's meals card that opens the analyse screen directly. Same action as the tab bar Log button but one less tap when you're already looking at the meal list.
- **Meal history — slot label on each card** — Past meal cards in `renderRecentMeals` now show the slot (e.g. `🌅 breakfast`) as a small tag before the time and kcal. Slots are read from `log.context?.slot`; cards without a slot show no tag.
- **Removed stale micronutrient nudge box from results screen** — The "You are missing key nutrients / Full micronutrient breakdown coming soon" block has been removed. It was showing a generic hardcoded nutrient list with no real data and claiming a feature "coming soon" that shipped in v2.7.
- **Fat breakdown — saturated fat context** — The FAT BREAKDOWN card on the results screen now shows saturated fat with a limit bar (≤10% of daily calories = the standard dietary cap), a % of limit used, and colour coding (green/amber/red). Mono and poly show "↑ aim higher" context labels so users know the direction.
- **Per-meal micronutrient breakdown on results screen** — New MICRONUTRIENTS — THIS MEAL section added between the fat breakdown and gap analysis. Shows all 7 tracked nutrients (Vitamin D, Iron, Zinc, Magnesium, B12, Calcium, Potassium) with actual values from the analysis, % of daily RDA, colour-coded progress bars, and a note pointing to the gaps screen for the full day picture. Only renders when at least one micronutrient value is non-zero.

## v3.1 — 2026-05-13

### What changed
- **Bug fix — delete buttons missing on today's meals** — Today's meal rows in the dashboard were a plain `<button>` with no × delete button. Wrapped in a flex div with a separate `deleteMealLog` × button, matching the pattern used in `renderRecentMeals()` for past days.
- **Bug fix — no path to log a meal to an incomplete past day** — The INCOMPLETE badge on past date headers was inside the expand/collapse toggle with no action. Added a black `+ Log meal` pill button next to the badge that opens the analyse screen with `mealDate` pre-filled to that past date — so tapping it immediately puts you in the log flow for the right day.

## v3.0 — 2026-05-13

### What changed
- **Edge function — ambiguity rule overhaul** — Rewrote the `AMBIGUITY RULE` section of `wise-analyse-edge-function.ts` to decisively fix the over-flagging bug. The new rule introduces a binary test: "Can you name what this dish is?" — if yes, analyse it; if no (uniform liquid/paste), flag ambiguous. Added a CRITICAL DISTINCTION block that explicitly contrasts correct vs wrong model behaviour (e.g. "I'm unsure of the gram amounts" → Low confidence, NOT ambiguous). Expanded the never-flag list with explicit food names: fried rice, biryani, grain bowls, dal, curry with visible pieces, soup with floating ingredients, sandwiches with visible filling.
- **Edge function — text description hard override** — For text analyses (type !== 'photo'), an ABSOLUTE RULE instruction is injected immediately before "Food to analyse:" — the model is told in explicit terms that text input is never ambiguous, and that setting `ambiguous: true` for a text description is always wrong. This fixes the specific bug where a described smoothie (e.g. "banana, oat milk, protein powder") was being flagged ambiguous and returning zero nutrition because the model's training instincts about smoothies overrode the general rule. Requires manual Supabase redeploy.

## v2.9 — 2026-05-13

### What changed
- **Home screen — adaptive today dashboard** — Replaced static targets card with a live daily dashboard. Header shows "WISE" large + `weight · goal · date` inline right. Today's progress card: % completion badge (grey/amber/green by % of calorie target), full-width calories bar (black), 2×2 macro grid (PROTEIN/FAT/CARBS/FIBRE) with progress bars; over-target macros turn red with `!`. "What you should eat" gap summary card (amber badge with gap count, or green tick when on track) taps to gaps detail screen; hidden when no meals logged today. Micronutrients card with red "N low" badge taps to gaps screen; hidden when no meals logged today or no nutrients are under 40% RDA. Today's meals list sorted by time with slot emoji icons; unlogged Lunch/Dinner placeholders appear after time threshold.
- **Backdate a meal** — "When?" date row on the analyse screen (native date picker, last 7 days max). Defaults to today; a purple indicator shows the chosen date when backdating. `state.mealDate` (YYYY-MM-DD) drives `logged_at` on save — backdated meals are stored at noon on the chosen day. Resets to today each time the analyse screen opens.
- **Incomplete day indicator** — Past days in the recent meals grouped list show an orange `INCOMPLETE` badge when total calories logged are under 70% of the daily calorie target. Today is never flagged. Pairs naturally with backdating: user spots the badge, taps the Log tab, picks the past date, and adds the missing meal.
- **Home screen fixes** — Redundant "Analyse a meal" black card removed (Log tab handles this now). 0-ingredient guard: if `identified[]` is empty and `ambiguous` is false the app auto-sets `ambiguous: true` with a helpful reason and routes to the ambiguous handoff screen, preventing all-zero results ever reaching the user.

## v2.8 — 2026-05-13

### What changed
- **Bottom tab bar navigation** — persistent 3-tab bar fixed to the bottom of the viewport on home, gaps, and profile screens. Tabs: Today (home) | Log (elevated circular camera button) | Profile. Log button is a raised black circle with drop shadow that directly triggers the analyse flow. Tab bar is hidden on all analyse, results, ambiguous result, fuel, and fuel results screens. `.nav-spacer` div prevents page content hiding behind the bar. Safe-area inset support for notched devices via `env(safe-area-inset-bottom)`.

## v2.7 — 2026-05-12

### What changed
- **Fat bar hierarchy in Check my gaps** — clicking FAT now expands to Saturated / Monounsaturated / Polyunsaturated sub-rows, each showing its proportion of total fat. Tapping a sub-row shows the top ingredient contributors for that fat type. `gapsExpandedFatSubtype` state tracks the second level. New `fatSubtypeRow()` helper. Fat bar no longer shows ingredient contributors at top level — subtypes come first.
- **Home screen restructure — Plan my fuel demoted** — "Plan my fuel" card removed from the home screen. Two primary cards remain: Analyse a meal and Check my gaps. Plan my fuel accessible via new "⚡ Plan the rest of my day →" secondary button at the bottom of Check my gaps — contextually appropriate as it already receives today's consumed meals data.
- **Micronutrient Level 1 — per-meal tracking** — 7 micronutrients tracked across every meal analysis: Vitamin D, Iron, Zinc, Magnesium, Vitamin B12, Calcium, Potassium. Added to `per100` schema, summed in `totalsFrom()`, saved to `meal_logs.totals` JSONB. Check my gaps shows a MICRONUTRIENTS section with goal-priority-ordered rows, adequacy bands (green ≥75% / amber 40–74% / red <40% of sex/age-aware RDA). `loadMealLogs()` limit bumped from 10 to 30. New helpers: `getMicroRDAs()`, `getMicroOrder()`, `renderMicronutrientsL1()`.
- **Micronutrient Level 2 — weekly pattern intelligence** — activates automatically when 7+ meals logged across 3+ distinct days. Shows WEEKLY PATTERN card in Check my gaps: average daily coverage per nutrient, food-fix suggestions for flagged nutrients, bioavailability notes (non-heme iron absorption, calcium+vitamin D interaction, zinc+phytate inhibition). New helper: `renderMicronutrientsL2()`.
- **Edge function update (wise-analyse)** — `wise-analyse-edge-function.ts` updated with micronutrient fields in per100 schema and instruction to return USDA micronutrient values. Requires manual Supabase redeploy.

## v2.6 — 2026-05-12

### What changed
- **Activity level selector on profile screen** — Sedentary (×1.2) / Lightly active (×1.375) / Moderately active (×1.55) replaces the hardcoded 1.55 TDEE multiplier. `calcTargets()` now reads `profile.activityLevel`. All display text in the targets explainer and fuel targets breakdown uses the actual multiplier. Stored in localStorage profile.
- **Fuel planner — consumed meals awareness** — `generateFuelPlan()` now calculates today's already-eaten totals from `mealLogs` and passes them to `callFuel()`. The fuel screen shows a green summary card ("X meals already logged today") when relevant. The fuel results screen shows an "Already eaten today" strip. New `wise-fuel-edge-function.ts` written — when consumed data is present, the plan covers REMAINING targets only. Requires manual redeploy.
- **Clickable macro bars with top contributors** — Each macro bar in Check my gaps is now a button. Tapping expands to show top 3–5 ingredient contributors from today's meal logs, with a mini bar chart. `gapsExpandedMacro` state tracks which bar is open. New helpers: `clickableTrackerBar()`, `getMacroContributors()`.
- **Fat breakdown (sat vs poly/mono)** — Analysis schema updated to include `sat_fat`, `poly_fat`, `mono_fat` in per100 objects. `totalsFrom()` and `saveMealLog()` updated. Gap screen fat bar expands to show a breakdown card (Saturated / Mono / Poly with colour coding). Results screen shows a fat breakdown card below THE NUMBERS tiles. `wise-analyse-edge-function.ts` updated — requires manual redeploy.
- **Analyse screen overhaul** — Removed info boxes from photo and text tabs. Removed "optional — improves accuracy" label. Made meal slot (Breakfast/Lunch/Dinner/Snack) and meal origin (Home cooked / Eating out / Shop bought) mandatory — Analyse button disabled until both selected. "Eating out" replaces "Restaurant" with venue name + location fields. "Shop bought" adds an optional nudge to upload a nutrition label photo. Context type `eating_out` handled by edge functions alongside legacy `restaurant`.

## v2.1 — 2026-05-10

### What changed
- **Delete meals** — meal cards on the home screen and gaps screen now have a × button on the right edge. Taps the Supabase `meal_logs` table, removes the row, and refreshes the list. A confirm prompt prevents accidental deletions.
- **"What you should eat"** — the gap recommendations card in Check my gaps is renamed from "What your day still needs" to "What you should eat", mirroring the app's name. Also added a success message when all macro gaps are met.
- **Micronutrient section in Check my gaps** — goal-specific micronutrient card (same as fuel plan) now appears below the macro gap recommendations on the gaps screen.
- **"Check today's gaps" button on results screen** — after analysing a meal, a full-width black button at the bottom navigates directly to the gaps screen. Only shown on fresh analyses (not when viewing a historical log).

## v2.0 — 2026-05-10

### What changed
- **Slot selector — obvious selected state** — Breakfast/Lunch/Dinner/Snack buttons now use per-slot accent colors (orange/green/indigo/emerald) with a 2px colored border, light tinted background, and a ✓ checkmark when selected. Previously the black fill was easy to miss.
- **Calories in The Numbers** — a full-width calories hero tile now sits above the four macro tiles, showing total kcal, % of daily target, and a progress bar. Turns red if over target.
- **Recent meals grouped by date** — meal history now shows "Today" as an open section, with older dates as collapsible headers (e.g. "Saturday 10 May"). Tapping a date header expands/collapses its meals.

## v1.9 — 2026-05-08

### What changed
- **Warning moved to bottom of photo tab** — "Estimated analysis — not nutritional fact" now appears below the upload zone (and below the description field in the hasPhotos state) rather than at the top. Upload + describe first, disclaimer last.
- **One-sentence description field on photo tab** — optional textarea appears after photo thumbnails with example nudges (homemade stir-fry, tacos from street cart, soup and sandwich from Starbucks, office canteen lasagna). Sent to the edge function as `userNote` to resolve ambiguity. Edge function updated to use it.
- **Meal slot selector** — Breakfast / Lunch / Dinner / Snack toggle added above the Home/Restaurant picker on the analyse screen. Stored in `state.mealSlot`, saved into the `context` JSONB column of `meal_logs` as `{ slot: 'lunch' }`. Resets on new analysis.
- **Check my gaps — slot-based view** — gaps screen now shows meals grouped by slot (Breakfast 🌅 / Lunch ☀️ / Dinner 🌙 / Snack 🍎). Logged slots show the meal name + kcal; unlogged slots appear greyed out as "not logged". Pre-slot meals (no context field) show as untagged rows below.
- **Profile screen BMR explainer** — added note below the age/sex fields: "Age and sex feed into your Mifflin-St Jeor BMR — the calories your body burns at rest. Sex shifts BMR by ~166 kcal/day; age reduces it ~5 kcal/year."
- **Edge function updated** — `wise-analyse-edge-function.ts` updated to accept optional `userNote` field, appended to the prompt as a hint for photo analyses. Requires redeploy.

## v1.8 — 2026-05-08

### What changed
- **Results screen reorder** — ingredient breakdown now appears before The Verdict and The Numbers. Order is now: summary → ingredients (collapsed) → verify prompt → verdict → numbers → gap analysis. Rationale: ingredients must be verified before the numbers are trustworthy. "Editing ingredients below" updated to "Editing ingredients above ↑".
- **Short dish name on home screen cards** — meal history cards now show a 3–5 word dish name extracted from the summary ("Grilled chicken skewer" not a 40-word sentence). `extractShortMealName()` strips the "This looks like a/an" preamble and cuts before "with" or commas. Full summary still shown on the results screen.
- **Short dish name in Check my gaps** — same function used in the new gaps screen meal list.
- **Profile sync to Supabase** — `saveProfile()` now async; after saving to localStorage it upserts to the `profiles` table (`weight_kg`, `height_cm`, `age`, `sex`, `goal`, `updated_at`). On login, if no local profile exists, it tries to load from Supabase — so profiles persist across devices and cleared browsers.
- **Check my gaps — live feature** — home screen card now navigates to a real `gaps` screen. Shows today's running macro totals vs targets with progress bars, gap recommendations (same logic as results screen), and today's logged meals. "+ Analyse a meal" button at the bottom. The `trackerBar()` helper supports a unit parameter so calories display as "kcal" not "g".
- **Edge function fix (requires manual deploy)** — `wise-analyse-edge-function.ts` written to WISE folder. The AMBIGUITY RULE is tightened: `ambiguous: true` is now reserved only for truly unanalysable photos (blended drinks, completely opaque soups). Fried rice, stir-fries, grain bowls, and any dish with visible ingredients must be analysed normally with appropriate confidence level. Deploy via Supabase Dashboard → Edge Functions → wise-analyse → replace body with this file.

## v1.7 — 2026-05-08

### What changed
- **Meal logging fixed end-to-end** — `saveMealLog` was inserting against the wrong column names (design doc didn't match the real DB). Fixed by auditing actual schema via `information_schema.columns`. Now uses correct column names: `input_type` (not `meal_type`), `meal_data` (not `identified_items`), `totals` JSONB object (not flat cal/protein/fat/carbs/fibre columns), `confidence_note` (not `confidence`).
- **Meal history now loads correctly** — `openMealLog` and home screen meal cards updated to read from `log.meal_data`, `log.totals?.cal`, `log.input_type`. Meals appear in RECENT MEALS with photo thumbnail, summary, date, time, and kcal.
- **Supabase RLS + GRANT** — Created INSERT and SELECT policies on `meal_logs` so authenticated users can save and read their own rows. Also ran `GRANT SELECT, INSERT ON meal_logs TO authenticated` — Postgres requires both the policy and the table-level grant.
- **Ambiguous screen grammar fix** — "That looks like an Is a mixed fried rice" bug. `extractDishName()` now rejects any candidate that starts with a verb or article ("is", "are", "was", "it ", "a ", "an ", "the ", etc.), not just exact single-word matches.
- **"Editing ingredients below" is now a scroll link** — tappable underlined text that smooth-scrolls to the ingredient breakdown section. `id="ingredient-breakdown"` added to the breakdown toggle button.
- **"+ Add ingredient" in results edit mode** — dashed button at the bottom of the edit list. Preserves any in-progress edits, appends a blank row, auto-focuses and scrolls to the new input. Backed by new `addCorrIngredient()` function.

## v1.6 — 2026-05-07

### What changed
- **Home screen: daily targets card** — new card below the profile bar showing today's calorie, protein, fat, carbs, and fibre targets. Collapsible "How did we get these numbers?" section with a goal-specific science explainer (Mifflin-St Jeor BMR walkthrough, protein/carb/fat rationale, research citations in casual language). Goal-specific for all four goals.
- **Home screen: recent meals now updates live** — meal logs now refresh immediately after a meal is saved, so the home screen shows the latest meal without requiring a sign-out/sign-in cycle.
- **Restaurant location field** — the single "Restaurant name" input is now two fields: name + location (city, area, or Google Maps link). Both fields combined into a single "Name (Location)" string sent to the edge function, so Claude can disambiguate regional chains (e.g. Nando's UK vs US). Helper text explains the purpose. Session state and meal log storage updated accordingly.
- **Ambiguity screen: ingredient table** — when WISE can't identify a blended/mixed meal from a photo, users now see a pre-filled ingredient table (name + amount columns) instead of a freeform text box. Rows can be added/removed; analysis runs per-ingredient via USDA lookups without re-triggering the ambiguity check.
- **Persistence fix** — switched from sessionStorage to localStorage so the app survives phone lock/screen-off on Android Chrome. Photo data URLs excluded from saved state to stay within the ~5MB localStorage limit.
- **Ambiguity screen: friendlier copy** — replaced generic "WISE can't see inside this one" with warmer, type-aware messages (blended, sauce-heavy, hidden-layer) acknowledging what the user made.

## v1.5 — 2026-05-06

### What changed
- **Bug fix: text analysis button** — "Analyse this meal" was disabled until a meal context was selected, despite meal type being optional. Root cause: textarea `oninput` mutated state directly without triggering a re-render, so the button's disabled state never updated. Fixed by reading the textarea value from the DOM at the moment analysis is triggered, and removing the disabled-at-render-time check.
- **Bug fix: text analysis navigating back** — related to the above. Now validates before showing loading state; shows a clear inline error if the description is empty.
- **Bug fix: app state reset when backgrounding** — switching away from the browser tab (e.g. to take a screenshot) caused the app to reset to the home screen. Fixed with sessionStorage persistence: screen, analysis result, meal text, fuel plan and other key state are saved on every update and restored when the tab reloads.
- **Results screen: "Did I get this right?"** — explicit Yes/No verification prompt in the meal summary card. "Looks right" confirms and dismisses. "Something's off" expands all ingredients in batch edit mode — each shows independent name and gram inputs, with a trash icon per ingredient. "Save corrections" recalculates macros and collapses back.
- **Results screen: Ingredient breakdown hidden by default** — breakdown is now collapsed. Revealed when: user taps "Something's off", user taps the "show" toggle, or user taps "Something look wrong?" from the confirmed view.
- **Results screen: The Verdict** — new section between the meal summary and The Numbers. Shows a score out of 100 (capped at 93 — no meal is perfect), a score bar, and a 2–3 sentence goal-aware paragraph. Scoring is rule-based and goal-weighted (protein, carbs, fat, fibre, calorie reasonableness). Tone: supportive but specific.
- **Results screen: bold section labels** — "The Verdict" and "The Numbers" now use font-weight:700 to match the heading hierarchy.

## v1.3 — 2026-05-02

### What changed
- **Visual ambiguity detection** — Claude now flags `ambiguous: true` when a photo can't yield reliable ingredient-level analysis. Applies to blended drinks, soups, curries, stews, dal, opaque sauces, hidden-layer foods (sandwiches, pies, wraps). When flagged, the results screen is replaced with a clear explanation of *why* and two action paths: describe what's in it (text tab, with a tailored hint) or upload a nutrition label (for packaged/store-bought items). WISE never shows a confident-looking wrong answer.

## v1.2 — 2026-05-02

### What changed
- **Ingredient edit + delete** — tap ✏️ on any identified ingredient to correct the name or adjust grams. Correcting the name triggers a live USDA per100 lookup so nutrition recalculates correctly. Tap 🗑️ to remove an ingredient entirely.
- **Multi-photo upload** — photo tab now accepts up to 3 photos per analysis. All sent to Claude in one API call. Useful for top-down + cross-section shots to capture layers and sauces.
- **Home cooked / Restaurant context toggle** — both photo and text tabs now let users flag the meal type. Restaurant mode adjusts Claude's portion and oil/butter estimates. Restaurant name input unlocks chain-specific data (e.g. Nando's, Din Tai Fung) when available.
- **"How did we get here?" expander** — collapsible breakdown below the fuel plan targets showing BMR → TDEE → goal adjustment → training bonus = today's calorie target. Builds trust for users who see 3000+ kcal and wonder why.
- **Micronutrient nudge in fuel plan** — goal-aware callout after the meal cards. Muscle gain gets zinc/magnesium/vitamin D; fat loss gets iron/B12/zinc; recomp gets hormone-balance focus; performance gets magnesium/vitamin D/electrolytes. Pro teaser at the bottom.

## v1.1 — 2026-05-01

### What changed
- **Rebuilt as a proper standalone web app** (`wise-app.html`) with direct Anthropic API calls — replaces Cowork artifact
- **Photo analysis now works correctly** — direct `fetch` to `https://api.anthropic.com/v1/messages` with base64 image, using `claude-haiku-4-5` vision
- **API key screen** — first-run setup, key stored in `localStorage`, never leaves device
- **Profile persisted** — `localStorage` saves profile between sessions
- **Removed `askClaude` dependency** — Cowork artifact's `askClaude` is text-only; photo analysis requires direct API access

### Why the rebuild
The Cowork artifact used `window.cowork.askClaude` which does not pass images to the model. Every photo analysis was hallucinated. Correct fix was a standalone web app with direct Anthropic API access.

---

## v1.0 — 2026-05-01

### What was built
- Full product concept: WISE = What I Should Eat
- Two core flows:
  1. **Analyse a meal** (FREE) — photo upload or text description → Claude AI analysis
  2. **Plan my fuel** (PRO) — activity-based daily fuel plan
  3. **Check my gaps** (PRO) — daily food log with gap analysis
- Profile setup: weight, height, age, sex, goal → Mifflin-St Jeor BMR → personalised macro targets
- Real AI analysis via `window.cowork.askClaude` — Claude vision for photos, text inference for descriptions
- "Show workings" pattern: every analysis shows what Claude identified, reasoning per ingredient, confidence level, all assumptions made
- Paywall screen for PRO features with waitlist CTA

### Goal options
- ⚡ Performance — maintenance calories, 1.8g protein/kg
- 💪 Build Muscle — 10% surplus, 2.0g protein/kg
- 🔥 Lose Fat — 15% deficit, 2.2g protein/kg
- ⚖️ Recomposition — maintenance calories, 2.3g protein/kg (highest protein — knife's edge)

### Files
- `wise-artifact-v1.html` — live Cowork artifact (real Claude AI analysis)
- `WISE-v1.jsx` — static React prototype (mock photo analysis, good for UI iteration)

### Origin
Born from a breakfast analysis built in Claude chat, which led to the insight that TSO (The Scientific Oracle) was too broad for an MVP. WISE is the focused nutrition slice — no coaching conversations, no Whoop connectivity, just: here's what I'm doing today, here's what I ate, here's what's missing.
