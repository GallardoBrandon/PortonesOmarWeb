require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Almacén de tokens activos (id -> { token, expiresAt })
const activeTokens = new Map();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Middleware para verificar token
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.substring(7);
  const tokenData = activeTokens.get(token);

  if (!tokenData || tokenData.expiresAt < Date.now()) {
    activeTokens.delete(token);
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  next();
}

// ===== RUTAS DE AUTENTICACIÓN =====
app.post('/api/auth', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Contraseña requerida' });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  // Generar token único
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 horas

  activeTokens.set(token, { expiresAt });

  res.json({ success: true, token, expiresAt });
});

// Logout - invalidar token
app.post('/api/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    activeTokens.delete(token);
  }

  res.json({ success: true });
});

// ===== RUTAS DE CLIENTES =====
app.post('/api/customers', (req, res) => {
  const { name, email, phone, message } = req.body;
  
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Campos requeridos: name, email, message' });
  }

  db.addCustomer(name, email, phone || '', message, (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(201).json({ success: true, id: result.id });
    }
  });
});

app.get('/api/customers', verifyToken, (req, res) => {
  db.getCustomers((err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows || []);
    }
  });
});

// ===== RUTAS DE PRODUCTOS =====
app.get('/api/products', (req, res) => {
  const featuredOnly = req.query.featured === '1' || req.query.featured === 'true';
  db.getProducts(featuredOnly, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows || []);
    }
  });
});

app.put('/api/products/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const { name, price, description, imageData, variants, featured } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Campos requeridos: name, price' });
  }

  db.updateProduct(id, name, price, description || '', imageData || null, null, null, variants || null, featured, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true });
    }
  });
});

app.post('/api/products', verifyToken, (req, res) => {
  const { name, price, description, imageData, variants, featured } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Campos requeridos: name, price' });
  }

  db.addProduct(name, price, description || '', imageData || null, null, null, variants || null, featured, (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(201).json({ success: true, id: result.id });
    }
  });
});

app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;

  db.getProductImage(id, (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Producto no encontrado' });
    } else {
      res.json({ imageData: row.image_data });
    }
  });
});

// ===== RUTAS DE IMÁGENES =====
app.post('/api/images', verifyToken, (req, res) => {
  const { title, imageData } = req.body;

  if (!title || !imageData) {
    return res.status(400).json({ error: 'Campos requeridos: title, imageData' });
  }

  db.addImage(title, imageData, (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(201).json({ success: true, id: result.id });
    }
  });
});

app.get('/api/images', (req, res) => {
  db.getImages((err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows || []);
    }
  });
});

app.get('/api/images/:id', (req, res) => {
  const { id } = req.params;

  db.getImageData(id, (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Imagen no encontrada' });
    } else {
      res.json({ imageData: row.image_data });
    }
  });
});

app.delete('/api/images/:id', verifyToken, (req, res) => {
  const { id } = req.params;

  db.deleteImage(id, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true });
    }
  });
});

// Ruta raíz para servir el HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor después de inicializar la base de datos.
db.ready.then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════╗
║  Servidor ejecutándose en:          ║
║  http://localhost:${PORT}            ║
╚══════════════════════════════════════╝
  `);
  });
}).catch(error => {
  console.error('No fue posible inicializar la base de datos:', error.message);
  process.exit(1);
});
