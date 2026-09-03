// Script para manejar API REST, admin panel e imágenes
const API_URL = '/api';
const CUSTOMER_TOKEN_KEY = 'customer_access_token';

function getCustomerToken() { return localStorage.getItem(CUSTOMER_TOKEN_KEY); }
function setCustomerToken(token) { localStorage.setItem(CUSTOMER_TOKEN_KEY, token); }
function clearCustomerToken() { localStorage.removeItem(CUSTOMER_TOKEN_KEY); }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

// Registrar el service worker para que el sitio se pueda instalar como PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=5').catch((err) => console.error('Error registrando service worker:', err));
  });
}

// Captura el evento de instalación de PWA (Chrome/Edge/Android) para poder
// disparar el prompt nativo desde nuestro propio botón "Instalar ahora"
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installNowBtn');
  if (btn) btn.style.display = 'inline-block';
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const msg = document.getElementById('installStatusMsg');
  if (msg) msg.textContent = '✅ ¡App instalada correctamente!';
});

// Página instalar.html: conecta el botón con el prompt nativo o muestra aviso
function initInstallPage() {
  const btn = document.getElementById('installNowBtn');
  if (!btn) return;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const msg = document.getElementById('installStatusMsg');
  if (isStandalone) {
    if (msg) msg.textContent = 'Ya tienes la app instalada en este dispositivo.';
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isDesktop = !/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  if (isIOS && msg) {
    msg.textContent = 'En Safari: toca Compartir y después "Agregar a pantalla de inicio".';
  } else if (isDesktop && msg && !deferredInstallPrompt) {
    msg.textContent = 'En Chrome o Edge: abre el menú del navegador y elige "Instalar Portones Eléctricos Omar".';
  }

  if (deferredInstallPrompt) btn.style.display = 'inline-block';

  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      if (msg) msg.textContent = 'Tu navegador no soporta instalación automática: sigue los pasos manuales de abajo.';
      return;
    }
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (msg) msg.textContent = outcome === 'accepted' ? '✅ ¡Instalando la app!' : 'Instalación cancelada.';
    deferredInstallPrompt = null;
    btn.style.display = 'none';
  });
}

// Cargar las vistas HTML dinámicamente
async function loadViews() {
  const app = document.getElementById('app');
  
  try {
    // Cargar vista cliente
    const clientRes = await fetch('cliente.html?v=5');
    const clientHTML = await clientRes.text();
    
    // Cargar vista admin
    const adminRes = await fetch('admin.html?v=5');
    const adminHTML = await adminRes.text();
    
    // Insertar ambas vistas en el contenedor app
    app.innerHTML = clientHTML + adminHTML;
    
    // Inicializar después de cargar las vistas
    initializeApp();
  } catch (error) {
    console.error('Error cargando vistas:', error);
    app.innerHTML = '<p style="color:red;padding:20px;">Error cargando aplicación</p>';
  }
}

// Obtener token del localStorage
function getAuthToken() {
  return localStorage.getItem('admin_token');
}

// Convierte un File en un data URL base64 (resuelve null si no hay archivo)
function readFileAsDataURL(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// Guardar token en localStorage
function setAuthToken(token) {
  localStorage.setItem('admin_token', token);
}

// Limpiar token
function clearAuthToken() {
  localStorage.removeItem('admin_token');
}

// Hacer fetch con token automático
function fetchWithAuth(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, { ...options, headers })
    .then(res => {
      // Si recibimos 401, limpiar token y redirigir
      if (res.status === 401) {
        clearAuthToken();
        location.reload();
      }
      return res;
    });
}

// Mostrar una notificación (toast) en vez de alert()
function showToast(message, type = 'success', duration = 5000) {
  const container = document.getElementById('toastContainer');
  if (!container) {
    alert(message);
    return;
  }

  const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-body"></span>
    <button type="button" class="toast-close" aria-label="Cerrar">✕</button>
  `;
  toast.querySelector('.toast-body').textContent = message;

  const remove = () => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector('.toast-close').addEventListener('click', remove);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));

  if (duration > 0) {
    setTimeout(remove, duration);
  }
}

// ===== GALERÍA PÚBLICA DE INSTALACIONES =====
// container: elemento o id del contenedor. limit: número máximo de imágenes (opcional, si se omite muestra todas)
function loadPublicGallery(container, limit) {
  const galleryGrid = typeof container === 'string' ? document.getElementById(container) : container;
  if (!galleryGrid) return;

  galleryGrid.innerHTML = '<p>Cargando galería...</p>';

  fetch(`${API_URL}/images`)
    .then(res => res.json())
    .then(images => {
      galleryGrid.innerHTML = '';
      let list = images || [];
      if (limit) list = list.slice(0, limit);

      if (list.length === 0) {
        galleryGrid.innerHTML = '<p>Aún no hay imágenes de instalaciones cargadas.</p>';
        return;
      }

      list.forEach(image => {
        const figure = document.createElement('figure');
        figure.innerHTML = `
          <img alt="${image.title}">
          <figcaption>${image.title}</figcaption>
        `;
        galleryGrid.appendChild(figure);

        fetch(`${API_URL}/images/${image.id}`)
          .then(res => res.json())
          .then(data => {
            figure.querySelector('img').src = data.imageData;
          })
          .catch(err => console.error('Error cargando imagen:', err));
      });
    })
    .catch(err => {
      galleryGrid.innerHTML = '<p style="color:red;">Error al cargar la galería</p>';
      console.error('Error:', err);
    });
}

// ===== PRODUCTOS PÚBLICOS =====

// Devuelve la imagen real del producto, o null si no tiene foto cargada
function getProductImageSrc(product) {
  return product.image_data || null;
}

// HTML de la imagen del producto o un placeholder simple si no tiene foto
function renderProductImageHtml(product) {
  const src = getProductImageSrc(product);
  if (src) return `<img src="${src}" alt="${product.name}">`;
  return `<div class="no-image-placeholder">Sin imagen disponible</div>`;
}

function renderProductCards(container, products) {
  const grid = typeof container === 'string' ? document.getElementById(container) : container;
  if (!grid) return;

  grid.innerHTML = '';

  if (!products || products.length === 0) {
    grid.innerHTML = '<p>No hay productos disponibles por el momento.</p>';
    return;
  }

  products.forEach(product => {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = `producto.html?id=${product.id}`;
    card.innerHTML = `
      ${renderProductImageHtml(product)}
      <div class="card-body">
        <h4>${product.name}</h4>
        <p class="price">$${Number(product.price).toFixed(2)}</p>
        <p>${product.description || ''}</p>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ===== CARRITO DE COMPRAS =====
const CART_STORAGE_KEY = 'shopping_cart';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  updateCartBadge();
}

function addToCart(product, quantity, variant) {
  const items = getCart();
  const existing = items.find(i => i.id === product.id && i.variant === (variant || null));
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({ id: product.id, name: product.name, price: Number(product.price), variant: variant || null, quantity });
  }
  saveCart(items);
}

function removeFromCart(index) {
  const items = getCart();
  items.splice(index, 1);
  saveCart(items);
}

function updateCartItemQuantity(index, quantity) {
  const items = getCart();
  if (items[index]) {
    items[index].quantity = Math.max(1, quantity);
    saveCart(items);
  }
}

function cartTotal(items) {
  return (items || getCart()).reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function cartItemCount(items) {
  return (items || getCart()).reduce((sum, i) => sum + i.quantity, 0);
}

function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = cartItemCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// Construye el mensaje de WhatsApp con todos los productos del carrito
function buildCartWhatsAppUrl() {
  const whatsappNumber = '526671034487';
  const items = getCart();
  const customer = {
    name: document.getElementById('checkoutName')?.value.trim() || '',
    phone: document.getElementById('checkoutPhone')?.value.trim() || '',
    address: document.getElementById('checkoutAddress')?.value.trim() || '',
    city: document.getElementById('checkoutCity')?.value.trim() || '',
    postalCode: document.getElementById('checkoutPostalCode')?.value.trim() || ''
  };
  const lines = ['🛒 *Quiero comprar estos productos*', ''];
  if (customer.name) lines.push(`👤 Nombre: ${customer.name}`);
  if (customer.phone) lines.push(`📱 Teléfono: ${customer.phone}`);
  if (customer.address) lines.push(`📍 Dirección: ${customer.address}, ${customer.city}, C.P. ${customer.postalCode}`);
  lines.push('');
  items.forEach(item => {
    const subtotal = (item.price * item.quantity).toFixed(2);
    let line = `📦 ${item.name}`;
    if (item.variant) line += ` (${item.variant})`;
    line += ` x${item.quantity} — $${subtotal}`;
    lines.push(line);
  });
  lines.push('', `💰 Total: $${cartTotal(items).toFixed(2)}`);
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
}

function renderCartModal() {
  const body = document.getElementById('cartModalBody');
  const footer = document.getElementById('cartModalFooter');
  if (!body) return;
  const items = getCart();

  if (items.length === 0) {
    body.innerHTML = '<p>Tu carrito está vacío.</p>';
    if (footer) footer.style.display = 'none';
    return;
  }

  if (footer) footer.style.display = 'block';

  body.innerHTML = items.map((item, index) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <span class="cart-item-name">${item.name}${item.variant ? ` (${item.variant})` : ''}</span>
        <span class="cart-item-price">$${item.price.toFixed(2)} c/u</span>
      </div>
      <div class="cart-item-controls">
        <button type="button" class="cart-qty-minus" data-index="${index}" aria-label="Restar">-</button>
        <input type="number" class="cart-qty-input" data-index="${index}" value="${item.quantity}" min="1">
        <button type="button" class="cart-qty-plus" data-index="${index}" aria-label="Sumar">+</button>
      </div>
      <span class="cart-item-subtotal">$${(item.price * item.quantity).toFixed(2)}</span>
      <button type="button" class="cart-item-remove" data-index="${index}" aria-label="Eliminar">✕</button>
    </div>
  `).join('');

  document.getElementById('cartModalTotal').textContent = `$${cartTotal(items).toFixed(2)}`;
  document.getElementById('cartBuyButton').href = buildCartWhatsAppUrl();

  const checkoutForm = document.getElementById('checkoutForm');
  checkoutForm?.addEventListener('input', () => {
    document.getElementById('cartBuyButton').href = buildCartWhatsAppUrl();
  });
  checkoutForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const customer = {
      name: document.getElementById('checkoutName').value.trim(),
      email: document.getElementById('checkoutEmail').value.trim(),
      phone: document.getElementById('checkoutPhone').value.trim(),
      address: document.getElementById('checkoutAddress').value.trim(),
      city: document.getElementById('checkoutCity').value.trim(),
      postalCode: document.getElementById('checkoutPostalCode').value.trim()
    };
    const button = document.getElementById('cardCheckoutBtn');
    button.disabled = true;
    button.textContent = 'Preparando pago...';
    try {
      const response = await fetch(`${API_URL}/checkout/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getCustomerToken() ? { Authorization: `Bearer ${getCustomerToken()}` } : {}) },
        body: JSON.stringify({ items: getCart(), customer })
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'No se pudo iniciar el pago.');
      window.location.href = data.url;
    } catch (error) {
      showToast(error.message, 'error');
      button.disabled = false;
      button.textContent = 'Pagar con tarjeta';
    }
  });

  if (getCustomerToken()) {
    fetch(`${API_URL}/account/addresses`, { headers: { Authorization: `Bearer ${getCustomerToken()}` } })
      .then(response => response.ok ? response.json() : [])
      .then(addresses => {
        const address = addresses[0];
        if (!address) return;
        const values = { checkoutName: address.recipient, checkoutPhone: address.phone, checkoutAddress: address.address, checkoutCity: `${address.city}, ${address.state}`, checkoutPostalCode: address.postal_code };
        Object.entries(values).forEach(([id, value]) => { const input = document.getElementById(id); if (input && !input.value) input.value = value; });
        document.getElementById('cartBuyButton').href = buildCartWhatsAppUrl();
      }).catch(() => {});
  }

  body.querySelectorAll('.cart-qty-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      updateCartItemQuantity(idx, Math.max(1, getCart()[idx].quantity - 1));
      renderCartModal();
    });
  });
  body.querySelectorAll('.cart-qty-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      updateCartItemQuantity(idx, getCart()[idx].quantity + 1);
      renderCartModal();
    });
  });
  body.querySelectorAll('.cart-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      updateCartItemQuantity(Number(input.dataset.index), parseInt(input.value, 10) || 1);
      renderCartModal();
    });
  });
  body.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFromCart(Number(btn.dataset.index));
      renderCartModal();
    });
  });
}

// Inserta el botón flotante del carrito y su modal (funciona en cualquier página)
function initCartWidget() {
  if (document.getElementById('cartWidget')) return;

  const widget = document.createElement('div');
  widget.id = 'cartWidget';
  widget.innerHTML = `
    <button type="button" id="cartToggleBtn" class="cart-fab" aria-label="Ver carrito">
      🛒<span id="cartBadge" class="cart-badge">0</span>
    </button>
    <div id="cartModal" class="modal" style="display:none;">
      <div class="modal-content cart-modal-content">
        <span class="close" id="cartModalClose">&times;</span>
        <h2>Tu carrito</h2>
        <div id="cartModalBody"></div>
        <div id="cartModalFooter" class="cart-modal-footer">
          <p class="cart-modal-total">Total: <strong id="cartModalTotal">$0.00</strong></p>
          <div class="cart-modal-actions">
            <form id="checkoutForm" class="checkout-form">
              <h3>Datos de entrega</h3>
              <div class="checkout-form-grid">
                <input id="checkoutName" type="text" placeholder="Nombre completo" required>
                <input id="checkoutEmail" type="email" placeholder="Correo electrónico" required>
                <input id="checkoutPhone" type="tel" placeholder="Teléfono" required>
                <input id="checkoutAddress" type="text" placeholder="Calle y número" required>
                <input id="checkoutCity" type="text" placeholder="Ciudad y estado" required>
                <input id="checkoutPostalCode" type="text" inputmode="numeric" placeholder="Código postal" required>
              </div>
              <button id="cardCheckoutBtn" type="submit" class="btn btn-primary">Pagar con tarjeta</button>
            </form>
            <a id="cartBuyButton" class="btn btn-outline-accent" target="_blank" rel="noopener">Enviar pedido por WhatsApp</a>
            <button type="button" id="cartClearBtn" class="btn-text-danger">Vaciar carrito</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  const modal = document.getElementById('cartModal');
  document.getElementById('cartToggleBtn').addEventListener('click', () => {
    renderCartModal();
    modal.style.display = 'block';
  });
  document.getElementById('cartModalClose').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
  document.getElementById('cartClearBtn').addEventListener('click', () => {
    saveCart([]);
    renderCartModal();
  });

  updateCartBadge();
}

// Página de detalle de producto (producto.html?id=ID)
function loadProductDetail(container) {
  const wrap = typeof container === 'string' ? document.getElementById(container) : container;
  if (!wrap) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    wrap.innerHTML = '<p style="color:red;">Producto no especificado.</p>';
    return;
  }

  fetch(`${API_URL}/products`)
    .then(res => res.json())
    .then(products => {
      const product = (products || []).find(p => String(p.id) === String(id));
      if (!product) {
        wrap.innerHTML = '<p style="color:red;">Producto no encontrado.</p>';
        return;
      }

      document.title = `${product.name} - Portones Eléctricos Omar`;

      const variants = (product.variants || '').split(',').map(v => v.trim()).filter(Boolean);
      const variantHtml = variants.length ? `
          <div class="quantity-selector">
            <label for="productVariant">Opción:</label>
            <select id="productVariant">
              ${variants.map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>
          </div>` : '';

      wrap.innerHTML = `
        <div class="product-detail-image">
          ${renderProductImageHtml(product)}
        </div>
        <div class="product-detail-info">
          <h2>${product.name}</h2>
          <p class="product-detail-description">${product.description || 'Sin descripción disponible.'}</p>
          <p class="product-detail-unit-price">Precio por pieza: <strong>$${Number(product.price).toFixed(2)}</strong></p>
${variantHtml}
          <div class="quantity-selector">
            <label for="productQuantity">Cantidad de piezas:</label>
            <div class="quantity-controls">
              <button type="button" id="qtyMinus" aria-label="Restar">-</button>
              <input type="number" id="productQuantity" value="1" min="1" step="1">
              <button type="button" id="qtyPlus" aria-label="Sumar">+</button>
            </div>
          </div>

          <p class="product-detail-total">Total: <strong id="productTotalPrice">$${Number(product.price).toFixed(2)}</strong></p>

          <div class="product-buy-actions">
            <button type="button" id="addToCartBtn" class="btn btn-primary buy-btn">Agregar al carrito</button>
          </div>
        </div>
      `;

      const qtyInput = wrap.querySelector('#productQuantity');
      const totalEl = wrap.querySelector('#productTotalPrice');
      const variantSelect = wrap.querySelector('#productVariant');

      function updateTotal() {
        let qty = parseInt(qtyInput.value, 10);
        if (!qty || qty < 1) qty = 1;
        qtyInput.value = qty;
        totalEl.textContent = `$${(Number(product.price) * qty).toFixed(2)}`;
      }

      wrap.querySelector('#addToCartBtn').addEventListener('click', () => {
        const qty = parseInt(qtyInput.value, 10) || 1;
        addToCart(product, qty, variantSelect ? variantSelect.value : null);
        showToast('Producto agregado al carrito', 'success');
      });

      wrap.querySelector('#qtyMinus').addEventListener('click', () => {
        qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
        updateTotal();
      });
      wrap.querySelector('#qtyPlus').addEventListener('click', () => {
        qtyInput.value = (parseInt(qtyInput.value, 10) || 1) + 1;
        updateTotal();
      });
      qtyInput.addEventListener('input', updateTotal);

      updateTotal();
    })
    .catch(err => {
      wrap.innerHTML = '<p style="color:red;">Error al cargar el producto</p>';
      console.error('Error:', err);
    });
}

// Productos destacados (más vendidos) para la página de inicio
function loadFeaturedProducts(container) {
  const grid = typeof container === 'string' ? document.getElementById(container) : container;
  if (!grid) return;
  grid.innerHTML = '<p>Cargando productos...</p>';

  fetch(`${API_URL}/products?featured=1`)
    .then(res => res.json())
    .then(products => renderProductCards(grid, (products || []).slice(0, 3)))
    .catch(err => {
      grid.innerHTML = '<p style="color:red;">Error al cargar productos</p>';
      console.error('Error:', err);
    });
}

// Catálogo completo de productos (página independiente)
function loadAllProducts(container) {
  const grid = typeof container === 'string' ? document.getElementById(container) : container;
  if (!grid) return;
  grid.innerHTML = '<p>Cargando productos...</p>';

  fetch(`${API_URL}/products`)
    .then(res => res.json())
    .then(products => renderProductCards(grid, products))
    .catch(err => {
      grid.innerHTML = '<p style="color:red;">Error al cargar productos</p>';
      console.error('Error:', err);
    });
}

// Función principal de inicialización
function initializeApp() {
  const yearEl = document.getElementById('year');
  if(yearEl) yearEl.textContent = new Date().getFullYear();

  // Contact Form - Guardar en BD
  const contactForm = document.getElementById('contactForm');
  if(contactForm){
    contactForm.addEventListener('submit', function(e){
      e.preventDefault();
      const name = contactForm.name.value.trim();
      const email = contactForm.email.value.trim();
      const phone = contactForm.phone ? contactForm.phone.value.trim() : '';
      const message = contactForm.message.value.trim();
      if(!name || !email || !message){
        showToast('Por favor completa los campos requeridos.', 'error');
        return;
      }

      // Guardar en la BD
      fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, message })
      })
      .then(res => res.json())
      .then(data => {
        if(data.success){
          showToast('¡Mensaje enviado! Abriendo WhatsApp para confirmar tu solicitud...', 'success');
          const whatsappNumber = '526671034487';
          const lines = [
            '🔔 *Nuevo contacto desde la web*',
            '',
            `👤 Nombre: ${name}`,
            `📧 Email: ${email}`
          ];
          if (phone) lines.push(`📱 Teléfono: ${phone}`);
          lines.push('', `📝 Mensaje: ${message}`);
          const text = lines.join('\n');
          const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
          setTimeout(() => window.open(waUrl, '_blank'), 600);
          contactForm.reset();
        } else {
          showToast('No se pudo enviar el mensaje. Intenta de nuevo.', 'error');
        }
      })
      .catch(err => {
        console.error('Error:', err);
        showToast('Ocurrió un error al enviar tu mensaje. Intenta de nuevo.', 'error');
      });
    });
  }

  loadPublicGallery('galleryGrid', 3);
  loadFeaturedProducts('featuredProductsGrid');

  // ===== VISTAS =====
  const clientView = document.getElementById('clientView');
  const adminView = document.getElementById('adminView');
  let adminLoggedIn = false;

  function showClientView(){
    clientView.style.display = 'block';
    adminView.style.display = 'none';
  }

  function showAdminView(){
    clientView.style.display = 'none';
    adminView.style.display = 'block';
  }

  // ===== ADMIN PANEL =====
  const adminBtn = document.getElementById('adminBtn');
  const adminLoginModal = document.getElementById('adminLoginModal');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const closeBtn = document.querySelector('.close');
  const logoutBtn = document.getElementById('logoutBtn');

  // Abrir modal de login
  adminBtn.addEventListener('click', function(){
    if(!adminLoggedIn){
      adminLoginModal.style.display = 'block';
    }
  });

  // Cerrar modal
  closeBtn.addEventListener('click', function(){
    adminLoginModal.style.display = 'none';
  });

  window.addEventListener('click', function(e){
    if(e.target === adminLoginModal){
      adminLoginModal.style.display = 'none';
    }
  });

  // Login admin
  adminLoginForm.addEventListener('submit', function(e){
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    
    // Enviar contraseña al servidor para obtener token
    fetch(`${API_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    .then(res => res.json())
    .then(data => {
      if(data.success && data.token){
        // Guardar token
        setAuthToken(data.token);
        adminLoggedIn = true;
        adminLoginModal.style.display = 'none';
        document.getElementById('adminPassword').value = '';
        loadPricesUI();
        loadOrdersUI();
        loadUploadedImages();
        showAdminView();
      } else {
        showToast('Contraseña incorrecta', 'error');
      }
    })
    .catch(err => {
      showToast('No se pudo conectar con el servidor para autenticar.', 'error');
      console.error('Error:', err);
    });
  });

  // Logout
  logoutBtn.addEventListener('click', function(){
    const token = getAuthToken();
    
    // Notificar al servidor
    if(token){
      fetchWithAuth(`${API_URL}/logout`, { method: 'POST' })
        .catch(err => console.error('Error en logout:', err));
    }
    
    // Limpiar sesión local
    clearAuthToken();
    adminLoggedIn = false;
    showClientView();
  });

  // ===== TAB NAVIGATION =====
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function(){
      const tabName = this.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(tabName + 'Tab').classList.add('active');
    });
  });

  // ===== PRODUCTS MANAGEMENT =====
  function loadPricesUI(){
    const pricesList = document.getElementById('pricesList');
    pricesList.innerHTML = '<p>Cargando productos...</p>';
    
    fetchWithAuth(`${API_URL}/products`)
      .then(res => res.json())
      .then(products => {
        pricesList.innerHTML = '';
        products.forEach((product) => {
          const priceItem = document.createElement('div');
          priceItem.className = 'product-edit-item';
          priceItem.dataset.name = product.name.toLowerCase();
          priceItem.innerHTML = `
            <div class="product-summary">
              <span class="product-summary-name">${product.name}</span>
              <span class="product-summary-price">$${product.price}</span>
              <span class="toggle-icon">▸</span>
            </div>
            <div class="product-edit-form">
              <div class="form-group">
                <label>Nombre del producto:</label>
                <input type="text" class="product-name" value="${product.name}" data-id="${product.id}">
              </div>
              <div class="form-group">
                <label>Precio:</label>
                <input type="number" step="0.01" class="product-price" value="${product.price}" data-id="${product.id}">
              </div>
              <div class="form-group">
                <label>Descripción:</label>
                <input type="text" class="product-description" value="${product.description || ''}" data-id="${product.id}">
              </div>
              <div class="form-group">
                <label>Imagen:</label>
                <input type="file" accept="image/*" class="product-image" data-id="${product.id}">
                <div class="product-image-preview" data-id="${product.id}" style="margin-top:10px;"></div>
              </div>
              <div class="form-group">
                <label>Opciones (separadas por coma, ej. 1,2,3,4,5 o Larga,Corta):</label>
                <input type="text" class="product-variants" value="${product.variants || ''}" data-id="${product.id}" placeholder="Opcional">
              </div>
              <div class="form-group form-group-checkbox">
                <label>
                  <input type="checkbox" class="product-featured" data-id="${product.id}" ${product.featured ? 'checked' : ''}>
                  Destacado (mostrar en la página de inicio)
                </label>
              </div>
              <button type="button" class="update-product-btn" data-id="${product.id}">Guardar cambios</button>
            </div>
          `;
          pricesList.appendChild(priceItem);

          // Cargar imagen del producto si existe
          if(product.image_data){
            const preview = priceItem.querySelector('.product-image-preview');
            preview.innerHTML = `<img src="${product.image_data}" alt="${product.name}" style="width:100%;max-width:200px;border-radius:5px;">`;
          }

          // Alternar expandir/colapsar al hacer clic en el resumen
          priceItem.querySelector('.product-summary').addEventListener('click', function(){
            priceItem.classList.toggle('expanded');
          });
        });

        // Listeners para cambio de imagen
        document.querySelectorAll('.product-image').forEach(input => {
          input.addEventListener('change', function(){
            const file = this.files[0];
            if(file){
              const reader = new FileReader();
              reader.onload = function(e){
                const preview = document.querySelector(`.product-image-preview[data-id="${input.dataset.id}"]`);
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width:100%;max-width:200px;border-radius:5px;">`;
              };
              reader.readAsDataURL(file);
            }
          });
        });

        // Listeners para guardar cambios
        document.querySelectorAll('.update-product-btn').forEach(btn => {
          btn.addEventListener('click', function(){
            const productId = this.dataset.id;
            const form = this.closest('.product-edit-form');
            const name = form.querySelector('.product-name').value.trim();
            const price = parseFloat(form.querySelector('.product-price').value);
            const description = form.querySelector('.product-description').value.trim();
            const imageInput = form.querySelector('.product-image');
            const variants = form.querySelector('.product-variants').value.trim();
            const featured = form.querySelector('.product-featured').checked;

            if(!name || isNaN(price)){
              showToast('Por favor completa los campos requeridos', 'error');
              return;
            }

            readFileAsDataURL(imageInput.files[0]).then(imageData => {
              updateProductData(productId, name, price, description, imageData, variants, featured);
            });
          });
        });

        // Aplicar filtro de búsqueda actual (si el usuario ya había escrito algo)
        const searchInput = document.getElementById('productSearchInput');
        if(searchInput && searchInput.value){
          filterProductsList(searchInput.value);
        }
      })
      .catch(err => {
        pricesList.innerHTML = '<p style="color:red;">Error al cargar productos</p>';
        console.error('Error:', err);
      });
  }

  // Filtrar la lista de productos por nombre
  function filterProductsList(query){
    const term = query.trim().toLowerCase();
    document.querySelectorAll('#pricesList .product-edit-item').forEach(item => {
      const matches = !term || (item.dataset.name || '').includes(term);
      item.classList.toggle('hidden', !matches);
    });
  }

  function renderOrders(container, orders, completed) {
    if (!container) return;
    if (!orders || orders.length === 0) {
      container.innerHTML = '<p class="admin-helper-text">No hay pedidos en esta sección.</p>';
      return;
    }
    container.innerHTML = orders.map(order => {
      let items = [];
      try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch (error) { items = []; }
      const itemText = items.map(item => `${escapeHtml(item.name || `Producto ${item.id}`)}${item.variant ? ` (${escapeHtml(item.variant)})` : ''} x${item.quantity}`).join('<br>');
      return `<article class="order-card${completed ? ' completed' : ''}">
        <div class="order-card-header"><strong class="order-ticket">${escapeHtml(order.ticket_number)}</strong><time class="order-date">${new Date(order.paid_at).toLocaleString('es-MX')}</time></div>
        <p class="order-customer"><strong>${escapeHtml(order.customer_name)}</strong><br>${escapeHtml(order.customer_email)} · ${escapeHtml(order.customer_phone)}</p>
        <p class="order-address"><strong>Entrega:</strong> ${escapeHtml(order.delivery_address)}</p>
        <div class="order-items">${itemText || '<span>Detalle no disponible</span>'}</div>
        <p class="order-total">$${Number(order.total).toFixed(2)} MXN</p>
        ${completed ? '' : `<button type="button" class="btn btn-primary mark-order-done" data-id="${escapeHtml(order.id)}">Marcar como realizado</button>`}
      </article>`;
    }).join('');
    container.querySelectorAll('.mark-order-done').forEach(button => {
      button.addEventListener('click', () => {
        fetchWithAuth(`${API_URL}/orders/${button.dataset.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'realizado' }) })
          .then(response => { if (!response.ok) throw new Error('No se pudo actualizar el pedido.'); loadOrdersUI(); })
          .catch(error => showToast(error.message, 'error'));
      });
    });
  }

  function loadOrdersUI() {
    const inProcess = document.getElementById('ordersInProcess');
    const completed = document.getElementById('ordersCompleted');
    if (!inProcess || !completed) return;
    inProcess.innerHTML = '<p class="admin-helper-text">Cargando pedidos...</p>';
    completed.innerHTML = '<p class="admin-helper-text">Cargando pedidos...</p>';
    Promise.all([
      fetchWithAuth(`${API_URL}/orders?status=en_proceso`).then(response => response.json()),
      fetchWithAuth(`${API_URL}/orders?status=realizado`).then(response => response.json())
    ]).then(([pending, done]) => { renderOrders(inProcess, pending, false); renderOrders(completed, done, true); })
      .catch(error => { inProcess.innerHTML = '<p style="color:red;">Error al cargar pedidos.</p>'; completed.innerHTML = '<p style="color:red;">Error al cargar pedidos.</p>'; console.error('Error cargando pedidos:', error); });
  }

  document.getElementById('refreshOrdersBtn')?.addEventListener('click', loadOrdersUI);

  const productSearchInput = document.getElementById('productSearchInput');
  if(productSearchInput){
    productSearchInput.addEventListener('input', function(){
      filterProductsList(this.value);
    });
  }

  // Botón para agregar un producto nuevo
  const addProductBtn = document.getElementById('addProductBtn');
  if(addProductBtn){
    addProductBtn.addEventListener('click', function(){
      if(document.getElementById('newProductForm')) return; // ya está abierto

      const pricesList = document.getElementById('pricesList');
      const newItem = document.createElement('div');
      newItem.className = 'product-edit-item expanded';
      newItem.id = 'newProductForm';
      newItem.innerHTML = `
        <div class="product-edit-form">
          <div class="form-group">
            <label>Nombre del producto:</label>
            <input type="text" class="product-name">
          </div>
          <div class="form-group">
            <label>Precio:</label>
            <input type="number" step="0.01" class="product-price">
          </div>
          <div class="form-group">
            <label>Descripción:</label>
            <input type="text" class="product-description">
          </div>
          <div class="form-group">
            <label>Imagen:</label>
            <input type="file" accept="image/*" class="product-image">
            <div class="product-image-preview" style="margin-top:10px;"></div>
          </div>
          <div class="form-group">
            <label>Opciones (separadas por coma, ej. 1,2,3,4,5 o Larga,Corta):</label>
            <input type="text" class="product-variants" placeholder="Opcional">
          </div>
          <div class="form-group form-group-checkbox">
            <label>
              <input type="checkbox" class="product-featured" checked>
              Destacado (mostrar en la página de inicio)
            </label>
          </div>
          <div class="new-product-actions">
            <button type="button" class="create-product-btn">Crear producto</button>
            <button type="button" class="cancel-product-btn">Cancelar</button>
          </div>
        </div>
      `;
      pricesList.prepend(newItem);

      const imageInput = newItem.querySelector('.product-image');
      const preview = newItem.querySelector('.product-image-preview');
      imageInput.addEventListener('change', function(){
        const file = this.files[0];
        if(file){
          const reader = new FileReader();
          reader.onload = function(e){
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width:100%;max-width:200px;border-radius:5px;">`;
          };
          reader.readAsDataURL(file);
        }
      });

      newItem.querySelector('.cancel-product-btn').addEventListener('click', function(){
        newItem.remove();
      });

      newItem.querySelector('.create-product-btn').addEventListener('click', function(){
        const name = newItem.querySelector('.product-name').value.trim();
        const price = parseFloat(newItem.querySelector('.product-price').value);
        const description = newItem.querySelector('.product-description').value.trim();
        const variants = newItem.querySelector('.product-variants').value.trim();
        const featured = newItem.querySelector('.product-featured').checked;

        if(!name || isNaN(price)){
          showToast('Por favor completa nombre y precio', 'error');
          return;
        }

        readFileAsDataURL(imageInput.files[0]).then(imageData => {
          fetchWithAuth(`${API_URL}/products`, {
            method: 'POST',
            body: JSON.stringify({ name, price, description, imageData, variants, featured })
          })
          .then(res => res.json())
          .then(data => {
            if(data.success){
              showToast('Producto creado correctamente', 'success');
              loadPricesUI();
            } else {
              showToast('No se pudo crear el producto', 'error');
            }
          })
          .catch(err => {
            console.error('Error:', err);
            showToast('Ocurrió un error al crear el producto', 'error');
          });
        });
      });
    });
  }

  function updateProductData(id, name, price, description, imageData, variants, featured){
    const body = { name, price, description, variants, featured };
    if(imageData) body.imageData = imageData;

    fetchWithAuth(`${API_URL}/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
    .then(res => res.json())
    .then(data => {
      if(data.success){
        showToast('Producto actualizado correctamente', 'success');
        loadPricesUI();
      }
    })
    .catch(err => console.error('Error:', err));
  }

  // ===== IMAGE UPLOAD =====
  const uploadForm = document.getElementById('uploadForm');
  const imageInput = document.getElementById('imageInput');
  const imagePreview = document.getElementById('imagePreview');
  const imageTitle = document.getElementById('imageTitle');

  imageInput.addEventListener('change', function(){
    const file = this.files[0];
    if(file){
      const reader = new FileReader();
      reader.onload = function(e){
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
      };
      reader.readAsDataURL(file);
    }
  });

  uploadForm.addEventListener('submit', function(e){
    e.preventDefault();
    const file = imageInput.files[0];
    const title = imageTitle.value.trim();
    if(!file || !title){
      showToast('Completa todos los campos', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e){
      const imageData = e.target.result;
      
      fetchWithAuth(`${API_URL}/images`, {
        method: 'POST',
        body: JSON.stringify({ title, imageData })
      })
      .then(res => res.json())
      .then(data => {
        if(data.success){
          loadUploadedImages();
          loadPublicGallery('galleryGrid', 3);
          imagePreview.innerHTML = '';
          imageInput.value = '';
          imageTitle.value = '';
          showToast('Imagen cargada correctamente', 'success');
        }
      })
      .catch(err => console.error('Error:', err));
    };
    reader.readAsDataURL(file);
  });

  function loadUploadedImages(){
    const uploadedImagesDiv = document.getElementById('uploadedImages');
    uploadedImagesDiv.innerHTML = '<p>Cargando imágenes...</p>';
    
    fetchWithAuth(`${API_URL}/images`)
      .then(res => res.json())
      .then(images => {
        uploadedImagesDiv.innerHTML = '';

        if(images.length === 0){
          uploadedImagesDiv.innerHTML = '<p style="grid-column:1/-1;color:#999">No hay imágenes cargadas aún</p>';
          return;
        }

        images.forEach(image => {
          const imgItem = document.createElement('div');
          imgItem.className = 'uploaded-img-item';
          imgItem.innerHTML = `
            <img src="data:image/png;base64,..." alt="${image.title}" style="width:100%;height:120px;background:#eee;border-radius:3px;" data-image-id="${image.id}">
            <p>${image.title}</p>
            <button type="button" data-id="${image.id}">Eliminar</button>
          `;
          uploadedImagesDiv.appendChild(imgItem);

          // Cargar la imagen
          fetchWithAuth(`${API_URL}/images/${image.id}`)
            .then(res => res.json())
            .then(data => {
              const img = imgItem.querySelector('img');
              img.src = data.imageData;
            })
            .catch(err => console.error('Error cargando imagen:', err));
        });

        document.querySelectorAll('.uploaded-img-item button').forEach(btn => {
          btn.addEventListener('click', function(){
            const id = this.dataset.id;
            fetchWithAuth(`${API_URL}/images/${id}`, { method: 'DELETE' })
              .then(res => res.json())
              .then(data => {
                if(data.success){
                  loadUploadedImages();
                  loadPublicGallery('galleryGrid', 3);
                }
              })
              .catch(err => console.error('Error:', err));
          });
        });
      })
      .catch(err => {
        uploadedImagesDiv.innerHTML = '<p style="color:red;">Error al cargar imágenes</p>';
        console.error('Error:', err);
      });
  }

  // Mostrar vista cliente por defecto, o admin si hay token válido
  const token = getAuthToken();
  if(token){
    // Validar que el token sea válido haciendo un request a una ruta protegida
    fetchWithAuth(`${API_URL}/products`)
      .then(res => {
        if(res.status === 401){
          clearAuthToken();
          showClientView();
        } else {
          adminLoggedIn = true;
          loadPricesUI();
          loadOrdersUI();
          loadUploadedImages();
          showAdminView();
        }
      })
      .catch(err => {
        clearAuthToken();
        showClientView();
      });
  } else {
    showClientView();
  }
}

function initAccountPage() {
  const auth = document.getElementById('accountAuth');
  const dashboard = document.getElementById('accountDashboard');
  if (!auth || !dashboard) return;
  const toast = (message, type = 'success') => showToast(message, type);
  const renderAccount = async () => {
    auth.hidden = true;
    dashboard.hidden = false;
    try {
      const meResponse = await fetch(`${API_URL}/account/me`, { headers: { Authorization: `Bearer ${getCustomerToken()}` } });
      if (!meResponse.ok) throw new Error('Sesión expirada');
      const me = await meResponse.json();
      document.getElementById('accountGreeting').textContent = `Hola, ${me.user.user_metadata?.name || me.user.email}`;
      await Promise.all([loadAccountAddresses(), loadCustomerOrders()]);
    } catch (error) { clearCustomerToken(); auth.hidden = false; dashboard.hidden = true; }
  };
  async function loadAccountAddresses() {
    const list = document.getElementById('addressesList');
    const response = await fetch(`${API_URL}/account/addresses`, { headers: { Authorization: `Bearer ${getCustomerToken()}` } });
    const addresses = response.ok ? await response.json() : [];
    list.innerHTML = addresses.length ? addresses.map(address => `<article class="saved-address"><strong>${escapeHtml(address.label)}</strong><p>${escapeHtml(address.recipient)} · ${escapeHtml(address.phone)}<br>${escapeHtml(address.address)}, ${escapeHtml(address.city)}, ${escapeHtml(address.state)}, C.P. ${escapeHtml(address.postal_code)}</p><button type="button" class="btn-text-danger delete-address" data-id="${escapeHtml(address.id)}">Eliminar</button></article>`).join('') : '<p class="account-helper">Todavía no tienes direcciones guardadas.</p>';
    list.querySelectorAll('.delete-address').forEach(button => button.addEventListener('click', async () => { await fetch(`${API_URL}/account/addresses/${button.dataset.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getCustomerToken()}` } }); loadAccountAddresses(); }));
  }
  async function loadCustomerOrders() {
    const list = document.getElementById('customerOrdersList');
    const response = await fetch(`${API_URL}/account/orders`, { headers: { Authorization: `Bearer ${getCustomerToken()}` } });
    const orders = response.ok ? await response.json() : [];
    list.innerHTML = orders.length ? orders.map(order => `<article class="saved-order"><strong>${escapeHtml(order.ticket_number)}</strong><span>${escapeHtml(order.status === 'realizado' ? 'Realizado' : 'En proceso')}</span><p>${new Date(order.paid_at).toLocaleDateString('es-MX')} · $${Number(order.total).toFixed(2)} MXN</p><small>${escapeHtml(order.delivery_address)}</small></article>`).join('') : '<p class="account-helper">Tus compras pagadas aparecerán aquí.</p>';
  }
  document.getElementById('accountLoginForm').addEventListener('submit', async event => { event.preventDefault(); const response = await fetch(`${API_URL}/account/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value }) }); const data = await response.json(); if (!response.ok) return toast(data.error, 'error'); setCustomerToken(data.access_token); renderAccount(); });
  document.getElementById('accountSignupForm').addEventListener('submit', async event => { event.preventDefault(); const response = await fetch(`${API_URL}/account/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('signupName').value, email: document.getElementById('signupEmail').value, password: document.getElementById('signupPassword').value }) }); const data = await response.json(); if (!response.ok) return toast(data.error, 'error'); if (data.session?.access_token) { setCustomerToken(data.session.access_token); renderAccount(); } else toast(data.message || 'Revisa tu correo para confirmar la cuenta.', 'info'); });
  document.getElementById('accountLogoutBtn').addEventListener('click', () => { clearCustomerToken(); auth.hidden = false; dashboard.hidden = true; });
  document.getElementById('addAddressBtn').addEventListener('click', () => { document.getElementById('addressForm').hidden = false; });
  document.getElementById('cancelAddressBtn').addEventListener('click', () => { document.getElementById('addressForm').hidden = true; });
  document.getElementById('addressForm').addEventListener('submit', async event => { event.preventDefault(); const response = await fetch(`${API_URL}/account/addresses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getCustomerToken()}` }, body: JSON.stringify({ label: document.getElementById('addressLabel').value, recipient: document.getElementById('addressRecipient').value, phone: document.getElementById('addressPhone').value, address: document.getElementById('addressStreet').value, city: document.getElementById('addressCity').value, state: document.getElementById('addressState').value, postalCode: document.getElementById('addressPostalCode').value }) }); if (!response.ok) return toast((await response.json()).error, 'error'); event.target.reset(); event.target.hidden = true; loadAccountAddresses(); });
  if (getCustomerToken()) renderAccount();
}

// Inicialización para páginas independientes (productos.html, galeria.html)
function initStaticPage() {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const allProductsGrid = document.getElementById('allProductsGrid');
  if (allProductsGrid) loadAllProducts(allProductsGrid);

  const productDetailWrap = document.getElementById('productDetail');
  if (productDetailWrap) loadProductDetail(productDetailWrap);

  const fullGalleryGrid = document.getElementById('fullGalleryGrid');
  if (fullGalleryGrid) loadPublicGallery(fullGalleryGrid);

  initInstallPage();
}

// Iniciar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function(){
  initCartWidget();
  if (document.getElementById('app')) {
    loadViews();
  } else {
    initStaticPage();
  }
  initAccountPage();
});