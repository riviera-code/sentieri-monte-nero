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

## Installarla sul telefono

- **iPhone (Safari):** Condividi → *Aggiungi alla schermata Home*.
- **Android (Chrome):** menu ⋮ → *Installa app* / *Aggiungi a schermata Home*.

Si apre a tutto schermo come un'app e funziona anche offline.

## File

- `index.html`, `app.js`, `style.css`: l'app (Leaflet 1.9.4 in `vendor/`).
- `tracks.json`: le tracce usate dalla mappa.
- `gpx/`: le tracce in GPX.
- `sw.js`, `manifest.webmanifest`: funzionamento offline e installazione.

Mappe: © OpenTopoMap, © OpenStreetMap, © Esri. Tracce: rilievi personali e komoot.
