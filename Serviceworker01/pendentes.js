// public/pendentes.js
import { CONFIG } from "./configuracoes.js";
import { lerPendentes, marcarErro, confirmarPendente, lerProprietario } from "./bd.js";
import { expirarSessao } from "./app.js";

let aEnviarEmCurso = false;

export async function enviarPendentes() {
  if (aEnviarEmCurso) return;
  aEnviarEmCurso = true;

  try {
    const prop = await lerProprietario();
    if (!prop) return;
    const utilizadorAtual = prop.utilizador;

    const pendentes = await lerPendentes();
    // Filtrar apenas do utilizador atual e sem erro
    const minhasPendentes = pendentes.filter(p => p.utilizador === utilizadorAtual && p.erro === null);

    for (const p of minhasPendentes) {
      try {
        const resposta = await fetch(`${CONFIG.API_BASE_URL}/sugestoes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: p.titulo,
            descricao: p.descricao,
            categoria: p.categoria
          }),
          credentials: "include"
        });

        if (resposta.status === 201) {
          const sugestaoCriada = await resposta.json();
          await confirmarPendente(p.idLocal, sugestaoCriada);
        } else if (resposta.status === 400) {
          const errJson = await resposta.json();
          await marcarErro(p.idLocal, errJson.mensagem || "Erro de validação.");
        } else if (resposta.status === 401) {
          const pendentesRestantes = await lerPendentes();
          const n = pendentesRestantes.filter(item => item.utilizador === utilizadorAtual).length;
          expirarSessao(`Há ${n} sugestões por enviar. Entre de novo para as enviar.`);
          break;
        }
      } catch (err) {
        // Fetch rejeitado -> para e mantém todas
        break;
      }
    }
  } finally {
    aEnviarEmCurso = false;
  }
}