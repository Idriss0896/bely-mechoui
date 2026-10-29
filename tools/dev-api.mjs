// Petit adaptateur pour servir /api/menu pendant `npm run dev`.
//
// Vite ne connaît pas les fonctions serverless de Vercel : sans ce plugin,
// l'espace /#admin renvoie 404 en local et il est impossible de tester
// l'enregistrement de la carte avant de déployer.
//
// Le module api/menu.js reste la seule source de vérité : on l'exécute tel
// quel est en lui fournissant les deux helpers que Vercel ajoute à `res`
// (`status()` et `json()`), plus le corps de requête déjà parsé.

export function devApi() {
  return {
    name: "bely-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/menu", async (req, res, next) => {
        try {
          const { default: handler } = await server.ssrLoadModule("/api/menu.js");

          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (payload) => {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(payload));
            return res;
          };

          if (req.method === "POST" || req.method === "PUT") {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const raw = Buffer.concat(chunks).toString("utf8").trim();
            req.body = raw ? JSON.parse(raw) : {};
          }

          await handler(req, res);
        } catch (error) {
          server.ssrFixStacktrace?.(error);
          server.config.logger.error(`[dev-api] ${error?.message ?? error}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Erreur du serveur local" }));
          } else if (!res.writableEnded) {
            res.end();
          }
        }
      });
    },
  };
}
