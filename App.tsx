import 'react-native-gesture-handler';
import React, { useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Platform, View, Text, ScrollView, Animated, Pressable } from 'react-native';
import { Map, Compass, User } from 'lucide-react-native';
import { useFonts, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import * as Haptics from 'expo-haptics';

import MapScreen      from './src/screens/MapScreen';
import DiscoverScreen from './src/screens/DiscoverScreen';
import ProfileScreen  from './src/screens/ProfileScreen';

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
  const [fontsLoaded] = useFonts({ PlayfairDisplay_700Bold });
  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <NavigationContainer>
            <Tab.Navigator
              screenOptions={{
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarActiveTintColor: '#111827',
                tabBarInactiveTintColor: '#9CA3AF',
                tabBarLabelStyle: styles.tabLabel,
                tabBarButton: (props) => <AnimatedTabButton {...props} />,
              }}
            >
              <Tab.Screen
                name="Map"
                component={MapScreen}
                options={{ tabBarIcon: ({ color }) => <Map size={ICON_SIZE} color={color} /> }}
              />
              <Tab.Screen
                name="Explore"
                component={DiscoverScreen}
                options={{ tabBarIcon: ({ color }) => <Compass size={ICON_SIZE} color={color} /> }}
              />
              <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ tabBarIcon: ({ color }) => <User size={ICON_SIZE} color={color} /> }}
              />
            </Tab.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'white',
    borderTopColor: '#F3F4F6',
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: 8,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
