import 'react-native-gesture-handler';
import React, { useRef, useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Platform, View, Text, ScrollView, Animated, Pressable, Image } from 'react-native';
import { Map, User } from 'lucide-react-native';
import { useFonts, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import * as Haptics from 'expo-haptics';
import Reanimated, { useSharedValue, useAnimatedStyle, useFrameCallback, runOnJS, Easing as REasing } from 'react-native-reanimated';

import MapScreen     from './src/screens/MapScreen';
import { ShadowSync, syncAfterTouch } from './src/utils/shadowSync';
import ProfileScreen from './src/screens/ProfileScreen';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <View style={{ flex: 1, padding: 30, paddingTop: 80, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#DC2626', marginBottom: 12 }}>
            App Error
          </Text>
          <ScrollView>
            <Text style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{err.message}</Text>
            <Text style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{err.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const Tab = createBottomTabNavigator();
const ICON_SIZE = 22;

// Covers the map while its globe is still visually settling — Mapbox's globe projection
// shines/flashes for a moment even after onDidFinishLoadingMap fires (see MapScreen's own
// onMapReady comment). `visible` toggling false starts the fade-out; the screen stays
// mounted (and blocking touches) through that animation, calling onFadeOutComplete once it's
// actually done rather than being yanked out the instant mapReady flips.
// The fade advances per drawn frame, at most LOADING_FADE_MAX_STEP_MS of it a frame: it starts while the map is doing its
// first heavy work on the main thread (its layers, the destination pin images), and a timed fade that ran into a stall that
// long went from opaque to gone in a single frame. A stall now holds the fade where it is.
const LOADING_FADE_MS = 300;
const LOADING_FADE_MAX_STEP_MS = 34;
// fontReady: the serif has registered at runtime (or its wait has run out). The wordmark uses the copy embedded in the app
// (app.config.js), there from the first frame: waiting for the runtime load instead held the wordmark back on a slow start.
// It is drawn again once fontReady is set, which puts it right should a build without the embedded copy have drawn it in
// the system font (text drawn before its font registers keeps the fallback).
function AppLoadingScreen({ visible, fontReady, onFadeOutComplete }: { visible: boolean; fontReady: boolean; onFadeOutComplete: () => void }) {
  const progress = useSharedValue(0);
  // Runs until the parent unmounts this screen (onFadeOutComplete).
  const fade = useFrameCallback(({ timeSincePreviousFrame }) => {
    if (progress.value >= 1) return;
    const dt = Math.min(timeSincePreviousFrame ?? 16, LOADING_FADE_MAX_STEP_MS);
    progress.value = Math.min(1, progress.value + dt / LOADING_FADE_MS);
    if (progress.value >= 1) runOnJS(onFadeOutComplete)();
  }, false);

  useEffect(() => {
    if (!visible) fade.setActive(true);
  }, [visible]);

  const style = useAnimatedStyle(() => ({ opacity: 1 - REasing.inOut(REasing.ease)(progress.value) }));

  return (
    <Reanimated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.loadingScreen, style]}
    >
      <Image source={require('./assets/icon.png')} style={styles.loadingLogo} resizeMode="contain" />
      <Text key={fontReady ? 'serif' : 'wait'} style={styles.loadingWordmark}>Intrepid</Text>
    </Reanimated.View>
  );
}

function AnimatedTabButton({ children, onPress, onLongPress, style, ...rest }: any) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, damping: 20, stiffness: 300 }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }).start();
  };

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ PlayfairDisplay_700Bold });
  if (fontError) {
    console.error('Font load failed:', fontError);
  }
  // The app waits for the serif to register before rendering: text drawn before then falls back to
  // the system font and does NOT switch once the font arrives (nothing re-renders it), which left
  // some destination names in sans. But useFonts was once seen hanging forever (never resolving,
  // never rejecting) and a hard `if (!fontsLoaded) return null` then left the app blank with no
  // way to tell why — so the wait is capped: render after 2s regardless. The loading screen
  // covers the app in the meantime.
  const [fontGateOpen, setFontGateOpen] = useState(false);
  useEffect(() => {
    if (fontsLoaded || fontError) { setFontGateOpen(true); return; }
    const t = setTimeout(() => setFontGateOpen(true), 2000);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);

  // Flips true once MapScreen reports its globe has visually settled (see its own onMapReady
  // comment) — drives AppLoadingScreen's fade-out below.
  const [mapReady, setMapReady] = useState(false);
  // Stays true through AppLoadingScreen's own fade-out animation, then false once it's done —
  // keeps the overlay actually mounted for the duration of that fade.
  const [loadingScreenMounted, setLoadingScreenMounted] = useState(true);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }} onTouchEndCapture={syncAfterTouch} onTouchCancel={syncAfterTouch}>
        <ShadowSync />
        <SafeAreaProvider>
          <StatusBar style="dark" />
          {fontGateOpen && (
          <NavigationContainer>
            <Tab.Navigator
              screenOptions={{
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarActiveTintColor: '#111827',
                tabBarInactiveTintColor: '#6B7280',
                tabBarLabelStyle: styles.tabLabel,
                tabBarButton: (props) => <AnimatedTabButton {...props} />,
              }}
            >
              <Tab.Screen
                name="Explore"
                options={{ tabBarIcon: ({ color }) => <Map size={ICON_SIZE} color={color} /> }}
              >
                {props => <MapScreen {...props} onMapReady={() => setMapReady(true)} />}
              </Tab.Screen>
              <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ tabBarIcon: ({ color }) => <User size={ICON_SIZE} color={color} /> }}
              />
            </Tab.Navigator>
          </NavigationContainer>
          )}
          {loadingScreenMounted && (
            <AppLoadingScreen
              visible={!mapReady}
              fontReady={fontGateOpen}
              onFadeOutComplete={() => setLoadingScreenMounted(false)}
            />
          )}
        </SafeAreaProvider>
      </View>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    // Gray, so the bar reads as its own strip under both the white Explore sheet and the Profile's pale page.
    backgroundColor: '#EEF0F3',
    borderTopColor: '#DDE0E5',
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: 8,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  loadingScreen: { backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  loadingLogo: { width: 96, height: 96, borderRadius: 22, marginBottom: 16 },
  // The embedded font's own name on iOS (its PostScript name); Android names an embedded font after its file.
  loadingWordmark: { fontFamily: Platform.OS === 'ios' ? 'PlayfairDisplay-Bold' : 'PlayfairDisplay_700Bold', fontSize: 28, color: '#111827', letterSpacing: 0.5 },
});
