import { InferenceClient } from "@huggingface/inference";
import sharp from "sharp";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // -----------------------------
  // CORS
  // -----------------------------
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
    // 1. Récupérer le token HF
    // -----------------------------
    const hfToken = process.env.HF_TOKEN;

    if (!hfToken) {
      return res.status(500).json({
        error: "HF_TOKEN absent des variables Vercel",
      });
    }

    // -----------------------------
    // 2. Lire l'image envoyée
    // -----------------------------
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const imageBuffer = Buffer.concat(chunks);

    if (!imageBuffer || imageBuffer.length === 0) {
      return res.status(400).json({
        error: "Aucune image reçue",
      });
    }

    console.log(
      "📥 Image reçue :",
      imageBuffer.length,
      "octets"
    );

    // -----------------------------
    // 3. Créer le client Hugging Face
    // -----------------------------
    const hf = new InferenceClient(hfToken);

    console.log(
      "🤖 Envoi vers Hugging Face / Fal AI..."
    );

    // -----------------------------
    // 4. RMBG-2.0 via Fal AI
    // -----------------------------
    const segmentation = await hf.imageSegmentation({
      data: imageBuffer,
      model: "briaai/RMBG-2.0",
      provider: "fal-ai",
    });

    console.log(
      "✅ Réponse segmentation reçue"
    );

    if (!segmentation || segmentation.length === 0) {
      return res.status(500).json({
        error: "Aucun masque retourné par le modèle",
      });
    }

    console.log(
      "Nombre de segments :",
      segmentation.length
    );

    // -----------------------------
    // 5. Trouver le masque principal
    // -----------------------------
    let selectedSegment = segmentation[0];

    for (const segment of segmentation) {
      const label = String(segment.label || "").toLowerCase();

      if (
        label.includes("foreground") ||
        label.includes("person") ||
        label.includes("object")
      ) {
        selectedSegment = segment;
        break;
      }
    }

    if (!selectedSegment.mask) {
      return res.status(500).json({
        error: "Le modèle n'a retourné aucun masque exploitable",
      });
    }

    // -----------------------------
    // 6. Décoder le masque
    // -----------------------------
    const maskBase64 = selectedSegment.mask;

    const maskBuffer = Buffer.from(
      maskBase64,
      "base64"
    );

    console.log(
      "🎭 Masque reçu :",
      maskBuffer.length,
      "octets"
    );

    // -----------------------------
    // 7. Mettre le masque à la taille
    //    exacte de l'image originale
    // -----------------------------
    const original = sharp(imageBuffer);

    const metadata = await original.metadata();

    if (!metadata.width || !metadata.height) {
      return res.status(500).json({
        error: "Impossible de déterminer la taille de l'image",
      });
    }

    console.log(
      "📐 Taille image :",
      metadata.width,
      "x",
      metadata.height
    );

    const resizedMask = await sharp(maskBuffer)
      .resize(metadata.width, metadata.height)
      .grayscale()
      .toBuffer();

    // -----------------------------
    // 8. Convertir le masque en Alpha
    // -----------------------------
    const rgbaImage = await original
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const alphaMask = await sharp(resizedMask)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = rgbaImage.data;
    const alpha = alphaMask.data;

    // Appliquer le masque au canal alpha
    for (let i = 0, a = 0; i < pixels.length; i += 4, a++) {
      pixels[i + 3] = alpha[a];
    }

    // -----------------------------
    // 9. Générer le PNG transparent
    // -----------------------------
    const outputBuffer = await sharp(pixels, {
      raw: {
        width: rgbaImage.info.width,
        height: rgbaImage.info.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    console.log(
      "🎉 PNG transparent généré :",
      outputBuffer.length,
      "octets"
    );

    // -----------------------------
    // 10. Retour à Flutter
    // -----------------------------
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(outputBuffer);

  } catch (error) {
    console.error(
      "❌ ERREUR PROXY :",
      error
    );

    return res.status(500).json({
      error: error?.message || "Erreur inconnue",
      cause: error?.cause?.message || null,
      stack:
        process.env.NODE_ENV === "development"
          ? error?.stack
          : undefined,
    });
  }
}