# Intrepid

A travel-tracking app for iOS (React Native / Expo). Explore an interactive globe of countries, destinations and spots, mark the places you've been, and keep notes, dates and photos for each visit.

## Features

- **Interactive globe map** (Mapbox) with country pills, destination photo pins and spot pins that appear as you zoom in.
- **Explore sheet** — a swipeable bottom sheet with curated feeds (including a "Near You" row based on your location) and a search bar across countries, destinations and spots.
- **Country, destination and spot sheets** — photos, reasons to visit, climate and crowd data, spot lists, and your own visits, notes and photos.
- **Visited tracking** — marking a spot visited marks its destination, and a country counts as visited once any of its destinations is.
- **Stats and profile screens** for an overview of where you've been.

There is no backend. Places and spots are bundled in `src/data`, your progress is stored on-device (Zustand persisted to AsyncStorage), and photos and climate data are fetched live from public APIs (Wikipedia / Wikimedia Commons, Open-Meteo).

## Tech stack

- Expo SDK 56, React Native 0.85 (New Architecture, Hermes), TypeScript
- `@rnmapbox/maps` for the map
- `react-native-reanimated` and `react-native-gesture-handler` for the sheets and gestures
- React Navigation (bottom tabs), Zustand for state

## Running locally

**Prerequisites:** Node 20+, Xcode (for iOS), CocoaPods, and a Mapbox account.

This app uses native modules (Mapbox), so it **cannot run in Expo Go** — it needs a development build.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your local environment file from the template and fill in the two Mapbox tokens (see below):
   ```bash
   cp .env.example .env.local
   ```
3. Build and install the development client on a simulator or connected device:
   ```bash
   npx expo run:ios
   ```
   (`npm run ios` does the same.) The first build generates the native `ios/` folder and installs pods.
4. Start the dev server for the installed client:
   ```bash
   npx expo start --dev-client
   ```
   On a network that blocks device-to-device traffic (campus or corporate Wi-Fi), add `--tunnel`, then open the tunnel URL from the dev client's launcher.

Notes:
- Builds signed with a free Apple ID expire after 7 days; re-run `npx expo run:ios` to reinstall.
- The `ios/` and `android/` folders are generated and gitignored. Native settings belong in `app.config.js`, not edited in place.

## Environment variables

Set these in `.env.local` (gitignored). `.env.example` is the committed template.

| Variable | Used for | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Runtime map access | A **public** Mapbox token (`pk.…`). Bundled into the app by design. |
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` | Build time only | A **secret** Mapbox token (`sk.…`, `DOWNLOADS:READ` scope) used to download the native Mapbox SDK. Never bundled into the app. |

For EAS cloud builds, which can't read `.env.local`, store the secret token in EAS:

```bash
eas env:create --name RNMAPBOX_MAPS_DOWNLOAD_TOKEN --value <token> --type string --visibility secret --environment production --environment preview --environment development
```

Never commit real tokens. Wikipedia, Wikimedia Commons and Open-Meteo need no API keys.

## Project layout

```
App.tsx                 App shell, tab navigation, loading screen
app.config.js           Expo config (reads tokens from the environment)
src/
  screens/              MapScreen (globe + pins), DiscoverScreen (Explore feed), Profile, Stats, Places
  components/Map/       Explore, Country, Destination and Spot sheets, cards, search results
  data/                 Destinations, spots, countries, curated photo overrides
  store/                Persisted app state (visited places, notes, photos)
  utils/                Photo cache, climate API, geocoding, stats
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Metro dev server |
| `npm run ios` | Build and run the iOS dev client |
| `npm run android` | Build and run the Android dev client |
| `npx tsc --noEmit` | Type-check |

## License

See [LICENSE](LICENSE).
