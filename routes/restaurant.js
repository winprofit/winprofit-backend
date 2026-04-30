const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// GET /api/restaurant
router.get('/', authMiddleware, async (req, res) => {
  res.json(req.restaurant);
});

// PUT /api/restaurant
router.put('/', authMiddleware, async (req, res) => {
  const { name, currency } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await req.supabase
    .from('restaurants')
    .update({ name, currency: currency || 'USD' })
    .eq('id', req.restaurant.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
