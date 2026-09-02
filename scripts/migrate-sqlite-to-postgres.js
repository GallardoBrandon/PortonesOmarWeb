require('dotenv').config();

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const sqlitePath = process.env.DB_PATH || path.join(__dirname, '..', 'database.db');

if (!databaseUrl) {
  console.error('Define DATABASE_URL con la URI de PostgreSQL de Supabase antes de ejecutar la migración.');
  process.exit(1);
}

const sqlite = new sqlite3.Database(sqlitePath);
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

function getRows(sql) {
  return new Promise((resolve, reject) => {
    sqlite.all(sql, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
      message TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, price NUMERIC NOT NULL, description TEXT,
      image_data TEXT, image_side TEXT, image_top TEXT, variants TEXT, featured INTEGER DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS images (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, image_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const [customers, products, images] = await Promise.all([
    getRows('SELECT * FROM customers'),
    getRows('SELECT * FROM products'),
    getRows('SELECT * FROM images')
  ]);

  for (const customer of customers) {
    await pool.query(
      'INSERT INTO customers (id, name, email, phone, message, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
      [customer.id, customer.name, customer.email, customer.phone, customer.message, customer.created_at]
    );
  }

  for (const product of products) {
    await pool.query(
      'INSERT INTO products (id, name, price, description, image_data, image_side, image_top, variants, featured, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING',
      [product.id, product.name, product.price, product.description, product.image_data, product.image_side, product.image_top, product.variants, product.featured ?? 1, product.updated_at]
    );
  }

  for (const image of images) {
    await pool.query(
      'INSERT INTO images (id, title, image_data, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [image.id, image.title, image.image_data, image.created_at]
    );
  }

  for (const table of ['customers', 'products', 'images']) {
    await pool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table}`);
  }

  console.log(`Migración terminada: ${customers.length} clientes, ${products.length} productos y ${images.length} imágenes.`);
}

migrate()
  .catch(error => {
    console.error('Error durante la migración:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await pool.end();
  });