import { useColors } from '@/hooks/useColors';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Medicine packaging almost always uses UPC/EAN linear codes; include the
// common 1D variants + QR as a fallback. Keep the list short so scanning is
// fast and confident on hardware.
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'qr'];

interface Props {
  open: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
  /** Shown briefly after a successful lookup (e.g. the matched medicine name). */
  scanFeedback?: string | null;
  /** Errors surfaced here are short-lived; notices stay until the user acts. */
  scanError?: string | null;
}

export default function BarcodeScannerModal({ open, onClose, onScanned, scanFeedback, scanError }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const busy = useRef(false);

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000' },
    header: {
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      flexDirection: 'row', alignItems: 'center',
      paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16,
    },
    headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    headerBtn: {
      width: 40, height: 40, borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center', justifyContent: 'center',
    },
    flashBtn: {
      width: 76, height: 40, borderRadius: 14, marginLeft: 10,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center', justifyContent: 'center',
    },
    flashText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
    hintBar: {
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10,
      paddingTop: 10, paddingBottom: insets.bottom + 22, paddingHorizontal: 24,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
    },
    hintText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
    feedback: {
      marginTop: 12, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, overflow: 'hidden',
    },
    feedbackText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
    frame: {
      position: 'absolute',
      width: 240, height: 180, borderRadius: 12,
      borderWidth: 2, borderColor: '#fff',
      top: '50%', left: '50%',
      marginLeft: -120, marginTop: -90,
      opacity: 0.85,
    },
    cornerPin: {
      position: 'absolute', top: insets.top + 64,
      left: 0, right: 0,
      alignItems: 'center',
    },
    cornerText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 8, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
    permissionBox: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 32 },
    permissionTitle: { color: '#fff', fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 8 },
    permissionText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19, marginBottom: 20 },
    permissionBtn: {
      backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12,
      borderRadius: colors.radius, alignItems: 'center',
    },
    permissionBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  });

  const handleScan = (data: string) => {
    if (busy.current || !data) return;
    busy.current = true;
    onScanned(data);
    // Debounce: a single held barcode fires the callback repeatedly; ignore
    // further detections briefly so only one lookup happens per code.
    setTimeout(() => { busy.current = false; }, 1200);
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      {Platform.OS === 'web' ? (
        <View style={s.overlay}>
          <View style={s.header}>
            <Pressable style={s.headerBtn} onPress={onClose}>
              <Feather name="x" size={20} color="#fff" />
            </Pressable>
            <Text style={s.headerTitle}>Scan medicine barcode</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={s.permissionBox}>
            <Text style={s.permissionTitle}>Not available on web</Text>
            <Text style={s.permissionText}>
              Camera barcode scanning is a native feature. Use the medicine search in this browser instead.
            </Text>
            <Pressable style={s.permissionBtn} onPress={onClose}>
              <Text style={s.permissionBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      ) : !permission ? (
        <View style={s.overlay}>
          <View style={s.permissionBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[s.permissionText, { marginTop: 12 }]}>Checking camera permission…</Text>
          </View>
        </View>
      ) : !permission.granted ? (
        <View style={s.overlay}>
          <View style={s.permissionBox}>
            <Text style={s.permissionTitle}>Camera access needed</Text>
            <Text style={s.permissionText}>
              Allow camera access to scan medicine barcodes and add them to the sale in one step.
            </Text>
            <Pressable style={s.permissionBtn} onPress={() => requestPermission()}>
              <Text style={s.permissionBtnText}>{permission.canAskAgain ? 'Grant permission' : 'Open Settings'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={s.overlay}>
          <View style={s.header}>
            <Pressable style={s.headerBtn} onPress={onClose}>
              <Feather name="x" size={20} color="#fff" />
            </Pressable>
            <Text style={s.headerTitle}>Scan medicine barcode</Text>
            <Pressable style={s.flashBtn} onPress={() => setTorch(v => !v)}>
              <Feather name={torch ? 'zap-off' : 'zap'} size={16} color="#fff" />
            </Pressable>
          </View>

          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            active={open}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={(e) => handleScan(e.data)}
          />

          <View pointerEvents="none" style={s.frame} />
          <View pointerEvents="none" style={s.cornerPin}>
            <Text style={s.cornerText}>Align the barcode inside the frame</Text>
          </View>

          <View style={s.hintBar}>
            <Text style={s.hintText}>
              Scanning stays on — each recognised code is added to the sale. Close when done.
            </Text>
            {scanFeedback && (
              <View style={[s.feedback, { backgroundColor: 'rgba(16,185,129,0.9)' }]}>
                <Text style={[s.feedbackText, { color: '#fff' }]}>✓ {scanFeedback}</Text>
              </View>
            )}
            {scanError && (
              <View style={[s.feedback, { backgroundColor: 'rgba(239,68,68,0.9)' }]}>
                <Text style={[s.feedbackText, { color: '#fff' }]}>{scanError}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
}