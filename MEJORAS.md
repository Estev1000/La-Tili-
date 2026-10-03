# La Tili · Mejoras

## v2 — Logo propio, app descargable y mensajes controlados

---

### 1. Logo e íconos propios

| Archivo | Uso |
|---|---|
| `icon-192x192.png` | Ícono de la app |
| `icon-512x512.png` | Ícono grande |
| `icon-512x512-maskable.png` | Versión para Android (con margen seguro) |
| `apple-touch-icon.png` | iPhone |
| `favicon-32x32.png` | Pestaña del navegador |

Degradé rosa → violeta del sitio con la antena blanca. Mismo estilo en todos.

---

### 2. Descargar la app como una app (PWA)

| Archivo | Qué hace |
|---|---|
| `manifest.json` | Nombre "La Tili", ícono y colores de la app |
| `sw.js` | Precarga todo: abre al instante y aguanta sin internet |
| `js/pwa.js` | Muestra la carta "Descargar app" y el botón en la navbar |

**Cómo la instala la gente:**
- **Android / Chrome** → les aparece una carta abajo con **"Descargar app"** (o el botón **App** en la navbar)
- **iPhone** → la carta dice: *Compartir → Agregar a pantalla de inicio*

Una vez instalada aparece el ícono en la pantalla de inicio y abre **sin barra del navegador**.
La carta solo aparece una vez: si la cierran, no vuelve a molestar.

---

### 3. Mensajes: anti-spam y limpieza automática

**Límites por persona:**

| Regla | Mensaje que ve el usuario |
|---|---|
| 10 mensajes en 10 segundos | "Demasiados mensajes seguidos. Espera unos segundos." |
| 30 mensajes en 1 minuto | "Vas muy rápido. Espera un momento antes de seguir." |
| 200 mensajes por hora | "Alcanzaste el límite de 200 mensajes por hora." |
| No repetir el mismo texto 3 veces en 30 segundos | "No repitas el mismo mensaje." |

**Retención: 30 días.** Todo mensaje con más de 30 días se borra solo.
- `pg_cron` → todos los días a las **4:20 UTC** (1:20 AM)
- Trigger de respaldo → cada ~50 mensajes, por si el cron falla

Cuando se borran, **desaparecen al instante del chat de todos** (no hay que recargar).

El chat carga **solo los últimos 50 mensajes** al entrar, por eso siempre abre rápido.

**No se borran nunca:** usuarios y seguidores.
**No se guardan nunca:** mensajes privados (`/w apodo hola`) y el chat de las transmisiones.

**Dónde ver todos los mensajes:**
supabase.com → tu proyecto → **Table Editor** → `messages`

---

### 4. Moderación (activar con 1 línea)

Con `is_admin` en `true` le aparece el 🗑️ en **todos** los mensajes, no solo en los propios.

```sql
update public.profiles set is_admin = true where nick = 'Esteban';
```

Cerrá sesión y volvé a entrar para que tome el cambio.

---

### Pendiente (importante)

- [ ] Cambiar la contraseña de GitHub (quedó en el historial del repo)
- [ ] Revocar el token `la-tili-setup` de Supabase
- [ ] Rotar la contraseña de la base de datos
- [ ] Poner los secrets `SUPABASE_URL` y `SUPABASE_ANON_KEY` en GitHub Actions