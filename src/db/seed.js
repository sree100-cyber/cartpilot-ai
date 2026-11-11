const { initDb, queryAll, run } = require('./database');

const PRODUCTS = [
  {
    name: 'Lavender Dream Candle',
    price: 14.99,
    stock: 25,
    description: 'Hand-poured soy candle with calming lavender essential oil, 8oz'
  },
  {
    name: 'Vanilla Bean Candle',
    price: 12.99,
    stock: 30,
    description: 'Warm vanilla scented soy candle, 6oz'
  },
  {
    name: 'Ocean Breeze Candle',
    price: 15.99,
    stock: 2,  // LOW STOCK for demo
    description: 'Fresh oceanic scented candle with sea salt notes, 8oz'
  },
  {
    name: 'Canvas Tote Bag',
    price: 24.99,
    stock: 15,
    description: 'Sturdy organic cotton tote bag, natural color, reusable'
  },
  {
    name: 'Citrus Bliss Soap Set',
    price: 18.99,
    stock: 0,  // OUT OF STOCK for demo
    description: 'Set of 3 handmade citrus soaps – lemon, orange, grapefruit'
  },
  {
    name: 'Herbal Honey Soap Bar',
    price: 8.99,
    stock: 40,
    description: 'Single handmade soap bar with honey and chamomile'
  }
];

async function seed() {
  await initDb();

  // Clear existing data
  run('DELETE FROM orders');
  run('DELETE FROM products');

  for (const p of PRODUCTS) {
    run(
      'INSERT INTO products (name, price, stock, description) VALUES (?, ?, ?, ?)',
      [p.name, p.price, p.stock, p.description]
    );
  }

  console.log(`✅ Seeded ${PRODUCTS.length} products:`);
  const all = queryAll('SELECT id, name, price, stock FROM products');
  console.table(all);
}

// Run directly
if (require.main === module) {
  seed().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed, PRODUCTS };
