// Listas e utilidades de data. Compartilhado entre servidor e navegador.
(function (root) {
  // Cores de cabeçalho de coluna e de etiqueta de origem (tons claros).
  const COLORS = [
    ['#DDE1E7', 'Cinza'], ['#D6E6FA', 'Azul'], ['#CDEBDD', 'Verde'], ['#E3D9F7', 'Roxo'],
    ['#FCE8C8', 'Laranja'], ['#F8D7DA', 'Vermelho'], ['#F9D8EC', 'Rosa'], ['#D5F0F0', 'Turquesa'], ['#FFF3BF', 'Amarelo'],
  ];

  const ACTIVITY_TYPES = [
    ['ligacao', 'Ligação'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['reuniao', 'Reunião'], ['nota', 'Nota'],
  ];

  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  // Pipeline criado na primeira vez que o CRM abre. Tudo editável em Configurações.
  const DEFAULT_PIPELINE = {
    name: 'Pré-vendas (SDR)',
    stages: [
      ['Novo lead', '#DDE1E7'], ['Primeiro contato', '#CDEBDD'], ['Em conexão', '#E3D9F7'],
      ['Follow up 1', '#D6E6FA'], ['Follow up 2', '#D6E6FA'], ['Follow up 3', '#D6E6FA'],
      ['Reunião agendada', '#CDEBDD'], ['Passado ao closer', '#FCE8C8'], ['Perdido', '#F8D7DA'],
    ],
  };
  const DEFAULT_ORIGINS = [
    ['Vazamento de credenciais (Leak)', '#F8D7DA'], ['Ransomware', '#FCE8C8'],
    ['Outra vulnerabilidade', '#E3D9F7'], ['LinkedIn', '#D6E6FA'],
  ];
  const NEW_PIPELINE_STAGES = [['Novo lead', '#DDE1E7'], ['Em contato', '#D6E6FA'], ['Qualificado', '#E3D9F7'], ['Reunião agendada', '#CDEBDD']];

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const isoDateTime = (d) => isoDate(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const parseDate = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => isoDate(new Date());
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };

  const CRM = { COLORS, ACTIVITY_TYPES, UFS, DEFAULT_PIPELINE, DEFAULT_ORIGINS, NEW_PIPELINE_STAGES, isoDate, isoDateTime, parseDate, today, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRM;
  else root.CRM = CRM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
