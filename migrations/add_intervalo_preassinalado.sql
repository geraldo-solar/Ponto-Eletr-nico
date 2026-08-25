-- Pré-assinalação do intervalo para repouso e alimentação (art. 74, §2º, da CLT).
-- Execute no SQL Editor do Supabase.
--
-- intervalo_preassinalado: quando true, a hora de repouso declarada é descontada
--   da jornada apurada nos dias em que o colaborador não bater o intervalo.
-- intervalo_inicio / intervalo_fim: o período declarado, conforme o termo de
--   ciência assinado pelo colaborador.
-- intervalo_vigencia: data a partir da qual o período passa a valer. Protege a
--   folha já fechada: alterar o horário não reescreve espelhos anteriores.

ALTER TABLE ponto_employees
ADD COLUMN IF NOT EXISTS intervalo_preassinalado BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS intervalo_inicio TIME,
ADD COLUMN IF NOT EXISTS intervalo_fim TIME,
ADD COLUMN IF NOT EXISTS intervalo_vigencia DATE;

-- Garante que, marcada a pré-assinalação, os três campos estejam preenchidos.
ALTER TABLE ponto_employees
DROP CONSTRAINT IF EXISTS ponto_employees_intervalo_completo;

ALTER TABLE ponto_employees
ADD CONSTRAINT ponto_employees_intervalo_completo CHECK (
    intervalo_preassinalado = false
    OR (intervalo_inicio IS NOT NULL AND intervalo_fim IS NOT NULL AND intervalo_vigencia IS NOT NULL)
);
