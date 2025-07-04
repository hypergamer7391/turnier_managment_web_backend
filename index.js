const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Supabase konfigurieren
const supabase = createClient(
  'https://messymbdttzqklkqqrds.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lc3N5bWJkdHR6cWtsa3FxcmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTU4NzcsImV4cCI6MjA2NzIzMTg3N30.FYeN-Mo18yIyoopoJAlfLDx-1iqrrABgDuJBT1Zq7WM'
);app.post('/api/tournaments', async (req, res) => {
  const { name, players } = req.body;

  if (!name || !Array.isArray(players) || players.length < 2) {
    return res.status(400).json({ message: 'Ungültige Daten' });
  }

  // Spieler mischen
  const shuffled = players
    .map(p => ({ sort: Math.random(), value: p }))
    .sort((a, b) => a.sort - b.sort)
    .map(p => p.value);

  // auf 2^n auffüllen
  const nextPower = 2 ** Math.ceil(Math.log2(shuffled.length));
  while (shuffled.length < nextPower) shuffled.push('--- Freilos ---');

  // ❗ HIER war dein Fehler – matches fehlte
  const matches = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({
      player1: shuffled[i],
      player2: shuffled[i + 1],
      winner: null,
    });
  }

  for (let j = 0; j < matches.length; j++) {
    if (
      matches[j].player1 === '--- Freilos ---' &&
      matches[j].player2 === '--- Freilos ---'
    ) {
      matches[j].winner = matches[j].player1;
    }
  }

  const { data: inserted, error } = await supabase
    .from('tournaments')
    .insert([{ name, data: { rounds: [matches] } }])
    .select();

  if (error) {
    console.error("Supabase INSERT Fehler:", error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, id: inserted[0].id });
});


// Alle Turniere abrufen
app.get('/api/tournaments', async (req, res) => {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Einzelnes Turnier
app.get('/api/tournaments/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Nicht gefunden' });

  res.json(data);
});

// Turnier aktualisieren
app.put('/api/tournaments/:id', async (req, res) => {
  const { data: newData } = req.body;

  if (!newData) return res.status(400).json({ error: 'Keine Turnierdaten im Body' });

  const { error } = await supabase
    .from('tournaments')
    .update({ data: newData })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
