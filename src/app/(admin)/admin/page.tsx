import { requireTenantDb, responseSectorWhere, surveySectorWhere } from "@/lib/session";
import { scopeOf } from "@/lib/rbac";
import { ExecutiveInsightsWidget } from "@/modules/analytics/components/executive-insights";
import { ClipboardList, TrendingUp, AlertCircle, Building2 } from "lucide-react";

export const metadata = { title: "Painel — Pronto Satisfação" };

export default async function AdminHomePage() {
  const { ctx, db } = await requireTenantDb();
  const scope = scopeOf(ctx.role, "survey:view");
  const respSector = responseSectorWhere(ctx, scope);
  const surveySector = surveySectorWhere(ctx, scope);

  const [surveys, responses, openAlerts, latestSummary, tenant] = await Promise.all([
    db.survey.count({ where: { status: "PUBLISHED", ...surveySector } }),
    db.response.count({ where: { completed: true, ...respSector } }),
    db.alert.count({ where: { status: "OPEN" } }),
    db.executiveSummary.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    }),
    db.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    }),
  ]);

  const cards = [
    { 
      label: "Pesquisas Ativas", 
      value: surveys, 
      icon: ClipboardList, 
      color: "text-[#C5A059]",
      desc: "Formulários em veiculação" 
    },
    { 
      label: "Respostas Acumuladas", 
      value: responses, 
      icon: TrendingUp, 
      color: "text-[#901A1E]",
      desc: "Total de feedbacks colhidos" 
    },
    { 
      label: "Alertas Pendentes", 
      value: openAlerts, 
      icon: AlertCircle, 
      color: openAlerts > 0 ? "text-[#901A1E] animate-pulse" : "text-[#6E6565]",
      desc: "Casos de Close-Loop abertos" 
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-[#EBE6E6] shadow-neumorphic rounded-2xl p-8 sm:p-10 border-0 hover:shadow-neumorphic-hover transition-all duration-300">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-[#C5A059]/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-[#901A1E]/5 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2.5 max-w-2xl">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#C5A059] bg-[#901A1E]/10 px-2.5 py-1 rounded-full">
              Painel de Gestão da Satisfação
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#3A3333] leading-tight sm:text-4xl">
              Olá, <span className="text-[#901A1E]">{ctx.name}</span>
            </h1>
            <p className="text-sm font-semibold text-[#6E6565] leading-relaxed">
              “Cada resposta é uma oportunidade de cuidar melhor. Acompanhe a percepção dos seus pacientes em tempo real e guie a Prontoclínica rumo à excelência contínua.”
            </p>
          </div>
          <div className="flex items-center gap-3 bg-[#EBE6E6] p-4 rounded-2xl shadow-neumorphic-inset border-0 shrink-0">
            <div className="h-12 w-12 rounded-full bg-[#EBE6E6] shadow-neumorphic flex items-center justify-center text-white font-bold text-lg">
              <Building2 className="h-5 w-5 text-[#901A1E]" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#6E6565] uppercase tracking-wider">Unidade</div>
              <div className="text-sm font-extrabold text-[#3A3333]">{tenant?.name || "Fortaleza"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div 
              key={c.label}
              className="bg-[#EBE6E6] shadow-neumorphic rounded-xl p-6 border-0 hover:-translate-y-1 hover:shadow-neumorphic-hover transition-all duration-300 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6E6565]">{c.label}</span>
                <div className="h-8 w-8 rounded-xl bg-[#EBE6E6] shadow-neumorphic-inset flex items-center justify-center shrink-0">
                  <Icon className={`h-4 w-4 ${c.color}`} />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-4xl font-extrabold text-[#3A3333] tracking-tight">{c.value}</div>
                <p className="text-[11px] font-semibold text-[#6E6565] mt-1">{c.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Executive Summary Widget */}
      <ExecutiveInsightsWidget initialSummary={latestSummary} />

      <p className="text-[#6E6565] text-sm font-semibold pt-4">
        O dashboard completo com NPS, CSAT e gráficos detalhados está em{" "}
        <a className="text-[#901A1E] hover:text-[#a12428] font-bold underline transition-colors" href="/admin/analytics">
          Analytics
        </a>
        .
      </p>
    </div>
  );}
