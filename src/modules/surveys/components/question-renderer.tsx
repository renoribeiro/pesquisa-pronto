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
        <Label className="text-base font-extrabold text-[#3A3333] leading-snug">
          {q.title}
          {q.required ? <span className="ml-1 text-destructive font-bold">*</span> : null}
        </Label>
        {q.description ? (
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed font-semibold">{q.description}</p>
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
  const inputBaseClass = "bg-background border-0 shadow-neumorphic-inset rounded-2xl h-11 px-4 text-base focus-visible:shadow-neumorphic-inset-deep focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none transition-all duration-300 text-[#3A3333] placeholder:text-[#A0AEC0] w-full md:text-sm";

  switch (q.type) {
    case "NPS":
      return <ScaleButtons min={0} max={10} value={value} onChange={onChange} disabled={disabled} lowLabel={String(cfg.lowLabel ?? "")} highLabel={String(cfg.highLabel ?? "")} title={q.title} />;
    case "NUMERIC_SCALE":
      return <ScaleButtons min={Number(cfg.min ?? 1)} max={Number(cfg.max ?? 5)} value={value} onChange={onChange} disabled={disabled} lowLabel={String(cfg.lowLabel ?? "")} highLabel={String(cfg.highLabel ?? "")} title={q.title} />;
    case "STAR_RATING":
    case "STAR_RATING_TEXT":
      return <StarsInput max={Number(cfg.max ?? 5)} value={value} onChange={onChange} disabled={disabled} withText={q.type === "STAR_RATING_TEXT"} title={q.title} />;
    case "EMOJI":
      return <EmojiInput set={(cfg.set as string[]) ?? ["😞", "😐", "🙂", "😊", "😁"]} value={value} onChange={onChange} disabled={disabled} title={q.title} />;
    case "MULTIPLE_CHOICE":
      return <RadioInput options={q.options} value={value} onChange={onChange} disabled={disabled} title={q.title} />;
    case "DROPDOWN":
      return (
        <select
          className="h-11 w-full rounded-2xl shadow-neumorphic-inset bg-background px-4 text-base text-[#3A3333] border-0 focus:shadow-neumorphic-inset-deep focus:ring-2 focus:ring-[#901A1E] focus:ring-offset-2 focus:ring-offset-[#EBE6E6] focus:outline-none transition-all duration-300 md:text-sm appearance-none cursor-pointer"
          style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236E6565' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: "right 1rem center", backgroundRepeat: "no-repeat", backgroundSize: "1.25rem" }}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={q.title}
        >
          <option value="" className="bg-[#EBE6E6]">Selecione...</option>
          {q.options.map((o) => (
            <option key={o.id} value={o.value} className="bg-[#EBE6E6] text-[#3A3333]">
              {o.label}
            </option>
          ))}
        </select>
      );
    case "CHECKBOX":
      return <CheckboxInput options={q.options} value={value} onChange={onChange} disabled={disabled} max={cfg.maxSelections ? Number(cfg.maxSelections) : undefined} title={q.title} />;
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
          className={inputBaseClass}
          aria-label={q.title}
        />
      );
    case "TEXT":
    default:
      return cfg.multiline === false ? (
        <Input 
          value={(value as string) ?? ""} 
          onChange={(e) => onChange(e.target.value)} 
          disabled={disabled} 
          maxLength={Number(cfg.maxLength ?? 1000)}
          className={inputBaseClass}
          aria-label={q.title}
        />
      ) : (
        <Textarea 
          value={(value as string) ?? ""} 
          onChange={(e) => onChange(e.target.value)} 
          disabled={disabled} 
          maxLength={Number(cfg.maxLength ?? 1000)} 
          rows={4}
          className="bg-background border-0 shadow-neumorphic-inset rounded-2xl p-4 text-base focus-visible:shadow-neumorphic-inset-deep focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none transition-all duration-300 text-[#3A3333] placeholder:text-[#A0AEC0] w-full md:text-sm min-h-[100px]"
          aria-label={q.title}
        />
      );
  }
}

function ScaleButtons({ min, max, value, onChange, disabled, lowLabel, highLabel, title }: { min: number; max: number; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; lowLabel?: string; highLabel?: string; title: string }) {
  const nums = [];
  for (let i = min; i <= max; i++) nums.push(i);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={title}>
        {nums.map((n) => {
          const isSelected = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              role="radio"
              aria-checked={isSelected}
              aria-label={`Nota ${n}`}
              onClick={() => onChange(n)}
              className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-0 cursor-pointer active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6]",
                isSelected 
                  ? "bg-[#901A1E] text-white shadow-neumorphic-inset scale-95" 
                  : "bg-background hover:bg-[#E0DADA] text-[#3A3333] shadow-neumorphic hover:shadow-neumorphic-hover"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {lowLabel || highLabel ? (
        <div className="flex justify-between text-xs font-semibold text-[#6E6565] px-1 pt-1">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function StarsInput({ max, value, onChange, disabled, withText, title }: { max: number; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; withText?: boolean; title: string }) {
  const v = typeof value === "object" && value ? (value as { stars?: number; text?: string }) : { stars: Number(value) || 0 };
  const stars = v.stars ?? 0;
  return (
    <div className="space-y-4">
      <div className="shadow-neumorphic-inset bg-background p-3.5 rounded-xl inline-flex gap-3 items-center border-0" role="radiogroup" aria-label={title}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const active = n <= stars;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              role="radio"
              aria-checked={active}
              aria-label={`${n} de ${max} estrelas`}
              onClick={() => onChange(withText ? { ...v, stars: n } : n)}
              className="transition-all duration-200 active:scale-90 border-0 bg-transparent cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-[#901A1E]"
            >
              <Star className={cn("h-8 w-8 transition-all duration-200", active ? "fill-[#C5A059] text-[#C5A059] scale-110 drop-shadow-[0_2px_4px_rgba(197,160,89,0.3)]" : "text-[#a8a0a0] fill-transparent hover:text-[#C5A059]")} />
            </button>
          );
        })}
      </div>
      {withText ? (
        <Textarea
          placeholder="Conte mais (opcional)"
          value={v.text ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...v, stars, text: e.target.value })}
          className="bg-background border-0 shadow-neumorphic-inset rounded-2xl p-4 text-base focus-visible:shadow-neumorphic-inset-deep focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none transition-all duration-300 text-[#3A3333] placeholder:text-[#A0AEC0] w-full md:text-sm min-h-[100px]"
          aria-label="Comentário adicional"
        />
      ) : null}
    </div>
  );
}

function EmojiInput({ set, value, onChange, disabled, title }: { set: string[]; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; title: string }) {
  return (
    <div className="flex gap-4 flex-wrap" role="radiogroup" aria-label={title}>
      {set.map((emoji, i) => {
        const isSelected = value === i;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            role="radio"
            aria-checked={isSelected}
            aria-label={`Reação ${i + 1}`}
            onClick={() => onChange(i)}
            className={cn(
              "h-14 w-14 rounded-2xl flex items-center justify-center text-3xl transition-all duration-300 border-0 cursor-pointer active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6]",
              isSelected 
                ? "shadow-neumorphic-inset bg-[#EBE6E6] border border-[#901A1E]/30 scale-105" 
                : "bg-background shadow-neumorphic hover:shadow-neumorphic-hover opacity-80 hover:opacity-100"
            )}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}

function RadioInput({ options, value, onChange, disabled, title }: { options: RenderQuestion["options"]; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; title: string }) {
  return (
    <div className="grid gap-3.5" role="radiogroup" aria-label={title}>
      {options.map((o, idx) => {
        const isSelected = value === o.value;
        const letter = String.fromCharCode(65 + idx); // A, B, C...
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-4 w-full rounded-2xl p-4 text-left transition-all duration-300 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#901A1E] focus:ring-offset-2 focus:ring-offset-[#EBE6E6]",
              isSelected 
                ? "bg-[#EBE6E6] shadow-neumorphic-inset border-l-4 border-[#901A1E] translate-y-[0.5px]" 
                : "bg-background shadow-neumorphic hover:shadow-neumorphic-hover text-[#3A3333]"
            )}
          >
            <span className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold uppercase transition-all duration-300",
              isSelected 
                ? "shadow-neumorphic-inset bg-[#901A1E] text-white" 
                : "shadow-neumorphic bg-background text-[#6E6565]"
            )}>
              {letter}
            </span>
            <span className="font-semibold text-sm text-[#3A3333]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CheckboxInput({ options, value, onChange, disabled, max, title }: { options: RenderQuestion["options"]; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; max?: number; title: string }) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  function toggle(v: string) {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else if (!max || selected.length < max) onChange([...selected, v]);
  }
  return (
    <div className="grid gap-3.5" role="group" aria-label={title}>
      {options.map((o, idx) => {
        const isSelected = selected.includes(o.value);
        const letter = String.fromCharCode(65 + idx); // A, B, C...
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            role="checkbox"
            aria-checked={isSelected}
            onClick={() => toggle(o.value)}
            className={cn(
              "flex items-center gap-4 w-full rounded-2xl p-4 text-left transition-all duration-300 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#901A1E] focus:ring-offset-2 focus:ring-offset-[#EBE6E6]",
              isSelected 
                ? "bg-[#EBE6E6] shadow-neumorphic-inset border-l-4 border-[#901A1E] translate-y-[0.5px]" 
                : "bg-background shadow-neumorphic hover:shadow-neumorphic-hover text-[#3A3333]"
            )}
          >
            <span className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold uppercase transition-all duration-300",
              isSelected 
                ? "shadow-neumorphic-inset bg-[#901A1E] text-white" 
                : "shadow-neumorphic bg-background text-[#6E6565]"
            )}>
              {letter}
            </span>
            <span className="font-semibold text-sm text-[#3A3333]">{o.label}</span>
          </button>
        );
      })}
      {max ? <p className="text-xs font-semibold text-[#6E6565] mt-1 ml-1">Máximo {max} seleções</p> : null}
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
    <ol className="space-y-3">
      {order.map((val, i) => {
        const opt = options.find((o) => o.value === val);
        return (
          <li key={val} className="flex items-center justify-between rounded-2xl bg-background shadow-neumorphic px-4 py-3 text-sm text-[#3A3333] border-0 transition-all duration-300">
            <span className="font-semibold">
              {i + 1}. {opt?.label ?? val}
            </span>
            <span className="flex gap-2">
              <button 
                type="button" 
                disabled={disabled} 
                aria-label={`Mover ${opt?.label ?? val} para cima`} 
                onClick={() => move(i, -1)} 
                className="h-8 w-8 rounded-xl bg-background shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset flex items-center justify-center font-bold text-base text-[#901A1E] border-0 transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none"
              >
                ↑
              </button>
              <button 
                type="button" 
                disabled={disabled} 
                aria-label={`Mover ${opt?.label ?? val} para baixo`} 
                onClick={() => move(i, 1)} 
                className="h-8 w-8 rounded-xl bg-background shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset flex items-center justify-center font-bold text-base text-[#901A1E] border-0 transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none"
              >
                ↓
              </button>
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
    <div className="overflow-x-auto shadow-neumorphic-inset bg-background p-4 rounded-3xl border-0">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th />
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-center text-xs font-bold text-[#6E6565]">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r} className="border-b border-[#a8a0a0]/10 last:border-0">
              <td className="py-3 pr-4 text-sm font-semibold text-[#3A3333]">{r}</td>
              {columns.map((c) => (
                <td key={c} className="text-center py-3">
                  <input 
                    type="radio" 
                    name={`m-${r}`} 
                    checked={answers[r] === c} 
                    disabled={disabled} 
                    onChange={() => onChange({ ...answers, [r]: c })} 
                    aria-label={`Linha ${r}, coluna ${c}`}
                    className="h-5 w-5 accent-[#901A1E] bg-background shadow-neumorphic border-0 cursor-pointer focus:ring-2 focus:ring-[#901A1E] focus:ring-offset-2 focus:ring-offset-[#EBE6E6] focus:outline-none"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
