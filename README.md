# CRM

CRM em cards, no estilo GHL, Pipedrive e Clint. Os leads ficam num quadro dividido em estágios, e você arrasta o card de uma coluna para outra. Você cria quantos pipelines quiser, com os estágios que quiser, e define a lista de **origens** do lead (vazamento/leak, ransomware, outra vulnerabilidade, LinkedIn…).

Não precisa instalar pacotes: basta o Node.js 22.5 ou mais recente.

## Como abrir

**No Windows:** deixe a pasta em `C:\CRM` e dê dois cliques em `iniciar-crm.bat`. O navegador abre em http://localhost:3000. Deixe a janela preta aberta enquanto usar.

**Pelo terminal**, dentro da pasta do CRM:

```bash
npm start      # http://localhost:3000
npm test       # testes
```

Os dados ficam em `data/crm.sqlite`. Para fazer backup, copie esse arquivo.

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | Porta |
| `CRM_DB` | `data/crm.sqlite` | Arquivo do banco |
| `CRM_PASSWORD` | vazio | Pede senha no navegador. Use se o CRM ficar acessível pela rede ou pelo celular |

## O que tem

- **Oportunidades**
  - Quadro com uma coluna por estágio. O cabeçalho de cada coluna mostra quantas oportunidades ela tem e a soma dos valores.
  - Arraste os cards entre colunas ou dentro da mesma coluna para reordenar. Colunas podem ser recolhidas.
  - Cada card mostra nome, telefone clicável, contato, data de atualização, origem, valor e próximo passo (em vermelho quando atrasado). Tem atalhos para ligar, abrir o WhatsApp e mandar e-mail.
  - Ao clicar no card, abre o painel do lead, com:
    - pipeline, estágio e origem;
    - próximo passo;
    - registro de atividade (ligação, WhatsApp, e-mail, reunião, nota);
    - todos os dados editáveis;
    - histórico, que já inclui cada movimentação entre estágios.
  - Visão em **lista**, com seleção múltipla para mover de estágio, definir origem ou excluir.
  - Filtros por origem e por próximo passo (atrasado, hoje, sem próximo passo), classificação, busca e **exportação para CSV**.
  - O botão **+ Adicionar oportunidade** cria um lead; o **+** no cabeçalho da coluna cria o lead já naquele estágio.
- **Tarefas**: próximos passos agrupados em atrasados, hoje e próximos.
- **Importar**: sobe uma planilha CSV inteira de uma vez para **um pipeline e um estágio**, com a origem escolhida.
  - Aceita CSV separado por `;`, `,` ou tabulação, inclusive o salvo pelo Excel.
  - As colunas são reconhecidas pelo nome, e você pode ajustar.
  - Mostra uma prévia e detecta duplicatas por telefone, e-mail, site ou CNPJ antes de gravar.
  - Se a planilha tiver uma coluna Origem com um nome já cadastrado, vale o da planilha.
- **Configurações**
  - Criar, renomear e excluir pipelines.
  - Criar, renomear, trocar a cor, reordenar e excluir estágios. Para excluir um estágio que tem leads, você escolhe para onde eles vão.
  - Cadastrar as origens do lead.

Na primeira vez que o CRM abre, ele cria o pipeline **Pré-vendas (SDR)** e as origens *Vazamento de credenciais (Leak)*, *Ransomware*, *Outra vulnerabilidade* e *LinkedIn*. Dá para mudar tudo em Configurações.

Atalhos no quadro: `N` cria uma oportunidade, `/` vai para a busca e `Esc` fecha o painel.

## Estrutura

```
server.js            servidor HTTP e arquivos estáticos
src/db.js            esquema SQLite
src/service.js       regras (pipelines, estágios, origens, leads, importação)
public/              interface (index.html, app.js, style.css, constants.js)
test/                testes (node:test)
exemplos/            CSV de exemplo para importar
```
