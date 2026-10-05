import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { image, products = [] } = await req.json();
    if (!image) throw new Error("Imagem não informada.");

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY não configurada no Supabase.");

    const catalog = products.length
      ? products.map((p: any) => `${p.codigo || ""} | ${p.nome || ""}`).join("\n")
      : "Nenhum catálogo fornecido. Identifique o produto pelo rótulo quando possível.";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Você é um sistema de contagem de estoque por visão computacional. Analise a fotografia e identifique somente mercadorias visíveis. Conte unidades físicas quando possível. Não invente quantidades ocultas. Use o catálogo abaixo para associar produtos. Retorne SOMENTE JSON válido no formato {"itens":[{"codigo":"...","produto":"...","quantidade":0,"confianca":0,"observacao":"..."}]}. A confiança deve ser de 0 a 1. Se um produto não puder ser identificado com segurança, use codigo vazio e explique em observacao. Catálogo:\n${catalog}`,
            },
            { type: "input_image", image_url: image },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI: ${detail}`);
    }

    const data = await response.json();
    const text = data.output?.flatMap((o: any) => o.content || [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text).join("") || "{\"itens\":[]}";

    let result;
    try { result = JSON.parse(text); }
    catch { result = { itens: [], erro: "A IA não retornou JSON válido." }; }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ erro: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
