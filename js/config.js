// =============================================================
// Configuración de Supabase para La Tili
//
// 1) Supabase Dashboard > Project Settings > API
// 2) Copiá "Project URL" en SUPABASE_URL
// 3) Copiá la clave "anon / publishable" en SUPABASE_ANON_KEY
//    (NUNCA la service_role: es secreta y va solo en el servidor)
//
// La clave anon es pública por diseño: la seguridad laotone la base
// con las policies RLS de supabase/schema.sql
// =============================================================

window.SUPABASE_URL = 'https://TU_PROJECT_REF.supabase.co';
window.SUPABASE_ANON_KEY = 'TU_CLAVE_ANON_PUBLISHABLE';
window.NICK_EMAIL_DOMAIN = '@latili.app';