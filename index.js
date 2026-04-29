if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: '*'
}));
app.use(express.json());

app.use('/api/entries',  require('./routes/entries'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/pl',       require('./routes/pl'));
app.use('/api/insights', require('./routes/insights'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/subscriptions', require('./routes/subscriptions'));

app.get('/health', (req, res) => res.json({ status: 'ok', app: 'WinProfit API' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`WinProfit API running on port ${PORT}`));
