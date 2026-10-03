-- =============================================================
-- La Tili · Esquema de base de datos (Supabase)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run
-- =============================================================

-- ---------- Tablas ----------

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nick       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nick       TEXT NOT NULL,
  msg        TEXT NOT NULL CHECK (char_length(msg) BETWEEN 1 AND 2000),
  kind       TEXT NOT NULL DEFAULT 'global' CHECK (kind IN ('global')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.followers (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, follower_id),
  CHECK (user_id <> follower_id)
);

CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages (created_at DESC);
CREATE INDEX IF NOT EXISTS followers_follower_idx  ON public.followers (follower_id);

-- ---------- Vista de contadores de seguidores ----------
-- security_invoker = para que se apliquen las policies RLS de las tablas bases

CREATE OR REPLACE VIEW public.follower_counts
WITH (security_invoker = true) AS
SELECT p.nick AS nick, count(f.follower_id)::int AS followers_count
FROM public.profiles p
LEFT JOIN public.followers f ON f.user_id = p.id
GROUP BY p.nick;

-- ---------- Crear perfil automáticamente al registrarse ----------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nick)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'nick', ''), split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- Row Level Security ----------

ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;

-- profiles: todos los autenticados pueden ver; cada uno solo edita el suyo
DROP POLICY IF EXISTS "profiles select" ON public.profiles;
CREATE POLICY "profiles select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles insert own" ON public.profiles;
CREATE POLICY "profiles insert own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- messages: lectura global, escritura solo propia
DROP POLICY IF EXISTS "messages select" ON public.messages;
CREATE POLICY "messages select" ON public.messages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "messages insert own" ON public.messages;
CREATE POLICY "messages insert own" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND nick = (
    SELECT nick FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "messages update own" ON public.messages;
CREATE POLICY "messages update own" ON public.messages
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "messages delete own" ON public.messages;
CREATE POLICY "messages delete own" ON public.messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- followers: lectura libre entre autenticados; cada uno sigue/deja de seguir por su cuenta
DROP POLICY IF EXISTS "followers select" ON public.followers;
CREATE POLICY "followers select" ON public.followers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "followers insert own" ON public.followers;
CREATE POLICY "followers insert own" ON public.followers
  FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "followers delete own" ON public.followers;
CREATE POLICY "followers delete own" ON public.followers
  FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- ---------- Realtime ----------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'followers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.followers;
  END IF;
END $$;