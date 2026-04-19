const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// GET /api/pl?month=2026-04
router.get('/', authMiddleware, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const from  = `${month}-01`;
  const to    = new Date(month + '-01');
  to.setMonth(to.getMonth() + 1);
  to.setDate(0);
  const toStr = to.toISOString().slice(0, 10);

  // Fetch entries and expenses in parallel
  const [entriesRes, expensesRes] = await Promise.all([
    req.supabase
      .from('daily_entries')
      .select('*')
      .eq('restaurant_id', req.restaurant.id)
      .gte('date', from)
      .lte('date', toStr),
    req.supabase
      .from('expenses')
      .select('*')
      .eq('restaurant_id', req.restaurant.id)
      .gte('date', from)
      .lte('date', toStr),
  ]);

  if (entriesRes.error)  return res.status(500).json({ error: entriesRes.error.message });
  if (expensesRes.error) return res.status(500).json({ error: expensesRes.error.message });

  const entries  = entriesRes.data;
  const expenses = expensesRes.data;

  // Aggregate sales (values are stored in cents)
  const foodSales = entries.reduce((s, e) => s + e.food_sales, 0);
  const bevSales  = entries.reduce((s, e) => s + e.beverage_sales, 0);
  const totalRev  = foodSales + bevSales;
  const covers    = entries.reduce((s, e) => s + (e.covers || 0), 0);

  // Aggregate expenses by category
  const byCat = {};
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });

  const foodCost  = byCat.food_cost        || 0;
  const bevCost   = byCat.beverage_cost    || 0;
  const labor     = byCat.labor            || 0;
  const rent      = byCat.rent             || 0;
  const utilities = byCat.utilities        || 0;
  const marketing = byCat.marketing        || 0;
  const other     = (byCat.maintenance || 0) + (byCat.other || 0);
  const totalExp  = foodCost + bevCost + labor + rent + utilities + marketing + other;
  const netProfit = totalRev - totalExp;

  // Helper: safe divide, returns 0 if denominator is 0
  const pct = (n, d) => d > 0 ? parseFloat((n / d * 100).toFixed(1)) : 0;

  res.json({
    month,
    restaurant: req.restaurant,
    days_tracked: entries.length,
    // Revenue (convert cents → dollars for response)
    food_sales:      foodSales  / 100,
    beverage_sales:  bevSales   / 100,
    total_revenue:   totalRev   / 100,
    covers,
    avg_check: covers > 0 ? parseFloat((totalRev / covers / 100).toFixed(2)) : 0,
    // Expenses
    food_cost:   foodCost  / 100,
    bev_cost:    bevCost   / 100,
    labor:       labor     / 100,
    rent:        rent      / 100,
    utilities:   utilities / 100,
    marketing:   marketing / 100,
    other:       other     / 100,
    total_expenses: totalExp  / 100,
    net_profit:     netProfit / 100,
    // Ratios
    food_cost_pct:  pct(foodCost, foodSales),
    bev_cost_pct:   pct(bevCost,  bevSales),
    labor_pct:      pct(labor,    totalRev),
    prime_cost_pct: pct(foodCost + bevCost + labor, totalRev),
    net_margin_pct: pct(netProfit, totalRev),
    bev_mix_pct:    pct(bevSales,  totalRev),
    // Daily breakdown
    daily: entries.map(e => ({
      date:            e.date,
      food_sales:      e.food_sales    / 100,
      beverage_sales:  e.beverage_sales / 100,
      total:           (e.food_sales + e.beverage_sales) / 100,
      covers:          e.covers,
    })).sort((a, b) => a.date.localeCompare(b.date)),
  });
});

module.exports = router;
