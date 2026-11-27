# ReConecta Alimentos

Protótipo acadêmico em MVC para demonstrar os fluxos de doação de alimentos entre estabelecimentos e organizações sociais.

## Executar
```powershell
npm install
copy .env.example .env
npm start
```

Abra `http://localhost:3000`.

## Contas demonstrativas
Todas usam a senha fictícia `demo1234`:
- Estabelecimento: `padaria@demo.local`
- Organização: `ong@demo.local`
- Administrador: `admin@demo.local`

Os exemplos são carregados na memória quando a aplicação inicia. Também é possível criar contas e experimentar os fluxos.

## Hospedar no Render Free
Conecte este repositório como **Web Service**, com Build Command `npm install` e Start Command `npm start`. Configure `NODE_ENV=production`. Não é necessário configurar `SESSION_SECRET` para a demonstração; sem ela, o app gera uma chave aleatória ao iniciar.

Não é necessário criar um banco nem configurar `DATABASE_URL`.

## Limitações do modo demonstração
- Não há banco de dados: cadastros, ofertas, solicitações, histórico e sessões existem apenas na memória do processo.
- Os dados reiniciam quando a aplicação reinicia, é redeployada ou o serviço gratuito do Render entra em suspensão.
- Não use informações pessoais ou dados reais de participantes.
- Contas demonstrativas e indicadores são fictícios; não representam resultados do piloto.
- Sem pagamentos, mapas, notificações externas ou certificação sanitária.

Os testes das regras de reserva e dos fluxos podem ser executados com `npm test`.
