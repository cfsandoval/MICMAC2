-- Script SQL para inicializar las tablas de persistencia en Supabase para MICMAC Extendido
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- Sistema 100% Base de Datos (Sin Google ni Apple):
-- 1. En Authentication -> Providers -> Email:
--    Asegúrese de que Email esté habilitado.
--    Recomendado: Desactive "Confirm email" para que los usuarios puedan registrarse e ingresar de inmediato.
--

-- 1. Tabla de Proyectos y Modelos MICMAC por Usuario
CREATE TABLE IF NOT EXISTS public.user_projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    "desc" TEXT,
    mode TEXT DEFAULT 'custom',
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acceso para lectura/escritura de modelos
DROP POLICY IF EXISTS "Allow user projects access" ON public.user_projects;
CREATE POLICY "Allow user projects access" ON public.user_projects
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Índices para búsquedas rápidas por usuario
CREATE INDEX IF NOT EXISTS idx_user_projects_user_id ON public.user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_updated_at ON public.user_projects(updated_at DESC);
