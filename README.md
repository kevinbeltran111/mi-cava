Mi Cava
App real (no vive dentro de Claude) para catalogar vinos entre vos y tus amigos:
base de datos en Supabase, fotos en Supabase Storage, login por link mágico
solo para los invitados, hosteada en Vercel.
Cómo queda repartido el acceso:
Invitados (vos + tus amigos): inician sesión con su mail (sin
contraseña) y pueden cargar, editar, borrar y puntuar vinos.
Cualquier otra persona con el link: ve la cava (vinos, precios,
maridajes, puntajes) pero no puede cargar ni tocar nada. No necesita
ningún login.
1) Crear el proyecto en Supabase (base de datos, gratis)
Entrá a https://supabase.com y creá una cuenta.
"New project" → ponele un nombre (ej. "mi-cava") y una contraseña de base
de datos (guardala, no la vas a necesitar para esta app pero por las
dudas).
Cuando el proyecto termine de crearse, andá a SQL Editor → New
query, pegá todo el contenido de `supabase/schema.sql` (de esta carpeta)
y tocá Run. Esto crea las tablas `profiles`, `wines` y `ratings`, y
los permisos (solo invitados escriben, cualquiera lee). Si el proyecto es
nuevo, después corré también `supabase/migration_roles.sql` para sumar el
sistema de roles (admin/editor/viewer) — ver la sección "Roles y
administración" más abajo.
Andá a Storage → Create a new bucket → nombre exacto: `etiquetas`
→ marcalo como Public bucket → Create.
Andá a Project Settings → API. Ahí vas a ver:
Project URL → esto es tu `VITE_SUPABASE_URL`
anon public key (o "publishable") → esto es tu `VITE_SUPABASE_ANON_KEY`
service_role key (o "secret") → esto es tu `SUPABASE_SERVICE_ROLE_KEY`.
Es una clave con acceso total, sin restricciones — nunca la compartas ni
la pegues en ningún lugar público. Solo la usa la función del servidor
(`api/upload-photo.js`), nunca el navegador.
2) Configurar el login por link mágico
Andá a Authentication → Providers → Email y apagá la
opción de permitir que cualquiera se registre solo (algo como "Allow new
users to sign up" / "Enable email signups", el nombre exacto puede variar
según la versión de Supabase). Así solo pueden entrar las personas que vos
invitaste — nadie puede crearse una cuenta por su cuenta.
Andá a Authentication → URL Configuration y en "Site URL" /
"Redirect URLs" agregá:
`http://localhost:5173` (para cuando la probás en tu computadora)
la URL que te va a dar Vercel más adelante (ej.
`https://mi-cava.vercel.app`) — podés volver a este paso después del
despliegue para agregarla.
Andá a Authentication → Users → Invite user y cargá tu mail y
el de tus dos amigos (uno por uno). A cada uno le va a llegar un mail para
entrar. La primera vez que entren, la app les va a pedir que elijan cómo
quieren que aparezca su nombre.
3) Probar en tu computadora (opcional)
Copiá `.env.example` a un archivo nuevo llamado `.env`.
Completá `.env` con los dos valores de Supabase del paso 1.
En una terminal, dentro de esta carpeta:
```
   npm install
   npm run dev
   ```
Abrí la dirección que te muestra la terminal (algo como
http://localhost:5173).
4) Publicarla online con Vercel (gratis)
Subí esta carpeta a un repositorio de GitHub (si no usaste GitHub antes,
Vercel te guía para crear uno directo desde su interfaz al importar la
carpeta).
Entrá a https://vercel.com, creá una cuenta (podés usar la de GitHub).
"Add New" → "Project" → elegí el repositorio de Mi Cava.
Antes de tocar "Deploy", abrí "Environment Variables" y cargá las tres:
`VITE_SUPABASE_URL` = el Project URL de Supabase (tipo "Config")
`VITE_SUPABASE_ANON_KEY` = el anon/publishable key de Supabase (tipo "Config")
`SUPABASE_SERVICE_ROLE_KEY` = el service_role/secret key de Supabase
(tipo "Secret", no "Config" — esta sí tiene que quedar oculta)
Tocá Deploy. En un minuto te da un link propio (algo como
`mi-cava.vercel.app`).
Volvé a Supabase → Authentication → URL Configuration y agregá esa
URL a las redirect URLs (paso 2.2) para que el link mágico funcione
también en producción, no solo en tu computadora.
Cómo hacer cambios más adelante
Pedime el cambio, te dejo el código actualizado, lo subís a tu repositorio de
GitHub reemplazando los archivos, y Vercel vuelve a publicar la app sola en
menos de un minuto. No hace falta repetir la configuración de Supabase salvo
que el cambio la involucre directamente (por ejemplo, agregar una tabla
nueva).
Si algo falla
Pantalla en blanco o "Faltan las variables...": revisá que las dos
variables de entorno estén bien cargadas (en Vercel o en tu `.env` local).
Las fotos no se suben: confirmá que el bucket se llama exactamente
`etiquetas` y que quedó marcado como público.
El link mágico no entra o tira error de redirect: revisá que la URL desde
la que estás entrando esté agregada en Authentication → URL Configuration.
Alguien que no invitaste intenta entrar: no va a poder — el link mágico
solo funciona para mails que vos invitaste explícitamente en Authentication
→ Users.
Roles y administración
Desde que se agregó el sistema de roles, cada usuario tiene uno de estos tres:
admin — todo lo de editor, más: ver la lista de usuarios, cambiar
roles, asignar o quitar el rol admin a otros. Puede haber varios admin al
mismo tiempo.
editor — puede cargar, editar y borrar sus propios vinos, y puntuar
cualquier vino. Es el rol por defecto para todo usuario nuevo.
viewer — puede ver la cava, buscar, abrir vinos y puntuarlos, pero no
puede crear, editar ni borrar vinos.
Aplicar el sistema de roles (una sola vez)
En Supabase → SQL Editor → New query, pegá todo el contenido de
`supabase/migration_roles.sql` y tocá Run.
Dentro de ese mismo archivo hay una línea comentada (empieza con `-- update profiles set role = 'admin'...`) — copiala aparte, sacale los dos
guiones del principio, reemplazá el mail de ejemplo por el tuyo, y
ejecutala en una query nueva. Así quedás como el primer administrador.
Subí el código actualizado a GitHub como siempre — no hace falta ninguna
variable de entorno nueva para esto.
Usar el panel de administración
Con el rol admin, va a aparecer un botón "Administración" en el encabezado.
Ahí ves nombre, mail y rol de cada usuario, y podés cambiarlo con el
selector — te pide confirmación antes de aplicar el cambio. Siempre tiene
que quedar al menos un admin: si intentás bajar al último, la base de datos
lo va a rechazar. Tampoco podés cambiar tu propio rol — necesitás que otro
admin lo haga (o, si sos el único, promover primero a alguien más antes de
bajarte vos).
Identificar vinos por foto (IA)
Al agregar un vino nuevo, ADMIN y EDITOR ven la opción "Identificar con foto"
además de "Cargar manualmente". Sacan o suben una foto de la etiqueta, la IA
(API de Anthropic) propone nombre/bodega/varietal/añada/región/lugar/precio/
maridaje, y esos datos quedan en el formulario normal para revisar y editar
antes de guardar — nunca se guarda nada automáticamente. VIEWER no tiene
acceso a esta función, ni desde la interfaz ni llamando al endpoint
directamente (la función del servidor verifica el rol).
Variable de entorno necesaria: `ANTHROPIC_API_KEY` (ver `.env.example` y la
sección de Vercel más arriba — se agrega exactamente igual que
`SUPABASE_SERVICE_ROLE_KEY`, tipo "Secret").
Notas:
El precio solo se completa si aparece impreso en la etiqueta; si no, queda
vacío para que lo cargues vos.
El stock nunca lo completa la IA — siempre lo ingresa el usuario.
La foto usada para identificar se descarta si cancelás; si confirmás el
vino, esa misma foto pasa a ser la foto guardada del vino (no se sube dos
veces ni se guarda nada intermedio).
Cada clic en "Analizar" es una sola llamada a la IA — no hay reintentos
automáticos ni procesamiento en segundo plano.
Búsqueda y filtros
La búsqueda de texto ahora también encuentra coincidencias por región, lugar
y añada (antes solo nombre/bodega/varietal). Al lado hay un botón "Filtros"
que despliega un panel con seis filtros combinables: región, lugar, bodega,
varietal, añada y stock (todos / con stock / sin stock) — todos se pueden
usar juntos. Las opciones de cada filtro se arman solas a partir de los
vinos ya cargados (si nadie cargó todavía un vino de "Cafayate", esa opción
no aparece hasta que exista uno). Se muestra la cantidad de resultados y un
botón para limpiar todo. No se agregó ninguna tabla ni columna nueva —
todo se calcula a partir de los datos que ya existen.
