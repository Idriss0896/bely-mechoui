// Petit adaptateur pour servir les fonctions serverless de Vercel pendant `npm run dev`.
//
// Vite ne connaît pas /api/* : sans ce plugin, l'administration et les
// notifications renvoient 404 en local. Le module api/*.js reste la seule
// source de vérité : on l'exécute tel quel en lui fournissant les deux helpers
// que Vercel ajoute à `res` (`status()` et `json()`), plus le corps déjà parsé.

const ROUTES = ["/api/menu", "/api/notifications", "/api/push"];

export function devApi() {
  return {
    name: "bely-dev-api",
    apply: "serve",
    configureServer(server) {
      for (const route of ROUTES) {
        const moduleId = `${route}.js`;

        server.middlewares.use(route, async (req, res) => {
          try {
            const { default: handler } = await server.ssrLoadModule(moduleId);

            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
            res.json = (payload) => {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(payload));
              return res;
            };

            if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const raw = Buffer.concat(chunks).toString("utf8").trim();
              req.body = raw ? JSON.parse(raw) : {};
            }

            await handler(req, res);
          } catch (error) {
            server.ssrFixStacktrace?.(error);
            server.config.logger.error(`[dev-api] ${route}: ${error?.message ?? error}`);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Erreur du serveur local" }));
            } else if (!res.writableEnded) {
              res.end();
            }
          }
        });
      }
    },
  };
}
