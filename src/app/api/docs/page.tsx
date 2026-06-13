import Script from "next/script";

export const metadata = { title: "API Docs — Pronto Satisfação" };

/**
 * Swagger UI via CDN — renderiza a documentação OpenAPI da API v1.
 */
export default function ApiDocsPage() {
  return (
    <div>
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
      />
      <div id="swagger-ui" />
      <Script
        src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"
        strategy="afterInteractive"
      />
      <Script id="swagger-init" strategy="afterInteractive">
        {`
          function initSwagger() {
            if (window.SwaggerUIBundle && window.SwaggerUIStandalonePreset) {
              SwaggerUIBundle({
                url: '/api/docs/openapi.json',
                dom_id: '#swagger-ui',
                presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
                layout: 'StandaloneLayout'
              });
            } else {
              setTimeout(initSwagger, 50);
            }
          }
          initSwagger();
        `}
      </Script>
    </div>
  );
}
