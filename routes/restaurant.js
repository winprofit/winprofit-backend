const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  res.json(req.restaurant);
});

router.put('/', authMiddleware, async (req, res) => {
  const { name, currency, weekly_revenue_target, food_cost_alert_pct, language } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await req.supabase
    .from('restaurants')
    .update({
      name,
      currency: currency || 'USD',
      weekly_revenue_target: parseInt(weekly_revenue_target) || 0,
      food_cost_alert_pct: parseFloat(food_cost_alert_pct) || 35,
      language: language || 'en',
    })
    .eq('id', req.restaurant.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
