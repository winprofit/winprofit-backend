const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

router.get('/dashboard', adminAuth, async (req, res) => {
  const supabase = getAdminClient();
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;

  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*');

  const { data: { users } } = await supabase.auth.admin.listUsers();

  const restaurantData = await Promise.all(restaurants.map(async (restaurant) => {
    const [entriesRes, expensesRes] = await Promise.all([
      supabase.from('daily_entries').select('*').eq('restaurant_id', restaurant.id).gte('date', from).lte('date', to),
      supabase.from('expenses').select('*').eq('restaurant_id', restaurant.id).gte('date', from).lte('date', to),
    ]);

    const entries = entriesRes.data || [];
    const expenses = expensesRes.data || [];
    const foodSales = entries.reduce((s, e) => s + e.food_sales, 0);
    const bevSales = entries.reduce((s, e) => s + e.beverage_sales, 0);
    const totalRev = foodSales + bevSales;
    const byCat = {};
    expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    const foodCost = byCat.food_cost || 0;
    const labor = byCat.labor || 0;
    const totalExp = Object.values(byCat).reduce((s, v) => s + v, 0);
    const netProfit = totalRev - totalExp;

    const sub = subscriptions.find(s => s.restaurant_id === restaurant.id);
    const user = users.find(u => u.id === restaurant.user_id);
    const daysLeft = sub && sub.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
      : null;

    return {
      id: restaurant.id,
      user_id: restaurant.user_id,
      name: restaurant.name,
      email: user ? user.email : 'unknown',
      created_at: restaurant.created_at,
      subscription: sub ? {
        id: sub.id,
        plan: sub.plan,
        status: sub.status,
        days_left: daysLeft,
        trial_ends_at: sub.trial_ends_at,
      } : null,
      metrics: {
        total_revenue: totalRev / 100,
        food_cost_pct: totalRev > 0 ? parseFloat((foodCost / foodSales * 100).toFixed(1)) : 0,
        labor_pct: totalRev > 0 ? parseFloat((labor / totalRev * 100).toFixed(1)) : 0,
        net_margin_pct: totalRev > 0 ? parseFloat((netProfit / totalRev * 100).toFixed(1)) : 0,
        days_tracked: entries.length,
      }
    };
  }));

  const paidMonthly = subscriptions.filter(s => s.plan === 'monthly' && s.status === 'active').length;
  const paidYearly = subscriptions.filter(s => s.plan === 'yearly' && s.status === 'active').length;
  const trialUsers = subscriptions.filter(s => s.plan === 'trial' && s.status === 'active').length;
  const expiredUsers = subscriptions.filter(s => s.status === 'expired').length;
  const mrr = (paidMonthly * 9) + (paidYearly * 79 / 12);

  res.json({
    summary: {
      total_users: restaurants.length,
      trial_users: trialUsers,
      paid_users: paidMonthly + paidYearly,
      expired_users: expiredUsers,
      mrr: parseFloat(mrr.toFixed(2)),
    },
    restaurants: restaurantData,
    month,
  });
});

// POST /api/admin/extend-trial
router.post('/extend-trial', adminAuth, async (req, res) => {
  const { subscription_id, days } = req.body;
  if (!subscription_id || !days) return res.status(400).json({ error: 'subscription_id and days required' });

  const supabase = getAdminClient();

  // Get current subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscription_id)
    .single();

  if (!sub) return res.status(404).json({ error: 'Subscription not found' });

  // Calculate new trial end date
  const base = sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date()
    ? new Date(sub.trial_ends_at)
    : new Date();
  base.setDate(base.getDate() + parseInt(days));

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      trial_ends_at: base.toISOString(),
      plan: 'trial',
      status: 'active',
    })
    .eq('id', subscription_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, new_trial_ends_at: data.trial_ends_at });
});

// POST /api/admin/grant-free
router.post('/grant-free', adminAuth, async (req, res) => {
  const { subscription_id } = req.body;
  if (!subscription_id) return res.status(400).json({ error: 'subscription_id required' });

  const supabase = getAdminClient();

  // Set trial end 10 years from now = effectively free forever
  const freeUntil = new Date();
  freeUntil.setFullYear(freeUntil.getFullYear() + 10);

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      trial_ends_at: freeUntil.toISOString(),
      plan: 'trial',
      status: 'active',
    })
    .eq('id', subscription_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: 'Free access granted for 10 years' });
});

// POST /api/admin/revoke-access
router.post('/revoke-access', adminAuth, async (req, res) => {
  const { subscription_id } = req.body;
  if (!subscription_id) return res.status(400).json({ error: 'subscription_id required' });

  const supabase = getAdminClient();

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('id', subscription_id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
