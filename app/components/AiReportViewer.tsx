'use client';

import React from 'react';
import { Activity, Flame, AlertTriangle, Sliders, Target } from 'lucide-react';

interface AiReportViewerProps {
  content?: string | null;
}

/**
 * Renderiza texto inline convertendo negrito no formato WhatsApp (*texto*)
 * e Markdown (**texto**) em elementos <strong> estilizados.
 */
export function renderFormattedText(text: string): React.ReactNode[] {
  if (!text) return [];

  // Captura **negrito** e *negrito* (não quebra em asterisco solto)
  const regex = /(\*\*[^*]+?\*\*|\*[^\s*](?:[^*]*?[^\s*])?\*)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-cyan-300">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <strong key={index} className="font-semibold text-cyan-300">
          {part.slice(1, -1)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

interface ParsedSection {
  id: string;
  emoji: string;
  title: string;
  icon: React.ReactNode;
  borderClass: string;
  badgeClass: string;
  bgClass: string;
  body: string;
  actionItems?: string[];
  intro?: string;
}

/**
 * Divide o conteúdo do relatório nas 5 dimensões clínicas se os emojis estiverem presentes.
 */
function parseReportContent(content: string): ParsedSection[] | null {
  const emojis = ['📊', '🥩', '⚠️', '⚠', '⚙️', '⚙', '🎯'];
  const hasSections = emojis.some((e) => content.includes(e));
  if (!hasSections) return null;

  // Regex com alternância e flag /u para preservar pares substitutos (surrogate pairs) de emojis
  const sectionPattern = /(?=(?:📊|🥩|⚠️|⚠|⚙️|⚙|🎯))/u;
  const rawChunks = content.split(sectionPattern).map((c) => c.trim()).filter(Boolean);

  const parsed: ParsedSection[] = [];

  for (const chunk of rawChunks) {
    if (/^📊/u.test(chunk)) {
      const body = cleanSectionTitle(chunk);
      parsed.push({
        id: 'thermo',
        emoji: '📊',
        title: 'Termodinâmica & Balanço Energético',
        icon: <Activity className="h-4 w-4 text-cyan-400" />,
        borderClass: 'border-cyan-500/25',
        badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
        bgClass: 'bg-slate-900/60',
        body,
      });
    } else if (/^🥩/u.test(chunk)) {
      const body = cleanSectionTitle(chunk);
      parsed.push({
        id: 'composition',
        emoji: '🥩',
        title: 'Composição Corporal & Aporte Proteico',
        icon: <Flame className="h-4 w-4 text-orange-400" />,
        borderClass: 'border-orange-500/25',
        badgeClass: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
        bgClass: 'bg-slate-900/60',
        body,
      });
    } else if (/^(?:⚠️|⚠)/u.test(chunk)) {
      const body = cleanSectionTitle(chunk);
      parsed.push({
        id: 'clinical',
        emoji: '⚠️',
        title: 'Sinal Clínico & Recuperação (Sono / Estresse)',
        icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
        borderClass: 'border-amber-500/25',
        badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        bgClass: 'bg-slate-900/60',
        body,
      });
    } else if (/^(?:⚙️|⚙)/u.test(chunk)) {
      const body = cleanSectionTitle(chunk);
      parsed.push({
        id: 'recalibration',
        emoji: '⚙️',
        title: 'Decisão de Meta Calórica (Motor & Árbitro)',
        icon: <Sliders className="h-4 w-4 text-emerald-400" />,
        borderClass: 'border-emerald-500/25',
        badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        bgClass: 'bg-slate-900/60',
        body,
      });
    } else if (/^🎯/u.test(chunk)) {
      const rawBody = cleanSectionTitle(chunk);
      const lines = rawBody.split('\n').map((l) => l.trim()).filter(Boolean);
      const actionItems: string[] = [];
      const introLines: string[] = [];

      for (const line of lines) {
        if (/^(\d+[\.\)]|[-*•·])\s+/.test(line)) {
          actionItems.push(line.replace(/^(\d+[\.\)]|[-*•·])\s+/, ''));
        } else {
          introLines.push(line);
        }
      }

      parsed.push({
        id: 'action_plan',
        emoji: '🎯',
        title: 'Plano de Ação Tático para a Próxima Semana',
        icon: <Target className="h-4 w-4 text-indigo-400" />,
        borderClass: 'border-indigo-500/35',
        badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
        bgClass: 'bg-indigo-950/20',
        body: rawBody,
        actionItems: actionItems.length > 0 ? actionItems : undefined,
        intro: introLines.join(' '),
      });
    } else {
      parsed.push({
        id: `chunk_${parsed.length}`,
        emoji: '📋',
        title: 'Observações Clínicas',
        icon: <Activity className="h-4 w-4 text-slate-400" />,
        borderClass: 'border-slate-800',
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
        bgClass: 'bg-slate-900/40',
        body: chunk,
      });
    }
  }

  return parsed.length > 0 ? parsed : null;
}

function cleanSectionTitle(chunk: string): string {
  // Remove emoji inicial e espaços
  let text = chunk.replace(/^(?:📊|🥩|⚠️|⚠|⚙️|⚙|🎯)\s*/u, '').trim();
  // Remove título inicial: *Título:* ou **Título:** ou *Título*: ou Título: e eventuais traços/hifens
  text = text.replace(/^(\*{0,2})[^\n\r:*]+(?::?\*{0,2}:?\*{0,2})\s*(-|–|—)?\s*/i, '').trim();
  return text || chunk;
}

export default function AiReportViewer({ content }: AiReportViewerProps) {
  if (!content) {
    return (
      <p className="text-sm text-slate-400 italic">
        Nenhum conteúdo disponível no relatório.
      </p>
    );
  }

  const sections = parseReportContent(content);

  // Renderização estruturada em cards
  if (sections) {
    return (
      <div className="space-y-4">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`rounded-2xl border ${section.borderClass} ${section.bgClass} p-4 sm:p-5 transition-all shadow-sm`}
          >
            {/* Cabeçalho da seção */}
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/80 border border-slate-700/60 text-base">
                {section.emoji}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${section.badgeClass}`}>
                {section.title}
              </span>
            </div>

            {/* Plano de Ação estruturado em diretrizes numeradas */}
            {section.actionItems && section.actionItems.length > 0 ? (
              <div className="space-y-2.5 mt-2">
                {section.intro && (
                  <p className="text-sm text-slate-300 leading-relaxed mb-3 italic bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                    {renderFormattedText(section.intro)}
                  </p>
                )}
                <div className="space-y-2">
                  {section.actionItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-3 text-sm text-slate-200"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300 border border-indigo-500/30">
                        {idx + 1}
                      </span>
                      <div className="leading-relaxed pt-0.5">
                        {renderFormattedText(item)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Texto regular com formatação de negrito */
              <div className="text-sm text-slate-300 leading-relaxed space-y-2">
                {section.body.split(/\n\s*\n/).map((paragraph, pIdx) => (
                  <p key={pIdx} className="leading-relaxed">
                    {renderFormattedText(paragraph)}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Fallback: relatório em texto livre, dividindo por parágrafos e tratando negrito
  return (
    <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
      {content.split(/\n\s*\n/).map((paragraph, idx) => (
        <p key={idx} className="leading-relaxed">
          {renderFormattedText(paragraph)}
        </p>
      ))}
    </div>
  );
}
