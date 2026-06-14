"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  X,
  Settings2,
  AlertTriangle,
  TrendingDown,
  FileText,
  Send,
} from "lucide-react";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  getNotificationPreference,
  updateNotificationPreference,
  type NotificationView,
} from "@/modules/notifications/actions";

const TYPE_ICON: Record<string, typeof Bell> = {
  NEW_DETRACTOR: AlertTriangle,
  TREND_ALERT: TrendingDown,
  WEEKLY_SUMMARY: FileText,
  REPORT_SENT: FileText,
  DISPATCH_ERROR: Send,
};

// Tipos que o usuário pode silenciar a partir do sino.
const MUTABLE = [
  { type: "NEW_DETRACTOR", label: "Detratores" },
  { type: "TREND_ALERT", label: "Tendências e temas" },
  { type: "WEEKLY_SUMMARY", label: "Resumos semanais" },
  { type: "REPORT_SENT", label: "Relatórios" },
  { type: "DISPATCH_ERROR", label: "Falhas de disparo" },
] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const prevUnread = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const reloadList = useCallback(async () => {
    try {
      setItems(await getNotifications(20));
    } catch {
      /* silencioso */
    }
  }, []);

  // Carga inicial + stream SSE da contagem de não-lidas.
  useEffect(() => {
    let es: EventSource | null = null;
    getUnreadCount()
      .then((c) => {
        setUnread(c);
        prevUnread.current = c;
      })
      .catch(() => {});
    // setState deferido (pós-await) para não disparar render em cascata no effect.
    getNotifications(20)
      .then(setItems)
      .catch(() => {});

    try {
      es = new EventSource("/api/notifications/stream");
      es.addEventListener("unread", (e) => {
        try {
          const { count } = JSON.parse((e as MessageEvent).data) as { count: number };
          setUnread(count);
          // Subiu → chegou notificação nova: recarrega a lista.
          if (count > prevUnread.current) reloadList();
          prevUnread.current = count;
        } catch {
          /* ignora payload inválido */
        }
      });
    } catch {
      /* navegador sem EventSource: cai para a carga inicial */
    }
    return () => es?.close();
  }, [reloadList]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) reloadList();
  }

  async function onMarkRead(id: string) {
    setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await markNotificationRead(id).catch(() => {});
  }

  async function onMarkAll() {
    setItems((xs) => xs.map((n) => ({ ...n, read: true })));
    setUnread(0);
    prevUnread.current = 0;
    await markAllNotificationsRead().catch(() => {});
  }

  async function onArchive(id: string, wasRead: boolean) {
    setItems((xs) => xs.filter((n) => n.id !== id));
    if (!wasRead) setUnread((u) => Math.max(0, u - 1));
    await archiveNotification(id).catch(() => {});
  }

  async function openPrefs() {
    const next = !prefsOpen;
    setPrefsOpen(next);
    if (next) {
      try {
        const p = await getNotificationPreference();
        setEmailEnabled(p.emailEnabled);
        setMuted(p.mutedTypes);
      } catch {
        /* mantém padrões */
      }
    }
  }

  async function savePrefs(nextEmail: boolean, nextMuted: string[]) {
    setEmailEnabled(nextEmail);
    setMuted(nextMuted);
    await updateNotificationPreference({ emailEnabled: nextEmail, mutedTypes: nextMuted }).catch(() => {});
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificações"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#6E6565] transition-colors hover:bg-[#E0DADA]/50 hover:text-[#901A1E]"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#901A1E] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border-0 bg-background shadow-neumorphic">
          <div className="flex items-center justify-between border-b border-[#a8a0a0]/20 px-4 py-3">
            <span className="font-extrabold text-[#3A3333]">Notificações</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={onMarkAll}
                  className="text-xs font-semibold text-[#901A1E] hover:underline"
                >
                  Marcar todas
                </button>
              )}
              <button
                type="button"
                onClick={openPrefs}
                aria-label="Preferências de notificação"
                className="text-[#6E6565] hover:text-[#901A1E]"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {prefsOpen && (
            <div className="space-y-3 border-b border-[#a8a0a0]/20 bg-[#E0DADA]/20 px-4 py-3 text-sm">
              <label className="flex items-center justify-between">
                <span className="font-semibold text-[#3A3333]">Receber também por e-mail</span>
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => savePrefs(e.target.checked, muted)}
                />
              </label>
              <div>
                <p className="mb-1 font-semibold text-[#3A3333]">Silenciar tipos</p>
                {MUTABLE.map((m) => {
                  const isMuted = muted.includes(m.type);
                  return (
                    <label key={m.type} className="flex items-center justify-between py-0.5">
                      <span className="text-[#6E6565]">{m.label}</span>
                      <input
                        type="checkbox"
                        checked={isMuted}
                        onChange={(e) =>
                          savePrefs(
                            emailEnabled,
                            e.target.checked
                              ? [...muted, m.type]
                              : muted.filter((t) => t !== m.type),
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#6E6565]">Nenhuma notificação.</p>
            ) : (
              items.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell;
                return (
                  <div
                    key={n.id}
                    className={`group flex gap-3 border-b border-[#a8a0a0]/10 px-4 py-3 ${
                      n.read ? "" : "bg-[#C5A059]/10"
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#901A1E]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#3A3333]">{n.title}</p>
                      {n.body && <p className="text-xs text-[#6E6565]">{n.body}</p>}
                      <p className="mt-0.5 text-[10px] text-[#6E6565]">{timeAgo(n.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(n.id)}
                          aria-label="Marcar como lida"
                          className="text-[#6E6565] hover:text-[#2e7d52]"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onArchive(n.id, n.read)}
                        aria-label="Arquivar"
                        className="text-[#6E6565] hover:text-[#901A1E]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
