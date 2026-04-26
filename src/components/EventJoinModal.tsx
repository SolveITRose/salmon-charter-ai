import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { getAllEvents } from '../storage/localDB';
import { CatchEvent } from '../models/Event';
import { formatTimestamp } from '../utils/formatters';
import { getScoreColor } from '../utils/scoring';

interface EventJoinModalProps {
  visible: boolean;
  onClose: () => void;
  onJoined: (event: CatchEvent) => void;
}

export default function EventJoinModal({
  visible,
  onClose,
  onJoined,
}: EventJoinModalProps) {
  const [events, setEvents] = useState<CatchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSelected(null);
      loadEvents();
    }
  }, [visible]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const all = await getAllEvents();
      // Most recent first
      setEvents(all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (e) {
      console.error('[EventJoinModal] loadEvents error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = () => {
    const event = events.find((e) => e.id === selected);
    if (event) {
      onJoined(event);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Select Catch Event</Text>
          <Text style={styles.subtitle}>Choose the captain's event to join</Text>

          {loading ? (
            <ActivityIndicator color="#1e90ff" size="large" style={styles.loader} />
          ) : events.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎣</Text>
              <Text style={styles.emptyText}>No events found.</Text>
              <Text style={styles.emptySubtext}>
                The captain needs to log a catch first.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {events.map((item) => {
                const isSelected = item.id === selected;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.eventRow, isSelected && styles.eventRowSelected]}
                    onPress={() => setSelected(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.eventRowLeft}>
                      <Text style={styles.eventCode}>{item.eventCode}</Text>
                      <Text style={styles.eventSpecies}>{item.species || 'Unknown'}</Text>
                      <Text style={styles.eventTime}>{formatTimestamp(item.timestamp)}</Text>
                    </View>
                    <View style={styles.eventRowRight}>
                      <Text style={[styles.eventScore, { color: getScoreColor(item.hydroScore.total) }]}>
                        {Math.round(item.hydroScore.total)}
                      </Text>
                      <Text style={styles.eventScoreLabel}>score</Text>
                    </View>
                    {isSelected && <View style={styles.checkDot} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.joinButton, !selected && styles.joinButtonDisabled]}
              onPress={handleJoin}
              disabled={!selected}
            >
              <Text style={styles.joinText}>Join</Text>
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
    paddingHorizontal: 24,
    paddingBottom: 24,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: '#8899aa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  loader: {
    marginVertical: 40,
  },
  list: {
    flexGrow: 0,
    maxHeight: 300,
    marginBottom: 16,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1628',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  eventRowSelected: {
    borderColor: '#1e90ff',
    backgroundColor: '#0d1e3a',
  },
  eventRowLeft: {
    flex: 1,
  },
  eventCode: {
    color: '#1e90ff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  eventSpecies: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  eventTime: {
    color: '#8899aa',
    fontSize: 12,
  },
  eventRowRight: {
    alignItems: 'center',
    marginLeft: 12,
    minWidth: 40,
  },
  eventScore: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  eventScoreLabel: {
    color: '#8899aa',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1e90ff',
    marginLeft: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySubtext: {
    color: '#8899aa',
    fontSize: 14,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8899aa',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: '#8899aa',
    fontSize: 16,
    fontWeight: '600',
  },
  joinButton: {
    flex: 1,
    backgroundColor: '#1e90ff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.4,
  },
  joinText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
