// wise-analyse — Supabase Edge Function
// Deploy via: Supabase Dashboard → Edge Functions → wise-analyse → Edit
//
// TWO-PASS MODE (photo + description):
//   Pass 1 — text analysis of the description alone → all described items with exact weights
//   Pass 2 — photo analysis → visibility check + any additional spotted items
//   Merge → described items (source:'described') + visual extras (source:'visual')
//
// SINGLE-PASS MODE (photo only, or text only): unchanged behaviour.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const SINGLE_SCHEMA = `{
  "ambiguous": false,
  "ambiguityReason": "Only populate if ambiguous is true — one plain sentence",
  "summary": "One plain sentence describing what this meal appears to be. Always starts with 'This looks like'.",
  "identified": [
    {
      "name": "Food name",
      "emoji": "appropriate single emoji",
      "estimatedG": 100,
      "source": "described | visual",
      "visibleInPhoto": true,
      "confidence": "High | Medium | Low",
      "reasoning": "Specific visual or contextual reasoning for this identification and gram estimate",
      "per100": { "cal": 0, "protein": 0, "fat": 0, "sat_fat": 0, "poly_fat": 0, "mono_fat": 0, "carbs": 0, "fibre": 0, "vitamin_d": 0, "iron": 0, "zinc": 0, "magnesium": 0, "b12": 0, "calcium": 0, "potassium": 0 }
    }
  ],
  "assumptions": ["Each assumption made, stated plainly"],
  "confidence": "High | Medium | Low",
  "confidenceNote": "One sentence on the main source of uncertainty"
}`

const PASS2_SCHEMA = `{
  "describedVisible": ["exact item name from the described list that is visible in this photo"],
  "describedUpdates": [
    {
      "name": "Exact item name from the described list (must match exactly)",
      "estimatedG": 165,
      "per100": { "cal": 0, "protein": 0, "fat": 0, "sat_fat": 0, "poly_fat": 0, "mono_fat": 0, "carbs": 0, "fibre": 0, "vitamin_d": 0, "iron": 0, "zinc": 0, "magnesium": 0, "b12": 0, "calcium": 0, "potassium": 0 }
    }
  ],
  "additional": [
    {
      "name": "Food name",
      "emoji": "appropriate single emoji",
      "estimatedG": 100,
      "confidence": "High | Medium | Low",
      "reasoning": "What you can see that identifies this ingredient",
      "per100": { "cal": 0, "protein": 0, "fat": 0, "sat_fat": 0, "poly_fat": 0, "mono_fat": 0, "carbs": 0, "fibre": 0, "vitamin_d": 0, "iron": 0, "zinc": 0, "magnesium": 0, "b12": 0, "calcium": 0, "potassium": 0 }
    }
  ],
  "summary": "One plain sentence describing what this meal appears to be. Always starts with 'This looks like'.",
  "ambiguous": false,
  "ambiguityReason": "",
  "assumptions": [],
  "confidence": "High | Medium | Low",
  "confidenceNote": ""
}`

// ── Base prompt (shared across all modes) ────────────────────────────────────

const BASE_PROMPT = `You are WISE — What I Should Eat — a nutrition analysis AI.
Identify every ingredient in this meal, estimate portion sizes in grams, and provide accurate nutritional values per 100g using USDA FoodData Central data.

Return ONLY valid raw JSON matching this exact schema (no markdown, no code fences, no explanation):
${SINGLE_SCHEMA}

Rules:
- List every visible ingredient separately, including sauces, oils, seeds, toppings
- Use standard portion sizes when amounts are unclear (1 tbsp honey = 21g, 1 medium banana = 118g)
- Per100 values must be accurate USDA data per 100g
- Confidence reflects certainty about both identification AND portion estimate
- Reasoning must reference specific visual cues: colour, texture, shape, plate coverage
- Be honest — if you cannot identify something, say so

AMBIGUITY RULE (photo analysis only):
"ambiguous": true is reserved for one specific situation: you cannot identify what the FOOD EVEN IS because ingredients have been physically destroyed (blended, dissolved, pureed into a uniform mass). That is the only valid use.

THE BINARY TEST — ask yourself: "Can I name what this dish is?"
  - If YES → set ambiguous: false. Analyse it. Uncertainty about exact amounts is NOT ambiguity.
  - If NO (it is a featureless uniform liquid/paste with no visible components) → set ambiguous: true.

VALID uses of ambiguous: true (the food is physically unidentifiable):
  - Blended smoothies, protein shakes, juices — poured into a cup, ingredients are gone
  - A perfectly smooth, uniform cream soup with zero solid ingredients visible on the surface
  - Completely sealed/opaque packaging where no food is visible at all

NEVER use ambiguous: true for these — they must always be analysed:
  - Fried rice — you can see the rice grains, egg, peas, any meat or prawns
  - Stir-fries and noodle dishes — noodles/rice and components are visible even when mixed
  - Grain bowls, rice bowls, Buddha bowls, salad bowls — identify what is on top
  - Biryani — rice and meat layers are visible
  - Curry or dal where you can see solid pieces (chicken, lentils, chickpeas, vegetables)
  - Any soup with visible ingredients floating in it (noodles, vegetables, meat)
  - Pasta dishes — pasta is always identifiable, estimate the sauce type from colour and texture
  - Sandwiches or wraps where any filling is visible at the edges or cross-section
  - Any dish where you can identify the cuisine (Indian, Thai, Chinese, Italian, etc.)
  - Any dish where you can name it (pad thai, lasagne, jerk chicken, shakshuka, etc.)

CRITICAL DISTINCTION — burn this into memory:
  ✅ "I can see it's fried rice but I'm not sure if that's pork or chicken" → ambiguous: false, confidence: Low
  ✅ "I can see it's a curry but I can't tell how much oil is in it" → ambiguous: false, confidence: Medium
  ✅ "I can see pasta but the sauce is obscured" → ambiguous: false, estimate sauce from visible colour/texture
  ❌ "This looks complex so I'll flag it ambiguous" → WRONG. Never do this.
  ❌ "I'm not 100% sure of the gram amounts" → WRONG. That is Low confidence, not ambiguous.

When in doubt: set ambiguous: false and lower the confidence. A Low-confidence analysis with honest caveats is always more useful than refusing to analyse. The user can see the meal — they just want your best estimate.

If the user has provided a text description of the meal, NEVER set ambiguous: true — analyse what they have described, no exceptions.

MILK ALTERNATIVES IN COFFEE: When a milk alternative (oat milk, coconut milk, almond milk, soy milk) is used in a coffee drink (flat white, latte, cappuccino, cortado, macchiato), always use barista-grade nutritional values — these are heavily diluted (~10–15% coconut or oat content) and have ~30–50 kcal and 1–4g fat per 100ml. Do NOT use cooking/tinned coconut milk values (which are ~180 kcal and 17–19g fat per 100ml). A coconut milk flat white or oat milk latte contains barista milk, not cooking milk.

MICRONUTRIENTS: For every ingredient's per100 object, populate all 7 micronutrient fields using USDA FoodData Central data: vitamin_d (µg/100g), iron (mg/100g), zinc (mg/100g), magnesium (mg/100g), b12 (µg/100g), calcium (mg/100g), potassium (mg/100g). These are required — do not omit or leave as 0 unless the food genuinely contains none. Use 0 only if the nutrient is truly absent (e.g. b12 in plant foods).`

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callAnthropic(apiKey: string, content: unknown[], maxTokens = 4096): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic API error: ${res.status} — ${errText}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

function parseJSON(raw: string): Record<string, unknown> {
  const clean = raw.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(clean) } catch (_) {}
  const m = clean.match(/\{[\s\S]*\}/)
  if (m) return JSON.parse(m[0])
  throw new Error('Could not parse response from AI')
}

function imageContent(img: string) {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
      data: img.split(',')[1] || img,
    },
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { type, images, description, context, restaurantName, userNote } = body

    // Build shared context note
    let ctxNote = ''
    if (context === 'home') {
      ctxNote = '\nCONTEXT: Home-cooked meal. Use standard home-cooking portion sizes and typical oil/seasoning amounts.'
    } else if (context === 'eating_out' || context === 'restaurant') {
      const ident = restaurantName ? `"${restaurantName}"` : null
      const dataNote = ident
        ? ` If ${ident} is a known chain with published nutritional data, use those figures and state the source in assumptions. Location context may be included in the name — use it to disambiguate regional chains.`
        : ''
      ctxNote = `\nCONTEXT: Restaurant or café meal${restaurantName ? ` at "${restaurantName}"` : ''}.${dataNote} Eating out typically means more oil, butter, and salt — and larger portions than home cooking. Adjust estimates accordingly.`
    } else if (context === 'shop_bought') {
      ctxNote = '\nCONTEXT: Shop-bought or packaged food. Use standard manufacturer nutritional data for known branded products where available. Note in assumptions if you used manufacturer data or estimated from first principles.'
    }

    const fatInstruction = '\n\nIMPORTANT: For each ingredient\'s per100 object, include sat_fat (saturated fat), poly_fat (polyunsaturated fat), and mono_fat (monounsaturated fat) values in grams per 100g alongside the total fat. These must sum to approximately the total fat value.'

    // ── TWO-PASS MODE: photo + description ────────────────────────────────────
    if (type === 'photo' && images?.length > 0 && userNote) {

      // ── Pass 1: text analysis of description ────────────────────────────────
      const pass1Prompt = BASE_PROMPT + ctxNote + fatInstruction +
        '\n\nABSOLUTE RULE FOR THIS REQUEST: The user has written a TEXT DESCRIPTION of their meal. ' +
        'Set "ambiguous": false. Return a complete analysis of EVERY item mentioned. ' +
        'Include every food and drink, with or without a stated weight. ' +
        'If no weight is given, use a sensible standard estimate ' +
        '(e.g. "coconut flat white" → 240ml, "espresso" → 30ml, "glass of juice" → 250ml, ' +
        '"banana" → 118g, "apple" → 182g, "coffee" → 240ml). ' +
        'Never drop any mentioned item.' +
        `\n\nFood to analyse: ${userNote}`

      const pass1Raw = await callAnthropic(anthropicKey, [{ type: 'text', text: pass1Prompt }])
      const pass1 = parseJSON(pass1Raw)
      type IngredientItem = Record<string, unknown>
      const describedItems: IngredientItem[] = ((pass1.identified || []) as IngredientItem[]).map(item => ({
        ...item,
        source: 'described',
        visibleInPhoto: false, // updated by pass 2
      }))

      // ── Pass 2: photo — visibility check + additional spotted items ──────────
      const describedList = describedItems
        .map((item, idx) => `${idx + 1}. ${item.name}`)
        .join('\n')

      // Build quantity hints from description so pass 2 can calculate correct estimatedG
      const quantityHints = describedItems
        .map((item, idx) => `${idx + 1}. ${item.name} — user said: "${userNote}"`)
        .join('\n')

      const pass2Prompt =
        `You are WISE — a nutrition analysis AI.\n\n` +
        `The user described their meal. These items are already identified from their description:\n${describedList}\n\n` +
        `Look at this photo and do exactly THREE things:\n` +
        `1. "describedVisible" — list the names (exactly as written above) of described items you can see in the photo.\n` +
        `2. "describedUpdates" — CRITICAL: If the photo shows a NUTRITION LABEL (a product package, bottle, tin, or box with printed nutritional information) for any described item, you MUST extract the exact per100 values from that label and include the item here. Also calculate the correct estimatedG from the user's quantity description (e.g. "half a bottle" of a 330ml bottle = 165g; "whole can" of 250ml = 250g; "one scoop" = use label serving size). This overrides the generic estimates from the description analysis. Only include items where you can read label data from the photo. Leave empty [] if no labels are visible.\n` +
        `3. "additional" — identify any ingredients clearly visible in the photo that are NOT in the described list. Only include items you are reasonably confident about. Do NOT re-add anything already described.\n\n` +
        `User's original description (for quantity parsing): "${userNote}"\n\n` +
        `Return ONLY valid raw JSON:\n${PASS2_SCHEMA}`

      const pass2Raw = await callAnthropic(
        anthropicKey,
        [...images.map(imageContent), { type: 'text', text: pass2Prompt }],
        3072
      )
      const pass2 = parseJSON(pass2Raw)

      // Update visibleInPhoto on described items + apply label-based describedUpdates
      const visibleNames = ((pass2.describedVisible || []) as string[]).map((n: string) => n.toLowerCase())
      const labelUpdates = ((pass2.describedUpdates || []) as IngredientItem[])

      const finalDescribed = describedItems.map(item => {
        const iName = (item.name as string).toLowerCase()
        const isVisible = visibleNames.some((vn: string) => {
          const vnFirst = vn.split(' ')[0]
          const iFirst = iName.split(' ')[0]
          return vn.includes(iFirst) || iName.includes(vnFirst)
        })

        // Apply label data if pass 2 found a nutrition label for this item
        const labelUpdate = labelUpdates.find((u: IngredientItem) => {
          const uName = ((u.name as string) || '').toLowerCase()
          const uFirst = uName.split(' ')[0]
          const iFirst = iName.split(' ')[0]
          return uName.includes(iFirst) || iName.includes(uFirst)
        })

        if (labelUpdate) {
          return {
            ...item,
            visibleInPhoto: true,
            estimatedG: labelUpdate.estimatedG ?? item.estimatedG,
            per100: labelUpdate.per100 ?? item.per100,
            reasoning: (item.reasoning as string || '') + ' [nutritional values from product label]',
          }
        }

        return { ...item, visibleInPhoto: isVisible }
      })

      // Visual-only items from photo
      const additionalItems = ((pass2.additional || []) as IngredientItem[]).map(item => ({
        ...item,
        source: 'visual',
        visibleInPhoto: true,
      }))

      const result = {
        ambiguous: pass2.ambiguous || false,
        ambiguityReason: pass2.ambiguityReason || '',
        summary: pass2.summary || pass1.summary || '',
        identified: [...finalDescribed, ...additionalItems],
        assumptions: [
          ...((pass1.assumptions || []) as string[]),
          ...((pass2.assumptions || []) as string[]),
        ],
        confidence: pass2.confidence || pass1.confidence || 'Medium',
        confidenceNote: (pass2.confidenceNote || pass1.confidenceNote || '') as string,
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── SINGLE-PASS MODE: photo-only or text-only ─────────────────────────────
    const fullPrompt = BASE_PROMPT + ctxNote + fatInstruction +
      '\n\nAnalyse this food. Identify every ingredient, estimate gram portions, and return the JSON.'

    let messageContent: unknown[]

    if (type === 'photo' && images?.length > 0) {
      messageContent = [...images.map(imageContent), { type: 'text', text: fullPrompt }]
    } else {
      const desc = description || ''
      const textOverride =
        '\n\nABSOLUTE RULE FOR THIS REQUEST: The user has written a TEXT DESCRIPTION of their meal. ' +
        'They have told you exactly what is in it. You MUST set "ambiguous": false and return a complete ' +
        'analysis of every ingredient they mentioned. Setting "ambiguous": true for a text description ' +
        'is always wrong — the user described it, so it is not ambiguous. Analyse it now.'
      messageContent = [{ type: 'text', text: fullPrompt + textOverride + `\n\nFood to analyse: ${desc}` }]
    }

    const rawText = await callAnthropic(anthropicKey, messageContent)
    const result = parseJSON(rawText)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
