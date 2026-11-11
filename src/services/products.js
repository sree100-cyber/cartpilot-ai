/**
 * Product queries with fuzzy matching
 */
const { queryAll, queryOne, run } = require('../db/database');

function getAllProducts() {
  return queryAll('SELECT * FROM products');
}

function getProductById(id) {
  return queryOne('SELECT * FROM products WHERE id = ?', [id]);
}

/**
 * Fuzzy match a product name. Returns best match or null.
 */
function findProduct(query) {
  const products = getAllProducts();
  const q = query.toLowerCase().trim();

  // 1. Exact match
  let match = products.find(p => p.name.toLowerCase() === q);
  if (match) return match;

  // 2. Substring match
  const subMatches = products.filter(p => p.name.toLowerCase().includes(q));
  if (subMatches.length === 1) return subMatches[0];

  // 3. Reverse substring
  const revMatches = products.filter(p => q.includes(p.name.toLowerCase()));
  if (revMatches.length === 1) return revMatches[0];

  // 4. Word overlap scoring
  const queryWords = q.split(/\s+/).filter(w => w.length > 2);
  let bestScore = 0;
  let bestMatch = null;
  const candidates = [];

  for (const p of products) {
    const nameWords = p.name.toLowerCase().split(/\s+/);
    const descWords = (p.description || '').toLowerCase().split(/\s+/);
    const allWords = [...nameWords, ...descWords];

    let score = 0;
    for (const qw of queryWords) {
      for (const pw of allWords) {
        if (pw.includes(qw) || qw.includes(pw)) {
          score += pw === qw ? 3 : 1;
        }
      }
    }

    if (score > 0) candidates.push({ product: p, score });
    if (score > bestScore) {
      bestScore = score;
      bestMatch = p;
    }
  }

  // If ambiguous (multiple close matches), signal it
  if (candidates.length > 1) {
    const sorted = candidates.sort((a, b) => b.score - a.score);
    if (sorted[0].score === sorted[1].score) {
      return { ambiguous: true, matches: sorted.map(c => c.product) };
    }
  }

  return bestScore >= 1 ? bestMatch : null;
}

function searchProducts(query) {
  const products = getAllProducts();
  const q = query.toLowerCase().trim();
  return products.filter(p => {
    const text = `${p.name} ${p.description || ''}`.toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length > 1);
    return words.some(w => text.includes(w));
  });
}

function decrementStock(productId, quantity) {
  const result = run(
    'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
    [quantity, productId, quantity]
  );
  return result.changes > 0;
}

function restoreStock(productId, quantity) {
  run('UPDATE products SET stock = stock + ? WHERE id = ?', [quantity, productId]);
}

module.exports = {
  getAllProducts,
  getProductById,
  findProduct,
  searchProducts,
  decrementStock,
  restoreStock,
};
