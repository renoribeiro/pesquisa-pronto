import "dotenv/config";
import { PrismaClient, UserRole, AlertType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Pontos de contato padrão da jornada do paciente (escopo §3.2.5)
const DEFAULT_TOUCH_POINTS = [
  { slug: "recepcao", name: "Recepção / Chegada", icon: "🏥" },
  { slug: "pos-consulta", name: "Pós-Consulta Médica", icon: "👨‍⚕️" },
  { slug: "pos-exame", name: "Pós-Exame Diagnóstico", icon: "🔬" },
  { slug: "day-hospital", name: "Day Hospital / Pós-Cirurgia", icon: "🏨" },
  { slug: "infraestrutura", name: "Infraestrutura e Instalações", icon: "🧹" },
  { slug: "pos-remoto", name: "Pós-Atendimento Remoto", icon: "📞" },
];

// Algumas especialidades iniciais (ajustáveis pelo admin depois)
const DEFAULT_SECTORS = [
  { slug: "oftalmologia", name: "Oftalmologia" },
  { slug: "cardiologia", name: "Cardiologia" },
  { slug: "clinica-geral", name: "Clínica Geral" },
  { slug: "recepcao", name: "Recepção" },
];

// Limiares de alerta padrão (configuráveis em Configurações → Alertas).
const DEFAULT_ALERT_THRESHOLDS: { type: AlertType; config: Record<string, number> }[] = [
  { type: AlertType.DETRACTOR, config: { below: 7 } },
  { type: AlertType.NEGATIVE_TREND, config: { minDrop: 10 } },
  { type: AlertType.EMERGING_THEME, config: { minVolume: 3, minTrend: 100 } },
  { type: AlertType.LOW_VOLUME, config: { minPerWeek: 5 } },
];

async function main() {
  const tenantName = process.env.DEFAULT_TENANT_NAME ?? "Prontoclínica de Fortaleza";
  const tenantSlug = process.env.DEFAULT_TENANT_SLUG ?? "prontoclinica";
  const adminEmail = (
    process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@prontoclinicafortaleza.com.br"
  )
    .trim()
    .toLowerCase();
  const providedPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const adminPassword = providedPassword ?? "ChangeMe123!";
  if (!providedPassword) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SEED_SUPER_ADMIN_PASSWORD é obrigatório em produção — recusando seed com senha fraca padrão.",
      );
    }
    console.warn(
      "⚠ Usando senha padrão fraca para o super admin. Defina SEED_SUPER_ADMIN_PASSWORD.",
    );
  }

  // Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName },
    create: { name: tenantName, slug: tenantSlug, timezone: "America/Fortaleza" },
  });
  console.log(`✔ Tenant: ${tenant.name} (${tenant.id})`);

  // Super admin
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { role: UserRole.SUPER_ADMIN, active: true },
    create: {
      tenantId: tenant.id,
      name: "Super Admin",
      email: adminEmail,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      active: true,
    },
  });
  console.log(`✔ Super Admin: ${admin.email}`);

  // Pontos de contato padrão
  for (const tp of DEFAULT_TOUCH_POINTS) {
    await prisma.touchPoint.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: tp.slug } },
      update: { name: tp.name, icon: tp.icon, isDefault: true },
      create: { tenantId: tenant.id, ...tp, isDefault: true },
    });
  }
  console.log(`✔ ${DEFAULT_TOUCH_POINTS.length} pontos de contato padrão`);

  // Setores iniciais
  for (const s of DEFAULT_SECTORS) {
    await prisma.sector.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: s.slug } },
      update: { name: s.name },
      create: { tenantId: tenant.id, ...s },
    });
  }
  console.log(`✔ ${DEFAULT_SECTORS.length} setores iniciais`);

  // Limiares de alerta (idempotente por tenant+tipo). Só cria se ausente, para
  // não sobrescrever ajustes feitos pelo admin em execuções repetidas do seed.
  for (const t of DEFAULT_ALERT_THRESHOLDS) {
    await prisma.alertThreshold.upsert({
      where: { tenantId_type: { tenantId: tenant.id, type: t.type } },
      update: {},
      create: { tenantId: tenant.id, type: t.type, config: t.config, active: true },
    });
  }
  console.log(`✔ ${DEFAULT_ALERT_THRESHOLDS.length} limiares de alerta padrão`);

  console.log("\n🌱 Seed concluído.");
}

main()
  .catch((e) => {
    console.error("❌ Seed falhou:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
