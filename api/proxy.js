export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée",
    });
  }

  try {
    // -----------------------------
    // 1. Vérification du token HF
    // -----------------------------
    const hfToken = process.env.HF_TOKEN;

    if (!hfToken) {
      return res.status(500).json({
        error: "HF_TOKEN manquant dans les variables Vercel",
      });
    }

    // -----------------------------
    // 2. Lire l'image reçue
    // -----------------------------
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const imageBuffer = Buffer.concat(chunks);

    if (!imageBuffer.length) {
      return res.status(400).json({
        error: "Image vide reçue par Vercel",
      });
    }

    console.log("Image reçue :", imageBuffer.length, "octets");

    // -----------------------------
    // 3. Hugging Face
    // -----------------------------
    // Nouveau routeur d'inférence
    const hfUrl =
      "https://router.huggingface.co/hf-inference/models/briaai/RMBG-1.4";

    console.log("Envoi vers Hugging Face...");

    const hfResponse = await fetch(hfUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/octet-stream",
        Accept: "image/png",
      },
      body: imageBuffer,
    });

    console.log(
      "Réponse Hugging Face :",
      hfResponse.status,
      hfResponse.statusText
    );

    // -----------------------------
    // 4. Gérer les erreurs HF
    // -----------------------------
    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();

      console.error("Erreur Hugging Face :", errorText);

      return res.status(hfResponse.status).json({
        error: "Erreur Hugging Face",
        status: hfResponse.status,
        details: errorText,
      });
    }

    // -----------------------------
    // 5. Récupérer le PNG
    // -----------------------------
    const resultBuffer = Buffer.from(
      await hfResponse.arrayBuffer()
    );

    console.log(
      "Image détourée reçue :",
      resultBuffer.length,
      "octets"
    );

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(resultBuffer);
  } catch (error) {
    console.error("Crash du proxy :", error);

    return res.status(500).json({
      error: error?.message || "Erreur inconnue",
      cause: error?.cause?.message || null,
    });
  }
}