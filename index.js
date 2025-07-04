const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const corsOptions = {
  origin: '*', // Für Entwicklung — für Produktion bitte spezifisch machen
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions));

// ── Supabase ──────────────────────────────────────────────────────────
const supabase = createClient(
  'https://messymbdttzqklkqqrds.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lc3N5bWJkdHR6cWtsa3FxcmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTU4NzcsImV4cCI6MjA2NzIzMTg3N30.FYeN-Mo18yIyoopoJAlfLDx-1iqrrABgDuJBT1Zq7WM'
);

// ── Turnier erstellen (KO‑System) ────────────────────────────────────
app.post('/api/tournaments', async (req, res) => {
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

  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({
      player1: shuffled[i],
      player2: shuffled[i + 1],
      winner: null,
    });
  }

  // Freilose sofort weiter
  for (const m of matches) {
    if (m.player1 === '--- Freilos ---' && m.player2 === '--- Freilos ---') {
      m.winner = m.player1;
    }
  }

  const { data: inserted, error } = await supabase
    .from('tournaments')
    .insert([{ name, data: { rounds: [matches] } }])
    .select();

  if (error) {
    console.error('Supabase INSERT Fehler:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, id: inserted[0].id });
});

// Intelligente Teamaufteilung mit Mindestgröße
function splitIntoBalancedTeams(players, minSize) {
  const total = players.length;

  // Maximale Anzahl an Teams, die minSize erfüllen
  let maxTeams = Math.floor(total / minSize);

  // Suche die optimale Verteilung (Teams ähnlich groß)
  for (let numTeams = maxTeams; numTeams >= 1; numTeams--) {
    const baseSize = Math.floor(total / numTeams);
    const extras = total % numTeams;

    if (baseSize < minSize) continue;

    const result = [];
    let i = 0;
    for (let t = 0; t < numTeams; t++) {
      const size = t < extras ? baseSize + 1 : baseSize;
      result.push(players.slice(i, i + size));
      i += size;
    }
    return result;
  }

  return [players]; // Falls nichts passt, alles in 1 Team
}




// ── NEU: zufällige Teams generieren ───────────────────────────────────
app.post('/api/teams', async (req, res) => {
  const { players, teamSize } = req.body;

  if (
    !Array.isArray(players) ||
    players.length < 2 ||
    !Number.isInteger(teamSize) ||
    teamSize < 2
  ) {
    return res.status(400).json({ message: 'Ungültige Daten' });
  }

  // Shuffle
  const shuffled = players
    .map(p => ({ sort: Math.random(), value: p }))
    .sort((a, b) => a.sort - b.sort)
    .map(p => p.value);

  // Chunk into teams
  const teams = splitIntoBalancedTeams(shuffled, teamSize);

  const teamNames = teams.map(team => team.join(' + '));

// auf 2^n auffüllen
const nextPower = 2 ** Math.ceil(Math.log2(teamNames.length));
while (teamNames.length < nextPower) teamNames.push('--- Freilos ---');

// Matches erstellen
const matches = [];
for (let i = 0; i < teamNames.length; i += 2) {
  matches.push({
    player1: teamNames[i],
    player2: teamNames[i + 1],
    winner: null,
  });
}
for (const m of matches) {
  if (m.player1 === '--- Freilos ---' && m.player2 === '--- Freilos ---') {
    m.winner = m.player1;
  }
}

// Turnier speichern
const { data: inserted, error } = await supabase
  .from('tournaments')
  .insert([{ name: 'Team-Turnier', data: { rounds: [matches] } }])
  .select();

if (error) {
  console.error('Supabase INSERT Fehler (Team-Turnier):', error);
  return res.status(500).json({ error: error.message });
}

res.json({ success: true, id: inserted[0].id, teams });

});

// ── Sonstige Routen (Turnierverwaltung) ───────────────────────────────
app.get('/api/tournaments', async (req, res) => {
  const { data, error } = await supabase.from('tournaments').select('id, name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/tournaments/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(data);
});

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