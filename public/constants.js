// Listas fechadas e regras de data. Compartilhado entre servidor e navegador.
(function (root) {
  const STAGES = [
    ['a_contatar', 'A contatar'],
    ['em_cadencia', 'Em cadência'],
    ['travado', 'Travado na recepção'],
    ['contato_feito', 'Contato feito'],
    ['reuniao', 'Reunião agendada'],
    ['closer', 'Passado ao closer'],
    ['encerrado', 'Encerrado'],
  ];
  // Estágios que exigem próximo passo. "Passado ao closer" saiu da mão do BDR.
  const ACTIVE_STAGES = ['a_contatar', 'em_cadencia', 'travado', 'contato_feito', 'reuniao'];

  const TRACKS = [
    ['credenciais', 'Credenciais vazadas'],
    ['ransomware', 'Vítima de ransomware'],
    ['pares', 'Pares de setor'],
    ['publico', 'Setor público'],
    ['outra', 'Outra'],
  ];

  const SECTORS = [
    ['industria', 'Indústria'], ['logistica', 'Logística'], ['saude', 'Saúde'],
    ['educacao', 'Educação'], ['varejo', 'Varejo'], ['juridico', 'Jurídico'],
    ['contabilidade', 'Contabilidade'], ['agro', 'Agro e cooperativas'],
    ['financeiro', 'Financeiro'], ['tecnologia', 'Tecnologia'], ['construcao', 'Construção'],
    ['servicos', 'Serviços'], ['governo', 'Governo'], ['outro', 'Outro'],
  ];

  const SIZES = [
    ['1-9', '1–9'], ['10-49', '10–49'], ['50-99', '50–99'], ['100-249', '100–249'],
    ['250-499', '250–499'], ['500-999', '500–999'], ['1000+', '1000+'],
  ];

  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  const CHANNELS = [
    ['ligacao', 'Ligação'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'],
    ['linkedin', 'LinkedIn'], ['presencial', 'Presencial'],
  ];

  // days: próximo passo sugerido; action: texto sugerido.
  const RESULTS = [
    ['decisor', 'Falei com o decisor', { days: 3, action: 'Retomar conversa com o decisor' }],
    ['recepcao', 'Parei na recepção', { days: 1, action: 'Nova tentativa, outro horário' }],
    ['caixa_postal', 'Caixa postal', { days: 1, action: 'Ligar de novo' }],
    ['nao_atendeu', 'Não atenderam', { days: 1, action: 'Ligar de novo' }],
    ['numero_errado', 'Número errado', { days: 0, action: 'Buscar telefone correto' }],
  ];

  const OBJECTIONS = [
    ['fornecedor', 'Já temos fornecedor'],
    ['resolvido', 'Já resolvemos'],
    ['sem_orcamento', 'Sem orçamento'],
    ['manda_email', 'Manda por e-mail'],
    ['sem_tempo', 'Sem tempo agora'],
    ['nao_prioridade', 'Não é prioridade'],
    ['ti_terceirizado', 'TI terceirizado cuida'],
    ['nao_decide', 'Não sou eu que decido'],
    ['outra', 'Outra'],
  ];

  // days: null = não volta. never: remove de qualquer reativação, em definitivo.
  const CLOSE_REASONS = [
    ['fornecedor', 'Tem fornecedor atual', { days: 90 }],
    ['sem_orcamento', 'Sem orçamento agora', { days: 90 }],
    ['ja_resolveu', 'Diz que já resolveu', { days: 60 }],
    ['mal_conduzida', 'Ligação mal conduzida', { days: 45, askNote: true }],
    ['sem_fit', 'Sem fit: porte, setor ou é rede', { days: null }],
    ['nao_quer', 'Não quer contato', { days: null, never: true }],
  ];

  // Objeção que sugere um motivo de encerramento com retorno.
  const OBJECTION_TO_REASON = { fornecedor: 'fornecedor', resolvido: 'ja_resolveu', sem_orcamento: 'sem_orcamento' };

  const SEVERITIES = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']];

  const RECEPTION_HOURS = [['comercial', 'Comercial'], ['antes9', 'Antes das 9h'], ['depois18', 'Depois das 18h']];
  const RECEPTION_CHECKS = [
    ['rc_asked_name', 'Já perguntei o nome do responsável'],
    ['rc_asked_it', 'Já perguntei se o TI é interno ou terceirizado'],
    ['rc_extension', 'Já tentei ramal direto'],
    ['rc_whatsapp', 'Já tentei WhatsApp da central'],
    ['rc_linkedin', 'Já busquei o nome no LinkedIn'],
  ];

  const ESCALATION_ATTEMPTS = 3; // tentativas sem decisor antes de sugerir "travado"
  const ORPHAN_DAYS = 7;
  const FINDING_STALE_DAYS = 30;

  // ---- datas (sempre 'AAAA-MM-DD' em horário local) ----
  const pad = (n) => String(n).padStart(2, '0');
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoDateTime(d) { return isoDate(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function parseDate(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function today() { return isoDate(new Date()); }
  function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); }
  function toWeekday(s) {
    const d = parseDate(s);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return isoDate(d);
  }
  // Data sugerida: soma dias corridos e empurra fim de semana para segunda.
  function plusDays(n, from) { return toWeekday(addDays(from || today(), n)); }
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function weekStart(s) { const d = parseDate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoDate(d); }
  function hourBucket(dt) {
    const h = Number(dt.slice(11, 13));
    return h < 9 ? 'antes9' : h >= 18 ? 'depois18' : 'comercial';
  }

  const map = (list) => Object.fromEntries(list.map((x) => [x[0], x[1]]));
  const L = {
    stage: map(STAGES), track: map(TRACKS), sector: map(SECTORS), size: map(SIZES),
    channel: map(CHANNELS), result: map(RESULTS), objection: map(OBJECTIONS),
    reason: map(CLOSE_REASONS), severity: map(SEVERITIES), hour: map(RECEPTION_HOURS),
  };
  const reasonInfo = (k) => (CLOSE_REASONS.find((r) => r[0] === k) || [])[2];
  const resultInfo = (k) => (RESULTS.find((r) => r[0] === k) || [])[2];

  const CRM = {
    STAGES, ACTIVE_STAGES, TRACKS, SECTORS, SIZES, UFS, CHANNELS, RESULTS, OBJECTIONS,
    CLOSE_REASONS, OBJECTION_TO_REASON, SEVERITIES, RECEPTION_HOURS, RECEPTION_CHECKS,
    ESCALATION_ATTEMPTS, ORPHAN_DAYS, FINDING_STALE_DAYS, L, reasonInfo, resultInfo,
    isoDate, isoDateTime, parseDate, today, addDays, toWeekday, plusDays, daysBetween, weekStart, hourBucket,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRM;
  else root.CRM = CRM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
