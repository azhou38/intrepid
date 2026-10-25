import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Camera } from 'lucide-react-native';
import { useStore } from '../store';

// The profile's avatar: its photo when one is set, else its first initial on the app's indigo.
export function ProfileAvatar({ uri, name, size }: { uri: string | null; name: string; size: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[box, st.avatarBg]} />;
  return (
    <View style={[box, st.avatarBg, st.center]}>
      <Text style={[st.initial, { fontSize: Math.round(size * 0.4) }]}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
}

const NAME_MAX = 40;
const HANDLE_MAX = 30;
// A username: lowercase letters, digits, dots and underscores, without the @.
const cleanHandle = (t: string) => t.toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9._]/g, '').slice(0, HANDLE_MAX);
const AVATAR_DIR = FileSystem.documentDirectory ?? '';

// Edit Profile: the avatar (choose a photo from the library, cropped square, or remove it), the name and the username.
// Nothing is saved until Save; a chosen photo is copied into the app's documents then (the picker's copy sits in a cache
// the system may clear), and the photo it replaces is deleted.
export default function EditProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const userName = useStore(s => s.userName);
  const userHandle = useStore(s => s.userHandle) ?? '';
  const userAvatarUri = useStore(s => s.userAvatarUri) ?? null;
  const setProfile = useStore(s => s.setProfile);

  const [name, setName] = useState(userName);
  const [handle, setHandle] = useState(userHandle);
  const [avatar, setAvatar] = useState<string | null>(userAvatarUri);
  const [saving, setSaving] = useState(false);
  // Each opening starts from what is saved.
  useEffect(() => {
    if (!visible) return;
    setName(userName); setHandle(userHandle); setAvatar(userAvatarUri); setSaving(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = name.trim() !== userName || handle !== userHandle || avatar !== userAvatarUri;
  const canSave = !!name.trim() && changed && !saving;

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!r.canceled && r.assets[0]) setAvatar(r.assets[0].uri);
  };
  const photoOptions = () => {
    if (!avatar) { pickPhoto(); return; }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Choose Photo', 'Remove Photo', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        i => { if (i === 0) pickPhoto(); else if (i === 1) setAvatar(null); },
      );
    } else {
      Alert.alert('Profile Photo', undefined, [
        { text: 'Choose Photo', onPress: pickPhoto },
        { text: 'Remove Photo', style: 'destructive', onPress: () => setAvatar(null) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    let uri = avatar;
    try {
      // A newly chosen photo is kept in the app's documents; the one it replaces (or a removed one) is deleted.
      if (avatar && avatar !== userAvatarUri && AVATAR_DIR) {
        uri = `${AVATAR_DIR}avatar-${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: avatar, to: uri });
      }
      if (userAvatarUri && userAvatarUri !== uri && userAvatarUri.startsWith(AVATAR_DIR)) {
        await FileSystem.deleteAsync(userAvatarUri, { idempotent: true });
      }
    } catch {
      // Keeping the picker's own file is better than losing the change.
      uri = avatar;
    }
    setProfile({ name: name.trim(), handle, avatarUri: uri });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={st.sheet}>
        <View style={st.topBar}>
          <Pressable onPress={onClose} hitSlop={10}><Text style={st.cancel}>Cancel</Text></Pressable>
          <Text style={st.title}>Edit Profile</Text>
          <Pressable onPress={save} hitSlop={10} disabled={!canSave}>
            <Text style={[st.save, !canSave && st.saveOff]}>Save</Text>
          </Pressable>
        </View>

        <Pressable style={st.avatarWrap} onPress={photoOptions} accessibilityLabel="Change profile photo">
          <ProfileAvatar uri={avatar} name={name || userName} size={104} />
          <View style={st.cameraBadge}><Camera size={15} color="white" strokeWidth={2.4} /></View>
        </Pressable>
        <Pressable onPress={photoOptions} hitSlop={6} style={{ alignSelf: 'center' }}>
          <Text style={st.photoLink}>{avatar ? 'Change Photo' : 'Add Photo'}</Text>
        </Pressable>

        <View style={st.field}>
          <Text style={st.label}>Name</Text>
          <TextInput
            style={st.input}
            value={name}
            onChangeText={t => setName(t.slice(0, NAME_MAX))}
            placeholder="Your name"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>
        <View style={st.field}>
          <Text style={st.label}>Username</Text>
          <View style={st.handleRow}>
            <Text style={st.at}>@</Text>
            <TextInput
              style={[st.input, { flex: 1, paddingLeft: 0, borderWidth: 0, backgroundColor: 'transparent' }]}
              value={handle}
              onChangeText={t => setHandle(cleanHandle(t))}
              placeholder="username"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </View>
          <Text style={st.hint}>Letters, numbers, dots and underscores.</Text>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  avatarBg: { backgroundColor: '#6366F1' },
  center: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '800', color: 'white' },

  sheet: { flex: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  cancel: { fontSize: 16, color: '#6B7280' },
  save: { fontSize: 16, fontWeight: '700', color: '#111827' },
  saveOff: { color: '#D1D5DB' },

  avatarWrap: { alignSelf: 'center', marginTop: 12 },
  cameraBadge: {
    position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#F9FAFB',
  },
  photoLink: { fontSize: 14, fontWeight: '600', color: '#6366F1', marginTop: 10 },

  field: { marginTop: 22 },
  label: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 6, letterSpacing: 0.3 },
  input: {
    height: 46, paddingHorizontal: 14, fontSize: 16, color: '#111827',
    backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  handleRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, borderWidth: 1,
    borderColor: '#E5E7EB', paddingLeft: 14,
  },
  at: { fontSize: 16, color: '#9CA3AF', marginRight: 2 },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },
});
