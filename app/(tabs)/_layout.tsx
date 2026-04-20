import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  background: '#0a1628',
  surface: '#122040',
  accent: '#1e90ff',
  textSecondary: '#8899aa',
  border: '#1a2d4a',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textSecondary,
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
        },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="captain"
        options={{
          title: 'Captain',
          headerTitle: "Captain's Board",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="boat" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mate"
        options={{
          title: 'Mate',
          headerTitle: '1st Mate Log',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="fish" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="triplog"
        options={{
          title: 'Trip Log',
          headerTitle: 'Trip Log',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          headerTitle: 'Hotspot Map',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
