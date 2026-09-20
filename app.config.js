// Dynamic config (JS, not app.json) so the Mapbox download token can be read from the
// environment instead of committed in plaintext — see README/.env.example. Everything else is
// unchanged from the old app.json, just re-expressed as a plain object.
module.exports = ({ config }) => ({
  ...config,
  expo: {
    name: 'Intrepid',
    slug: 'intrepid',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.alexzhou.intrepid',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundColor: '#111827',
      },
      package: 'com.intrepid.app',
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      // No RNMapboxMapsDownloadToken option here (Expo warns it's deprecated) — the config
      // plugin reads the secret (sk.) download token directly from the RNMAPBOX_MAPS_DOWNLOAD_TOKEN
      // env var instead. Local dev sets it via .env.local (gitignored, see .env.example); EAS
      // Build needs it set as an EAS secret of the same name, since EAS's cloud build
      // environment has no access to a local .env file.
      '@rnmapbox/maps',
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Intrepid needs location to show your position on the map.',
        },
      ],
      'expo-font',
      'expo-status-bar',
    ],
    extra: {
      eas: {
        projectId: '7a48f620-8aee-4a40-832d-c6725623e684',
      },
    },
    owner: 'upriver1225',
  },
});
