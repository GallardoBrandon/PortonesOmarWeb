# Portones & Mercancía - Sistema de Gestión

## Instalación y Ejecución

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar el servidor
```bash
npm start
```

El servidor estará disponible en: **http://localhost:3000**

## Estructura de la Base de Datos

### Tabla: `customers`
- `id` - ID del cliente
- `name` - Nombre
- `email` - Email
- `phone` - Teléfono
- `message` - Mensaje
- `created_at` - Fecha de creación

### Tabla: `products`
- `id` - ID del producto
- `name` - Nombre del producto
- `price` - Precio
- `description` - Descripción
- `updated_at` - Fecha de última actualización

### Tabla: `images`
- `id` - ID de la imagen
- `title` - Título de la imagen
- `image_data` - Datos de la imagen (base64)
- `created_at` - Fecha de creación

## API Endpoints

### Clientes
- `POST /api/customers` - Crear cliente
- `GET /api/customers` - Listar clientes

### Productos
- `GET /api/products` - Listar productos
- `PUT /api/products/:id` - Actualizar precio de producto

### Imágenes
- `POST /api/images` - Subir imagen
- `GET /api/images` - Listar imágenes
- `GET /api/images/:id` - Obtener datos de imagen
- `DELETE /api/images/:id` - Eliminar imagen

## Autenticación Admin
- **Usuario**: (sin usuario, solo contraseña)
- **Contraseña por defecto**: `admin123`
- **Para cambiar**: editar variable `ADMIN_PASSWORD` en `script.js`

## Características

✅ Panel administrativo separado
✅ Gestión de precios en tiempo real
✅ Subida de imágenes
✅ Base de datos SQLite
✅ API REST
✅ Formulario de contacto con guardado en BD
✅ Interfaz responsive

## Archivos
- `server.js` - Servidor Express
- `database.js` - Configuración de SQLite
- `index.html` - Frontend
- `script.js` - Lógica del cliente
- `styles.css` - Estilos
- `package.json` - Dependencias
- `database.db` - Base de datos (se crea automáticamente)

## Publicar gratis con Render y Supabase

El proyecto puede usar SQLite en local y PostgreSQL en producción. Para que la información del catálogo, las imágenes y los contactos no se borre al reiniciar Render, en producción debe configurarse una base de datos de Supabase.

### 1. Crear la base de datos en Supabase

1. Crea una cuenta en [Supabase](https://supabase.com/) y selecciona **New project**.
2. Elige un nombre, una región cercana y guarda la contraseña de la base de datos.
3. Cuando el proyecto esté listo, entra a **Connect** y copia la cadena **URI** de conexión de PostgreSQL.
4. Sustituye `[YOUR-PASSWORD]` de la URI por la contraseña que elegiste. Conserva la cadena completa para el siguiente paso.

No necesitas crear tablas manualmente: el servidor las crea al iniciar por primera vez.

### 1.1 Conservar los datos actuales de SQLite

Si ya cargaste productos, imágenes o contactos en la página local, cópialos a Supabase antes de publicar. En PowerShell, desde la carpeta del proyecto, ejecuta:

```powershell
$env:DATABASE_URL = 'pega-aqui-la-URI-de-Supabase'
npm run migrate:sqlite
```

El comando usa `database.db` local, conserva los identificadores y puede ejecutarse de nuevo sin duplicar los registros que ya migró. No subas `database.db` ni la URI a GitHub.

### 2. Subir el proyecto a GitHub

1. Crea un repositorio nuevo, preferiblemente privado, en [GitHub](https://github.com/).
2. Sube todos los archivos del proyecto. No subas `.env`, `database.db`, `node_modules` ni contraseñas.
3. Confirma que `render.yaml` esté incluido en el repositorio.

### 3. Crear el servicio en Render

1. Crea una cuenta en [Render](https://render.com/) e inicia sesión con GitHub.
2. Selecciona **New +** y luego **Blueprint**.
3. Elige el repositorio de este proyecto. Render detectará `render.yaml` y mostrará el servicio `portones-omar`.
4. Antes de publicar, agrega la variable de entorno `DATABASE_URL` y pega la URI de Supabase.
5. Render genera `ADMIN_PASSWORD` automáticamente. Reemplázala por una contraseña larga propia desde **Environment** y vuelve a desplegar.

Al terminar, Render proporcionará una URL pública similar a `https://portones-omar.onrender.com`. El primer acceso después de un periodo sin visitas puede tardar un poco en responder en el plan gratuito.

### Variables de entorno

| Variable | Dónde se usa | Valor |
| --- | --- | --- |
| `DATABASE_URL` | Render | URI de PostgreSQL proporcionada por Supabase |
| `ADMIN_PASSWORD` | Render | Contraseña única y privada del panel administrativo |
| `STRIPE_SECRET_KEY` | Render | Clave secreta de Stripe para activar pagos con tarjeta |
| `PORT` | Render | No configurarla: Render la proporciona automáticamente |

Para desarrollo local, puedes copiar `.env.example` como `.env`, definir únicamente `ADMIN_PASSWORD` y mantener `DATABASE_URL` vacío para seguir usando SQLite.

### 4. Activar pagos con tarjeta

El carrito ya solicita nombre, correo, teléfono y dirección de entrega. Para habilitar el botón **Pagar con tarjeta**, crea una cuenta de negocio en [Stripe](https://dashboard.stripe.com/), activa México y copia la **Secret key** desde Developers > API keys.

Agrega esa clave como `STRIPE_SECRET_KEY` en Render. Nunca la pongas en el frontend, en GitHub ni en el chat. El pago se procesa en Stripe Checkout, que también solicita la dirección de envío; el servidor valida los productos y precios antes de crear la sesión.

Mientras `STRIPE_SECRET_KEY` no exista, el pedido por WhatsApp seguirá disponible y usará los datos de entrega capturados en el carrito.

### 5. Crear tickets después del pago

En Stripe, abre **Developers > Webhooks > Add endpoint** y registra:

```text
https://portones-omar.onrender.com/api/stripe/webhook
```

Selecciona estos eventos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Copia el **Signing secret** del endpoint, que comienza con `whsec_`, y agrégalo en Render como `STRIPE_WEBHOOK_SECRET`. Después pulsa **Save, rebuild, and deploy**.

El servidor verifica la firma y `payment_status = paid` antes de insertar el pedido. Stripe puede reenviar un evento y no se duplicará el ticket porque la sesión y el evento tienen restricciones únicas.
