# La Tili

Chat global en vivo con streaming WebRTC. **Sin servidor**: todo corre en el navegador
contra Supabase (Postgres + Auth + Realtime). El sitio se publica con GitHub Pages.

```
index.html            interfaz (misma UI que la versión anterior)
css/main.css          estilos
js/config.js          URL del proyecto Supabase + clave anon  <-- EDITAR
js/app.js             lógica del cliente (mensajes, presencia, seguidores, live)
supabase/schema.sql   tablas + RLS + realtime  <-- EJECUTAR EN SUPABASE
.github/workflows/    ping diario para que Supabase no pause el proyecto
```

## 1. Crear el proyecto en Supabase

1. [supabase.com/dashboard](https://supabase.com/dashboard) -> **New project**.
2. Guardá la contraseña de la base de datos.
3. En **Authentication -> Providers -> Email**:
   - **desactivá** *Confirm email* (si no, el registro exige confirmar un email falso).
   - Bajá el rate limit de registro si vas a tener muchos usuarios.

## 2. Crear las tablas

**SQL Editor -> New query**: pegá `supabase/schema.sql` completo y dá **Run**.

Eso crea `profiles`, `messages`, `followers`, la vista `follower_counts`,
las policies RLS y agrega las tablas a la publicación `supabase_realtime`.

## 3. Configurar el cliente

En **Project Settings -> API** copiá:

| Valor | Dónde va |
|---|---|
| `Project URL` | `js/config.js` -> `SUPABASE_URL` |
| `anon` / `publishable` | `js/config.js` -> `SUPABASE_ANON_KEY` |

La clave `anon` es pública a propósito: la seguridad la ponen las policies RLS.
**Nunca** subas la clave `service_role`.

Si en el futuro cambiás el dominio de los emails sintéticos, ajustá
`NICK_EMAIL_DOMAIN` en el mismo archivo (por defecto `@latili.app`).

## 4. Probar en local

Cualquier servidor estático sirve (no hace falta Node ni build):

```bash
npx serve .          # o: python -m http.server 8080
```

Abrí `http://localhost:8080`. Para probar el chat con dos personas, abrí una
ventana incógnita como segundo usuario.

## 5. Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "La Tili: cliente Supabase + GitHub Pages"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/la-tili.git
git push -u origin main
```

Después en GitHub: **Settings -> Pages -> Source: main / (root)**.
Queda disponible en `https://<tu-usuario>.github.io/la-tili/`
(todas las rutas del sitio son relativas, así que funciona en un subdirectorio).

Un dominio propio (por ejemplo `latili.com.ar`) se puede apuntar a GitHub Pages
sin costo; lo que cuesta plata es el vanity URL de Supabase.

## 6. Evitar que Supabase pause el proyecto

Los proyectos gratuitos se pausan a los 7 días sin actividad. El workflow
`.github/workflows/keep-alive.yml` hace un ping diario, pero necesitás
configurar dos secrets en **Settings -> Secrets and variables -> Actions**:

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | la Project URL |
| `SUPABASE_ANON_KEY` | la clave anon |

Comprobá que corrió bien en la pestaña **Actions**.

## Cómo funciona

| Función | Tecnología |
|---|---|
| Registro / login por apodo | Supabase Auth. El apodo se convierte en `apodo@latili.app` |
| Mensajes (enviar, editar, borrar) | tabla `messages` + Realtime `postgres_changes` |
| Usuarios online / contador | Realtime Presence |
| Seguir / seguidores | tabla `followers` + vista `follower_counts` |
| Mensajes privados | Realtime Broadcast (efímeros, como antes) |
| Señalización de video | Realtime Broadcast en `live-<apodo>` |
| Chat del live | Realtime Broadcast |

El chat funciona siempre; la transmisión de video depende de que la red de los
dos navegadores permita WebRTC (STUN público, sin TURN).

## Techo del plan gratuito

| Límite | Valor |
|---|---|
| Conexiones Realtime simultáneas | 200 |
| Mensajes por mes | 2 millones |
| Base de datos | 500 MB |

Si se supera, el plan Pro arranca en $25/mes con 500 conexiones
(más $10 por cada 1000 adicionales).