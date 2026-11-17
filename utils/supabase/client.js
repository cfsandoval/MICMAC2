/* ===== Supabase Integration Helper for MICMAC Extendido ===== */
(function (global) {
  const SUPABASE_URL = 'https://qypksdsaejvcwiebpeos.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LiwzmwIjafVYij_AiF2AaA_V81Yv9a6';

  let client = null;
  let tableMissingWarned = false;

  function initClient() {
    if (client) return client;
    if (global.supabase && typeof global.supabase.createClient === 'function') {
      try {
        client = global.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
      } catch (e) {
        console.warn('[Supabase] Init error:', e);
      }
    }
    return client;
  }

  // Fallback en user_metadata cuando la tabla public.user_projects aún no ha sido creada en SQL Editor
  async function fetchMetadataProjects(cli) {
    try {
      const { data, error } = await cli.auth.getUser();
      if (error || !data || !data.user) return [];
      const list = data.user.user_metadata && data.user.user_metadata.micmac_projects;
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  async function saveMetadataProject(cli, payload) {
    try {
      const list = await fetchMetadataProjects(cli);
      const idx = list.findIndex(p => p && p.id === payload.id);
      if (idx >= 0) {
        list[idx] = payload;
      } else {
        list.unshift(payload);
      }
      // Mantener los 10 modelos más recientes en metadata para no exceder límites de JWT/metadata
      const trimmed = list.slice(0, 10);
      const { data, error } = await cli.auth.updateUser({
        data: { micmac_projects: trimmed }
      });
      if (error) {
        console.warn('[Supabase] saveMetadataProject warning:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('[Supabase] saveMetadataProject error:', e);
      return null;
    }
  }

  async function deleteMetadataProject(cli, projectId) {
    try {
      const list = await fetchMetadataProjects(cli);
      const filtered = list.filter(p => p && p.id !== projectId);
      if (filtered.length !== list.length) {
        await cli.auth.updateUser({
          data: { micmac_projects: filtered }
        });
      }
    } catch (e) {
      console.warn('[Supabase] deleteMetadataProject error:', e);
    }
  }

  const SupabaseSync = {
    url: SUPABASE_URL,
    key: SUPABASE_PUBLISHABLE_KEY,

    getClient() {
      return initClient();
    },

    isConfigured() {
      return Boolean(initClient());
    },

    onAuthChange(callback) {
      const cli = initClient();
      if (!cli || !cli.auth || typeof cli.auth.onAuthStateChange !== 'function') return null;
      return cli.auth.onAuthStateChange((event, session) => {
        if (typeof callback === 'function') callback(event, session);
      });
    },

    // 1. Registro con Supabase Auth (Email y Contraseña)
    async signUp(email, password, meta = {}) {
      const cli = initClient();
      if (!cli) return { error: { message: 'Supabase SDK no disponible' } };
      try {
        const cleanEmail = (email || '').trim().toLowerCase();
        const { data, error } = await cli.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: {
              display_name: meta.name || cleanEmail,
              full_name: meta.name || cleanEmail,
              org: meta.org || ''
            }
          }
        });
        return { data, error };
      } catch (err) {
        return { error: err };
      }
    },

    // 2. Inicio de sesión con Supabase Auth (Email y Contraseña)
    async signIn(email, password) {
      const cli = initClient();
      if (!cli) return { error: { message: 'Supabase SDK no disponible' } };
      try {
        const cleanEmail = (email || '').trim().toLowerCase();
        const { data, error } = await cli.auth.signInWithPassword({
          email: cleanEmail,
          password: password
        });
        return { data, error };
      } catch (err) {
        return { error: err };
      }
    },

    // 3. Cierre de sesión
    async signOut() {
      const cli = initClient();
      if (!cli) return;
      try {
        await cli.auth.signOut();
      } catch (err) {
        console.warn('[Supabase] SignOut error:', err);
      }
    },

    // 4. Usuario activo en sesión
    async getUser() {
      const cli = initClient();
      if (!cli) return null;
      try {
        const { data } = await cli.auth.getUser();
        return data ? data.user : null;
      } catch (err) {
        return null;
      }
    },

    // 4b. Sesión activa (null si no hay login confirmado)
    async getSession() {
      const cli = initClient();
      if (!cli) return null;
      try {
        const { data } = await cli.auth.getSession();
        return data ? data.session : null;
      } catch (err) {
        return null;
      }
    },

    // 4c. Diagnóstico de conectividad con el proyecto Supabase
    async checkConnection() {
      try {
        const res = await fetch(SUPABASE_URL + '/auth/v1/health', {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
        });
        if (!res.ok) {
          console.error('[Supabase] Health check failed:', res.status, res.statusText);
          return { ok: false, status: res.status, error: res.statusText };
        }
        const info = await res.json().catch(() => ({}));
        console.info('[Supabase] Connected:', SUPABASE_URL, info);
        return { ok: true, status: res.status, data: info };
      } catch (err) {
        console.error('[Supabase] Connection error:', err);
        return { ok: false, error: err };
      }
    },

    // 4d. Configuración de Auth (proveedores habilitados, confirmación de email)
    async getAuthSettings() {
      try {
        const res = await fetch(SUPABASE_URL + '/auth/v1/settings', {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
        });
        if (!res.ok) return null;
        return await res.json();
      } catch (err) {
        return null;
      }
    },

    // 5. Cargar proyectos de la nube (tabla user_projects + respaldo en user_metadata)
    async fetchCloudProjects(userId) {
      const cli = initClient();
      if (!cli || !userId) return null;
      try {
        const { data, error } = await cli
          .from('user_projects')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        if (error) {
          if (!tableMissingWarned) {
            tableMissingWarned = true;
            console.info('[Supabase] Usando respaldo automático en user_metadata (tabla user_projects pendiente):', error.message);
          }
          return await fetchMetadataProjects(cli);
        }
        const metaProjs = await fetchMetadataProjects(cli);
        const byId = new Map();
        (data || []).forEach(p => { if (p && p.id) byId.set(p.id, p); });
        (metaProjs || []).forEach(p => {
          if (p && p.id && !byId.has(p.id)) byId.set(p.id, p);
        });
        return Array.from(byId.values());
      } catch (err) {
        console.warn('[Supabase] fetchCloudProjects error:', err);
        return await fetchMetadataProjects(cli);
      }
    },

    // 6. Guardar/Actualizar proyecto en la nube (tabla user_projects + respaldo en user_metadata)
    async saveCloudProject(project, userId) {
      const cli = initClient();
      if (!cli || !userId || !project) return null;
      const payload = {
        id: project.id,
        user_id: userId,
        name: project.name,
        desc: project.desc || '',
        mode: project.mode || 'custom',
        state: project.state || {},
        created_at: project.createdAt || new Date().toISOString(),
        updated_at: project.updatedAt || new Date().toISOString()
      };
      try {
        const { data, error } = await cli
          .from('user_projects')
          .upsert(payload, { onConflict: 'id' })
          .select();
        if (error) {
          if (!tableMissingWarned) {
            tableMissingWarned = true;
            console.info('[Supabase] Guardando proyecto en user_metadata (tabla user_projects no creada aún):', error.message);
          }
          return await saveMetadataProject(cli, payload);
        }
        return data;
      } catch (err) {
        console.warn('[Supabase] saveCloudProject error:', err);
        return await saveMetadataProject(cli, payload);
      }
    },

    // 7. Eliminar proyecto de la nube
    async deleteCloudProject(projectId) {
      const cli = initClient();
      if (!cli || !projectId) return null;
      try {
        const { error } = await cli
          .from('user_projects')
          .delete()
          .eq('id', projectId);
        if (error) {
          await deleteMetadataProject(cli, projectId);
        }
      } catch (err) {
        await deleteMetadataProject(cli, projectId);
      }
    }
  };

  global.SupabaseSync = SupabaseSync;
  global.supabaseClient = initClient();
})(window);
