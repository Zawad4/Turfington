import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Cast WebView to any to avoid React 19 type discrepancies in third-party definitions
const AppWebView: any = WebView;

// Dual URL support: Local Wi-Fi network and Cloud Live deployment (works on 5G/4G/Anywhere)
const LOCAL_DEV_URL = 'http://172.20.10.2:5173';
const CLOUD_LIVE_URL = 'https://turfington.vercel.app';
const DEFAULT_URL = CLOUD_LIVE_URL;

export default function AppScreen() {
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const [inputUrl, setInputUrl] = useState(DEFAULT_URL);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const webViewRef = useRef<any>(null);

  // Handle Android hardware back button to navigate inside webview
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [canGoBack]);

  const handleRetry = () => {
    setHasError(false);
    setIsLoading(true);
    setCurrentUrl(inputUrl);
    webViewRef.current?.reload();
  };

  const switchToCloud = () => {
    setInputUrl(CLOUD_LIVE_URL);
    setCurrentUrl(CLOUD_LIVE_URL);
    setHasError(false);
    setIsLoading(true);
    setShowConfig(false);
  };

  const switchToLocal = () => {
    setInputUrl(LOCAL_DEV_URL);
    setCurrentUrl(LOCAL_DEV_URL);
    setHasError(false);
    setIsLoading(true);
    setShowConfig(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Floating Control Bar */}
      <View style={styles.topBar}>
        <View style={[styles.statusDot, currentUrl.includes('vercel.app') && { backgroundColor: '#38bdf8' }]} />
        <Text style={styles.urlLabel} numberOfLines={1}>
          {currentUrl.includes('vercel.app') ? '☁️ Cloud Live' : currentUrl}
        </Text>
        <TouchableOpacity
          style={styles.pillButton}
          onPress={() => setShowConfig(!showConfig)}
        >
          <Text style={styles.pillButtonText}>{showConfig ? 'Close' : 'Switch URL'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pillButton, styles.reloadButton]}
          onPress={handleRetry}
        >
          <Text style={styles.pillButtonText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Optional URL Configuration Dropdown */}
      {showConfig && (
        <View style={styles.configCard}>
          <Text style={styles.configTitle}>Choose Server Source</Text>
          <View style={styles.presetsRow}>
            <TouchableOpacity
              style={[styles.presetButton, currentUrl === LOCAL_DEV_URL && styles.presetButtonActive]}
              onPress={switchToLocal}
            >
              <Text style={[styles.presetButtonText, currentUrl === LOCAL_DEV_URL && styles.presetButtonTextActive]}>
                🏠 Local Wi-Fi
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.presetButton, currentUrl === CLOUD_LIVE_URL && styles.presetButtonActive]}
              onPress={switchToCloud}
            >
              <Text style={[styles.presetButtonText, currentUrl === CLOUD_LIVE_URL && styles.presetButtonTextActive]}>
                ☁️ Cloud (5G / Cellular)
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.configTitle, { marginTop: 12 }]}>Custom Address</Text>
          <TextInput
            style={styles.input}
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="http://192.168.x.x:5173"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.configActions}>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => {
                setShowConfig(false);
                handleRetry();
              }}
            >
              <Text style={styles.applyButtonText}>Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main WebView */}
      <View style={styles.webViewWrapper}>
        <AppWebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mixedContentMode="always"
          originWhitelist={['*']}
          startInLoadingState={true}
          onLoadStart={() => {
            setIsLoading(true);
            setHasError(false);
          }}
          onLoadEnd={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          onNavigationStateChange={(navState: any) => {
            setCanGoBack(navState.canGoBack);
          }}
          renderLoading={() => (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.loadingText}>Loading Turfington App...</Text>
            </View>
          )}
        />

        {/* Error Fallback Screen */}
        {hasError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorEmoji}>⚡</Text>
            <Text style={styles.errorTitle}>Cannot Connect to Server</Text>
            <Text style={styles.errorDescription}>
              Could not reach <Text style={styles.codeText}>{currentUrl}</Text>
            </Text>

            <View style={styles.troubleshootBox}>
              <Text style={styles.troubleshootItem}>
                • If using <Text style={styles.boldText}>Local Wi-Fi</Text>, ensure your phone is connected to the same Wi-Fi router.
              </Text>
              <Text style={styles.troubleshootItem}>
                • If on <Text style={styles.boldText}>5G Mobile Data</Text>, tap the green button below to connect via Cloud!
              </Text>
            </View>

            <View style={{ gap: 10, width: '100%', alignItems: 'center' }}>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: '#10b981', width: '100%', alignItems: 'center' }]}
                onPress={switchToCloud}
              >
                <Text style={styles.retryButtonText}>☁️ Open Cloud Live (Works on 5G)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: '#4f46e5', width: '100%', alignItems: 'center' }]}
                onPress={handleRetry}
              >
                <Text style={styles.retryButtonText}>↻ Retry Local Wi-Fi Connection</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0e',
  },
  topBar: {
    height: 42,
    backgroundColor: '#121218',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  urlLabel: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  pillButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pillButtonText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
  },
  reloadButton: {
    paddingHorizontal: 8,
  },
  configCard: {
    backgroundColor: '#161622',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  configTitle: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1',
  },
  presetButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  presetButtonTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  input: {
    height: 38,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    color: '#fff',
    fontSize: 13,
  },
  configActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  applyButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  webViewWrapper: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0b0b0e',
  },
  centerContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b0b0e',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0b0b0e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 20,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorDescription: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  troubleshootBox: {
    backgroundColor: '#161622',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    gap: 10,
    marginBottom: 24,
  },
  troubleshootItem: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  codeText: {
    color: '#a5b4fc',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontWeight: '600',
  },
  boldText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  retryButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
