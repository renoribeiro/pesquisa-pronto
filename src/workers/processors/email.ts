import type { Job } from "bullmq";
import { sendMail } from "@/lib/mailer";
import type { SendEmailJob } from "@/server/queues";

/** Processa jobs da fila de email. */
export async function processEmail(job: Job): Promise<void> {
  if (job.name !== "send") return;
  const data = job.data as SendEmailJob;
  await sendMail({
    to: data.to,
    subject: data.subject,
    html: data.html,
    text: data.text,
  });
  console.log(
    `[worker:email] enviado job ${job.id} → ${Array.isArray(data.to) ? data.to.join(",") : data.to}`,
  );
}
