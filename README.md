<div align="center">

# Zela

**A sua rua, cuidada de verdade.**

Zeladoria colaborativa: o cidadão reporta buracos, lâmpadas queimadas, lixo e alagamentos, apoia os relatos dos vizinhos e acompanha quando são resolvidos.

![Azure](https://img.shields.io/badge/Azure-App%20Service-0f766e?style=for-the-badge&logo=microsoftazure&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-20-0f766e?style=for-the-badge&logo=nodedotjs&logoColor=white)
![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-0f766e?style=for-the-badge&logo=githubactions&logoColor=white)
![Testes](https://img.shields.io/badge/testes-10%20passando-0f766e?style=for-the-badge)

</div>

---

## Ficha Técnica do MVP

> FIAP Global Solution 2026.2 · CitizenTech · Engenharia de Software 4º ano · turma 4ESPR

| Item | Resposta |
|---|---|
| **Nome do produto** | Zela |
| **URL do MVP** | https://SEU-APP.azurewebsites.net *(trocar pela URL real do App Service)* |
| **Repositório** | https://github.com/Kaiomeireles/zela-citizentech |
| **1. Quem é o cidadão beneficiado?** | Moradores de grandes cidades que convivem com problemas de zeladoria na rua e não sabem a quem recorrer, e o agente público que precisa priorizar o que consertar. |
| **2. Qual problema será resolvido?** | Buracos, lâmpadas queimadas, lixo, calçadas quebradas e alagamentos demoram a ser consertados porque os relatos chegam dispersos e sem prioridade. |
| **3. Como a solução funcionará?** | O cidadão marca o local no mapa e descreve o problema, sem informar dados pessoais. Os vizinhos apoiam o relato, o que o leva ao topo da lista. O administrador atualiza o status (aberto, em andamento, resolvido) e o cidadão acompanha. |
| **4. Quais tecnologias serão empregadas?** | Node.js + Express no **Azure App Service**, front-end em HTML/CSS/JS com Leaflet, OpenStreetMap (estilo CARTO, sem chave de API), busca de endereço e bairro automático (Nominatim), **GitHub Actions** (CI/CD), **Application Insights** (monitoramento). Próximos componentes: visão computacional para classificar a foto, IA generativa para resumir e priorizar, pipeline de dados abertos (156), RPA para encaminhar ao órgão, sensor físico. |
| **5. Quem participará do ecossistema?** | Cidadãos, associações de bairro, prefeituras e concessionárias de serviços (iluminação, limpeza urbana), e empresas que contratam o painel de gestão. |
| **6. Como o impacto será medido e ampliado?** | Taxa de resolução, dias médios até resolver, relatos por bairro e apoios por relato (já calculados em `/api/stats`). Expansão por bairro e por cidade, com venda do painel a prefeituras e condomínios. |
| **ODS conectados** | ODS 11 (cidades e comunidades sustentáveis) e ODS 16 (meta 16.6: instituições eficazes, responsáveis e transparentes) |
| **Modelos de IA utilizados** | Nenhum nesta versão (previstos: visão computacional e IA generativa) |
| **Dados** | **Simulados**: 36 relatos fictícios gerados por `scripts/gen-seed.js` (semente fixa, reproduzível), com bairros reais de São Paulo e textos genéricos. Todos aparecem marcados como "simulado". Fonte real prevista: dados abertos do 156 da Prefeitura. |

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Produção: Azure, CI/CD, segurança e monitoramento](#produção-azure-cicd-segurança-e-monitoramento)
- [Como colocar no ar](#como-colocar-no-ar)
- [Rodar localmente](#rodar-localmente)
- [API](#api)
- [Privacidade e LGPD](#privacidade-e-lgpd)
- [Limitações conhecidas](#limitações-conhecidas)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Equipe](#equipe)

## Funcionalidades

- Mapa com pinos por categoria, coloridos por situação e agrupados, com filtros por tipo e situação.
- Busca de endereço e preenchimento automático do bairro.
- Formulário em 3 passos (onde, tipo, descrição) com localização por busca, GPS ou toque no mapa. Sem cadastro e sem dados pessoais.
- Apoio aos relatos dos vizinhos (um por navegador) e ranking dos mais apoiados.
- Indicadores de impacto: total, abertos, taxa de resolução e dias médios até resolver.
- Painel de administrador (por token) para mudar o status dos relatos.
- Acessibilidade: navegação por teclado, foco visível, rótulos para leitor de tela e contraste adequado.

## Arquitetura

```text
Cidadão ──HTTPS──▶ Azure App Service (Linux, Node 20)
                       │  Express + Helmet + rate limit
                       │  health check: /health
                       ├──▶ Arquivo de dados em /home/data (persiste entre reinícios)
                       └──▶ Application Insights ──▶ Alertas por e-mail

Equipe ──push──▶ GitHub ──▶ GitHub Actions: testes → auditoria → deploy → teste de fumaça
```

## Produção: Azure, CI/CD, segurança e monitoramento

| Pilar | O que o repositório configura |
|---|---|
| **Deploy** | URL pública no App Service com HTTPS obrigatório (HTTPS Only, TLS 1.2 mínimo, HSTS). Resource Group `rg-zela`. |
| **CI/CD** | `.github/workflows/azure-deploy.yml`: a cada commit na `main` roda os 10 testes e a auditoria de dependências, faz o deploy e confere `/health`. Pull requests rodam só os testes. |
| **Segurança** | Segredos fora do código (App Settings do Azure e Secrets do GitHub). Papel de administrador por `ADMIN_TOKEN`, comparado em tempo constante. CSP, HSTS e demais cabeçalhos (Helmet). Limite de requisições por minuto. Validação de todas as entradas. Texto do usuário nunca vira HTML. Só a pasta `public/` é servida. CodeQL e Dependabot ligados. FTP desligado. RBAC no Azure: equipe como *Contributor*, avaliador como *Reader*. |
| **Monitoramento** | Application Insights ligado por variável de ambiente. Três alertas por e-mail: erros 5xx, lentidão (> 2 s) e falha no `/health`. |

## Como colocar no ar

1. No Azure Cloud Shell (Bash), clone o repositório, edite `APP` (nome único) e `ALERT_EMAIL` no começo de `infra/azure-setup.sh` e rode `./infra/azure-setup.sh`. Ele cria tudo e imprime o perfil de publicação e o token de administrador.
2. No GitHub, em **Settings → Secrets and variables → Actions**, crie o secret `AZURE_WEBAPP_PUBLISH_PROFILE` (o XML impresso) e a variável `AZURE_WEBAPP_NAME` (o nome do app).
3. Faça um commit na `main` ou rode o workflow manualmente. A URL aparece no ambiente `production`.
4. Para usar o painel de administrador, clique em "Sou administrador" no site e cole o token que o script imprimiu.

## Rodar localmente

```bash
npm ci
npm test                          # 10 testes
ADMIN_TOKEN=meu-token-local npm start   # http://localhost:8080
```

## API

| Método e rota | Função | Acesso |
|---|---|---|
| `GET /api/reports?status=&categoria=` | Lista relatos, mais apoiados primeiro | Público |
| `POST /api/reports` | Cria um relato (categoria, descricao, bairro, lat, lng) | Público, 10 por minuto |
| `POST /api/reports/:id/apoiar` | Apoia um relato | Público, 10 por minuto |
| `PATCH /api/reports/:id` | Muda o status (`aberto`, `em_andamento`, `resolvido`) | Administrador (`Authorization: Bearer <token>`) |
| `GET /api/stats` | Indicadores de impacto | Público |
| `GET /health` | Saúde do serviço | Público |

## Privacidade e LGPD

- **Nenhum dado pessoal** é coletado: sem nome, e-mail, telefone ou conta.
- A localização é arredondada a 4 casas decimais (cerca de 10 metros) e validada contra a área do piloto.
- O token de administrador fica só na aba do navegador (`sessionStorage`).
- O site não usa cookies de rastreamento.

## Limitações conhecidas

- Os dados ficam em um arquivo JSON no disco do App Service. Para mais de uma instância ou para escala, o próximo passo é migrar para um banco gerenciado (Azure SQL ou Cosmos DB).
- Um apoio por navegador é controlado no cliente. Um atacante pode apoiar mais vezes, limitado pelo rate limit.
- Não há envio de foto nesta versão (planejado com o componente de visão computacional).
- Os dados de demonstração são simulados.

## Estrutura de pastas

```text
zela/
├── app.js / server.js     # API Express, segurança e ponto de entrada
├── src/store.js           # persistência em arquivo (escrita atômica)
├── public/                # site (HTML, CSS e JS) — única pasta servida
├── data/seed.json         # relatos simulados de demonstração
├── scripts/gen-seed.js    # gerador reproduzível dos dados simulados
├── test/                  # testes automatizados
├── infra/azure-setup.sh   # cria a infraestrutura no Azure
└── .github/               # CI/CD, CodeQL e Dependabot
```

## Equipe

| Nome | RM | Papel |
|---|---|---|
| Guilherme Fernandes de Freitas | RM554323 | Produto e Pesquisa |
| Henrique Rafael Gomes de Souza | RM553945 | Tecnologia |
| João Pedro Chizzolini de Freitas | RM553172 | Design e Protótipo |
| Kaio Vinicius Meireles Alves | RM553282 | Negócio e Operação |
| Lucas Alves de Souza | RM553956 | Dados e Métricas |

<div align="center"><sub>Projeto acadêmico · FIAP Global Solution 2026.2</sub></div>
