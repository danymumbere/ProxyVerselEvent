// Désactive le parsing automatique pour pouvoir lire l'image brute (binaire)
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // 1. Autoriser le CORS pour Flutter Web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Récupérer les octets de l'image envoyée par Flutter
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const imageBuffer = Buffer.concat(chunks);

  try {
    // 3. Envoyer l'image à Hugging Face
    // process.env.HF_TOKEN ira chercher votre clé secrète configurée sur Vercel
    const hfResponse = await fetch('https://api-inference.huggingface.co/models/briaai/RMBG-1.4', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
      },
      body: imageBuffer,
    });

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      return res.status(hfResponse.status).send(`Erreur Hugging Face: ${errorText}`);
    }

    // 4. Renvoyer l'image sans fond (PNG) à Flutter
    const resultBuffer = await hfResponse.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    return res.send(Buffer.from(resultBuffer));

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}