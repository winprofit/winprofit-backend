const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: 'Bearer ' + token } } }
  );
  req.user = user;

  const { data: restaurants } = await req.supabase
    .from('restaurants')
    .select('*')
    .eq('user_id', user.id)
    .limit(1);

  if (restaurants && restaurants.length > 0) {
    req.restaurant = restaurants[0];
  } else {
    const { data: newRestaurant } = await req.supabase
      .from('restaurants')
      .insert({ user_id: user.id, name: 'My Restaurant' })
      .select()
      .single();
    req.restaurant = newRestaurant;
  }

  next();
}

module.exports = { authMiddleware, supabase };
