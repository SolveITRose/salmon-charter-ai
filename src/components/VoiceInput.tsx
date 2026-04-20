import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { formatDuration } from '../utils/formatters';

interface VoiceInputProps {
  onTranscriptComplete: (
    audioPath: string,
    transcript: string,
    duration: number
  ) => void;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'done';

export default function VoiceInput({ onTranscriptComplete, disabled }: VoiceInputProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [audioPath, setAudioPath] = useState('');
  const [audioDuration, setAudioDuration] = useState(0);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed for voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setRecordingState('recording');
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('[VoiceInput] startRecording error:', error);
      Alert.alert('Recording Error', 'Could not start recording.');
    }
  };

  const stopRecording = async () => {
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const duration = elapsed;
      setAudioDuration(duration);

      if (!recordingRef.current) return;

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (uri) {
        const destUri = FileSystem.documentDirectory + `voice_${Date.now()}.m4a`;
        await FileSystem.copyAsync({ from: uri, to: destUri });
        setAudioPath(destUri);
        setRecordingState('done');
        onTranscriptComplete(destUri, '', duration);
      }
    } catch (error) {
      console.error('[VoiceInput] stopRecording error:', error);
      setRecordingState('idle');
    }
  };

  const handleTranscriptEdit = (text: string) => {
    setTranscript(text);
    if (audioPath) {
      onTranscriptComplete(audioPath, text, audioDuration);
    }
  };

  const handleReset = () => {
    setRecordingState('idle');
    setTranscript('');
    setAudioPath('');
    setElapsed(0);
    setAudioDuration(0);
  };

  const isRecording = recordingState === 'recording';
  const isDone = recordingState === 'done';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Voice Note</Text>

      {!isDone && (
        <View style={styles.recordRow}>
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonActive,
              disabled && styles.recordButtonDisabled,
            ]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={disabled}
          >
            <View style={[styles.recordIcon, isRecording && styles.recordIconStop]} />
          </TouchableOpacity>

          <View style={styles.recordInfo}>
            {isRecording ? (
              <>
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>Recording...</Text>
                </View>
                <Text style={styles.elapsedText}>{formatDuration(elapsed)}</Text>
              </>
            ) : (
              <Text style={styles.hintText}>
                Tap to record a voice note about setup, conditions, or catch details
              </Text>
            )}
          </View>
        </View>
      )}

      {isDone && (
        <View style={styles.transcriptArea}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.transcriptLabel}>
              Note recorded ({formatDuration(audioDuration)})
            </Text>
            <TouchableOpacity onPress={handleReset}>
              <Text style={styles.reRecordText}>Re-record</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.transcriptInput}
            value={transcript}
            onChangeText={handleTranscriptEdit}
            multiline
            numberOfLines={3}
            placeholder="Add notes about setup, conditions, or catch details..."
            placeholderTextColor="#4a5f7a"
            textAlignVertical="top"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    color: '#8899aa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1628',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  recordButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1e90ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  recordButtonActive: {
    backgroundColor: '#ff5252',
  },
  recordButtonDisabled: {
    backgroundColor: '#1a2d4a',
  },
  recordIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff',
  },
  recordIconStop: {
    borderRadius: 3,
    width: 16,
    height: 16,
  },
  recordInfo: {
    flex: 1,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff5252',
    marginRight: 6,
  },
  recordingText: {
    color: '#ff5252',
    fontSize: 14,
    fontWeight: '600',
  },
  elapsedText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  hintText: {
    color: '#8899aa',
    fontSize: 13,
    lineHeight: 18,
  },
  transcriptArea: {
    backgroundColor: '#0a1628',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transcriptLabel: {
    color: '#8899aa',
    fontSize: 13,
  },
  reRecordText: {
    color: '#1e90ff',
    fontSize: 13,
    fontWeight: '600',
  },
  transcriptInput: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 70,
  },
});
