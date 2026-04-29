const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const { data, error } = await req.supabase
    .from('inventory_counts')
    .select('*')
    .eq('restaurant_id', req.restaurant.id)
    .eq('month', month);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', authMiddleware, async (req, res) => {
  const {
    month, type,
    meat_seafood, produce, dairy_eggs, dry_goods,
    beverages_coffee, beverages_soft_drinks, beverages_alcohol, other
  } = req.body;
  if (!month || !type) return res.status(400).json({ error: 'month and type are required' });

  const { data, error } = await req.supabase
    .from('inventory_counts')
    .upsert({
      restaurant_id:       req.restaurant.id,
      month,
      type,
      meat_seafood:          Math.round((meat_seafood          || 0) * 100),
      produce:               Math.round((produce               || 0) * 100),
      dairy_eggs:            Math.round((dairy_eggs            || 0) * 100),
      dry_goods:             Math.round((dry_goods             || 0) * 100),
      beverages_coffee:      Math.round((beverages_coffee      || 0) * 100),
      beverages_soft_drinks: Math.round((beverages_soft_drinks || 0) * 100),
      beverages_alcohol:     Math.round((beverages_alcohol     || 0) * 100),
      other:                 Math.round((other                 || 0) * 100),
    }, { onConflict: 'restaurant_id,month,type' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;