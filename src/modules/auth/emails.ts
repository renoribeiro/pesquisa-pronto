/**
 * Templates de email transacional de autenticação.
 * HTML simples e responsivo (inline styles para compatibilidade com clientes).
 */

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#0f4c81;padding:20px 24px;color:#fff;font-size:18px;font-weight:bold;">
        Pronto Satisfação
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:18px;margin:0 0 12px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;">
        Prontoclínica de Fortaleza — mensagem automática, não responda.
      </div>
    </div>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#0f4c81;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;">${label}</a>`;
}

export function passwordResetEmail(p: { name: string; url: string; ttlMinutes: number }): string {
  return layout(
    "Redefinição de senha",
    `<p>Olá, ${p.name}.</p>
     <p>Recebemos um pedido para redefinir sua senha. Clique no botão abaixo (válido por ${p.ttlMinutes} minutos):</p>
     <p style="margin:20px 0;">${button(p.url, "Redefinir senha")}</p>
     <p style="color:#6b7280;font-size:13px;">Se você não solicitou, ignore este email.</p>`,
  );
}

export function inviteEmail(p: { name: string; url: string; inviterName?: string }): string {
  return layout(
    "Convite de acesso",
    `<p>Olá, ${p.name}.</p>
     <p>${p.inviterName ? `${p.inviterName} convidou` : "Você foi convidado"} você para acessar o painel da Pronto Satisfação.</p>
     <p>Defina sua senha para ativar a conta:</p>
     <p style="margin:20px 0;">${button(p.url, "Definir senha e entrar")}</p>`,
  );
}
