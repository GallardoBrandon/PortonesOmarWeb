const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.db');
const DATABASE_URL = process.env.DATABASE_URL;
const ContraseñaBD = 'HF1lL61a5TdPc9rh';

if (DATABASE_URL) {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const ready = initializePostgres(pool);

  function query(sql, params, callback) {
    pool.query(sql, params)
      .then(result => callback(null, result))
      .catch(error => callback(error));
  }

  function initializePostgres(pool) {
    return pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC NOT NULL,
        description TEXT,
        image_data TEXT,
        image_side TEXT,
        image_top TEXT,
        variants TEXT,
        featured INTEGER DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS images (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        image_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).then(() => pool.query(`
      INSERT INTO products (name, price, description, featured)
      SELECT product.name, product.price, product.description, 1
      FROM (VALUES
        ('Motor para portón', 250.00, 'Motor automático con control remoto y garantía.'),
        ('Bisagras reforzadas', 45.00, 'Juego de bisagras para portones pesados.'),
        ('Panel metálico', 120.00, 'Paneles cortados a medida para portones.')
      ) AS product(name, price, description)
      WHERE NOT EXISTS (SELECT 1 FROM products);
    `)).then(() => pool.query(`
      INSERT INTO products (name, price, description, featured, variants)
      SELECT 'Llantas para portón', 60.00, 'Llantas/rodillos para portón corredizo.', 1, 'Larga,Corta'
      WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Llantas para portón');
    `)).then(() => pool.query(`
      UPDATE products
      SET variants = '1,2,3,4,5,6'
      WHERE name ILIKE '%isagras%' AND (variants IS NULL OR variants = '');
    `)).then(() => {
      console.log('Conectado a PostgreSQL/Supabase');
    });
  }

  function addCustomer(name, email, phone, message, callback) {
    query(
      'INSERT INTO customers (name, email, phone, message) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, phone, message],
      (err, result) => callback(err, result ? { id: result.rows[0].id } : null)
    );
  }

  function getCustomers(callback) {
    query('SELECT * FROM customers ORDER BY created_at DESC', [], (err, result) => callback(err, result ? result.rows : null));
  }

  function getProducts(featuredOnly, callback) {
    if (typeof featuredOnly === 'function') {
      callback = featuredOnly;
      featuredOnly = false;
    }
    const sql = featuredOnly
      ? 'SELECT * FROM products WHERE featured = 1 ORDER BY id'
      : 'SELECT * FROM products ORDER BY id';
    query(sql, [], (err, result) => callback(err, result ? result.rows : null));
  }

  function updateProduct(id, name, price, description, imageData, imageSide, imageTop, variants, featured, callback) {
    const params = [name, price, description];
    let sql = 'UPDATE products SET name = $1, price = $2, description = $3';
    if (imageData) { sql += `, image_data = $${params.length + 1}`; params.push(imageData); }
    if (imageSide) { sql += `, image_side = $${params.length + 1}`; params.push(imageSide); }
    if (imageTop) { sql += `, image_top = $${params.length + 1}`; params.push(imageTop); }
    sql += `, variants = $${params.length + 1}`; params.push(variants || null);
    sql += `, featured = $${params.length + 1}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length + 2}`;
    params.push(featured ? 1 : 0, id);
    query(sql, params, err => callback(err));
  }

  function addProduct(name, price, description, imageData, imageSide, imageTop, variants, featured, callback) {
    query(
      'INSERT INTO products (name, price, description, image_data, image_side, image_top, variants, featured) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [name, price, description || '', imageData || null, imageSide || null, imageTop || null, variants || null, featured ? 1 : 0],
      (err, result) => callback(err, result ? { id: result.rows[0].id } : null)
    );
  }

  function getProductImage(id, callback) {
    query('SELECT image_data FROM products WHERE id = $1', [id], (err, result) => callback(err, result ? result.rows[0] : null));
  }

  function addImage(title, imageData, callback) {
    query(
      'INSERT INTO images (title, image_data) VALUES ($1, $2) RETURNING id',
      [title, imageData],
      (err, result) => callback(err, result ? { id: result.rows[0].id } : null)
    );
  }

  function getImages(callback) {
    query('SELECT id, title, created_at FROM images ORDER BY created_at DESC', [], (err, result) => callback(err, result ? result.rows : null));
  }

  function getImageData(id, callback) {
    query('SELECT image_data FROM images WHERE id = $1', [id], (err, result) => callback(err, result ? result.rows[0] : null));
  }

  function deleteImage(id, callback) {
    query('DELETE FROM images WHERE id = $1', [id], err => callback(err));
  }

  module.exports = {
    db: pool,
    ready,
    addCustomer,
    getCustomers,
    getProducts,
    updateProduct,
    addProduct,
    getProductImage,
    addImage,
    getImages,
    getImageData,
    deleteImage
  };
  return;
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
  } else {
    console.log('Conectado a SQLite en:', DB_PATH);
    // Forzar ejecución en orden estricto (FIFO) para toda la vida de la conexión.
    // Esto evita condiciones de carrera donde una consulta (p.ej. de una request HTTP
    // entrante) se ejecuta antes de que terminen las migraciones de esquema (ALTER TABLE).
    db.serialize();
    initDatabase();
  }
});

function initDatabase() {
  // Tabla de clientes
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de productos/precios
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      image_data LONGTEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de imágenes
  db.run(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image_data LONGTEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migración: agregar columna 'image_data' si falta (bases de datos antiguas)
  db.run('ALTER TABLE products ADD COLUMN image_data LONGTEXT', () => {});

  // Migración: fotos adicionales (lateral y superior) para el visor 3D
  db.run('ALTER TABLE products ADD COLUMN image_side LONGTEXT', () => {});
  db.run('ALTER TABLE products ADD COLUMN image_top LONGTEXT', () => {});

  // Migración: 'variants' guarda opciones del producto separadas por coma
  // (ej. números de bisagra "1,2,3,4,5,6" o tamaños "Larga,Corta")
  db.run('ALTER TABLE products ADD COLUMN variants TEXT', () => {
    // Rellenar variantes para bisagras existentes que no tengan ninguna
    db.run(
      "UPDATE products SET variants = '1,2,3,4,5,6' WHERE name LIKE '%isagras%' AND (variants IS NULL OR variants = '')"
    );

    // Agregar "Llantas para portón" si todavía no existe
    db.get('SELECT id FROM products WHERE name = ?', ['Llantas para portón'], (err, row) => {
      if (!err && !row) {
        db.run(
          'INSERT INTO products (name, price, description, featured, variants) VALUES (?, ?, ?, 1, ?)',
          ['Llantas para portón', 60.00, 'Llantas/rodillos para portón corredizo.', 'Larga,Corta']
        );
        console.log('Producto "Llantas para portón" insertado');
      }
    });
  });

  // Migración: agregar columna 'featured' (destacado / se muestra en inicio) si no existe
  db.run('ALTER TABLE products ADD COLUMN featured INTEGER DEFAULT 1', (err) => {
    if (!err) {
      // Columna recién creada: marcar productos existentes como destacados por defecto
      db.run('UPDATE products SET featured = 1');
      console.log('Migración: columna featured agregada a products');
    }

    // Insertar productos por defecto si no existen
    db.all('SELECT COUNT(*) as count FROM products', (err2, rows) => {
      if (!err2 && rows[0].count === 0) {
        const defaultProducts = [
          { name: 'Motor para portón', price: 250.00, description: 'Motor automático con control remoto y garantía.' },
          { name: 'Bisagras reforzadas', price: 45.00, description: 'Juego de bisagras para portones pesados.' },
          { name: 'Panel metálico', price: 120.00, description: 'Paneles cortados a medida para portones.' }
        ];

        defaultProducts.forEach(product => {
          db.run(
            'INSERT INTO products (name, price, description, featured) VALUES (?, ?, ?, 1)',
            [product.name, product.price, product.description]
          );
        });
        console.log('Productos por defecto insertados');
      }
    });
  });
}

// Funciones para clientes
function addCustomer(name, email, phone, message, callback) {
  db.run(
    'INSERT INTO customers (name, email, phone, message) VALUES (?, ?, ?, ?)',
    [name, email, phone, message],
    function(err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, { id: this.lastID });
      }
    }
  );
}

function getCustomers(callback) {
  db.all('SELECT * FROM customers ORDER BY created_at DESC', callback);
}

// Funciones para productos
function getProducts(featuredOnly, callback) {
  if (typeof featuredOnly === 'function') {
    callback = featuredOnly;
    featuredOnly = false;
  }
  const sql = featuredOnly
    ? 'SELECT * FROM products WHERE featured = 1 ORDER BY id'
    : 'SELECT * FROM products ORDER BY id';
  db.all(sql, callback);
}

function updateProduct(id, name, price, description, imageData, imageSide, imageTop, variants, featured, callback) {
  const params = [name, price, description];
  let sql = 'UPDATE products SET name = ?, price = ?, description = ?';
  if (imageData) { sql += ', image_data = ?'; params.push(imageData); }
  if (imageSide) { sql += ', image_side = ?'; params.push(imageSide); }
  if (imageTop) { sql += ', image_top = ?'; params.push(imageTop); }
  sql += ', variants = ?'; params.push(variants || null);
  sql += ', featured = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
  params.push(featured ? 1 : 0, id);
  db.run(sql, params, callback);
}

function addProduct(name, price, description, imageData, imageSide, imageTop, variants, featured, callback) {
  db.run(
    'INSERT INTO products (name, price, description, image_data, image_side, image_top, variants, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, price, description || '', imageData || null, imageSide || null, imageTop || null, variants || null, featured ? 1 : 0],
    function(err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, { id: this.lastID });
      }
    }
  );
}

function getProductImage(id, callback) {
  db.get('SELECT image_data FROM products WHERE id = ?', [id], callback);
}

// Funciones para imágenes
function addImage(title, imageData, callback) {
  db.run(
    'INSERT INTO images (title, image_data) VALUES (?, ?)',
    [title, imageData],
    function(err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, { id: this.lastID });
      }
    }
  );
}

function getImages(callback) {
  db.all('SELECT id, title, created_at FROM images ORDER BY created_at DESC', callback);
}

function getImageData(id, callback) {
  db.get('SELECT image_data FROM images WHERE id = ?', [id], callback);
}

function deleteImage(id, callback) {
  db.run('DELETE FROM images WHERE id = ?', [id], callback);
}

module.exports = {
  db,
  ready: Promise.resolve(),
  addCustomer,
  getCustomers,
  getProducts,
  updateProduct,
  addProduct,
  getProductImage,
  addImage,
  getImages,
  getImageData,
  deleteImage
};
