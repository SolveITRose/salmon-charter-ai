import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { CatchEvent, FishFinderData } from '../models/Event';

interface FishFinderModalProps {
  visible: boolean;
  event: CatchEvent;
  onSave: (data: FishFinderData) => void;
  onSkip: () => void;
}

const KNOTS_TO_MPH = 1.15078;

export default function FishFinderModal({ visible, event, onSave, onSkip }: FishFinderModalProps) {
  const [waterTemp, setWaterTemp] = useState(
    event.weather.waterTemp ? String(Math.round(event.weather.waterTemp * 10) / 10) : ''
  );
  const [depth, setDepth] = useState('');
  const [speedOverGround, setSpeedOverGround] = useState(
    event.gps.speed ? String(Math.round(event.gps.speed * KNOTS_TO_MPH * 10) / 10) : ''
  );
  const [courseOverGround, setCourseOverGround] = useState('');
  const [heading, setHeading] = useState(
    event.gps.heading ? String(Math.round(event.gps.heading)) : ''
  );
  const [baitOnScreen, setBaitOnScreen] = useState<boolean | null>(null);

  const handleSave = () => {
    const data: FishFinderData = {
      waterTemp: parseFloat(waterTemp) || undefined,
      depth: parseFloat(depth) || undefined,
      speedOverGround: parseFloat(speedOverGround) || undefined,
      courseOverGround: parseFloat(courseOverGround) || undefined,
      heading: parseFloat(heading) || undefined,
      baitOnScreen: baitOnScreen ?? undefined,
    };
    onSave(data);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Fish Finder</Text>
          <Text style={styles.subtitle}>What do your electronics show?</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Water Temp (°C)</Text>
                <TextInput
                  style={styles.input}
                  value={waterTemp}
                  onChangeText={setWaterTemp}
                  placeholder="e.g. 14.5"
                  placeholderTextColor="#4a5f7a"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Depth (ft)</Text>
                <TextInput
                  style={styles.input}
                  value={depth}
                  onChangeText={setDepth}
                  placeholder="e.g. 120"
                  placeholderTextColor="#4a5f7a"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Speed Over Ground (mph)</Text>
                <TextInput
                  style={styles.input}
                  value={speedOverGround}
                  onChangeText={setSpeedOverGround}
                  placeholder="e.g. 2.5"
                  placeholderTextColor="#4a5f7a"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Course Over Ground (°)</Text>
                <TextInput
                  style={styles.input}
                  value={courseOverGround}
                  onChangeText={setCourseOverGround}
                  placeholder="e.g. 270"
                  placeholderTextColor="#4a5f7a"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Heading (°)</Text>
                <TextInput
                  style={styles.input}
                  value={heading}
                  onChangeText={setHeading}
                  placeholder="e.g. 265"
                  placeholderTextColor="#4a5f7a"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Bait On Screen</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, baitOnScreen === true && styles.chipSelected]}
                    onPress={() => setBaitOnScreen(baitOnScreen === true ? null : true)}
                  >
                    <Text style={[styles.chipText, baitOnScreen === true && styles.chipTextSelected]}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, baitOnScreen === false && styles.chipSelected]}
                    onPress={() => setBaitOnScreen(baitOnScreen === false ? null : false)}
                  >
                    <Text style={[styles.chipText, baitOnScreen === false && styles.chipTextSelected]}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#122040',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    maxHeight: '85%',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: '#8899aa',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  halfField: {
    flex: 1,
  },
  label: {
    color: '#8899aa',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0a1628',
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 10,
    color: '#ffffff',
    fontSize: 15,
    padding: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0a1628',
  },
  chipSelected: {
    borderColor: '#1e90ff',
    backgroundColor: '#1e90ff22',
  },
  chipText: {
    color: '#8899aa',
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#1e90ff',
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  skipButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8899aa',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  skipText: {
    color: '#8899aa',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#e65100',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
