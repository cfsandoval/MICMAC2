# Análisis Estructural MICMAC

Aplicación web estática (HTML + CSS + JavaScript, sin dependencias ni build) para:

- Definir variables y una **matriz de influencias justificada** (concepto, evidencia e indicador por cruce).
- Visualizar el **plano influencia–dependencia** por cuadrantes (directo e indirecto).
- **Simular en el tiempo** intervenciones externas sobre cualquier variable.
- Consultar la **metodología** de todos los cálculos (pestaña 5).

## Ejecutar localmente

Abrir `index.html` en el navegador, o servir la carpeta:

```bash
npx serve .
```

## Desplegar en Vercel (vía GitHub)

1. Entrar en <https://vercel.com/new> e iniciar sesión con GitHub.
2. Importar el repositorio `cfsandoval/MICMAC2`.
3. Dejar los valores por defecto (Framework: *Other*, sin comando de build; `vercel.json` ya lo configura) y pulsar **Deploy**.

Cada `git push` a `main` genera un despliegue automático.

Los datos se guardan en el `localStorage` del navegador; use **Exportar / Importar** para respaldarlos.
