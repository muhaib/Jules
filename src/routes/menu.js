const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, scopeTenant } = require('../auth');

const router = express.Router();
router.use(requireAuth, scopeTenant);

const canManage = requireRole('super_admin', 'owner', 'manager');

router.get('/categories', (req, res) => {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? ORDER BY sort_order, name')
    .all(req.restaurantId);
  res.json({ categories });
});

router.post('/categories', canManage, (req, res) => {
  const { name, sort_order } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare('INSERT INTO menu_categories (restaurant_id, name, sort_order) VALUES (?, ?, ?)')
    .run(req.restaurantId, name, sort_order || 0);
  res.status(201).json({ category: db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/categories/:id', canManage, (req, res) => {
  const category = db
    .prepare('SELECT * FROM menu_categories WHERE id = ? AND restaurant_id = ?')
    .get(req.params.id, req.restaurantId);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const name = req.body.name ?? category.name;
  const sortOrder = req.body.sort_order ?? category.sort_order;
  db.prepare('UPDATE menu_categories SET name = ?, sort_order = ? WHERE id = ?').run(name, sortOrder, category.id);
  res.json({ category: db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(category.id) });
});

router.delete('/categories/:id', canManage, (req, res) => {
  const info = db.prepare('DELETE FROM menu_categories WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.restaurantId);
  if (!info.changes) return res.status(404).json({ error: 'Category not found' });
  res.status(204).end();
});

router.get('/items', (req, res) => {
  const items = db
    .prepare('SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY category_id, name')
    .all(req.restaurantId);
  res.json({ items });
});

router.post('/items', canManage, (req, res) => {
  const { category_id, name, description, price, tax_rate, is_available, image_url } = req.body || {};
  if (!name || price === undefined) return res.status(400).json({ error: 'name and price are required' });

  const info = db
    .prepare(
      `INSERT INTO menu_items (restaurant_id, category_id, name, description, price, tax_rate, is_available, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.restaurantId,
      category_id || null,
      name,
      description || null,
      price,
      tax_rate || 0,
      is_available === false ? 0 : 1,
      image_url || null
    );
  res.status(201).json({ item: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/items/:id', canManage, (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?').get(req.params.id, req.restaurantId);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });

  const merged = { ...item, ...req.body };
  db.prepare(
    `UPDATE menu_items SET category_id = ?, name = ?, description = ?, price = ?, tax_rate = ?, is_available = ?, image_url = ?
     WHERE id = ?`
  ).run(
    merged.category_id || null,
    merged.name,
    merged.description || null,
    merged.price,
    merged.tax_rate || 0,
    merged.is_available ? 1 : 0,
    merged.image_url || null,
    item.id
  );
  res.json({ item: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.id) });
});

router.delete('/items/:id', canManage, (req, res) => {
  const info = db.prepare('DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.restaurantId);
  if (!info.changes) return res.status(404).json({ error: 'Menu item not found' });
  res.status(204).end();
});

module.exports = router;
