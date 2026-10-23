import { Router } from 'express';
import { readFileSync } from 'node:fs';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

export function docsRouter(config) {
    const source = readFileSync(new URL('../docs/openapi.yaml', import.meta.url), 'utf8');
    const document = parse(source);
    // Try it out must target this server, including its actual port/proxy origin.
    document.servers = [{ url: '/api/v1', description: 'API đang phục vụ Swagger UI' }];
    document.components.securitySchemes.refreshCookie.name = config.cookieName;
    for (const path of Object.values(document.paths)) {
        for (const operation of Object.values(path)) {
            // Origin is a browser-controlled header, not a user-editable input.
            if (operation.parameters) operation.parameters = operation.parameters.filter(parameter => parameter.$ref !== '#/components/parameters/Origin');
        }
    }
    document.components.parameters.CsrfHeader.schema.default = '1';

    const options = {
        customSiteTitle: 'Private Diary API — Swagger UI',
        swaggerOptions: {
            url: '/api-docs/openapi.json',
            validatorUrl: null,
            persistAuthorization: false,
            withCredentials: true,
            displayRequestDuration: true,
            requestInterceptor: function (request) {
                const url = new URL(request.url, window.location.href);
                if (url.origin === window.location.origin && url.pathname.startsWith('/api/v1/auth/')) {
                    request.headers['X-CSRF-Protection'] = '1';
                }
                return request;
            },
        },
    };
    const router = Router();
    // Keep CSP enabled. Only disable HTTPS upgrading for local HTTP documentation.
    if (config.env !== 'production') {
        router.use(helmet.contentSecurityPolicy({ directives: { upgradeInsecureRequests: null } }));
    }
  function getOpenApiJson(_req, res) {
    res.json(document);
  }
  function getOpenApiYaml(_req, res) {
    res.type('application/yaml').send(source);
  }
  router.get('/openapi.json', getOpenApiJson);
  router.get('/openapi.yaml', getOpenApiYaml);
    router.use(swaggerUi.serveFiles(undefined, options));
    router.get('/', swaggerUi.setup(undefined, options));
    return router;
}
