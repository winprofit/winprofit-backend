const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  let query = req.supabase
    .from('expenses')
    .select('*')
    .eq('restaurant_id', req.restaurant.id)
    .order('date', { ascending: false });
  if (from) query = query.gte('date', from);
  if (to)   query = query.lte('date', to);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', authMiddleware, async (req, res) => {
  const { date, category, amount, description } = req.body;
  if (!date || !category || !amount) {
    return res.status(400).json({ error: 'date, category and amount are required' });
  }
  const { data, error } = await req.supabase
    .from('expenses')
    .insert({
      restaurant_id: req.restaurant.id,
      date,
      category,
      amount:      Math.round(amount * 100),
      description: description || null,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const { error } = await req.supabase
    .from('expenses')
    .delete()
    .eq('id', req.params.id)
    .eq('restaurant_id', req.restaurant.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
