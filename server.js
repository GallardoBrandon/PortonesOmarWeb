require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

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

app.post('/api/checkout/create', (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'El pago con tarjeta todavía no está configurado.' });
  }

  const { items, customer } = req.body;
  if (!Array.isArray(items) || items.length === 0 || !customer || !customer.name || !customer.email || !customer.phone || !customer.address || !customer.city || !customer.postalCode) {
    return res.status(400).json({ error: 'Completa nombre, correo, teléfono, dirección, ciudad y código postal.' });
  }

  db.getProducts((productError, products) => {
    if (productError) return res.status(500).json({ error: productError.message });
    const productMap = new Map((products || []).map(product => [String(product.id), product]));
    const lineItems = [];

    for (const item of items) {
      const product = productMap.get(String(item.id));
      const quantity = Number(item.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ error: 'Hay un producto o cantidad inválida en el carrito.' });
      }
      lineItems.push({
        price_data: {
          currency: 'mxn',
          product_data: { name: product.name + (item.variant ? ` (${item.variant})` : '') },
          unit_amount: Math.round(Number(product.price) * 100)
        },
        quantity
      });
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: customer.email,
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ['MX'] },
      metadata: {
        customer_name: customer.name,
        customer_phone: customer.phone,
        delivery_address: `${customer.address}, ${customer.city}, ${customer.postalCode}`
      },
      success_url: `${origin}/productos.html?pago=exitoso`,
      cancel_url: `${origin}/productos.html?pago=cancelado`
    }).then(session => res.json({ url: session.url }))
      .catch(error => res.status(502).json({ error: 'No se pudo iniciar el pago con tarjeta.' }));
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
