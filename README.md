# CRM de prospecção

Ferramenta de uso individual para prospecção outbound em cibersegurança. Ela não serve para registrar venda. Serve para **não perder conta por esquecimento**: toda conta ativa tem data e ação combinadas, e a tela de abertura responde uma pergunta só, "para quem eu ligo agora".

Não tem dependências: Node.js 22.5 ou mais recente, com o SQLite que já vem embutido no Node. Não tem etapa de build nem `npm install`.

**No Windows:** dê dois cliques em `iniciar-crm.bat`. Ele abre o navegador em http://localhost:3000. Deixe a janela preta aberta enquanto usar.

```bash
npm start                 # http://localhost:3000 (rodar dentro desta pasta)
npm test                  # regras de negócio + API
```

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `CRM_DB` | `data/crm.sqlite` | Arquivo do banco. Backup = copiar este arquivo |
| `CRM_PASSWORD` | vazio | Se definida, o navegador pede senha (usuário qualquer). **Use sempre que o servidor ficar acessível fora da sua máquina**, por exemplo para usar no celular |
| `TZ` | `America/Sao_Paulo` | Fuso usado para "hoje", "atrasado" e o horário das ligações |

**No celular:** o celular precisa alcançar o servidor, pela rede local, por VPN ou por um servidor com HTTPS. As telas Hoje e Ficha foram pensadas para o navegador do celular, e o telefone é um link `tel:` que disca direto.

---

## Telas

**Hoje** (tela de abertura). Três grupos visíveis ao mesmo tempo:
- **Atrasados** vêm primeiro, destacados em vermelho, com quantos dias de atraso.
- **Hoje**.
- **Sem próximo passo**.

Cada linha mostra conta, cidade, trilha, contato, telefone clicável, próximo passo e a última coisa que aconteceu. Tem também três ações: **Registrar**, **Adiar** (1 dia, 3 dias, 1 semana ou data escolhida) e **Ficha**. No topo ficam dois contadores discretos: ligações de hoje e reuniões marcadas na semana. Conta que voltou de um encerramento aparece com o motivo anterior e com o "o que deu errado" em destaque.

**Contas.** A tabela da base inteira, com:
- busca e filtros combináveis: trilha, estágio, setor, UF, motivo de perda, achado sim/não, sem contato há mais de X dias;
- dois filtros salvos: **Travado na recepção** e **Reativar este mês**;
- ordenação por cabeçalho;
- seleção múltipla com duas ações em lote: mudar estágio e definir próximo passo;
- **Exportar CSV** que respeita os filtros aplicados.

**Ficha da conta.**
- **Cabeçalho**, onde estágio e trilha são editáveis ali mesmo. Vários contatos por conta, com um principal.
- **Bloco de próximo passo**, fixo no topo durante a rolagem. Concluir exige definir o próximo ou encerrar.
- **Achados**, com a marcação "esfriando" depois de 30 dias.
- **Ângulos da recepção**, só no estágio "Travado".
- **Histórico** em ordem cronológica invertida, com os eventos do sistema (mudança de estágio, encerramento, reativação) em cinza.

**Registrar contato** (caixa rápida). Canal e resultado com um clique cada, anotação opcional, objeção opcional. O próximo passo **já vem sugerido** conforme o resultado: recepção → amanhã, "nova tentativa, outro horário". Por isso o caminho mais curto é `R`, `2`, uma frase, `Enter`. Quem prefere encerrar escolhe o motivo ali mesmo. Quando a objeção é "já temos fornecedor", "já resolvemos" ou "sem orçamento", a caixa oferece encerrar com o motivo correspondente.

**Números.** Filtro por período e por trilha. Mostra:
- tentativas;
- conversas com decisor;
- taxa de conexão;
- reuniões;
- conexão que vira reunião;
- tentativas por reunião;
- no-show.

Tem ainda uma comparação entre trilhas pelo número **reuniões por conta trabalhada** e a contagem de objeções no período.

**Importar.** Recebe CSV com `;`, `,` ou tab, em UTF-8 ou Windows-1252 (o formato em que o Excel salva).
- Você aponta qual coluna vai para qual campo, e as colunas vêm pré-mapeadas pelos nomes.
- A tela avisa quantas linhas vão entrar.
- Detecta duplicata por **domínio** ou **CNPJ**, tanto contra a base quanto dentro do próprio arquivo, antes de gravar.
- Define trilha, origem e primeiro passo para todas as linhas, com a opção de **distribuir N contas por dia útil**, para que 254 hospitais não caiam todos na fila de hoje.
- Contato e achado podem vir na mesma linha.
- Em `exemplos/hospitais-exemplo.csv` há um arquivo de exemplo.

**Cadastro em uma linha.** O campo no topo de todas as telas (`N`) cria a conta só com o nome, em "A contatar".

### Atalhos

| Tecla | Ação |
|---|---|
| `N` | Nova conta (cadastro em uma linha) |
| `R` | Registrar contato (linha selecionada ou ficha aberta) |
| `P` | Próximo passo: concluir / definir |
| `A` | Adiar |
| `J` `K` / `↓` `↑` | Mover na lista · `Enter` abre a ficha |
| `X` | Marcar linha para ação em lote (Contas) |
| `E` | Editar conta (ficha) |
| `/` | Buscar em Contas |
| `1` `2` `3` `4` | Hoje, Contas, Números, Importar |
| Na caixa de registro | `1`–`5` resultado · `l` `w` `e` `i` `p` canal · `Enter` salva · `Esc` fecha |
| `?` | Lista de atalhos |

---

## Regras automáticas

- **Próximo passo obrigatório.** O servidor recusa um registro de contato em conta ativa que venha sem próximo passo ou sem encerramento. A regra está no servidor, não só na tela.
- **Reativação automática.** Veja a tabela abaixo. No dia do retorno, a conta volta para a fila em "Em cadência", com histórico, motivo e o "o que deu errado" visíveis. Se ninguém abrir a ferramenta nesse dia, ela aparece como atrasada.

| Motivo de encerramento | Volta? |
|---|---|
| Tem fornecedor atual | 90 dias |
| Sem orçamento agora | 90 dias |
| Diz que já resolveu | 60 dias |
| Ligação mal conduzida | 45 dias, com o campo "o que deu errado" |
| Sem fit | não |
| Não quer contato | nunca. A conta sai de qualquer reativação e as ações em lote a ignoram. Reabrir exige confirmação explícita |

- **Escalada na recepção.** Na 3ª tentativa sem falar com o decisor, a ferramenta sugere mover a conta para "Travado na recepção" e abre o bloco de ângulos. Os horários tentados (comercial, antes das 9h, depois das 18h) são marcados sozinhos a partir da hora de cada ligação registrada. Os outros ângulos são caixas de marcar.
- **Achado envelhecendo.** Achado com mais de 30 dias ganha a marcação "esfriando" na ficha e na fila.
- **Avanço de estágio.** A primeira tentativa move a conta de "A contatar" para "Em cadência". "Falei com o decisor" move para "Contato feito".
- **No-show** (botão na ficha, estágio "Reunião agendada"). É contado nos Números, a conta volta para "Contato feito" e o sistema pede a nova data.

Não há e-mail, push, integração nem IA. Tudo aparece dentro da ferramenta.

## Decisões de interpretação

Pontos em que a especificação precisava de uma escolha:

1. **Conta nova e próximo passo.** Criar só com o nome continua valendo, mas a conta já nasce com o próximo passo "Primeira tentativa" para hoje. Assim o teste 3 ("nenhuma conta ativa sem próximo passo") vale desde o primeiro segundo. Na importação, a data e a ação são configuráveis.
2. **Grupo "Sem próximo passo".** Com a regra acima e as validações do servidor, ele deve ficar vazio. Existe como rede de segurança e mostra qualquer conta ativa sem data, indicando há quantos dias ela está assim. Passados 7 dias, a conta ganha a marca "esquecida".
3. **Estágios ativos** (exigem próximo passo): A contatar, Em cadência, Travado na recepção, Contato feito e Reunião agendada. "Passado ao closer" saiu da mão do BDR e não entra na fila. "Encerrado" exige motivo.
4. **Datas sugeridas caem em dia útil.** "Amanhã" numa sexta vira segunda, e o mesmo vale para as datas de reativação. A data escolhida manualmente é respeitada.
5. **Adiar** conta a partir de hoje quando o passo já está atrasado. Adiar em 1 dia algo atrasado desde a semana passada leva para amanhã, e não para um dia que continua no passado.
6. **Reuniões marcadas** são contadas pela mudança de estágio para "Reunião agendada". O no-show é um botão próprio.
7. **CNPJ** foi incluído como campo da conta, porque a detecção de duplicata na importação depende dele.

## Como a especificação é avaliada

1. **Registrar uma ligação em menos de 15 s.** Pelo teclado: `R` → `2` → frase → `Enter`. O próximo passo vem preenchido. No teste automatizado com navegador, o registro inteiro levou menos de 1 s, sem contar a digitação humana.
2. **Saber em 5 s para quem ligar.** A ferramenta abre em Hoje, sem filtro, com atrasados no topo e a primeira linha já selecionada.
3. **Nenhuma conta ativa sem próximo passo ou motivo.** A regra é aplicada no servidor em todas as escritas: criação, registro de contato, mudança de estágio, lote, conclusão de passo e no-show. Está coberta por `test/service.test.js`.

## Estrutura

```
server.js               HTTP + arquivos estáticos (sem framework)
src/db.js               esquema SQLite
src/service.js          regras de negócio (toda escrita passa por aqui)
public/constants.js     listas fechadas e regras de data, usadas pelo servidor e pelo navegador
public/index.html       casca da página
public/app.js           telas, caixas rápidas e atalhos
public/style.css        tema claro fixo e alta densidade
test/                   node:test (regras e API)
exemplos/               CSV de exemplo para a importação
```

## Fora do escopo (v1)

Ficaram de fora, de propósito: vários usuários, permissões, integração com e-mail, sequências, discador, LinkedIn, proposta, contrato, valor de negócio, previsão, app nativo, campos configuráveis e IA.
