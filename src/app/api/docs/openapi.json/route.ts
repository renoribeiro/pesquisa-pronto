/**
 * GET /api/docs/openapi.json
 * Serves the OpenAPI 3.1 specification for the Pronto Satisfação public API.
 */
export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Pronto Satisfação API",
      version: "1.0.0",
      description: "API pública para integração com o sistema de pesquisa de satisfação da Prontoclínica.",
      contact: { email: "suporte@prontoclinica.com.br" },
    },
    servers: [
      { url: "/api/v1", description: "Produção" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description: "Chave de API gerada no painel administrativo.",
        },
      },
      schemas: {
        Survey: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            slug: { type: "string" },
            status: { type: "string", enum: ["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"] },
            url: { type: "string", description: "URL pública do formulário" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Response: {
          type: "object",
          properties: {
            id: { type: "string" },
            surveyId: { type: "string" },
            channel: { type: "string" },
            npsScore: { type: "integer", nullable: true, minimum: 0, maximum: 10 },
            completed: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            answers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  questionId: { type: "string" },
                  value: {},
                },
              },
            },
          },
        },
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/surveys": {
        get: {
          summary: "Listar pesquisas ativas",
          tags: ["Surveys"],
          responses: {
            "200": {
              description: "Lista de pesquisas ativas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { "$ref": "#/components/schemas/Survey" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
            "401": { description: "Não autorizado", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } },
          },
        },
      },
      "/responses": {
        get: {
          summary: "Listar respostas",
          tags: ["Responses"],
          parameters: [
            { name: "surveyId", in: "query", schema: { type: "string" }, description: "Filtrar por pesquisa" },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
            { name: "since", in: "query", schema: { type: "string", format: "date-time" }, description: "Filtrar a partir desta data" },
          ],
          responses: {
            "200": {
              description: "Lista de respostas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { "$ref": "#/components/schemas/Response" } },
                      pagination: {
                        type: "object",
                        properties: {
                          page: { type: "integer" },
                          pageSize: { type: "integer" },
                          total: { type: "integer" },
                          totalPages: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Não autorizado" },
          },
        },
      },
    },
  };

  return Response.json(spec, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
