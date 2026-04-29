const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// GET /api/subscriptions/status
router.get('/status', authMiddleware, async (req, res) => {
  const { data: sub } = await req.supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (!sub) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30);
    const { data: newSub } = await req.supabase
      .from('subscriptions')
      .insert({
        user_id: req.user.id,
        restaurant_id: req.restaurant.id,
        plan: 'trial',
        status: 'active',
        trial_ends_at: trialEnds.toISOString(),
      })
      .select()
      .single();
    return res.json(newSub);
  }

  if (sub.plan === 'trial' && new Date(sub.trial_ends_at) < new Date()) {
    await req.supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('id', sub.id);
    sub.status = 'expired';
  }

  res.json(sub);
});

// GET /api/subscriptions/checkout-url
router.get('/checkout-url', authMiddleware, async (req, res) => {
  const { plan } = req.query;
  if (plan === 'monthly') {
    return res.json({ url: process.env.LEMONSQUEEZY_MONTHLY_URL });
  }
  if (plan === 'yearly') {
    return res.json({ url: process.env.LEMONSQUEEZY_YEARLY_URL });
  }
  res.status(400).json({ error: 'Invalid plan' });
});

module.exports = router;