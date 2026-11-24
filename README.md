# Sentieri Monte Nero

Mappa da portare in giro dei sentieri e-bike/MTB di Monte Nero e dintorni (Bordighera, Sasso, Seborga, Ospedaletti, Sanremo).

**Apri la mappa:** https://riviera-code.github.io/sentieri-monte-nero/

## Cosa fa

- **16 sentieri** sulla mappa topografica, con inizio (pallino pieno) e fine (pallino vuoto).
- **La tua posizione** (pulsante in alto a destra): punto blu con precisione e direzione di marcia.
  - Primo tocco: ti trova e ti segue. Se sposti la mappa a mano smette di seguirti; tocca di nuovo per ricentrare. Terzo tocco: spegne il GPS.
  - In alto ti dice su quale sentiero sei, quanto hai fatto e quanto manca, oppure qual è il sentiero più vicino e a che distanza.
  - Lo schermo resta acceso mentre il GPS è attivo, dove il telefono lo permette.
  - La posizione resta sul telefono, non viene inviata a nessuno.
- **Elenco sentieri** (pannello in basso): ordinati dal più vicino quando il GPS è attivo. Tocca un sentiero per inquadrarlo; l'occhio lo mostra o nasconde.
- **Confini comunali** (linea grigia tratto-punto, con il nome del comune al centro e, avvicinando la mappa, in piccolo lungo il confine da entrambi i lati): si accendono e spengono dal pulsante dei livelli in basso a destra. Fonte: OpenStreetMap.
- **Scarica GPX** e **Apri su komoot** dal fumetto di ogni sentiero.
- **Funziona senza segnale**: il pulsante con la freccia in giù salva sul telefono la mappa topografica della zona (circa 30 MB, meglio col Wi-Fi). Anche i riquadri già visti restano salvati.

## Giri completati

Scheda **Giri** nel pannello in basso: le uscite registrate, con data, orari, km, dislivello e tempo in movimento. Sulla mappa sono tratteggiate e stanno sotto i sentieri; l'occhio le nasconde. Non contano per "Sei su…".

- 23.11.26 · **Monte Carparo - Bordighera**: 40,9 km, ↑ 1499 m.
- 21.11.26 · **Monte Nero - Giro del Sabato**: 24,8 km, ↑ 840 m ([komoot](https://www.komoot.com/tour/3401889958)).

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
- `confini.json`: confini dei comuni della zona (OpenStreetMap, semplificati).
- `rides.json`: i giri completati (traccia semplificata e statistiche).
- `gpx/`: le tracce in GPX; `gpx/giri/` i giri completi.
- `sw.js`, `manifest.webmanifest`: funzionamento offline e installazione.

Mappe: © OpenTopoMap, © OpenStreetMap, © Esri. Confini comunali: © OpenStreetMap (ODbL). Tracce: rilievi personali e komoot.
