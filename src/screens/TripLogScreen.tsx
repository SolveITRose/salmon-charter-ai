import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

const Audio = Platform.OS !== 'web' ? require('expo-av').Audio : null;

import { CatchEvent, GpsMark } from '../models/Event';
import { getAllEvents, getAllMarks } from '../storage/localDB';
import { generateTripInsight } from '../agents/catchClassifier';
import CatchCard from '../components/CatchCard';
import MarkCard from '../components/MarkCard';
import HydroScoreCard from '../components/HydroScoreCard';
import WeatherWidget from '../components/WeatherWidget';
import {
  formatTimestamp,
  formatGPS,
  formatSpeed,
  formatDepth,
  formatDuration,
  celsiusToFahrenheit,
} from '../utils/formatters';

type FeedItem = { type: 'catch'; data: CatchEvent } | { type: 'mark'; data: GpsMark };

export default function TripLogScreen() {
  const [events, setEvents] = useState<CatchEvent[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CatchEvent | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [sound, setSound] = useState<any>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const [allEvents, allMarks] = await Promise.all([getAllEvents(), getAllMarks()]);
      setEvents(allEvents);
      const merged: FeedItem[] = [
        ...allEvents.map((e): FeedItem => ({ type: 'catch', data: e })),
        ...allMarks.map((m): FeedItem => ({ type: 'mark', data: m })),
      ].sort((a, b) => b.data.timestamp.localeCompare(a.data.timestamp));
      setFeed(merged);
    } catch (error) {
      console.error('[TripLog] loadEvents error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => {});
      }
    };
  }, [sound]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadEvents();
  }, [loadEvents]);

  const handleEventPress = useCallback((event: CatchEvent) => {
    setSelectedEvent(event);
    setDetailModalVisible(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailModalVisible(false);
    setSelectedEvent(null);
    if (sound) {
      sound.unloadAsync().catch(() => {});
      setSound(null);
    }
    setIsPlayingAudio(false);
  }, [sound]);

  const handlePlayVoiceNote = useCallback(async (audioPath: string) => {
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setIsPlayingAudio(false);
      }

      if (!audioPath) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioPath },
        { shouldPlay: true },
        (status: any) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            setIsPlayingAudio(false);
          }
        }
      );

      setSound(newSound);
      setIsPlayingAudio(true);
    } catch (error) {
      console.error('[TripLog] playVoiceNote error:', error);
      Alert.alert('Playback Error', 'Could not play voice note.');
    }
  }, [sound]);

  const handleGenerateInsight = useCallback(async () => {
    if (events.length < 5) {
      Alert.alert(
        'Not Enough Data',
        `Log ${5 - events.length} more catch${events.length === 4 ? '' : 'es'} to unlock AI analysis.`
      );
      return;
    }

    setInsightLoading(true);
    try {
      const summaries = events.slice(0, 10).map((e) => ({
        species: e.species,
        time: formatTimestamp(e.timestamp),
        lat: e.gps.lat,
        lng: e.gps.lng,
        hydroScore: e.hydroScore.total,
        setup: {
          downriggerDepth: e.setup.downriggerDepth,
          lureType: e.setup.lureType,
          trollingSpeed: e.setup.trollingSpeed,
        },
      }));

      const result = await generateTripInsight(summaries);
      setInsight(result);
    } catch (error) {
      console.error('[TripLog] generateInsight error:', error);
      setInsight('AI analysis temporarily unavailable.');
    } finally {
      setInsightLoading(false);
    }
  }, [events]);

  const renderFeedItem = useCallback(
    ({ item }: { item: FeedItem }) =>
      item.type === 'catch'
        ? <CatchCard event={item.data} onPress={handleEventPress} />
        : <MarkCard mark={item.data} />,
    [handleEventPress]
  );

  const keyExtractor = useCallback(
    (item: FeedItem) => item.data.id,
    []
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#1e90ff" size="large" />
        <Text style={styles.loadingText}>Loading trip log...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary header */}
      {events.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{events.length}</Text>
            <Text style={styles.summaryLabel}>Catches</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {Math.round(
                events.reduce((s, e) => s + e.hydroScore.total, 0) /
                  events.length
              )}
            </Text>
            <Text style={styles.summaryLabel}>Avg Score</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {getMostCommonSpecies(events)}
            </Text>
            <Text style={styles.summaryLabel}>Top Species</Text>
          </View>
        </View>
      )}

      {/* AI Insight button */}
      {events.length >= 5 && (
        <TouchableOpacity
          style={styles.insightButton}
          onPress={handleGenerateInsight}
          disabled={insightLoading}
        >
          {insightLoading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.insightButtonText}>AI Trip Analysis</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Insight result */}
      {insight ? (
        <View style={styles.insightCard}>
          <Text style={styles.insightTitle}>Trip Insight</Text>
          <Text style={styles.insightText}>{insight}</Text>
        </View>
      ) : null}

      {/* Events list */}
      {feed.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎣</Text>
          <Text style={styles.emptyTitle}>No catches yet</Text>
          <Text style={styles.emptySubtitle}>
            Use the Captain tab to log your first catch
          </Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          renderItem={renderFeedItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#1e90ff"
            />
          }
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        onRequestClose={handleCloseDetail}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={handleCloseDetail}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Catch Detail</Text>
            <View style={{ width: 60 }} />
          </View>

          {selectedEvent && (
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Photo */}
              {selectedEvent.photo ? (
                <Image
                  source={{ uri: selectedEvent.photo }}
                  style={styles.detailPhoto}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.detailPhotoPlaceholder}>
                  <Text style={styles.detailPhotoPlaceholderText}>
                    No Photo
                  </Text>
                </View>
              )}

              {/* Event Code */}
              <View style={styles.detailBanner}>
                <Text style={styles.detailCode}>
                  {selectedEvent.eventCode}
                </Text>
                <Text style={styles.detailTime}>
                  {formatTimestamp(selectedEvent.timestamp)}
                </Text>
              </View>

              {/* Species */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Species</Text>
                <Text style={styles.detailSpecies}>{selectedEvent.species}</Text>
                {selectedEvent.sizeEstimate &&
                  selectedEvent.sizeEstimate !== 'Unknown' && (
                    <Text style={styles.detailMeta}>
                      {selectedEvent.sizeEstimate}
                    </Text>
                  )}
                <Text style={styles.detailMeta}>
                  Confidence: {Math.round(selectedEvent.confidence * 100)}%
                </Text>
              </View>

              {/* GPS */}
              {selectedEvent.gps.lat !== 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Location</Text>
                  <Text style={styles.detailMeta}>
                    {formatGPS(selectedEvent.gps.lat, selectedEvent.gps.lng)}
                  </Text>
                  <Text style={styles.detailMeta}>
                    Heading: {Math.round(selectedEvent.gps.heading)}°  |  Speed:{' '}
                    {formatSpeed(selectedEvent.gps.speed)}
                  </Text>
                </View>
              )}

              {/* Weather */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Conditions</Text>
                <WeatherWidget weather={selectedEvent.weather} />
              </View>

              {/* Setup */}
              {selectedEvent.setup.lureType && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Rig Setup</Text>
                  <View style={styles.setupGrid}>
                    <SetupRow
                      label="Depth"
                      value={formatDepth(selectedEvent.setup.downriggerDepth)}
                    />
                    <SetupRow
                      label="Lure"
                      value={`${selectedEvent.setup.lureType} ${selectedEvent.setup.lureColor || ''}`.trim()}
                    />
                    <SetupRow
                      label="Speed"
                      value={`${selectedEvent.setup.trollingSpeed.toFixed(2)} mph`}
                    />
                    {selectedEvent.setup.rigType && (
                      <SetupRow
                        label="Rig"
                        value={[selectedEvent.setup.rigType, selectedEvent.setup.rigPosition].filter(Boolean).join(' · ')}
                      />
                    )}
                    {selectedEvent.setup.boatSide && (
                      <SetupRow label="Side" value={selectedEvent.setup.boatSide} />
                    )}
                    {selectedEvent.setup.lineType && (
                      <SetupRow label="Line" value={selectedEvent.setup.lineType} />
                    )}
                  </View>
                </View>
              )}

              {/* HydroScore */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>HydroScore</Text>
                <HydroScoreCard hydroScore={selectedEvent.hydroScore} />
              </View>

              {/* Fish Finder */}
              {selectedEvent.fishFinder && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Fish Finder</Text>
                  <View style={styles.setupGrid}>
                    {selectedEvent.fishFinder.depth !== undefined && (
                      <SetupRow label="Depth" value={`${Math.round(selectedEvent.fishFinder.depth)} ft`} />
                    )}
                    {selectedEvent.fishFinder.waterTemp !== undefined && (
                      <SetupRow label="Water Temp" value={`${Math.round(celsiusToFahrenheit(selectedEvent.fishFinder.waterTemp))}°F`} />
                    )}
                    {selectedEvent.fishFinder.speedOverGround !== undefined && (
                      <SetupRow label="SOG" value={`${selectedEvent.fishFinder.speedOverGround.toFixed(2)} mph`} />
                    )}
                    {selectedEvent.fishFinder.timeOfDay !== undefined && (
                      <SetupRow label="Time" value={selectedEvent.fishFinder.timeOfDay} />
                    )}
                    {selectedEvent.fishFinder.baitOnScreen !== undefined && (
                      <SetupRow label="Bait on Screen" value={selectedEvent.fishFinder.baitOnScreen ? 'Yes' : 'No'} />
                    )}
                  </View>
                </View>
              )}

              {/* Voice Note */}
              {selectedEvent.voiceNote.audioPath ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Voice Note</Text>
                  <View style={styles.voiceNoteCard}>
                    <TouchableOpacity
                      style={styles.playButton}
                      onPress={() =>
                        handlePlayVoiceNote(selectedEvent.voiceNote.audioPath)
                      }
                    >
                      <Text style={styles.playButtonText}>
                        {isPlayingAudio ? '⏸ Playing...' : '▶ Play Voice Note'}
                      </Text>
                      <Text style={styles.playDuration}>
                        {formatDuration(selectedEvent.voiceNote.duration)}
                      </Text>
                    </TouchableOpacity>
                    {selectedEvent.voiceNote.transcript ? (
                      <Text style={styles.transcriptText}>
                        "{selectedEvent.voiceNote.transcript}"
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* Notes */}
              {selectedEvent.notes ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Notes</Text>
                  <Text style={styles.detailNotes}>{selectedEvent.notes}</Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

function SetupRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.setupRow}>
      <Text style={styles.setupLabel}>{label}</Text>
      <Text style={styles.setupValue}>{value}</Text>
    </View>
  );
}

function getMostCommonSpecies(events: CatchEvent[]): string {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.species && e.species !== 'Unknown') {
      counts[e.species] = (counts[e.species] || 0) + 1;
    }
  }
  let max = 0;
  let top = '—';
  for (const [species, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      top = species.split(' ')[0]; // First word only for brevity
    }
  }
  return top;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8899aa',
    marginTop: 12,
    fontSize: 15,
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#122040',
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  summaryLabel: {
    color: '#8899aa',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#1a2d4a',
    marginVertical: 4,
  },
  insightButton: {
    backgroundColor: '#1a3a6a',
    margin: 12,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e90ff',
    minHeight: 44,
    justifyContent: 'center',
  },
  insightButtonText: {
    color: '#1e90ff',
    fontSize: 15,
    fontWeight: '600',
  },
  insightCard: {
    backgroundColor: '#122040',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a3a6a',
  },
  insightTitle: {
    color: '#1e90ff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  insightText: {
    color: '#c0d0e0',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#8899aa',
    fontSize: 15,
    textAlign: 'center',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#122040',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  modalCloseButton: {
    width: 60,
  },
  modalCloseText: {
    color: '#1e90ff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  detailPhoto: {
    width: '100%',
    height: 280,
    backgroundColor: '#122040',
  },
  detailPhotoPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#122040',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailPhotoPlaceholderText: {
    color: '#8899aa',
    fontSize: 16,
  },
  detailBanner: {
    backgroundColor: '#122040',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  detailCode: {
    color: '#1e90ff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  detailTime: {
    color: '#8899aa',
    fontSize: 13,
  },
  detailSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
  },
  detailSectionTitle: {
    color: '#8899aa',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  detailSpecies: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  detailMeta: {
    color: '#8899aa',
    fontSize: 14,
    marginBottom: 2,
  },
  setupGrid: {
    gap: 6,
  },
  setupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  setupLabel: {
    color: '#8899aa',
    fontSize: 14,
  },
  setupValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  voiceNoteCard: {
    backgroundColor: '#0a1628',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  playButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  playButtonText: {
    color: '#1e90ff',
    fontSize: 15,
    fontWeight: '600',
  },
  playDuration: {
    color: '#8899aa',
    fontSize: 13,
  },
  transcriptText: {
    color: '#c0d0e0',
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  detailNotes: {
    color: '#c0d0e0',
    fontSize: 14,
    lineHeight: 20,
  },
});
