"use client";

import { Star } from "lucide-react";
import type { QuestionType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface RenderQuestion {
  id: string;
  type: QuestionType;
  title: string;
  description?: string | null;
  required: boolean;
  config: Record<string, unknown>;
  options: { id: string; label: string; value: string }[];
}

interface Props {
  question: RenderQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

/** Renderiza o input de uma pergunta conforme o tipo. Usado no preview e no formulário público. */
export function QuestionRenderer({ question: q, value, onChange, disabled }: Props) {
  const cfg = q.config ?? {};

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-base font-medium">
          {q.title}
          {q.required ? <span className="ml-1 text-destructive">*</span> : null}
        </Label>
        {q.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{q.description}</p>
        ) : null}
      </div>
      <QuestionInput q={q} cfg={cfg} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function QuestionInput({
  q,
  cfg,
  value,
  onChange,
  disabled,
}: {
  q: RenderQuestion;
  cfg: Record<string, unknown>;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  switch (q.type) {
    case "NPS":
      return <ScaleButtons min={0} max={10} value={value} onChange={onChange} disabled={disabled} lowLabel={String(cfg.lowLabel ?? "")} highLabel={String(cfg.highLabel ?? "")} />;
    case "NUMERIC_SCALE":
      return <ScaleButtons min={Number(cfg.min ?? 1)} max={Number(cfg.max ?? 5)} value={value} onChange={onChange} disabled={disabled} lowLabel={String(cfg.lowLabel ?? "")} highLabel={String(cfg.highLabel ?? "")} />;
    case "STAR_RATING":
    case "STAR_RATING_TEXT":
      return <StarsInput max={Number(cfg.max ?? 5)} value={value} onChange={onChange} disabled={disabled} withText={q.type === "STAR_RATING_TEXT"} />;
    case "EMOJI":
      return <EmojiInput set={(cfg.set as string[]) ?? ["😞", "😐", "🙂", "😊", "😁"]} value={value} onChange={onChange} disabled={disabled} />;
    case "MULTIPLE_CHOICE":
      return <RadioInput options={q.options} value={value} onChange={onChange} disabled={disabled} />;
    case "DROPDOWN":
      return (
        <select
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Selecione...</option>
          {q.options.map((o) => (
            <option key={o.id} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "CHECKBOX":
      return <CheckboxInput options={q.options} value={value} onChange={onChange} disabled={disabled} max={cfg.maxSelections ? Number(cfg.maxSelections) : undefined} />;
    case "RANKING":
      return <RankingInput options={q.options} value={value} onChange={onChange} disabled={disabled} />;
    case "MATRIX":
      return <MatrixInput rows={(cfg.rows as string[]) ?? []} columns={(cfg.columns as string[]) ?? []} value={value} onChange={onChange} disabled={disabled} />;
    case "DATETIME":
      return (
        <Input
          type={cfg.mode === "datetime" ? "datetime-local" : cfg.mode === "time" ? "time" : "date"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    case "TEXT":
    default:
      return cfg.multiline === false ? (
        <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={Number(cfg.maxLength ?? 1000)} />
      ) : (
        <Textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={Number(cfg.maxLength ?? 1000)} rows={4} />
      );
  }
}

function ScaleButtons({ min, max, value, onChange, disabled, lowLabel, highLabel }: { min: number; max: number; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; lowLabel?: string; highLabel?: string }) {
  const nums = [];
  for (let i = min; i <= max; i++) nums.push(i);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={value === n}
            aria-label={`Nota ${n}`}
            onClick={() => onChange(n)}
            className={cn(
              "h-10 w-10 rounded-md border text-sm font-medium transition-colors",
              value === n ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {lowLabel || highLabel ? (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function StarsInput({ max, value, onChange, disabled, withText }: { max: number; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; withText?: boolean }) {
  const v = typeof value === "object" && value ? (value as { stars?: number; text?: string }) : { stars: Number(value) || 0 };
  const stars = v.stars ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={n <= stars}
            aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
            onClick={() => onChange(withText ? { ...v, stars: n } : n)}
          >
            <Star className={cn("h-7 w-7", n <= stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      {withText ? (
        <Textarea
          placeholder="Conte mais (opcional)"
          value={v.text ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...v, stars, text: e.target.value })}
        />
      ) : null}
    </div>
  );
}

function EmojiInput({ set, value, onChange, disabled }: { set: string[]; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-3">
      {set.map((emoji, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          aria-pressed={value === i}
          aria-label={`Opção ${i + 1} de ${set.length}`}
          onClick={() => onChange(i)}
          className={cn("rounded-md p-2 text-3xl transition-transform", value === i ? "scale-125" : "opacity-60 hover:opacity-100")}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function RadioInput({ options, value, onChange, disabled }: { options: RenderQuestion["options"]; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm">
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} disabled={disabled} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function CheckboxInput({ options, value, onChange, disabled, max }: { options: RenderQuestion["options"]; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; max?: number }) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  function toggle(v: string) {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else if (!max || selected.length < max) onChange([...selected, v]);
  }
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} disabled={disabled} />
          {o.label}
        </label>
      ))}
      {max ? <p className="text-xs text-muted-foreground">Máximo {max} seleções</p> : null}
    </div>
  );
}

function RankingInput({ options, value, onChange, disabled }: { options: RenderQuestion["options"]; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const order = Array.isArray(value) && value.length ? (value as string[]) : options.map((o) => o.value);
  function move(idx: number, dir: -1 | 1) {
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }
  return (
    <ol className="space-y-1">
      {order.map((val, i) => {
        const opt = options.find((o) => o.value === val);
        return (
          <li key={val} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>
              {i + 1}. {opt?.label ?? val}
            </span>
            <span className="flex gap-1">
              <button type="button" disabled={disabled} aria-label={`Mover ${opt?.label ?? val} para cima`} onClick={() => move(i, -1)} className="px-1">↑</button>
              <button type="button" disabled={disabled} aria-label={`Mover ${opt?.label ?? val} para baixo`} onClick={() => move(i, 1)} className="px-1">↓</button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MatrixInput({ rows, columns, value, onChange, disabled }: { rows: string[]; columns: string[]; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const answers = (value as Record<string, string>) ?? {};
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th />
            {columns.map((c) => (
              <th key={c} className="px-2 py-1 text-center text-xs font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td className="py-1 pr-2 text-sm">{r}</td>
              {columns.map((c) => (
                <td key={c} className="text-center">
                  <input type="radio" name={`m-${r}`} checked={answers[r] === c} disabled={disabled} onChange={() => onChange({ ...answers, [r]: c })} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
