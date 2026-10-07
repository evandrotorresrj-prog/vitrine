# Vitrine · Fase 3 — como colocar no ar

O código está pronto. Faltam as contas (só você pode criar) e o deploy.
Faça **primeiro em modo de teste** (Stripe "Test mode", app da Meta em "Desenvolvimento").

## 1. Banco (5 min)
Supabase → SQL Editor → cole e rode `migrations/20261004_fase3_stripe_instagram.sql`.

## 2. Stripe (15 min)
1. Crie a conta em dashboard.stripe.com e deixe **Test mode** ligado.
2. Developers → API keys → copie a **Secret key** (`sk_test_...`). A publishable key não é necessária (o checkout é hospedado pelo Stripe).
3. Grave os secrets e publique as funções (Supabase CLI, na pasta do projeto):
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... APP_URL=https://evandrotorresrj-prog.github.io/vitrine/
   supabase functions deploy stripe-checkout
   supabase functions deploy stripe-cancel
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
4. Stripe → Developers → Webhooks → **Add endpoint**
   - URL: `https://qbfmozumntequvecttfs.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`
   - Copie o **Signing secret** (`whsec_...`) e rode: `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
5. Teste: assine um plano no app com o cartão `4242 4242 4242 4242`, validade futura, CVC qualquer.

> ⚠️ Segurança: a função antiga `gerenciar-assinatura` ainda aceita `acao: "assinar"` — qualquer usuário conseguiria ativar o plano sem pagar chamando ela direto. Remova esse ramo (mantenha só `iniciar_trial`) antes de ir pra produção.

## 3. Instagram (20 min + revisão da Meta)
Usa o **login do Instagram** (não precisa de Página do Facebook). A conta do corretor precisa ser **Profissional** (Empresa ou Criador).
1. developers.facebook.com → Meus apps → **Criar app** → tipo **Empresa** → nome "Vitrine".
2. Adicione o produto **Instagram** → "API setup with Instagram login".
3. Copie o **Instagram App ID** e **Instagram App Secret** dessa tela.
4. Em "Set up Instagram business login" → Redirect URL:
   `https://qbfmozumntequvecttfs.supabase.co/functions/v1/instagram-oauth-callback`
5. Funções → Testadores do Instagram: adicione sua conta e aceite o convite no Instagram (Configurações → Apps e sites).
6. Secrets e deploy:
   ```bash
   supabase secrets set META_APP_ID=... META_APP_SECRET=... META_WEBHOOK_VERIFY_TOKEN=um-texto-qualquer-seu
   supabase functions deploy instagram-oauth-callback --no-verify-jwt
   supabase functions deploy instagram-publicar
   supabase functions deploy instagram-webhook --no-verify-jwt
   ```
7. (Opcional agora) Webhooks do Instagram: URL `.../functions/v1/instagram-webhook`, verify token = o texto acima, assinar `comments`.
8. Para corretores de fora usarem: enviar o app para **Análise da Meta** pedindo `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments` (leva dias; precisa de vídeo de demonstração e política de privacidade).

## 4. Frontend
Suba o `app.js` novo no GitHub (substitui o checkout simulado e a conexão simulada do Instagram).

## Ainda falta (próxima etapa)
- ~~Renderizar os slides como JPEG~~ ✅ feito: o app gera 1080×1350 no navegador, sobe no bucket `slides-render` e chama `instagram-publicar` (botão "Publicar no Instagram" no carrossel e opção "Publicar agora" no assistente).
- Resposta automática aos comentários "QUERO" usando os eventos do webhook.
