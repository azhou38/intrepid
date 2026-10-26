import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Camera } from 'lucide-react-native';
import { useStore } from '../store';
import CircleCropper, { avatarImageFrame } from './CircleCropper';
import type { AvatarCrop } from '../types';

// The profile's avatar: its photo when one is set (placed by its crop when it has one, else centred, filling the
// circle), else its first initial on the app's indigo.
export function ProfileAvatar({ uri, name, size, crop }: { uri: string | null; name: string; size: number; crop?: AvatarCrop | null }) {
  // A faint gray border all round, on the photo and the initial alike.
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: '#D1D5DB' };
  if (uri && crop) {
    return (
      <View style={[box, st.avatarBg, { overflow: 'hidden' }]}>
        <Image source={{ uri }} style={[{ position: 'absolute' }, avatarImageFrame(crop, size)]} />
      </View>
    );
  }
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

// Edit Profile: the avatar (choose a photo from the library and place it in a circle, move and scale it again, or remove
// it), the name and the username.
// Nothing is saved until Save; a chosen photo is copied into the app's documents then (the picker's copy sits in a cache
// the system may clear), and the photo it replaces is deleted.
export default function EditProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const userName = useStore(s => s.userName);
  const userHandle = useStore(s => s.userHandle) ?? '';
  const userAvatarUri = useStore(s => s.userAvatarUri) ?? null;
  const userAvatarCrop = useStore(s => s.userAvatarCrop) ?? null;
  const setProfile = useStore(s => s.setProfile);

  const [name, setName] = useState(userName);
  const [handle, setHandle] = useState(userHandle);
  const [avatar, setAvatar] = useState<string | null>(userAvatarUri);
  const [crop, setCrop] = useState<AvatarCrop | null>(userAvatarCrop);
  // The photo open in the circular cropper (a new pick, or the current photo to move and scale), with its size.
  const [cropping, setCropping] = useState<{ uri: string; w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  // Each opening starts from what is saved.
  useEffect(() => {
    if (!visible) return;
    setName(userName); setHandle(userHandle); setAvatar(userAvatarUri); setCrop(userAvatarCrop); setSaving(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = name.trim() !== userName || handle !== userHandle || avatar !== userAvatarUri || crop !== userAvatarCrop;
  const canSave = !!name.trim() && changed && !saving;

  // A picked photo goes straight to the circular cropper (the system's own crop is square only).
  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    const a = !r.canceled ? r.assets[0] : null;
    // The cropper is drawn inside this sheet, so it shows at once without waiting for the picker to finish closing.
    if (a) setCropping({ uri: a.uri, w: a.width, h: a.height });
  };
  const adjustPhoto = () => {
    if (!avatar) return;
    if (crop) { setCropping({ uri: avatar, w: crop.w, h: crop.h }); return; }
    Image.getSize(avatar, (w, h) => setCropping({ uri: avatar, w, h }), () => {});
  };
  const removePhoto = () => { setAvatar(null); setCrop(null); };
  const photoOptions = () => {
    if (!avatar) { pickPhoto(); return; }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Choose Photo', 'Move and Scale', 'Remove Photo', 'Cancel'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        i => { if (i === 0) pickPhoto(); else if (i === 1) adjustPhoto(); else if (i === 2) removePhoto(); },
      );
    } else {
      Alert.alert('Profile Photo', undefined, [
        { text: 'Choose Photo', onPress: pickPhoto },
        { text: 'Move and Scale', onPress: adjustPhoto },
        { text: 'Remove Photo', style: 'destructive', onPress: removePhoto },
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
    setProfile({ name: name.trim(), handle, avatarUri: uri, avatarCrop: crop });
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
          <ProfileAvatar uri={avatar} name={name || userName} size={104} crop={crop} />
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
      <CircleCropper
        inline
        uri={cropping?.uri ?? null}
        width={cropping?.w ?? 1}
        height={cropping?.h ?? 1}
        initial={cropping && cropping.uri === avatar ? crop : null}
        onCancel={() => setCropping(null)}
        onDone={c => { setAvatar(cropping!.uri); setCrop(c); setCropping(null); }}
      />
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
