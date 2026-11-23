const LIMITE_BYTES_FOTO = 300 * 1024; // 300 KB

const estadoFormulario = {
  categorias: [],
  blobFotografia: null,
  zoomMapa: 17,
  candidatasAtuais: [],
  recusadasIds: [],
  dadosPendentesEnvio: null
};

// --- Compressao de fotografia em Canvas ate caber em 300 KB ---

function carregarImagemDeFicheiro(ficheiro) {
  return new Promise((resolver, rejeitar) => {
    const url = URL.createObjectURL(ficheiro);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolver(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rejeitar(new Error('Nao foi possivel ler a imagem selecionada.'));
    };
    img.src = url;
  });
}

function canvasParaBlobJpeg(canvas, qualidade) {
  return new Promise((resolver) => {
    canvas.toBlob((blob) => resolver(blob), 'image/jpeg', qualidade);
  });
}

async function comprimirFotografiaAte300KB(ficheiro) {
  const img = await carregarImagemDeFicheiro(ficheiro);
  const dimensoesMaximas = [1280, 960, 720, 540];
  const qualidades = [0.82, 0.7, 0.55, 0.4, 0.28];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  for (const maxDim of dimensoesMaximas) {
    let largura = img.width;
    let altura = img.height;
    if (largura > maxDim || altura > maxDim) {
      if (largura >= altura) {
        altura = Math.round((altura * maxDim) / largura);
        largura = maxDim;
      } else {
        largura = Math.round((largura * maxDim) / altura);
        altura = maxDim;
      }
    }

    canvas.width = largura;
    canvas.height = altura;
    ctx.clearRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);

    for (const q of qualidades) {
      const blob = await canvasParaBlobJpeg(canvas, q);
      if (blob && blob.size <= LIMITE_BYTES_FOTO) {
        return blob;
      }
    }
  }

  throw new Error('Nao foi possivel comprimir a fotografia abaixo de 300 KB.');
}

// --- Mapa interativo (mosaicos OpenStreetMap network-only + degradacao offline) ---

function latLngParaTileFracionario(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileFracionarioParaLatLng(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

function atualizarMapaVisual(ocorrenciasProximas = []) {
  const contentor = document.getElementById('mapa-interactivo');
  const mosaicosEl = document.getElementById('mapa-mosaicos');
  const marcadoresEl = document.getElementById('mapa-marcadores');
  const zoomLabel = document.getElementById('nivel-zoom');

  if (!contentor || !mosaicosEl || !marcadoresEl) return;

  const lat = Number(document.getElementById('lat').value);
  const lng = Number(document.getElementById('lng').value);
  const zoom = estadoFormulario.zoomMapa;
  zoomLabel.textContent = `z${zoom}`;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const largura = contentor.clientWidth || 600;
  const altura = contentor.clientHeight || 240;
  const centro = latLngParaTileFracionario(lat, lng, zoom);
  const centroTileX = Math.floor(centro.x);
  const centroTileY = Math.floor(centro.y);

  const offsetCentroX = (centro.x - centroTileX) * 256;
  const offsetCentroY = (centro.y - centroTileY) * 256;

  mosaicosEl.innerHTML = '';

  if (navigator.onLine) {
    const nTiles = Math.pow(2, zoom);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = ((centroTileX + dx) % nTiles + nTiles) % nTiles;
        const ty = centroTileY + dy;
        if (ty < 0 || ty >= nTiles) continue;

        const img = document.createElement('img');
        img.alt = '';
        img.src = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
        img.style.left = `${Math.round(largura / 2 - offsetCentroX + dx * 256)}px`;
        img.style.top = `${Math.round(altura / 2 - offsetCentroY + dy * 256)}px`;
        img.onerror = () => {
          img.style.display = 'none';
        };
        mosaicosEl.appendChild(img);
      }
    }
  }

  marcadoresEl.innerHTML = '';
  for (const oc of ocorrenciasProximas) {
    if (!oc.localizacao) continue;
    const pos = latLngParaTileFracionario(oc.localizacao.lat, oc.localizacao.lng, zoom);
    const px = largura / 2 + (pos.x - centro.x) * 256;
    const py = altura / 2 + (pos.y - centro.y) * 256;

    if (px >= -10 && px <= largura + 10 && py >= -10 && py <= altura + 10) {
      const pino = document.createElement('div');
      pino.className = 'pino-existente';
      pino.style.left = `${Math.round(px)}px`;
      pino.style.top = `${Math.round(py)}px`;
      pino.title = `#${oc.id} (${oc.categoria}) - ${oc.comunicacoes} comunicacoes`;
      marcadoresEl.appendChild(pino);
    }
  }
}

async function carregarOcorrenciasNoMapa() {
  const lat = Number(document.getElementById('lat').value);
  const lng = Number(document.getElementById('lng').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const delta = 0.006;
  const bbox = `${(lng - delta).toFixed(5)},${(lat - delta).toFixed(5)},${(lng + delta).toFixed(5)},${(lat + delta).toFixed(5)}`;

  if (navigator.onLine) {
    try {
      const resp = await fetch(`/v1/ocorrencias?bbox=${encodeURIComponent(bbox)}`);
      if (resp.ok) {
        const lista = await resp.json();
        await guardarOcorrencias(lista);
        atualizarMapaVisual(lista);
        return;
      }
    } catch (_) {}
  }

  const locais = await lerTodasOcorrencias();
  atualizarMapaVisual(locais.filter((o) => o.estado !== 'resolvida'));
}

// --- Validacao de precisao GPS vs raio da categoria ---

function obterCategoriaSelecionada() {
  const idCat = document.getElementById('categoria').value;
  return estadoFormulario.categorias.find((c) => c.id === idCat) || null;
}

function atualizarAvisoPrecisao() {
  const cat = obterCategoriaSelecionada();
  const infoRaio = document.getElementById('info-raio');
  const estadoPrecisao = document.getElementById('estado-precisao');
  const alertaPrecisao = document.getElementById('alerta-precisao');
  const precisao = Number(document.getElementById('precisao').value);

  if (cat) {
    infoRaio.textContent = `Raio de detecao de duplicados desta categoria: ${cat.raio} m.`;
  }

  if (Number.isFinite(precisao)) {
    estadoPrecisao.textContent = `Precisao atual indicada: ±${precisao} metros.`;
  }

  if (cat && Number.isFinite(precisao) && precisao > cat.raio) {
    const instrucaoRede = navigator.onLine
      ? ' Ajuste o ponto exato clicando no mapa abaixo antes de comunicar.'
      : ' Sem ligacao ao mapa: tente aproximar-se mais do local ou aguarde melhor sinal GPS.';
    alertaPrecisao.textContent = `Atencao: a precisao atual (${precisao} m) e pior do que o raio da categoria (${cat.raio} m).${instrucaoRede}`;
    alertaPrecisao.classList.remove('oculto');
  } else {
    alertaPrecisao.classList.add('oculto');
  }
}

function obterLocalizacaoGPS() {
  const estadoPrecisao = document.getElementById('estado-precisao');
  if (!('geolocation' in navigator)) {
    estadoPrecisao.textContent = 'Geolocalizacao nao suportada neste browser. Indique as coordenadas manualmente.';
    return;
  }

  estadoPrecisao.textContent = 'A obter coordenadas GPS de alta precisao...';

  navigator.geolocation.getCurrentPosition(
    (posicao) => {
      const lat = Number(posicao.coords.latitude.toFixed(6));
      const lng = Number(posicao.coords.longitude.toFixed(6));
      const precisao = Math.round(posicao.coords.accuracy || 15);

      document.getElementById('lat').value = lat;
      document.getElementById('lng').value = lng;
      document.getElementById('precisao').value = precisao;

      atualizarAvisoPrecisao();
      carregarOcorrenciasNoMapa();
    },
    (erro) => {
      estadoPrecisao.textContent = `Nao foi possivel obter GPS (${erro.message}). Pode clicar no mapa ou preencher as coordenadas.`;
      atualizarAvisoPrecisao();
      carregarOcorrenciasNoMapa();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// --- Consulta de semelhantes com timeout de 3 segundos ---

async function consultarSemelhantesComTimeout(categoria, lat, lng) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 3000);

  try {
    const url = `/v1/ocorrencias/semelhantes?categoria=${encodeURIComponent(categoria)}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
    const resposta = await fetch(url, { signal: controlador.signal });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    return Array.isArray(dados.candidatas) ? dados.candidatas : [];
  } catch (_) {
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}

function mostrarPainelCandidatas(candidatas) {
  const painel = document.getElementById('painel-semelhantes');
  const listaEl = document.getElementById('lista-candidatas');
  listaEl.innerHTML = '';

  if (candidatas.length === 0) {
    painel.classList.add('oculto');
    return;
  }

  for (const item of candidatas) {
    const oc = item.ocorrencia;
    const card = document.createElement('div');
    card.className = 'cartao-candidata';

    const fotoHtml = oc.temFotografia
      ? `<img class="candidata-foto" src="/v1/ocorrencias/${oc.id}/fotografia" alt="Fotografia da ocorrencia #${oc.id}">`
      : '';

    card.innerHTML = `
      <div class="candidata-cabecalho">
        <strong>Ocorrencia #${oc.id} · ${oc.categoria}</strong>
        <span>A ${item.distancia} m · ${oc.comunicacoes} comunicacoes</span>
      </div>
      <p>${oc.descricao}</p>
      ${fotoHtml}
      <div class="candidata-botoes">
        <button type="button" class="btn-primario btn-pequeno btn-e-esta">E esta (reforcar)</button>
        <button type="button" class="btn-secundario btn-pequeno btn-e-outra">E outra</button>
      </div>
    `;

    card.querySelector('.btn-e-esta').addEventListener('click', async () => {
      await finalizarGravacaoPendente({
        tipo: 'reforco',
        dados: {
          ocorrenciaId: oc.id,
          comentario: estadoFormulario.dadosPendentesEnvio.descricao,
          categoria: oc.categoria,
          descricao: estadoFormulario.dadosPendentesEnvio.descricao
        },
        fotografia: null
      });
    });

    card.querySelector('.btn-e-outra').addEventListener('click', async () => {
      if (!estadoFormulario.recusadasIds.includes(oc.id)) {
        estadoFormulario.recusadasIds.push(oc.id);
      }
      estadoFormulario.candidatasAtuais = estadoFormulario.candidatasAtuais.filter(
        (c) => c.ocorrencia.id !== oc.id
      );

      if (estadoFormulario.candidatasAtuais.length === 0) {
        await finalizarGravacaoPendente({
          tipo: 'ocorrencia',
          dados: {
            ...estadoFormulario.dadosPendentesEnvio,
            recusadas: [...estadoFormulario.recusadasIds]
          },
          fotografia: estadoFormulario.blobFotografia
        });
      } else {
        mostrarPainelCandidatas(estadoFormulario.candidatasAtuais);
      }
    });

    listaEl.appendChild(card);
  }

  painel.classList.remove('oculto');
}

async function finalizarGravacaoPendente(objetoPendente) {
  await window.ReportaApp.registarNovaPendente(objetoPendente);

  // Limpar formulario e estado auxiliar
  document.getElementById('descricao').value = '';
  document.getElementById('contador-caracteres').textContent = '0 / 500';
  document.getElementById('fotografia').value = '';
  document.getElementById('preview-foto-container').classList.add('oculto');
  document.getElementById('painel-semelhantes').classList.add('oculto');

  estadoFormulario.blobFotografia = null;
  estadoFormulario.candidatasAtuais = [];
  estadoFormulario.recusadasIds = [];
  estadoFormulario.dadosPendentesEnvio = null;
}

function inicializarFormulario(categorias) {
  estadoFormulario.categorias = categorias;

  const selectCategoria = document.getElementById('categoria');
  selectCategoria.innerHTML = '';
  for (const cat of categorias) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.nome} (raio ${cat.raio} m)`;
    selectCategoria.appendChild(opt);
  }

  // Coordenadas iniciais por omissao (Covilha / centro) caso GPS demore
  if (!document.getElementById('lat').value) {
    document.getElementById('lat').value = '40.281000';
    document.getElementById('lng').value = '-7.504000';
  }

  selectCategoria.addEventListener('change', atualizarAvisoPrecisao);
  document.getElementById('precisao').addEventListener('input', atualizarAvisoPrecisao);
  document.getElementById('lat').addEventListener('change', carregarOcorrenciasNoMapa);
  document.getElementById('lng').addEventListener('change', carregarOcorrenciasNoMapa);

  // Contador de caracteres
  const textareaDesc = document.getElementById('descricao');
  textareaDesc.addEventListener('input', () => {
    document.getElementById('contador-caracteres').textContent = `${textareaDesc.value.length} / 500`;
  });

  // Fotografia + compressao
  const inputFoto = document.getElementById('fotografia');
  inputFoto.addEventListener('change', async () => {
    const erroEl = document.getElementById('erro-formulario');
    erroEl.classList.add('oculto');

    const ficheiro = inputFoto.files && inputFoto.files[0];
    if (!ficheiro) {
      estadoFormulario.blobFotografia = null;
      document.getElementById('preview-foto-container').classList.add('oculto');
      return;
    }

    try {
      const blobComprimido = await comprimirFotografiaAte300KB(ficheiro);
      estadoFormulario.blobFotografia = blobComprimido;

      const previewUrl = URL.createObjectURL(blobComprimido);
      const imgPreview = document.getElementById('preview-foto');
      imgPreview.onload = () => URL.revokeObjectURL(previewUrl);
      imgPreview.src = previewUrl;

      const kb = (blobComprimido.size / 1024).toFixed(1);
      document.getElementById('info-foto').textContent = `JPEG comprimido: ${kb} KB`;
      document.getElementById('preview-foto-container').classList.remove('oculto');
    } catch (err) {
      estadoFormulario.blobFotografia = null;
      inputFoto.value = '';
      erroEl.textContent = err.message;
      erroEl.classList.remove('oculto');
    }
  });

  document.getElementById('btn-remover-foto').addEventListener('click', () => {
    estadoFormulario.blobFotografia = null;
    inputFoto.value = '';
    document.getElementById('preview-foto-container').classList.add('oculto');
  });

  // Controlos do mapa
  document.getElementById('btn-obter-gps').addEventListener('click', obterLocalizacaoGPS);

  document.getElementById('btn-zoom-mais').addEventListener('click', () => {
    if (estadoFormulario.zoomMapa < 19) {
      estadoFormulario.zoomMapa += 1;
      carregarOcorrenciasNoMapa();
    }
  });

  document.getElementById('btn-zoom-menos').addEventListener('click', () => {
    if (estadoFormulario.zoomMapa > 13) {
      estadoFormulario.zoomMapa -= 1;
      carregarOcorrenciasNoMapa();
    }
  });

  document.getElementById('mapa-interactivo').addEventListener('click', (ev) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const clickX = ev.clientX - rect.left;
    const clickY = ev.clientY - rect.top;

    const latAtual = Number(document.getElementById('lat').value);
    const lngAtual = Number(document.getElementById('lng').value);
    if (!Number.isFinite(latAtual) || !Number.isFinite(lngAtual)) return;

    const centro = latLngParaTileFracionario(latAtual, lngAtual, estadoFormulario.zoomMapa);
    const novoTileX = centro.x + (clickX - rect.width / 2) / 256;
    const novoTileY = centro.y + (clickY - rect.height / 2) / 256;
    const novaCoord = tileFracionarioParaLatLng(novoTileX, novoTileY, estadoFormulario.zoomMapa);

    document.getElementById('lat').value = novaCoord.lat.toFixed(6);
    document.getElementById('lng').value = novaCoord.lng.toFixed(6);
    document.getElementById('precisao').value = '5';

    atualizarAvisoPrecisao();
    carregarOcorrenciasNoMapa();
  });

  // Botoes do painel de candidatas
  document.getElementById('btn-confirmar-nova').addEventListener('click', async () => {
    if (!estadoFormulario.dadosPendentesEnvio) return;
    const todasRecusadas = Array.from(
      new Set([
        ...estadoFormulario.recusadasIds,
        ...estadoFormulario.candidatasAtuais.map((c) => c.ocorrencia.id)
      ])
    );

    await finalizarGravacaoPendente({
      tipo: 'ocorrencia',
      dados: {
        ...estadoFormulario.dadosPendentesEnvio,
        recusadas: todasRecusadas
      },
      fotografia: estadoFormulario.blobFotografia
    });
  });

  document.getElementById('btn-cancelar-candidatas').addEventListener('click', () => {
    document.getElementById('painel-semelhantes').classList.add('oculto');
  });

  // Submissao do formulario
  document.getElementById('form-ocorrencia').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erroEl = document.getElementById('erro-formulario');
    erroEl.classList.add('oculto');

    const categoria = document.getElementById('categoria').value;
    const descricao = document.getElementById('descricao').value.trim();
    const lat = Number(document.getElementById('lat').value);
    const lng = Number(document.getElementById('lng').value);
    const precisao = Number(document.getElementById('precisao').value);

    if (descricao.length < 10 || descricao.length > 500) {
      erroEl.textContent = 'A descricao deve ter entre 10 e 500 caracteres.';
      erroEl.classList.remove('oculto');
      return;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(precisao) || precisao < 0) {
      erroEl.textContent = 'Indique coordenadas e precisao validas.';
      erroEl.classList.remove('oculto');
      return;
    }

    const dadosOcorrencia = {
      categoria,
      descricao,
      localizacao: { lat, lng, precisao },
      recusadas: []
    };

    const btnSubmeter = document.getElementById('btn-submeter');
    btnSubmeter.disabled = true;

    try {
      // Com ligacao, consulta semelhantes com timeout de 3 segundos antes de gravar
      if (navigator.onLine) {
        const candidatas = await consultarSemelhantesComTimeout(categoria, lat, lng);
        if (candidatas && candidatas.length > 0) {
          estadoFormulario.dadosPendentesEnvio = dadosOcorrencia;
          estadoFormulario.candidatasAtuais = candidatas;
          estadoFormulario.recusadasIds = [];
          mostrarPainelCandidatas(candidatas);
          return;
        }
      }

      // Sem ligacao, falha/timeout de 3 s ou sem candidatas: grava diretamente como pendente
      await finalizarGravacaoPendente({
        tipo: 'ocorrencia',
        dados: dadosOcorrencia,
        fotografia: estadoFormulario.blobFotografia
      });
    } finally {
      btnSubmeter.disabled = false;
    }
  });

  atualizarAvisoPrecisao();
  obterLocalizacaoGPS();
}