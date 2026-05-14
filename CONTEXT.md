# WISE — Project Context
_Handover file for new Claude sessions._

**Last updated:** 2026-05-14 | **Current version:** v4.0

---

## What is WISE?

WISE = **What I Should Eat**

A focused nutrition web app with two core questions:
1. "Here's what I've eaten today — what's missing?"
2. "Here's what I'm doing today — what should I eat to fuel it?"

Output is always **specific ingredients with gram amounts**, never recipes. The app analyses macros against personalised daily targets, explains the gap, and plans meals around training.

**Not** a calorie counter. **Not** a coaching chatbot.

---

## Architecture — CRITICAL

`index.html` is a **standalone single-file web app** hosted on **GitHub Pages**. It calls **Supabase Edge Functions** which proxy to the Anthropic API. The API key never touches the browser.

**Live URL:** `https://thescientificoracle.github.io/WISE`
**GitHub Repo:** `https://github.com/TheScientificOracle/WISE`

```
User browser (index.html on GitHub Pages)
       ↓  JWT token
Supabase Edge Functions (wise-analyse / wise-fuel)
       ↓  API key (stored as Supabase secret)
Anthropic API (claude-haiku-4-5-20251001)
```

**Do NOT revert to direct Anthropic API calls from the browser.**

### Supabase Project
- **URL:** `https://qpisyykqmivljpsqleul.supabase.co`
- **Anon key:** `sb_publishable_woWGWtBvw0FJJNaP7rC63A_y5ZSVBjp`
- **Region:** eu-west-2 (London)
- **Auth:** Email/password, email confirmation OFF

### CDN scripts loaded in `<head>`
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
```
Supabase client initialised as `sb`. Tabler icons used for tab bar and UI elements (`<i class="ti ti-NAME">`).

### Edge Functions (all deployed ✅)
| Function | Purpose | Last deployed |
|----------|---------|--------------|
| `wise-analyse` | Photo or text meal analysis → returns analysis JSON | 2026-05-14 (v3.8) |
| `wise-fuel` | Fuel plan generation → returns meal plan JSON | 2026-05-13 |
| `wise-shop` | Weekly shopping list from ingredient history + deficits | 2026-05-14 (v4.0) |

All validate `Authorization: Bearer <jwt>`. JWT obtained via `sb.auth.getSession()`.

### GitHub deploy
Push `index.html` to `main` branch of the WISE repo. GitHub Pages serves it automatically.
Local repo path (sandbox): `/sessions/fervent-blissful-ritchie/mnt/WISE-repo/`

---

## Database Schema (Supabase)

### `profiles`
```sql
id uuid references auth.users primary key
weight_kg numeric, height_cm numeric, age integer, sex text, goal text
activity_level text   -- 'sedentary' | 'light' | 'moderate'
created_at, updated_at timestamptz
```
RLS: users see only their own row.

### `meal_logs`
```sql
id uuid primary key
user_id uuid references auth.users
input_type text          -- 'photo' | 'text'
meal_context text        -- 'home' | 'eating_out' | 'shop_bought' | null
restaurant_name text     -- combined "Name (Location)" string
meal_data jsonb          -- array of ingredient objects
totals jsonb             -- { cal, protein, fat, sat_fat, poly_fat, mono_fat, carbs, fibre,
                         --   vitamin_d, iron, zinc, magnesium, b12, calcium, potassium }
confidence_note text
summary text
photo_data_url text      -- base64 of first photo
context jsonb            -- { slot: 'breakfast'|'lunch'|'dinner'|'snack' }
logged_at timestamptz    -- set by app, supports backdating (noon on chosen date)
created_at timestamptz
```
⚠️ Macros in `totals` JSONB — no flat columns. Ingredients in `meal_data`. Slot in `context.slot`.

---

## Navigation / Screen Model

### Bottom tab bar (persistent on home, gaps, profile, results, ambiguousResult)
3 tabs: **Today** (`ti-chart-bar`) → home | **Log** (elevated `ti-camera`) → analyse | **Profile** (`ti-user`) → profile

Tab bar is **hidden** on: analyse, fuel, fuelResults screens (focused task flows).

### State machine
```
loading → auth → profile → home
home → gaps → results (via openMealLog)
home → results (via openMealLog — history)
tab Log → analyse → results / ambiguousResult
tab Log → analyse → ambiguousResult → analyse (back) or results (after table analysis)
gaps → fuel → fuelResults → home
results → home (via "See today's progress" button)
```

---

## State Object (key fields)

```javascript
{
  screen,
  user, session,
  authMode, authEmail, authPassword, authError, authLoading,
  profile: { weight, height, age, sex, goal, activityLevel, location },
  mealLogs,            // last 30 meals from Supabase
  mealLogsLoading,
  viewingLog,          // non-null when viewing a historical meal
  analyseTab,          // 'photo' | 'text'
  photoDataUrls,       // array, up to 3
  mealText,
  mealContext,         // null | 'home' | 'eating_out' | 'shop_bought'
  restaurantName,
  restaurantLocation,
  mealSlot,            // 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  mealDate,            // YYYY-MM-DD, defaults to today, supports backdating
  photoDescription,
  analysing, analysisResult, analysisError,
  mealSaveError,
  ingredientsVerified, ingredientsExpanded,
  ingredientRows,      // [{name, qty, unit}] — ambiguous screen manual table
  expandedIdx, editingIdx, editFetching,
  assumptionsExpanded,
  gapsDate,                // null = today; 'YYYY-MM-DD' = past day gaps view
  gapsExpandedMicro,       // 'vitamin_d'|'iron'|etc|null — expanded micro row
  gapsExpandedMacro,       // 'cal'|'protein'|'fat'|'carbs'|'fibre'|null
  gapsExpandedFatSubtype,  // string[] — can have multiple open ('sat','mono','poly')
  homeTargetsExpanded,
  pwFeature,
  fuelActivity, fuelEffort, fuelWhen, fuelMeals,
  fuelTargetsExpanded,
  fuelPlan, fuelPlanning, fuelError,
}
```

---

## Calculation Engine

**BMR:** Mifflin-St Jeor
- Male: `(10 × weight) + (6.25 × height) − (5 × age) + 5`
- Female: `(10 × weight) + (6.25 × height) − (5 × age) − 161`

**TDEE:** BMR × activityLevel multiplier (`sedentary` 1.2 / `light` 1.375 / `moderate` 1.55)

**Macro targets by goal:**
| Goal | Calories | Protein | Fat | Carbs |
|------|----------|---------|-----|-------|
| Performance ⚡ | TDEE | 1.8g/kg | 25% | remainder |
| Build Muscle 💪 | TDEE × 1.10 | 2.0g/kg | 25% | remainder |
| Lose Fat 🔥 | TDEE × 0.85 | 2.2g/kg | 30% | remainder |
| Recomposition ⚖️ | TDEE | 2.3g/kg | 25% | remainder |

**Fibre target:** 30g/day fixed.

---

## Home Screen — Adaptive Today Dashboard

The home screen is the live daily dashboard (not a launchpad). It shows:

1. **Header** — "WISE" large + `weight · goal · date` inline right
2. **Today's progress card** — % badge, calories bar, 2×2 macro grid (PROTEIN/FAT/CARBS/FIBRE) with progress bars. Over-target = red with `!`.
3. **What you should eat** — gap summary card → taps to gaps screen. Hidden when 0 meals logged today.
4. **Micronutrients** — red `N low` badge card → taps to gaps screen. Hidden when 0 meals logged today, and when no nutrients are under 40% RDA.
5. **Today's meals** — time-sorted, slot emoji icons. Unlogged dinner/lunch placeholders after time threshold.
6. **Past days** — date-grouped history from `renderRecentMeals()`. Past days with `< 70%` of calorie target show orange `INCOMPLETE` badge.

---

## Key Functions

```javascript
// Calculation
calcBMR(profile)
calcTargets(profile)          // returns { cal, protein, fat, carbs, fibre }
totalsFrom(identifiedItems)   // sums all 15 macro+micro fields
getGaps(totals, targets)

// Micronutrients
getMicroRDAs(profile)         // sex+age-aware RDAs for 7 nutrients
getMicroOrder(goal)           // goal-prioritised nutrient order
renderMicronutrientsL1(todayLogs, profile)
renderMicronutrientsL2(allLogs, profile)  // activates at 7+ meals / 3+ days

// Navigation
renderTabBar(activeTab)       // 'today' | 'profile' | null
renderHome()                  // adaptive today dashboard
renderGaps()                  // detailed macro + micro drill-down
renderAnalyse()
renderResults()
renderAmbiguousResult(r)
renderFuel()
renderFuelResults()
renderProfile()

// Meal logging
saveMealLog(result)           // uses state.mealDate for logged_at (supports backdating)
loadMealLogs()                // loads last 30 meals
openMealLog(idx)
extractShortMealName(summary) // 3–5 word dish name from Claude summary

// Edge function callers
getToken()
callAnalyse(payload)          // POST to wise-analyse
callFuel(payload)             // POST to wise-fuel
generateShoppingList()        // aggregates ingredient freq + deficits → POST to wise-shop

// Fat bar helpers
fatSubtypeRow(subtype, label, value, total, color, contributors)

// Analyse flow
contextToggleHTML()           // slot + when + context selectors
photoTabContent()
textTabContent()
analyseAndSave()              // runs analysis, guards empty identified[], saves log
runTableAnalysis()            // ambiguous screen sequential per-ingredient fetch
```

---

## Analysis JSON Schema (returned by wise-analyse)

```json
{
  "ambiguous": false,
  "ambiguityReason": "Only if ambiguous",
  "summary": "This looks like...",
  "identified": [
    {
      "name": "Food name",
      "emoji": "🍗",
      "estimatedG": 150,
      "confidence": "High | Medium | Low",
      "reasoning": "Visual reasoning",
      "per100": {
        "cal": 0, "protein": 0, "fat": 0,
        "sat_fat": 0, "poly_fat": 0, "mono_fat": 0,
        "carbs": 0, "fibre": 0,
        "vitamin_d": 0, "iron": 0, "zinc": 0,
        "magnesium": 0, "b12": 0, "calcium": 0, "potassium": 0
      }
    }
  ],
  "assumptions": ["..."],
  "confidence": "High | Medium | Low",
  "confidenceNote": "Main source of uncertainty"
}
```

**Guard:** if `identified.length === 0` and `ambiguous === false`, app auto-sets `ambiguous: true` with a fallback reason — routes to ambiguous screen, never shows all-zero results.

---

## Fuel Plan JSON Schema (returned by wise-fuel)

```json
{
  "dayType": "Hard Strength Day — Afternoon Session",
  "meals": [
    {
      "slot": "Breakfast",
      "timing": "7:00 AM",
      "purpose": "Why this meal is structured this way",
      "ingredients": [
        { "name": "Ingredient", "amount": "150g", "emoji": "🍗", "note": "optional" }
      ],
      "mealMacros": { "cal": 0, "protein": 0, "carbs": 0, "fat": 0, "fibre": 0 }
    }
  ],
  "dayNotes": ["Note 1", "Note 2", "Note 3"]
}
```

Fuel plan is aware of already-logged meal slots (`loggedSlots`) — does not re-plan eaten meals.

---

## UI / Design Language

- Font: system sans-serif (`-apple-system, BlinkMacSystemFont, 'Segoe UI'`)
- Icons: Tabler Icons webfont (outline only — e.g. `ti-home`, `ti-camera`, `ti-user`, `ti-chart-bar`)
- Max width: 500px, mobile-first
- Cards: white, `border: 1px solid #e5e7eb`, `border-radius: 16px`
- Macro colours: Protein `#3b82f6`, Fat `#f59e0b`, Carbs `#10b981`, Fibre `#8b5cf6`
- Confidence: High `#16a34a`, Medium `#d97706`, Low `#dc2626`
- Buttons: primary = black `#111`, secondary = white with border
- Tab bar: fixed bottom, 60px height, white background, `ti-chart-bar` / elevated camera / `ti-user`
- Core pattern: **"Show workings"** — every AI analysis surfaces reasoning, assumptions, confidence

---

## Key Design Decisions (don't reverse without reason)

1. **Standalone HTML + Supabase backend** — API key stays server-side always
2. **Ingredients not recipes** — WISE gives "150g chicken breast", not "make this dish"
3. **Show workings** — all assumptions visible and collapsible
4. **Honest uncertainty** — empty `identified[]` → ambiguous handoff, never fake zeros
5. **No paywall** — everything free for friend/family testing phase
6. **Photo = estimate** — persistent ±25% disclaimer
7. **Home = live dashboard** — not a launchpad. Shows today's progress on open.
8. **Tab bar always present** — Log button one tap from home, gaps, profile, results, ambiguous screens

---

## Files

| File | Description |
|------|-------------|
| `index.html` | **The app** — current working version (v4.0) |
| `CONTEXT.md` | This file |
| `CHANGELOG.md` | Full version history |
| `FEEDBACK.md` | Open backlog |
| `wise-analyse-edge-function.ts` | Edge function source (deploy via Supabase dashboard) |
| `wise-fuel-edge-function.ts` | Edge function source (deploy via Supabase dashboard) |
| `wise-shop-edge-function.ts` | Shopping list edge function source (deploy via Supabase dashboard) |

---

## How to start a new session

Say: _"Continue WISE development. The project files are in my WISE folder — read CONTEXT.md, CHANGELOG.md, and FEEDBACK.md before touching any code."_

**Before writing any code:**
1. Read `CONTEXT.md` — architecture, schema, state shape, key functions
2. Read `FEEDBACK.md` — open items and priorities
3. Read `CHANGELOG.md` — what changed recently
4. Check actual DB schema if doing any Supabase work: `SELECT column_name FROM information_schema.columns WHERE table_name = 'meal_logs' ORDER BY ordinal_position;`
