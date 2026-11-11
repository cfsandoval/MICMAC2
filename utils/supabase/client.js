/* ===== Supabase Integration Helper for MICMAC Extendido ===== */
(function (global) {
  const SUPABASE_URL = 'https://qypksdsaejvcwiebpeos.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LiwzmwIjafVYij_AiF2AaA_V81Yv9a6';

  let client = null;

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

  const SupabaseSync = {
    url: SUPABASE_URL,
    key: SUPABASE_PUBLISHABLE_KEY,

    getClient() {
      return initClient();
    },

    isConfigured() {
      return Boolean(initClient());
    },

    // 1. Registro con Supabase Auth
    async signUp(email, password) {
      const cli = initClient();
      if (!cli) return { error: { message: 'Supabase SDK no disponible' } };
      try {
        const { data, error } = await cli.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: { display_name: email.trim() }
          }
        });
        return { data, error };
      } catch (err) {
        return { error: err };
      }
    },

    // 2. Inicio de sesión con Supabase Auth
    async signIn(email, password) {
      const cli = initClient();
      if (!cli) return { error: { message: 'Supabase SDK no disponible' } };
      try {
        const { data, error } = await cli.auth.signInWithPassword({
          email: email.trim(),
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

    // 5. Cargar proyectos de la nube (tabla user_projects)
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
          console.warn('[Supabase] fetchCloudProjects warning (table may not exist yet):', error.message);
          return null;
        }
        return data || [];
      } catch (err) {
        console.warn('[Supabase] fetchCloudProjects error:', err);
        return null;
      }
    },

    // 6. Guardar/Actualizar proyecto en la nube
    async saveCloudProject(project, userId) {
      const cli = initClient();
      if (!cli || !userId || !project) return null;
      try {
        const payload = {
          id: project.id,
          user_id: userId,
          name: project.name,
          desc: project.desc || '',
          mode: project.mode || 'custom',
          state: project.state || {},
          updated_at: new Date().toISOString()
        };
        const { data, error } = await cli
          .from('user_projects')
          .upsert(payload, { onConflict: 'id' })
          .select();
        if (error) {
          console.warn('[Supabase] saveCloudProject warning:', error.message);
          return null;
        }
        return data;
      } catch (err) {
        console.warn('[Supabase] saveCloudProject error:', err);
        return null;
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
        if (error) console.warn('[Supabase] deleteCloudProject warning:', error.message);
      } catch (err) {
        console.warn('[Supabase] deleteCloudProject error:', err);
      }
    }
  };

  global.SupabaseSync = SupabaseSync;
  global.supabaseClient = initClient();
})(window);
