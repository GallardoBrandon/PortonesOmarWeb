require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');
const db = require('./database');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Almacén de tokens activos (id -> { token, expiresAt })
const activeTokens = new Map();

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).send('Webhook no configurado');

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send('Firma inválida');
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    if (session.payment_status !== 'paid') return res.json({ received: true });

    let items = [];
    try { items = JSON.parse(session.metadata?.items || '[]'); } catch (error) { items = []; }
    const ticketNumber = `PO-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const shipping = session.shipping_details?.address || {};
    const address = session.metadata?.delivery_address || [
      session.shipping_details?.name,
      shipping.line1,
      shipping.line2,
      shipping.city,
      shipping.state,
      shipping.postal_code
    ].filter(Boolean).join(', ');

    db.addPaidOrder({
      ticketNumber,
      sessionId: session.id,
      eventId: event.id,
      userId: session.metadata?.user_id || null,
      name: session.metadata?.customer_name || session.shipping_details?.name || 'Cliente',
      email: session.customer_details?.email || session.customer_email || '',
      phone: session.metadata?.customer_phone || session.customer_details?.phone || '',
      address,
      items,
      total: (session.amount_total || 0) / 100
    }, error => {
      if (error) {
        console.error('Error guardando ticket pagado:', error.message);
        return res.status(500).send('No se pudo guardar el ticket');
      }
      res.json({ received: true });
    });
    return;
  }

  res.json({ received: true });
});

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

async function getSupabaseUser(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return response.json();
}

async function optionalCustomer(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    req.customerUser = header.startsWith('Bearer ') ? await getSupabaseUser(header.substring(7)) : null;
    next();
  } catch (error) {
    req.customerUser = null;
    next();
  }
}

function requireCustomer(req, res, next) {
  optionalCustomer(req, res, () => {
    if (!req.customerUser) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    next();
  });
}

app.post('/api/account/signup', async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return res.status(503).json({ error: 'Las cuentas de clientes no están configuradas.' });
  const { email, password, name } = req.body;
  if (!email || !password || !name || password.length < 8) return res.status(400).json({ error: 'Escribe nombre, correo y una contraseña de al menos 8 caracteres.' });
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, data: { name } }) });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.msg || data.message || 'No se pudo crear la cuenta.' });
    res.status(201).json({ user: data.user, session: data.access_token ? { access_token: data.access_token, refresh_token: data.refresh_token } : null, message: data.access_token ? null : 'Revisa tu correo para confirmar la cuenta.' });
  } catch (error) { res.status(502).json({ error: 'No se pudo conectar con el servicio de cuentas.' }); }
});

app.post('/api/account/login', async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return res.status(503).json({ error: 'Las cuentas de clientes no están configuradas.' });
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: req.body.email, password: req.body.password }) });
    const data = await response.json();
    if (!response.ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    res.json({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
  } catch (error) { res.status(502).json({ error: 'No se pudo conectar con el servicio de cuentas.' }); }
});

app.get('/api/account/me', requireCustomer, (req, res) => res.json({ user: req.customerUser }));
app.post('/api/account/logout', (req, res) => res.json({ success: true }));

app.get('/api/account/addresses', requireCustomer, (req, res) => {
  db.getAddresses(req.customerUser.id, (error, rows) => error ? res.status(500).json({ error: error.message }) : res.json(rows || []));
});

app.post('/api/account/addresses', requireCustomer, (req, res) => {
  const { label, recipient, phone, address, city, state, postalCode } = req.body;
  if (!label || !recipient || !phone || !address || !city || !state || !postalCode) return res.status(400).json({ error: 'Completa todos los datos de la dirección.' });
  db.addAddress(req.customerUser.id, { label, recipient, phone, address, city, state, postalCode }, (error, result) => error ? res.status(500).json({ error: error.message }) : res.status(201).json(result));
});

app.delete('/api/account/addresses/:id', requireCustomer, (req, res) => {
  db.deleteAddress(req.customerUser.id, req.params.id, error => error ? res.status(500).json({ error: error.message }) : res.json({ success: true }));
});

app.get('/api/account/orders', requireCustomer, (req, res) => {
  db.getCustomerOrders(req.customerUser.id, (error, rows) => error ? res.status(500).json({ error: error.message }) : res.json(rows || []));
});

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

app.post('/api/checkout/create', optionalCustomer, (req, res) => {
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
    const ticketItems = [];

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
      ticketItems.push({ id: product.id, name: product.name, quantity, variant: item.variant || null });
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
        delivery_address: `${customer.address}, ${customer.city}, C.P. ${customer.postalCode}`,
        items: JSON.stringify(ticketItems),
        user_id: req.customerUser?.id || ''
      },
      success_url: `${origin}/productos.html?pago=exitoso`,
      cancel_url: `${origin}/productos.html?pago=cancelado`
    }).then(session => res.json({ url: session.url }))
      .catch(error => res.status(502).json({ error: 'No se pudo iniciar el pago con tarjeta.' }));
  });
});

app.get('/api/orders', verifyToken, (req, res) => {
  const status = ['en_proceso', 'realizado'].includes(req.query.status) ? req.query.status : null;
  db.getOrders(status, (error, rows) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json(rows || []);
  });
});

app.put('/api/orders/:id/status', verifyToken, (req, res) => {
  const { status } = req.body;
  if (!['en_proceso', 'realizado'].includes(status)) {
    return res.status(400).json({ error: 'Estado de pedido inválido.' });
  }
  db.updateOrderStatus(req.params.id, status, error => {
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
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
