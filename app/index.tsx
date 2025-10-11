import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Vibration,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";

const COUNTER_COUNT = 5;
// Adjust this value (in seconds) to 5 * 60 when you want to test a 5 minute alarm window.
const GLOBAL_ALARM_INTERVAL_SECONDS = 4 * 60 * 60;
const STORAGE_KEY = "kamreen-state-v1";

type CounterState = {
  id: number;
  elapsed: number;
  isRunning: boolean;
  isEmpty: boolean;
  startCount: number;
  lastPauseTimestamp: number | null;
  filterClicks: number;
};

type PersistedState = {
  globalElapsed: number;
  globalRunning: boolean;
  counters: CounterState[];
  filterStartEvents: number;
};

const formatTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const format = (value: number) => value.toString().padStart(2, "0");
  return `${format(hours)}:${format(minutes)}:${format(seconds)}`;
};

const createInitialCounters = (): CounterState[] =>
  Array.from({ length: COUNTER_COUNT }, (_, index) => ({
    id: index + 1,
    elapsed: 0,
    isRunning: false,
    isEmpty: true,
    startCount: 0,
    lastPauseTimestamp: null,
    filterClicks: 0,
  }));

export default function HomeScreen() {
  const [globalElapsed, setGlobalElapsed] = useState(0);
  const [globalRunning, setGlobalRunning] = useState(false);
  const [counters, setCounters] = useState<CounterState[]>(
    createInitialCounters
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [filterStartEvents, setFilterStartEvents] = useState(0);
  const [debugNow, setDebugNow] = useState(Date.now());

  const alarmSoundRef = useRef<Audio.Sound | null>(null);
  const filterSoundRef = useRef<Audio.Sound | null>(null);
  const waveAnim = useRef(new Animated.Value(0)).current;
  const waveAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const stopAlarmSound = useCallback(async () => {
    const sound = alarmSoundRef.current;
    if (!sound) {
      return;
    }

    try {
      await sound.stopAsync();
    } catch {
      // ignore stop errors
    }

    try {
      await sound.unloadAsync();
    } catch {
      // ignore unload errors
    }

    alarmSoundRef.current = null;
  }, []);

  const playAlarmSound = useCallback(async () => {
    try {
      await stopAlarmSound();
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/alarm.wav"),
        {
          shouldPlay: true,
          isLooping: true,
          volume: 1,
        }
      );
      alarmSoundRef.current = sound;
      await sound.setVolumeAsync(1);
      await sound.playAsync();
    } catch (error) {
      console.warn("Impossible de jouer l'alarme sonore", error);
    }
  }, [stopAlarmSound]);

  const stopFilterSound = useCallback(async () => {
    const sound = filterSoundRef.current;
    if (!sound) {
      return;
    }

    try {
      await sound.stopAsync();
    } catch {
      // ignore stop errors
    }

    try {
      await sound.unloadAsync();
    } catch {
      // ignore unload errors
    }

    filterSoundRef.current = null;
  }, []);

  const playFilterSound = useCallback(async () => {
    try {
      await stopFilterSound();
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/filter-alert.wav"),
        {
          shouldPlay: true,
          isLooping: true,
          volume: 1,
        }
      );
      filterSoundRef.current = sound;
      await sound.setVolumeAsync(1);
      await sound.playAsync();
    } catch (error) {
      console.warn("Impossible de jouer l'alerte filtre", error);
    }
  }, [stopFilterSound]);

  const triggerFilterAlert = useCallback(() => {
    Vibration.vibrate([0, 400, 150, 400]);
    playFilterSound();
    Alert.alert(
      "Filtration",
      "🧽 Nettoyez le filtre des bacs avant de continuer.",
      [
        {
          text: "OK",
          onPress: () => {
            stopFilterSound().catch(() => undefined);
          },
        },
      ],
      { cancelable: false }
    );
  }, [playFilterSound, stopFilterSound]);

  const isAnyCounterRunning = useMemo(
    () => counters.some((counter) => counter.isRunning),
    [counters]
  );

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<PersistedState>;

          if (typeof parsed.globalElapsed === "number") {
            setGlobalElapsed(parsed.globalElapsed);
          }
          if (typeof parsed.globalRunning === "boolean") {
            setGlobalRunning(parsed.globalRunning);
          }
          if (Array.isArray(parsed.counters)) {
            setCounters((current) =>
              current.map((initial) => {
                const persisted = parsed.counters?.find(
                  (item) => item.id === initial.id
                );
                if (!persisted) {
                  return initial;
                }

                return {
                  ...initial,
                  elapsed:
                    typeof persisted.elapsed === "number" &&
                    persisted.elapsed >= 0
                      ? persisted.elapsed
                      : initial.elapsed,
                  isRunning:
                    typeof persisted.isRunning === "boolean"
                      ? persisted.isRunning
                      : initial.isRunning,
                  isEmpty:
                    typeof persisted.isEmpty === "boolean"
                      ? persisted.isEmpty
                      : initial.isEmpty,
                  startCount:
                    typeof persisted.startCount === "number" &&
                    persisted.startCount >= 0
                      ? persisted.startCount
                      : initial.startCount,
                  lastPauseTimestamp:
                    typeof persisted.lastPauseTimestamp === "number"
                      ? persisted.lastPauseTimestamp
                      : initial.lastPauseTimestamp,
                  filterClicks:
                    typeof (persisted as any).filterClicks === "number" &&
                    (persisted as any).filterClicks >= 0
                      ? (persisted as any).filterClicks
                      : initial.filterClicks,
                };
              })
            );
          }
          if (
            typeof parsed.filterStartEvents === "number" &&
            parsed.filterStartEvents >= 0
          ) {
            setFilterStartEvents(parsed.filterStartEvents);
          }
        }
      } catch (error) {
        console.warn("Impossible de restaurer les compteurs", error);
      } finally {
        setIsHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    const audioModes = Audio as unknown as {
      InterruptionModeIOS?: { DoNotMix: number };
      InterruptionModeAndroid?: { DoNotMix: number };
    };

    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: audioModes.InterruptionModeIOS?.DoNotMix ?? 1,
      shouldDuckAndroid: false,
      interruptionModeAndroid:
        audioModes.InterruptionModeAndroid?.DoNotMix ?? 1,
      playThroughEarpieceAndroid: false,
    }).catch(() => {
      // ignore audio mode errors
    });
  }, []);

  useEffect(() => {
    return () => {
      stopAlarmSound().catch(() => undefined);
      stopFilterSound().catch(() => undefined);
    };
  }, [stopAlarmSound, stopFilterSound]);

  useEffect(() => {
    if (globalRunning) {
      waveAnimationRef.current?.stop();
      waveAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(waveAnim, {
            toValue: 0,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      waveAnimationRef.current.start();
    } else {
      waveAnimationRef.current?.stop();
      waveAnimationRef.current = null;
      waveAnim.setValue(0);
    }

    return () => {
      waveAnimationRef.current?.stop();
      waveAnimationRef.current = null;
    };
  }, [globalRunning]);

  useEffect(() => {
    const timer = setInterval(() => {
      setDebugNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const waveAnimatedStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: waveAnim.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [16, 6, 16],
          }),
        },
        {
          translateX: waveAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [-28, 28],
          }),
        },
        {
          scaleX: waveAnim.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [1.05, 1.25, 1.05],
          }),
        },
      ],
      opacity: waveAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.25, 0.55, 0.25],
      }),
    }),
    [waveAnim]
  );

  const totalFilterClicks = useMemo(
    () => counters.reduce((sum, counter) => sum + counter.filterClicks, 0),
    [counters]
  );

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const persist = async () => {
      try {
        const payload: PersistedState = {
          globalElapsed,
          globalRunning,
          counters,
          filterStartEvents,
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn("Impossible de sauvegarder les compteurs", error);
      }
    };

    persist();
  }, [globalElapsed, globalRunning, counters, filterStartEvents, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !globalRunning) {
      return;
    }

    const interval = setInterval(() => {
      setGlobalElapsed((prev) => {
        if (prev + 1 >= GLOBAL_ALARM_INTERVAL_SECONDS) {
          return GLOBAL_ALARM_INTERVAL_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [globalRunning, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !isAnyCounterRunning) {
      return;
    }

    const interval = setInterval(() => {
      setCounters((prev) =>
        prev.map((counter) => {
          if (!counter.isRunning) {
            return counter;
          }

          return {
            ...counter,
            elapsed: counter.elapsed + 1,
            isEmpty: false,
          };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [isAnyCounterRunning, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !globalRunning) {
      return;
    }

    if (globalElapsed < GLOBAL_ALARM_INTERVAL_SECONDS) {
      return;
    }

    Vibration.vibrate([0, 500, 200, 500]);
    playAlarmSound();
    setGlobalElapsed(0);

    setTimeout(() => {
      Alert.alert(
        "KAMREEN",
        "Vérifiez le niveau d'eau. Le service continue, pensez à confirmer une fois le contrôle terminé.",
        [
          {
            text: "OK",
            onPress: () => {
              stopAlarmSound().catch(() => undefined);
            },
          },
        ],
        { cancelable: false }
      );
    }, 0);
  }, [
    globalElapsed,
    globalRunning,
    isHydrated,
    playAlarmSound,
    stopAlarmSound,
  ]);

  const handleActivateGlobal = () => {
    if (globalRunning) {
      return;
    }

    Alert.alert("Activation", "Le bac à eau est-il bien rempli ?", [
      { text: "Non", style: "cancel" },
      {
        text: "Oui",
        onPress: () => {
          setGlobalElapsed(0);
          setGlobalRunning(true);
        },
      },
    ]);
  };

  const handleConfirmResetAll = () => {
    Alert.alert(
      "Remise à zéro",
      "Voulez-vous remettre tous les compteurs à zéro ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Oui",
          style: "destructive",
          onPress: () => {
            stopAlarmSound().catch(() => undefined);
            stopFilterSound().catch(() => undefined);
            setGlobalRunning(false);
            setGlobalElapsed(0);
            setCounters(createInitialCounters());
            setFilterStartEvents(0);
          },
        },
      ]
    );
  };

  const handleToggleCounter = (id: number) => {
    if (!globalRunning) {
      Alert.alert(
        "Service inactif",
        "Veuillez d’abord activer le bac principal avant d’utiliser les compteurs individuels."
      );
      return;
    }

    // Déterminer à l'avance si ce clic doit compter
    const now = Date.now();
    const target = counters.find((c) => c.id === id);
    const isStarting = target ? !target.isRunning : true;
    const allowFilterIncrementPrecomputed =
      isStarting &&
      target &&
      (target.isEmpty ||
        (target.lastPauseTimestamp !== null &&
          now - target.lastPauseTimestamp >= 30000));

    setCounters((prev) =>
      prev.map((counter) => {
        if (counter.id !== id) {
          return counter;
        }

        if (counter.isRunning) {
          return {
            ...counter,
            isRunning: false,
            lastPauseTimestamp: Date.now(),
          };
        }

        return {
          ...counter,
          isRunning: true,
          isEmpty: false,
          startCount: 0,
          lastPauseTimestamp: null,
          filterClicks: allowFilterIncrementPrecomputed
            ? counter.filterClicks + 1
            : counter.filterClicks,
        };
      })
    );

    if (allowFilterIncrementPrecomputed) {
      setFilterStartEvents((prev) => {
        const next = prev + 1;
        if (next >= 2) {
          triggerFilterAlert();
          return 0;
        }
        return next;
      });
    }
  };

  const handleClearCounter = (id: number) => {
    setCounters((prev) =>
      prev.map((counter) => {
        if (counter.id !== id) {
          return counter;
        }

        return {
          ...counter,
          elapsed: 0,
          isRunning: false,
          isEmpty: true,
          startCount: 0,
          lastPauseTimestamp: null,
          filterClicks: 0,
        };
      })
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>KAMREEN</Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            globalRunning && styles.primaryButtonDisabled,
          ]}
          onPress={handleActivateGlobal}
          activeOpacity={0.9}
          disabled={globalRunning}
        >
          {globalRunning && (
            <Animated.View
              pointerEvents="none"
              style={[styles.waveOverlay, waveAnimatedStyle]}
            />
          )}
          <MaterialIcons
            name={globalRunning ? "task-alt" : "opacity"}
            size={28}
            color={globalRunning ? "#1d4ed8" : "#ffffff"}
          />
          <Text
            style={[
              styles.buttonLabel,
              globalRunning && styles.buttonLabelDisabled,
            ]}
          >
            {globalRunning ? "Bacs actifs" : "Activer les bacs"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleConfirmResetAll}
          activeOpacity={0.9}
        >
          <MaterialIcons name="refresh" size={26} color="#ffffff" />
          <Text style={styles.buttonLabel}>Vider tout</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.globalTimerText}>
        Alarme 4h :{" "}
        <Text style={styles.globalTimerValue}>{formatTime(globalElapsed)}</Text>
      </Text>

      <View style={styles.countersWrapper}>
        {counters.map((counter) => (
          <View key={counter.id} style={styles.counterRow}>
            <View style={styles.counterTimeWrapper}>
              <Text style={styles.counterLabel}>Bac {counter.id}</Text>
              <Text style={styles.counterTime}>
                {counter.isEmpty ? "(vide)" : formatTime(counter.elapsed)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.counterButton, styles.playButton]}
              onPress={() => handleToggleCounter(counter.id)}
              activeOpacity={0.85}
            >
              <MaterialIcons
                name={counter.isRunning ? "pause" : "play-arrow"}
                size={28}
                color="#ffffff"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.counterButton, styles.resetButton]}
              onPress={() => handleClearCounter(counter.id)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="delete-outline" size={26} color="#1f2937" />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.debugContainer}>
        <Text style={styles.debugTitle}>Debug filtration</Text>
        <Text style={styles.debugLine}>
          Total clics filtrage : {totalFilterClicks}
        </Text>
        <Text style={styles.debugLine}>
          File d&apos;alertes en attente : {filterStartEvents}/2
        </Text>
        {counters.map((counter) => {
          let secondsRemainingDisplay = "30s";
          if (!counter.isRunning) {
            if (counter.lastPauseTimestamp !== null) {
              const elapsed = Math.floor(
                (debugNow - counter.lastPauseTimestamp) / 1000
              );
              const remaining = Math.max(0, 30 - elapsed);
              secondsRemainingDisplay = `${remaining}s`;
            } else if (counter.isEmpty) {
              secondsRemainingDisplay = "30s";
            } else {
              secondsRemainingDisplay = "—";
            }
          }

          return (
            <Text key={`debug-${counter.id}`} style={styles.debugLine}>
              Bac {counter.id} · clics={counter.filterClicks} · état=
              {counter.isRunning ? "RUN" : "PAUSE"} · délai restant=
              {secondsRemainingDisplay}
            </Text>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  title: {
    fontSize: 40,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: 2,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 18,
    width: "48%",
    gap: 12,
    shadowColor: "#1d4ed8",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
    position: "relative",
    overflow: "hidden",
  },
  primaryButtonDisabled: {
    backgroundColor: "#e0efff",
  },
  waveOverlay: {
    position: "absolute",
    width: "150%",
    left: "-25%",
    bottom: -36,
    height: "170%",
    backgroundColor: "#38bdf8",
    opacity: 0.35,
    borderTopLeftRadius: 200,
    borderTopRightRadius: 200,
    borderBottomLeftRadius: 90,
    borderBottomRightRadius: 90,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 18,
    width: "48%",
    gap: 12,
    shadowColor: "#fb923c",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
  },
  buttonLabel: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  buttonLabelDisabled: {
    color: "#1d4ed8",
  },
  globalTimerText: {
    fontSize: 22,
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 24,
    fontWeight: "600",
  },
  globalTimerValue: {
    color: "#2563eb",
  },
  countersWrapper: {
    flex: 1,
    gap: 16,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 4,
  },
  counterTimeWrapper: {
    flex: 0.7,
  },
  counterLabel: {
    color: "#475569",
    fontSize: 18,
    marginBottom: 8,
    fontWeight: "600",
  },
  counterTime: {
    color: "#0f172a",
    fontSize: 28,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  counterButton: {
    flex: 0.15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginLeft: 12,
  },
  playButton: {
    backgroundColor: "#22c55e",
  },
  resetButton: {
    backgroundColor: "#e2e8f0",
  },
  debugContainer: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
    gap: 6,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  debugLine: {
    fontSize: 14,
    color: "#1e293b",
  },
});
