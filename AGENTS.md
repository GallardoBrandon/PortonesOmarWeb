# AI Agent Guidelines for Portones Omar Website

## Project Overview
Aplicacion full-stack para Portones Omar. El backend expone una API REST con Node.js + Express y persiste datos en SQLite. El frontend es HTML/CSS/JavaScript vanilla y se compone de una portada que carga vistas parciales y paginas publicas separadas para galeria y catalogo.

- Idioma principal: espanol
- Puerto por defecto: `3000`
- Base de datos local: `database.db`
- Entrada del servidor: `server.js`

## Quick Start

```bash
npm install
npm start
```

La aplicacion queda disponible en `http://localhost:3000`.

## Project Structure

```text
server.js        # Servidor Express, auth por token y rutas API
database.js      # Inicializacion SQLite, migraciones simples y funciones DB
index.html       # Shell principal; carga cliente.html y admin.html dinamicamente
cliente.html     # Vista publica embebida dentro de index.html
admin.html       # Vista administrativa embebida dentro de index.html
productos.html   # Pagina publica del catalogo completo
galeria.html     # Pagina publica de la galeria completa
script.js        # Logica cliente: carga de vistas, auth, formularios y admin UI
styles.css       # Estilos globales
database.db      # Archivo SQLite local
SETUP.md         # Documentacion de instalacion y despliegue
README.md        # Resumen del proyecto
```

## Runtime Architecture

### Frontend
- `index.html` solo monta `#app`, el contenedor de toasts y carga `script.js`.
- `script.js` descarga `cliente.html` y `admin.html` con `fetch()` y luego llama `initializeApp()`.
- La vista publica y la vista admin coexisten en el DOM; se alternan con `showClientView()` y `showAdminView()`.
- `productos.html` y `galeria.html` son paginas independientes que reutilizan `styles.css` y `script.js` para cargar contenido publico.

### Backend
- `server.js` sirve archivos estaticos desde la raiz del proyecto con `express.static(__dirname)`.
- La API usa JSON y callbacks de SQLite, no Promises.
- La autenticacion admin es server-side: `POST /api/auth` entrega un bearer token temporal.
- Los tokens activos viven en memoria en `activeTokens`, asi que se invalidan cuando reinicia el servidor.

### Database
- `database.js` abre `database.db` y ejecuta `db.serialize()` para evitar carreras durante migraciones y consultas tempranas.
- Las tablas se crean al arrancar si no existen.
- Las migraciones actuales agregan `image_data` y `featured` a `products` en bases antiguas mediante `ALTER TABLE` tolerante a error.

## Database Schema

### `customers`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `name` TEXT NOT NULL
- `email` TEXT NOT NULL
- `phone` TEXT
- `message` TEXT
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### `products`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `name` TEXT NOT NULL
- `price` REAL NOT NULL
- `description` TEXT
- `image_data` LONGTEXT
- `featured` INTEGER DEFAULT 1
- `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### `images`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `title` TEXT NOT NULL
- `image_data` LONGTEXT NOT NULL
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

## API Reference

### Auth
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth` | No | Inicia sesion admin y devuelve token |
| POST | `/api/logout` | Bearer opcional | Invalida token actual |

Body de login: `{ password }`

### Customers
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/customers` | No | Registra un contacto desde el formulario |
| GET | `/api/customers` | Bearer | Lista contactos para admin |

Body: `{ name, email, phone?, message }`

### Products
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/products` | No | Lista productos |
| GET | `/api/products?featured=1` | No | Lista productos destacados |
| GET | `/api/products/:id` | No | Devuelve solo `imageData` del producto |
| POST | `/api/products` | Bearer | Crea producto |
| PUT | `/api/products/:id` | Bearer | Actualiza producto |

Body de alta/edicion: `{ name, price, description?, imageData?, featured? }`

### Images
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/images` | No | Lista metadata de imagenes |
| GET | `/api/images/:id` | No | Devuelve `imageData` de una imagen |
| POST | `/api/images` | Bearer | Sube una imagen |
| DELETE | `/api/images/:id` | Bearer | Elimina una imagen |

Body de carga: `{ title, imageData }`

## Authentication Notes

- La contrasena admin sale de `process.env.ADMIN_PASSWORD` o cae en `admin123`.
- El frontend guarda el token en `localStorage` bajo `admin_token`.
- `fetchWithAuth()` agrega `Authorization: Bearer <token>` automaticamente.
- Si una peticion responde `401`, el frontend limpia el token y recarga la pagina.

## Default Content and Migrations

- Si `products` esta vacia al iniciar, `database.js` inserta tres productos por defecto.
- La columna `featured` se inicializa en `1` para productos existentes cuando la migracion si logra agregarla.
- Reiniciar con una base vieja puede emitir errores benignos de `ALTER TABLE` ya aplicada; el flujo espera ese patron.

## Editing Guidance

### Backend changes
1. Si agregas o cambias un endpoint, actualiza `server.js` y la funcion correspondiente en `database.js`.
2. Manten respuestas JSON y codigos HTTP consistentes con el resto del archivo.
3. Si el endpoint es admin, protegelo con `verifyToken`.

### Frontend changes
1. Si cambias estructura de la portada, revisa `cliente.html`, `admin.html` y `script.js` juntos.
2. Si agregas elementos que se inicializan por ID, confirma que existen despues de `loadViews()`.
3. Manten la UX en espanol y evita introducir frameworks.

### Database changes
1. Anade columnas nuevas en `initDatabase()` con migraciones tolerantes a bases existentes.
2. Conserva el estilo callback existente; no mezcles Promises salvo que migres el modulo completo.
3. Verifica si la nueva columna afecta productos por defecto o consultas publicas.

## Debugging Tips

- Si la UI parece cargar vacia, revisa primero fallos al descargar `cliente.html` o `admin.html`.
- Si el admin pierde sesion tras reiniciar, es esperado: los tokens viven solo en memoria del proceso.
- Si una pestana no aparece aunque tenga la clase `active`, busca estilos inline como `style="display: none;"` que ganen sobre CSS por clase.
- Si cambias `server.js` o `database.js`, recuerda que `npm start` y `npm run dev` ejecutan `node server.js`; no hay recarga automatica.
- El backend acepta payloads JSON grandes hasta `50mb`; fallos de imagen suelen ser tamano o base64 invalido.

## Agent Checklist

Antes de cerrar una tarea, un agente deberia validar lo siguiente:

1. El flujo tocado sigue siendo consistente entre `server.js`, `database.js` y `script.js`.
2. Los textos visibles al usuario permanecen en espanol.
3. Si hubo cambios de API o esquema, esta guia sigue siendo correcta.
4. Si existe una verificacion ejecutable acotada, se ejecuto despues del cambio.