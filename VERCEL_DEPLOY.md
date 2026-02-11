# Vercel Deployment Anleitung

## Methode 1: Vercel CLI (Empfohlen)

### Schritt 1: Vercel CLI installieren
```bash
npm install -g vercel
```

### Schritt 2: Im Projektverzeichnis anmelden
```bash
cd /Users/pc/Downloads/_public_html-46
vercel login
```

### Schritt 3: Projekt deployen
```bash
vercel
```

Beim ersten Mal werden Sie gefragt:
- **Set up and deploy?** → `Y`
- **Which scope?** → Wählen Sie Ihr Konto
- **Link to existing project?** → `N` (für neues Projekt)
- **What's your project's name?** → Geben Sie einen Namen ein (z.B. `adlions`)
- **In which directory is your code located?** → `./` (aktuelles Verzeichnis)

Das Projekt wird automatisch deployed und Sie erhalten eine URL.

### Schritt 4: Produktions-Deployment
```bash
vercel --prod
```

---

## Methode 2: Vercel Dashboard (Web-Oberfläche)

### Option A: Drag & Drop

1. Gehen Sie zu [vercel.com](https://vercel.com) und melden Sie sich an
2. Klicken Sie auf **"Add New..."** → **"Project"**
3. Wählen Sie **"Browse"** oder ziehen Sie den gesamten Projektordner in das Browser-Fenster
4. Klicken Sie auf **"Deploy"**

### Option B: Git Integration (Empfohlen für Updates)

1. Erstellen Sie ein Git-Repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Pushen Sie zu GitHub/GitLab/Bitbucket

3. Gehen Sie zu [vercel.com](https://vercel.com)
4. Klicken Sie auf **"Add New..."** → **"Project"**
5. Wählen Sie Ihr Git-Repository aus
6. Vercel erkennt automatisch, dass es ein statisches Projekt ist
7. Klicken Sie auf **"Deploy"**

Bei zukünftigen Git-Pushes wird das Projekt automatisch neu deployed.

---

## Wichtige Hinweise

- **Root-Verzeichnis**: Das Projekt ist bereits im Root-Verzeichnis konfiguriert
- **Build-Befehl**: Nicht erforderlich für statische HTML-Projekte
- **Output-Verzeichnis**: `.` (aktuelles Verzeichnis)
- **Custom Domain**: Nach dem Deployment können Sie in den Vercel-Einstellungen eine eigene Domain hinzufügen

---

## Troubleshooting

Falls es Probleme gibt:
- Stellen Sie sicher, dass alle Pfade relativ sind (beginnen mit `/` oder `./`)
- Überprüfen Sie, ob alle Assets (CSS, JS, Bilder) korrekt geladen werden
- In den Vercel-Logs können Sie Fehler sehen
