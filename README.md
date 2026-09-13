# Mi Cava

App real (no vive dentro de Claude) para catalogar vinos entre vos y tus amigos:
base de datos en Supabase, fotos en Supabase Storage, login por link mágico
solo para los invitados, hosteada en Vercel.

Cómo queda repartido el acceso:
- **Invitados (vos + tus amigos):** inician sesión con su mail (sin
  contraseña) y pueden cargar, editar, borrar y puntuar vinos.
- **Cualquier otra persona con el link:** ve la cava (vinos, precios,
  maridajes, puntajes) pero no puede cargar ni tocar nada. No necesita
  ningún login.

## 1) Crear el proyecto en Supabase (base de datos, gratis)

1. Entrá a https://supabase.com y creá una cuenta.
2. "New project" → ponele un nombre (ej. "mi-cava") y una contraseña de base
   de datos (guardala, no la vas a necesitar para esta app pero por las
   dudas).
3. Cuando el proyecto termine de crearse, andá a **SQL Editor** → **New
   query**, pegá todo el contenido de `supabase/schema.sql` (de esta carpeta)
   y tocá **Run**. Esto crea las tablas `profiles`, `wines` y `ratings`, y
   los permisos (solo invitados escriben, cualquiera lee).
4. Andá a **Storage** → **Create a new bucket** → nombre exacto: `etiquetas`
   → marcalo como **Public bucket** → Create.
5. Andá a **Project Settings** → **API**. Ahí vas a ver:
   - **Project URL** → esto es tu `VITE_SUPABASE_URL`
   - **anon public key** (o "publishable") → esto es tu `VITE_SUPABASE_ANON_KEY`
   - **service_role key** (o "secret") → esto es tu `SUPABASE_SERVICE_ROLE_KEY`.
     Es una clave con acceso total, sin restricciones — nunca la compartas ni
     la pegues en ningún lugar público. Solo la usa la función del servidor
     (`api/upload-photo.js`), nunca el navegador.

## 2) Configurar el login por link mágico

1. Andá a **Authentication** → **Providers** → **Email** y **apagá** la
   opción de permitir que cualquiera se registre solo (algo como "Allow new
   users to sign up" / "Enable email signups", el nombre exacto puede variar
   según la versión de Supabase). Así solo pueden entrar las personas que vos
   invitaste — nadie puede crearse una cuenta por su cuenta.
2. Andá a **Authentication** → **URL Configuration** y en "Site URL" /
   "Redirect URLs" agregá:
   - `http://localhost:5173` (para cuando la probás en tu computadora)
   - la URL que te va a dar Vercel más adelante (ej.
     `https://mi-cava.vercel.app`) — podés volver a este paso después del
     despliegue para agregarla.
3. Andá a **Authentication** → **Users** → **Invite user** y cargá tu mail y
   el de tus dos amigos (uno por uno). A cada uno le va a llegar un mail para
   entrar. La primera vez que entren, la app les va a pedir que elijan cómo
   quieren que aparezca su nombre.

## 3) Probar en tu computadora (opcional)

1. Copiá `.env.example` a un archivo nuevo llamado `.env`.
2. Completá `.env` con los dos valores de Supabase del paso 1.
3. En una terminal, dentro de esta carpeta:
   ```
   npm install
   npm run dev
   ```
4. Abrí la dirección que te muestra la terminal (algo como
   http://localhost:5173).

## 4) Publicarla online con Vercel (gratis)

1. Subí esta carpeta a un repositorio de GitHub (si no usaste GitHub antes,
   Vercel te guía para crear uno directo desde su interfaz al importar la
   carpeta).
2. Entrá a https://vercel.com, creá una cuenta (podés usar la de GitHub).
3. "Add New" → "Project" → elegí el repositorio de Mi Cava.
4. Antes de tocar "Deploy", abrí "Environment Variables" y cargá las tres:
   - `VITE_SUPABASE_URL` = el Project URL de Supabase (tipo "Config")
   - `VITE_SUPABASE_ANON_KEY` = el anon/publishable key de Supabase (tipo "Config")
   - `SUPABASE_SERVICE_ROLE_KEY` = el service_role/secret key de Supabase
     (tipo **"Secret"**, no "Config" — esta sí tiene que quedar oculta)
5. Tocá **Deploy**. En un minuto te da un link propio (algo como
   `mi-cava.vercel.app`).
6. Volvé a Supabase → **Authentication** → **URL Configuration** y agregá esa
   URL a las redirect URLs (paso 2.2) para que el link mágico funcione
   también en producción, no solo en tu computadora.

## Cómo hacer cambios más adelante

Pedime el cambio, te dejo el código actualizado, lo subís a tu repositorio de
GitHub reemplazando los archivos, y Vercel vuelve a publicar la app sola en
menos de un minuto. No hace falta repetir la configuración de Supabase salvo
que el cambio la involucre directamente (por ejemplo, agregar una tabla
nueva).

## Si algo falla

- Pantalla en blanco o "Faltan las variables...": revisá que las dos
  variables de entorno estén bien cargadas (en Vercel o en tu `.env` local).
- Las fotos no se suben: confirmá que el bucket se llama exactamente
  `etiquetas` y que quedó marcado como público.
- El link mágico no entra o tira error de redirect: revisá que la URL desde
  la que estás entrando esté agregada en Authentication → URL Configuration.
- Alguien que no invitaste intenta entrar: no va a poder — el link mágico
  solo funciona para mails que vos invitaste explícitamente en Authentication
  → Users.
