import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';

SplashScreen.preventAutoHideAsync();

const BETA_PIN = '1111';
const STORAGE_KEY = 'beta_access';

function checkUnlocked(): boolean {
  if (Platform.OS !== 'web') return true;
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return true; }
}

function persistUnlock(): void {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  function handleChange(value: string) {
    setError(false);
    setPin(value);
    if (value.length === 4) {
      if (value === BETA_PIN) {
        persistUnlock();
        onUnlock();
      } else {
        setError(true);
        setPin('');
      }
    }
  }

  return (
    <View style={gate.container}>
      <Text style={gate.title}>Salmon Charter AI</Text>
      <Text style={gate.subtitle}>Beta Access</Text>
      <TextInput
        style={[gate.input, error && gate.inputError]}
        value={pin}
        onChangeText={handleChange}
        keyboardType="numeric"
        maxLength={4}
        secureTextEntry
        placeholder="Enter PIN"
        placeholderTextColor="#4a5f7a"
        autoFocus
      />
      {error && <Text style={gate.error}>Incorrect PIN</Text>}
    </View>
  );
}

const gate = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#8899aa',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#122040',
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 24,
    letterSpacing: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: 180,
    textAlign: 'center',
  },
  inputError: {
    borderColor: '#e65100',
  },
  error: {
    color: '#e65100',
    fontSize: 13,
  },
});

export default function RootLayout() {
  const [unlocked, setUnlocked] = useState(checkUnlocked);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  if (!unlocked) {
    return <PinGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <>
      <StatusBar style="light" backgroundColor="#0a1628" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0a1628',
          },
          headerTintColor: '#ffffff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: '#0a1628',
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
      </Stack>
    </>
  );
}
