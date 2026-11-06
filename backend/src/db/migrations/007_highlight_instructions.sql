-- Instruções mais completas para os critérios predefinidos (melhora o recall).
-- A avaliação mostrou precisão alta (93%) e recall baixo (61%): o modelo deixava
-- de grifar definições escritas sem "X é...", fórmulas no meio de frases e
-- exemplos sem "por exemplo".

UPDATE highlight_criteria SET instruction =
  'Frases que dizem o que um termo ou conceito é, faz, mede, descreve ou significa, ou em que condições ele vale. Ex.: "X é...", "X mede...", "X descreve...", "X analisa...", "X é definido como...", "uma função é contínua quando...", "chama-se X...".'
WHERE notebook_id IS NULL AND key = 'definicoes';

UPDATE highlight_criteria SET instruction =
  'Toda frase que contém uma fórmula, equação, expressão matemática, símbolo ou regra de cálculo, mesmo no meio do texto. Ex.: "lim f(x) = L", "a derivada de x² é 2x", "F(b) - F(a)", "f''(x)g(x) + f(x)g''(x)", regras como a da potência ou a da cadeia.'
WHERE notebook_id IS NULL AND key = 'formulas';

UPDATE highlight_criteria SET instruction =
  'Frases que contêm datas, anos, séculos, décadas ou períodos históricos ligados a um fato. Se o texto não tiver datas, não grife nada.'
WHERE notebook_id IS NULL AND key = 'datas';

UPDATE highlight_criteria SET instruction =
  'Frases que ilustram um conceito com um caso concreto: "por exemplo", "como em", "ex.:", aplicações em outra área (ex.: "na física, ..."), casos particulares (ex.: "polinômios são contínuos") ou exemplos numéricos.'
WHERE notebook_id IS NULL AND key = 'exemplos';

UPDATE highlight_criteria SET instruction =
  'Ideias centrais do assunto: princípios, teoremas, propriedades e relações entre conceitos que sustentam o restante do conteúdo (ex.: um teorema, "X e Y são operações inversas").'
WHERE notebook_id IS NULL AND key = 'conceitos-fundamentais';
