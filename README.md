# ReConecta Alimentos

MVP acadêmico em MVC para conectar estabelecimentos alimentícios a organizações sociais na Região Metropolitana de Campinas.

## Pré-requisitos
- Node.js LTS
- npm

## Instalação e execução
```powershell
npm install
copy .env.example .env
npm run db:init
npm run db:seed
npm start
```

Acesse `http://localhost:3000`.

## Administrador
Crie o administrador somente por comando local:
```powershell
npm run create-admin -- "Nome do Administrador" "admin@exemplo.com" "senha-com-8-caracteres"
```

## Dados fictícios
`npm run db:seed` cria cinco padarias, três organizações e uma oferta fictícia. Senha dos participantes: `12345678`. O cadastro público não cria administradores.

## Testes
```powershell
npm test
```

## Limitações
- MVP local, sem pagamento, mapas ou notificações externas.
- Os filtros não certificam compatibilidade sanitária ou logística.
- A informação de validade é fornecida pelo doador.
- O horário é interpretado em America/Sao_Paulo e persistido em UTC.
