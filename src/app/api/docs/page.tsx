import Script from "next/script";

export const metadata = { title: "API Docs — Pronto Satisfação" };

/**
 * Swagger UI via CDN — renderiza a documentação OpenAPI da API v1.
 *
 * Versão pinada exata + Subresource Integrity (SRI): impede que uma mudança
 * (ou comprometimento) do CDN injete código arbitrário na página. Os hashes
 * sha384 abaixo são imutáveis para a versão `swagger-ui-dist@5.17.14`.
 */
const SWAGGER_VERSION = "5.17.14";
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}`;

const SRI = {
  css: "sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn",
  bundle: "sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep",
  standalone:
    "sha384-2YH8WDRaj7V2OqU/trsmzSagmk/E2SutiCsGkdgoQwC9pNUJV1u/141DHB6jgs8t",
};

export default function ApiDocsPage() {
  return (
    <div>
      <link
        rel="stylesheet"
        href={`${CDN}/swagger-ui.css`}
        integrity={SRI.css}
        crossOrigin="anonymous"
      />
      <div id="swagger-ui" />
      <Script
        src={`${CDN}/swagger-ui-bundle.js`}
        integrity={SRI.bundle}
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <Script
        src={`${CDN}/swagger-ui-standalone-preset.js`}
        integrity={SRI.standalone}
        crossOrigin="anonymous"
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
