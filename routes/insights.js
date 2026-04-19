const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { authMiddleware } = require('../middleware/auth');

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a financial advisor for independent restaurant owners.
Analyze the restaurant's financial data and generate exactly 4 practical, actionable insights.

Use these industry benchmarks:
- Food cost %: healthy = 28–32%, warning = 32–36%, critical = >36%
- Beverage cost %: healthy = 20–25%, warning = 25–30%, critical = >30%
- Labor cost %: healthy = 28–35%, warning = 35–40%, critical = >40%
- Prime cost % (food + bev + labor): healthy = <60%, warning = 60–65%, critical = >65%
- Net margin %: healthy = >10%, warning = 5–10%, critical = <5%
- Beverage mix %: low = <20%, healthy = 25–35%

Rules:
1. Always mention the actual numbers — never be vague.
2. Compare to benchmarks explicitly.
3. Each insight must have one concrete, specific action.
4. Use a calm, coach-like tone — never alarmist.
5. Prioritize insights by financial impact (biggest money issue first).

Return ONLY valid JSON, no markdown, no code fences, no explanation:
{
  "insights": [
    {
      "severity": "good | warning | critical | info",
      "category": "food_cost | labor | beverage | revenue | margin | prime_cost",
      "title": "Short title, max 8 words",
      "body": "2–3 sentences with specific numbers and benchmark comparison.",
      "action": "One clear, specific action the owner can take this week."
    }
  ]
}`;

router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await req.supabase
    .from('ai_insights')
    .select('*')
    .eq('restaurant_id', req.restaurant.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return res.json({ insights: null });
  res.json(data);
});

router.post('/generate', authMiddleware, async (req, res) => {
  const { pl } = req.body;
  if (!pl) return res.status(400).json({ error: 'P&L data required' });
  if (pl.total_revenue === 0) return res.status(400).json({ error: 'No revenue data to analyze' });

  const userPrompt = `Restaurant: ${req.restaurant.name}
Period: ${pl.month} (${pl.days_tracked} days of data)

REVENUE:
  Food sales:      $${pl.food_sales.toLocaleString()} (${(100 - pl.bev_mix_pct).toFixed(1)}% of revenue)
  Beverage sales:  $${pl.beverage_sales.toLocaleString()} (${pl.bev_mix_pct}% beverage mix)
  Total revenue:   $${pl.total_revenue.toLocaleString()}
  Covers:          ${pl.covers} guests
  Avg check:       $${pl.avg_check}

COSTS:
  Food cost:       $${pl.food_cost.toLocaleString()} = ${pl.food_cost_pct}% of food sales
  Beverage cost:   $${pl.bev_cost.toLocaleString()} = ${pl.bev_cost_pct}% of bev sales
  Labor:           $${pl.labor.toLocaleString()} = ${pl.labor_pct}% of revenue
  Rent:            $${pl.rent.toLocaleString()}
  Utilities:       $${pl.utilities.toLocaleString()}
  Prime cost:      ${pl.prime_cost_pct}% of revenue

NET PROFIT: $${pl.net_profit.toLocaleString()} (${pl.net_margin_pct}% margin)

Generate 4 insights based on this data.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    await req.supabase
      .from('ai_insights')
      .insert({
        restaurant_id: req.restaurant.id,
        insights: parsed.insights,
      });

    res.json({ insights: parsed.insights });
  } catch (err) {
    console.error('WinProfit AI error:', err);
    res.status(500).json({ error: 'Failed to generate insights', details: err.message });
  }
});

module.exports = router;
