const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// GET /api/entries?from=2026-04-01&to=2026-04-30
router.get('/', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  let query = req.supabase
    .from('daily_entries')
    .select('*')
    .eq('restaurant_id', req.restaurant.id)
    .order('date', { ascending: false });

  if (from) query = query.gte('date', from);
  if (to)   query = query.lte('date', to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/entries — create or update (upsert by date)
router.post('/', authMiddleware, async (req, res) => {
  const { date, food_sales, beverage_sales, covers, notes } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const { data, error } = await req.supabase
    .from('daily_entries')
    .upsert({
      restaurant_id: req.restaurant.id,
      date,
      food_sales:      Math.round((food_sales      || 0) * 100), // store as cents
      beverage_sales:  Math.round((beverage_sales  || 0) * 100),
      covers:          covers || 0,
      notes:           notes || null,
    }, { onConflict: 'restaurant_id,date' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/entries/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const { error } = await req.supabase
    .from('daily_entries')
    .delete()
    .eq('id', req.params.id)
    .eq('restaurant_id', req.restaurant.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
