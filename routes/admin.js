const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Admin auth middleware
function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Create admin Supabase client with service role key
function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// GET /api/admin/dashboard
router.get('/dashboard', adminAuth, async (req, res) => {
  const supabase = getAdminClient();

  // Get all restaurants
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false });

  // Get all subscriptions
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*');

  // Get all users from auth
  const { data: { users } } = await supabase.auth.admin.listUsers();

  // Get current month P&L for each restaurant
  const month = new Date().toISOString().slice(0, 7);
  const from = `${month}-01`;
  const to = new Date(month + '-01');
  to.setMonth(to.getMonth() + 1);
  to.setDate(0);
  const toStr = to.toISOString().slice(0, 10);

  const restaurantData = await Promise.all(restaurants.map(async (restaurant) => {
    const [entriesRes, expensesRes] = await Promise.all([
      supabase.from('daily_entries').select('*').eq('restaurant_id', restaurant.id).gte('date', from).lte('date', toStr),
      supabase.from('expenses').select('*').eq('restaurant_id', restaurant.id).gte('date', from).lte('date', toStr),
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
      name: restaurant.name,
      email: user ? user.email : 'unknown',
      created_at: restaurant.created_at,
      subscription: sub ? {
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

  // Calculate MRR
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
  });
});

module.exports = router;