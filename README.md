# Sentieri Monte Nero

Mappa da portare in giro dei sentieri e-bike/MTB di Monte Nero e dintorni (Bordighera, Sasso, Seborga, Ospedaletti, Sanremo).

**Apri la mappa:** https://riviera-code.github.io/sentieri-monte-nero/

## Cosa fa

- **15 sentieri** sulla mappa topografica, con inizio (pallino pieno) e fine (pallino vuoto).
- **La tua posizione** (pulsante in alto a destra): punto blu con precisione e direzione di marcia.
  - Primo tocco: ti trova e ti segue. Se sposti la mappa a mano smette di seguirti; tocca di nuovo per ricentrare. Terzo tocco: spegne il GPS.
  - In alto ti dice su quale sentiero sei, quanto hai fatto e quanto manca, oppure qual è il sentiero più vicino e a che distanza.
  - Lo schermo resta acceso mentre il GPS è attivo, dove il telefono lo permette.
  - La posizione resta sul telefono, non viene inviata a nessuno.
- **Elenco sentieri** (pannello in basso): ordinati dal più vicino quando il GPS è attivo. Tocca un sentiero per inquadrarlo; l'occhio lo mostra o nasconde.
- **Scarica GPX** e **Apri su komoot** dal fumetto di ogni sentiero.
- **Funziona senza segnale**: il pulsante con la freccia in giù salva sul telefono la mappa topografica della zona (circa 30 MB, meglio col Wi-Fi). Anche i riquadri già visti restano salvati.

## Note e foto dei sopralluoghi

Sono **pubbliche**: chiunque apre la mappa le vede (segnaposto con icona, scheda *Note* nel pannello in basso). Solo chi ha collegato una chiave GitHub può aggiungerle.

- **Pulsante verde con la fotocamera**: nuova nota nel punto in cui sei (posizione GPS). Oppure **tieni premuto** un punto della mappa per metterla lì.
- Tipo (Nota, Problema, Bivio, Acqua, Panorama, Da sistemare), testo e foto (scattate al momento o dalla galleria). Le foto vengono ridimensionate (max 1600 px) prima del caricamento.
- **Senza segnale**: la nota si salva sul telefono e si carica da sola sul sito appena torna la rete (⏳ = da caricare).
- Dal fumetto: **Modifica**, **Sposta** (trascina il segnaposto), **Portami qui** (navigazione con Google Maps).
- **Esporta punti GPX**: tutte le note come waypoint, per altre app.

### Collegare GitHub (una volta per telefono)

1. Su GitHub: *Settings → Developer settings → Fine-grained tokens → Generate new token*.
2. *Repository access* → solo **sentieri-monte-nero**; *Permissions* → **Contents: Read and write**.
3. Nell'app: scheda *Note* → **Collega GitHub** → incolla la chiave. Resta salvata solo su quel telefono; *Scollega* la toglie.

Ogni caricamento è un commit nella cartella `sopralluoghi/` (`notes.json` + `foto/`). Il sito pubblico si aggiorna dopo circa un minuto.

## Installarla sul telefono

- **iPhone (Safari):** Condividi → *Aggiungi alla schermata Home*.
- **Android (Chrome):** menu ⋮ → *Installa app* / *Aggiungi a schermata Home*.

Si apre a tutto schermo come un'app e funziona anche offline.

## File

- `index.html`, `app.js`, `notes.js`, `style.css`: l'app (Leaflet 1.9.4 in `vendor/`).
- `sopralluoghi/`: note e foto caricate dall'app (si crea al primo caricamento).
- `tracks.json`: le tracce usate dalla mappa.
- `gpx/`: le tracce in GPX.
- `sw.js`, `manifest.webmanifest`: funzionamento offline e installazione.

Mappe: © OpenTopoMap, © OpenStreetMap, © Esri. Tracce: rilievi personali e komoot.
