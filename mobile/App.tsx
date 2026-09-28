import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
// Import local-notification modules directly. Importing the package barrel also
// loads its remote push-token auto-registration side effect, which throws in
// Expo Go on Android even when this app only schedules local reminders.
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { addNotificationResponseReceivedListener } from 'expo-notifications/build/NotificationsEmitter';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { CreateSetScreen, MobileStudyRoomScreen, OnboardingScreen, ProfileScreen, ProgressScreen, SearchScreen, setScreenDarkMode, TodayPlan, TimetableScreen, TutorScreen, WelcomeGuide } from './src/screens';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
const COOKIE_SESSION = '__studybuddy_cookie_session__';
const INK = '#17182B';
const PURPLE = '#6657E8';
const MUTED = '#888BA0';
type User = { id: string; name?: string | null; email: string; tokenBalance?: number };
type Progress = { xp: number; level: number; streak: number; dueCount: number; totalAttempts: number };
type StudySet = { id: string; topicId?: string | null; title: string; subject?: string | null; topic?: string | null; cardCount: number };
type StudyCard = { id: string; cardType: 'flashcard' | 'mcq'; front?: string | null; back?: string | null; question?: string | null; options?: string[] | null; correctIndex?: number | null; explanation?: string | null };

setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

async function setStudyReminder(enabled: boolean) {
  const oldId = await SecureStore.getItemAsync('studybuddy-reminder-id');
  if (!enabled) {
    if (oldId) await cancelScheduledNotificationAsync(oldId).catch(() => {});
    await SecureStore.deleteItemAsync('studybuddy-reminder-id');
    return;
  }
  let permission = await getPermissionsAsync();
  if (!permission.granted) permission = await requestPermissionsAsync();
  if (!permission.granted) throw new Error('Notifications are turned off for StudyBuddy in your device settings.');
  if (Platform.OS === 'android') await setNotificationChannelAsync('study-reminders', { name: 'Study reminders', importance: AndroidImportance.DEFAULT, sound: 'default' });
  if (oldId) await cancelScheduledNotificationAsync(oldId).catch(() => {});
  const id = await scheduleNotificationAsync({ content: { title: 'A little study goes a long way 🌱', body: 'Your StudyBuddy plan is ready when you are.', data: { screen: 'home' }, sound: 'default' }, trigger: { type: SchedulableTriggerInputTypes.DAILY, hour: 19, minute: 0, ...(Platform.OS === 'android' ? { channelId: 'study-reminders' } : {}) } });
  await SecureStore.setItemAsync('studybuddy-reminder-id', id);
}

type TimetableSlot = { id: string; dayOfWeek: number; startTime: string; endTime: string; subjectName: string; subjectId?: string | null };
async function syncTimetableReminders(slots: TimetableSlot[]) {
  const previous = JSON.parse(await SecureStore.getItemAsync('studybuddy-timetable-reminders') || '{}') as Record<string, string>;
  await Promise.all(Object.values(previous).map((id) => cancelScheduledNotificationAsync(id).catch(() => {})));
  if (!slots.length) { await SecureStore.deleteItemAsync('studybuddy-timetable-reminders'); return true; }
  let permission = await getPermissionsAsync();
  if (!permission.granted) permission = await requestPermissionsAsync();
  if (!permission.granted) return false;
  if (Platform.OS === 'android') await setNotificationChannelAsync('study-reminders', { name: 'Study reminders', importance: AndroidImportance.DEFAULT, sound: 'default' });
  const next: Record<string, string> = {};
  for (const slot of slots) {
    const [startHour, startMinute] = slot.startTime.split(':').map(Number);
    let minutes = startHour * 60 + startMinute - 5;
    let day = slot.dayOfWeek;
    if (minutes < 0) { minutes += 24 * 60; day = (day + 6) % 7; }
    const id = await scheduleNotificationAsync({
      content: { title: `Your ${slot.subjectName} lesson starts soon`, body: `Your StudyBuddy room is ready for your ${slot.startTime} lesson.`, data: { screen: 'timetable', topicId: slot.subjectId }, sound: 'default' },
      trigger: { type: SchedulableTriggerInputTypes.WEEKLY, weekday: day + 1, hour: Math.floor(minutes / 60), minute: minutes % 60, ...(Platform.OS === 'android' ? { channelId: 'study-reminders' } : {}) },
    });
    next[slot.id] = id;
  }
  await SecureStore.setItemAsync('studybuddy-timetable-reminders', JSON.stringify(next));
  return true;
}

async function request(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(token !== COOKIE_SESSION ? { Authorization: `Bearer ${token}` } : {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (response.headers.get('content-type')?.includes('text/event-stream')) return response;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${data.error || 'Could not connect. Please try again.'}`);
  return data;
}

function MainApp() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [screen, setScreen] = useState<'home' | 'search' | 'library' | 'progress' | 'profile' | 'study' | 'room' | 'create' | 'tutor' | 'timetable'>('home');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [sets, setSets] = useState<StudySet[]>([]);
  const [activeSet, setActiveSet] = useState<StudySet | null>(null);
  const [activeRoomTopicId, setActiveRoomTopicId] = useState<string | null>(null);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { Promise.all([SecureStore.getItemAsync('studybuddy-token'), SecureStore.getItemAsync('studybuddy-reminder-id'), SecureStore.getItemAsync('studybuddy-dark-mode')]).then(([saved, reminderId, dark]) => { if (saved) setToken(saved); setReminderEnabled(Boolean(reminderId)); const enabled = dark === '1'; setDarkMode(enabled); setScreenDarkMode(enabled); setAppDarkMode(enabled); }).finally(() => setBooting(false)); }, []);
  const changeTheme = useCallback(async (enabled: boolean) => { setDarkMode(enabled); setScreenDarkMode(enabled); setAppDarkMode(enabled); await SecureStore.setItemAsync('studybuddy-dark-mode', enabled ? '1' : '0'); }, []);
  const updateReminder = useCallback(async (enabled: boolean) => { await setStudyReminder(enabled); setReminderEnabled(enabled); }, []);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [profile, stats, library] = await Promise.all([
        request('/api/auth/me', token), request('/api/progress', token), request('/api/study-sets', token),
      ]);
      const account = profile.user || profile;
      setUser(account); setGuideVisible(!(await SecureStore.getItemAsync(`studybuddy-guide-seen.${account.id}`))); setProfileReady(true); setProgress(stats); setSets(library.sets || []);
    } catch (error) {
      if (error instanceof Error && /401|authentication/i.test(error.message)) {
        if (token === COOKIE_SESSION) Alert.alert('Sign-in session expired', 'Your account was accepted, but the secure session could not be restored on this device. Please sign in again.');
        await SecureStore.deleteItemAsync('studybuddy-token'); setToken(null); setUser(null); setProfileReady(false);
      } else Alert.alert('Could not refresh', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!token) return; void request('/api/notifications', token).then((data) => setUnreadNotifications(data.unreadCount || 0)).catch(() => {}); }, [token]);
  useEffect(() => { const subscription = addNotificationResponseReceivedListener((response) => { if (response.notification.request.content.data?.screen === 'timetable') setScreen('timetable'); }); return () => subscription.remove(); }, []);
  const showNotifications = async () => { if (!token) return; try { await request('/api/notifications', token, { method: 'POST' }); const data = await request('/api/notifications', token); setUnreadNotifications(data.unreadCount || 0); const list = (data.notifications || []).slice(0, 8); if (!list.length) { Alert.alert('You’re all caught up', 'StudyBuddy will let you know when something needs your attention.'); return; } Alert.alert('Notifications', list.map((n: any) => `${n.read ? '•' : '●'} ${n.message}`).join('\n\n'), [{ text: 'Mark all read', onPress: async () => { await request('/api/notifications/read', token, { method: 'POST', body: JSON.stringify({ all: true }) }); setUnreadNotifications(0); } }, { text: 'Done', style: 'cancel' }]); } catch (error) { Alert.alert('Notifications unavailable', error instanceof Error ? error.message : 'Please try again.'); } };
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const openLibrary = () => { setScreen('library'); void load(); };
  const openSet = async (set: StudySet) => {
    if (!token) return;
    try {
      // Older Study Sets may predate rooms and have no topicId. Link them once
      // so every set opens its classroom instead of an empty card screen.
      const room = set.topicId ? { topicId: set.topicId } : await request(`/api/study-sets/${set.id}/room`, token, { method: 'POST' });
      if (!room?.topicId) throw new Error('This Study Set could not be connected to a room. Update the StudyBuddy server and try again.');
      setActiveRoomTopicId(room.topicId); setScreen('room');
    } catch (error) { Alert.alert('Could not open Study Room', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const practiceSet = async (setId: string) => {
    if (!token) return;
    try {
      const response = await request(`/api/study-sets/${setId}`, token);
      const studySet = response.studySet;
      setActiveSet(studySet); setCards(studySet.cards || []); setCardIndex(0); setRevealed(false); setScreen('study');
    } catch (error) { Alert.alert('Could not open practice cards', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const reviewCard = async (quality: 0 | 5) => {
    if (!token) return;
    const card = cards[cardIndex]; if (!card) return;
    setSavingReview(true);
    try {
      await request('/api/review/submit', token, { method: 'POST', body: JSON.stringify({ cardId: card.id, quality }) });
      setRevealed(false);
      if (cardIndex + 1 < cards.length) setCardIndex(cardIndex + 1);
      else { await load(); Alert.alert('Session complete 🎉', 'Nice work showing up for your learning today.', [{ text: 'Done', onPress: () => setScreen('library') }]); }
    } catch (error) { Alert.alert('Could not save review', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSavingReview(false); }
  };

  if (booting) return <View style={s.loading}><ActivityIndicator size="large" color={PURPLE} /></View>;
  if (!API_URL) return <ConfigurationScreen />;
  if (!token) return <LoginScreen onLogin={async (jwt, account) => {
    await SecureStore.setItemAsync('studybuddy-token', jwt);
    setUser(account); setToken(jwt); setGuideVisible(true); setProfileReady(false);
  }} />;
  if (!profileReady) return <View style={s.loading}><ActivityIndicator size="large" color={PURPLE} /><Text style={s.cardSub}>Preparing your study space…</Text></View>;
  if (guideVisible) return <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.content}><WelcomeGuide name={user?.name || undefined} onDone={() => { if (user?.id) void SecureStore.setItemAsync(`studybuddy-guide-seen.${user.id}`, '1'); setGuideVisible(false); }}/></ScrollView></SafeAreaView>;
  if (user && (user as any).onboardingCompleted === false) return <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.content}><OnboardingScreen token={token} request={request} name={user.name || undefined} onComplete={(reminder) => { if (reminder) void updateReminder(true).catch((error) => Alert.alert('Reminder not enabled', error instanceof Error ? error.message : 'You can enable it in Profile.')); void load(); }}/></ScrollView></SafeAreaView>;
  return <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
    <View style={s.topbar}>
      <View style={s.brandMark}><Ionicons name="sparkles" size={20} color="white" /></View>
      <Text style={s.brand}>studybuddy</Text>
      <TouchableOpacity style={s.notificationButton} onPress={() => void showNotifications()} accessibilityLabel="Notifications"><Ionicons name="notifications-outline" size={21} color={PURPLE}/>{unreadNotifications > 0 && <View style={s.notificationDot}/>}</TouchableOpacity>
      <TouchableOpacity style={s.avatar} onPress={() => setScreen('profile')}><Text style={s.avatarText}>{(user?.name || user?.email || 'S').slice(0, 1).toUpperCase()}</Text></TouchableOpacity>
    </View>
    {screen === 'room' && activeRoomTopicId ? <MobileStudyRoomScreen token={token} request={request} topicId={activeRoomTopicId} user={user} onBack={openLibrary} onPracticeSet={practiceSet}/> : <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={PURPLE} />}>
      {screen === 'home' ? <>
        <Text style={s.eyebrow}>YOUR STUDY SPACE</Text>
        <Text style={s.heading}>Hey, {user?.name?.split(' ')[0] || 'there'} 👋</Text>
        <Text style={s.subheading}>Ready to make today count?</Text>
        <View style={s.hero}>
          <View style={s.heroDecor}><Ionicons name="school" size={68} color="#FFFFFF22" /></View>
          <Text style={s.heroEyebrow}>SMALL STEPS, BIG PROGRESS</Text>
          <Text style={s.heroTitle}>Your next big{ '\n' }aha moment is close.</Text>
          <Text style={s.heroCaption}>A little practice today goes a long way.</Text>
          <TouchableOpacity style={s.heroButton} onPress={() => setScreen('library')}><Text style={s.heroButtonText}>Explore my study sets</Text><Ionicons name="arrow-forward" size={17} color={PURPLE} /></TouchableOpacity>
        </View>
        {!!(user as any)?.ambitions?.length && <View style={s.goalBanner}><Ionicons name="flag-outline" size={17} color={PURPLE}/><Text style={s.goalBannerText} numberOfLines={2}>Your goal: {(user as any).ambitions[0]}</Text></View>}
        <TodayPlan token={token} request={request} onTutor={() => setScreen('tutor')} onLibrary={() => setScreen('library')} />
        <TouchableOpacity style={s.timetableShortcut} onPress={() => setScreen('timetable')}><Ionicons name="calendar-outline" size={17} color={PURPLE}/><Text style={s.timetableShortcutText}>Plan weekly lessons and reminders</Text><Ionicons name="arrow-forward" size={16} color={PURPLE}/></TouchableOpacity>
        <View style={s.sectionHead}><Text style={s.sectionTitle}>Your momentum</Text><Text style={s.sectionHint}>Keep it going ✨</Text></View>
        <View style={s.statsRow}>
          <Stat icon="flame" color="#FF8B5E" value={`${progress?.streak ?? 0}`} label="day streak" />
          <Stat icon="flash" color="#F4B844" value={`${progress?.xp ?? 0}`} label="total XP" />
          <Stat icon="layers" color="#52B9A5" value={`${progress?.dueCount ?? 0}`} label="to review" />
        </View>
        <View style={s.sectionHead}><Text style={s.sectionTitle}>Pick up where you left off</Text><TouchableOpacity onPress={() => setScreen('library')}><Text style={s.seeAll}>See all</Text></TouchableOpacity></View>
        {sets.slice(0, 3).length ? sets.slice(0, 3).map((set, i) => <SetCard key={set.id} item={set} tint={i} onPress={() => void openSet(set)} />) : <View style={s.emptyCard}><View style={s.emptyIcon}><Ionicons name="book-outline" size={22} color={PURPLE} /></View><Text style={s.cardTitle}>Your library is ready</Text><Text style={s.cardSub}>Create a study set from your notes and it will appear here.</Text><TouchableOpacity style={s.createSetButton} onPress={() => setScreen('create')}><Ionicons name="add-circle-outline" size={19} color={PURPLE}/><Text style={s.createSetText}>Create a study set</Text></TouchableOpacity></View>}
      </> : screen === 'search' ? <SearchScreen token={token} request={request}/> : screen === 'timetable' ? <TimetableScreen token={token} request={request} onSlotsChanged={syncTimetableReminders}/> : screen === 'tutor' ? <><TouchableOpacity onPress={() => setScreen(activeRoomTopicId ? 'room' : 'home')} style={s.backLink}><Ionicons name="arrow-back" size={18} color={PURPLE}/><Text style={s.backText}>{activeRoomTopicId ? 'Study room' : 'Home'}</Text></TouchableOpacity><TutorScreen token={token} request={request} user={user} studyRoomTopicId={activeRoomTopicId || undefined}/></> : screen === 'progress' ? <ProgressScreen token={token} request={request}/> : screen === 'profile' ? <ProfileScreen token={token} request={request} user={user} darkMode={darkMode} onDarkModeChange={(enabled) => { void changeTheme(enabled); }} reminderEnabled={reminderEnabled} onUserUpdated={setUser} onReminderChange={(enabled) => updateReminder(enabled)} onSignOut={async () => { try { await request('/api/auth/logout', token, { method: 'POST' }); } catch {} await updateReminder(false).catch(() => {}); await SecureStore.deleteItemAsync('studybuddy-token'); setToken(null); setUser(null); setProfileReady(false); setGuideVisible(false); setScreen('home'); }}/> : screen === 'create' ? <CreateSetScreen token={token} request={request} onDone={async (topicId) => { await load(); if (topicId) { setActiveRoomTopicId(topicId); setScreen('room'); } else setScreen('library'); }}/> : screen === 'library' ? <>
        <Text style={s.eyebrow}>MADE FOR YOUR NEXT BREAKTHROUGH</Text><Text style={s.heading}>Your library</Text><Text style={s.subheading}>All your study sets, together.</Text>
        <TouchableOpacity style={s.createSetButton} onPress={() => setScreen('create')}><Ionicons name="add-circle-outline" size={19} color={PURPLE}/><Text style={s.createSetText}>Create a study set</Text></TouchableOpacity>
        {sets.length ? sets.map((set, i) => <SetCard key={set.id} item={set} tint={i} onPress={() => void openSet(set)} />) : <View style={[s.emptyCard, { marginTop: 14 }]}><View style={s.emptyIcon}><Ionicons name="library-outline" size={22} color={PURPLE} /></View><Text style={s.cardTitle}>Nothing here just yet</Text><Text style={s.cardSub}>Create your first set from your notes to see it here.</Text></View>}
      </> : <>
        <TouchableOpacity onPress={() => setScreen('library')} style={s.backLink}><Ionicons name="arrow-back" size={18} color={PURPLE}/><Text style={s.backText}>Your library</Text></TouchableOpacity>
        <Text style={s.eyebrow}>{activeSet?.subject || 'STUDY SESSION'}</Text><Text style={s.heading}>{activeSet?.title || 'Review cards'}</Text>
        {!cards.length ? <View style={[s.emptyCard, { marginTop: 20 }]}><Text style={s.cardTitle}>No cards in this set yet</Text><Text style={s.cardSub}>This study set does not have review cards yet.</Text></View> : <>
          <View style={s.reviewProgress}><View style={s.reviewTrack}><View style={[s.reviewFill, { width: `${Math.round(((cardIndex + 1) / cards.length) * 100)}%` }]} /></View><Text style={s.reviewCount}>{cardIndex + 1} of {cards.length}</Text></View>
          <TouchableOpacity activeOpacity={0.92} onPress={() => setRevealed(!revealed)} style={s.reviewCard}>
            <Text style={s.reviewLabel}>{revealed ? 'ANSWER' : cards[cardIndex].cardType === 'mcq' ? 'QUESTION' : 'YOUR PROMPT'}</Text>
            <Text style={s.reviewQuestion}>{revealed ? cards[cardIndex].cardType === 'mcq' ? `${cards[cardIndex].options?.[cards[cardIndex].correctIndex ?? 0] || 'Answer'}${cards[cardIndex].explanation ? `\n\n${cards[cardIndex].explanation}` : ''}` : cards[cardIndex].back || 'No answer provided.' : cards[cardIndex].question || cards[cardIndex].front || 'Study prompt'}</Text>
            {!revealed && cards[cardIndex].cardType === 'mcq' && cards[cardIndex].options?.map((option, index) => <Text key={`${index}-${option}`} style={s.optionText}>{String.fromCharCode(65 + index)}.  {option}</Text>)}
            {!revealed && <View style={s.tapHint}><Ionicons name="eye-outline" size={16} color={PURPLE}/><Text style={s.tapHintText}>Tap to reveal the answer</Text></View>}
          </TouchableOpacity>
          {revealed ? <View style={s.reviewActions}><TouchableOpacity disabled={savingReview} style={s.practiceButton} onPress={() => void reviewCard(0)}><Ionicons name="refresh" size={17} color="#D56C5C"/><Text style={s.practiceText}>Practice again</Text></TouchableOpacity><TouchableOpacity disabled={savingReview} style={s.knewButton} onPress={() => void reviewCard(5)}>{savingReview ? <ActivityIndicator color="white"/> : <><Text style={s.knewText}>Got it</Text><Ionicons name="checkmark" size={18} color="white"/></>}</TouchableOpacity></View> : <TouchableOpacity style={s.revealButton} onPress={() => setRevealed(true)}><Text style={s.revealText}>Show answer</Text><Ionicons name="eye-outline" size={17} color="white"/></TouchableOpacity>}
        </>}
      </>}
    </ScrollView>}
    <View style={s.tabbar}>
      <Tab icon="home" label="Home" active={screen === 'home'} onPress={() => setScreen('home')} />
      <Tab icon="search" label="Search" active={screen === 'search'} onPress={() => setScreen('search')} />
      <Tab icon="library" label="Library" active={screen === 'library' || screen === 'study'} onPress={() => setScreen('library')} />
      <Tab icon="stats-chart" label="Progress" active={screen === 'progress'} onPress={() => setScreen('progress')} />
      <Tab icon="person" label="Profile" active={screen === 'profile'} onPress={() => setScreen('profile')} />
    </View>
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><MainApp /></SafeAreaProvider>;
}

function Stat({ icon, color, value, label }: { icon: keyof typeof Ionicons.glyphMap; color: string; value: string; label: string }) {
  return <View style={s.statCard}><View style={[s.statIcon, { backgroundColor: `${color}20` }]}><Ionicons name={icon} size={17} color={color} /></View><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}
function SetCard({ item, tint, onPress }: { item: StudySet; tint: number; onPress: () => void }) {
  const colors = ['#6657E8', '#E88B55', '#49A996', '#D06C9C']; const color = colors[tint % colors.length];
  return <TouchableOpacity onPress={onPress} style={s.setCard}><View style={[s.setIcon, { backgroundColor: `${color}18` }]}><Ionicons name="document-text" size={20} color={color} /></View><View style={s.setInfo}><Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text><Text style={s.cardSub}>{[item.subject, item.topic].filter(Boolean).join(' · ') || 'Study set'}  ·  {item.cardCount} cards</Text></View><Ionicons name="chevron-forward" size={18} color="#B7B8C7" /></TouchableOpacity>;
}
function Tab({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity style={s.tab} onPress={onPress}><Ionicons name={active ? icon : `${icon}-outline` as keyof typeof Ionicons.glyphMap} size={21} color={active ? PURPLE : MUTED} /><Text style={[s.tabLabel, active && { color: PURPLE }]}>{label}</Text></TouchableOpacity>;
}

function LoginScreen({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [otp, setOtp] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const authRequest = async (path: string, body: Record<string, string>) => {
    const res = await fetch(`${API_URL}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed. Please try again.');
    return data;
  };
  const login = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password to continue.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await authRequest('/api/auth/login', { email: email.trim(), password });
      if (data.needsEmailVerification) throw new Error(data.error || 'Please verify your email before signing in.');
      if (!data.ok || !data.user) throw new Error(data.error || 'Sign in failed.');
      // Older deployed web builds return a secure HTTP-only cookie without the
      // native bearer token. Keep using that session until the new API deploys.
      onLogin(data.token || COOKIE_SESSION, data.user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const register = async () => {
    if (!email.trim() || !password) { setError('Enter your email and choose a password.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { await authRequest('/api/auth/register', { email: email.trim(), password, name: name.trim() }); setMode('verify'); setNotice('We sent a 6-digit code to your email. It expires in 10 minutes.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create account.'); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!/^\d{6}$/.test(otp.trim())) { setError('Enter the 6-digit code from your email.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { await authRequest('/api/auth/verify-email', { email: email.trim(), otp: otp.trim() }); setMode('login'); setPassword(''); setOtp(''); setNotice('Email verified. Sign in with your new account.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not verify email.'); }
    finally { setBusy(false); }
  };
  const resendCode = async () => { setBusy(true); setError(''); setNotice(''); try { const result = await authRequest('/api/auth/send-otp', { email: email.trim(), purpose: 'signup' }); setNotice(result.message || 'A new code was sent.'); } catch (e) { setError(e instanceof Error ? e.message : 'Could not resend code.'); } finally { setBusy(false); } };
  const submit = mode === 'login' ? login : mode === 'register' ? register : verify;
  return <SafeAreaView style={s.loginSafe}><StatusBar style="dark"/><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><ScrollView contentContainerStyle={s.loginContent} keyboardShouldPersistTaps="handled">
    <View style={s.loginLogo}><Ionicons name="sparkles" size={25} color="white" /></View>
    <Text style={s.loginEyebrow}>YOUR PERSONAL STUDY SIDEKICK</Text><Text style={s.loginTitle}>Make learning{ '\n' }feel lighter.</Text><Text style={s.loginSubtitle}>Your goals, your pace, your next breakthrough.</Text>
    <View style={s.formCard}><Text style={s.formTitle}>{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Verify your email'}</Text><Text style={s.formHint}>{mode === 'login' ? 'Sign in to pick up where you left off.' : mode === 'register' ? 'Your account works across StudyBuddy.' : `Enter the code sent to ${email}.`}</Text>
      {mode === 'register' && <><Text style={s.inputLabel}>YOUR NAME</Text><TextInput autoComplete="name" placeholder="Your name" placeholderTextColor="#A5A6B5" value={name} onChangeText={setName} style={s.input} /></>}
      {mode !== 'verify' && <>
      <Text style={s.inputLabel}>EMAIL ADDRESS</Text><TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#A5A6B5" value={email} onChangeText={setEmail} style={s.input} />
      <Text style={[s.inputLabel, { marginTop: 17 }]}>PASSWORD</Text><TextInput secureTextEntry autoComplete={mode === 'login' ? 'password' : 'new-password'} placeholder={mode === 'login' ? 'Your password' : 'At least 6 characters'} placeholderTextColor="#A5A6B5" value={password} onChangeText={setPassword} onSubmitEditing={submit} style={s.input} />
      </>}
      {mode === 'verify' && <><Text style={s.inputLabel}>6-DIGIT CODE</Text><TextInput keyboardType="number-pad" maxLength={6} placeholder="123456" placeholderTextColor="#A5A6B5" value={otp} onChangeText={setOtp} onSubmitEditing={verify} style={s.input} /></>}
      {!!notice && <Text style={s.authNotice}>{notice}</Text>}{!!error && <Text style={s.authError}>{error}</Text>}
      <TouchableOpacity style={[s.loginButton, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>{busy ? <ActivityIndicator color="white"/> : <><Text style={s.loginButtonText}>{mode === 'login' ? 'Let’s get studying' : mode === 'register' ? 'Create account' : 'Verify email'}</Text><Ionicons name="arrow-forward" size={17} color="white" /></>}</TouchableOpacity>
      {mode === 'login' ? <TouchableOpacity onPress={() => { setMode('register'); setError(''); setNotice(''); }}><Text style={s.formFoot}>New to StudyBuddy? <Text style={s.authLink}>Create an account</Text></Text></TouchableOpacity> : mode === 'register' ? <TouchableOpacity onPress={() => { setMode('login'); setError(''); setNotice(''); }}><Text style={s.formFoot}>Already have an account? <Text style={s.authLink}>Sign in</Text></Text></TouchableOpacity> : <View style={s.verifyLinks}><TouchableOpacity onPress={() => void resendCode()} disabled={busy}><Text style={s.authLink}>Resend code</Text></TouchableOpacity><TouchableOpacity onPress={() => { setMode('login'); setError(''); setNotice(''); }}><Text style={s.formFoot}>Back to sign in</Text></TouchableOpacity></View>}
    </View><Text style={s.loginFooter}>A little progress adds up. 🌱</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function ConfigurationScreen() { return <SafeAreaView style={s.loading}><Text style={s.heading}>Connect StudyBuddy</Text><Text style={[s.cardSub, { textAlign: 'center', marginTop: 10, paddingHorizontal: 32 }]}>Set EXPO_PUBLIC_API_URL to your deployed StudyBuddy web app URL, then restart Expo.</Text></SafeAreaView>; }

const lightAppStyles = StyleSheet.create({
  goalBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 13, backgroundColor: '#F0EEFF', marginTop: -12, marginBottom: 18 }, goalBannerText: { flex: 1, color: '#5143C6', fontWeight: '700', fontSize: 11, lineHeight: 16 },
  safe: { flex: 1, backgroundColor: '#F7F8FC' }, loading: { flex: 1, backgroundColor: '#F7F8FC', alignItems: 'center', justifyContent: 'center' },
  topbar: { height: 62, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ECECF3' }, brandMark: { width: 34, height: 34, backgroundColor: PURPLE, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, brand: { color: INK, fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginLeft: 9, flex: 1 }, notificationButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginRight: 9 }, notificationDot: { position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: 5, backgroundColor: '#E87555' }, avatar: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#E9E6FF', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: PURPLE, fontSize: 15, fontWeight: '800' },
  content: { paddingHorizontal: 22, paddingTop: 25, paddingBottom: 32 }, eyebrow: { fontSize: 10, letterSpacing: 1.35, color: PURPLE, fontWeight: '800', marginBottom: 9 }, heading: { color: INK, fontWeight: '800', fontSize: 29, letterSpacing: -0.9 }, subheading: { color: MUTED, fontSize: 14, marginTop: 5, marginBottom: 22 },
  hero: { minHeight: 222, borderRadius: 25, backgroundColor: '#6556E6', padding: 23, overflow: 'hidden', marginBottom: 26 }, heroDecor: { position: 'absolute', right: 12, top: 22 }, heroEyebrow: { color: '#D9D5FF', fontSize: 9, letterSpacing: 1.35, fontWeight: '800' }, heroTitle: { color: 'white', fontWeight: '800', fontSize: 25, lineHeight: 30, letterSpacing: -0.5, marginTop: 14 }, heroCaption: { color: '#E1DEFF', fontSize: 12, marginTop: 7 }, heroButton: { backgroundColor: 'white', borderRadius: 12, alignSelf: 'flex-start', paddingHorizontal: 14, height: 39, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 17 }, heroButtonText: { color: PURPLE, fontWeight: '700', fontSize: 12 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 2 }, sectionTitle: { color: INK, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 }, sectionHint: { color: MUTED, fontSize: 11 }, statsRow: { flexDirection: 'row', gap: 10, marginBottom: 25 }, statCard: { flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: '#EEEEF4', borderRadius: 17, padding: 12 }, statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }, statValue: { color: INK, fontSize: 20, fontWeight: '800' }, statLabel: { color: MUTED, fontSize: 10, marginTop: 2 }, seeAll: { color: PURPLE, fontSize: 12, fontWeight: '700' },
  setCard: { backgroundColor: 'white', borderWidth: 1, borderColor: '#EEEEF4', borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, setIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, setInfo: { flex: 1 }, cardTitle: { color: INK, fontSize: 14, fontWeight: '700' }, cardSub: { color: MUTED, fontSize: 11, marginTop: 5, lineHeight: 17 }, emptyCard: { backgroundColor: 'white', borderWidth: 1, borderColor: '#EEEEF4', borderRadius: 20, padding: 20, alignItems: 'flex-start' }, emptyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F0EEFF', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  tabbar: { height: 68, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#ECECF3', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }, tab: { flex: 1, alignItems: 'center', gap: 4 }, tabLabel: { color: MUTED, fontSize: 10, fontWeight: '600' }, profileStats: { flexDirection: 'row', gap: 9, marginTop: 15, alignItems: 'center' }, profileValue: { color: PURPLE, fontSize: 12, fontWeight: '700' }, profileDivider: { color: '#C5C5D0' }, signOut: { flexDirection: 'row', gap: 9, alignItems: 'center', padding: 16, marginTop: 16, backgroundColor: 'white', borderColor: '#EEEEF4', borderWidth: 1, borderRadius: 15 }, signOutText: { color: '#D15F66', fontWeight: '700', fontSize: 13 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 21 }, backText: { color: PURPLE, fontWeight: '700', fontSize: 12 }, reviewProgress: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 21, marginBottom: 16 }, reviewTrack: { height: 6, flex: 1, backgroundColor: '#E8E6F5', borderRadius: 4, overflow: 'hidden' }, reviewFill: { height: '100%', backgroundColor: PURPLE, borderRadius: 4 }, reviewCount: { color: MUTED, fontWeight: '700', fontSize: 11 }, reviewCard: { minHeight: 290, backgroundColor: 'white', borderRadius: 23, borderColor: '#ECECF3', borderWidth: 1, padding: 23, justifyContent: 'center' }, reviewLabel: { color: PURPLE, fontSize: 9, fontWeight: '800', letterSpacing: 1.3, marginBottom: 17 }, reviewQuestion: { color: INK, fontSize: 21, fontWeight: '700', lineHeight: 29 }, optionText: { color: '#55576B', fontSize: 14, lineHeight: 22, marginTop: 9 }, tapHint: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 27 }, tapHintText: { color: PURPLE, fontSize: 11, fontWeight: '600' }, revealButton: { height: 50, backgroundColor: PURPLE, borderRadius: 14, marginTop: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 }, revealText: { color: 'white', fontWeight: '700', fontSize: 13 }, reviewActions: { flexDirection: 'row', gap: 10, marginTop: 14 }, practiceButton: { flex: 1, height: 50, borderRadius: 14, borderColor: '#F0D8D3', borderWidth: 1, backgroundColor: '#FFF8F6', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }, practiceText: { color: '#C65F50', fontWeight: '700', fontSize: 11 }, knewButton: { flex: 1, height: 50, borderRadius: 14, backgroundColor: PURPLE, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }, knewText: { color: 'white', fontWeight: '700', fontSize: 12 },
  loginSafe: { flex: 1, backgroundColor: '#F7F8FC' }, loginContent: { flexGrow: 1, paddingHorizontal: 25, paddingTop: 42, paddingBottom: 24 }, loginLogo: { width: 51, height: 51, backgroundColor: PURPLE, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 28 }, loginEyebrow: { color: PURPLE, fontSize: 9, letterSpacing: 1.6, fontWeight: '800', marginBottom: 11 }, loginTitle: { color: INK, fontSize: 38, lineHeight: 42, fontWeight: '800', letterSpacing: -1.5 }, loginSubtitle: { color: MUTED, fontSize: 14, marginTop: 10, marginBottom: 27 }, formCard: { backgroundColor: 'white', padding: 21, borderRadius: 23, borderWidth: 1, borderColor: '#EEEEF4' }, formTitle: { color: INK, fontSize: 19, fontWeight: '800' }, formHint: { color: MUTED, fontSize: 12, marginTop: 5, marginBottom: 23 }, inputLabel: { color: '#77798E', fontSize: 9, letterSpacing: 1.1, fontWeight: '800', marginBottom: 8 }, input: { height: 48, borderRadius: 12, borderColor: '#E7E7EF', borderWidth: 1, paddingHorizontal: 13, color: INK, fontSize: 13, backgroundColor: '#FCFCFE' }, loginButton: { height: 49, backgroundColor: PURPLE, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 23 }, loginButtonText: { color: 'white', fontWeight: '700', fontSize: 13 }, formFoot: { color: MUTED, fontSize: 10, textAlign: 'center', lineHeight: 16, marginTop: 17 }, loginFooter: { textAlign: 'center', color: '#A3A4B3', fontSize: 11, marginTop: 25 }, authNotice: { color: '#238268', fontSize: 11, lineHeight: 16, marginTop: 12 }, authError: { color: '#B64752', fontSize: 11, lineHeight: 16, marginTop: 12 }, authLink: { color: PURPLE, fontWeight: '800' }, verifyLinks: { alignItems: 'center', gap: 1 },
  createSetButton: { height: 44, backgroundColor: '#F0EEFF', borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 13 }, createSetText: { color: PURPLE, fontSize: 12, fontWeight: '700' },
  timetableShortcut: { minHeight: 48, marginTop: 12, marginBottom: 18, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: '#E5E2F3', backgroundColor: '#FBFAFF', flexDirection: 'row', alignItems: 'center', gap: 8 }, timetableShortcutText: { color: INK, fontSize: 11, fontWeight: '700', flex: 1 },
});

function darkenAppStyle(style: any) {
  if (!style || typeof style !== 'object') return style;
  const backgrounds: Record<string, string> = { '#F7F8FC': '#11111A', white: '#1D1D2A', '#F0EEFF': '#302C50', '#FFF8F6': '#3A2B2B' };
  const colors: Record<string, string> = { [INK]: '#F4F2FC', [MUTED]: '#AAA8BB', '#5143C6': '#C0B9FF', '#55576B': '#D3D1E0' };
  const borders: Record<string, string> = { '#ECECF3': '#373747', '#EEEEF4': '#373747' };
  return Object.fromEntries(Object.entries(style).map(([key, value]) => [key, typeof value === 'string' ? (key === 'backgroundColor' ? backgrounds[value] || value : key === 'color' ? colors[value] || value : key.toLowerCase().includes('bordercolor') ? borders[value] || value : value) : value]));
}
const darkAppStyles = Object.fromEntries(Object.entries(lightAppStyles).map(([key, value]) => [key, darkenAppStyle(value)])) as typeof lightAppStyles;
let s = lightAppStyles;
function setAppDarkMode(enabled: boolean) { s = enabled ? darkAppStyles : lightAppStyles; }
