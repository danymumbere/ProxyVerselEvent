export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // 1. Autoriser Flutter à communiquer avec ce proxy
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 2. Assembler les morceaux de l'image envoyée par Flutter
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const imageBuffer = Buffer.concat(chunks);

    if (imageBuffer.length === 0) {
      throw new Error("L'image reçue par Vercel est vide.");
    }

    // 3. Envoyer à Hugging Face (CORRECTION ICI)
    const hfResponse = await fetch('https://api-inference.huggingface.co/models/briaai/RMBG-1.4', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/octet-stream', // Obligatoire : indique un fichier binaire
      },
      // Obligatoire pour Node.js 18+ : Convertir le Buffer en format Web natif
      body: new Uint8Array(imageBuffer), 
    });

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      return res.status(hfResponse.status).send(`Erreur Hugging Face: ${errorText}`);
    }

    // 4. Renvoyer l'image sans fond à Flutter
    const resultBuffer = await hfResponse.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    return res.send(Buffer.from(resultBuffer));

  } catch (error) {
    console.error("Crash du proxy Vercel:", error);
    // Renvoie plus de détails s'il y a une erreur réseau sous-jacente
    return res.status(500).json({ 
      error: error.message, 
      cause: error.cause ? error.cause.message : "Inconnue" 
    });
  }
}