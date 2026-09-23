-- VEN-10, fase 2: tentativas erradas de PIN e de senha do Ponto.
-- Execute no SQL Editor do Supabase.
--
-- O PIN passa a ser conferido no servidor (api/ponto.js). Cada erro fica
-- anotado com o endereço de origem; 20 erros em 15 minutos bloqueiam aquele
-- endereço por 15 minutos. Só o servidor lê e grava esta tabela.

CREATE TABLE IF NOT EXISTS public.ponto_tentativas (
  id BIGSERIAL PRIMARY KEY,
  endereco TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ponto_tentativas_endereco_idx
  ON public.ponto_tentativas (endereco, criado_em DESC);

ALTER TABLE public.ponto_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ponto_tentativas FROM anon, authenticated;
