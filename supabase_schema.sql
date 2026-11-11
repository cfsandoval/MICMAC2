-- Script SQL para inicializar las tablas de persistencia en Supabase para MICMAC Extendido
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run

-- 1. Tabla de Proyectos y Modelos MICMAC por Usuario
CREATE TABLE IF NOT EXISTS public.user_projects (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "desc" TEXT,
    mode TEXT DEFAULT 'custom',
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de seguridad: Cada usuario solo puede ver, crear, modificar y borrar sus propios modelos
DROP POLICY IF EXISTS "Users can select own projects" ON public.user_projects;
CREATE POLICY "Users can select own projects" ON public.user_projects
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own projects" ON public.user_projects;
CREATE POLICY "Users can insert own projects" ON public.user_projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own projects" ON public.user_projects;
CREATE POLICY "Users can update own projects" ON public.user_projects
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own projects" ON public.user_projects;
CREATE POLICY "Users can delete own projects" ON public.user_projects
    FOR DELETE USING (auth.uid() = user_id);

-- 4. Índice para búsquedas rápidas por usuario
CREATE INDEX IF NOT EXISTS idx_user_projects_user_id ON public.user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_updated_at ON public.user_projects(updated_at DESC);
