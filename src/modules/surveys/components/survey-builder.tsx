"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";
import type { QuestionType } from "@prisma/client";
import { QUESTION_TYPES, QUESTION_TYPE_MAP } from "@/modules/surveys/question-types";
import { saveSurvey, setSurveyStatus } from "@/modules/surveys/actions";
import { QuestionRenderer, type RenderQuestion } from "./question-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BuilderQuestion {
  key: string;
  type: QuestionType;
  title: string;
  description: string;
  required: boolean;
  config: Record<string, unknown>;
  options: { label: string; value: string }[];
}

export interface BuilderRule {
  targetQuestionKey: string;
  action: "SHOW" | "HIDE";
  join: "AND" | "OR";
  conditions: { questionKey: string; operator: string; value: string }[];
}

export interface BuilderInitial {
  id: string;
  title: string;
  description: string;
  slug: string;
  status: string;
  pageMode: "ONE_PER_PAGE" | "ALL_IN_ONE";
  showProgress: boolean;
  randomize: boolean;
  allowMultiple: boolean;
  thankYouMessage: string;
  questions: BuilderQuestion[];
  rules: BuilderRule[];
  sectorIds: string[];
  touchPointIds: string[];
  themeId: string;
}

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `q-${Math.random().toString(36).slice(2)}`;
}

export function SurveyBuilder({
  initial,
  sectors,
  touchPoints,
  themes,
}: {
  initial: BuilderInitial;
  sectors: { id: string; name: string }[];
  touchPoints: { id: string; name: string }[];
  themes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [meta, setMeta] = useState({
    title: initial.title,
    description: initial.description,
    slug: initial.slug,
    pageMode: initial.pageMode,
    showProgress: initial.showProgress,
    randomize: initial.randomize,
    allowMultiple: initial.allowMultiple,
    thankYouMessage: initial.thankYouMessage,
    themeId: initial.themeId || "",
  });
  const [questions, setQuestions] = useState<BuilderQuestion[]>(initial.questions);
  const [rules, setRules] = useState<BuilderRule[]>(initial.rules);
  const [sectorIds, setSectorIds] = useState<string[]>(initial.sectorIds);
  const [touchPointIds, setTouchPointIds] = useState<string[]>(initial.touchPointIds);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function addQuestion(type: QuestionType) {
    const meta = QUESTION_TYPE_MAP[type];
    setQuestions((prev) => [
      ...prev,
      {
        key: uid(),
        type,
        title: meta.label,
        description: "",
        required: false,
        config: { ...meta.defaultConfig },
        options: meta.hasOptions
          ? [
              { label: "Opção 1", value: "opcao-1" },
              { label: "Opção 2", value: "opcao-2" },
            ]
          : [],
      },
    ]);
  }

  function updateQuestion(key: string, patch: Partial<BuilderQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => prev.filter((q) => q.key !== key));
    setRules((prev) =>
      prev.filter(
        (r) => r.targetQuestionKey !== key && !r.conditions.some((c) => c.questionKey === key),
      ),
    );
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setQuestions((prev) => {
      const oldIndex = prev.findIndex((q) => q.key === active.id);
      const newIndex = prev.findIndex((q) => q.key === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function save(publish?: boolean) {
    start(async () => {
      try {
        await saveSurvey(initial.id, {
          ...meta,
          themeId: meta.themeId || null,
          sectorIds,
          touchPointIds,
          questions: questions.map((q, i) => ({
            key: q.key,
            type: q.type,
            title: q.title,
            description: q.description || undefined,
            required: q.required,
            order: i,
            config: q.config,
            options: q.options.map((o, oi) => ({
              label: o.label,
              value: o.value || `opt-${oi}`,
              order: oi,
              allowOther: false,
            })),
          })),
          rules,
        });
        if (publish) await setSurveyStatus(initial.id, "PUBLISHED");
        toast.success(publish ? "Pesquisa publicada!" : "Pesquisa salva.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          className="max-w-md text-lg font-semibold"
          value={meta.title}
          onChange={(e) => setMeta({ ...meta, title: e.target.value })}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={pending}>
            Salvar
          </Button>
          <Button onClick={() => save(true)} disabled={pending}>
            Publicar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="build">
        <TabsList>
          <TabsTrigger value="build">Perguntas</TabsTrigger>
          <TabsTrigger value="logic">Lógica</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="build">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Editor */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Adicionar pergunta</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {QUESTION_TYPES.map((t) => (
                    <Button
                      key={t.type}
                      variant="outline"
                      size="sm"
                      onClick={() => addQuestion(t.type)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {t.label}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={questions.map((q) => q.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {questions.map((q) => (
                      <QuestionEditor
                        key={q.key}
                        q={q}
                        onChange={(patch) => updateQuestion(q.key, patch)}
                        onRemove={() => removeQuestion(q.key)}
                      />
                    ))}
                    {questions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Adicione perguntas usando os botões acima.
                      </p>
                    ) : null}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Preview */}
            <div className="lg:sticky lg:top-4 lg:h-fit">
              <Card>
                <CardHeader>
                  <CardTitle>Pré-visualização</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {questions.map((q) => (
                    <QuestionRenderer
                      key={q.key}
                      question={toRender(q)}
                      value={undefined}
                      onChange={() => {}}
                      disabled
                    />
                  ))}
                  {questions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem perguntas ainda.</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logic">
          <SkipLogicEditor questions={questions} rules={rules} setRules={setRules} />
        </TabsContent>

        <TabsContent value="settings">
          <SurveySettings
            meta={meta}
            setMeta={setMeta}
            sectors={sectors}
            touchPoints={touchPoints}
            themes={themes}
            sectorIds={sectorIds}
            setSectorIds={setSectorIds}
            touchPointIds={touchPointIds}
            setTouchPointIds={setTouchPointIds}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function toRender(q: BuilderQuestion): RenderQuestion {
  return {
    id: q.key,
    type: q.type,
    title: q.title,
    description: q.description,
    required: q.required,
    config: q.config,
    options: q.options.map((o, i) => ({ id: `${q.key}-${i}`, label: o.label, value: o.value })),
  };
}

function QuestionEditor({
  q,
  onChange,
  onRemove,
}: {
  q: BuilderQuestion;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: q.key });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const meta = QUESTION_TYPE_MAP[q.type];

  return (
    <Card ref={setNodeRef} style={style}>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start gap-2">
          <button type="button" aria-label="Arrastar para reordenar pergunta" className="mt-2 cursor-grab text-muted-foreground" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{meta.label}</span>
              <Button variant="ghost" size="icon" aria-label="Remover pergunta" onClick={onRemove}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <Input
              value={q.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Texto da pergunta"
            />
            <Input
              value={q.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Descrição (opcional)"
              className="text-sm"
            />
            {meta.hasOptions ? (
              <OptionsEditor
                options={q.options}
                onChange={(options) => onChange({ options })}
              />
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={q.required}
                onCheckedChange={(v) => onChange({ required: v })}
              />
              Obrigatória
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { label: string; value: string }[];
  onChange: (options: { label: string; value: string }[]) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border p-2">
      {options.map((o, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={o.label}
            onChange={(e) => {
              const next = [...options];
              next[i] = { label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, "-") };
              onChange(next);
            }}
            placeholder={`Opção ${i + 1}`}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remover opção ${i + 1}`}
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...options, { label: `Opção ${options.length + 1}`, value: `opcao-${options.length + 1}` }])}
      >
        <Plus className="mr-1 h-3 w-3" /> Opção
      </Button>
    </div>
  );
}

function SkipLogicEditor({
  questions,
  rules,
  setRules,
}: {
  questions: BuilderQuestion[];
  rules: BuilderRule[];
  setRules: (r: BuilderRule[]) => void;
}) {
  function addRule() {
    if (questions.length < 2) return;
    setRules([
      ...rules,
      {
        targetQuestionKey: questions[questions.length - 1].key,
        action: "SHOW",
        join: "AND",
        conditions: [{ questionKey: questions[0].key, operator: "lte", value: "6" }],
      },
    ]);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lógica condicional (skip logic)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.map((rule, ri) => (
          <div key={ri} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 rounded border px-2"
                value={rule.action}
                onChange={(e) => {
                  const next = [...rules];
                  next[ri] = { ...rule, action: e.target.value as "SHOW" | "HIDE" };
                  setRules(next);
                }}
              >
                <option value="SHOW">Mostrar</option>
                <option value="HIDE">Ocultar</option>
              </select>
              <select
                className="h-8 rounded border px-2"
                value={rule.targetQuestionKey}
                onChange={(e) => {
                  const next = [...rules];
                  next[ri] = { ...rule, targetQuestionKey: e.target.value };
                  setRules(next);
                }}
              >
                {questions.map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.title}
                  </option>
                ))}
              </select>
              <span>quando</span>
            </div>
            {rule.conditions.map((c, ci) => (
              <div key={ci} className="flex flex-wrap items-center gap-2 pl-4">
                <select
                  className="h-8 rounded border px-2"
                  value={c.questionKey}
                  onChange={(e) => {
                    const next = [...rules];
                    next[ri].conditions[ci] = { ...c, questionKey: e.target.value };
                    setRules(next);
                  }}
                >
                  {questions.map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.title}
                    </option>
                  ))}
                </select>
                <select
                  className="h-8 rounded border px-2"
                  value={c.operator}
                  onChange={(e) => {
                    const next = [...rules];
                    next[ri].conditions[ci] = { ...c, operator: e.target.value };
                    setRules(next);
                  }}
                >
                  <option value="eq">=</option>
                  <option value="neq">≠</option>
                  <option value="gte">≥</option>
                  <option value="lte">≤</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="contains">contém</option>
                </select>
                <Input
                  className="h-8 w-28"
                  value={c.value}
                  onChange={(e) => {
                    const next = [...rules];
                    next[ri].conditions[ci] = { ...c, value: e.target.value };
                    setRules(next);
                  }}
                />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setRules(rules.filter((_, j) => j !== ri))}>
              Remover regra
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addRule} disabled={questions.length < 2}>
          <Plus className="mr-1 h-3 w-3" /> Adicionar regra
        </Button>
        {questions.length < 2 ? (
          <p className="text-xs text-muted-foreground">Adicione ao menos 2 perguntas para criar regras.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SurveySettings({
  meta,
  setMeta,
  sectors,
  touchPoints,
  themes,
  sectorIds,
  setSectorIds,
  touchPointIds,
  setTouchPointIds,
}: {
  meta: {
    title: string;
    description: string;
    slug: string;
    pageMode: "ONE_PER_PAGE" | "ALL_IN_ONE";
    showProgress: boolean;
    randomize: boolean;
    allowMultiple: boolean;
    thankYouMessage: string;
    themeId: string;
  };
  setMeta: (m: typeof meta) => void;
  sectors: { id: string; name: string }[];
  touchPoints: { id: string; name: string }[];
  themes: { id: string; name: string }[];
  sectorIds: string[];
  setSectorIds: (ids: string[]) => void;
  touchPointIds: string[];
  setTouchPointIds: (ids: string[]) => void;
}) {
  function toggle(list: string[], id: string, setter: (ids: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações da pesquisa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea
            value={meta.description}
            onChange={(e) => setMeta({ ...meta, description: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Slug (URL pública)</Label>
          <Input value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Tema visual</Label>
          <Select
            value={meta.themeId || "default"}
            onValueChange={(v) => setMeta({ ...meta, themeId: v === "default" || !v ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tema padrão da clínica" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Padrão da clínica</SelectItem>
              {themes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Mensagem de agradecimento</Label>
          <Textarea
            value={meta.thankYouMessage}
            onChange={(e) => setMeta({ ...meta, thankYouMessage: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={meta.pageMode === "ONE_PER_PAGE"}
              onCheckedChange={(v) => setMeta({ ...meta, pageMode: v ? "ONE_PER_PAGE" : "ALL_IN_ONE" })}
            />
            Uma pergunta por página
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={meta.showProgress} onCheckedChange={(v) => setMeta({ ...meta, showProgress: v })} />
            Barra de progresso
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={meta.randomize} onCheckedChange={(v) => setMeta({ ...meta, randomize: v })} />
            Randomizar ordem
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={meta.allowMultiple} onCheckedChange={(v) => setMeta({ ...meta, allowMultiple: v })} />
            Permitir múltiplas respostas
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-2 block">Especialidades / Setores</Label>
            <div className="space-y-1">
              {sectors.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={sectorIds.includes(s.id)} onChange={() => toggle(sectorIds, s.id, setSectorIds)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Pontos de contato</Label>
            <div className="space-y-1">
              {touchPoints.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={touchPointIds.includes(t.id)} onChange={() => toggle(touchPointIds, t.id, setTouchPointIds)} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
