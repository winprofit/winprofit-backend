const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { authMiddleware } = require('../middleware/auth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
  yearly:  process.env.STRIPE_YEARLY_PRICE_ID,
};

// GET /api/subscriptions/status
router.get('/status', authMiddleware, async (req, res) => {
  const { data: sub } = await req.supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (!sub) {
    // Auto-create trial for new users
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

  // Check if trial expired
  if (sub.plan === 'trial' && new Date(sub.trial_ends_at) < new Date()) {
    await req.supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('id', sub.id);
    sub.status = 'expired';
  }

  res.json(sub);
});

// POST /api/subscriptions/checkout
router.post('/checkout', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  if (!PRICES[plan]) return res.status(400).json({ error: 'Invalid plan' });

  // Get or create Stripe customer
  let customerId;
  const { data: sub } = await req.supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', req.user.id)
    .single();

  if (sub?.stripe_customer_id) {
    customerId = sub.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email: req.user.email,
      metadata: { user_id: req.user.id }
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: PRICES[plan], quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/pricing`,
    metadata: { user_id: req.user.id, plan }
  });

  res.json({ url: session.url });
});

// POST /api/subscriptions/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.user_id;
    const plan = session.metadata.plan;

    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const periodEnd = new Date(subscription.current_period_end * 1000);

    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    await supabaseAdmin
      .from('subscriptions')
      .update({
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        plan,
        status: 'active',
        current_period_ends_at: periodEnd.toISOString(),
      })
      .eq('user_id', userId);
  }

  res.json({ received: true });
});

module.exports = router;