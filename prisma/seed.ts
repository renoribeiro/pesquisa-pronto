import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
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

async function main() {
  const tenantName = process.env.DEFAULT_TENANT_NAME ?? "Prontoclínica de Fortaleza";
  const tenantSlug = process.env.DEFAULT_TENANT_SLUG ?? "prontoclinica";
  const adminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@prontoclinicafortaleza.com.br";
  const adminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";

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
